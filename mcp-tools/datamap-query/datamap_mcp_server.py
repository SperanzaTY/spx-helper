#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DataMap MCP Server
DataSuite DataMap 表元数据查询工具，支持表信息、字段详情、血缘、搜索等。
认证方式：自动从 Chrome 读取 datasuite.shopee.io 的 Cookie。
"""

import json
import logging
import os
import time
import base64
from typing import Dict, Any, Optional, List

import requests
from chrome_auth import get_auth, AuthResult
from chrome_auth.diagnostic import format_auth_troubleshoot
from mcp.server.fastmcp import FastMCP

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ──────────────────────────── Cookie 管理 ────────────────────────────

DOMAIN = "datasuite.shopee.io"

_last_auth: Optional[AuthResult] = None


def _load_cookies(force: bool = False, auth_failed: bool = False) -> Dict[str, str]:
    global _last_auth
    result = get_auth(DOMAIN, force=force, auth_failed=auth_failed)
    _last_auth = result
    if result.ok:
        logger.info(f"[Auth] DataSuite cookies via {result.source} ({len(result.cookies)} cookies)")
    return result.cookies


def _diag(cookies: Dict[str, str]) -> str:
    r = _last_auth
    return format_auth_troubleshoot(
        DOMAIN,
        cookies,
        cookie_source=(r.source if r else ""),
        expires_at=(r.expires_at if r else None),
        sso_refresh_attempted=(r.sso_refresh_attempted if r else False),
        sso_refresh_succeeded=(r.sso_refresh_succeeded if r else False),
        sso_refresh_urls_tried=(r.sso_refresh_urls_tried if r else ()),
    )


# ──────────────────────────── HTTP 客户端 ────────────────────────────

BASE_URL = f"https://{DOMAIN}"
API_PREFIX = "/datamap/api/v3"
SEARCHCENTER_PREFIX = "/datamap/searchcenter/api/v1"

HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "zh,en-US;q=0.9,en;q=0.8",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/137.0.0.0 Safari/537.36"
    ),
}

MAX_RETRIES = 2

_qn_cache: Dict[str, str] = {}


def _search_resolve_qn(orig_qn: str) -> Optional[str]:
    """Search DataMap to find the correct qualifiedName (handles IDC region mismatch).

    Some tables live in non-default IDC regions (e.g. prod#USEast for BR),
    so the default hive@prod@db@table won't match. This searches by table name
    and returns the actual qualifiedName.
    """
    parts = orig_qn.split("@")
    if len(parts) < 3:
        return None
    table_name = parts[-1]
    database = parts[-2]
    cache_key = f"{database}.{table_name}"
    if cache_key in _qn_cache:
        return _qn_cache[cache_key]

    try:
        cookies = _load_cookies()
        hdrs = HEADERS.copy()
        hdrs["referer"] = f"{BASE_URL}/datamap"
        if "CSRF-TOKEN" in cookies:
            hdrs["x-csrf-token"] = cookies["CSRF-TOKEN"]
        resp = requests.get(
            f"{BASE_URL}{API_PREFIX}/dataWarehouse/previewSearch",
            params={"keyword": table_name},
            cookies=cookies, headers=hdrs, timeout=15,
        )
        if resp.status_code != 200:
            return None
        body = resp.json()
        if not body.get("success"):
            return None
        data = body.get("data", {})
        results = data.get("matchTableResultList", []) if isinstance(data, dict) else []
        for r in results:
            if r.get("schema") == database and r.get("tableName") == table_name:
                qn = r.get("qualifiedName")
                if qn and qn != orig_qn:
                    logger.info(f"[QN] Resolved {database}.{table_name}: {orig_qn} → {qn}")
                    _qn_cache[cache_key] = qn
                    return qn
    except Exception as e:
        logger.debug(f"[QN] Search resolve failed: {e}")
    return None


def _request_raw(method: str, path: str, params: dict = None, json_body: dict = None, *, prefix: str = None) -> Any:
    """Send request and unwrap the DataSuite response envelope {success, code, data}."""
    url = BASE_URL + (prefix or API_PREFIX) + path
    cookies = _load_cookies()
    headers = HEADERS.copy()
    headers["referer"] = f"{BASE_URL}/datamap"
    if "CSRF-TOKEN" in cookies:
        headers["x-csrf-token"] = cookies["CSRF-TOKEN"]

    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = requests.request(
                method, url,
                params=params,
                json=json_body,
                cookies=cookies,
                headers=headers,
                timeout=30,
            )
            if resp.status_code in (401, 403):
                if attempt < MAX_RETRIES:
                    logger.warning(f"{resp.status_code} 重试中，刷新 cookie...")
                    cookies = _load_cookies(force=True, auth_failed=True)
                    if "CSRF-TOKEN" in cookies:
                        headers["x-csrf-token"] = cookies["CSRF-TOKEN"]
                    continue
                raise RuntimeError(
                    f"请求 {path} 失败: {resp.status_code}\n"
                    f"认证与 Cookie 诊断:\n{_diag(cookies)}\n"
                    f"这通常是 Chrome 登录态问题，不是代码 bug。请在 Chrome 中打开 {BASE_URL} 确认已登录。"
                )
            resp.raise_for_status()
            body = resp.json()
            if isinstance(body, dict) and "success" in body:
                if not body.get("success"):
                    raise RuntimeError(f"API error {body.get('code')}: {body.get('msg', 'unknown')}")
                return body.get("data")
            return body
        except requests.RequestException as e:
            if attempt < MAX_RETRIES:
                time.sleep(1)
                continue
            raise RuntimeError(f"请求 {path} 失败: {e}") from e
    return {}


def _request(method: str, path: str, params: dict = None, json_body: dict = None, *, prefix: str = None) -> Any:
    """Wrapper around _request_raw with automatic qualifiedName IDC resolution."""
    try:
        return _request_raw(method, path, params, json_body, prefix=prefix)
    except RuntimeError as e:
        if "not found" in str(e).lower() and params and "qualifiedName" in params:
            resolved = _search_resolve_qn(params["qualifiedName"])
            if resolved:
                params = {**params, "qualifiedName": resolved}
                return _request_raw(method, path, params, json_body, prefix=prefix)
        raise


# ──────────────────────────── Open API (写入操作) ────────────────────────────

OPEN_API_BASE = "https://open-api.datasuite.shopee.io"


def _load_open_api_token() -> str:
    token = os.environ.get("DATAMAP_OPEN_API_TOKEN", "")
    if not token:
        raise RuntimeError(
            "未配置 DATAMAP_OPEN_API_TOKEN 环境变量，无法执行写入操作。\n"
            "Token 获取方式：联系 yixin.yang@shopee.com 申请 DataMap Open API 凭证。\n"
            "配置方式：在 ~/.cursor/mcp.json 的 datamap-query 中添加:\n"
            "  \"env\": {\"DATAMAP_OPEN_API_TOKEN\": \"Basic xxx\"}\n"
            "不配置 Token 不影响所有查询工具的正常使用。"
        )
    if not token.startswith("Basic "):
        token = f"Basic {token}"
    return token


def _open_api_post(path: str, payload: dict) -> dict:
    """Send POST to DataMap Open API with Basic Auth."""
    token = _load_open_api_token()
    url = OPEN_API_BASE + API_PREFIX + path
    resp = requests.post(
        url,
        headers={"Content-Type": "application/json", "Authorization": token},
        json=payload,
        timeout=30,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Open API 请求失败: {resp.status_code} {resp.text[:300]}")
    body = resp.json()
    if isinstance(body, dict) and "success" in body and not body["success"]:
        raise RuntimeError(f"Open API 业务错误: {body.get('msg', body.get('message', json.dumps(body)))}")
    return body


# ──────────────────────────── Helpers ────────────────────────────

def _qualified_name(database: str, table: str, engine: str = "hive", env: str = "prod", idc: str = "") -> str:
    """Build DataMap qualifiedName: engine@env[#idc]@database@table."""
    env_part = f"{env}#{idc}" if idc else env
    return f"{engine}@{env_part}@{database}@{table}"


def _encode_qualified_name(database: str, table: str, engine: str = "hive", env: str = "prod", idc: str = "") -> str:
    """Base64-encode a qualifiedName (used for DataMap page URLs, not API calls)."""
    return base64.b64encode(_qualified_name(database, table, engine, env, idc).encode()).decode()


def _parse_table_ref(table_ref: str) -> tuple:
    """Parse 'database.table' or just 'table' (default database=spx_mart)."""
    if "." in table_ref:
        parts = table_ref.split(".", 1)
        return parts[0], parts[1]
    return "spx_mart", table_ref


def _resolve_table_qn(database: str, table: str, engine: str = "hive", idc: str = "") -> str:
    """Resolve the actual qualifiedName, including IDC fallback via previewSearch."""
    qn = _qualified_name(database, table, engine=engine.lower(), idc=idc)
    resolved = _search_resolve_qn(qn)
    return resolved or qn


def _resolve_column_qn(database: str, table: str, column_name: str, engine: str = "HIVE", idc: str = "") -> str:
    """Resolve a column qualifiedName via columnDetail when possible."""
    table_qn = _resolve_table_qn(database, table, engine=engine.lower(), idc=idc)
    try:
        data = _request(
            "GET",
            f"/dataWarehouse/{engine}/columnDetail",
            params={"qualifiedName": table_qn, "columnName": column_name},
        )
        if isinstance(data, dict) and data.get("qualifiedName"):
            return data["qualifiedName"]
    except Exception:
        pass
    return f"{table_qn}@{column_name}"


def _table_type_name(engine: str) -> str:
    return {
        "HIVE": "HIVE_TABLE",
        "CLICKHOUSE": "CLICKHOUSE_TABLE",
        "STARROCKS": "STARROCKS_TABLE",
    }.get(engine.upper(), f"{engine.upper()}_TABLE")


def _column_type_name(engine: str) -> str:
    return {
        "HIVE": "HIVE_COLUMN",
        "CLICKHOUSE": "CLICKHOUSE_COLUMN",
        "STARROCKS": "STARROCKS_COLUMN",
    }.get(engine.upper(), f"{engine.upper()}_COLUMN")


def _flatten_lineage_edges(raw: Any) -> List[dict]:
    flat: List[dict] = []
    if not isinstance(raw, list):
        return flat
    for item in raw:
        if isinstance(item, list):
            flat.extend(edge for edge in item if isinstance(edge, dict))
        elif isinstance(item, dict):
            flat.append(item)
    return flat


def _entity_brief(entity: dict) -> dict:
    return {
        "qualifiedName": entity.get("qualifiedName", ""),
        "displayName": entity.get("displayName", ""),
        "entityName": entity.get("entityName", ""),
        "schema": entity.get("schema", ""),
        "serviceType": entity.get("serviceType", ""),
        "typeName": entity.get("typeName", ""),
        "status": entity.get("status", ""),
        "idcRegion": entity.get("idcRegion", ""),
        "exists": entity.get("exists"),
        "visibility": entity.get("visibility"),
        "access": entity.get("access"),
        "inChargeOfTable": entity.get("inChargeOfTable"),
        "active32d": entity.get("active32d"),
        "taskExecutionCount": entity.get("taskExecutionCount"),
        "lastedTaskUpdateTime": entity.get("lastedTaskUpdateTime"),
    }


def _format_lineage_edge(edge: dict, entity_map: Dict[str, dict]) -> dict:
    src = edge.get("src", "")
    dst = edge.get("dst", "")
    task = edge.get("task", {}) if isinstance(edge.get("task"), dict) else {}
    src_name = entity_map.get(src, {}).get("displayName", src.split("@")[-1] if "@" in src else src)
    dst_name = entity_map.get(dst, {}).get("displayName", dst.split("@")[-1] if "@" in dst else dst)
    return {
        "source": src,
        "sourceDisplayName": src_name,
        "target": dst,
        "targetDisplayName": dst_name,
        "sourceServiceType": entity_map.get(src, {}).get("serviceType", ""),
        "targetServiceType": entity_map.get(dst, {}).get("serviceType", ""),
        "sourceTypeName": entity_map.get(src, {}).get("typeName", ""),
        "targetTypeName": entity_map.get(dst, {}).get("typeName", ""),
        "active32d": edge.get("active32d"),
        "task": {
            "taskQualifiedName": task.get("taskQualifiedName", ""),
            "taskCode": task.get("taskCode", ""),
            "env": task.get("env", ""),
            "project": task.get("project", ""),
            "sourceSystem": task.get("sourceSystem", ""),
            "adhoc": task.get("adhoc"),
            "active32d": task.get("active32d"),
            "detailUrl": f"https://datasuite.shopee.io{task['urlPath']}" if task.get("urlPath") else "",
            "codeUrl": f"https://datasuite.shopee.io{task['codePath']}" if task.get("codePath") else "",
            "systemPath": task.get("systemPath", ""),
        },
    }


# ──────────────────────────── MCP Tools ────────────────────────────

mcp = FastMCP("DataMap MCP Server")


@mcp.tool()
def get_table_info(table_ref: str, engine: str = "HIVE", idc_region: str = "") -> str:
    """
    获取 DataMap 中表的基本信息（描述、Owner、分区、存储格式等）。

    参数:
        table_ref: 表名，格式为 "database.table" 或 "table"（默认 database=spx_mart）
                   例如: "spx_mart.dwd_spx_spsso_delivery_trajectory_di_br"
        engine: 引擎类型，默认 "HIVE"，也支持 "CLICKHOUSE"、"STARROCKS"
        idc_region: IDC 区域，默认空=SG。传 "USEast" 查询 BR 表在 USEast 的版本

    示例:
        get_table_info("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br")
        get_table_info("dwd_spx_fleet_order_tracking_ri_br", idc_region="USEast")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table, idc=idc_region)
        data = _request("GET", f"/dataWarehouse/{engine}/info", params={"qualifiedName": qn})
        actual_qn = _qn_cache.get(f"{database}.{table}", qn)
        qn_b64 = base64.b64encode(actual_qn.encode()).decode()

        info = data if isinstance(data, dict) else {}

        result = {
            "table": f"{database}.{table}",
            "engine": engine,
            "qualifiedName": actual_qn,
            "datamap_url": f"https://datasuite.shopee.io/datamap/data-warehouse/{engine}/{qn_b64}/Table_Info",
            "description": info.get("description", ""),
            "displayName": info.get("displayName", ""),
            "schema": info.get("schema", ""),
            "tableStatus": info.get("tableStatus", ""),
            "tableType": info.get("tableType", ""),
            "dataWarehouseLayer": info.get("dataWarehouseLayer", ""),
            "region": info.get("region", ""),
            "tableSize": info.get("tableSize", ""),
            "hdfsPath": info.get("hdfsPath", ""),
            "inputFormat": info.get("inputFormat", ""),
            "outputFormat": info.get("outputFormat", ""),
            "createTime": info.get("createTime", ""),
            "createBy": info.get("createBy", ""),
            "lastUpdateTime": info.get("lastUpdateTime", ""),
            "lastEditTime": info.get("lastEditTime", ""),
            "lastEditBy": info.get("lastEditBy", ""),
            "technicalPIC": info.get("technicalPIC", []),
            "businessPIC": info.get("businessPIC", []),
            "taskOwner": info.get("taskOwner", ""),
            "businessDomainCode": info.get("businessDomainCode", ""),
            "dataMartCodes": info.get("dataMartCodes", []),
            "dataMartInfo": info.get("dataMartInfo", {}),
            "sensitivityLevelV2": info.get("sensitivityLevelV2", ""),
            "policyType": info.get("policyType", ""),
            "updateFrequency": info.get("updateFrequency", {}),
            "slaInfo": info.get("slaInfo", {}),
            "last7daysQueryCount": info.get("last7daysQueryCount", ""),
            "retention": info.get("retention", ""),
        }

        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_table_detail(table_ref: str, engine: str = "HIVE", idc_region: str = "") -> str:
    """
    获取 DataMap 中表的扩展详情（含完整字段列表、分区信息等）。

    比 get_table_info 返回更多细节，适合需要完整字段元数据时使用。

    参数:
        table_ref: 表名，格式为 "database.table" 或 "table"
        engine: 引擎类型，默认 "HIVE"
        idc_region: IDC 区域，默认空=SG。传 "USEast" 查询 USEast 版本

    示例:
        get_table_detail("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table, idc=idc_region)
        data = _request("GET", f"/dataWarehouse/{engine}/expandDetail", params={"qualifiedName": qn})

        result = {
            "table": f"{database}.{table}",
            "engine": engine,
            "data": data,
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_column_detail(table_ref: str, column_name: str, engine: str = "HIVE", idc_region: str = "") -> str:
    """
    获取表中某一列的详细信息（类型、描述、标签、敏感度等级等）。

    参数:
        table_ref: 表名
        column_name: 列名
        engine: 引擎类型，默认 "HIVE"
        idc_region: IDC 区域，默认空=SG。传 "USEast" 查询 USEast 版本

    示例:
        get_column_detail("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br", "order_id")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table, idc=idc_region)
        data = _request("GET", f"/dataWarehouse/{engine}/columnDetail", params={
            "qualifiedName": qn,
            "columnName": column_name,
        })
        result = {
            "table": f"{database}.{table}",
            "column": column_name,
            "data": data,
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_partition_columns(table_ref: str, engine: str = "HIVE", idc_region: str = "") -> str:
    """
    获取表的分区字段列表。

    参数:
        table_ref: 表名
        engine: 引擎类型，默认 "HIVE"
        idc_region: IDC 区域，默认空=SG。传 "USEast" 查询 USEast 版本

    示例:
        get_partition_columns("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table, idc=idc_region)
        data = _request("GET", f"/dataWarehouse/{engine}/partitionColumns", params={"qualifiedName": qn})
        result = {
            "table": f"{database}.{table}",
            "partition_columns": data if isinstance(data, list) else [],
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_table_usage(table_ref: str, engine: str = "HIVE", idc_region: str = "") -> str:
    """
    获取表的使用统计（查询频次、热度评分等）。

    参数:
        table_ref: 表名
        engine: 引擎类型，默认 "HIVE"
        idc_region: IDC 区域，默认空=SG。传 "USEast" 查询 USEast 版本

    示例:
        get_table_usage("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table, idc=idc_region)
        data = _request("GET", f"/dataWarehouse/{engine}/usage", params={"qualifiedName": qn})
        result = {
            "table": f"{database}.{table}",
            "usage": data,
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_table_lineage(table_ref: str, engine: str = "HIVE", idc_region: str = "") -> str:
    """
    获取表的数据血缘关系（上下游表和任务依赖）。

    参数:
        table_ref: 表名
        engine: 引擎类型，默认 "HIVE"
        idc_region: IDC 区域，默认空=SG。传 "USEast" 查询 USEast 版本

    示例:
        get_table_lineage("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _resolve_table_qn(database, table, engine=engine, idc=idc_region)
        data = _request("GET", "/lineage/v2", params={"qualifiedName": qn})

        if isinstance(data, dict):
            entities = data.get("entities", [])
            raw_upstream = data.get("upstream", [])
            raw_downstream = data.get("downstream", [])

            entity_map = {}
            current = None
            for e in entities:
                eqn = e.get("qualifiedName", "")
                entry = _entity_brief(e)
                entity_map[eqn] = entry
                if eqn == qn:
                    current = entry

            upstream_flat = _flatten_lineage_edges(raw_upstream)
            downstream_flat = _flatten_lineage_edges(raw_downstream)

            upstream_src_qns = {e.get("src", "") for e in upstream_flat}
            downstream_dst_qns = {e.get("dst", "") for e in downstream_flat}

            result = {
                "table": f"{database}.{table}",
                "qualifiedName": qn,
                "current": current,
                "upstream_count": len(upstream_flat),
                "upstream_edges": [_format_lineage_edge(edge, entity_map) for edge in upstream_flat],
                "upstream_tables": [entity_map[q] for q in upstream_src_qns if q in entity_map],
                "downstream_count": len(downstream_flat),
                "downstream_edges": [_format_lineage_edge(edge, entity_map) for edge in downstream_flat],
                "downstream_tables": [entity_map[q] for q in downstream_dst_qns if q in entity_map],
                "total_entities": len(entities),
            }
        else:
            result = {"table": f"{database}.{table}", "data": data}

        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_lineage_tasks(
    table_ref: str,
    direction: str = "downstream",
    engine: str = "HIVE",
    idc_region: str = "",
    page_size: int = 100,
    active_only: bool = False,
) -> str:
    """
    获取表的上下游任务列表，适合排查“谁在产出这个表 / 谁在消费这个表 / 最近是否活跃”。

    参数:
        table_ref: 表名
        direction: "upstream" 或 "downstream"，默认 downstream
        engine: 引擎类型，默认 "HIVE"
        idc_region: IDC 区域，默认空=SG
        page_size: 返回的任务数量上限，默认 100
        active_only: 仅保留 32 天内活跃任务
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _resolve_table_qn(database, table, engine=engine, idc=idc_region)
        is_downstream = direction.lower() != "upstream"
        data = _request_raw(
            "POST",
            "/lineageV2/taskInfo",
            json_body={"qualifiedName": qn, "downstream": is_downstream},
        )
        entities = data.get("entities", []) if isinstance(data, dict) else []
        tasks = []
        for item in entities:
            if active_only and not item.get("isActive32d"):
                continue
            tasks.append({
                "taskCode": item.get("taskCode", ""),
                "taskQualifiedName": item.get("taskQualifiedName", ""),
                "owner": item.get("owner", ""),
                "team": item.get("team", ""),
                "project": item.get("project", ""),
                "env": item.get("env", ""),
                "taskType": item.get("taskType", ""),
                "status": item.get("status", ""),
                "filterTaskStatus": item.get("filterTaskStatus", ""),
                "sourceSystem": item.get("sourceSystem", ""),
                "isActive32d": item.get("isActive32d"),
                "isFrozen": item.get("isFrozen"),
                "taskPriority": item.get("taskPriority"),
                "slaPriority": item.get("slaPriority"),
                "detailUrl": f"https://datasuite.shopee.io{item['urlPath']}" if item.get("urlPath") else "",
                "codeUrl": f"https://datasuite.shopee.io{item['codePath']}" if item.get("codePath") else "",
            })
        result = {
            "table": f"{database}.{table}",
            "qualifiedName": qn,
            "direction": "downstream" if is_downstream else "upstream",
            "total": data.get("total", len(tasks)) if isinstance(data, dict) else len(tasks),
            "returned": min(len(tasks), page_size),
            "tasks": tasks[:page_size],
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_column_node_info(
    table_ref: str,
    column_name: str,
    engine: str = "HIVE",
    idc_region: str = "",
) -> str:
    """
    获取字段级节点信息（描述、类型、计算逻辑、L30D 查询次数、技术 PIC）。
    """
    try:
        database, table = _parse_table_ref(table_ref)
        table_qn = _resolve_table_qn(database, table, engine=engine, idc=idc_region)
        column_qn = _resolve_column_qn(database, table, column_name, engine=engine, idc=idc_region)
        data = _request_raw(
            "GET",
            "/lineage/getColumnNodeInfo",
            params={
                "qualifiedName": column_qn,
                "typeName": _column_type_name(engine),
                "serviceType": engine.upper(),
            },
        )
        result = {
            "table": f"{database}.{table}",
            "column": column_name,
            "tableQualifiedName": table_qn,
            "columnQualifiedName": column_qn,
            "data": data,
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_column_lineage(
    table_ref: str,
    column_name: str,
    engine: str = "HIVE",
    idc_region: str = "",
    upstream_level: int = 1,
    downstream_level: int = 1,
) -> str:
    """
    获取字段级血缘图原始结果。若该字段暂无字段级边，stream/columnMap 可能为空。
    """
    try:
        database, table = _parse_table_ref(table_ref)
        table_qn = _resolve_table_qn(database, table, engine=engine, idc=idc_region)
        column_qn = _resolve_column_qn(database, table, column_name, engine=engine, idc=idc_region)
        base_body = {
            "qualifiedName": column_qn,
            "serviceType": engine.upper(),
            "assetFilter": {},
            "taskFilter": {},
            "queryCount": False,
        }
        upstream = _request_raw(
            "POST",
            "/lineageV2/filter/column",
            json_body={**base_body, "downstream": False, "level": upstream_level},
        )
        downstream = _request_raw(
            "POST",
            "/lineageV2/filter/column",
            json_body={**base_body, "downstream": True, "level": downstream_level},
        )
        result = {
            "table": f"{database}.{table}",
            "column": column_name,
            "tableQualifiedName": table_qn,
            "columnQualifiedName": column_qn,
            "request": {
                "serviceType": engine.upper(),
                "assetFilter": {},
                "taskFilter": {},
                "queryCount": False,
                "upstream_level": upstream_level,
                "downstream_level": downstream_level,
            },
            "upstream": upstream,
            "downstream": downstream,
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_downstream_applications(
    table_ref: str,
    app_type: str = "all",
    engine: str = "HIVE",
    idc_region: str = "",
) -> str:
    """
    获取表的 Downstream Application，覆盖 OneBI Dataset、DataGo Data Model、Dashboard、Data Service API。
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _resolve_table_qn(database, table, engine=engine, idc=idc_region)
        app_type_map = {
            "all": ["DataServiceApi", "DashboardDataset", "DataGoDataModel", "Dashboard"],
            "dataservice": ["DataServiceApi"],
            "dataserviceapi": ["DataServiceApi"],
            "dataset": ["DashboardDataset"],
            "dashboarddataset": ["DashboardDataset"],
            "datago": ["DataGoDataModel"],
            "datagodatamodel": ["DataGoDataModel"],
            "dashboard": ["Dashboard"],
        }
        selected = app_type_map.get(app_type.lower(), [app_type])

        grouped: Dict[str, List[dict]] = {}
        for application_type in selected:
            data = _request_raw(
                "GET",
                "/common/downStreamApplication",
                params={
                    "qualifiedName": qn,
                    "applicationType": application_type,
                    "serviceType": engine.upper(),
                },
            )
            items = data if isinstance(data, list) else []
            grouped[application_type] = [
                {
                    "qualifiedName": item.get("qualifiedName", ""),
                    "typeName": item.get("typeName", ""),
                    "id": item.get("id", ""),
                    "name": item.get("name", ""),
                    "projectCode": item.get("projectCode", ""),
                    "owner": item.get("owner", ""),
                    "url": item.get("url", ""),
                }
                for item in items
            ]

        result = {
            "table": f"{database}.{table}",
            "qualifiedName": qn,
            "serviceType": engine.upper(),
            "application_types": selected,
            "counts": {k: len(v) for k, v in grouped.items()},
            "applications": grouped,
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_table_score(table_ref: str, score_type: str = "completeness", engine: str = "HIVE", idc_region: str = "") -> str:
    """
    获取表的质量评分。

    参数:
        table_ref: 表名
        score_type: 评分类型，"completeness"（完整度）或 "popularity"（热度）
        engine: 引擎类型，默认 "HIVE"
        idc_region: IDC 区域，默认空=SG。传 "USEast" 查询 USEast 版本

    示例:
        get_table_score("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br", "completeness")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table, idc=idc_region)
        data = _request("GET", f"/dataWarehouse/{engine}/score/{score_type}", params={"qualifiedName": qn})
        result = {
            "table": f"{database}.{table}",
            "score_type": score_type,
            "data": data,
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_table_sla(table_ref: str, engine: str = "HIVE", idc_region: str = "") -> str:
    """
    获取表关联的 SLA 信息。

    参数:
        table_ref: 表名
        engine: 引擎类型，默认 "HIVE"
        idc_region: IDC 区域，默认空=SG。传 "USEast" 查询 USEast 版本

    示例:
        get_table_sla("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table, idc=idc_region)
        data = _request("GET", f"/dataWarehouse/{engine}/relatedSlas", params={"qualifiedName": qn})
        result = {
            "table": f"{database}.{table}",
            "sla_info": data,
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def list_schemas(engine: str = "HIVE") -> str:
    """
    列出 DataMap 中指定引擎下的所有 schema（数据库）列表。

    参数:
        engine: 引擎类型，默认 "HIVE"

    示例:
        list_schemas("HIVE")
    """
    try:
        data = _request("GET", f"/dataWarehouse/{engine}/schemas")
        return json.dumps({"engine": engine, "schemas": data}, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def list_tables(database: str, engine: str = "HIVE") -> str:
    """
    列出 DataMap 中指定 schema 下的表列表。

    参数:
        database: 数据库/schema 名称，如 "spx_mart"
        engine: 引擎类型，默认 "HIVE"

    示例:
        list_tables("spx_mart")
    """
    try:
        data = _request("GET", f"/dataWarehouse/{engine}/tables", params={
            "schema": database,
            "keyword": "",
        })
        tables = data if isinstance(data, list) else []
        return json.dumps({
            "database": database,
            "engine": engine,
            "table_count": len(tables),
            "tables": tables,
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def search_tables(keyword: str, engine: str = "HIVE") -> str:
    """
    在 DataMap 中搜索表（按表名关键词模糊匹配）。

    参数:
        keyword: 搜索关键词（表名的一部分）
        engine: 引擎类型，默认 "HIVE"，设为空字符串可搜索所有引擎

    示例:
        search_tables("delivery_trajectory")
        search_tables("fleet_order")
    """
    try:
        data = _request("GET", "/dataWarehouse/previewSearch", params={"keyword": keyword})

        if isinstance(data, dict):
            tables = data.get("matchTableResultList", [])
        elif isinstance(data, list):
            tables = data
        else:
            tables = []

        results = []
        for t in tables:
            results.append({
                "tableName": t.get("tableName", ""),
                "schema": t.get("schema", ""),
                "qualifiedName": t.get("qualifiedName", ""),
                "serviceType": t.get("serviceType", ""),
                "idcRegion": t.get("idcRegion", ""),
                "accessible": t.get("accessible", False),
            })

        return json.dumps({
            "keyword": keyword,
            "result_count": len(results),
            "results": results,
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def search_global(keyword: str) -> str:
    """
    DataMap 全局搜索（跨引擎、跨类型搜索表、字段、指标等）。

    参数:
        keyword: 搜索关键词

    示例:
        search_global("delivery_trajectory")
    """
    try:
        data = _request(
            "GET", "/global/preview_search",
            params={"keyword": keyword},
            prefix=SEARCHCENTER_PREFIX,
        )

        results = []
        if isinstance(data, list):
            for item in data:
                results.append({
                    "qualifiedName": item.get("qualifiedName", ""),
                    "serviceType": item.get("serviceType", ""),
                    "displayName": item.get("displayName", ""),
                    "description": item.get("description", ""),
                    "columnNames": item.get("columnNames", []),
                    "extra": item.get("extra", {}),
                })

        return json.dumps({
            "keyword": keyword,
            "result_count": len(results),
            "results": results,
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_table_audit_log(table_ref: str, engine: str = "HIVE", page_size: int = 20, idc_region: str = "") -> str:
    """
    获取表的变更审计日志。

    参数:
        table_ref: 表名
        engine: 引擎类型，默认 "HIVE"
        page_size: 返回条数，默认 20
        idc_region: IDC 区域，默认空=SG。传 "USEast" 查询 USEast 版本

    示例:
        get_table_audit_log("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table, idc=idc_region)
        data = _request("GET", f"/dataWarehouse/{engine}/auditLog", params={
            "qualifiedName": qn,
            "version": 1,
            "pageSize": page_size,
            "pageNum": 1,
        })
        return json.dumps({
            "table": f"{database}.{table}",
            "audit_log": data,
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


# ──────────────────────────── 写入工具 ────────────────────────────


@mcp.tool()
def update_datamap(
    table_ref: str,
    payload: str,
    idc_region: str = "SG",
    dry_run: bool = True,
) -> str:
    """
    更新 DataMap 表/字段元数据（Open API）。统一入口，自动路由到正确的 API 端点。

    payload 中包含 "columns" 字段时 → 调用 /system/hive/updateColumnInfo
    payload 中不含 "columns" 字段时 → 调用 /system/hive/updateTableInfo

    idcRegion / schema / table 由 table_ref 和 idc_region 参数自动填充，无需在 payload 中重复。
    默认 dry_run=True 仅预览，设置 dry_run=False 执行实际更新。

    参数:
        table_ref: 表名，格式 "database.table" 或 "table"（默认 database=spx_mart）
        payload: JSON 字符串，直接映射到 API 请求体。
        idc_region: IDC 区域，默认 "SG"
        dry_run: True=仅预览，False=执行更新

    ── updateTableInfo 支持的字段 ──
        description: string — 表描述
        technicalPIC: ["email1", "email2"] — 技术负责人
        businessPIC: ["email1"] — 业务负责人
        dataWarehouseLayer: string — ODS/DWD/DWS/ADS/DIM
        marketRegion: string — 市场区域
        status: object — 表生命周期状态（嵌套结构）
            status.status: "ACTIVE" | "MIGRATED" | "DEPRECATED" | "OFFLINE"
            status.migrationEntity: {idcRegion, schema, table, migrationDetails, migrationDate(ms)}
            status.deprecatedEntity: {deprecationDetails, deprecationDate(ms)}
        serviceLevelAgreement: {dayOfMonth, dayOfWeek, hour} — SLA
        correspondingMartTables: [{table, schema, idcRegionEnum}] — 关联 Mart 表
        updateToNullFields: ["field1"] — 要清空的字段

    ── updateColumnInfo 支持的字段 ──
        columns: [
            {columnName: string, description: string, calculationLogic: string,
             enumeration: string, bizPrimaryKey: boolean}
        ]

    示例 1 — 标记表为 MIGRATED:
        payload = '{"status": {"status": "MIGRATED", "migrationEntity": {"idcRegion": "SG", "schema": "spx_datamart", "table": "dim_xxx_ri_tw", "migrationDate": 1743465600000}}}'

    示例 2 — 修改表描述:
        payload = '{"description": "新表描述"}'

    示例 3 — 更新字段信息:
        payload = '{"columns": [{"columnName": "order_id", "description": "订单ID", "bizPrimaryKey": true}]}'

    示例 4 — 同时更新多个字段:
        payload = '{"columns": [{"columnName": "col1", "description": "x"}, {"columnName": "col2", "description": "y"}]}'
    """
    try:
        database, table = _parse_table_ref(table_ref)
        idc_for_qn = "" if idc_region == "SG" else idc_region
        qn = _qualified_name(database, table, idc=idc_for_qn)

        try:
            body = json.loads(payload)
        except json.JSONDecodeError as e:
            return json.dumps({"error": f"payload JSON 解析失败: {e}"}, ensure_ascii=False)

        if not isinstance(body, dict) or not body:
            return json.dumps({"error": "payload 必须是非空 JSON 对象"}, ensure_ascii=False)

        is_column_update = "columns" in body
        api_path = "/system/hive/updateColumnInfo" if is_column_update else "/system/hive/updateTableInfo"

        request_body = {"idcRegion": idc_region, "schema": database, "table": table}
        request_body.update(body)

        if dry_run:
            current = {}
            try:
                if is_column_update:
                    for c in body["columns"]:
                        cn = c.get("columnName", "")
                        if cn:
                            data = _request("GET", "/dataWarehouse/HIVE/columnDetail",
                                            params={"qualifiedName": qn, "columnName": cn})
                            if isinstance(data, dict):
                                current[cn] = {k: data.get(k, "") for k in c if k != "columnName"}
                else:
                    data = _request("GET", "/dataWarehouse/HIVE/info", params={"qualifiedName": qn})
                    if isinstance(data, dict):
                        for key in body:
                            current[key] = data.get(key if key != "status" else "tableStatus", "")
            except Exception as e:
                current["_fetch_error"] = str(e)

            return json.dumps({
                "mode": "DRY_RUN",
                "table": f"{database}.{table}",
                "api": api_path,
                "request_body": request_body,
                "current_values": current,
                "note": "确认无误后设置 dry_run=False 执行实际更新",
            }, ensure_ascii=False, indent=2)

        resp_data = _open_api_post(api_path, request_body)
        return json.dumps({
            "mode": "EXECUTED",
            "table": f"{database}.{table}",
            "api": api_path,
            "changes": body,
            "api_response": resp_data,
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()

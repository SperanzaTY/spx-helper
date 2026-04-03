#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DataMap MCP Server
DataSuite DataMap 表元数据查询工具，支持表信息、字段详情、血缘、搜索等。
认证方式：自动从 Chrome 读取 datasuite.shopee.io 的 Cookie。
"""

import json
import logging
import time
import base64
from typing import Dict, Any, Optional, List

import requests
from chrome_auth import get_cookies
from mcp.server.fastmcp import FastMCP

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ──────────────────────────── Cookie 管理 ────────────────────────────

DOMAIN = "datasuite.shopee.io"


def _load_cookies(force: bool = False) -> Dict[str, str]:
    return get_cookies(domain=DOMAIN, force=force)


def _cookie_diagnostic(cookies: Dict[str, str]) -> str:
    total = len(cookies)
    if total == 0:
        return "未读取到任何 Cookie（browser_cookie3 可能无法访问 Chrome Cookie 数据库）"
    missing = [k for k in ("CSRF-TOKEN", "JSESSIONID", "DATA-SUITE-AUTH-userToken-v4") if k not in cookies]
    if missing:
        return f"读到 {total} 个 Cookie，但缺少关键认证 Cookie: {', '.join(missing)}"
    return f"Cookie 完整（{total} 个），可能是 Cookie 已过期"


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


def _request(method: str, path: str, params: dict = None, json_body: dict = None, *, prefix: str = None) -> Any:
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
                    cookies = _load_cookies(force=True)
                    if "CSRF-TOKEN" in cookies:
                        headers["x-csrf-token"] = cookies["CSRF-TOKEN"]
                    continue
                diag = _cookie_diagnostic(cookies)
                raise RuntimeError(
                    f"请求 {path} 失败: {resp.status_code}\n"
                    f"Cookie 诊断: {diag}\n"
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


# ──────────────────────────── Helpers ────────────────────────────

def _qualified_name(database: str, table: str, engine: str = "hive", env: str = "prod") -> str:
    """Build DataMap qualifiedName: engine@env@database@table (raw format for API calls)."""
    return f"{engine}@{env}@{database}@{table}"


def _encode_qualified_name(database: str, table: str, engine: str = "hive", env: str = "prod") -> str:
    """Base64-encode a qualifiedName (used for DataMap page URLs, not API calls)."""
    return base64.b64encode(_qualified_name(database, table, engine, env).encode()).decode()


def _parse_table_ref(table_ref: str) -> tuple:
    """Parse 'database.table' or just 'table' (default database=spx_mart)."""
    if "." in table_ref:
        parts = table_ref.split(".", 1)
        return parts[0], parts[1]
    return "spx_mart", table_ref


# ──────────────────────────── MCP Tools ────────────────────────────

mcp = FastMCP("DataMap MCP Server")


@mcp.tool()
def get_table_info(table_ref: str, engine: str = "HIVE") -> str:
    """
    获取 DataMap 中表的基本信息（描述、Owner、分区、存储格式等）。

    参数:
        table_ref: 表名，格式为 "database.table" 或 "table"（默认 database=spx_mart）
                   例如: "spx_mart.dwd_spx_spsso_delivery_trajectory_di_br"
        engine: 引擎类型，默认 "HIVE"，也支持 "CLICKHOUSE"、"STARROCKS"

    示例:
        get_table_info("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br")
        get_table_info("dwd_spx_fleet_order_di_br")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table)
        qn_b64 = _encode_qualified_name(database, table)
        data = _request("GET", f"/dataWarehouse/{engine}/info", params={"qualifiedName": qn})

        info = data if isinstance(data, dict) else {}

        result = {
            "table": f"{database}.{table}",
            "engine": engine,
            "qualifiedName": qn,
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
def get_table_detail(table_ref: str, engine: str = "HIVE") -> str:
    """
    获取 DataMap 中表的扩展详情（含完整字段列表、分区信息等）。

    比 get_table_info 返回更多细节，适合需要完整字段元数据时使用。

    参数:
        table_ref: 表名，格式为 "database.table" 或 "table"
        engine: 引擎类型，默认 "HIVE"

    示例:
        get_table_detail("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table)
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
def get_column_detail(table_ref: str, column_name: str, engine: str = "HIVE") -> str:
    """
    获取表中某一列的详细信息（类型、描述、标签、敏感度等级等）。

    参数:
        table_ref: 表名
        column_name: 列名
        engine: 引擎类型，默认 "HIVE"

    示例:
        get_column_detail("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br", "order_id")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table)
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
def get_partition_columns(table_ref: str, engine: str = "HIVE") -> str:
    """
    获取表的分区字段列表。

    参数:
        table_ref: 表名
        engine: 引擎类型，默认 "HIVE"

    示例:
        get_partition_columns("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table)
        data = _request("GET", f"/dataWarehouse/{engine}/partitionColumns", params={"qualifiedName": qn})
        result = {
            "table": f"{database}.{table}",
            "partition_columns": data if isinstance(data, list) else [],
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_table_usage(table_ref: str, engine: str = "HIVE") -> str:
    """
    获取表的使用统计（查询频次、热度评分等）。

    参数:
        table_ref: 表名
        engine: 引擎类型，默认 "HIVE"

    示例:
        get_table_usage("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table)
        data = _request("GET", f"/dataWarehouse/{engine}/usage", params={"qualifiedName": qn})
        result = {
            "table": f"{database}.{table}",
            "usage": data,
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_table_lineage(table_ref: str, engine: str = "HIVE") -> str:
    """
    获取表的数据血缘关系（上下游表和任务依赖）。

    参数:
        table_ref: 表名
        engine: 引擎类型，默认 "HIVE"

    示例:
        get_table_lineage("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table)
        data = _request("GET", "/lineage/v2", params={"qualifiedName": qn})

        if isinstance(data, dict):
            entities = data.get("entities", [])
            raw_upstream = data.get("upstream", [])
            raw_downstream = data.get("downstream", [])

            entity_map = {}
            current = None
            for e in entities:
                eqn = e.get("qualifiedName", "")
                entry = {
                    "qualifiedName": eqn,
                    "displayName": e.get("displayName", ""),
                    "schema": e.get("schema", ""),
                    "serviceType": e.get("serviceType", ""),
                    "typeName": e.get("typeName", ""),
                    "status": e.get("status", ""),
                }
                entity_map[eqn] = entry
                if eqn == qn:
                    current = entry

            def _flatten_edges(raw: list) -> list:
                """API returns nested lists: [[edge, edge], [edge]] — flatten them."""
                flat: list = []
                for item in raw:
                    if isinstance(item, list):
                        flat.extend(item)
                    elif isinstance(item, dict):
                        flat.append(item)
                return flat

            def _format_edges(edges: list) -> list:
                formatted = []
                for edge in edges:
                    src = edge.get("src", "")
                    dst = edge.get("dst", "")
                    task = edge.get("task", {})
                    src_name = entity_map.get(src, {}).get("displayName", src.split("@")[-1] if "@" in src else src)
                    dst_name = entity_map.get(dst, {}).get("displayName", dst.split("@")[-1] if "@" in dst else dst)
                    formatted.append({
                        "source": src, "sourceDisplayName": src_name,
                        "target": dst, "targetDisplayName": dst_name,
                        "taskCode": task.get("taskCode", ""),
                        "sourceSystem": task.get("sourceSystem", ""),
                        "schedulerUrl": f"https://datasuite.shopee.io{task['urlPath']}" if task.get("urlPath") else "",
                    })
                return formatted

            upstream_flat = _flatten_edges(raw_upstream)
            downstream_flat = _flatten_edges(raw_downstream)

            upstream_src_qns = {e.get("src", "") for e in upstream_flat}
            downstream_dst_qns = {e.get("dst", "") for e in downstream_flat}

            result = {
                "table": f"{database}.{table}",
                "current": current,
                "upstream_count": len(upstream_flat),
                "upstream_edges": _format_edges(upstream_flat),
                "upstream_tables": [entity_map[q] for q in upstream_src_qns if q in entity_map],
                "downstream_count": len(downstream_flat),
                "downstream_edges": _format_edges(downstream_flat),
                "downstream_tables": [entity_map[q] for q in downstream_dst_qns if q in entity_map],
                "total_entities": len(entities),
            }
        else:
            result = {"table": f"{database}.{table}", "data": data}

        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_table_score(table_ref: str, score_type: str = "completeness", engine: str = "HIVE") -> str:
    """
    获取表的质量评分。

    参数:
        table_ref: 表名
        score_type: 评分类型，"completeness"（完整度）或 "popularity"（热度）
        engine: 引擎类型，默认 "HIVE"

    示例:
        get_table_score("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br", "completeness")
        get_table_score("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br", "popularity")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table)
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
def get_table_sla(table_ref: str, engine: str = "HIVE") -> str:
    """
    获取表关联的 SLA 信息。

    参数:
        table_ref: 表名
        engine: 引擎类型，默认 "HIVE"

    示例:
        get_table_sla("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table)
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
def get_table_audit_log(table_ref: str, engine: str = "HIVE", page_size: int = 20) -> str:
    """
    获取表的变更审计日志。

    参数:
        table_ref: 表名
        engine: 引擎类型，默认 "HIVE"
        page_size: 返回条数，默认 20

    示例:
        get_table_audit_log("spx_mart.dwd_spx_spsso_delivery_trajectory_di_br")
    """
    try:
        database, table = _parse_table_ref(table_ref)
        qn = _qualified_name(database, table)
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


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()

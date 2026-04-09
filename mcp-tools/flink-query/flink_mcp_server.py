#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Flink MCP Server
Flink 全栈查询与诊断工具，整合三大数据源：
  - DataSuite Flink API：任务管理、延迟、告警、血缘
  - Flink REST API (Keyhole)：Checkpoint、异常栈、Job 配置、TM 资源
  - Grafana / VictoriaMetrics：Kafka Lag、CPU/内存/GC、背压等实时指标
认证方式：自动从 Chrome 读取各域的 Cookie。
"""

import json
import logging
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, parse_qs

import requests as http_requests
from chrome_auth import get_auth, AuthResult
from chrome_auth.diagnostic import cookie_diagnostic as _cookie_diagnostic
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
        logger.info(f"[Auth] Flink cookies via {result.source} ({len(result.cookies)} cookies)")
    return result.cookies


def _diag(cookies: Dict[str, str]) -> str:
    expires_at = _last_auth.expires_at if _last_auth else None
    return _cookie_diagnostic(cookies, expires_at=expires_at)


# ──────────────────────────── HTTP 客户端 ────────────────────────────

BASE_URL = f"https://{DOMAIN}"
API_PREFIX = "/flink/api/v2"

HEADERS = {
    "accept": "*/*",
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


def _request(method: str, path: str, params: dict = None, json_body: dict = None) -> dict:
    """发起 HTTP 请求到 Flink API，自动带 Cookie、CSRF 和重试。"""
    url = BASE_URL + API_PREFIX + path
    cookies = _load_cookies()
    headers = HEADERS.copy()
    headers["referer"] = f"{BASE_URL}/flink/"
    if "CSRF-TOKEN" in cookies:
        headers["x-csrf-token"] = cookies["CSRF-TOKEN"]

    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = http_requests.request(
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
                    f"Cookie 诊断:\n{_diag(cookies)}"
                )
            resp.raise_for_status()
            return resp.json()
        except http_requests.RequestException as e:
            if attempt < MAX_RETRIES:
                logger.warning(f"请求异常，重试中: {e}")
                continue
            raise RuntimeError(f"请求 {path} 失败: {e}")

    raise RuntimeError(f"请求 {path} 超过最大重试次数")


def _get_data(resp: dict) -> Any:
    """从标准响应信封中提取 data 字段。"""
    code = resp.get("code")
    if isinstance(code, str):
        code = int(code)
    if code and code != 200:
        msg = resp.get("message") or resp.get("msg", "Unknown error")
        raise RuntimeError(f"API 返回错误: code={code}, message={msg}")
    return resp.get("data")


def _build_logify_url(app_id: int, instance_id: int) -> str:
    """构造 Logify (Kibana) 日志查看链接。"""
    return (
        f"{BASE_URL}/logify/discover?"
        f"logStoreId=73&logStoreName=flink-app-log&type=logstoreDiscover"
        f"&app_id=flink-{app_id}"
        f"&application_id=app{app_id}instance{instance_id}"
    )


LOGIFY_STORE_ID = 73


_LOGIFY_AUTH_KEYWORDS = ("401", "403", "unauthorized", "login", "auth", "expire", "CSRF")


def _is_logify_auth_error(resp) -> bool:
    """检测 Logify 响应是否为认证失败（含 302 重定向到登录页的情况）。"""
    ct = (resp.headers.get("content-type") or "").lower()
    if resp.status_code in (401, 403):
        return True
    if "text/html" in ct:
        return True
    return False


def _logify_query_sse(
    filters: Optional[List[Dict]],
    query: Optional[str],
    minutes: int,
    page_size: int,
) -> List[Dict]:
    """调用 Logify SSE 流式查询 API，返回日志行列表。"""
    cookies = _load_cookies()
    headers = HEADERS.copy()
    headers["referer"] = f"{BASE_URL}/logify/"
    headers["content-type"] = "application/json"
    if "CSRF-TOKEN" in cookies:
        headers["x-csrf-token"] = cookies["CSRF-TOKEN"]

    now_ms = int(time.time() * 1000)
    start_ms = now_ms - minutes * 60 * 1000

    body = {
        "page": 0,
        "pageSize": page_size,
        "orderBy": None,
        "dateRange": None,
        "startTime": start_ms,
        "endTime": now_ms,
        "query": query if query else None,
        "filters": filters if filters else None,
        "prevQuery": None,
    }

    url = f"{BASE_URL}/logify/api/v1/discover/query/records/parallel-stream?logStoreId={LOGIFY_STORE_ID}"
    last_error = ""

    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = http_requests.post(
                url,
                json=body,
                cookies=cookies,
                headers=headers,
                timeout=(10, 90),
                stream=True,
            )
            if _is_logify_auth_error(resp):
                resp.close()
                if attempt < MAX_RETRIES:
                    logger.warning(f"Logify 认证失败 (HTTP {resp.status_code})，刷新 cookie...")
                    cookies = _load_cookies(force=True, auth_failed=True)
                    if "CSRF-TOKEN" in cookies:
                        headers["x-csrf-token"] = cookies["CSRF-TOKEN"]
                    continue
                raise RuntimeError(
                    f"Logify 认证失败: HTTP {resp.status_code}\nCookie 诊断:\n{_diag(cookies)}"
                )
            resp.raise_for_status()
        except http_requests.RequestException as e:
            if attempt < MAX_RETRIES:
                cookies = _load_cookies(force=True, auth_failed=True)
                if "CSRF-TOKEN" in cookies:
                    headers["x-csrf-token"] = cookies["CSRF-TOKEN"]
                continue
            raise RuntimeError(f"Logify 请求失败: {e}")

        rows: List[Dict] = []
        event_type = ""
        sse_auth_error = False
        for line in resp.iter_lines(decode_unicode=True):
            if line is None:
                continue
            if line == "":
                event_type = ""
                continue
            if line.startswith("event:"):
                event_type = line[6:]
            elif line.startswith("data:"):
                data_str = line[5:]
                if event_type == "error":
                    resp.close()
                    if any(kw in data_str.lower() for kw in _LOGIFY_AUTH_KEYWORDS):
                        sse_auth_error = True
                        last_error = data_str
                        break
                    raise RuntimeError(f"Logify 查询错误: {data_str}")
                if event_type == "row":
                    try:
                        rows.append(json.loads(data_str))
                    except json.JSONDecodeError:
                        pass
                    if len(rows) >= page_size:
                        break
        resp.close()

        if sse_auth_error:
            if attempt < MAX_RETRIES:
                logger.warning(f"Logify SSE 认证错误，刷新 cookie: {last_error[:100]}")
                cookies = _load_cookies(force=True, auth_failed=True)
                if "CSRF-TOKEN" in cookies:
                    headers["x-csrf-token"] = cookies["CSRF-TOKEN"]
                continue
            raise RuntimeError(
                f"Logify 认证失败 (SSE): {last_error}\nCookie 诊断:\n{_diag(cookies)}"
            )

        return rows

    raise RuntimeError("Logify 请求超过最大重试次数")


def _format_ts(ts) -> str:
    """将毫秒时间戳格式化为可读字符串。"""
    if not ts:
        return ""
    try:
        return datetime.fromtimestamp(int(ts) / 1000).strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, OSError, TypeError):
        return str(ts)


def _result(data: Any) -> str:
    """将 Python 对象序列化为 JSON 字符串返回。"""
    return json.dumps(data, ensure_ascii=False, indent=2, default=str)


# ──────────────────────────── MCP Server ────────────────────────────

mcp = FastMCP("flink-query")


# ═══════════════════════════════════════════════════════════════════
# Phase 1: 核心查询工具
# ═══════════════════════════════════════════════════════════════════


@mcp.tool()
def search_flink_apps(
    keyword: str = "",
    project_name: str = "",
    app_type: str = "stream",
    page_size: int = 20,
    page: int = 1,
) -> str:
    """搜索 Flink 流/批任务列表。

    Args:
        keyword: 应用名关键词（模糊匹配）
        project_name: 项目名（如 spx_mart）
        app_type: 任务类型，stream（流任务）或 batch（批任务），默认 stream
        page_size: 每页条数，默认 20
        page: 页码，默认 1

    Returns:
        匹配的 Flink 应用列表，包含 appId、名称、状态、延迟等关键信息
    """
    try:
        params: Dict[str, Any] = {
            "current": page,
            "pageSize": page_size,
        }
        if keyword:
            params["applicationName"] = keyword
        if project_name:
            params["projectName"] = project_name

        resp = _request("GET", f"/applications/{app_type}/overview/list", params=params)
        data = _get_data(resp)
        pagination = resp.get("pagination", {}) or {}

        if not data:
            return _result({"apps": [], "total": 0, "message": "未找到匹配的 Flink 应用"})

        apps = []
        for app in data:
            apps.append({
                "appId": app.get("id"),
                "name": app.get("applicationName"),
                "project": app.get("projectName"),
                "type": app.get("appType") or app.get("jobType"),
                "status": app.get("status"),
                "instanceStatus": app.get("instanceStatus"),
                "owner": app.get("owner"),
                "region": app.get("region"),
                "cluster": app.get("cluster"),
                "queue": app.get("queue"),
                "cpu": app.get("cpu"),
                "memory": app.get("memory"),
                "latency": app.get("latency"),
                "latencyThreshold": app.get("latencyThreshold"),
                "exceptionCount": app.get("exceptionCount"),
                "alarmCount": app.get("alarmCount"),
                "importance": app.get("importanceLevel"),
                "tags": app.get("tagNames"),
                "url": f"{BASE_URL}/flink/operation/{app_type}/{app.get('id')}",
            })

        return _result({
            "apps": apps,
            "total": pagination.get("elementTotal", len(apps)),
            "page": page,
            "pageSize": page_size,
        })
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def get_flink_app_detail(app_id: int) -> str:
    """获取 Flink 应用详情，包含完整配置、状态、资源、调度等信息。

    Args:
        app_id: 应用 ID（如 741498）

    Returns:
        应用详细信息：名称、类型、状态、Owner、区域、配置等
    """
    try:
        resp = _request("GET", f"/applications/{app_id}")
        app = _get_data(resp)
        if not app:
            return _result({"error": f"未找到应用: {app_id}"})

        result = {
            "appId": app.get("id"),
            "name": app.get("name"),
            "description": app.get("description"),
            "type": app.get("type"),
            "jobType": app.get("jobType"),
            "status": app.get("status"),
            "importance": app.get("importanceLevel"),
            "owner": app.get("owner"),
            "ownerAccount": app.get("ownerAccountName"),
            "editor": app.get("editor"),
            "project": app.get("projectName"),
            "region": app.get("region"),
            "environment": app.get("environment"),
            "groupName": app.get("groupName"),
            "tags": app.get("tags"),
            "taskCode": app.get("taskCode"),
            "taskPriority": app.get("taskPriority"),
            "priority": app.get("priority"),
            "alarmSubscription": app.get("alarmSubscriptionStatus"),
            "scheduleStatus": app.get("scheduleStatus"),
            "cronExpression": app.get("cronExpression"),
            "scheduleDescription": app.get("scheduleDescription"),
            "releaseId": app.get("releaseId"),
            "fileId": app.get("fileId"),
            "syncWithDev": app.get("syncWithDev"),
            "slaInfos": app.get("slaInfos"),
            "drStatus": app.get("taskDrStatusCodes"),
            "createTime": _format_ts(app.get("createTime")),
            "updateTime": _format_ts(app.get("updateTime")),
            "url": f"{BASE_URL}/flink/operation/stream/{app_id}",
        }
        return _result(result)
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def get_flink_instance(
    app_id: int,
    instance_type: str = "current",
    page_size: int = 10,
    page: int = 1,
) -> str:
    """获取 Flink 应用的实例信息（当前运行实例或历史实例）。

    Args:
        app_id: 应用 ID
        instance_type: current（当前实例）或 historical（历史实例），默认 current
        page_size: 历史实例每页条数
        page: 历史实例页码

    Returns:
        实例信息：状态、集群、资源、延迟、异常数、监控链接等
    """
    try:
        if instance_type == "current":
            resp = _request("GET", f"/instances/stream/current/{app_id}")
            inst = _get_data(resp)
            if not inst:
                return _result({"error": f"应用 {app_id} 无正在运行的实例"})
            instances = [inst]
        else:
            params = {"current": page, "pageSize": page_size}
            resp = _request("GET", f"/instances/stream/historical/{app_id}", params=params)
            instances = _get_data(resp) or []

        results = []
        for inst in (instances if isinstance(instances, list) else [instances]):
            results.append({
                "instanceId": inst.get("id"),
                "sessionId": inst.get("sessionId"),
                "status": inst.get("instanceStatus"),
                "cluster": inst.get("clusterName"),
                "queue": inst.get("queueName"),
                "cpu": inst.get("cpu"),
                "memory": inst.get("memory"),
                "latency": inst.get("latency"),
                "latencyThreshold": inst.get("latencyThreshold"),
                "exceptionCount": inst.get("exceptionCount"),
                "restartCount": inst.get("restartCount"),
                "lastOperation": inst.get("lastOperation"),
                "lastOperationError": inst.get("lastOperationError"),
                "region": inst.get("region"),
                "project": inst.get("projectName"),
                "hasGraph": inst.get("hasGraph"),
                "trackingUrl": inst.get("trackingUrl"),
                "yarnTrackingUrl": inst.get("yarnTrackingUrl"),
                "yarnKeyholeUrl": inst.get("yarnKeyholeTrackUrl"),
                "webKeyholeUrl": inst.get("webKeyholeTrackUrl"),
                "metricsUrl": inst.get("metricsUrl"),
                "kibanaUrl": inst.get("kibanaUrl"),
                "createTime": _format_ts(inst.get("createTime")),
                "updateTime": _format_ts(inst.get("updateTime")),
            })

        pagination = resp.get("pagination") or {}
        return _result({
            "instances": results,
            "total": pagination.get("elementTotal", len(results)),
            "type": instance_type,
        })
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def get_flink_exceptions(
    app_id: int,
    instance_id: str = "",
    page_size: int = 10,
    page: int = 1,
) -> str:
    """获取 Flink 应用的异常列表。

    Args:
        app_id: 应用 ID
        instance_id: 实例 ID（可选，不填则查所有实例的异常）
        page_size: 每页条数
        page: 页码

    Returns:
        异常列表：异常消息、堆栈摘要、发生次数、触发时间、容器信息等
    """
    try:
        params: Dict[str, Any] = {"current": page, "pageSize": page_size}
        if instance_id:
            params["instanceId"] = instance_id

        resp = _request("GET", f"/log/application/{app_id}/exceptions", params=params)
        data = _get_data(resp) or []

        exceptions = []
        for exc in data:
            detail = exc.get("detail", "")
            detail_summary = detail[:500] + "..." if len(detail) > 500 else detail

            exceptions.append({
                "id": exc.get("id"),
                "instanceId": exc.get("instanceId"),
                "message": exc.get("msg"),
                "detailSummary": detail_summary,
                "count": exc.get("count"),
                "tags": exc.get("tags"),
                "containerIp": exc.get("containerIp"),
                "containerId": exc.get("containerId"),
                "triggerTime": _format_ts(exc.get("triggerTime")),
                "lastTriggerTime": _format_ts(exc.get("lastTriggerTime")),
                "createTime": _format_ts(exc.get("createTime")),
            })

        pagination = resp.get("pagination") or {}
        return _result({
            "exceptions": exceptions,
            "total": pagination.get("elementTotal", len(exceptions)),
        })
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def get_flink_alarm_log(
    app_id: int,
    page_size: int = 10,
    page: int = 1,
) -> str:
    """获取 Flink 应用的告警日志。

    Args:
        app_id: 应用 ID
        page_size: 每页条数
        page: 页码

    Returns:
        告警记录：告警名称、内容、接收者、通知渠道状态、时间等
    """
    try:
        params = {"pageSize": page_size, "current": page}
        resp = _request("GET", f"/applications/alarm/log/{app_id}", params=params)
        data = _get_data(resp) or []

        alarms = []
        for alarm in data:
            notification_status = {}
            for channel in ("emailStatus", "seatalkStatus", "smsStatus",
                            "webhookStatus", "seatalkBotStatus", "phoneCallStatus"):
                val = alarm.get(channel)
                if val:
                    notification_status[channel] = val

            alarms.append({
                "id": alarm.get("id"),
                "alarmName": alarm.get("alarmName"),
                "content": alarm.get("content"),
                "receivers": alarm.get("receivers"),
                "notificationStatus": notification_status or None,
                "project": alarm.get("projectName"),
                "region": alarm.get("region"),
                "createTime": _format_ts(alarm.get("createTime")),
            })

        pagination = resp.get("pagination") or {}
        return _result({
            "alarms": alarms,
            "total": pagination.get("elementTotal", len(alarms)),
        })
    except Exception as e:
        return _result({"error": str(e)})


# ═══════════════════════════════════════════════════════════════════
# Phase 2: 诊断工具（延迟、算子指标、资源调优）
# ═══════════════════════════════════════════════════════════════════


@mcp.tool()
def get_flink_latency(
    app_id: int,
    minutes: int = 60,
) -> str:
    """获取 Flink 流任务的延迟趋势数据。

    Args:
        app_id: 应用 ID
        minutes: 回看时长（分钟），默认 60

    Returns:
        延迟趋势：每个数据点包含总延迟、Kafka Source 延迟、算子延迟、Kafka Producer 延迟等
    """
    try:
        now_ms = int(time.time() * 1000)
        start_ms = now_ms - minutes * 60 * 1000

        resp = _request("GET", f"/applications/stream/{app_id}/latency",
                        params={"start": start_ms, "end": now_ms})
        outer = _get_data(resp)
        if not outer:
            return _result({"error": f"应用 {app_id} 无延迟数据"})

        series = outer.get("data", [])
        threshold = outer.get("latencyThreshold")
        threshold_unit = outer.get("latencyThresholdUnit")

        points = []
        for pt in series:
            points.append({
                "time": _format_ts(pt.get("time")),
                "latency": pt.get("latency"),
                "kafkaSourceLatency": pt.get("kafkaSourceLatency"),
                "operatorLatency": pt.get("operatorLatency"),
                "kafkaProducerQueueLatency": pt.get("kafkaProducerQueueLatency"),
                "status": pt.get("applicationStatus"),
                "instanceId": pt.get("instanceId"),
            })

        summary = {}
        if points:
            latencies = [p["latency"] for p in points if p["latency"] is not None]
            if latencies:
                summary = {
                    "avgLatency": round(sum(latencies) / len(latencies), 2),
                    "maxLatency": max(latencies),
                    "minLatency": min(latencies),
                    "dataPoints": len(latencies),
                }

        return _result({
            "threshold": threshold,
            "thresholdUnit": threshold_unit,
            "hasKafkaSource": outer.get("hasKafkaSource"),
            "hasKafkaSink": outer.get("hasKafkaSink"),
            "summary": summary,
            "series": points,
            "timeRange": f"最近 {minutes} 分钟",
        })
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def get_flink_latency_analysis(
    app_id: int,
    minutes: int = 60,
) -> str:
    """获取 Flink 流任务的延迟分析（含异常诊断、系统指标、热力图）。

    Args:
        app_id: 应用 ID
        minutes: 回看时长（分钟），默认 60

    Returns:
        延迟根因分析数据
    """
    try:
        now_ms = int(time.time() * 1000)
        start_ms = now_ms - minutes * 60 * 1000

        resp = _request("GET", f"/applications/{app_id}/latency-analysis",
                        params={"start": start_ms, "end": now_ms})
        data = _get_data(resp)
        if not data:
            return _result({"error": f"应用 {app_id} 无延迟分析数据"})

        return _result(data)
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def get_flink_graph_metrics(
    app_id: int,
    instance_id: Optional[int] = None,
) -> str:
    """获取 Flink 作业的算子级指标（Graph Monitor），用于定位瓶颈算子。

    Args:
        app_id: 应用 ID
        instance_id: 实例 ID（可选，不填则自动使用最新实例）

    Returns:
        各算子的指标数据（吞吐、延迟、背压等）
    """
    try:
        if not instance_id:
            inst_resp = _request("GET", f"/instances/graph-monitor/instanceList/{app_id}")
            inst_list = _get_data(inst_resp) or []
            if not inst_list:
                return _result({"error": f"应用 {app_id} 无可用的 Graph Monitor 实例"})
            instance_id = inst_list[0].get("id") if isinstance(inst_list[0], dict) else inst_list[0]

        config_resp = _request("GET", f"/instances/{instance_id}/graph-config")
        graph_config = _get_data(config_resp)

        now_ms = int(time.time() * 1000)
        session_id = f"app{app_id}instance{instance_id}"
        metrics_resp = _request(
            "POST",
            f"/instances/graph-monitor/task-metrics/{session_id}",
            params={"time": now_ms},
        )
        metrics_data = _get_data(metrics_resp)

        return _result({
            "appId": app_id,
            "instanceId": instance_id,
            "graphConfig": graph_config,
            "metrics": metrics_data,
        })
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def get_flink_resource_estimation(app_id: int) -> str:
    """获取 Flink 应用的资源调优建议（并行度估算、资源概览、伸缩通知）。

    Args:
        app_id: 应用 ID

    Returns:
        资源估算：建议并行度、CPU/内存使用、伸缩历史等
    """
    try:
        result: Dict[str, Any] = {"appId": app_id}

        try:
            overview_resp = _request("GET", "/applications/autoscaler/estimation/overview",
                                     params={"appId": app_id})
            result["overview"] = _get_data(overview_resp)
        except Exception as e:
            result["overview"] = {"error": str(e)}

        try:
            instances_resp = _request(
                "GET", f"/applications/autoscaler/estimation/application/{app_id}/instances")
            result["instances"] = _get_data(instances_resp)
        except Exception as e:
            result["instances"] = {"error": str(e)}

        try:
            notif_resp = _request("GET", f"/applications/autoscaler/notification/app/{app_id}")
            result["notifications"] = _get_data(notif_resp)
        except Exception as e:
            result["notifications"] = {"error": str(e)}

        return _result(result)
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def diagnose_flink_app(
    app_id: int,
    minutes: int = 60,
) -> str:
    """一键诊断 Flink 应用：聚合 DataSuite + Keyhole + Grafana 全栈数据，输出问题与优化建议。

    适用于收到告警后快速排查问题根因。自动调用 9 个数据源并综合分析：
    - DataSuite: 应用详情、实例状态、延迟趋势、异常列表、告警记录、资源估算
    - Keyhole: Checkpoint 健康、Runtime 异常堆栈（best-effort）
    - Grafana: 背压、Kafka Lag、CPU/内存指标（best-effort）

    Args:
        app_id: 应用 ID
        minutes: 回看时长（分钟），默认 60

    Returns:
        综合诊断报告：应用概况、延迟分析、异常摘要、告警记录、资源状况、
        Checkpoint 健康、Grafana 指标、优化建议
    """
    try:
        diagnosis: Dict[str, Any] = {"appId": app_id, "timeRange": f"最近 {minutes} 分钟"}
        issues: List[str] = []
        suggestions: List[str] = []

        # 1. 应用详情
        try:
            app_resp = _request("GET", f"/applications/{app_id}")
            app = _get_data(app_resp) or {}
            diagnosis["app"] = {
                "name": app.get("name"),
                "status": app.get("status"),
                "type": app.get("jobType"),
                "project": app.get("projectName"),
                "owner": app.get("owner"),
                "importance": app.get("importanceLevel"),
            }
            if app.get("status") != "RUNNING":
                issues.append(f"应用状态异常: {app.get('status')}（非 RUNNING）")
        except Exception as e:
            diagnosis["app"] = {"error": str(e)}

        # 2. 当前实例
        try:
            inst_resp = _request("GET", f"/instances/stream/current/{app_id}")
            inst = _get_data(inst_resp) or {}
            inst_id = inst.get("id")
            diagnosis["instance"] = {
                "id": inst_id,
                "status": inst.get("instanceStatus"),
                "cluster": inst.get("clusterName"),
                "cpu": inst.get("cpu"),
                "memory": inst.get("memory"),
                "latency": inst.get("latency"),
                "latencyThreshold": inst.get("latencyThreshold"),
                "exceptionCount": inst.get("exceptionCount"),
                "restartCount": inst.get("restartCount"),
                "metricsUrl": inst.get("metricsUrl"),
            }
            if inst_id:
                diagnosis["logifyUrl"] = _build_logify_url(app_id, inst_id)
            if inst.get("instanceStatus") != "RUNNING":
                issues.append(f"实例状态异常: {inst.get('instanceStatus')}")
            if inst.get("restartCount") and inst["restartCount"] > 3:
                issues.append(f"实例频繁重启: {inst['restartCount']} 次")
                suggestions.append("频繁重启通常由 OOM 或 Checkpoint 超时引起，检查内存配置和 Checkpoint 间隔")
        except Exception as e:
            diagnosis["instance"] = {"error": str(e)}

        # 3. 延迟趋势
        try:
            now_ms = int(time.time() * 1000)
            start_ms = now_ms - minutes * 60 * 1000
            latency_resp = _request("GET", f"/applications/stream/{app_id}/latency",
                                    params={"start": start_ms, "end": now_ms})
            lat_outer = _get_data(latency_resp) or {}
            series = lat_outer.get("data", [])
            threshold = lat_outer.get("latencyThreshold")

            if series:
                latencies = [p["latency"] for p in series if p.get("latency") is not None]
                if latencies:
                    avg_lat = round(sum(latencies) / len(latencies), 2)
                    max_lat = max(latencies)
                    diagnosis["latency"] = {
                        "avg": avg_lat,
                        "max": max_lat,
                        "min": min(latencies),
                        "threshold": threshold,
                        "dataPoints": len(latencies),
                        "exceedThreshold": threshold and max_lat > threshold,
                    }
                    if threshold and max_lat > threshold:
                        issues.append(f"延迟超过阈值: max={max_lat}s > threshold={threshold}s")
                        suggestions.append("检查 Kafka Source 消费速率、算子处理能力、是否有数据倾斜")
                    if avg_lat > 300:
                        issues.append(f"平均延迟偏高: {avg_lat}s")
                        suggestions.append("考虑增加并行度、优化算子逻辑、检查外部依赖响应时间")
            else:
                diagnosis["latency"] = {"message": "无延迟数据"}
        except Exception as e:
            diagnosis["latency"] = {"error": str(e)}

        # 4. 最近异常
        try:
            exc_resp = _request("GET", f"/log/application/{app_id}/exceptions",
                                params={"current": 1, "pageSize": 5})
            exc_data = _get_data(exc_resp) or []
            exc_pagination = exc_resp.get("pagination") or {}

            diagnosis["exceptions"] = {
                "total": exc_pagination.get("elementTotal", len(exc_data)),
                "recent": [],
            }
            for exc in exc_data[:5]:
                diagnosis["exceptions"]["recent"].append({
                    "message": exc.get("msg"),
                    "count": exc.get("count"),
                    "time": _format_ts(exc.get("lastTriggerTime")),
                    "tags": exc.get("tags"),
                })
            if exc_data:
                issues.append(f"存在 {len(exc_data)} 个近期异常")
                top_exc = exc_data[0]
                if top_exc.get("msg") and "OutOfMemory" in top_exc["msg"]:
                    suggestions.append("检测到 OOM 异常，建议增加 TaskManager 内存或优化状态大小")
                if top_exc.get("msg") and "Checkpoint" in top_exc["msg"]:
                    suggestions.append("检测到 Checkpoint 相关异常，检查状态大小和 Checkpoint 超时配置")
        except Exception as e:
            diagnosis["exceptions"] = {"error": str(e)}

        # 5. 最近告警
        try:
            alarm_resp = _request("GET", f"/applications/alarm/log/{app_id}",
                                  params={"pageSize": 5, "current": 1})
            alarm_data = _get_data(alarm_resp) or []
            alarm_pagination = alarm_resp.get("pagination") or {}

            diagnosis["alarms"] = {
                "total": alarm_pagination.get("elementTotal", len(alarm_data)),
                "recent": [],
            }
            for alarm in alarm_data[:5]:
                diagnosis["alarms"]["recent"].append({
                    "name": alarm.get("alarmName"),
                    "content": (alarm.get("content", "")[:200] + "..."
                                if len(alarm.get("content", "")) > 200 else alarm.get("content")),
                    "time": _format_ts(alarm.get("createTime")),
                })
        except Exception as e:
            diagnosis["alarms"] = {"error": str(e)}

        # 6. 资源估算
        try:
            res_resp = _request("GET", "/applications/autoscaler/estimation/overview",
                                params={"appId": app_id})
            res_data = _get_data(res_resp)
            if res_data:
                diagnosis["resource"] = res_data
        except Exception:
            pass

        # ── 以下为 Keyhole / Grafana 增强诊断（best-effort，失败不影响核心诊断）──

        # 7. Checkpoint 健康（Keyhole）
        try:
            ck_data = _keyhole_get("/checkpoints", app_id)
            counts = ck_data.get("counts", {})
            failed = counts.get("failed", 0)
            completed = counts.get("completed", 0)
            latest = ck_data.get("latest", {})
            diagnosis["checkpoints_keyhole"] = {
                "completed": completed,
                "failed": failed,
                "in_progress": counts.get("in_progress", 0),
                "latest_status": latest.get("status"),
                "latest_duration_ms": latest.get("duration"),
                "latest_size_bytes": latest.get("state_size"),
            }
            if failed > 0:
                ratio = failed / max(completed + failed, 1)
                issues.append(f"Checkpoint 失败 {failed} 次（失败率 {ratio:.0%}）")
                if ratio > 0.3:
                    suggestions.append("Checkpoint 失败率过高，检查状态大小、超时配置和 TaskManager 稳定性")
            if latest.get("duration") and latest["duration"] > 120000:
                issues.append(f"最近 Checkpoint 耗时 {latest['duration']/1000:.1f}s，超过 2 分钟")
                suggestions.append("Checkpoint 耗时过长，考虑启用增量 Checkpoint 或减小状态大小")
        except Exception:
            pass

        # 8. Runtime Exceptions（Keyhole — 比 DataSuite 更底层）
        try:
            exc_keyhole = _keyhole_get("/exceptions", app_id)
            root_exc = exc_keyhole.get("root-exception", "")
            truncated = root_exc[:500] + "..." if len(root_exc) > 500 else root_exc
            if root_exc:
                diagnosis["runtime_exception_keyhole"] = truncated
                if "OutOfMemoryError" in root_exc:
                    if "OutOfMemory" not in " ".join(issues):
                        issues.append("Flink Runtime: OutOfMemoryError")
                        suggestions.append("JVM 堆内存不足，增加 taskmanager.memory.process.size 或优化状态/缓存")
                if "TimeoutException" in root_exc or "Checkpoint expired" in root_exc:
                    if "Checkpoint" not in " ".join(suggestions):
                        suggestions.append("Checkpoint 超时，增加 execution.checkpointing.timeout 或减少状态")
        except Exception:
            pass

        # 9. Grafana 核心指标（背压 + Kafka Lag + CPU，30 分钟窗口）
        try:
            info = _get_instance_info(app_id)
            sid = info.get("session_id")
            if sid:
                job_filter = f'job=~".*(flink_metrics|pushgateway_flink)",session_id="{sid}"'
                quick_exprs = {
                    "max_bp": f"max(flink_taskmanager_job_task_backPressuredTimeMsPerSecond{{{job_filter}}})",
                    "max_busy": f"max(flink_taskmanager_job_task_busyTimeMsPerSecond{{{job_filter}}})",
                    "kafka_lag": f"sum(flink_taskmanager_job_task_operator_KafkaConsumer_records_lag_max{{{job_filter}}} >= 0)",
                    "tm_max_cpu": f"max(flink_taskmanager_Status_JVM_CPU_Load{{{job_filter}}})",
                    "tm_max_heap": f"max(flink_taskmanager_Status_JVM_Memory_Heap_Used{{{job_filter}}} / flink_taskmanager_Status_JVM_Memory_Heap_Max{{{job_filter}}})",
                }
                grafana_data = _grafana_query_batch(quick_exprs, range_seconds=minutes * 60)
                metrics_summary = {}
                for k, v in grafana_data.items():
                    if v and v.get("current") is not None:
                        metrics_summary[k] = {"current": v["current"], "max": v.get("max"), "avg": v.get("avg")}
                if metrics_summary:
                    diagnosis["grafana_metrics"] = metrics_summary
                    bp = metrics_summary.get("max_bp", {})
                    if bp.get("max") and bp["max"] > 800:
                        issues.append(f"严重背压: 最大 {bp['max']:.0f} ms/s（接近完全阻塞 1000）")
                        suggestions.append("存在背压瓶颈，定位最慢算子（通常是 Sink 或窗口聚合），考虑增加并行度")
                    elif bp.get("avg") and bp["avg"] > 500:
                        issues.append(f"持续背压: 平均 {bp['avg']:.0f} ms/s")
                    lag = metrics_summary.get("kafka_lag", {})
                    if lag.get("current") and lag["current"] > 100000:
                        issues.append(f"Kafka Lag 偏高: {lag['current']:.0f} records")
                        suggestions.append("消费速度跟不上生产速度，增加 Source 并行度或优化下游处理")
                    cpu = metrics_summary.get("tm_max_cpu", {})
                    if cpu.get("max") and cpu["max"] > 0.9:
                        issues.append(f"TM CPU 过高: 最大 {cpu['max']:.0%}")
                        suggestions.append("CPU 接近满载，增加 TaskManager 数量或优化计算逻辑")
                    heap = metrics_summary.get("tm_max_heap", {})
                    if heap.get("max") and heap["max"] > 0.9:
                        issues.append(f"TM Heap 使用率过高: 最大 {heap['max']:.0%}")
                        suggestions.append("Heap 接近上限，增加 taskmanager.memory.process.size 或检查状态/缓存泄漏")
        except Exception:
            pass

        # 综合判断：若核心接口均失败（如 401），不可判为 HEALTHY
        fetch_errors = [
            k for k in ("app", "instance", "latency", "exceptions", "alarms")
            if isinstance(diagnosis.get(k), dict) and diagnosis[k].get("error")
        ]
        if fetch_errors:
            diagnosis["verdict"] = "DATA_UNAVAILABLE"
            diagnosis["summary"] = (
                f"无法完成诊断：以下模块接口失败: {', '.join(fetch_errors)}。"
                "请确认 Chrome 已登录 DataSuite Flink，或检查网络与权限。"
            )
            diagnosis["fetchErrors"] = fetch_errors
        elif not issues:
            diagnosis["verdict"] = "HEALTHY"
            diagnosis["summary"] = "应用运行正常，未检测到明显异常"
        else:
            diagnosis["verdict"] = "ATTENTION_NEEDED"
            diagnosis["issues"] = issues
            if diagnosis.get("logifyUrl"):
                suggestions.append(f"查看 Logify 日志定位详细错误: {diagnosis['logifyUrl']}")
            diagnosis["suggestions"] = suggestions
            diagnosis["summary"] = f"检测到 {len(issues)} 个问题，请关注"

        return _result(diagnosis)
    except Exception as e:
        return _result({"error": str(e)})


# ═══════════════════════════════════════════════════════════════════
# Phase 3: 扩展工具（血缘、操作日志、SLA/DR、日志）
# ═══════════════════════════════════════════════════════════════════


@mcp.tool()
def get_flink_log_url(app_id: int, instance_id: int = 0) -> str:
    """生成 Flink 应用的 Logify (Kibana) 日志链接。

    用于排查 SQL 执行失败、启动异常等问题。在 Logify 中搜索
    "Failed to execute sql"、"Exception" 等关键词可快速定位根因。

    Args:
        app_id: 应用 ID
        instance_id: 实例 ID。不传则自动获取当前运行实例

    Returns:
        Logify 日志链接，可直接在浏览器打开
    """
    try:
        if not instance_id:
            inst_resp = _request("GET", f"/instances/stream/current/{app_id}")
            inst = _get_data(inst_resp) or {}
            instance_id = inst.get("id")
            if not instance_id:
                return _result({"error": f"应用 {app_id} 无运行实例，请指定 instance_id"})

        url = _build_logify_url(app_id, instance_id)
        return _result({
            "appId": app_id,
            "instanceId": instance_id,
            "logifyUrl": url,
            "searchTips": [
                "Failed to execute sql — SQL 执行失败",
                "Exception — 通用异常",
                "OutOfMemoryError — 内存溢出",
                "Checkpoint expired — CP 超时",
                "FATAL — 致命错误",
            ],
        })
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def query_flink_logs(
    app_id: int,
    query: str = "",
    instance_id: int = 0,
    log_level: str = "",
    minutes: int = 30,
    limit: int = 50,
) -> str:
    """直接查询 Flink 应用的 Logify 日志内容。

    无需打开浏览器，直接返回日志行，用于排查 SQL 错误、异常栈等。
    底层调用 Logify SSE API，自动过滤 app_id 和可选 instance_id。

    Args:
        app_id: Flink 应用 ID
        query: LogiQL 搜索语句，例如：
               - message hasTokens 'Exception'
               - message hasTokens 'Failed to execute sql'
               - message hasTokens 'OutOfMemoryError'
               - log_level = 'ERROR'
               留空则返回所有日志
        instance_id: 实例 ID，0 表示不限（搜索该 app 所有实例）
        log_level: 快捷过滤日志级别（ERROR / WARN / INFO），留空不过滤
        minutes: 查询最近多少分钟，默认 30，最大 1440（24h）
        limit: 返回日志行数，默认 50，最大 200

    Returns:
        日志行列表，每行含 timestamp、message、log_level、class 等字段
    """
    try:
        minutes = min(max(minutes, 1), 1440)
        limit = min(max(limit, 1), 200)

        filters = [
            {"type": "EQUAL", "columnName": "app_id", "values": [f"flink-{app_id}"]}
        ]
        if instance_id:
            filters.append({
                "type": "EQUAL",
                "columnName": "application_id",
                "values": [f"app{app_id}instance{instance_id}"],
            })
        if log_level:
            filters.append({
                "type": "EQUAL",
                "columnName": "log_level",
                "values": [log_level.upper()],
            })

        if log_level and not query:
            query_str = None
        else:
            query_str = query or None

        rows = _logify_query_sse(filters, query_str, minutes, limit)

        compact_rows = []
        for r in rows:
            msg = r.get("message", "")
            if len(msg) > 2000:
                msg = msg[:2000] + "...(truncated)"
            compact_rows.append({
                "timestamp": _format_ts(r.get("timestamp")),
                "log_level": r.get("log_level", ""),
                "class": r.get("class", ""),
                "message": msg,
                "app_name": r.get("app_name", ""),
                "application_id": r.get("application_id", ""),
            })

        return _result({
            "appId": app_id,
            "query": query or "(all)",
            "timeRange": f"最近 {minutes} 分钟",
            "totalReturned": len(compact_rows),
            "logs": compact_rows,
            "logifyUrl": _build_logify_url(
                app_id, instance_id or 0
            ),
        })
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def get_flink_lineage(app_id: int) -> str:
    """获取 Flink 应用的数据血缘关系（Source / Lookup / Sink 表）。

    Args:
        app_id: 应用 ID

    Returns:
        血缘关系：消费的表（Source）、写入的表（Sink）、维表（Lookup）及其属性
    """
    try:
        resp = _request("GET", "/datalineage/applications/tables", params={"id": app_id})
        data = _get_data(resp)
        if not data:
            return _result({"error": f"应用 {app_id} 无血缘数据"})

        tables_map: Dict[str, Dict] = {}
        for t in data.get("tables", []):
            tables_map[t.get("tableName", "")] = {
                "name": t.get("tableName"),
                "type": t.get("tableType"),
                "tag": t.get("tag"),
                "tagDescription": t.get("tagDescription"),
                "properties": t.get("properties"),
                "hudiRedirectUrl": t.get("hudiRedirectUrl"),
            }

        def _resolve_edges(edges: list) -> List[Dict]:
            return [{"src": e.get("src"), "dst": e.get("dst")} for e in (edges or [])]

        result = {
            "appId": app_id,
            "consumeCount": data.get("consumeCount", 0),
            "produceCount": data.get("produceCount", 0),
            "lookupCount": data.get("lookupCount", 0),
            "consume": _resolve_edges(data.get("consume")),
            "produce": _resolve_edges(data.get("produce")),
            "lookup": _resolve_edges(data.get("lookup")),
            "tables": list(tables_map.values()),
        }

        apps_raw = data.get("applications", [])
        if apps_raw:
            result["relatedApps"] = [{
                "id": a.get("id"),
                "name": a.get("name"),
                "type": a.get("jobType"),
                "status": a.get("status"),
                "project": a.get("projectName"),
            } for a in apps_raw]

        return _result(result)
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def get_flink_operation_log(
    app_id: int,
    page_size: int = 20,
    page: int = 1,
) -> str:
    """获取 Flink 应用的操作日志（启动、停止、重启等操作记录）。

    Args:
        app_id: 应用 ID
        page_size: 每页条数
        page: 页码

    Returns:
        操作记录：操作类型、执行状态、操作人、时间、原因等
    """
    try:
        params = {"current": page, "pageSize": page_size}
        resp = _request("GET", f"/log/applications/{app_id}/executions", params=params)
        data = _get_data(resp) or []

        operations = []
        for op in data:
            operations.append({
                "id": op.get("id"),
                "instanceId": op.get("instanceId"),
                "operationType": op.get("operationType"),
                "executionState": op.get("executionState"),
                "operator": op.get("operator"),
                "message": op.get("message"),
                "startReason": op.get("startReason"),
                "region": op.get("region"),
                "createTime": _format_ts(op.get("createTime")),
            })

        pagination = resp.get("pagination") or {}
        return _result({
            "operations": operations,
            "total": pagination.get("elementTotal", len(operations)),
        })
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def get_flink_sla_dr(app_id: int) -> str:
    """获取 Flink 应用的 SLA 和容灾（DR）信息。

    Args:
        app_id: 应用 ID

    Returns:
        SLA 等级、容灾配置信息
    """
    try:
        result: Dict[str, Any] = {"appId": app_id}

        try:
            dr_resp = _request("GET", f"/applications/{app_id}/dr_info")
            result["dr"] = _get_data(dr_resp)
        except Exception as e:
            result["dr"] = {"error": str(e)}

        try:
            sla_resp = _request("GET", f"/applications/{app_id}/sla_info/list")
            result["sla"] = _get_data(sla_resp)
        except Exception as e:
            result["sla"] = {"error": str(e)}

        return _result(result)
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def search_flink_table_lineage(
    table_name: str,
    table_type: str = "kafka",
    project_name: str = "",
) -> str:
    """从表名反查关联的 Flink 任务（哪些任务在读/写这张表）。

    两步流程：先搜索表获取 uniqueKey，再查询关联的上下游应用。

    Args:
        table_name: 表名关键字（如 Kafka topic 名、Hudi 表名，支持模糊搜索）
        table_type: 表类型，可选值: kafka / shopee_catalog (Hive/Hudi) /
                    clickhouse / hbase / redis / elasticsearch / jdbc。默认 kafka
        project_name: 项目名（如 spx_mart）。不传则从搜索结果中自动提取

    Returns:
        匹配的表及其上下游 Flink 应用列表（Write Applications / Read Applications）
    """
    try:
        search_resp = _request("GET", "/datalineage/tables/search",
                               params={"keyword": table_name, "tableType": table_type})
        tables = _get_data(search_resp) or []
        if not tables:
            return _result({
                "error": f"未找到匹配 '{table_name}' (type={table_type}) 的表",
                "hint": "仅在 Flink 平台上使用过的表可被搜到。"
                        "可尝试其他 tableType: kafka / shopee_catalog / clickhouse / hbase / redis / elasticsearch / jdbc",
            })

        if len(tables) > 20:
            return _result({
                "matchCount": len(tables),
                "message": f"匹配到 {len(tables)} 张表，请提供更精确的关键字",
                "preview": [t.get("tableName") for t in tables[:15]],
            })

        results = []
        for tbl in tables[:10]:
            edge_name = tbl.get("edgeName", "")
            tbl_name = tbl.get("tableName", "")
            proj = project_name or tbl_name.split("__")[0] if "__" in tbl_name else ""
            if not edge_name or not proj:
                results.append({"table": tbl_name, "error": "缺少 edgeName 或 projectName"})
                continue

            try:
                lineage_resp = _request("GET", "/datalineage/tables/applications",
                                        params={
                                            "uniqueKey": edge_name,
                                            "tableType": table_type,
                                            "projectName": proj,
                                        })
                lineage_data = _get_data(lineage_resp) or {}

                apps = lineage_data.get("applications", [])
                app_list = [{
                    "id": a.get("id"),
                    "name": a.get("name"),
                    "type": a.get("jobType"),
                    "status": a.get("status"),
                    "project": a.get("projectName"),
                    "owner": a.get("email"),
                    "importance": a.get("importanceLevel"),
                } for a in apps]

                entry: Dict[str, Any] = {
                    "table": tbl_name,
                    "tableType": table_type,
                    "idcRegion": tbl.get("IDC Region"),
                    "upstreamCount": lineage_data.get("upstreamCount", 0),
                    "downstreamCount": lineage_data.get("downstreamCount", 0),
                    "upstream": [{"src": e.get("src"), "dst": e.get("dst")}
                                 for e in (lineage_data.get("upstream") or [])],
                    "downstream": [{"src": e.get("src"), "dst": e.get("dst")}
                                   for e in (lineage_data.get("downstream") or [])],
                    "applications": app_list,
                }
                results.append(entry)
            except Exception as e:
                results.append({"table": tbl_name, "error": str(e)})

        return _result({"keyword": table_name, "tableType": table_type, "results": results})
    except Exception as e:
        return _result({"error": str(e)})


# ═══════════════════════════════════════════════════════════════════
# Keyhole / Grafana 基础设施
# ═══════════════════════════════════════════════════════════════════

KEYHOLE_BASE = "https://keyhole.data-infra.shopee.io"
KEYHOLE_DOMAINS = ["data-infra.shopee.io", "keyhole.data-infra.shopee.io"]

GRAFANA_BASE = "https://grafana.idata.shopeemobile.com"
GRAFANA_DOMAIN = "grafana.idata.shopeemobile.com"
GRAFANA_DS_NAME = "vm-prod-flink"

_instance_cache: Dict[int, dict] = {}
_grafana_ds_uid: Optional[str] = None


def _get_instance_info(app_id: int) -> dict:
    """获取当前运行实例的关键信息（含缓存）。"""
    if app_id in _instance_cache:
        return _instance_cache[app_id]

    inst_resp = _request("GET", f"/instances/stream/current/{app_id}")
    inst = _get_data(inst_resp) or {}
    inst_id = inst.get("id")
    info = {
        "instance_id": inst_id,
        "session_id": inst.get("sessionId") or (f"app{app_id}instance{inst_id}" if inst_id else ""),
        "keyhole_url": inst.get("webKeyholeTrackUrl", ""),
        "metrics_url": inst.get("metricsUrl", ""),
    }
    if inst_id:
        _instance_cache[app_id] = info
    return info


# ──── Keyhole helpers ────

def _load_keyhole_cookies() -> Dict[str, str]:
    merged: Dict[str, str] = {}
    for domain in KEYHOLE_DOMAINS:
        result = get_auth(domain)
        merged.update(result.cookies)
    return merged


def _parse_keyhole_params(keyhole_url: str) -> Dict[str, str]:
    parsed = urlparse(keyhole_url)
    qs = parse_qs(parsed.query)
    return {k: v[0] for k, v in qs.items()}


def _keyhole_get(path: str, app_id: int) -> Any:
    """通过 Keyhole 代理调用 Flink REST API。"""
    info = _get_instance_info(app_id)
    kurl = info.get("keyhole_url", "")
    if not kurl:
        raise RuntimeError(f"应用 {app_id} 无 Keyhole URL（无运行实例或非 YARN 部署）")

    params = _parse_keyhole_params(kurl)
    cookies = _load_keyhole_cookies()
    headers = {**HEADERS, "referer": kurl}

    resp = http_requests.get(
        KEYHOLE_BASE + path,
        params=params,
        cookies=cookies,
        headers=headers,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _resolve_flink_jid(app_id: int) -> str:
    """通过 Keyhole 获取 Flink Job ID。"""
    data = _keyhole_get("/jobs/overview", app_id)
    jobs = data.get("jobs", data) if isinstance(data, dict) else data
    if not jobs:
        raise RuntimeError(f"应用 {app_id} 无 Flink Job")
    running = [j for j in jobs if j.get("state") == "RUNNING"]
    target = running[0] if running else jobs[0]
    return target["jid"]


# ──── Grafana helpers ────

def _load_grafana_cookies() -> Dict[str, str]:
    return get_auth(GRAFANA_DOMAIN).cookies


def _resolve_grafana_ds_uid() -> str:
    global _grafana_ds_uid
    if _grafana_ds_uid:
        return _grafana_ds_uid

    cookies = _load_grafana_cookies()
    r = http_requests.get(
        f"{GRAFANA_BASE}/api/frontend/settings",
        cookies=cookies,
        headers=HEADERS,
        timeout=15,
    )
    r.raise_for_status()
    ds_map = r.json().get("datasources", {})
    ds = ds_map.get(GRAFANA_DS_NAME, {})
    _grafana_ds_uid = ds.get("uid")
    if not _grafana_ds_uid:
        raise RuntimeError(
            f"Grafana 数据源 '{GRAFANA_DS_NAME}' 未找到。"
            f"可用数据源({len(ds_map)}): {', '.join(list(ds_map.keys())[:10])}..."
        )
    return _grafana_ds_uid


def _grafana_query_batch(
    exprs: Dict[str, str],
    range_seconds: int = 1800,
    instant: bool = False,
) -> Dict[str, Any]:
    """批量查询 Grafana 指标，返回 {refId: {current, avg, max, min, points}} 格式。"""
    ds_uid = _resolve_grafana_ds_uid()
    cookies = _load_grafana_cookies()
    now = int(time.time())

    queries = []
    for ref_id, expr in exprs.items():
        q: Dict[str, Any] = {
            "refId": ref_id,
            "expr": expr,
            "datasource": {"type": "prometheus", "uid": ds_uid},
        }
        if instant:
            q["instant"] = True
            q["range"] = False
        else:
            q["range"] = True
            q["instant"] = False
            q["intervalMs"] = max(range_seconds * 1000 // 60, 15000)
            q["maxDataPoints"] = 60
        queries.append(q)

    payload = {
        "queries": queries,
        "from": str((now - range_seconds) * 1000),
        "to": str(now * 1000),
    }
    headers = {**HEADERS, "content-type": "application/json"}
    r = http_requests.post(
        f"{GRAFANA_BASE}/api/ds/query",
        cookies=cookies,
        headers=headers,
        json=payload,
        timeout=30,
    )
    r.raise_for_status()
    raw = r.json()

    parsed: Dict[str, Any] = {}
    for ref_id, result in raw.get("results", {}).items():
        frames = result.get("frames", [])
        if not frames:
            parsed[ref_id] = None
            continue

        if instant:
            vals = frames[0].get("data", {}).get("values", [])
            parsed[ref_id] = vals[1][-1] if len(vals) >= 2 and vals[1] else None
        else:
            vals = frames[0].get("data", {}).get("values", [])
            if len(vals) < 2 or not vals[1]:
                parsed[ref_id] = None
                continue
            numbers = [v for v in vals[1] if v is not None]
            if not numbers:
                parsed[ref_id] = None
                continue
            parsed[ref_id] = {
                "current": numbers[-1],
                "avg": round(sum(numbers) / len(numbers), 4),
                "max": max(numbers),
                "min": min(numbers),
                "points": len(numbers),
            }

    return parsed


# ═══════════════════════════════════════════════════════════════════
# Phase 4: Flink Runtime 工具（Keyhole / Flink REST API）
# ═══════════════════════════════════════════════════════════════════


@mcp.tool()
def get_flink_checkpoints(app_id: int) -> str:
    """获取 Flink 任务的 Checkpoint 详细统计（来自 Flink REST API）。

    比 DataSuite API 更详细：包含每次 Checkpoint 的耗时、大小、失败原因、
    触发类型、Savepoint 状态，以及 Checkpoint 配置（间隔、超时、状态后端）。

    Args:
        app_id: 应用 ID（如 741498）

    Returns:
        Checkpoint 统计：完成/失败次数、最近成功/失败详情、历史记录、配置参数
    """
    try:
        jid = _resolve_flink_jid(app_id)

        cp_data = _keyhole_get(f"/jobs/{jid}/checkpoints", app_id)

        result: Dict[str, Any] = {"appId": app_id, "jobId": jid}

        counts = cp_data.get("counts", {})
        result["counts"] = counts

        summary = cp_data.get("summary", {})
        if summary:
            result["summary"] = {
                "checkpointed_size": summary.get("checkpointed_size", {}),
                "state_size": summary.get("state_size", {}),
                "end_to_end_duration": summary.get("end_to_end_duration", {}),
            }

        latest = cp_data.get("latest", {})
        if latest.get("completed"):
            lc = latest["completed"]
            result["latestCompleted"] = {
                "id": lc.get("id"),
                "trigger_timestamp": _format_ts(lc.get("trigger_timestamp")),
                "duration": lc.get("end_to_end_duration"),
                "checkpointed_size": lc.get("checkpointed_size"),
                "state_size": lc.get("state_size"),
                "checkpoint_type": lc.get("checkpoint_type"),
                "is_savepoint": lc.get("is_savepoint"),
            }
        if latest.get("failed"):
            lf = latest["failed"]
            result["latestFailed"] = {
                "id": lf.get("id"),
                "trigger_timestamp": _format_ts(lf.get("trigger_timestamp")),
                "failure_message": lf.get("failure_message"),
                "failure_timestamp": _format_ts(lf.get("failure_timestamp")),
            }
        if latest.get("savepoint"):
            ls = latest["savepoint"]
            result["latestSavepoint"] = {
                "id": ls.get("id"),
                "trigger_timestamp": _format_ts(ls.get("trigger_timestamp")),
                "status": ls.get("status"),
            }

        history = cp_data.get("history", [])
        result["recentHistory"] = [
            {
                "id": h.get("id"),
                "status": h.get("status"),
                "trigger_timestamp": _format_ts(h.get("trigger_timestamp")),
                "duration": h.get("end_to_end_duration"),
                "size": h.get("checkpointed_size"),
                "is_savepoint": h.get("is_savepoint"),
                "failure_message": h.get("failure_message"),
            }
            for h in history[:10]
        ]

        try:
            cp_config = _keyhole_get(f"/jobs/{jid}/checkpoints/config", app_id)
            result["config"] = {
                "mode": cp_config.get("mode"),
                "interval": cp_config.get("interval"),
                "timeout": cp_config.get("timeout"),
                "min_pause": cp_config.get("min_pause"),
                "max_concurrent": cp_config.get("max_concurrent"),
                "externalization": cp_config.get("externalization"),
                "state_backend": cp_config.get("state_backend"),
                "checkpoint_storage": cp_config.get("checkpoint_storage"),
                "unaligned_checkpoints": cp_config.get("unaligned_checkpoints"),
            }
        except Exception as e:
            result["config"] = {"error": str(e)}

        return _result(result)
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def get_flink_job_config(app_id: int) -> str:
    """获取 Flink 任务的运行时配置（来自 Flink REST API）。

    包含执行参数（并行度、重启策略等）和所有用户自定义配置。

    Args:
        app_id: 应用 ID

    Returns:
        运行时配置：并行度、重启策略、Checkpoint 配置、用户自定义参数等
    """
    try:
        jid = _resolve_flink_jid(app_id)

        config = _keyhole_get(f"/jobs/{jid}/config", app_id)

        execution_config = config.get("execution-config", {})
        result = {
            "appId": app_id,
            "jobId": jid,
            "name": config.get("name"),
            "jid": config.get("jid"),
            "executionConfig": {
                "execution_mode": execution_config.get("execution-mode"),
                "restart_strategy": execution_config.get("restart-strategy"),
                "parallelism": execution_config.get("job-parallelism"),
                "object_reuse": execution_config.get("object-reuse-mode"),
            },
        }

        user_config = execution_config.get("user-config", {})
        key_configs: Dict[str, str] = {}
        other_configs: Dict[str, str] = {}
        important_prefixes = (
            "state.", "execution.checkpointing.", "restart-strategy.",
            "parallelism.", "taskmanager.", "jobmanager.",
            "table.", "pipeline.", "flink.hadoop.",
        )
        for k, v in user_config.items():
            if any(k.startswith(p) for p in important_prefixes):
                key_configs[k] = v
            else:
                other_configs[k] = v

        result["keyConfigs"] = key_configs
        result["otherConfigCount"] = len(other_configs)
        if len(other_configs) <= 20:
            result["otherConfigs"] = other_configs

        return _result(result)
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def get_flink_runtime_exceptions(app_id: int, max_exceptions: int = 20) -> str:
    """获取 Flink 任务的完整异常堆栈（来自 Flink REST API）。

    比 DataSuite 的异常列表更详细，包含完整的 Java 堆栈跟踪和异常发生的
    TaskManager/Task 位置。

    Args:
        app_id: 应用 ID
        max_exceptions: 最大返回异常数，默认 20

    Returns:
        根异常和所有异常列表（含完整堆栈、Task 名称、TaskManager 位置）
    """
    try:
        jid = _resolve_flink_jid(app_id)

        data = _keyhole_get(
            f"/jobs/{jid}/exceptions?maxExceptions={max_exceptions}", app_id
        )

        result: Dict[str, Any] = {"appId": app_id, "jobId": jid}

        root = data.get("root-exception")
        if root:
            lines = root.strip().split("\n")
            result["rootException"] = {
                "message": lines[0] if lines else root[:200],
                "fullStackTrace": root[:3000],
                "truncated": len(root) > 3000,
            }

        all_exc = data.get("all-exceptions", [])
        result["exceptions"] = [
            {
                "exception": exc.get("exception", "")[:1000],
                "task": exc.get("task"),
                "location": exc.get("location"),
                "timestamp": _format_ts(exc.get("timestamp")),
            }
            for exc in all_exc[:max_exceptions]
        ]
        result["totalExceptions"] = len(all_exc)
        result["truncated"] = data.get("truncated", False)

        return _result(result)
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def get_flink_taskmanagers(app_id: int) -> str:
    """获取 Flink 任务的 TaskManager 列表和资源详情（来自 Flink REST API）。

    Args:
        app_id: 应用 ID

    Returns:
        TaskManager 列表：ID、路径、Slot 数量/空闲、CPU/内存/磁盘等硬件信息
    """
    try:
        data = _keyhole_get("/taskmanagers", app_id)
        tms = data.get("taskmanagers", [])

        result_tms = []
        for tm in tms:
            hw = tm.get("hardware", {})
            result_tms.append({
                "id": tm.get("id"),
                "path": tm.get("path"),
                "dataPort": tm.get("dataPort"),
                "slotsNumber": tm.get("slotsNumber"),
                "freeSlots": tm.get("freeSlots"),
                "totalResource": tm.get("totalResource"),
                "freeResource": tm.get("freeResource"),
                "hardware": {
                    "cpuCores": hw.get("cpuCores"),
                    "physicalMemory_MB": round(hw.get("physicalMemory", 0) / 1024 / 1024)
                    if hw.get("physicalMemory")
                    else None,
                    "freeMemory_MB": round(hw.get("freeMemory", 0) / 1024 / 1024)
                    if hw.get("freeMemory")
                    else None,
                    "managedMemory_MB": round(hw.get("managedMemory", 0) / 1024 / 1024)
                    if hw.get("managedMemory")
                    else None,
                },
            })

        return _result({
            "appId": app_id,
            "taskmanagerCount": len(result_tms),
            "taskmanagers": result_tms,
        })
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def get_flink_vertices(app_id: int) -> str:
    """获取 Flink 作业的算子拓扑（Vertices），包含各算子的并行度和运行状态。

    Args:
        app_id: 应用 ID

    Returns:
        作业状态和算子列表（名称、并行度、状态、时间戳）
    """
    try:
        jid = _resolve_flink_jid(app_id)
        data = _keyhole_get(f"/jobs/{jid}", app_id)

        vertices = data.get("vertices", [])
        result_vertices = []
        for v in vertices:
            result_vertices.append({
                "id": v.get("id"),
                "name": v.get("name"),
                "parallelism": v.get("parallelism"),
                "maxParallelism": v.get("maxParallelism"),
                "status": v.get("status"),
                "start_time": _format_ts(v.get("start-time")),
                "duration": v.get("duration"),
                "tasks": v.get("tasks"),
                "metrics": v.get("metrics"),
            })

        return _result({
            "appId": app_id,
            "jobId": jid,
            "jobName": data.get("name"),
            "state": data.get("state"),
            "start_time": _format_ts(data.get("start-time")),
            "duration": data.get("duration"),
            "vertexCount": len(result_vertices),
            "vertices": result_vertices,
        })
    except Exception as e:
        return _result({"error": str(e)})


# ═══════════════════════════════════════════════════════════════════
# Phase 5: Flink 实时指标（Grafana / VictoriaMetrics）
# ═══════════════════════════════════════════════════════════════════

_METRIC_CATEGORIES = {
    "overview": {
        "name": "任务概览",
        "instant": True,
        "metrics": {
            "uptime_ms": ("flink_jobmanager_job_uptime", "运行时间（毫秒）"),
            "full_restarts": ("flink_jobmanager_job_fullRestarts", "完全重启次数"),
            "completed_checkpoints": ("flink_jobmanager_job_numberOfCompletedCheckpoints", "已完成 Checkpoint 数"),
            "failed_checkpoints": ("flink_jobmanager_job_numberOfFailedCheckpoints", "失败 Checkpoint 数"),
            "last_cp_duration_ms": ("flink_jobmanager_job_lastCheckpointDuration", "最近 CP 耗时（毫秒）"),
            "last_cp_size_bytes": ("flink_jobmanager_job_lastCheckpointSize", "最近 CP 大小（字节）"),
        },
    },
    "kafka": {
        "name": "Kafka 消费指标",
        "instant": False,
        "metrics": {
            "lag_max_sum": (
                "sum(flink_taskmanager_job_task_operator_KafkaConsumer_records_lag_max{__FILTER__} >= 0)",
                "Kafka Lag Max 总计",
            ),
            "lag_sum": (
                "sum(flink_taskmanager_job_task_operator_KafkaConsumer_records_lag{__FILTER__} >= 0)",
                "Kafka Lag 总计",
            ),
            "consume_rate": (
                "sum(rate(flink_taskmanager_job_task_operator_KafkaConsumer_records_consumed_total{__FILTER__}[1m]))",
                "消费速率（records/s）",
            ),
            "fetch_throttle": (
                "sum(flink_taskmanager_job_task_operator_KafkaConsumer_throttle_time_total{__FILTER__})",
                "Fetch 限流时间",
            ),
        },
    },
    "cpu_memory": {
        "name": "CPU / 内存指标",
        "instant": False,
        "metrics": {
            "tm_avg_cpu": (
                "avg(flink_taskmanager_Status_JVM_CPU_Load{__FILTER__})",
                "TM 平均 CPU 使用率",
            ),
            "tm_max_cpu": (
                "max(flink_taskmanager_Status_JVM_CPU_Load{__FILTER__})",
                "TM 最大 CPU 使用率",
            ),
            "tm_avg_heap_pct": (
                "avg(flink_taskmanager_Status_JVM_Memory_Heap_Used{__FILTER__} / flink_taskmanager_Status_JVM_Memory_Heap_Max{__FILTER__})",
                "TM 平均 Heap 使用率",
            ),
            "tm_max_heap_pct": (
                "max(flink_taskmanager_Status_JVM_Memory_Heap_Used{__FILTER__} / flink_taskmanager_Status_JVM_Memory_Heap_Max{__FILTER__})",
                "TM 最大 Heap 使用率",
            ),
            "jm_cpu": (
                "flink_jobmanager_Status_JVM_CPU_Load{__FILTER__}",
                "JM CPU 使用率",
            ),
            "jm_heap_pct": (
                "flink_jobmanager_Status_JVM_Memory_Heap_Used{__FILTER__} / flink_jobmanager_Status_JVM_Memory_Heap_Max{__FILTER__}",
                "JM Heap 使用率",
            ),
        },
    },
    "checkpoint": {
        "name": "Checkpoint 指标趋势",
        "instant": False,
        "metrics": {
            "failed_count": (
                "flink_jobmanager_job_numberOfFailedCheckpoints{__FILTER__}",
                "失败 CP 累计数",
            ),
            "duration": (
                "flink_jobmanager_job_lastCheckpointDuration{__FILTER__}",
                "最近 CP 耗时（毫秒）",
            ),
            "size": (
                "flink_jobmanager_job_lastCheckpointSize{__FILTER__}",
                "最近 CP 大小（字节）",
            ),
        },
    },
    "backpressure": {
        "name": "背压 / 繁忙度指标",
        "instant": False,
        "metrics": {
            "max_backpressure": (
                "max(flink_taskmanager_job_task_backPressuredTimeMsPerSecond{__FILTER__})",
                "最大背压（ms/s，1000=完全阻塞）",
            ),
            "max_busy": (
                "max(flink_taskmanager_job_task_busyTimeMsPerSecond{__FILTER__})",
                "最大繁忙度（ms/s，1000=满负载）",
            ),
            "avg_backpressure": (
                "avg(flink_taskmanager_job_task_backPressuredTimeMsPerSecond{__FILTER__})",
                "平均背压",
            ),
            "avg_busy": (
                "avg(flink_taskmanager_job_task_busyTimeMsPerSecond{__FILTER__})",
                "平均繁忙度",
            ),
        },
    },
    "gc": {
        "name": "GC 指标",
        "instant": False,
        "metrics": {
            "tm_old_gc_count_rate": (
                'avg(rate({__name__=~"flink_taskmanager_Status_JVM_GarbageCollector_(G1_Old_Generation|PS_MarkSweep|ConcurrentMarkSweep)_Count",__FILTER__}[1m]))',
                "TM Old GC 次数/分钟",
            ),
            "tm_old_gc_time_rate": (
                'avg(rate({__name__=~"flink_taskmanager_Status_JVM_GarbageCollector_(G1_Old_Generation|PS_MarkSweep|ConcurrentMarkSweep)_Time",__FILTER__}[1m]))',
                "TM Old GC 时间/分钟（毫秒）",
            ),
            "tm_young_gc_count_rate": (
                'avg(rate({__name__=~"flink_taskmanager_Status_JVM_GarbageCollector_(G1_Young_Generation|PS_Scavenge|Copy|ParNew)_Count",__FILTER__}[1m]))',
                "TM Young GC 次数/分钟",
            ),
            "tm_young_gc_time_rate": (
                'avg(rate({__name__=~"flink_taskmanager_Status_JVM_GarbageCollector_(G1_Young_Generation|PS_Scavenge|Copy|ParNew)_Time",__FILTER__}[1m]))',
                "TM Young GC 时间/分钟（毫秒）",
            ),
        },
    },
}


@mcp.tool()
def get_flink_metrics(
    app_id: int,
    category: str = "overview",
    minutes: int = 30,
) -> str:
    """查询 Flink 任务的实时监控指标（来自 Grafana / VictoriaMetrics）。

    支持 6 个指标类别，覆盖 Kafka 消费、CPU/内存、Checkpoint、背压、GC 等维度。
    每个类别返回当前值 + 趋势摘要（均值/最大/最小）。

    Args:
        app_id: 应用 ID
        category: 指标类别，可选值：
            - overview: 概览（运行时间、重启次数、Checkpoint 汇总）
            - kafka: Kafka 消费指标（Lag、消费速率、Fetch 限流）
            - cpu_memory: CPU 和内存（TM/JM 的 CPU、Heap 使用率）
            - checkpoint: Checkpoint 趋势（失败数、耗时、大小的变化）
            - backpressure: 背压和繁忙度（最大/平均值）
            - gc: GC 指标（Old/Young GC 频率和耗时）
        minutes: 回看时长（分钟），默认 30，仅对非 overview 类别生效

    Returns:
        各指标的当前值和趋势摘要。对于 overview 返回瞬时值，其他类别返回趋势统计。
        附带 Grafana Dashboard 链接供进一步查看。
    """
    try:
        cat = _METRIC_CATEGORIES.get(category)
        if not cat:
            return _result({
                "error": f"未知类别: {category}",
                "available": list(_METRIC_CATEGORIES.keys()),
                "descriptions": {k: v["name"] for k, v in _METRIC_CATEGORIES.items()},
            })

        info = _get_instance_info(app_id)
        session_id = info.get("session_id")
        if not session_id:
            return _result({"error": f"应用 {app_id} 无运行实例，无法查询 Grafana 指标"})

        job_filter = f'job=~".*(flink_metrics|pushgateway_flink)",session_id="{session_id}"'

        exprs: Dict[str, str] = {}
        labels: Dict[str, str] = {}
        for key, (expr_tpl, label) in cat["metrics"].items():
            expr = expr_tpl.replace("__FILTER__", job_filter)
            if "{__FILTER__}" not in expr_tpl and "__FILTER__" not in expr:
                expr = expr_tpl + "{" + job_filter + "}" if "{" not in expr_tpl else expr
            exprs[key] = expr
            labels[key] = label

        data = _grafana_query_batch(
            exprs,
            range_seconds=minutes * 60,
            instant=cat.get("instant", False),
        )

        metrics_out: Dict[str, Any] = {}
        for key in cat["metrics"]:
            val = data.get(key)
            metrics_out[key] = {
                "label": labels[key],
                "data": val,
            }

        grafana_url = (
            f"{GRAFANA_BASE}/d/pDjovynVc/flink-job-general-support-local"
            f"?var-application_id={session_id}&var-datasource={GRAFANA_DS_NAME}"
        )

        return _result({
            "appId": app_id,
            "sessionId": session_id,
            "category": category,
            "categoryName": cat["name"],
            "timeRange": "瞬时值" if cat.get("instant") else f"最近 {minutes} 分钟",
            "metrics": metrics_out,
            "grafanaUrl": grafana_url,
        })
    except Exception as e:
        return _result({"error": str(e)})


@mcp.tool()
def get_flink_grafana_custom(
    app_id: int,
    promql: str,
    minutes: int = 30,
    instant: bool = False,
) -> str:
    """执行自定义 PromQL 查询 Flink 监控指标（高级用法）。

    适用于需要查询特定指标或自定义聚合的场景。会自动注入 session_id 过滤。
    PromQL 中使用 __FILTER__ 占位符会被替换为 job + session_id 过滤条件。

    Args:
        app_id: 应用 ID
        promql: PromQL 表达式，可使用 __FILTER__ 占位符
        minutes: 回看时长（分钟），默认 30
        instant: 是否瞬时查询（默认 False 为范围查询）

    Returns:
        查询结果（当前值或趋势摘要）
    """
    try:
        info = _get_instance_info(app_id)
        session_id = info.get("session_id")
        if not session_id:
            return _result({"error": f"应用 {app_id} 无运行实例"})

        job_filter = f'job=~".*(flink_metrics|pushgateway_flink)",session_id="{session_id}"'
        expr = promql.replace("__FILTER__", job_filter)

        data = _grafana_query_batch(
            {"result": expr},
            range_seconds=minutes * 60,
            instant=instant,
        )

        return _result({
            "appId": app_id,
            "sessionId": session_id,
            "query": expr,
            "instant": instant,
            "timeRange": "瞬时值" if instant else f"最近 {minutes} 分钟",
            "result": data.get("result"),
        })
    except Exception as e:
        return _result({"error": str(e)})


# ──────────────────────────── 入口 ────────────────────────────


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()

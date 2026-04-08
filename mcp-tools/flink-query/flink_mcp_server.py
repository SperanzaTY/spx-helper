#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Flink MCP Server
DataSuite Flink 平台查询与诊断工具，支持流/批任务状态、延迟监控、异常诊断、血缘查询等。
认证方式：自动从 Chrome 读取 datasuite.shopee.io 的 Cookie。
"""

import json
import logging
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import requests as http_requests
from chrome_auth import get_auth
from chrome_auth.diagnostic import cookie_diagnostic as _cookie_diagnostic
from mcp.server.fastmcp import FastMCP

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ──────────────────────────── Cookie 管理 ────────────────────────────

DOMAIN = "datasuite.shopee.io"


def _load_cookies(force: bool = False) -> Dict[str, str]:
    result = get_auth(DOMAIN, force=force)
    if result.ok:
        logger.info(f"[Auth] Flink cookies via {result.source} ({len(result.cookies)} cookies)")
    return result.cookies


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
                    cookies = _load_cookies(force=True)
                    if "CSRF-TOKEN" in cookies:
                        headers["x-csrf-token"] = cookies["CSRF-TOKEN"]
                    continue
                diag = _cookie_diagnostic(cookies)
                raise RuntimeError(
                    f"请求 {path} 失败: {resp.status_code}\n"
                    f"Cookie 诊断:\n{diag}"
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


def _format_ts(ts: Optional[int]) -> str:
    """将毫秒时间戳格式化为可读字符串。"""
    if not ts:
        return ""
    try:
        return datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, OSError):
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
    """一键诊断 Flink 应用：聚合延迟趋势、异常、告警、资源，输出优化建议。

    适用于收到告警后快速排查问题根因。自动调用多个 API 并综合分析。

    Args:
        app_id: 应用 ID
        minutes: 回看时长（分钟），默认 60

    Returns:
        综合诊断报告：应用概况、延迟分析、异常摘要、告警记录、资源状况、优化建议
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
            diagnosis["instance"] = {
                "id": inst.get("id"),
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
            diagnosis["suggestions"] = suggestions
            diagnosis["summary"] = f"检测到 {len(issues)} 个问题，请关注"

        return _result(diagnosis)
    except Exception as e:
        return _result({"error": str(e)})


# ═══════════════════════════════════════════════════════════════════
# Phase 3: 扩展工具（血缘、操作日志、SLA/DR）
# ═══════════════════════════════════════════════════════════════════


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


# ──────────────────────────── 入口 ────────────────────────────


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()

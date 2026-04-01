#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scheduler MCP Server
DataSuite Scheduler 平台信息查询工具，支持任务状态、实例列表、血缘、运行日志等。
认证方式：自动从 Chrome 读取 datasuite.shopee.io 的 Cookie。
"""

import json
import os
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List

import requests
import browser_cookie3
from mcp.server.fastmcp import FastMCP

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ──────────────────────────── Cookie 管理 ────────────────────────────

DOMAIN = "datasuite.shopee.io"
_cookie_cache: Dict[str, str] = {}
_cookie_ts: float = 0
COOKIE_TTL = 1800  # 30 min


def _load_cookies(force: bool = False) -> Dict[str, str]:
    global _cookie_cache, _cookie_ts
    if not force and _cookie_cache and (time.time() - _cookie_ts < COOKIE_TTL):
        return _cookie_cache
    try:
        cj = browser_cookie3.chrome(domain_name=DOMAIN)
        cookies = {}
        for c in cj:
            if c.domain in (DOMAIN, f".{DOMAIN}"):
                cookies[c.name] = c.value
        if cookies:
            _cookie_cache = cookies
            _cookie_ts = time.time()
            logger.info(f"从 Chrome 加载了 {len(cookies)} 个 cookie")
        else:
            logger.warning("Chrome 中未找到 datasuite cookie，请先在浏览器登录 DataSuite")
    except Exception as e:
        logger.error(f"读取 Chrome cookie 失败: {e}")
    return _cookie_cache


# ──────────────────────────── HTTP 客户端 ────────────────────────────

BASE_URL = f"https://{DOMAIN}"

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
    """发起 HTTP 请求，自动带 Cookie 和重试。"""
    url = BASE_URL + path
    cookies = _load_cookies()
    headers = HEADERS.copy()
    headers["referer"] = f"{BASE_URL}/scheduler"
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
            if resp.status_code in (401, 403) and attempt < MAX_RETRIES:
                logger.warning(f"{resp.status_code} 重试中，刷新 cookie...")
                cookies = _load_cookies(force=True)
                if "CSRF-TOKEN" in cookies:
                    headers["x-csrf-token"] = cookies["CSRF-TOKEN"]
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            if attempt < MAX_RETRIES:
                time.sleep(1)
                continue
            raise RuntimeError(f"请求 {path} 失败: {e}") from e
    return {}


# ──────────────────────────── 辅助函数 ────────────────────────────

INSTANCE_STATUS_MAP = {
    0: "No Status",
    1: "Waiting (for event)",
    10: "Waiting (for input dependency)",
    11: "Waiting (for scheduling)",
    12: "Waiting (for resource)",
    20: "Running",
    30: "Successful",
    40: "Failed",
    41: "Failed (Timeout)",
    50: "Skipped",
    60: "Killed",
    70: "Frozen",
}


def _fmt_ts(ts_ms) -> str:
    if not ts_ms:
        return "-"
    if isinstance(ts_ms, str):
        return ts_ms
    try:
        return datetime.fromtimestamp(ts_ms / 1000).strftime("%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError, OSError):
        return str(ts_ms)


def _fmt_duration(seconds: Optional[int]) -> str:
    if not seconds and seconds != 0:
        return "-"
    h, m = divmod(seconds, 3600)
    m, s = divmod(m, 60)
    parts = []
    if h:
        parts.append(f"{h}h")
    if m:
        parts.append(f"{m}m")
    parts.append(f"{s}s")
    return "".join(parts)


def _resolve_task_code(task_name: str, project_code: str) -> str:
    """支持用户传 taskCode 或纯任务名（自动补前缀）。"""
    if "." in task_name:
        return task_name
    return f"{project_code}.{task_name}"


# ──────────────────────────── MCP Tools ────────────────────────────

mcp = FastMCP("Scheduler MCP Server")


@mcp.tool()
def get_task_info(task_code: str) -> str:
    """
    获取 Scheduler 任务的基本信息。

    返回任务名称、类型、调度周期、负责人、上下游依赖等详细配置。

    参数:
        task_code: 任务编码，如 "spx_mart.studio_10429983"
                   也可以只传任务名如 "studio_10429983"（需配合 project_code 前缀推断）

    示例:
        get_task_info("spx_mart.studio_10429983")
    """
    try:
        data = _request("GET", "/scheduler/api/v1/task/get", params={"taskCode": task_code})
        task = data.get("data", {})
        if not task:
            return json.dumps({"error": f"未找到任务: {task_code}"}, ensure_ascii=False)

        schedule_period_map = {1: "Hourly", 2: "Daily", 3: "Weekly", 4: "Monthly", 5: "Yearly"}
        period_type = task.get("taskPeriodType") or task.get("schedulePeriod")

        result = {
            "task_code": task.get("taskCode"),
            "task_name": task.get("taskName"),
            "task_type": task.get("taskTypeName") or task.get("taskExeType"),
            "source": task.get("taskSource"),
            "priority": task.get("priority") or task.get("finalPriority"),
            "schedule_period": task.get("schedulePeriodName") or schedule_period_map.get(period_type, period_type),
            "schedule_time": task.get("schedulerTime") or task.get("scheduleTime"),
            "owner": task.get("owner"),
            "project_code": task.get("projectCode"),
            "workflow_code": task.get("workflowCode"),
            "workflow_name": task.get("workflowName"),
            "status": "frozen" if task.get("freeze") else "active",
            "create_time": _fmt_ts(task.get("createTime")),
            "update_time": _fmt_ts(task.get("updateTime")),
            "input_markers": task.get("inputMarker", []),
            "output_markers": task.get("outputMarker", []),
            "timeout_minutes": task.get("timeout"),
            "retry_times": task.get("retryTimes"),
            "retry_interval_seconds": task.get("retryInterval"),
            "queue": task.get("queue") or task.get("yarnQueueName"),
            "hadoop_account": task.get("hadoopAccount"),
            "description": task.get("description"),
            "scheduler_url": f"https://datasuite.shopee.io/scheduler/task/{task.get('taskCode')}/detail",
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_task_instances(
    task_code: str,
    days: int = 7,
    page_size: int = 20,
    biz_time_start: str = "",
) -> str:
    """
    查询任务的运行实例列表（最近 N 天）。

    返回每个实例的状态、业务时间、开始/结束时间、耗时等。

    参数:
        task_code: 任务编码，如 "spx_mart.studio_10429983"
        days: 查询最近多少天，默认 7 天
        biz_time_start: 业务时间起点，格式 "YYYY-MM-DD"，不传则自动取 N 天前
        page_size: 返回条数，默认 20

    示例:
        get_task_instances("spx_mart.studio_10429983", days=14)
    """
    try:
        if not biz_time_start:
            start = datetime.now() - timedelta(days=days)
            biz_time_start = start.strftime("%Y-%m-%d 00:00:00")
        elif len(biz_time_start) == 10:
            biz_time_start += " 00:00:00"

        params = {
            "type": "web",
            "search": 1,
            "taskCode": task_code,
            "projectExclusive": "false",
            "pageNo": 1,
            "pageSize": page_size,
            "bizTimeStart": biz_time_start,
            "bizTimeOrder": "desc",
        }
        data = _request("GET", "/scheduler/api/v1/taskInstance/getList", params=params)
        raw_list = data.get("data", {}).get("list", [])
        total = data.get("data", {}).get("total", 0)

        instances = []
        for inst in raw_list:
            status_code = inst.get("instanceStatus", 0)
            start_ts = inst.get("startRunTime")
            end_ts = inst.get("endRunTime")

            codex_summary = inst.get("codexSummary", "")

            entry = {
                "instance_code": inst.get("taskInstanceCode"),
                "biz_time": _fmt_ts(inst.get("bizTime")),
                "status": INSTANCE_STATUS_MAP.get(status_code, f"Unknown({status_code})"),
                "status_code": status_code,
                "task_name": inst.get("taskName"),
                "owner": inst.get("owner"),
                "start_time": _fmt_ts(start_ts),
                "end_time": _fmt_ts(end_ts),
                "create_time": _fmt_ts(inst.get("createTime")),
                "retry_seq": inst.get("retrySeq", 0),
                "retry_times": inst.get("retryTimes", 0),
                "rerun_seq": inst.get("rerunSeq", 0),
                "worker_host": inst.get("workerHost"),
                "yarn_app": inst.get("yarnApplicationId"),
                "yarn_queue": inst.get("yarnQueueName"),
                "actual_memory_mb": inst.get("actualMemory"),
                "cpu_time_s": inst.get("cpuTime"),
                "codex": codex_summary or None,
            }

            if status_code >= 40:
                msg = inst.get("message") or ""
                if msg:
                    entry["error_message"] = msg[:1000]

                extra = inst.get("extraConfig") or {}
                config_str = extra.get("config", "")
                if config_str:
                    spark_conf = {}
                    for part in config_str.replace("\\n", "\n").split("\n"):
                        part = part.strip().lstrip("-").strip()
                        if part.startswith("spark.") and " " not in part.split("=")[0] if "=" in part else False:
                            continue
                        for key in [
                            "spark.driver.memory", "spark.executor.memory",
                            "spark.executor.memoryOverhead", "spark.executor.cores",
                            "spark.dynamicAllocation.maxExecutors",
                            "spark.dynamicAllocation.minExecutors",
                            "spark.kryoserializer.buffer.max",
                            "spark.driver.maxResultSize",
                            "spark.shuffle.partitions",
                            "spark.default.parallelism",
                        ]:
                            if key in part:
                                val = part.split(key)[-1].strip().lstrip("=").strip()
                                if not val:
                                    tokens = part.split()
                                    idx = next((i for i, t in enumerate(tokens) if key in t), -1)
                                    if idx >= 0 and idx + 1 < len(tokens):
                                        val = tokens[idx + 1]
                                spark_conf[key] = val
                    if spark_conf:
                        entry["spark_config"] = spark_conf

            instances.append(entry)

        result = {
            "task_code": task_code,
            "total": total,
            "returned": len(instances),
            "biz_time_start": biz_time_start,
            "instances": instances,
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_task_metric_summary(task_code: str) -> str:
    """
    获取任务的性能指标摘要。

    返回最近 10 次执行的平均耗时、等待时间、执行时间、CPU 时间、内存利用率、估算月成本等。

    参数:
        task_code: 任务编码

    示例:
        get_task_metric_summary("spx_mart.studio_10429983")
    """
    try:
        data = _request("GET", "/scheduler/api/v1/task/metricSummary",
                        params={"taskCode": task_code})
        summary = data.get("data", {})
        if not summary:
            return json.dumps({"error": "未获取到指标数据"}, ensure_ascii=False)

        def _ms_to_duration(ms):
            if not ms:
                return "-"
            return _fmt_duration(int(ms / 1000))

        result = {
            "task_code": task_code,
            "avg_elapsed_time": _ms_to_duration(summary.get("last10ExeAvgDuration")),
            "avg_waiting_time": _ms_to_duration(summary.get("last10ExeAvgWaitingTime")),
            "avg_execution_time": _ms_to_duration(summary.get("last10ExeAvgExecutionTime")),
            "avg_cpu_time_sec": round(summary.get("last10ExeAvgCpuTime", 0), 1),
            "avg_memory_utilization_pct": round(summary.get("last10ExeAvgPredictedOverActualMemoryPercentage", 0), 2),
            "est_monthly_cost_usd": round(summary.get("estimatedMonthlyCost", 0), 2),
            "avg_cost_usd": round(summary.get("last10ExeAvgCost", 0), 2),
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_task_lineage(task_code: str) -> str:
    """
    获取任务的上下游血缘关系（依赖链路）。

    返回该任务的上游依赖任务和下游被依赖任务列表。

    参数:
        task_code: 任务编码

    示例:
        get_task_lineage("spx_mart.studio_10429983")
    """
    try:
        data = _request("GET", "/scheduler/api/v1/task/lineageWorkflow",
                        params={"taskCode": task_code})
        lineage = data.get("data", {})
        if not lineage:
            return json.dumps({"error": "未获取到血缘数据"}, ensure_ascii=False)

        nodes = lineage.get("nodes", [])
        edges = lineage.get("edges", [])

        current = None
        upstreams = []
        downstreams = []

        node_map = {}
        for n in nodes:
            code = n.get("taskCode", "")
            node_map[code] = {
                "task_code": code,
                "task_name": n.get("taskName", ""),
                "task_type": n.get("taskTypeName", ""),
                "project_code": n.get("projectCode", ""),
                "status": "frozen" if n.get("freeze") else "active",
                "owner": n.get("owner", ""),
            }
            if code == task_code:
                current = node_map[code]

        for e in edges:
            src = e.get("source", "")
            tgt = e.get("target", "")
            if tgt == task_code and src in node_map:
                upstreams.append(node_map[src])
            elif src == task_code and tgt in node_map:
                downstreams.append(node_map[tgt])

        result = {
            "task_code": task_code,
            "current_task": current,
            "upstream_count": len(upstreams),
            "upstreams": upstreams,
            "downstream_count": len(downstreams),
            "downstreams": downstreams,
            "total_nodes": len(nodes),
            "total_edges": len(edges),
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_task_operation_log(task_code: str, days: int = 30) -> str:
    """
    查询任务的操作日志（谁在什么时候做了什么操作）。

    参数:
        task_code: 任务编码
        days: 查询最近多少天的日志，默认 30 天

    示例:
        get_task_operation_log("spx_mart.studio_10429983", days=7)
    """
    try:
        end = datetime.now()
        start = end - timedelta(days=days)
        params = {
            "bizCode": task_code,
            "startTime": start.strftime("%Y-%m-%d %H:%M:%S"),
            "endTime": end.strftime("%Y-%m-%d %H:%M:%S"),
        }
        data = _request("GET", "/scheduler/api/v1/task/getOperationLog", params=params)
        logs = data.get("data", [])

        entries = []
        for log in logs:
            ext = log.get("extInfo", {}) or {}
            publish_type = ext.get("TASK_PUBLISH_TYPE", "")
            action_msg = log.get("userActionMsg", "")
            if publish_type:
                action_msg = f"{action_msg} ({publish_type})"

            entries.append({
                "time": _fmt_ts(log.get("createTime")),
                "operator": log.get("userAccount", ""),
                "action": action_msg,
                "action_code": log.get("userAction", ""),
            })

        result = {
            "task_code": task_code,
            "period": f"最近 {days} 天",
            "total": len(entries),
            "logs": entries,
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_task_violations(task_code: str, project_code: str = "spx_mart") -> str:
    """
    查询任务的治理违规信息（Governance Violations）。

    参数:
        task_code: 任务编码
        project_code: 项目代码，默认 "spx_mart"

    示例:
        get_task_violations("spx_mart.studio_10429983")
    """
    try:
        params = {"taskCode": task_code, "projectCode": project_code}
        data = _request("GET", "/scheduler/api/v1/task/violations", params=params)
        violations = data.get("data", [])

        entries = []
        for v in violations:
            entries.append({
                "rule": v.get("ruleName", ""),
                "source": v.get("ruleSource", ""),
                "violation_date": v.get("violationDate", ""),
                "description": v.get("description", ""),
            })

        result = {
            "task_code": task_code,
            "total": len(entries),
            "violations": entries,
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def search_tasks(keyword: str, project_code: str = "spx_mart", page_size: int = 20) -> str:
    """
    按关键词搜索 Scheduler 任务。

    可以用任务名、taskCode 的一部分来搜索。

    参数:
        keyword: 搜索关键词（任务名的一部分）
        project_code: 项目代码，默认 "spx_mart"
        page_size: 返回条数，默认 20

    示例:
        search_tasks("fleet_order", "spx_mart")
        search_tasks("dwd_spx_spsso")
    """
    try:
        params = {
            "search": keyword,
            "projectCode": project_code,
            "pageNo": 1,
            "pageSize": page_size,
            "taskType": "",
            "status": "",
        }
        data = _request("GET", "/scheduler/api/v1/task/search", params=params)
        raw_list = data.get("data", {}).get("list", data.get("data", []))

        if isinstance(raw_list, dict):
            raw_list = raw_list.get("list", [])

        tasks = []
        for t in raw_list:
            tasks.append({
                "task_code": t.get("taskCode", ""),
                "task_name": t.get("taskName", ""),
                "task_type": t.get("taskTypeName", ""),
                "owner": t.get("owner", ""),
                "status": "frozen" if t.get("freeze") else "active",
                "schedule_period": t.get("schedulePeriodName", ""),
            })

        result = {
            "keyword": keyword,
            "project_code": project_code,
            "total": len(tasks),
            "tasks": tasks,
        }
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_instance_log(task_instance_code: str) -> str:
    """
    获取某个任务实例的运行日志。

    参数:
        task_instance_code: 实例编码，如 "spx_mart.studio_10429983_20260401_DAY_1"

    示例:
        get_instance_log("spx_mart.studio_10429983_20260401_DAY_1")
    """
    log_apis = [
        ("POST", "/scheduler/api/v1/taskInstance/queryLog", None, {"taskInstanceCode": task_instance_code}),
        ("GET", "/scheduler/api/v1/taskInstance/log", {"taskInstanceCode": task_instance_code}, None),
        ("GET", "/scheduler/api/v1/taskInstance/getLog", {"taskInstanceCode": task_instance_code}, None),
        ("POST", "/scheduler/api/v1/taskInstance/getLog", None, {"taskInstanceCode": task_instance_code}),
    ]

    for method, path, params, body in log_apis:
        try:
            data = _request(method, path, params=params, json_body=body)
            log_data = data.get("data", "")

            if isinstance(log_data, dict):
                log_text = log_data.get("log", log_data.get("content", str(log_data)))
            elif isinstance(log_data, list):
                log_text = "\n".join(str(item) for item in log_data)
            else:
                log_text = str(log_data)

            if not log_text or log_text in ("None", "null", "{}"):
                continue

            if len(log_text) > 8000:
                log_text = log_text[:3000] + "\n\n... [中间省略] ...\n\n" + log_text[-3000:]

            return json.dumps({
                "instance_code": task_instance_code,
                "log_length": len(str(data.get("data", ""))),
                "log": log_text,
            }, ensure_ascii=False, indent=2)
        except Exception:
            continue

    return json.dumps({
        "instance_code": task_instance_code,
        "error": "所有日志 API 路径均不可用，请通过 get_task_instances 查看实例的 error_message 字段获取错误信息",
    }, ensure_ascii=False, indent=2)


def main():
    mcp.run()


if __name__ == "__main__":
    main()

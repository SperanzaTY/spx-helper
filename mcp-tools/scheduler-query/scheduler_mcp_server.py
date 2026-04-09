#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scheduler MCP Server
DataSuite Scheduler 平台信息查询工具，支持任务状态、实例列表、血缘、运行日志等。
认证方式：自动从 Chrome 读取 datasuite.shopee.io 的 Cookie。
"""

import json
import os
import re
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List

import requests
from chrome_auth import get_auth, AuthResult
from chrome_auth.diagnostic import cookie_diagnostic as _cookie_diagnostic
from mcp.server.fastmcp import FastMCP

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ──────────────────────────── Cookie 管理 ────────────────────────────

DOMAIN = "datasuite.shopee.io"
DATA_INFRA_DOMAIN = "data-infra.shopee.io"

_last_auth: Optional[AuthResult] = None


def _load_cookies(force: bool = False, auth_failed: bool = False) -> Dict[str, str]:
    global _last_auth
    result = get_auth(DOMAIN, force=force, auth_failed=auth_failed)
    _last_auth = result
    if result.ok:
        logger.info(f"[Auth] DataSuite cookies via {result.source} ({len(result.cookies)} cookies)")
    return result.cookies


def _diag(cookies: Dict[str, str]) -> str:
    expires_at = _last_auth.expires_at if _last_auth else None
    return _cookie_diagnostic(cookies, expires_at=expires_at)


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


ENV_PATH_MAP = {"staging": "uat"}


def _env_path(path: str, env: str = "") -> str:
    """将 /scheduler/api/v1/xxx 转换为 /scheduler/api/v1/{env}/xxx。
    prod 无前缀；staging 映射为 uat（与 DataSuite 文档一致）。
    """
    if env and env != "prod":
        mapped = ENV_PATH_MAP.get(env, env)
        prefix = "/scheduler/api/v1/"
        if path.startswith(prefix):
            return f"{prefix}{mapped}/{path[len(prefix):]}"
    return path


def _request(method: str, path: str, params: dict = None, json_body: dict = None, env: str = "") -> dict:
    """发起 HTTP 请求，自动带 Cookie 和重试。env 支持 'dev'/'staging' 等非 prod 环境。"""
    path = _env_path(path, env)
    url = BASE_URL + path
    cookies = _load_cookies()
    headers = HEADERS.copy()
    referer_env = f"/{env}" if env and env != "prod" else ""
    headers["referer"] = f"{BASE_URL}/scheduler{referer_env}"
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
                    f"Cookie 诊断: {_diag(cookies)}\n"
                    f"这通常是 Chrome 登录态问题，不是代码 bug。请在 Chrome 中打开 {BASE_URL} 确认已登录。"
                )
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
def get_task_info(task_code: str, env: str = "prod") -> str:
    """
    获取 Scheduler 任务的基本信息。

    返回任务名称、类型、调度周期、负责人、上下游依赖等详细配置。

    参数:
        task_code: 任务编码，如 "spx_mart.studio_10429983"
                   也可以只传任务名如 "studio_10429983"（需配合 project_code 前缀推断）
        env: 环境，"prod"（默认）或 "dev"

    示例:
        get_task_info("spx_mart.studio_10429983")
        get_task_info("brbi_opslgc.studio_10541185", env="dev")
    """
    try:
        data = _request("GET", "/scheduler/api/v1/task/get", params={"taskCode": task_code}, env=env)
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
            "env": env,
            "scheduler_url": f"https://datasuite.shopee.io/scheduler/{env + '/' if env != 'prod' else ''}task/{task.get('taskCode')}/detail",
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
    env: str = "prod",
) -> str:
    """
    查询任务的运行实例列表（最近 N 天）。

    返回每个实例的状态、业务时间、开始/结束时间、耗时等。

    参数:
        task_code: 任务编码，如 "spx_mart.studio_10429983"
        days: 查询最近多少天，默认 7 天
        biz_time_start: 业务时间起点，格式 "YYYY-MM-DD"，不传则自动取 N 天前
        page_size: 返回条数，默认 20
        env: 环境，"prod"（默认）或 "dev"

    示例:
        get_task_instances("spx_mart.studio_10429983", days=14)
        get_task_instances("brbi_opslgc.studio_10541185", days=3, env="dev")
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
        data = _request("GET", "/scheduler/api/v1/taskInstance/getList", params=params, env=env)
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
def get_task_metric_summary(task_code: str, env: str = "prod") -> str:
    """
    获取任务的性能指标摘要。

    返回最近 10 次执行的平均耗时、等待时间、执行时间、CPU 时间、内存利用率、估算月成本等。

    参数:
        task_code: 任务编码
        env: 环境，"prod"（默认）或 "dev"

    示例:
        get_task_metric_summary("spx_mart.studio_10429983")
    """
    try:
        data = _request("GET", "/scheduler/api/v1/task/metricSummary",
                        params={"taskCode": task_code}, env=env)
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
def get_task_lineage(task_code: str, env: str = "prod") -> str:
    """
    获取任务的上下游血缘关系（依赖链路）。

    返回该任务的上游依赖任务和下游被依赖任务列表。

    参数:
        task_code: 任务编码
        env: 环境，"prod"（默认）或 "dev"

    示例:
        get_task_lineage("spx_mart.studio_10429983")
    """
    try:
        data = _request("GET", "/scheduler/api/v1/task/lineageWorkflow",
                        params={"taskCode": task_code}, env=env)
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
def get_task_operation_log(task_code: str, days: int = 30, env: str = "prod") -> str:
    """
    查询任务的操作日志（谁在什么时候做了什么操作）。

    参数:
        task_code: 任务编码
        days: 查询最近多少天的日志，默认 30 天
        env: 环境，"prod"（默认）或 "dev"

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
        data = _request("GET", "/scheduler/api/v1/task/getOperationLog", params=params, env=env)
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
def get_task_violations(task_code: str, project_code: str = "spx_mart", env: str = "prod") -> str:
    """
    查询任务的治理违规信息（Governance Violations）。

    参数:
        task_code: 任务编码
        project_code: 项目代码，默认 "spx_mart"
        env: 环境，"prod"（默认）或 "dev"

    示例:
        get_task_violations("spx_mart.studio_10429983")
    """
    try:
        params = {"taskCode": task_code, "projectCode": project_code}
        data = _request("GET", "/scheduler/api/v1/task/violations", params=params, env=env)
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
def search_tasks(keyword: str, project_code: str = "spx_mart", page_size: int = 20, env: str = "prod") -> str:
    """
    按关键词搜索 Scheduler 任务。

    可以用任务名、taskCode 的一部分来搜索。

    参数:
        keyword: 搜索关键词（任务名的一部分）
        project_code: 项目代码，默认 "spx_mart"
        page_size: 返回条数，默认 20
        env: 环境，"prod"（默认）或 "dev"

    示例:
        search_tasks("fleet_order", "spx_mart")
        search_tasks("dwd_spx_spsso")
    """
    try:
        params = {
            "taskName": keyword,
            "projectCode": project_code,
            "pageNo": 1,
            "pageSize": page_size,
        }
        data = _request("GET", "/scheduler/api/v1/task/getList", params=params, env=env)
        raw_list = data.get("data", {}).get("list", data.get("data", []))

        if isinstance(raw_list, dict):
            raw_list = raw_list.get("list", [])

        tasks = []
        for t in raw_list:
            tasks.append({
                "task_code": t.get("taskCode", ""),
                "task_name": t.get("taskName", ""),
                "task_type": t.get("taskTypeName", t.get("taskExeType", "")),
                "owner": t.get("taskOwner", t.get("owner", "")),
                "status": "frozen" if t.get("activeStatus") == 0 else "active",
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
def get_instance_log(task_instance_code: str, env: str = "prod") -> str:
    """
    获取某个任务实例的运行日志。

    参数:
        task_instance_code: 实例编码，如 "spx_mart.studio_10429983_20260401_DAY_1"
        env: 环境，"prod"（默认）或 "dev"

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
            data = _request(method, path, params=params, json_body=body, env=env)
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


PRESTO_HISTORY_BASE = "https://historyserver.presto.data-infra.shopee.io"
KEYHOLE_BASE = "https://keyhole.data-infra.shopee.io"


def _load_presto_cookies() -> dict:
    """获取 Presto History Server 所需的 cookie。"""
    result = get_auth(DATA_INFRA_DOMAIN, force=False)
    return result.cookies


def _load_keyhole_cookies() -> dict:
    """获取 Keyhole (data-infra) 所需的 cookie。"""
    result = get_auth(DATA_INFRA_DOMAIN, force=False)
    return result.cookies


# ──────────── Spark History Server (SHS) 基础设施 ────────────

_shs_cache: Dict[str, Dict[str, str]] = {}


def _fmt_bytes(n) -> str:
    """将字节数格式化为人类可读的字符串。"""
    if n is None or n == 0:
        return "0 B"
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(n) < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} PB"


def _discover_shs_origin_host(app_id: str) -> str:
    """从 Keyhole diagnostics 页面提取该应用所在 SHS 的 originHost。

    Keyhole 代理 SHS REST API 时需要 originHost 参数来路由到正确的 SHS 实例。
    diagnostics 页面的 history 链接包含 originHost 参数，格式如：
      /history/{app_id}?originHost=spark-history-shs-N...shopee.io:18080
    """
    if app_id in _shs_cache and "origin_host" in _shs_cache[app_id]:
        return _shs_cache[app_id]["origin_host"]

    cookies = _load_keyhole_cookies()
    if not cookies:
        raise RuntimeError("未找到 data-infra Cookie，请先在浏览器登录 Keyhole")

    from urllib.parse import urlparse, parse_qs

    try:
        resp = requests.get(
            f"{KEYHOLE_BASE}/keyhole/diagnostics",
            params={"applicationId": app_id},
            cookies=cookies, timeout=15,
        )
        resp.raise_for_status()
        html = resp.text
    except requests.RequestException as e:
        raise RuntimeError(
            f"无法访问 Keyhole diagnostics（applicationId={app_id}）: {e}\n"
            f"请确保已在浏览器登录 Keyhole ({KEYHOLE_BASE})。"
        )

    # Extract originHost from history link or any link with originHost parameter
    origin_links = re.findall(
        r'href="([^"]*originHost=[^"]*)"', html
    )
    for link in origin_links:
        clean = link.replace("&amp;", "&")
        if clean.startswith("/"):
            parsed = urlparse(f"{KEYHOLE_BASE}{clean}")
        else:
            parsed = urlparse(clean)
        qs = parse_qs(parsed.query)
        host = qs.get("originHost", [None])[0]
        if host:
            _shs_cache.setdefault(app_id, {})["origin_host"] = host
            logger.info(f"[SHS] Discovered originHost: {host}")
            return host

    # Fallback: follow stdout link to extract originHost from redirect
    stdout_links = re.findall(r'href="([^"]*stdout[^"]*)"', html)
    if stdout_links:
        path = stdout_links[0].replace("&amp;", "&")
        try:
            resp2 = requests.get(
                f"{KEYHOLE_BASE}{path}",
                cookies=cookies, timeout=15, allow_redirects=True,
            )
            qs = parse_qs(urlparse(resp2.url).query)
            host = qs.get("originHost", [None])[0]
            if host:
                _shs_cache.setdefault(app_id, {})["origin_host"] = host
                logger.info(f"[SHS] Discovered originHost from stdout redirect: {host}")
                return host
        except requests.RequestException:
            pass

    raise RuntimeError(
        f"无法从 Keyhole 发现 SHS originHost（applicationId={app_id}）。\n"
        f"请确保已在浏览器登录 Keyhole ({KEYHOLE_BASE}) 并确认该 application 存在。"
    )


def _get_shs_attempt_id(app_id: str, origin_host: str, cookies: dict, timeout: int = 15) -> str:
    """获取应用的 attemptId（SHS 子端点需要）。"""
    if app_id in _shs_cache and "attempt_id" in _shs_cache[app_id]:
        return _shs_cache[app_id]["attempt_id"]

    resp = requests.get(
        f"{KEYHOLE_BASE}/api/v1/applications/{app_id}",
        params={"originHost": origin_host},
        cookies=cookies, timeout=timeout,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"无法获取应用信息: HTTP {resp.status_code}")

    app_info = resp.json()
    attempts = app_info.get("attempts", [])
    attempt_id = attempts[0].get("attemptId", "1") if attempts else "1"
    _shs_cache.setdefault(app_id, {})["attempt_id"] = attempt_id
    return attempt_id


def _spark_history_get(app_id: str, endpoint: str = "", timeout: int = 30) -> dict:
    """通过 Keyhole 代理调用 Spark History Server REST API。

    Keyhole 路由机制：
    - 基础信息: /api/v1/applications/{app_id}?originHost={shs_host}
    - 子端点:   /api/v1/applications/{app_id}/{attemptId}{endpoint}?originHost={shs_host}
    """
    cookies = _load_keyhole_cookies()
    origin_host = _discover_shs_origin_host(app_id)

    if not endpoint:
        url = f"{KEYHOLE_BASE}/api/v1/applications/{app_id}"
        resp = requests.get(url, params={"originHost": origin_host},
                            cookies=cookies, timeout=timeout)
        if resp.status_code == 404:
            raise RuntimeError(
                f"Spark History Server 未找到该应用（可能已超过保留期限或 ID 错误）: {app_id}"
            )
        resp.raise_for_status()
        data = resp.json()
        # Cache attemptId from app info response
        attempts = data.get("attempts", [])
        if attempts:
            _shs_cache.setdefault(app_id, {})["attempt_id"] = attempts[0].get("attemptId", "1")
        return data

    attempt_id = _get_shs_attempt_id(app_id, origin_host, cookies, timeout)
    url = f"{KEYHOLE_BASE}/api/v1/applications/{app_id}/{attempt_id}{endpoint}"
    resp = requests.get(url, params={"originHost": origin_host},
                        cookies=cookies, timeout=timeout)
    if resp.status_code == 404:
        raise RuntimeError(
            f"Spark History Server 未找到该应用（可能已超过保留期限或 ID 错误）: {app_id}"
        )
    resp.raise_for_status()
    return resp.json()


def _extract_task_code(task_instance_code: str) -> str:
    """从实例编码中提取任务编码。
    例: 'twbi_spx_ops.studio_6786158_202604012010_MINUTE_1' -> 'twbi_spx_ops.studio_6786158'
    """
    parts = task_instance_code.split(".")
    if len(parts) < 2:
        return task_instance_code
    project = parts[0]
    rest = ".".join(parts[1:])
    tokens = rest.split("_")
    # studio_{数字} 后面的都是实例标识
    for i, tok in enumerate(tokens):
        if i > 0 and tok.isdigit():
            # 检查下一个 token 是否像时间戳（纯数字且 >= 8 位）
            if i + 1 < len(tokens) and len(tokens[i + 1]) >= 8 and tokens[i + 1].isdigit():
                return f"{project}.{'_'.join(tokens[:i+1])}"
    return task_instance_code


def _get_instance_yarn_id(task_instance_code: str, env: str = "prod") -> Optional[str]:
    """从 Scheduler 实例详情 API 获取 yarnApplicationId (即 Presto Query ID)。"""
    task_code = _extract_task_code(task_instance_code)
    data = _request("GET", "/scheduler/api/v1/taskInstance/get", params={
        "taskCode": task_code,
        "taskInstanceCode": task_instance_code,
    }, env=env)
    inst = data.get("data", {})
    return inst.get("yarnApplicationId")


@mcp.tool()
def get_instance_detail(task_instance_code: str, env: str = "prod") -> str:
    """
    获取任务实例的完整详情，包括 Presto Query ID、运行配置、资源消耗等。

    此接口返回比 get_task_instances 更详细的信息，特别是：
    - yarnApplicationId（即 Presto Query ID，可用于 get_presto_query_sql 查询实际 SQL）
    - 完整的运行配置
    - 输出配置列表
    - DQC 结果
    - 超时配置

    参数:
        task_instance_code: 实例编码，如 "twbi_spx_ops.studio_6786158_202604012010_MINUTE_1"
        env: 环境，"prod"（默认）或 "dev"

    示例:
        get_instance_detail("twbi_spx_ops.studio_6786158_202604012010_MINUTE_1")
    """
    try:
        task_code = _extract_task_code(task_instance_code)
        data = _request("GET", "/scheduler/api/v1/taskInstance/get", params={
            "taskCode": task_code,
            "taskInstanceCode": task_instance_code,
        }, env=env)
        inst = data.get("data", {})

        status_code = inst.get("instanceStatus", 0)
        yarn_id = inst.get("yarnApplicationId")

        result = {
            "instance_code": inst.get("taskInstanceCode"),
            "task_code": inst.get("taskCode"),
            "task_name": inst.get("taskName"),
            "status": INSTANCE_STATUS_MAP.get(status_code, f"Unknown({status_code})"),
            "biz_time": _fmt_ts(inst.get("bizTime")),
            "start_time": _fmt_ts(inst.get("startRunTime")),
            "end_time": _fmt_ts(inst.get("endRunTime")),
            "owner": inst.get("owner"),
            "project_code": inst.get("projectCode"),
            "worker_host": inst.get("workerHost"),
            "hadoop_account": inst.get("hadoopAccount"),
            "presto_queue": inst.get("prestoQueueName"),
            "yarn_queue": inst.get("yarnQueueName"),
            "yarn_application_id": yarn_id,
            "actual_memory_mb": inst.get("actualMemory"),
            "cpu_time_s": inst.get("cpuTime"),
            "retry_seq": inst.get("retrySeq"),
            "rerun_seq": inst.get("rerunSeq"),
            "codex": inst.get("codex"),
            "codex_summary": inst.get("codexSummary"),
            "message": inst.get("message"),
            "env": env,
        }

        if yarn_id:
            if yarn_id.startswith("application_"):
                result["keyhole_url"] = f"{KEYHOLE_BASE}/keyhole/diagnostics?applicationId={yarn_id}"
                result["tip"] = (
                    "这是 Spark/Hive 任务。可用工具：\n"
                    "- diagnose_spark_app: 综合性能诊断（推荐入口）\n"
                    "- get_spark_query_sql: Driver stdout 日志（含 SQL）\n"
                    "- get_spark_stages / get_spark_executors / get_spark_sql_plan / get_spark_jobs: 分项详情\n"
                    "- get_spark_stage_tasks: Task 级明细（倾斜精确定位）\n"
                    "- get_spark_storage: 缓存信息"
                )
            else:
                result["presto_history_url"] = f"{PRESTO_HISTORY_BASE}/query.html?{yarn_id}"
                result["tip"] = "这是 Presto 任务，使用 get_presto_query_sql 传入 yarn_application_id 可获取实际执行的 SQL"

        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


# ──────────── Spark History Server MCP Tools ────────────


def _resolve_app_id(yarn_application_id: str, task_instance_code: str, env: str) -> str:
    """统一解析 YARN Application ID：优先直传，否则从 Scheduler 查询。"""
    if yarn_application_id:
        return yarn_application_id
    if not task_instance_code:
        raise ValueError("请提供 yarn_application_id 或 task_instance_code 之一")
    app_id = _get_instance_yarn_id(task_instance_code, env=env)
    if not app_id:
        raise ValueError(
            f"实例 {task_instance_code} 没有关联的 YARN Application ID"
            f"（可能尚未执行或不是 Spark 类型任务）"
        )
    if not app_id.startswith("application_"):
        raise ValueError(
            f"该实例是 Presto 类型（ID={app_id}），请使用 get_presto_query_sql"
        )
    return app_id


@mcp.tool()
def get_spark_app_summary(
    yarn_application_id: str = "",
    task_instance_code: str = "",
    env: str = "prod",
) -> str:
    """
    获取 Spark 应用的概览信息和关键配置。

    通过 Spark History Server REST API 获取结构化的应用信息，包括：
    - 应用名称、用户、运行时间
    - Spark 关键配置（内存、并行度、executor 数量等）
    - 环境信息摘要

    参数:
        yarn_application_id: YARN Application ID，如 "application_1773126131675_5513239"
        task_instance_code: 任务实例编码（二选一）
        env: 环境，"prod"（默认）或 "dev"

    示例:
        get_spark_app_summary(yarn_application_id="application_1773126131675_5513239")
        get_spark_app_summary(task_instance_code="spx_mart.studio_xxx_20260401_DAY_1")
    """
    try:
        app_id = _resolve_app_id(yarn_application_id, task_instance_code, env)

        app_info = _spark_history_get(app_id)
        env_info = {}
        try:
            env_info = _spark_history_get(app_id, "/environment")
        except Exception:
            pass

        attempts = app_info.get("attempts", [{}])
        latest = attempts[0] if attempts else {}

        KEY_CONFIGS = [
            "spark.executor.memory", "spark.executor.cores",
            "spark.executor.instances", "spark.executor.memoryOverhead",
            "spark.driver.memory", "spark.driver.cores",
            "spark.dynamicAllocation.enabled",
            "spark.dynamicAllocation.minExecutors",
            "spark.dynamicAllocation.maxExecutors",
            "spark.sql.shuffle.partitions", "spark.default.parallelism",
            "spark.sql.adaptive.enabled",
            "spark.sql.adaptive.coalescePartitions.enabled",
            "spark.sql.adaptive.skewJoin.enabled",
            "spark.shuffle.compress", "spark.shuffle.spill.compress",
            "spark.kryoserializer.buffer.max",
            "spark.driver.maxResultSize",
        ]
        spark_props = {}
        for pair in env_info.get("sparkProperties", []):
            if isinstance(pair, (list, tuple)) and len(pair) >= 2:
                spark_props[pair[0]] = pair[1]

        key_config = {k: spark_props[k] for k in KEY_CONFIGS if k in spark_props}

        result = {
            "app_id": app_id,
            "name": app_info.get("name", ""),
            "user": latest.get("sparkUser", ""),
            "start_time": latest.get("startTime", ""),
            "end_time": latest.get("endTime", ""),
            "duration_ms": latest.get("duration", 0),
            "duration": _fmt_duration((latest.get("duration", 0) or 0) // 1000),
            "completed": latest.get("completed", False),
            "spark_version": env_info.get("runtime", {}).get("sparkVersion", ""),
            "key_config": key_config,
            "keyhole_url": f"{KEYHOLE_BASE}/keyhole/diagnostics?applicationId={app_id}",
        }
        if task_instance_code:
            result["task_instance_code"] = task_instance_code
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_spark_stages(
    yarn_application_id: str = "",
    task_instance_code: str = "",
    env: str = "prod",
) -> str:
    """
    获取 Spark 应用所有 Stage 的详细指标，自动检测数据倾斜和慢 Stage。

    返回每个 Stage 的：
    - 耗时、输入/输出行数和大小
    - Shuffle 读写量
    - 数据倾斜指标（分位数对比，如有）
    - 异常标记（耗时占比过高、数据倾斜明显等）

    参数:
        yarn_application_id: YARN Application ID
        task_instance_code: 任务实例编码（二选一）
        env: 环境

    示例:
        get_spark_stages(yarn_application_id="application_1773126131675_5513239")
    """
    try:
        app_id = _resolve_app_id(yarn_application_id, task_instance_code, env)
        stages = _spark_history_get(app_id, "/stages?withSummaries=true")

        if not isinstance(stages, list):
            return json.dumps({"error": "SHS 返回的 stages 格式异常", "raw": str(stages)[:500]}, ensure_ascii=False)

        total_duration = sum(s.get("executorRunTime", 0) for s in stages) or 1

        stage_list = []
        warnings = []
        for s in stages:
            stage_id = s.get("stageId", "?")
            attempt = s.get("attemptId", 0)
            duration = s.get("executorRunTime", 0)
            pct = round(duration / total_duration * 100, 1)
            input_bytes = s.get("inputBytes", 0)
            output_bytes = s.get("outputBytes", 0)
            shuffle_read = s.get("shuffleReadBytes", 0)
            shuffle_write = s.get("shuffleWriteBytes", 0)
            num_tasks = s.get("numCompleteTasks", 0) + s.get("numFailedTasks", 0)
            records_in = s.get("inputRecords", 0)
            records_out = s.get("outputRecords", 0)
            spill_memory = s.get("memoryBytesSpilled", 0)
            spill_disk = s.get("diskBytesSpilled", 0)

            entry = {
                "stage_id": stage_id,
                "attempt": attempt,
                "name": (s.get("name", "") or "")[:80],
                "status": s.get("status", ""),
                "num_tasks": num_tasks,
                "duration_ms": duration,
                "duration_pct": pct,
                "input": _fmt_bytes(input_bytes),
                "input_records": records_in,
                "output": _fmt_bytes(output_bytes),
                "output_records": records_out,
                "shuffle_read": _fmt_bytes(shuffle_read),
                "shuffle_write": _fmt_bytes(shuffle_write),
            }

            if spill_disk > 0:
                entry["spill_disk"] = _fmt_bytes(spill_disk)
                entry["spill_memory"] = _fmt_bytes(spill_memory)

            # Skew detection via task summary quantiles
            task_summary = s.get("taskSummary")
            if task_summary and isinstance(task_summary, dict):
                dur_q = task_summary.get("executorRunTime")
                if dur_q and isinstance(dur_q, list) and len(dur_q) >= 5:
                    median_dur = dur_q[2]  # p50
                    max_dur = dur_q[4]     # p100 (max)
                    if median_dur > 0 and max_dur > median_dur * 5:
                        entry["skew_ratio"] = round(max_dur / median_dur, 1)
                        warnings.append(
                            f"Stage {stage_id}: 数据倾斜（max/median={entry['skew_ratio']}x）"
                        )

            if pct > 50 and num_tasks > 1:
                warnings.append(f"Stage {stage_id}: 占总耗时 {pct}%（瓶颈 Stage）")

            if spill_disk > 100 * 1024 * 1024:
                warnings.append(f"Stage {stage_id}: 磁盘溢出 {_fmt_bytes(spill_disk)}")

            stage_list.append(entry)

        result = {
            "app_id": app_id,
            "total_stages": len(stage_list),
            "total_executor_time_ms": total_duration,
            "stages": stage_list,
        }
        if warnings:
            result["warnings"] = warnings
        if task_instance_code:
            result["task_instance_code"] = task_instance_code
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_spark_executors(
    yarn_application_id: str = "",
    task_instance_code: str = "",
    env: str = "prod",
) -> str:
    """
    获取 Spark 应用的 Executor 资源使用详情，自动检测 GC 压力和内存风险。

    返回每个 Executor 的：
    - 内存用量、磁盘用量
    - GC 时间及占比
    - 任务完成/失败数
    - Shuffle 读写量

    参数:
        yarn_application_id: YARN Application ID
        task_instance_code: 任务实例编码（二选一）
        env: 环境

    示例:
        get_spark_executors(yarn_application_id="application_1773126131675_5513239")
    """
    try:
        app_id = _resolve_app_id(yarn_application_id, task_instance_code, env)
        executors = _spark_history_get(app_id, "/allexecutors")

        if not isinstance(executors, list):
            return json.dumps({"error": "SHS 返回的 executors 格式异常"}, ensure_ascii=False)

        exec_list = []
        warnings = []
        total_gc = 0
        total_duration = 0

        for ex in executors:
            eid = ex.get("id", "")
            duration = ex.get("totalDuration", 0)
            gc_time = ex.get("totalGCTime", 0)
            total_gc += gc_time
            total_duration += duration
            gc_pct = round(gc_time / duration * 100, 1) if duration > 0 else 0
            max_mem = ex.get("maxMemory", 0)
            mem_used = ex.get("memoryUsed", 0)
            mem_pct = round(mem_used / max_mem * 100, 1) if max_mem > 0 else 0
            completed = ex.get("completedTasks", 0)
            failed = ex.get("failedTasks", 0)
            active = ex.get("activeTasks", 0)

            entry = {
                "id": eid,
                "host": ex.get("hostPort", ""),
                "is_active": ex.get("isActive", False),
                "cores": ex.get("totalCores", 0),
                "max_memory": _fmt_bytes(max_mem),
                "memory_used": _fmt_bytes(mem_used),
                "memory_pct": mem_pct,
                "disk_used": _fmt_bytes(ex.get("diskUsed", 0)),
                "total_duration_ms": duration,
                "gc_time_ms": gc_time,
                "gc_pct": gc_pct,
                "tasks_completed": completed,
                "tasks_failed": failed,
                "tasks_active": active,
                "total_input": _fmt_bytes(ex.get("totalInputBytes", 0)),
                "total_shuffle_read": _fmt_bytes(ex.get("totalShuffleRead", 0)),
                "total_shuffle_write": _fmt_bytes(ex.get("totalShuffleWrite", 0)),
            }

            if gc_pct > 20 and eid != "driver":
                warnings.append(f"Executor {eid}: GC 时间占比 {gc_pct}%（建议增大内存或减少数据量）")
            if mem_pct > 90 and eid != "driver":
                warnings.append(f"Executor {eid}: 内存使用率 {mem_pct}%（OOM 风险）")
            if failed > 0:
                warnings.append(f"Executor {eid}: {failed} 个任务失败")

            exec_list.append(entry)

        overall_gc_pct = round(total_gc / total_duration * 100, 1) if total_duration > 0 else 0

        result = {
            "app_id": app_id,
            "total_executors": len(exec_list),
            "overall_gc_pct": overall_gc_pct,
            "executors": exec_list,
        }
        if warnings:
            result["warnings"] = warnings
        if task_instance_code:
            result["task_instance_code"] = task_instance_code
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_spark_sql_plan(
    yarn_application_id: str = "",
    task_instance_code: str = "",
    env: str = "prod",
) -> str:
    """
    获取 Spark 应用的 SQL 执行计划和各算子指标。

    从 Spark History Server 的 /sql 端点获取 SQL 查询列表，包括：
    - SQL 文本
    - 物理执行计划（planDescription）
    - 各算子的行数/大小指标
    - 执行耗时

    参数:
        yarn_application_id: YARN Application ID
        task_instance_code: 任务实例编码（二选一）
        env: 环境

    示例:
        get_spark_sql_plan(yarn_application_id="application_1773126131675_5513239")
    """
    try:
        app_id = _resolve_app_id(yarn_application_id, task_instance_code, env)
        sql_list = _spark_history_get(app_id, "/sql?details=true")

        if not isinstance(sql_list, list):
            return json.dumps({"error": "SHS 返回的 SQL 数据格式异常"}, ensure_ascii=False)

        queries = []
        for sq in sql_list:
            exec_id = sq.get("id", "")
            desc = sq.get("description", "")
            status = sq.get("status", "")
            duration = sq.get("duration", 0)
            plan = sq.get("planDescription", "")

            # Truncate very large plans
            if len(plan) > 5000:
                plan = plan[:4500] + "\n... [截断，完整计划请通过 Spark UI 查看]"

            entry = {
                "execution_id": exec_id,
                "description": desc[:200],
                "status": status,
                "duration_ms": duration,
                "duration": _fmt_duration(duration // 1000) if duration else "-",
            }

            if plan:
                entry["physical_plan"] = plan

            nodes = sq.get("nodes", [])
            if nodes:
                node_summaries = []
                for node in nodes[:30]:
                    ns = {
                        "id": node.get("nodeId", ""),
                        "name": node.get("nodeName", ""),
                    }
                    metrics = node.get("metrics", [])
                    for m in metrics:
                        name = m.get("name", "")
                        val = m.get("value", "")
                        if name and val and name in (
                            "number of output rows",
                            "data size total (min, med, max)",
                            "shuffle bytes written total (min, med, max)",
                            "shuffle records written",
                            "number of files read",
                            "size of files read",
                            "scan time total (min, med, max)",
                        ):
                            ns[name] = val
                    if len(ns) > 2:
                        node_summaries.append(ns)
                if node_summaries:
                    entry["key_operators"] = node_summaries

            queries.append(entry)

        result = {
            "app_id": app_id,
            "total_sql_queries": len(queries),
            "queries": queries,
        }
        if task_instance_code:
            result["task_instance_code"] = task_instance_code
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_spark_jobs(
    yarn_application_id: str = "",
    task_instance_code: str = "",
    env: str = "prod",
) -> str:
    """
    获取 Spark 应用的 Job 列表及状态。

    每个 Spark Action（如 save/collect/count）会生成一个 Job，包含多个 Stage。
    可以看到每个 Job 的耗时、Stage 构成、成功/失败状态。

    参数:
        yarn_application_id: YARN Application ID
        task_instance_code: 任务实例编码（二选一）
        env: 环境

    示例:
        get_spark_jobs(yarn_application_id="application_1773041251148_7277604")
    """
    try:
        app_id = _resolve_app_id(yarn_application_id, task_instance_code, env)
        jobs = _spark_history_get(app_id, "/jobs")

        if not isinstance(jobs, list):
            return json.dumps({"app_id": app_id, "total_jobs": 0, "jobs": []},
                              ensure_ascii=False, indent=2)

        job_list = []
        for j in sorted(jobs, key=lambda x: x.get("jobId", 0)):
            entry = {
                "job_id": j.get("jobId"),
                "name": (j.get("name", "") or "")[:120],
                "status": j.get("status", ""),
                "num_stages": j.get("numStages", 0),
                "num_tasks": j.get("numTasks", 0),
                "num_completed_tasks": j.get("numCompletedTasks", 0),
                "num_failed_tasks": j.get("numFailedTasks", 0),
                "stage_ids": j.get("stageIds", []),
            }
            sub_time = j.get("submissionTime", "")
            comp_time = j.get("completionTime", "")
            if sub_time:
                entry["submission_time"] = sub_time
            if comp_time:
                entry["completion_time"] = comp_time

            job_list.append(entry)

        result = {
            "app_id": app_id,
            "total_jobs": len(job_list),
            "jobs": job_list,
        }
        if task_instance_code:
            result["task_instance_code"] = task_instance_code
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_spark_stage_tasks(
    yarn_application_id: str = "",
    task_instance_code: str = "",
    stage_id: int = -1,
    env: str = "prod",
    sort_by: str = "duration",
    limit: int = 20,
) -> str:
    """
    获取指定 Stage 的 Task 级明细。这是精确定位数据倾斜的关键工具。

    返回每个 Task 的耗时、数据量、Shuffle、GC、Spill 等指标，
    并自动计算倾斜比（max/median）、P50/P90/P99 等分位数。

    使用场景:
    - diagnose_spark_app 检测到倾斜后，用此工具查看具体哪些 Task 异常
    - 分析慢 Stage 中的 Task 分布，确认是倾斜还是资源不足

    参数:
        yarn_application_id: YARN Application ID
        task_instance_code: 任务实例编码（二选一）
        stage_id: Stage ID（必须指定，可从 get_spark_stages 获取）
        env: 环境
        sort_by: 排序字段 duration/shuffle_read/spill/gc_time（默认 duration）
        limit: 返回前 N 个 Task（默认 20，按 sort_by 降序）

    示例:
        get_spark_stage_tasks(yarn_application_id="application_xxx", stage_id=6)
    """
    try:
        app_id = _resolve_app_id(yarn_application_id, task_instance_code, env)

        if stage_id < 0:
            return json.dumps(
                {"error": "请指定 stage_id（可从 get_spark_stages 获取）"},
                ensure_ascii=False,
            )

        fetch_size = max(limit * 5, 200)
        tasks_data = _spark_history_get(
            app_id,
            f"/stages/{stage_id}/0/taskList?length={fetch_size}&offset=0",
        )

        if not isinstance(tasks_data, (list, dict)):
            return json.dumps({"app_id": app_id, "stage_id": stage_id,
                               "error": "未获取到 Task 数据"}, ensure_ascii=False)

        task_items = tasks_data if isinstance(tasks_data, list) else list(tasks_data.values())

        # Client-side sort (Keyhole proxy doesn't support sortBy)
        sort_key_map = {
            "duration": lambda t: t.get("taskMetrics", {}).get("executorRunTime", 0),
            "shuffle_read": lambda t: (
                t.get("taskMetrics", {}).get("shuffleReadMetrics", {}).get("localBytesRead", 0)
                + t.get("taskMetrics", {}).get("shuffleReadMetrics", {}).get("remoteBytesRead", 0)
            ),
            "spill": lambda t: t.get("taskMetrics", {}).get("diskBytesSpilled", 0),
            "gc_time": lambda t: t.get("taskMetrics", {}).get("jvmGcTime", 0),
        }
        key_fn = sort_key_map.get(sort_by, sort_key_map["duration"])
        task_items.sort(key=key_fn, reverse=True)
        all_durations = [t.get("taskMetrics", {}).get("executorRunTime", 0) for t in task_items]
        task_items = task_items[:limit]

        tasks = []
        durations = []
        for t in task_items:
            metrics = t.get("taskMetrics", {})
            dur = metrics.get("executorRunTime", 0)
            durations.append(dur)

            shuffle_r = metrics.get("shuffleReadMetrics", {})
            shuffle_w = metrics.get("shuffleWriteMetrics", {})

            entry = {
                "task_id": t.get("taskId"),
                "executor_id": t.get("executorId", ""),
                "host": t.get("host", ""),
                "status": t.get("status", ""),
                "duration_ms": dur,
                "duration": _fmt_duration(dur // 1000) if dur else "0s",
                "gc_time_ms": metrics.get("jvmGcTime", 0),
                "input_bytes": _fmt_bytes(metrics.get("inputMetrics", {}).get("bytesRead", 0)),
                "input_records": metrics.get("inputMetrics", {}).get("recordsRead", 0),
                "shuffle_read": _fmt_bytes(shuffle_r.get("localBytesRead", 0) + shuffle_r.get("remoteBytesRead", 0)),
                "shuffle_read_records": shuffle_r.get("recordsRead", 0),
                "shuffle_write": _fmt_bytes(shuffle_w.get("bytesWritten", 0)),
                "shuffle_write_records": shuffle_w.get("recordsWritten", 0),
                "spill_memory": _fmt_bytes(metrics.get("memoryBytesSpilled", 0)),
                "spill_disk": _fmt_bytes(metrics.get("diskBytesSpilled", 0)),
            }
            tasks.append(entry)

        # Compute percentiles from ALL fetched tasks (not just top-N)
        stats = {}
        sample_durs = [d for d in all_durations if d > 0]
        if sample_durs:
            sorted_d = sorted(sample_durs)
            n = len(sorted_d)
            p50 = sorted_d[n // 2]
            p90 = sorted_d[int(n * 0.9)]
            p99 = sorted_d[int(n * 0.99)]
            max_d = sorted_d[-1]
            min_d = sorted_d[0]
            median = p50

            stats = {
                "task_count": n,
                "duration_min": _fmt_duration(min_d // 1000),
                "duration_p50": _fmt_duration(p50 // 1000),
                "duration_p90": _fmt_duration(p90 // 1000),
                "duration_p99": _fmt_duration(p99 // 1000),
                "duration_max": _fmt_duration(max_d // 1000),
                "skew_ratio": round(max_d / median, 1) if median > 0 else 0,
            }
            if median > 0 and max_d > median * 3:
                stats["skew_warning"] = (
                    f"max/median = {stats['skew_ratio']}x"
                    f" -- {'CRITICAL' if max_d > median * 10 else 'WARNING'}: 数据倾斜"
                )

        # Also fetch full stage summary for total task count
        try:
            stage_info = _spark_history_get(app_id, f"/stages/{stage_id}/0")
            if isinstance(stage_info, dict):
                stats["total_tasks_in_stage"] = stage_info.get("numCompleteTasks", 0)
        except Exception:
            pass

        result = {
            "app_id": app_id,
            "stage_id": stage_id,
            "sort_by": sort_by,
            "returned": len(tasks),
            "statistics": stats,
            "tasks": tasks,
        }
        if task_instance_code:
            result["task_instance_code"] = task_instance_code
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def get_spark_storage(
    yarn_application_id: str = "",
    task_instance_code: str = "",
    env: str = "prod",
) -> str:
    """
    获取 Spark 应用的 RDD/DataFrame 缓存信息。

    显示哪些数据被缓存在内存/磁盘中、缓存了多少分区、占用了多少空间。
    对于频繁使用 .cache()/.persist() 的任务，可以评估缓存效率和内存压力。

    参数:
        yarn_application_id: YARN Application ID
        task_instance_code: 任务实例编码（二选一）
        env: 环境

    示例:
        get_spark_storage(yarn_application_id="application_1773041251148_7277604")
    """
    try:
        app_id = _resolve_app_id(yarn_application_id, task_instance_code, env)
        storage = _spark_history_get(app_id, "/storage/rdd")

        if not isinstance(storage, list) or not storage:
            result = {
                "app_id": app_id,
                "total_cached": 0,
                "note": "无缓存数据（未使用 .cache()/.persist()）",
            }
            if task_instance_code:
                result["task_instance_code"] = task_instance_code
            return json.dumps(result, ensure_ascii=False, indent=2)

        entries = []
        for rdd in storage:
            entries.append({
                "rdd_id": rdd.get("id"),
                "name": (rdd.get("name", "") or "")[:120],
                "storage_level": rdd.get("storageLevel", ""),
                "num_partitions": rdd.get("numPartitions", 0),
                "num_cached_partitions": rdd.get("numCachedPartitions", 0),
                "memory_used": _fmt_bytes(rdd.get("memoryUsed", 0)),
                "disk_used": _fmt_bytes(rdd.get("diskUsed", 0)),
            })

        total_mem = sum(r.get("memoryUsed", 0) for r in storage)
        total_disk = sum(r.get("diskUsed", 0) for r in storage)

        result = {
            "app_id": app_id,
            "total_cached": len(entries),
            "total_memory_used": _fmt_bytes(total_mem),
            "total_disk_used": _fmt_bytes(total_disk),
            "cached_rdds": entries,
        }
        if task_instance_code:
            result["task_instance_code"] = task_instance_code
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


@mcp.tool()
def diagnose_spark_app(
    yarn_application_id: str = "",
    task_instance_code: str = "",
    env: str = "prod",
) -> str:
    """
    对 Spark 应用进行综合性能诊断，自动识别瓶颈并给出优化建议。

    这是最全面的 Spark 诊断工具，会自动聚合以下信息：
    - 应用概览 + Spark 配置
    - Stage 级指标（识别慢 Stage 和数据倾斜）
    - Executor 资源使用（GC/OOM/资源不均）
    - SQL 执行计划分析

    内置诊断规则：
    - 数据倾斜检测（Stage 级 + Task 级 max/median 分析）
    - OOM 风险（executor 内存使用率 > 85%）
    - GC 压力（GC 时间占比 > 15%）
    - Shuffle 瓶颈（大量 shuffle + 磁盘溢出）
    - 配置不当（executor 数量/内存/并行度不匹配）

    倾斜检测后可用 get_spark_stage_tasks 查看具体 Task 分布。

    参数:
        yarn_application_id: YARN Application ID
        task_instance_code: 任务实例编码（二选一）
        env: 环境

    示例:
        diagnose_spark_app(yarn_application_id="application_1773126131675_5513239")
        diagnose_spark_app(task_instance_code="spx_mart.studio_xxx_20260401_DAY_1")
    """
    try:
        app_id = _resolve_app_id(yarn_application_id, task_instance_code, env)

        findings = []
        suggestions = []
        severity = "HEALTHY"  # HEALTHY / WARNING / CRITICAL

        # ── 1. App summary + environment ──
        app_info = {}
        key_config = {}
        try:
            app_data = _spark_history_get(app_id)
            attempts = app_data.get("attempts", [{}])
            latest = attempts[0] if attempts else {}
            app_info = {
                "name": app_data.get("name", ""),
                "user": latest.get("sparkUser", ""),
                "duration_ms": latest.get("duration", 0),
                "duration": _fmt_duration((latest.get("duration", 0) or 0) // 1000),
                "completed": latest.get("completed", False),
            }

            try:
                env_data = _spark_history_get(app_id, "/environment")
                for pair in env_data.get("sparkProperties", []):
                    if isinstance(pair, (list, tuple)) and len(pair) >= 2:
                        key_config[pair[0]] = pair[1]
            except Exception:
                pass
        except Exception as e:
            findings.append(f"[WARN] 无法获取应用概览: {e}")

        # ── 2. Stage analysis ──
        stage_warnings = []
        stage_summary = {}
        skew_details = []
        try:
            stages = _spark_history_get(app_id, "/stages?withSummaries=true")
            if isinstance(stages, list) and stages:
                total_exec_time = sum(s.get("executorRunTime", 0) for s in stages) or 1
                total_spill = sum(s.get("diskBytesSpilled", 0) for s in stages)
                total_shuffle_read = sum(s.get("shuffleReadBytes", 0) for s in stages)
                total_shuffle_write = sum(s.get("shuffleWriteBytes", 0) for s in stages)

                stage_summary = {
                    "count": len(stages),
                    "total_executor_time": _fmt_duration(total_exec_time // 1000),
                    "total_shuffle_read": _fmt_bytes(total_shuffle_read),
                    "total_shuffle_write": _fmt_bytes(total_shuffle_write),
                    "total_spill": _fmt_bytes(total_spill),
                }

                skew_stages = []
                for s in stages:
                    sid = s.get("stageId", "?")
                    duration = s.get("executorRunTime", 0)
                    pct = round(duration / total_exec_time * 100, 1)
                    spill = s.get("diskBytesSpilled", 0)
                    num_tasks = s.get("numCompleteTasks", 0)

                    if pct > 50 and num_tasks > 1:
                        stage_warnings.append(
                            f"Stage {sid} 占总耗时 {pct}%（{_fmt_duration(duration // 1000)}）"
                        )

                    if spill > 100 * 1024 * 1024:
                        stage_warnings.append(
                            f"Stage {sid} 磁盘溢出 {_fmt_bytes(spill)}（内存不足）"
                        )

                    # Stage-level skew from taskSummary quantiles
                    ts = s.get("taskSummary")
                    if ts and isinstance(ts, dict):
                        dur_q = ts.get("executorRunTime")
                        if dur_q and isinstance(dur_q, list) and len(dur_q) >= 5:
                            median_d = dur_q[2]
                            max_d = dur_q[4]
                            if median_d > 0 and max_d > median_d * 5:
                                ratio = round(max_d / median_d, 1)
                                stage_warnings.append(
                                    f"Stage {sid} 数据倾斜: max/median = {ratio}x"
                                )
                                if ratio > 10:
                                    severity = "CRITICAL"
                                elif severity == "HEALTHY":
                                    severity = "WARNING"

                    # Collect top stages for Task-level deep analysis
                    if pct > 10 and num_tasks > 10:
                        skew_stages.append((sid, pct, num_tasks))

                # Task-level skew deep analysis for top stages
                skew_details = []
                for sid, pct, num_tasks in sorted(skew_stages, key=lambda x: -x[1])[:3]:
                    try:
                        task_data = _spark_history_get(
                            app_id,
                            f"/stages/{sid}/0/taskList?length=200&offset=0",
                        )
                        if isinstance(task_data, dict):
                            task_data = list(task_data.values())
                        if isinstance(task_data, list) and task_data:
                            durs = [
                                t.get("taskMetrics", {}).get("executorRunTime", 0)
                                for t in task_data
                            ]
                            durs = [d for d in durs if d > 0]
                            if len(durs) >= 5:
                                durs.sort()
                                n = len(durs)
                                p50 = durs[n // 2]
                                p90 = durs[int(n * 0.9)]
                                max_d = durs[-1]
                                ratio = round(max_d / p50, 1) if p50 > 0 else 0
                                detail = {
                                    "stage_id": sid,
                                    "time_pct": pct,
                                    "sampled_tasks": n,
                                    "p50": _fmt_duration(p50 // 1000),
                                    "p90": _fmt_duration(p90 // 1000),
                                    "max": _fmt_duration(max_d // 1000),
                                    "skew_ratio": ratio,
                                }
                                if ratio > 5:
                                    detail["verdict"] = "SKEW_CONFIRMED"
                                    slowest = task_data[0]
                                    detail["slowest_task"] = {
                                        "task_id": slowest.get("taskId"),
                                        "executor": slowest.get("executorId", ""),
                                        "host": slowest.get("host", ""),
                                    }
                                skew_details.append(detail)
                    except Exception:
                        pass

                if total_spill > 1024 * 1024 * 1024:
                    suggestions.append(
                        "增大 spark.executor.memory 或 spark.executor.memoryOverhead 以减少磁盘溢出"
                    )
                    severity = "WARNING" if severity == "HEALTHY" else severity
        except Exception as e:
            findings.append(f"[WARN] 无法获取 Stage 信息: {e}")

        # ── 3. Executor analysis ──
        executor_warnings = []
        executor_summary = {}
        try:
            executors = _spark_history_get(app_id, "/allexecutors")
            if isinstance(executors, list) and executors:
                worker_execs = [e for e in executors if e.get("id") != "driver"]
                total_gc = sum(e.get("totalGCTime", 0) for e in worker_execs)
                total_dur = sum(e.get("totalDuration", 0) for e in worker_execs)
                gc_pct = round(total_gc / total_dur * 100, 1) if total_dur > 0 else 0

                max_mem_used_pct = 0
                for ex in worker_execs:
                    max_m = ex.get("maxMemory", 0)
                    used_m = ex.get("memoryUsed", 0)
                    if max_m > 0:
                        mp = used_m / max_m * 100
                        if mp > max_mem_used_pct:
                            max_mem_used_pct = mp

                    eg = ex.get("totalGCTime", 0)
                    ed = ex.get("totalDuration", 0)
                    if ed > 0 and eg / ed > 0.2:
                        executor_warnings.append(
                            f"Executor {ex.get('id')}: GC 占比 {round(eg/ed*100,1)}%"
                        )

                    if ex.get("failedTasks", 0) > 0:
                        executor_warnings.append(
                            f"Executor {ex.get('id')}: {ex['failedTasks']} 个任务失败"
                        )

                executor_summary = {
                    "count": len(worker_execs),
                    "overall_gc_pct": gc_pct,
                    "peak_memory_usage_pct": round(max_mem_used_pct, 1),
                }

                if gc_pct > 15:
                    suggestions.append(
                        f"GC 压力过大（整体 {gc_pct}%），建议增大 spark.executor.memory 或减少单 executor 处理数据量"
                    )
                    severity = "WARNING" if severity == "HEALTHY" else severity

                if max_mem_used_pct > 85:
                    suggestions.append(
                        f"峰值内存使用率 {round(max_mem_used_pct,1)}%，存在 OOM 风险。"
                        f"建议增大 spark.executor.memoryOverhead"
                    )
                    severity = "CRITICAL"
        except Exception as e:
            findings.append(f"[WARN] 无法获取 Executor 信息: {e}")

        # ── 4. Config analysis ──
        config_warnings = []
        if key_config:
            shuffle_partitions = key_config.get("spark.sql.shuffle.partitions", "")
            if shuffle_partitions and shuffle_partitions.isdigit():
                sp = int(shuffle_partitions)
                if sp <= 200 and stage_summary.get("total_shuffle_read", "").endswith("GB"):
                    config_warnings.append(
                        f"shuffle.partitions={sp}，但 shuffle 数据量较大，建议增大到 500-2000"
                    )
                    suggestions.append(
                        f"增大 spark.sql.shuffle.partitions（当前 {sp}）以匹配数据量"
                    )

            aqe = key_config.get("spark.sql.adaptive.enabled", "false")
            if aqe.lower() != "true":
                config_warnings.append("AQE（自适应查询执行）未启用")
                suggestions.append(
                    "启用 spark.sql.adaptive.enabled=true（Spark 3.x 推荐）"
                )

            skew_join = key_config.get("spark.sql.adaptive.skewJoin.enabled", "")
            if stage_warnings and skew_join.lower() != "true":
                suggestions.append(
                    "存在数据倾斜但 skewJoin 未启用，建议设置 "
                    "spark.sql.adaptive.skewJoin.enabled=true"
                )

        # ── 5. Assemble report ──
        all_warnings = stage_warnings + executor_warnings + config_warnings
        if all_warnings and severity == "HEALTHY":
            severity = "WARNING"

        report = {
            "app_id": app_id,
            "severity": severity,
            "app_summary": app_info,
            "stage_summary": stage_summary,
            "executor_summary": executor_summary,
        }

        if all_warnings:
            report["warnings"] = all_warnings
        if suggestions:
            report["optimization_suggestions"] = suggestions
        if skew_details:
            report["skew_analysis"] = skew_details
        if findings:
            report["notes"] = findings
        if key_config:
            report["key_config"] = key_config

        report["keyhole_url"] = f"{KEYHOLE_BASE}/keyhole/diagnostics?applicationId={app_id}"
        if task_instance_code:
            report["task_instance_code"] = task_instance_code

        return json.dumps(report, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


# ──────────── Presto / Keyhole 工具 ────────────


@mcp.tool()
def get_presto_query_sql(presto_query_id: str = "", task_instance_code: str = "", env: str = "prod") -> str:
    """
    通过 Presto Query ID 或任务实例编码，从 Presto History Server 获取实际执行的 SQL。

    支持两种使用方式：
    1. 直接提供 presto_query_id（如果已知）
    2. 提供 task_instance_code，自动从 Scheduler 获取 Presto Query ID

    参数:
        presto_query_id: Presto 查询 ID，如 "SG_twspx-scheduled__gateway__5f786fe8_..."
        task_instance_code: 任务实例编码，如 "twbi_spx_ops.studio_6786158_202604012010_MINUTE_1"
        env: 环境，"prod"（默认）或 "dev"（仅在使用 task_instance_code 时生效）

    示例:
        get_presto_query_sql(presto_query_id="SG_twspx-scheduled__gateway__5f786fe8_2af2_464d_b78a_c4f9c621a018")
        get_presto_query_sql(task_instance_code="twbi_spx_ops.studio_6786158_202604012010_MINUTE_1")
    """
    try:
        if not presto_query_id and not task_instance_code:
            return json.dumps({"error": "请提供 presto_query_id 或 task_instance_code 之一"}, ensure_ascii=False)

        if not presto_query_id:
            presto_query_id = _get_instance_yarn_id(task_instance_code, env=env)
            if not presto_query_id:
                return json.dumps({
                    "error": f"实例 {task_instance_code} 没有关联的 Presto Query ID（可能不是 Presto 类型任务，或尚未开始执行）",
                }, ensure_ascii=False)

        cookies = _load_presto_cookies()
        url = f"{PRESTO_HISTORY_BASE}/ui/api/query/{presto_query_id}"
        resp = requests.get(url, cookies=cookies, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        session = data.get("session", {})
        stats = data.get("queryStats", {})

        result = {
            "query_id": data.get("queryId"),
            "presto_query_id": presto_query_id,
            "state": data.get("state"),
            "catalog": session.get("catalog"),
            "schema": session.get("schema"),
            "user": session.get("user"),
            "source": session.get("source"),
            "sql": data.get("query", ""),
            "elapsed_time": stats.get("elapsedTime"),
            "cpu_time": stats.get("totalCpuTime"),
            "peak_memory": stats.get("peakUserMemoryReservation"),
            "rows_output": stats.get("outputPositions"),
            "data_output": stats.get("outputDataSize"),
            "history_server_url": f"{PRESTO_HISTORY_BASE}/query.html?{presto_query_id}",
        }
        if task_instance_code:
            result["task_instance_code"] = task_instance_code
        return json.dumps(result, ensure_ascii=False, indent=2)
    except requests.RequestException as e:
        return json.dumps({"error": f"Presto History Server 请求失败: {e}"}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


def _extract_log_text(log_html: str) -> str:
    """从 Keyhole HTML 响应中提取纯文本日志内容。"""
    import html as html_mod

    pre_matches = re.findall(r'<pre[^>]*>(.*?)</pre>', log_html, re.DOTALL)
    text = "\n".join(pre_matches) if pre_matches else log_html
    return html_mod.unescape(text).strip()


def _fetch_spark_log_from_keyhole(app_id: str) -> str:
    """通过 Keyhole 三级跳获取 Spark Driver AM stdout 完整日志。

    链路:
    1. GET /keyhole/diagnostics?applicationId=... → 提取 AM stdout 链接
    2. GET stdout tail page (跟随重定向) → 提取 full log 链接 + origin 参数
    3. GET full log → 返回完整 HTML 日志
    """
    cookies = _load_keyhole_cookies()
    if not cookies:
        raise RuntimeError("未找到 data-infra Cookie，请先在浏览器登录 Keyhole 或 DataSuite")

    resp1 = requests.get(
        f"{KEYHOLE_BASE}/keyhole/diagnostics",
        params={"applicationId": app_id},
        cookies=cookies,
        timeout=30,
    )
    resp1.raise_for_status()

    stdout_links = re.findall(r'href="([^"]*stdout[^"]*)"', resp1.text)
    if not stdout_links:
        raise RuntimeError(f"Keyhole diagnostics 页面中未找到 AM stdout 日志链接（applicationId={app_id}）")
    stdout_path = stdout_links[0].replace("&amp;", "&")

    resp2 = requests.get(
        f"{KEYHOLE_BASE}{stdout_path}",
        cookies=cookies,
        timeout=30,
        allow_redirects=True,
    )
    resp2.raise_for_status()

    full_links = re.findall(r'href="([^"]*start=0[^"]*)"', resp2.text)
    if not full_links:
        raise RuntimeError("stdout 页面中未找到 full log 链接")
    full_path = full_links[0].replace("&amp;", "&")

    parsed = __import__("urllib.parse", fromlist=["urlparse", "parse_qs", "urlencode"])
    final_qs = parsed.parse_qs(parsed.urlparse(resp2.url).query)
    origin_params = {}
    for k in ("originSchema", "originHost", "originIp", "originPort"):
        if k in final_qs:
            origin_params[k] = final_qs[k][0]

    sep = "&" if "?" in full_path else "?"
    full_url = f"{KEYHOLE_BASE}{full_path}{sep}{parsed.urlencode(origin_params)}"

    resp3 = requests.get(full_url, cookies=cookies, timeout=120)
    resp3.raise_for_status()
    if not resp3.text.strip():
        raise RuntimeError("Full log 返回为空")
    return resp3.text


@mcp.tool()
def get_spark_query_sql(yarn_application_id: str = "", task_instance_code: str = "", env: str = "prod") -> str:
    """
    通过 Yarn Application ID 或任务实例编码，从 Keyhole 获取 Spark 任务的 Driver stdout 日志。

    适用于 Spark/Hive 类型的 Scheduler 任务（Presto 类型请用 get_presto_query_sql）。
    返回完整的 Driver AM stdout 日志文本，其中包含任务执行的 SQL 语句。

    支持两种使用方式:
    1. 直接提供 yarn_application_id（如 "application_1773126131675_5513239"）
    2. 提供 task_instance_code，自动从 Scheduler 获取 Yarn Application ID

    参数:
        yarn_application_id: Yarn Application ID，如 "application_1773126131675_5513239"
        task_instance_code: 任务实例编码，如 "mkpldp_shop_health.studio_6075240_20260401_DAY_1"
        env: 环境，"prod"（默认）或 "dev"（仅在使用 task_instance_code 时生效）

    示例:
        get_spark_query_sql(yarn_application_id="application_1773126131675_5513239")
        get_spark_query_sql(task_instance_code="mkpldp_shop_health.studio_6075240_20260401_DAY_1")
    """
    try:
        if not yarn_application_id and not task_instance_code:
            return json.dumps({"error": "请提供 yarn_application_id 或 task_instance_code 之一"}, ensure_ascii=False)

        if not yarn_application_id:
            yarn_application_id = _get_instance_yarn_id(task_instance_code, env=env)
            if not yarn_application_id:
                return json.dumps({
                    "error": f"实例 {task_instance_code} 没有关联的 Yarn Application ID（可能尚未执行或不是 Spark 类型任务）",
                }, ensure_ascii=False)

        result = {
            "yarn_application_id": yarn_application_id,
            "keyhole_url": f"{KEYHOLE_BASE}/keyhole/diagnostics?applicationId={yarn_application_id}",
        }
        if task_instance_code:
            result["task_instance_code"] = task_instance_code

        # Primary: Keyhole stdout log
        try:
            log_html = _fetch_spark_log_from_keyhole(yarn_application_id)
            log_text = _extract_log_text(log_html)
            result["log"] = log_text
        except Exception as keyhole_err:
            result["keyhole_error"] = str(keyhole_err)

        # Fallback: SHS /sql endpoint for structured SQL
        if "log" not in result:
            try:
                sql_data = _spark_history_get(yarn_application_id, "/sql?details=true")
                if isinstance(sql_data, list) and sql_data:
                    sqls = []
                    for sq in sql_data:
                        desc = sq.get("description", "")
                        plan = sq.get("planDescription", "")
                        if desc or plan:
                            sqls.append(desc[:2000])
                    if sqls:
                        result["sql_from_history_server"] = sqls
                        result["note"] = "Keyhole 日志不可用，SQL 从 Spark History Server 获取"
            except Exception:
                pass

        if "log" not in result and "sql_from_history_server" not in result:
            result["error"] = result.pop("keyhole_error", "无法获取 SQL 信息")

        result["tip"] = "使用 diagnose_spark_app 可获取更详细的 Stage/Executor/SQL 计划诊断"
        return json.dumps(result, ensure_ascii=False, indent=2)
    except requests.RequestException as e:
        return json.dumps({"error": f"Keyhole 请求失败: {e}"}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


def main():
    mcp.run()


if __name__ == "__main__":
    main()

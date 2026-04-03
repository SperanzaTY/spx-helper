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
from chrome_auth import get_cookies
from mcp.server.fastmcp import FastMCP

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ──────────────────────────── Cookie 管理 ────────────────────────────

DOMAIN = "datasuite.shopee.io"
DATA_INFRA_DOMAIN = "data-infra.shopee.io"


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
    return get_cookies(domain=DATA_INFRA_DOMAIN)


def _load_keyhole_cookies() -> dict:
    """获取 Keyhole (data-infra) 所需的 cookie。"""
    return get_cookies(domain=DATA_INFRA_DOMAIN)


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
                result["tip"] = "这是 Spark/Hive 任务，使用 get_spark_query_sql 传入 yarn_application_id 可获取实际执行的 SQL"
            else:
                result["presto_history_url"] = f"{PRESTO_HISTORY_BASE}/query.html?{yarn_id}"
                result["tip"] = "这是 Presto 任务，使用 get_presto_query_sql 传入 yarn_application_id 可获取实际执行的 SQL"

        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


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

        log_html = _fetch_spark_log_from_keyhole(yarn_application_id)
        log_text = _extract_log_text(log_html)

        result = {
            "yarn_application_id": yarn_application_id,
            "keyhole_url": f"{KEYHOLE_BASE}/keyhole/diagnostics?applicationId={yarn_application_id}",
            "log": log_text,
        }
        if task_instance_code:
            result["task_instance_code"] = task_instance_code

        return json.dumps(result, ensure_ascii=False, indent=2)
    except requests.RequestException as e:
        return json.dumps({"error": f"Keyhole 请求失败: {e}"}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


def main():
    mcp.run()


if __name__ == "__main__":
    main()

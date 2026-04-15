# -*- coding: utf-8 -*-
"""Scheduler 辅助：从 taskInstanceCode 解析 taskCode；Presto History SQL 启发式提示（无 MCP / requests 依赖，便于单测）。"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional

# 实例编码 -> taskCode：去掉首段「业务时间 + 周期 + 分片」等后缀。
# Studio 常见周期后缀名：DAY / HOUR / MINUTE / MONTH / WEEK / YEAR / QUARTER 等；
# 业务时间可能是 YYYYMMDD、YYYYMMDDHH、YYYYMMDDHHMM、YYYYMM 等，不能仅靠「下一段是否 8 位数字」判断。
_STUDIO_TASK_CODE_RE = re.compile(r"^(.+?\.studio_\d+)_.+$")
# 例: spx_mart.datahub.etl_batch.281196_20260101_DAY_1
_ETL_BATCH_TASK_CODE_RE = re.compile(r"^(.+?\.etl_batch\.\d+)_.+$")
# 例: spx_datamart.datahub.bti.422404.hdfscopy_20260414_DAY_1
_DATAHUB_BTI_TASK_CODE_RE = re.compile(
    r"^(.+?\.datahub\.bti\.\d+\.[^_]+)_\d{6,}_(DAY|HOUR|MINUTE|MONTH|WEEK|YEAR|QUARTER)_\d+$"
)


def extract_task_code(task_instance_code: str) -> str:
    """从实例编码 taskInstanceCode 中解析 Scheduler 的 taskCode。

    Data Studio 常见实例后缀（下划线分隔，studio_<数字>_ 之后为调度实例后缀）：

    - 天: {project}.studio_<id>_YYYYMMDD_DAY_<seq>
    - 小时: {project}.studio_<id>_YYYYMMDDHH_HOUR_<seq>（如 10 位业务时戳 + HOUR）
    - 分钟: {project}.studio_<id>_YYYYMMDDHHMM_MINUTE_<seq>
    - 月: {project}.studio_<id>_YYYYMM_MONTH_<seq>（业务月 6 位，旧逻辑易误判）
    - 周/年等: ..._YYYY_WEEK_<seq>、..._YYYY_YEAR_<seq> 等

    其它: {project}.datahub.etl_batch.<batchId>_... 等独立命名任务。

    示例:
    spx_mart.studio_10429983_20260401_DAY_1 -> spx_mart.studio_10429983
    regops_spx.studio_10628558_2026041417_HOUR_1 -> regops_spx.studio_10628558
    twbi_spx_ops.studio_6786158_202604012010_MINUTE_1 -> twbi_spx_ops.studio_6786158
    idecbi_sc.studio_8044569_202604_MONTH_1 -> idecbi_sc.studio_8044569
    spx_mart.datahub.etl_batch.281196_20260101_DAY_1 -> spx_mart.datahub.etl_batch.281196
    spx_datamart.datahub.bti.422404.hdfscopy_20260414_DAY_1 -> spx_datamart.datahub.bti.422404.hdfscopy
    """
    s = task_instance_code.strip()
    if not s:
        return task_instance_code

    m = _STUDIO_TASK_CODE_RE.match(s)
    if m:
        return m.group(1)
    m = _ETL_BATCH_TASK_CODE_RE.match(s)
    if m:
        return m.group(1)
    m = _DATAHUB_BTI_TASK_CODE_RE.match(s)
    if m:
        return m.group(1)

    # 兼容旧逻辑：下一段为「>=8 位纯数字」时间戳的实例
    parts = s.split(".")
    if len(parts) < 2:
        return s
    project = parts[0]
    rest = ".".join(parts[1:])
    tokens = rest.split("_")
    for i, tok in enumerate(tokens):
        if i > 0 and tok.isdigit():
            if i + 1 < len(tokens) and len(tokens[i + 1]) >= 8 and tokens[i + 1].isdigit():
                return f"{project}.{'_'.join(tokens[:i+1])}"
    return s


def presto_history_sql_hints(sql: Optional[str]) -> Dict[str, Any]:
    """Heuristics on Presto History `query` text when ID is bound from Scheduler yarnApplicationId (single query)."""
    hints: Dict[str, Any] = {}
    s = (sql or "").strip()
    if not s:
        hints["presto_sql_warning"] = (
            "Presto History 返回的 query 文本为空。请到 DataSuite 实例页核对 Yarn 绑定的是否为占位或失败记录，"
            "或改用已知的 presto_query_id 参数重试 get_presto_query_sql。"
        )
        return hints
    ul = s.lstrip().upper()
    ddl_prefixes = (
        "ALTER ",
        "RENAME ",
        "CREATE ",
        "DROP ",
        "SHOW ",
        "DESCRIBE ",
        "GRANT ",
        "REVOKE ",
    )
    if any(ul.startswith(p) for p in ddl_prefixes):
        hints["presto_sql_kind"] = "ddl_or_metadata"
        hints["presto_sql_warning"] = (
            "当前 History 中的 SQL 呈现为 DDL/元数据类语句，未必是业务 INSERT/SELECT。"
            "Scheduler 的 yarn_application_id 通常只对应一次 Presto 提交；同一实例可能有多条 Query。"
            "请到实例详情核对其它 Presto Query ID，或向 get_presto_query_sql 直接传入 presto_query_id。"
        )
    elif ul.startswith("INSERT"):
        hints["presto_sql_kind"] = "dml_insert"
    elif ul.startswith("SELECT") or ul.startswith("(SELECT"):
        hints["presto_sql_kind"] = "select"
    else:
        hints["presto_sql_kind"] = "other"
    return hints

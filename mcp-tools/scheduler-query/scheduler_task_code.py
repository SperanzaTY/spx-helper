# -*- coding: utf-8 -*-
"""从 Scheduler taskInstanceCode 解析 taskCode（无 MCP / requests 依赖，便于单测）。"""

from __future__ import annotations

import re

# 实例编码 -> taskCode：去掉首段「业务时间 + 周期 + 分片」等后缀。
# Studio 常见周期后缀名：DAY / HOUR / MINUTE / MONTH / WEEK / YEAR / QUARTER 等；
# 业务时间可能是 YYYYMMDD、YYYYMMDDHH、YYYYMMDDHHMM、YYYYMM 等，不能仅靠「下一段是否 8 位数字」判断。
_STUDIO_TASK_CODE_RE = re.compile(r"^(.+?\.studio_\d+)_.+$")
# 例: spx_mart.datahub.etl_batch.281196_20260101_DAY_1
_ETL_BATCH_TASK_CODE_RE = re.compile(r"^(.+?\.etl_batch\.\d+)_.+$")


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

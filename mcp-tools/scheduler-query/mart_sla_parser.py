# -*- coding: utf-8 -*-
"""新 Mart SLA 告警正文解析（纯本地，无网络依赖）。"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Set

# 实例编码：Studio / DataHub BTI / etl_batch 等（与 scheduler_task_code 语义对齐）
_RE_STUDIO_INST = re.compile(
    r"\b([\w.]+\.studio_\d+_\d{6,}_(?:DAY|HOUR|MINUTE|MONTH|WEEK|YEAR|QUARTER)_\d+)\b"
)
_RE_BTI_INST = re.compile(
    r"\b([\w.]+\.datahub\.bti\.\d+\.[^_\s]+_\d{6,}_(?:DAY|HOUR|MINUTE|MONTH|WEEK|YEAR|QUARTER)_\d+)\b"
)
_RE_ETL_BATCH_INST = re.compile(
    r"\b([\w.]+\.datahub\.etl_batch\.\d+_\d{6,}_(?:DAY|HOUR|MINUTE|MONTH|WEEK|YEAR|QUARTER)_\d+)\b"
)


def _collect_instance_codes(text: str) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for rx in (_RE_STUDIO_INST, _RE_BTI_INST, _RE_ETL_BATCH_INST):
        for m in rx.finditer(text):
            code = m.group(1)
            if code not in seen:
                seen.add(code)
                out.append(code)
    return out


def parse_mart_sla_alert(alert_text: str) -> Dict[str, Any]:
    """从 SeaTalk / 邮件粘贴的「新 mart SLA」英文告警中提取结构化字段。

    兼容常见模板：Your SLA ... (schema.table) in Data Environment prod ...
    Business Time / Configured SLA / Estimated Completion / Related Events / shp.ee 链接。
    """
    raw = (alert_text or "").strip()
    warnings: List[str] = []

    if not raw:
        return {
            "ok": False,
            "error": "alert_text 为空",
            "task_instance_codes": [],
        }

    sla_rule = ""
    mart_table = ""
    m_sla = re.search(r"Your SLA\s+(\S+)\s*\(([^)]+)\)", raw, re.I)
    if m_sla:
        sla_rule = m_sla.group(1).strip()
        mart_table = m_sla.group(2).strip()
    else:
        warnings.append("未匹配到「Your SLA ... (table)」模板，sla_rule / mart_table 可能为空")

    env_m = re.search(r"Data Environment\s+(\w+)", raw, re.I)
    data_environment = env_m.group(1).strip() if env_m else ""

    # 单行粘贴时不能用「到换行」吞字段，时间统一抓 YYYY-MM-DD HH:MM:SS
    _ts = r"\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}"

    def _field_ts(label: str) -> str:
        pat = rf"{label}\s*(?:\([^)]+\))?\s*:\s*({_ts})"
        mm = re.search(pat, raw, re.I)
        return mm.group(1).strip() if mm else ""

    business_time = _field_ts("Business Time")
    configured_sla = _field_ts("Configured SLA")
    estimated_completion = _field_ts("Estimated Completion")

    rel_m = re.search(r"Related Events:\s*(.*?)(?=For more details|\Z)", raw, re.I | re.S)
    related_events_raw = rel_m.group(1).strip() if rel_m else ""

    detail_urls = re.findall(r"https://shp\.ee/\w+", raw, re.I)

    codes = _collect_instance_codes(raw)
    if not codes and related_events_raw and related_events_raw not in ("-", "—", "无", "none", "None"):
        warnings.append("Related Events 非空但未解析出 taskInstanceCode，请检查是否为非标准格式")

    return {
        "ok": True,
        "sla_rule_name": sla_rule,
        "mart_table": mart_table,
        "data_environment": data_environment,
        "business_time": business_time,
        "configured_sla": configured_sla,
        "estimated_completion": estimated_completion,
        "related_events_raw": related_events_raw,
        "detail_urls": detail_urls,
        "task_instance_codes": codes,
        "parse_warnings": warnings,
    }


def build_triage_markdown(parsed: Dict[str, Any], instance_blocks: List[Dict[str, Any]]) -> str:
    """生成简报 Markdown（供 triage 工具与 JSON 一并返回）。"""
    lines: List[str] = ["## Mart SLA 分诊简报", ""]
    if parsed.get("sla_rule_name"):
        lines.append(f"- **SLA 规则**: `{parsed['sla_rule_name']}`")
    if parsed.get("mart_table"):
        lines.append(f"- **Mart 表**: `{parsed['mart_table']}`")
    if parsed.get("data_environment"):
        lines.append(f"- **环境**: `{parsed['data_environment']}`")
    if parsed.get("business_time"):
        lines.append(f"- **业务日**: {parsed['business_time']}")
    if parsed.get("configured_sla"):
        lines.append(f"- **承诺 SLA**: {parsed['configured_sla']}")
    if parsed.get("estimated_completion"):
        lines.append(f"- **预计完成**: {parsed['estimated_completion']}")
    urls = parsed.get("detail_urls") or []
    if urls:
        lines.append(f"- **详情链接**: {', '.join(urls)}")
    lines.append("")

    if not instance_blocks:
        lines.append(
            "**Scheduler**: 未从正文中解析到 `taskInstanceCode`，"
            "请到 DataSuite 详情页复制实例编码后使用 `get_instance_detail`。"
        )
    else:
        lines.append("### 关联实例（Scheduler）")
        for blk in instance_blocks:
            code = blk.get("task_instance_code", "")
            detail = blk.get("detail") or {}
            err = detail.get("error") if isinstance(detail, dict) else None
            status = detail.get("status") if isinstance(detail, dict) else None
            yarn = detail.get("yarn_application_id") if isinstance(detail, dict) else None
            msg = detail.get("message") if isinstance(detail, dict) else None
            lines.append(f"- **`{code}`**")
            if err:
                lines.append(f"  - 详情接口: {err}")
            else:
                lines.append(f"  - 状态: {status or '未知'}")
                if yarn:
                    lines.append(f"  - yarnApplicationId: `{yarn}`")
                if msg:
                    short = str(msg).replace("\n", " ")[:240]
                    lines.append(f"  - message: {short}")
            for t in blk.get("next_steps") or []:
                lines.append(f"  - {t}")
            lines.append("")

    for w in parsed.get("parse_warnings") or []:
        lines.append(f"[NOTE] {w}")

    lines.extend(
        [
            "",
            "### 建议下一步",
            "- 若实例 **Failed**：根据 `message` 与日志尾定位根因；Spark 可看 `get_spark_query_sql` / `diagnose_spark_app`。",
            "- 若实例 **Running** 但 SLA 仍延迟：关注队列、数据量、上游依赖是否未就绪。",
            "- Presto 实例：`get_presto_query_sql(task_instance_code=...)`。",
        ]
    )
    return "\n".join(lines)


def instance_next_steps(detail: Dict[str, Any], deep_spark: bool) -> List[str]:
    """根据实例详情生成简短下一步提示。"""
    tips: List[str] = []
    if not isinstance(detail, dict) or detail.get("error"):
        return tips
    yarn = detail.get("yarn_application_id") or ""
    status = detail.get("status") or ""
    if yarn.startswith("application_"):
        tips.append("Spark/Hive：可用 `get_spark_query_sql`；更重诊断用 `diagnose_spark_app`。")
        if deep_spark:
            tips.append("已请求 deep_spark：已尝试拉取 Spark 应用摘要（若失败见 JSON）。")
    elif yarn:
        tips.append("Presto：使用 `get_presto_query_sql` 拉 History SQL。")
    if "Failed" in status:
        tips.append("状态为失败：优先阅读实例 `message` 与日志尾部。")
    return tips

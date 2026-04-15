# -*- coding: utf-8 -*-
"""DataSuite SLA 子服务：从 ``slaInstance/get`` 等接口解析 Scheduler 实例编码（供短链闭环）。"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from mart_sla_parser import collect_instance_codes_from_text


def build_sla_instance_get_params(resolved_shortlink: Dict[str, Any]) -> Optional[Dict[str, str]]:
    """从 ``resolve_mart_sla_shortlink`` 的返回 dict 构造 ``slaInstance/get`` 的 query 参数。"""
    if not resolved_shortlink.get("ok"):
        return None
    sla_code = (resolved_shortlink.get("sla_code") or "").strip()
    inst_key = (resolved_shortlink.get("sla_instance_key") or "").strip()
    project = (resolved_shortlink.get("project_code") or "").strip()
    if not sla_code or not inst_key:
        return None
    p: Dict[str, str] = {"slaCode": sla_code, "slaInstanceCode": inst_key}
    if project:
        p["projectCode"] = project
    return p


def extract_task_codes_from_sla_instance_get(data: Any) -> List[str]:
    """从 ``slaInstance/get`` 的 JSON 响应中提取 Scheduler ``taskInstanceCode``（去重保序）。"""
    if not isinstance(data, dict):
        return []
    payload = data.get("data")
    if not isinstance(payload, dict):
        payload = data

    direct: List[str] = []
    for key in (
        "curRunTaskInstanceCode",
        "estimateLastTaskInstanceCode",
        "cur_run_task_instance_code",
        "estimate_last_task_instance_code",
    ):
        v = payload.get(key)
        if isinstance(v, str) and v.strip():
            direct.append(v.strip())

    nested = collect_instance_codes_from_text(json.dumps(data, ensure_ascii=False))

    seen = set()
    out: List[str] = []
    for c in direct + nested:
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out

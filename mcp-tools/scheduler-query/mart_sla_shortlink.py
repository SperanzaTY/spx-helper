# -*- coding: utf-8 -*-
"""shp.ee 短链解析为 DataSuite「新 Mart SLA」详情页 URL（无需登录，仅跟随 HTTP 头）。"""

from __future__ import annotations

import re
import urllib.parse
from typing import Any, Dict, Optional

import requests

_SHP_HOST = re.compile(r"^https?://shp\.ee/", re.I)
_SLA_DETAIL_PATH = re.compile(r"/scheduler/sla/instance/detail/([^/?#]+)")


def _parse_datasuite_sla_absolute(url: str) -> Dict[str, Any]:
    """从已指向 datasuite 的 SLA 详情 URL 解析字段。"""
    p = urllib.parse.urlparse(url.strip())
    qs = urllib.parse.parse_qs(p.query, keep_blank_values=True)
    m = _SLA_DETAIL_PATH.search(p.path or "")
    sla_instance_key = m.group(1) if m else ""
    sla_code = (qs.get("slaCode") or [""])[0]
    project_code = (qs.get("projectCode") or [""])[0]
    sla_biz = (qs.get("slaBizTime") or [""])[0]
    return {
        "ok": True,
        "mode": "datasuite_direct",
        "datasuite_sla_open_url": url.strip(),
        "sla_instance_key": sla_instance_key,
        "sla_code": urllib.parse.unquote(sla_code) if sla_code else "",
        "project_code": urllib.parse.unquote(project_code) if project_code else "",
        "sla_biz_time_param": urllib.parse.unquote(sla_biz.replace("+", " ")) if sla_biz else "",
    }


def parse_shortlink_landing_location(location: str) -> Dict[str, Any]:
    """从 shp.ee 第一次跳转的 Location（或等价 URL）解析出可在浏览器打开的 DataSuite SLA 链接。

    典型形态：``...shopeemobile.com/fe-public/landing-page.html?...&pc=URL编码的datasuite链接&projectCode=...&slaBizTime=...``
    """
    loc = (location or "").strip()
    if not loc:
        return {"ok": False, "error": "Location 为空"}

    if "datasuite.shopee.io" in loc and "/scheduler/sla/" in loc:
        return _parse_datasuite_sla_absolute(loc)

    if "shopeemobile.com" in loc and "pc=" in loc:
        parsed = urllib.parse.urlparse(loc)
        qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        pc_enc = (qs.get("pc") or [""])[0]
        pc_dec = urllib.parse.unquote(pc_enc) if pc_enc else ""
        if not pc_dec or "datasuite.shopee.io" not in pc_dec:
            return {"ok": False, "error": "落地页中未找到有效的 pc 参数", "landing_url": loc}

        project_code = (qs.get("projectCode") or [""])[0]
        sla_biz_raw = (qs.get("slaBizTime") or [""])[0]

        merged = pc_dec
        if project_code:
            merged += "&" if "?" in merged else "?"
            merged += f"projectCode={urllib.parse.quote(project_code, safe='')}"
        if sla_biz_raw:
            merged += "&" if "?" in merged else "?"
            merged += f"slaBizTime={urllib.parse.quote(sla_biz_raw, safe='')}"

        inner = _parse_datasuite_sla_absolute(pc_dec)
        inner["ok"] = True
        inner["mode"] = "shopeemobile_landing_pc"
        inner["landing_url"] = loc
        inner["datasuite_sla_open_url"] = merged
        inner["project_code"] = inner.get("project_code") or urllib.parse.unquote(project_code)
        inner["sla_biz_time_param"] = inner.get("sla_biz_time_param") or urllib.parse.unquote(
            sla_biz_raw.replace("+", " ")
        )
        return inner

    return {"ok": False, "error": "无法识别的短链落地格式", "landing_url": loc}


def resolve_mart_sla_shortlink(shp_url: str, timeout: float = 15.0) -> Dict[str, Any]:
    """HEAD shp.ee 短链，从 Location 解析 DataSuite SLA 详情页 URL（不调用 DataSuite API、无需 Cookie）。"""
    raw = (shp_url or "").strip()
    if not raw:
        return {"ok": False, "error": "URL 为空"}
    if not _SHP_HOST.match(raw):
        return {"ok": False, "error": "仅支持 https://shp.ee/ 短链"}

    try:
        resp = requests.head(raw, allow_redirects=False, timeout=timeout)
    except requests.RequestException as e:
        return {"ok": False, "error": f"请求短链失败: {e}", "input_url": raw}

    loc: Optional[str] = resp.headers.get("Location") or resp.headers.get("location")
    if not loc:
        return {
            "ok": False,
            "error": "响应无 Location 头（短链服务可能要求 GET）",
            "input_url": raw,
            "status_code": resp.status_code,
        }

    if loc.startswith("/"):
        loc = urllib.parse.urljoin(raw, loc)

    parsed = parse_shortlink_landing_location(loc)
    parsed["input_url"] = raw
    parsed["http_status"] = resp.status_code
    parsed["redirect_location"] = loc
    if parsed.get("ok"):
        parsed["note"] = (
            "此为浏览器打开用的 DataSuite 页面 URL；页面内 XHR 才是结构化数据。"
            "若需 MCP 直拉详情 JSON，请在已登录 DataSuite 的 Chrome 中打开该页，"
            "从 DevTools Network 复制对应 API 路径后反馈给维护者接入 _request。"
        )
    return parsed

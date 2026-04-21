#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""刷新 Google Sheet「All-SLA」「All-BR」：taskCode、SLA 归属、latest_finish、时间差。

启动时默认通过 ``mcp-tools/chrome-auth`` 从本机 Chrome Cookie 库/CDP 自动获取 DataSuite 会话，
探测成功后写回 ``DATASUITE_COOKIES_JSON``（默认 ``/tmp/ds_cookies.json``）。
可用 ``SPX_SKIP_CHROME_AUTH=1`` 强制只读已有 JSON。

规则（与 DataSuite 手工核对一致）：
- 同一 taskCode 命中多个 SLA 时，仅保留 slaTimeDef（当日约定时刻）更「晚」的 SLA；
  若多条 SLA 的 slaTimeDef 相同且同为最大，则全部保留。
- 「最近完成时间」取所有分页里 instanceStatus=30 且带 endRunTime 的实例中 endRunTime 的最大值
  （不得使用列表第一条成功实例，因 updateTimeOrder 未必按结束时间排序）。
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import requests

REPO_ROOT = Path(__file__).resolve().parents[1]
_CHROME_AUTH_ROOT = REPO_ROOT / "mcp-tools" / "chrome-auth"

try:
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build
except ImportError as e:
    print("需要安装: pip install google-api-python-client google-auth", file=sys.stderr)
    raise SystemExit(1) from e

SID_DEFAULT = "1vtdwRwRAdh1Bx_2eeg78kuFMamlhLvJyqiAgqx_FMqk"
COOKIE_DEFAULT = "/tmp/ds_cookies.json"
SA_DEFAULT = os.path.expanduser("~/.config/spx-helper/google-sa.json")

# 兜底：历史上 sheet 里出现过的 SLA 短名（防 M 列格式异常漏载）
FALLBACK_SLA_SHORTS: Set[str] = {
    "fundmart__data_observation_sgidc__400_medium",
    "fundmart__data_observation_sgidc__500_medium",
    "fundmart__data_observation_sgidc__600_medium",
    "fundmart__data_observation_sgidc__700_medium",
    "fundmart__data_observation_sgidc__hour_medium",
    "fundmart__data_observation_sgidc__1500_medium",
    "fundmart__data_observation_sgidc__1700_medium",
    "fundmart__data_observation_sgidc__730_medium",
    "fundmart__data_observation_usidc__1830_medium",
    "fundmart__data_observation_usidc__1900_medium",
    "fundmart_data2_observation_sgidc__400_medium",
    "fundmart_data2_observation_sgidc__600_medium",
    "fundmart_view_observation_sgidc__400_medium",
    "fundmart_view_observation_sgidc__700_medium",
    "fundmart_data_observation_usidc__hour_medium",
}


def _hdr(project: str, csrf: str) -> Dict[str, str]:
    h = {
        "accept": "application/json",
        "referer": "https://datasuite.shopee.io/scheduler",
        "x-datasuites-project-code": project,
    }
    if csrf:
        h["x-csrf-token"] = csrf
    return h


def _hhmm_to_minutes(s: str) -> Optional[int]:
    s = (s or "").strip()
    if not s:
        return None
    parts = s.split(":")
    if len(parts) < 2:
        return None
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except ValueError:
        return None


def filter_memberships_by_latest_sla_time(
    memberships: List[str],
    sla_cache: Dict[str, Dict[str, Any]],
) -> List[str]:
    """同一 task 对应多个 SLA 时，去掉 slaTimeDef 较小的，只保留时刻最晚的（并列全留）。"""
    if len(memberships) <= 1:
        return memberships

    parsed: List[Tuple[int, str]] = []
    for code in memberships:
        info = sla_cache.get(code) or {}
        td = info.get("slaTimeDef") or ""
        m = _hhmm_to_minutes(td)
        if m is None:
            continue
        parsed.append((m, code))

    if not parsed:
        return memberships

    mx = max(p[0] for p in parsed)
    kept = sorted({code for mm, code in parsed if mm == mx})
    return kept


def full_sla_code(short: str) -> str:
    s = (short or "").strip()
    if not s:
        return ""
    if s.startswith("spx_datamart."):
        return s
    return f"spx_datamart.{s}"


def period_label(pt: Any) -> str:
    if pt == 1:
        return "HOURLY"
    if pt == 2:
        return "DAILY"
    return str(pt) if pt is not None else ""


def diff_minutes(end_iso: str, sla_hhmm: str) -> str:
    if not end_iso or not sla_hhmm:
        return ""
    try:
        end = datetime.fromisoformat(end_iso.replace("+0800", "+08:00"))
        parts = str(sla_hhmm).strip().split(":")
        if len(parts) < 2:
            return ""
        hh, mm = int(parts[0]), int(parts[1])
        sla_dt = end.replace(hour=hh, minute=mm, second=0, microsecond=0)
        return str(int((end - sla_dt).total_seconds() // 60))
    except Exception:
        return ""


def probe_datasuite_cookie(ck: Dict[str, str]) -> bool:
    """轻量探测 DataSuite 会话是否可用（读一条 SLA 定义）。"""
    if not ck:
        return False
    csrf = ck.get("CSRF-TOKEN") or ""
    r = requests.get(
        "https://datasuite.shopee.io/sla/sla/getAllStatus",
        params={"slaCode": "spx_datamart.fundmart__data_observation_sgidc__1700_medium"},
        cookies=ck,
        headers=_hdr("spx_datamart", csrf),
        timeout=15,
    )
    if r.status_code != 200:
        return False
    try:
        return bool(r.json().get("success"))
    except Exception:
        return False


def acquire_datasuite_cookies(cookie_path: str) -> Tuple[Dict[str, str], str]:
    """优先用 chrome-auth 从本机 Chrome / CDP 自动拉 Cookie；失败再用 JSON 文件。

    环境变量:
    - ``SPX_SKIP_CHROME_AUTH=1``：跳过 chrome-auth，只读 ``DATASUITE_COOKIES_JSON``。
    """
    path = os.path.expanduser(cookie_path)

    if os.environ.get("SPX_SKIP_CHROME_AUTH", "").strip() in ("1", "true", "yes"):
        if not os.path.isfile(path):
            raise SystemExit(
                f"SPX_SKIP_CHROME_AUTH 已启用但未找到 Cookie 文件: {path}"
            )
        with open(path, encoding="utf-8") as f:
            ck = json.load(f)
        if not probe_datasuite_cookie(ck):
            raise SystemExit(f"Cookie 文件无效或已过期（探测 DataSuite 失败）: {path}")
        return ck, f"file_only:{path}"

    if str(_CHROME_AUTH_ROOT) not in sys.path:
        sys.path.insert(0, str(_CHROME_AUTH_ROOT))

    try:
        from chrome_auth import get_auth, invalidate_domain
    except ImportError:
        get_auth = None  # type: ignore[assignment]
        invalidate_domain = None  # type: ignore[assignment]

    def persist(cookies: Dict[str, str]) -> None:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(cookies, f, indent=0)

    if get_auth:
        auth = get_auth("datasuite.shopee.io", force=True)
        if auth.cookies:
            if not probe_datasuite_cookie(auth.cookies):
                if invalidate_domain:
                    invalidate_domain("datasuite.shopee.io")
                auth = get_auth(
                    "datasuite.shopee.io",
                    force=True,
                    auth_failed=True,
                )
            if auth.cookies and probe_datasuite_cookie(auth.cookies):
                persist(auth.cookies)
                return auth.cookies, f"chrome_auth:{auth.source}->{path}"

    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            ck = json.load(f)
        if probe_datasuite_cookie(ck):
            return ck, f"file:{path}"
        if get_auth and invalidate_domain:
            invalidate_domain("datasuite.shopee.io")
            auth = get_auth(
                "datasuite.shopee.io",
                force=True,
                auth_failed=True,
            )
            if auth.cookies and probe_datasuite_cookie(auth.cookies):
                persist(auth.cookies)
                return auth.cookies, f"chrome_auth_retry:{auth.source}->{path}"

    raise SystemExit(
        "无法获取可用 DataSuite Cookie。\n"
        "  1) 在本机用 Chrome 登录 https://datasuite.shopee.io 后重试；\n"
        "  2) 或设置 DATASUITE_COOKIES_JSON 指向有效 JSON；\n"
        "  3) 若仅用文件、不装 chrome-auth：SPX_SKIP_CHROME_AUTH=1\n"
        f"  （chrome-auth 路径: {_CHROME_AUTH_ROOT}）"
    )


def collect_short_names_from_col_m(svc: Any, spreadsheet_id: str) -> Set[str]:
    shorts: Set[str] = set()
    for rng in ("'All-SLA'!M2:M1200", "'All-BR'!M2:M400"):
        resp = (
            svc.spreadsheets()
            .values()
            .get(spreadsheetId=spreadsheet_id, range=rng)
            .execute()
        )
        for r in resp.get("values") or []:
            if not r or not r[0]:
                continue
            raw = r[0]
            for part in raw.replace(",", ";").split(";"):
                p = part.strip()
                if p:
                    shorts.add(p)
    return shorts


def load_sla_cache(short_names: Set[str], ck: Dict[str, str]) -> Dict[str, Dict[str, Any]]:
    csrf = ck.get("CSRF-TOKEN") or ""
    out: Dict[str, Dict[str, Any]] = {}
    for short in sorted(short_names):
        code = full_sla_code(short)
        r = requests.get(
            "https://datasuite.shopee.io/sla/sla/getAllStatus",
            params={"slaCode": code},
            cookies=ck,
            headers=_hdr("spx_datamart", csrf),
            timeout=35,
        )
        if r.status_code == 401:
            raise SystemExit("DataSuite 401：请更新 Cookie（含 CSRF）后重试")
        d = r.json()
        data = d.get("data") if d.get("success") else None
        if not data:
            continue
        tasks = []
        for t in data.get("slaTasks") or []:
            tc = t.get("taskCode")
            if tc:
                tasks.append(tc)
        out[code] = {
            "short": short,
            "slaTimeDef": data.get("slaTimeDef") or "",
            "periodType": data.get("slaPeriodType"),
            "period": period_label(data.get("slaPeriodType")),
            "task_set": set(tasks),
        }
        time.sleep(0.04)
    return out


def build_task_to_slas(sla_cache: Dict[str, Dict[str, Any]]) -> Dict[str, List[str]]:
    m: Dict[str, List[str]] = {}
    for code, info in sla_cache.items():
        for tc in info["task_set"]:
            m.setdefault(tc, []).append(code)
    for tc in m:
        m[tc] = sorted(set(m[tc]))
    return m


def get_list(task_name: str, idc: int, ck: Dict[str, str]) -> List[Dict[str, Any]]:
    csrf = ck.get("CSRF-TOKEN") or ""
    r = requests.get(
        "https://datasuite.shopee.io/scheduler/api/v1/task/getList",
        params={
            "taskName": task_name,
            "pageSize": 40,
            "pageNo": 1,
            "search": 1,
            "idcRegion": idc,
        },
        cookies=ck,
        headers=_hdr("spx_datamart", csrf),
        timeout=25,
    )
    if r.status_code == 401:
        return []
    d = r.json()
    if not d.get("success"):
        return []
    return (d.get("data") or {}).get("list") or []


def resolve_task_code(
    task_name: str,
    idc: int,
    ck: Dict[str, str],
    cache: Dict[Tuple[str, int], str],
) -> str:
    key = (task_name, idc)
    if key in cache:
        return cache[key]
    if not task_name:
        cache[key] = ""
        return ""
    items = get_list(task_name, idc, ck)
    exact = [i for i in items if i.get("taskName") == task_name]

    if idc == 1:
        cand = [
            i
            for i in exact
            if "datahub" in (i.get("taskCode") or "")
            and "createtable" in (i.get("taskCode") or "")
        ]
        if cand:
            cache[key] = cand[0].get("taskCode") or ""
            return cache[key]
        if exact:
            cache[key] = exact[0].get("taskCode") or ""
            return cache[key]
        cand2 = [
            i
            for i in items
            if "datahub" in (i.get("taskCode") or "")
            and "createtable" in (i.get("taskCode") or "")
        ]
        if cand2:
            cache[key] = cand2[0].get("taskCode") or ""
            return cache[key]
        cache[key] = items[0].get("taskCode") if items else ""
        return cache[key]

    st = [i for i in exact if "studio_" in (i.get("taskCode") or "")]
    if st:
        cache[key] = st[0].get("taskCode") or ""
        return cache[key]
    if exact:
        cache[key] = exact[0].get("taskCode") or ""
        return cache[key]
    cache[key] = ""
    return cache[key]


def latest_finish_max_end(
    task_code: str,
    ck: Dict[str, str],
    inst_cache: Dict[str, Tuple[str, str]],
    *,
    page_size: int = 80,
    max_pages: int = 8,
) -> Tuple[str, str]:
    """返回 (iso_end, 格式化展示)。

    分页拉取至多 max_pages * page_size 条实例，在所有 instanceStatus==30 且含 endRunTime 的记录里
    取 **endRunTime 最大** 的一条（不要用列表顺序当「最新」）。
    """
    if not task_code:
        return "", ""
    if task_code in inst_cache:
        return inst_cache[task_code]

    proj = task_code.split(".")[0] if "." in task_code else "spx_datamart"
    csrf = ck.get("CSRF-TOKEN") or ""
    best_iso = ""
    best_dt: Optional[datetime] = None

    for page in range(1, max_pages + 1):
        r = requests.get(
            "https://datasuite.shopee.io/scheduler/api/v1/taskInstance/getList",
            params={
                "taskCode": task_code,
                "pageSize": page_size,
                "pageNo": page,
                "updateTimeOrder": "desc",
            },
            cookies=ck,
            headers=_hdr(proj, csrf),
            timeout=25,
        )
        if r.status_code == 401:
            inst_cache[task_code] = ("", "")
            return "", ""
        items = (r.json().get("data") or {}).get("list") or []
        if not items:
            break
        for it in items:
            if it.get("instanceStatus") != 30:
                continue
            iso = it.get("endRunTime") or ""
            if not iso:
                continue
            try:
                dt = datetime.fromisoformat(iso.replace("+0800", "+08:00"))
            except Exception:
                continue
            if best_dt is None or dt > best_dt:
                best_dt = dt
                best_iso = iso

        if len(items) < page_size:
            break

    if best_iso:
        try:
            dt = datetime.fromisoformat(best_iso.replace("+0800", "+08:00"))
            pretty = dt.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            pretty = best_iso
        inst_cache[task_code] = (best_iso, pretty)
        return best_iso, pretty

    inst_cache[task_code] = ("", "")
    return "", ""


def pick_primary(memberships: List[str], prev_short: str) -> str:
    if not memberships:
        return ""
    if prev_short:
        cand = full_sla_code(prev_short.split(";")[0].strip())
        if cand in memberships:
            return cand
    return memberships[0]


def process_sheet(
    values: List[List[str]],
    idc: int,
    sla_cache: Dict[str, Dict[str, Any]],
    task_to_slas: Dict[str, List[str]],
    resolve_cache: Dict[Tuple[str, int], str],
    inst_cache: Dict[str, Tuple[str, str]],
    ck: Dict[str, str],
    base_width: int,
) -> List[List[str]]:
    header = values[0][:base_width]
    rows = values[1:]
    new_cols = [
        "SLA_code",
        "slaTimeDef",
        "SLA周期",
        "任务最近完成时间",
        "时间差(分钟)\nfinish-当日slaTimeDef",
    ]
    out: List[List[str]] = [header + new_cols]
    sla_list_idx = base_width - 1

    for row in rows:
        row = list(row)
        while len(row) < base_width:
            row.append("")
        row = row[:base_width]

        tname = row[8]
        prev_raw = row[sla_list_idx] if len(row) > sla_list_idx else ""
        prev_short = prev_raw.split(";")[0].strip() if prev_raw else ""

        tc = resolve_task_code(tname, idc, ck, resolve_cache)
        row = row[:9] + [tc] + row[10:base_width]

        iso, pretty = inst_cache.get(tc, ("", ""))

        raw_memberships = list(task_to_slas.get(tc, []))
        memberships = filter_memberships_by_latest_sla_time(raw_memberships, sla_cache)

        if memberships:
            primary = pick_primary(memberships, prev_short)
            info = sla_cache[primary]
            short_list = ";".join([c.replace("spx_datamart.", "") for c in memberships])
            row[10] = "YES"
            row[11] = str(len(memberships))
            row[12] = short_list
            diff = diff_minutes(iso, info["slaTimeDef"])
            extra = [primary, info["slaTimeDef"], info["period"], pretty, diff]
        else:
            row[10] = "NO" if tc else "NO"
            row[11] = "0"
            row[12] = ""
            if base_width == 14 and len(row) < 14:
                row.append("")
            extra = ["", "", "", pretty, ""]

        out.append(row[:base_width] + extra)
        time.sleep(0.008)

    return out


def main() -> None:
    spreadsheet_id = os.environ.get("SPX_SLA_SHEET_ID", SID_DEFAULT)
    cookie_path = os.environ.get("DATASUITE_COOKIES_JSON", COOKIE_DEFAULT)
    sa_path = os.environ.get("GOOGLE_SA_JSON", SA_DEFAULT)

    ck, ck_src = acquire_datasuite_cookies(cookie_path)
    print(f"Cookie 来源: {ck_src}", flush=True)

    creds = Credentials.from_service_account_file(
        sa_path,
        scopes=["https://www.googleapis.com/auth/spreadsheets"],
    )
    svc = build("sheets", "v4", credentials=creds)

    shorts = collect_short_names_from_col_m(svc, spreadsheet_id)
    shorts |= FALLBACK_SLA_SHORTS

    print(f"加载 SLA 定义: {len(shorts)} 个短名候选 …")
    sla_cache = load_sla_cache(shorts, ck)
    print(f"已缓存 SLA: {len(sla_cache)}")
    task_to_slas = build_task_to_slas(sla_cache)

    resp_a = (
        svc.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range="'All-SLA'!A1:ZZ2000")
        .execute()
    )
    vals_a = [r[:13] for r in (resp_a.get("values") or [])]

    resp_b = (
        svc.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range="'All-BR'!A1:ZZ500")
        .execute()
    )
    vals_b = [r[:14] for r in (resp_b.get("values") or [])]

    resolve_cache: Dict[Tuple[str, int], str] = {}
    inst_cache: Dict[str, Tuple[str, str]] = {}

    unique_tc: Set[str] = set()

    def collect_task_codes(vals: List[List[str]], idc_i: int) -> None:
        if not vals:
            return
        base_w = 13 if idc_i == 0 else 14
        for row in vals[1:]:
            r = list(row)
            while len(r) < base_w:
                r.append("")
            r = r[:base_w]
            tn = r[8]
            tc_i = resolve_task_code(tn, idc_i, ck, resolve_cache)
            if tc_i:
                unique_tc.add(tc_i)

    collect_task_codes(vals_a, 0)
    collect_task_codes(vals_b, 1)

    print(f"预拉取实例结束时间（共 {len(unique_tc)} 个唯一 taskCode）…", flush=True)
    for idx, tc in enumerate(sorted(unique_tc)):
        latest_finish_max_end(tc, ck, inst_cache)
        if (idx + 1) % 80 == 0:
            print(f"  … {idx + 1}/{len(unique_tc)}", flush=True)

    out_a = process_sheet(
        vals_a, 0, sla_cache, task_to_slas, resolve_cache, inst_cache, ck, base_width=13
    )
    out_b = process_sheet(
        vals_b, 1, sla_cache, task_to_slas, resolve_cache, inst_cache, ck, base_width=14
    )

    svc.spreadsheets().values().clear(
        spreadsheetId=spreadsheet_id, range="'All-SLA'!A:ZZ"
    ).execute()
    svc.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="'All-SLA'!A1",
        valueInputOption="USER_ENTERED",
        body={"values": out_a},
    ).execute()

    svc.spreadsheets().values().clear(
        spreadsheetId=spreadsheet_id, range="'All-BR'!A:ZZ"
    ).execute()
    svc.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="'All-BR'!A1",
        valueInputOption="USER_ENTERED",
        body={"values": out_b},
    ).execute()

    print(f"All-SLA: {len(out_a[0])} 列 × {len(out_a)} 行")
    print(f"All-BR: {len(out_b[0])} 列 × {len(out_b)} 行")
    print("完成。")


if __name__ == "__main__":
    main()

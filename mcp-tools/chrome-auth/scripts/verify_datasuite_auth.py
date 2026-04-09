#!/usr/bin/env python3
"""验证 DataSuite + Flink API 是否可用（依赖本机 Chrome 登录态与 CDP）。"""

import os
import sys

# 仓库内开发：将 chrome-auth 根加入 path
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

import requests  # noqa: E402

from chrome_auth import get_auth  # noqa: E402
from chrome_auth.diagnostic import cookie_diagnostic  # noqa: E402


def main() -> int:
    domain = "datasuite.shopee.io"
    auth = get_auth(domain, force=True)
    print("get_auth source:", auth.source)
    print("cookie count:", len(auth.cookies))
    print("has DATA-SUITE-AUTH-userToken-v4:", "DATA-SUITE-AUTH-userToken-v4" in auth.cookies)
    if auth.expires_at:
        import time
        print(f"expires_at: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(auth.expires_at))}")
        print(f"expires_soon: {auth.expires_soon}")
    print()
    print("--- diagnostic ---")
    print(cookie_diagnostic(auth.cookies, expires_at=auth.expires_at))
    print()

    url = f"https://{domain}/flink/api/v2/applications/741498"
    headers = {
        "Accept": "application/json",
        "Referer": f"https://{domain}/flink/",
    }
    if "CSRF-TOKEN" in auth.cookies:
        headers["x-csrf-token"] = auth.cookies["CSRF-TOKEN"]

    r = requests.get(url, cookies=auth.cookies, headers=headers, timeout=20)
    print("GET", url)
    print("HTTP:", r.status_code)
    data = {}
    try:
        data = r.json()
        print("body code:", data.get("code"), "message:", data.get("message") or data.get("msg"))
    except Exception:
        print(r.text[:400])

    if r.status_code == 200 and isinstance(data, dict) and data.get("code") == 200 and data.get("data") is not None:
        print("\n[OK] Flink API 可访问。")
        return 0
    print("\n[FAIL] 若 HTTP 401：请运行 scripts/start_chrome_remote_debug.sh 后重新登录 DataSuite。")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

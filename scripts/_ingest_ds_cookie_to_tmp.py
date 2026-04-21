#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 stdin、argv 或环境变量 DS_COOKIE_STRING 解析并写入默认 /tmp/ds_cookies.json。"""

import json
import os
import sys

src = ""
if len(sys.argv) > 1:
    src = sys.argv[1]
elif not sys.stdin.isatty():
    src = sys.stdin.read()
else:
    src = os.environ.get("DS_COOKIE_STRING", "")
if not src.strip():
    print(
        "用法:\n"
        "  DS_COOKIE_STRING='...' python3 scripts/_ingest_ds_cookie_to_tmp.py\n"
        "  python3 scripts/_ingest_ds_cookie_to_tmp.py '...'\n"
        "  echo '...' | python3 scripts/_ingest_ds_cookie_to_tmp.py",
        file=sys.stderr,
    )
    sys.exit(2)

cookies: dict = {}
for part in src.split(";"):
    part = part.strip()
    if not part or "=" not in part:
        continue
    k, v = part.split("=", 1)
    k, v = k.strip(), v.strip()
    if k == "ssc_user_email" and len(v) >= 2 and v[0] == '"' and v[-1] == '"':
        v = v[1:-1]
    cookies[k] = v

out = os.environ.get("DATASUITE_COOKIES_JSON", "/tmp/ds_cookies.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(cookies, f, indent=0)
print(f"Wrote {len(cookies)} entries -> {out}")

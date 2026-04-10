#!/usr/bin/env python3
"""
SeaTalk CDP 烟测（不经过 Cursor MCP）：直连 seatalk-agent 在 127.0.0.1:19222 的 CDP 代理。

用途：
  - 验证 Inspector/SIGUSR1 方案下 CDP 仍可用于 Runtime.evaluate
  - 可选：调用页面内 __seatalkSend(confirmed=true) 做端到端发送验证（仅建议在测试群使用）

依赖：pip install websockets
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import urllib.error
import urllib.request

try:
    import websockets
except ImportError:
    print("请先安装: pip install websockets", file=sys.stderr)
    sys.exit(1)

MAIN_PAGE_URL = "web.haiserve.com"


def _list_pages(port: int) -> list:
    req = urllib.request.Request(f"http://127.0.0.1:{port}/json")
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode())


def _pick_main_page(pages: list) -> dict | None:
    for p in pages:
        if p.get("type") not in ("page", "webview"):
            continue
        url = p.get("url", "")
        if MAIN_PAGE_URL in url and "mediaViewer" not in url and "spark" not in url:
            return p
    return None


async def _cdp_eval(ws_url: str, expression: str, await_promise: bool = True, timeout: float = 30.0):
    async with websockets.connect(ws_url, max_size=50 * 1024 * 1024) as ws:
        msg_id = 0

        async def rpc(method: str, params: dict | None = None) -> dict:
            nonlocal msg_id
            msg_id += 1
            payload: dict = {"id": msg_id, "method": method}
            if params is not None:
                payload["params"] = params
            await ws.send(json.dumps(payload))
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
                m = json.loads(raw)
                if m.get("id") == msg_id:
                    return m

        await rpc("Runtime.enable", {})
        resp = await rpc(
            "Runtime.evaluate",
            {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": await_promise,
            },
        )
        if "error" in resp:
            raise RuntimeError(json.dumps(resp["error"], ensure_ascii=False))
        res = resp.get("result", {})
        if res.get("exceptionDetails"):
            ex = res["exceptionDetails"].get("exception", {})
            raise RuntimeError(ex.get("description") or res["exceptionDetails"].get("text", "evaluate failed"))
        return res.get("result", {}).get("value")


async def cmd_probe(port: int) -> int:
    pages = _list_pages(port)
    page = _pick_main_page(pages)
    if not page:
        print("未找到 SeaTalk 主页面，请打开 SeaTalk 并确认 Agent 已连接。")
        return 1
    ws_url = page["webSocketDebuggerUrl"]
    expr = """(function(){return JSON.stringify({
      store: typeof window.store !== 'undefined',
      seatalkSend: typeof window.__seatalkSend,
      agentSend: typeof window.__agentSend,
      seatalkSendVersion: window.__seatalkSendVersion || null
    });})()"""
    raw = await _cdp_eval(ws_url, expr, await_promise=False)
    print(raw)
    data = json.loads(raw) if isinstance(raw, str) else raw
    ok = data.get("store") and data.get("seatalkSend") == "function"
    return 0 if ok else 2


async def cmd_resolve(port: int, keyword: str) -> int:
    """从 Redux 按群名子串解析 group id（走 messages.sessions，兼容 sessionList 为空）。"""
    pages = _list_pages(port)
    page = _pick_main_page(pages)
    if not page:
        print("未找到 SeaTalk 主页面。")
        return 1
    ws_url = page["webSocketDebuggerUrl"]
    kw = json.dumps(keyword, ensure_ascii=False)
    expr = f"""(function(){{
      var s = window.store.getState();
      var gi = (s.contact && s.contact.groupInfo) || {{}};
      var sl = (s.messages && s.messages.sessionList) || [];
      var ss = (s.messages && s.messages.sessions) || [];
      var sessions = sl.length > 0 ? sl : ss;
      var kw = ({kw}).toLowerCase();
      var out = [];
      for (var i = 0; i < sessions.length; i++) {{
        var sess = sessions[i];
        if (!sess || sess.type !== 'group') continue;
        var name = (gi[sess.id] || {{}}).name || '';
        if (name.toLowerCase().indexOf(kw) >= 0)
          out.push({{id: sess.id, name: name}});
      }}
      return JSON.stringify(out.slice(0, 15));
    }})()"""
    raw = await _cdp_eval(ws_url, expr, await_promise=False)
    print(raw)
    try:
        arr = json.loads(raw) if isinstance(raw, str) else raw
        return 0 if arr else 2
    except json.JSONDecodeError:
        return 2


async def cmd_send(port: int, session: str, text: str, fmt: str) -> int:
    pages = _list_pages(port)
    page = _pick_main_page(pages)
    if not page:
        print("未找到 SeaTalk 主页面。")
        return 1
    ws_url = page["webSocketDebuggerUrl"]
    opts_js = json.dumps(
        {"session": session, "text": text, "format": fmt, "confirmed": True},
        ensure_ascii=False,
    )
    expr = f"""(function(){{
      if (typeof window.__seatalkSend !== 'function')
        return Promise.resolve(JSON.stringify({{"error":"no __seatalkSend"}}));
      return window.__seatalkSend({opts_js})
        .then(function(r){{ return JSON.stringify(r); }})
        .catch(function(e){{ return JSON.stringify({{error: String(e && e.message ? e.message : e)}}); }});
    }})()"""
    raw = await _cdp_eval(ws_url, expr, await_promise=True)
    print(raw)
    try:
        obj = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return 2
    if isinstance(obj, dict) and obj.get("error"):
        return 3
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="SeaTalk CDP smoke (127.0.0.1:19222)")
    p.add_argument("--port", type=int, default=19222, help="CDP 代理端口（默认 19222）")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("probe", help="检查 store / __seatalkSend 是否可用")

    rp = sub.add_parser("resolve", help="按群名子串列出 Redux 中的 group id（先发这条确认 session）")
    rp.add_argument("keyword", help="例如 消息测试")

    sp = sub.add_parser("send", help="CDP 直连调用 __seatalkSend(confirmed=true) 发送（慎用）")
    sp.add_argument("session", help="例如 group-4371864（勿用与客户端不一致的 id）")
    sp.add_argument("text", help="消息正文")
    sp.add_argument("--format", choices=("text", "markdown"), default="text")

    args = p.parse_args()
    try:
        if args.cmd == "probe":
            return asyncio.run(cmd_probe(args.port))
        if args.cmd == "resolve":
            return asyncio.run(cmd_resolve(args.port, args.keyword))
        if args.cmd == "send":
            return asyncio.run(cmd_send(args.port, args.session, args.text, args.format))
    except urllib.error.URLError as e:
        print(f"无法连接 CDP HTTP: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 1
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

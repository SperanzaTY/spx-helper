#!/usr/bin/env python3
"""
SeaTalk Reader MCP Server - 直接通过 CDP 协议读取 SeaTalk 消息

无需依赖任何外部项目，直接通过 Chrome DevTools Protocol (CDP)
连接 SeaTalk Electron 客户端，读取 Redux store 中的消息数据。

前提条件:
  SeaTalk 桌面客户端以 CDP 调试模式启动:
  /Applications/SeaTalk.app/Contents/MacOS/SeaTalk --remote-debugging-port=19222

配置方式（在 mcp.json 中）:
{
  "seatalk-reader": {
    "command": "python3",
    "args": ["/path/to/seatalk_reader_server.py"],
    "env": {
      "CDP_PORT": "19222"
    }
  }
}
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import requests

try:
    import websockets
    from websockets.client import connect as ws_connect
except ImportError:
    print(
        "错误: 缺少 websockets 依赖。请执行: pip install websockets",
        file=sys.stderr,
    )
    sys.exit(1)

from mcp.server.fastmcp import FastMCP

# ====== 配置 ======
CDP_PORT = int(os.environ.get("CDP_PORT", "19222"))
CDP_TIMEOUT = int(os.environ.get("CDP_TIMEOUT", "15"))
MAIN_PAGE_URL = "web.haiserve.com"

TZ8 = timezone(timedelta(hours=8))

mcp = FastMCP("seatalk-reader")


# ═══════════════════════════════════════════════════════════════
#  CDP 客户端 — 纯 Python 实现，无外部依赖
# ═══════════════════════════════════════════════════════════════

class CdpClient:
    """轻量级 Chrome DevTools Protocol 客户端"""

    def __init__(self, ws_url: str, page_info: dict):
        self.ws_url = ws_url
        self.page_info = page_info
        self._ws = None
        self._msg_id = 0
        self._pending: Dict[int, asyncio.Future] = {}
        self._recv_task: Optional[asyncio.Task] = None

    async def connect(self):
        self._ws = await ws_connect(self.ws_url, max_size=50 * 1024 * 1024)
        self._recv_task = asyncio.create_task(self._recv_loop())

    async def _recv_loop(self):
        try:
            async for raw in self._ws:
                msg = json.loads(raw)
                msg_id = msg.get("id")
                if msg_id is not None and msg_id in self._pending:
                    fut = self._pending.pop(msg_id)
                    if not fut.done():
                        fut.set_result(msg)
        except Exception:
            pass
        finally:
            for fut in self._pending.values():
                if not fut.done():
                    fut.set_exception(ConnectionError("CDP 连接已关闭"))
            self._pending.clear()

    async def send(self, method: str, params: dict = None) -> dict:
        if not self._ws or self._ws.closed:
            raise ConnectionError("CDP 未连接")
        self._msg_id += 1
        msg_id = self._msg_id
        fut = asyncio.get_event_loop().create_future()
        self._pending[msg_id] = fut
        payload = {"id": msg_id, "method": method}
        if params:
            payload["params"] = params
        await self._ws.send(json.dumps(payload))
        try:
            return await asyncio.wait_for(fut, timeout=CDP_TIMEOUT)
        except asyncio.TimeoutError:
            self._pending.pop(msg_id, None)
            raise TimeoutError(f"CDP 超时 ({CDP_TIMEOUT}s): {method}")

    async def evaluate(self, code: str) -> Any:
        """在页面中执行 JS 并返回结果"""
        result = await self.send("Runtime.evaluate", {
            "expression": code,
            "returnByValue": True,
            "awaitPromise": True,
        })
        if "error" in result:
            raise RuntimeError(result["error"].get("message", str(result["error"])))
        res = result.get("result", {})
        if res.get("exceptionDetails"):
            exc = res["exceptionDetails"]
            desc = exc.get("exception", {}).get("description") or exc.get("text", "JS 执行异常")
            raise RuntimeError(desc)
        return res.get("result", {}).get("value")

    async def close(self):
        if self._recv_task:
            self._recv_task.cancel()
        if self._ws and not self._ws.closed:
            await self._ws.close()


# ═══════════════════════════════════════════════════════════════
#  CDP 连接管理
# ═══════════════════════════════════════════════════════════════

_cdp_client: Optional[CdpClient] = None


def _list_cdp_pages() -> List[dict]:
    """通过 CDP HTTP 接口列出所有可调试页面"""
    resp = requests.get(f"http://127.0.0.1:{CDP_PORT}/json", timeout=3)
    resp.raise_for_status()
    pages = resp.json()
    return [
        p for p in pages
        if p.get("type") in ("page", "webview") and p.get("webSocketDebuggerUrl")
    ]


def _find_main_page() -> Optional[dict]:
    """找到 SeaTalk 主页面"""
    pages = _list_cdp_pages()
    for p in pages:
        if MAIN_PAGE_URL in p.get("url", ""):
            return p
    return None


async def _get_client() -> CdpClient:
    """获取或创建 CDP 连接"""
    global _cdp_client
    if _cdp_client and _cdp_client._ws and not _cdp_client._ws.closed:
        return _cdp_client

    page = _find_main_page()
    if not page:
        raise ConnectionError(
            f"找不到 SeaTalk 主页面 ({MAIN_PAGE_URL})。\n"
            "请确认:\n"
            "1. SeaTalk 桌面客户端已打开\n"
            "2. SeaTalk 以 CDP 调试模式启动:\n"
            "   /Applications/SeaTalk.app/Contents/MacOS/SeaTalk "
            f"--remote-debugging-port={CDP_PORT}\n"
            "3. 如果 SeaTalk 已在运行但没开 CDP，需要先关闭再以上述命令重启"
        )

    client = CdpClient(page["webSocketDebuggerUrl"], page)
    await client.connect()
    _cdp_client = client
    return client


def _check_cdp_available() -> str:
    """检查 CDP 端口是否可达，返回错误信息或空串"""
    try:
        _find_main_page()
        return ""
    except requests.ConnectionError:
        return (
            f"无法连接到 SeaTalk CDP 端口 (127.0.0.1:{CDP_PORT})。\n"
            "请确认 SeaTalk 以调试模式启动:\n"
            f"  /Applications/SeaTalk.app/Contents/MacOS/SeaTalk --remote-debugging-port={CDP_PORT}\n\n"
            "提示: 如果 SeaTalk 已在运行但没开 CDP，需要先完全退出再重新启动。"
        )
    except Exception as e:
        return f"CDP 连接异常: {e}"


async def _eval_js(code: str) -> Any:
    """获取 CDP 连接并执行 JS"""
    client = await _get_client()
    return await client.evaluate(code)


# ═══════════════════════════════════════════════════════════════
#  MCP Tools
# ═══════════════════════════════════════════════════════════════

@mcp.tool()
async def list_seatalk_chats(
    chat_type: str = "all",
    limit: int = 30,
) -> str:
    """列出 SeaTalk 中最近的群聊和私聊会话。

    从 SeaTalk Redux store 实时读取当前已加载的会话列表。

    Args:
        chat_type: 筛选类型 - "group"(群聊), "buddy"(私聊), "all"(全部)
        limit: 返回数量上限，默认30
    """
    err = _check_cdp_available()
    if err:
        return err

    js_code = """(function(){
        var s = window.store.getState();
        var sessions = s.messages && s.messages.sessionList;
        if (!sessions || !Array.isArray(sessions)) return JSON.stringify({error: 'sessionList not found'});

        var groupInfo = (s.contact && s.contact.groupInfo) || {};
        var userInfo = (s.contact && s.contact.userInfo) || {};
        var msgMap = (s.messages && s.messages.messages) || {};

        var result = [];
        for (var i = 0; i < sessions.length; i++) {
            var sess = sessions[i];
            if (!sess || !sess.id) continue;
            var type = sess.type || 'unknown';
            var id = sess.id;
            var name = '';
            if (type === 'group') {
                var gi = groupInfo[id];
                name = gi ? (gi.name || '') : ('group-' + id);
            } else {
                var ui = userInfo[id];
                name = ui ? (ui.name || '') : ('user-' + id);
            }

            var lastMsg = '';
            var lastTs = sess.lastMessageTimestamp || 0;
            var unread = sess.unreadCount || 0;

            var key = type + '-' + id;
            for (var mk in msgMap) {
                if (mk.indexOf(key) === 0) {
                    var m = msgMap[mk];
                    if (m && m.content && m.content.text) {
                        if (m.timeStamp >= lastTs - 5) {
                            lastMsg = m.content.text.substring(0, 80);
                        }
                    }
                }
            }

            result.push({
                type: type,
                id: id,
                name: name,
                unread: unread,
                lastTs: lastTs,
                lastMsg: lastMsg
            });
        }
        result.sort(function(a,b){ return b.lastTs - a.lastTs; });
        return JSON.stringify(result);
    })()"""

    try:
        raw = await _eval_js(js_code)
        items = json.loads(raw) if isinstance(raw, str) else raw

        if isinstance(items, dict) and "error" in items:
            return f"读取失败: {items['error']}"

        if chat_type == "group":
            items = [x for x in items if x.get("type") == "group"]
        elif chat_type == "buddy":
            items = [x for x in items if x.get("type") == "buddy"]

        items = items[:limit]

        if not items:
            return "当前没有加载任何会话"

        lines = [f"共 {len(items)} 个会话:\n"]
        for it in items:
            ts_str = ""
            if it.get("lastTs"):
                dt = datetime.fromtimestamp(it["lastTs"], tz=TZ8)
                ts_str = dt.strftime("%m-%d %H:%M")

            prefix = "[群]" if it["type"] == "group" else "[私]"
            unread = f" ({it['unread']}条未读)" if it.get("unread") else ""
            preview = f"  最新: {it['lastMsg']}" if it.get("lastMsg") else ""

            lines.append(
                f"{prefix} {it['name']} (id={it['id']}){unread}  {ts_str}"
                f"{preview}"
            )

        return "\n".join(lines)

    except Exception as e:
        return f"读取会话列表失败: {e}"


@mcp.tool()
async def read_seatalk_messages(
    session_type: str = "group",
    session_id: int = 0,
    session_name: str = "",
    limit: int = 50,
) -> str:
    """读取指定 SeaTalk 会话的实时消息。

    从 SeaTalk Redux store 读取当前内存中的消息。只能读取已加载到内存的消息，
    如果该会话从未被打开过，可能没有数据。

    使用方法：
    - 先用 list_seatalk_chats 获取会话列表，得到 session_type 和 session_id
    - 或者提供 session_name，工具会模糊匹配

    Args:
        session_type: 会话类型 - "group"(群聊) 或 "buddy"(私聊)
        session_id: 会话 ID（从 list_seatalk_chats 获取）
        session_name: 会话名称（可选，用于模糊匹配，优先于 session_id）
        limit: 返回消息数量上限，默认50
    """
    err = _check_cdp_available()
    if err:
        return err

    if session_name and not session_id:
        search_result = await _eval_js(f"""(function(){{
            var s = window.store.getState();
            var gi = (s.contact && s.contact.groupInfo) || {{}};
            var ui = (s.contact && s.contact.userInfo) || {{}};
            var keyword = {json.dumps(session_name)}.toLowerCase();
            var matches = [];

            for (var gid in gi) {{
                var name = (gi[gid].name || '').toLowerCase();
                if (name.indexOf(keyword) >= 0) {{
                    matches.push({{type:'group', id:parseInt(gid), name:gi[gid].name}});
                }}
            }}
            for (var uid in ui) {{
                var name = (ui[uid].name || '').toLowerCase();
                if (name.indexOf(keyword) >= 0) {{
                    matches.push({{type:'buddy', id:parseInt(uid), name:ui[uid].name}});
                }}
            }}
            return JSON.stringify(matches.slice(0, 10));
        }})()""")

        matches = json.loads(search_result) if isinstance(search_result, str) else search_result
        if not matches:
            return f"未找到匹配 '{session_name}' 的会话"
        if len(matches) > 1:
            lines = [f"找到 {len(matches)} 个匹配 '{session_name}' 的会话，请指定 session_id:\n"]
            for m in matches:
                prefix = "[群]" if m["type"] == "group" else "[私]"
                lines.append(f"  {prefix} {m['name']} (type={m['type']}, id={m['id']})")
            return "\n".join(lines)

        session_type = matches[0]["type"]
        session_id = matches[0]["id"]

    if not session_id:
        return "请提供 session_id 或 session_name 参数"

    js_code = f"""(function(){{
        var s = window.store.getState();
        var msgMap = (s.messages && s.messages.messages) || {{}};
        var userInfo = (s.contact && s.contact.userInfo) || {{}};
        var groupInfo = (s.contact && s.contact.groupInfo) || {{}};
        var prefix = '{session_type}-{session_id}';

        var sessionName = '';
        if ('{session_type}' === 'group') {{
            var gi = groupInfo[{session_id}];
            sessionName = gi ? (gi.name || '') : '';
        }} else {{
            var ui = userInfo[{session_id}];
            sessionName = ui ? (ui.name || '') : '';
        }}

        var msgs = [];
        for (var key in msgMap) {{
            if (key.indexOf(prefix + '-') !== 0) continue;
            var m = msgMap[key];
            if (!m || !m.timeStamp) continue;

            var senderName = '';
            if (m.senderId) {{
                var su = userInfo[m.senderId];
                senderName = su ? (su.name || 'user-' + m.senderId) : 'user-' + m.senderId;
            }}

            var text = '';
            if (m.content) {{
                text = m.content.text || '';
                if (!text && m.content.elements && Array.isArray(m.content.elements)) {{
                    text = m.content.elements
                        .map(function(el){{ return (el && el.content && el.content.text) || ''; }})
                        .filter(Boolean).join('\\n');
                }}
                if (!text && m.content.title) text = m.content.title;
            }}

            var tag = m.tag || 'text';
            var quote = null;
            if (m.quote && m.quote.content && m.quote.content.text) {{
                var qSender = '';
                if (m.quote.senderId) {{
                    var qu = userInfo[m.quote.senderId];
                    qSender = qu ? (qu.name || '') : '';
                }}
                quote = {{sender: qSender, text: m.quote.content.text.substring(0, 100)}};
            }}

            msgs.push({{
                mid: m.mid || key.split('-').pop(),
                sender: senderName,
                senderId: m.senderId,
                text: text.substring(0, 2000),
                tag: tag,
                ts: m.timeStamp,
                quote: quote
            }});
        }}

        msgs.sort(function(a,b){{ return a.ts - b.ts; }});
        var total = msgs.length;
        msgs = msgs.slice(-{limit});

        return JSON.stringify({{
            sessionName: sessionName,
            sessionType: '{session_type}',
            sessionId: {session_id},
            total: total,
            showing: msgs.length,
            messages: msgs
        }});
    }})()"""

    try:
        raw = await _eval_js(js_code)
        data = json.loads(raw) if isinstance(raw, str) else raw

        session_label = data.get("sessionName") or f"{session_type}-{session_id}"
        prefix = "[群]" if session_type == "group" else "[私]"
        header = f"{prefix} {session_label} (id={session_id})"
        total = data.get("total", 0)
        showing = data.get("showing", 0)

        if total == 0:
            return f"{header}\n\n该会话内存中没有消息（可能未被打开过，或消息尚未加载）"

        lines = [
            f"{header}",
            f"共 {total} 条消息（显示最近 {showing} 条）\n",
            "─" * 50,
        ]

        TAG_MAP = {
            "image": "[图片]", "gif": "[GIF]", "file": "[文件]",
            "video": "[视频]", "sticker": "[贴纸]", "audio": "[语音]",
            "interactive": "[卡片]", "history": "[转发]",
        }

        for msg in data.get("messages", []):
            ts_str = datetime.fromtimestamp(msg["ts"], tz=TZ8).strftime("%m-%d %H:%M:%S") if msg.get("ts") else ""
            sender = msg.get("sender") or f"user-{msg.get('senderId', '?')}"
            tag = msg.get("tag", "text")
            tag_label = (TAG_MAP.get(tag, f"[{tag}]") + " ") if tag != "text" else ""

            quote_line = ""
            if msg.get("quote"):
                q = msg["quote"]
                quote_line = f"  (回复 {q['sender']}: \"{q['text'][:50]}\")"

            text = msg.get("text", "").replace("\n", "\n    ")
            lines.append(f"{ts_str} {sender}: {tag_label}{text}")
            if quote_line:
                lines.append(quote_line)

        return "\n".join(lines)

    except Exception as e:
        return f"读取消息失败: {e}"


@mcp.tool()
async def search_seatalk_messages(
    keyword: str = "",
    chat_name: str = "",
    max_results: int = 30,
) -> str:
    """在 SeaTalk 当前内存中搜索包含关键词的消息。

    搜索 Redux store 中所有已加载的消息（跨群/私聊）。

    Args:
        keyword: 搜索关键词（必填，大小写不敏感）
        chat_name: 限定搜索范围的群聊/私聊名称（可选，模糊匹配）
        max_results: 最大返回结果数，默认30
    """
    if not keyword:
        return "请提供 keyword 参数"

    err = _check_cdp_available()
    if err:
        return err

    js_code = f"""(function(){{
        var s = window.store.getState();
        var msgMap = (s.messages && s.messages.messages) || {{}};
        var userInfo = (s.contact && s.contact.userInfo) || {{}};
        var groupInfo = (s.contact && s.contact.groupInfo) || {{}};
        var keyword = {json.dumps(keyword)}.toLowerCase();
        var chatFilter = {json.dumps(chat_name)}.toLowerCase();
        var results = [];

        for (var key in msgMap) {{
            var m = msgMap[key];
            if (!m || !m.timeStamp) continue;
            var text = (m.content && m.content.text) || '';
            if (!text || text.toLowerCase().indexOf(keyword) < 0) continue;

            var parts = key.match(/^(group|buddy)-(\\d+)-/);
            if (!parts) continue;
            var sessType = parts[1];
            var sessId = parseInt(parts[2]);

            var sessName = '';
            if (sessType === 'group') {{
                var gi = groupInfo[sessId];
                sessName = gi ? (gi.name || '') : '';
            }} else {{
                var ui = userInfo[sessId];
                sessName = ui ? (ui.name || '') : '';
            }}

            if (chatFilter && sessName.toLowerCase().indexOf(chatFilter) < 0) continue;

            var senderName = '';
            if (m.senderId) {{
                var su = userInfo[m.senderId];
                senderName = su ? (su.name || '') : ('user-' + m.senderId);
            }}

            results.push({{
                chat: (sessType === 'group' ? '[群] ' : '[私] ') + sessName,
                sender: senderName,
                text: text.substring(0, 200),
                ts: m.timeStamp
            }});

            if (results.length >= {max_results}) break;
        }}

        results.sort(function(a,b){{ return b.ts - a.ts; }});
        return JSON.stringify(results);
    }})()"""

    try:
        raw = await _eval_js(js_code)
        results = json.loads(raw) if isinstance(raw, str) else raw

        if not results:
            scope = f" (在 '{chat_name}' 中)" if chat_name else ""
            return f"未找到包含 '{keyword}' 的消息{scope}"

        lines = [f"搜索 '{keyword}' - 找到 {len(results)} 条结果:\n"]
        for r in results:
            ts_str = datetime.fromtimestamp(r["ts"], tz=TZ8).strftime("%m-%d %H:%M") if r.get("ts") else ""
            lines.append(f"  [{r['chat']}] {ts_str} {r['sender']}: {r['text'][:100]}")

        if len(results) >= max_results:
            lines.append(f"\n(结果已截断，最多显示 {max_results} 条)")

        return "\n".join(lines)

    except Exception as e:
        return f"搜索失败: {e}"


@mcp.tool()
async def seatalk_eval(
    code: str = "",
) -> str:
    """在 SeaTalk 页面中执行任意 JavaScript 代码（高级工具）。

    通过 CDP 协议直接在 SeaTalk Electron 渲染进程中执行 JS。
    可以访问 window.store (Redux)、DOM 等全局对象。

    常用模式：
    - window.store.getState().messages  → 消息数据
    - window.store.getState().contact   → 联系人/群组信息
    - window.store.getState().login     → 当前登录用户
    - JSON.stringify(window.store.getState().login) → 序列化返回

    注意: 返回值必须是可序列化的（primitive/plain object），
    复杂对象请先 JSON.stringify。

    Args:
        code: 要执行的 JavaScript 代码
    """
    if not code:
        return "请提供 code 参数"

    err = _check_cdp_available()
    if err:
        return err

    try:
        result = await _eval_js(code)
        if result is None:
            return "(返回 null/undefined)"
        if isinstance(result, str):
            try:
                parsed = json.loads(result)
                return json.dumps(parsed, ensure_ascii=False, indent=2)
            except (json.JSONDecodeError, TypeError):
                return result
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"执行失败: {e}"


@mcp.tool()
async def seatalk_screenshot() -> str:
    """截取 SeaTalk 当前界面的截图。

    通过 CDP 协议截取 SeaTalk 窗口的 PNG 截图，保存到本地文件。
    """
    err = _check_cdp_available()
    if err:
        return err

    try:
        client = await _get_client()
        result = await client.send("Page.captureScreenshot", {"format": "png"})

        res = result.get("result", {})
        b64_data = res.get("data", "")
        if not b64_data:
            return "截图失败: 未获取到图片数据"

        import base64
        import time
        screenshot_dir = os.path.expanduser("~/.seatalk-mcp-screenshots")
        os.makedirs(screenshot_dir, exist_ok=True)
        filename = f"screenshot_{int(time.time())}.png"
        filepath = os.path.join(screenshot_dir, filename)

        with open(filepath, "wb") as f:
            f.write(base64.b64decode(b64_data))

        size = os.path.getsize(filepath)
        return f"截图已保存: {filepath}\n大小: {size} bytes"

    except Exception as e:
        return f"截图失败: {e}"


# ═══════════════════════════════════════════════════════════════
#  启动入口
# ═══════════════════════════════════════════════════════════════

def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()

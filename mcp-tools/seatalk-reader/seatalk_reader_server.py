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
import time
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
    """找到 SeaTalk 主页面（排除 mediaViewer 等子页面）"""
    pages = _list_cdp_pages()
    for p in pages:
        url = p.get("url", "")
        if MAIN_PAGE_URL in url and "mediaViewer" not in url and "spark" not in url:
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


def _fmt_size(n: int) -> str:
    """格式化文件大小"""
    if n < 1024:
        return f"{n}B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f}KB"
    return f"{n / (1024 * 1024):.1f}MB"


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
async def navigate_to_chat(
    session_name: str = "",
    session_id: int = 0,
    session_type: str = "group",
) -> str:
    """在 SeaTalk 中切换到指定会话并等待消息加载。

    通过 CDP 模拟点击左侧会话列表来切换聊天。切换后会自动等待消息加载，
    然后返回该会话的最新消息摘要。

    这是读取未加载会话消息的推荐方式：先 navigate，再 read_seatalk_messages。

    Args:
        session_name: 会话名称（群名/人名，模糊匹配）
        session_id: 会话 ID（精确匹配，优先于 session_name 的模糊搜索）
        session_type: 会话类型 - "group"(群聊) 或 "buddy"(私聊)
    """
    err = _check_cdp_available()
    if err:
        return err

    if not session_name and not session_id:
        return "请提供 session_name 或 session_id"

    try:
        if session_id:
            click_js = f"""(function(){{
                var item = document.querySelector(
                    '.messages-chat-session-list-item[data-id="{session_id}"]'
                );
                if (!item) return JSON.stringify({{error: 'not_in_list', id: {session_id}}});
                item.click();
                var nameEl = item.querySelector('[class*=text]');
                return JSON.stringify({{
                    clicked: true,
                    dataId: '{session_id}',
                    name: nameEl ? nameEl.textContent.substring(0, 80) : ''
                }});
            }})()"""
        else:
            safe_name = json.dumps(session_name)
            click_js = f"""(function(){{
                var keyword = {safe_name}.toLowerCase();
                var items = document.querySelectorAll('.messages-chat-session-list-item');
                var best = null;
                var bestName = '';
                for (var i = 0; i < items.length; i++) {{
                    var nameEl = items[i].querySelector('[class*=text]');
                    var name = nameEl ? nameEl.textContent : '';
                    if (name.toLowerCase().indexOf(keyword) >= 0) {{
                        best = items[i];
                        bestName = name.substring(0, 80);
                        break;
                    }}
                }}
                if (!best) return JSON.stringify({{error: 'no_match', keyword: keyword}});
                best.click();
                return JSON.stringify({{
                    clicked: true,
                    dataId: best.getAttribute('data-id'),
                    name: bestName
                }});
            }})()"""

        raw = await _eval_js(click_js)
        result = json.loads(raw) if isinstance(raw, str) else raw

        if result.get("error") == "not_in_list":
            return (
                f"会话 ID {session_id} 不在当前左侧列表中。\n"
                "该会话可能未置顶或排名靠后，请尝试用 session_name 搜索，\n"
                "或者先让用户在 SeaTalk 中手动打开该会话。"
            )
        if result.get("error") == "no_match":
            return f"在左侧会话列表中未找到匹配 '{session_name}' 的会话。"

        # 等待消息加载
        import asyncio as _asyncio
        await _asyncio.sleep(1.5)

        chat_name = result.get("name", "")
        data_id = result.get("dataId", "")

        count_js = f"""(function(){{
            var s = window.store.getState();
            var msgMap = (s.messages && s.messages.messages) || {{}};
            var count = 0;
            for (var key in msgMap) {{
                if (key.indexOf('-{data_id}-') >= 0) count++;
            }}
            return JSON.stringify({{messagesLoaded: count}});
        }})()"""
        count_raw = await _eval_js(count_js)
        count_data = json.loads(count_raw) if isinstance(count_raw, str) else count_raw
        loaded = count_data.get("messagesLoaded", 0)

        return (
            f"已切换到会话: {chat_name} (id={data_id})\n"
            f"内存中已加载 {loaded} 条消息。\n"
            f"现在可以使用 read_seatalk_messages 读取消息内容。"
        )

    except Exception as e:
        return f"切换会话失败: {e}"


@mcp.tool()
async def read_current_chat(
    limit: int = 50,
) -> str:
    """读取 SeaTalk 当前正在查看的会话的消息。

    自动检测当前打开的会话（左侧列表中高亮的），无需手动指定 session_id。
    适用于用户已经在 SeaTalk 中打开了某个会话的场景。

    当用户说"看看这个群的消息"或提供了 SeaTalk 链接后手动打开了对应会话时使用。

    Args:
        limit: 返回消息数量上限，默认50
    """
    err = _check_cdp_available()
    if err:
        return err

    try:
        detect_js = """(function(){
            var items = document.querySelectorAll('.messages-chat-session-list-item');
            for (var i = 0; i < items.length; i++) {
                if (items[i].className.indexOf('selected') >= 0) {
                    var dataId = items[i].getAttribute('data-id');
                    var nameEl = items[i].querySelector('[class*=text]');
                    var name = nameEl ? nameEl.textContent.substring(0, 80) : '';
                    return JSON.stringify({dataId: dataId, name: name});
                }
            }
            return JSON.stringify({error: 'no_selected'});
        })()"""

        raw = await _eval_js(detect_js)
        result = json.loads(raw) if isinstance(raw, str) else raw

        if result.get("error"):
            return "当前没有选中任何会话，请先在 SeaTalk 中打开一个聊天。"

        data_id = result["dataId"]
        chat_name = result.get("name", "")

        # 在 Redux store 中找出这个 session 的类型
        type_js = f"""(function(){{
            var s = window.store.getState();
            var msgMap = (s.messages && s.messages.messages) || {{}};
            for (var key in msgMap) {{
                if (key.indexOf('-{data_id}-') >= 0) {{
                    var parts = key.match(/^(group|buddy)-/);
                    return parts ? parts[1] : 'unknown';
                }}
            }}
            var lists = (s.messages && s.messages.lists) || {{}};
            if (lists['group-{data_id}']) return 'group';
            if (lists['buddy-{data_id}']) return 'buddy';
            return 'group';
        }})()"""
        session_type = await _eval_js(type_js) or "group"

        return await read_seatalk_messages(
            session_type=session_type,
            session_id=int(data_id),
            limit=limit,
        )

    except Exception as e:
        return f"读取当前会话失败: {e}"


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


@mcp.tool()
async def open_seatalk_link(
    url: str = "",
) -> str:
    """通过 SeaTalk 内部机制打开一个 SeaTalk 消息链接，自动跳转到对应会话和消息。

    支持 link.seatalk.io/message/open?message_id=xxx 格式的链接。
    使用 SeaTalk 的 app-link-click 事件处理内部导航，不会弹框或卡死。

    打开后可用 read_current_chat 读取跳转后的会话消息。

    Args:
        url: SeaTalk 消息链接 (https://link.seatalk.io/message/open?message_id=xxx)
    """
    if not url:
        return "请提供 url 参数"

    err = _check_cdp_available()
    if err:
        return err

    try:
        safe_url = json.dumps(url)
        js_code = f"""(function(){{
            try {{
                window.dispatchEvent(new CustomEvent('app-link-click', {{
                    detail: {{ url: {safe_url} }}
                }}));
                return JSON.stringify({{ok: true, url: {safe_url}}});
            }} catch(e) {{
                return JSON.stringify({{error: e.message}});
            }}
        }})()"""

        raw = await _eval_js(js_code)
        result = json.loads(raw) if isinstance(raw, str) else raw

        if result.get("error"):
            return f"打开链接失败: {result['error']}"

        # 等待导航完成
        import asyncio as _asyncio
        await _asyncio.sleep(2)

        # 读取跳转后的会话信息
        session_js = """(function(){
            var s = window.store.getState();
            var sess = s.messages.selectedSession;
            if (!sess) return JSON.stringify({error: 'no session'});
            var name = '';
            if (sess.type === 'group') {
                var gi = (s.contact.groupInfo || {})[sess.id];
                name = gi ? (gi.name || '') : 'group-' + sess.id;
            } else {
                var ui = (s.contact.userInfo || {})[sess.id];
                name = ui ? (ui.name || '') : 'user-' + sess.id;
            }
            return JSON.stringify({type: sess.type, id: sess.id, name: name});
        })()"""

        sess_raw = await _eval_js(session_js)
        sess = json.loads(sess_raw) if isinstance(sess_raw, str) else sess_raw

        if sess.get("error"):
            return f"链接已触发跳转，但未检测到当前会话。请稍等片刻后用 read_current_chat 读取。"

        return (
            f"已跳转到: [{sess.get('type', '')}] {sess.get('name', '')} (id={sess.get('id', '')})\n"
            f"可以用 read_current_chat 或 query_messages_sqlite 读取消息。"
        )

    except Exception as e:
        return f"打开链接失败: {e}"


@mcp.tool()
async def query_messages_sqlite(
    session_type: str = "group",
    session_id: int = 0,
    session_name: str = "",
    keyword: str = "",
    limit: int = 30,
    hours: int = 168,
) -> str:
    """通过 SQLite 数据库直接查询 SeaTalk 消息（最强大的消息读取方式）。

    直接查询 SeaTalk 本地 SQLite 数据库，可以读取所有历史消息。
    支持两种查询模式:
    1. 指定会话: 给 session_name 或 session_id，查该会话的消息（可选 keyword 过滤）
    2. 跨群搜索: 只给 keyword 不给 session_name/session_id，跨所有群聊搜索包含关键词的消息

    Args:
        session_type: 会话类型 - "group"(群聊) 或 "buddy"(私聊)
        session_id: 会话 ID（可选）
        session_name: 会话名称（模糊匹配，可选）
        keyword: 搜索关键词（可选，在消息内容中搜索。单独使用时变为跨群搜索）
        limit: 返回消息数量上限，默认30
        hours: 搜索时间范围（小时），默认168（7天）
    """
    err = _check_cdp_available()
    if err:
        return err

    # 如果给了名字，先查找 session_id
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
            return JSON.stringify(matches.slice(0, 5));
        }})()""")
        matches = json.loads(search_result) if isinstance(search_result, str) else search_result
        if not matches:
            return f"未找到匹配 '{session_name}' 的会话"
        if len(matches) > 1:
            lines = [f"找到 {len(matches)} 个匹配，请指定 session_id:\n"]
            for m in matches:
                lines.append(f"  [{m['type']}] {m['name']} (id={m['id']})")
            return "\n".join(lines)
        session_type = matches[0]["type"]
        session_id = matches[0]["id"]

    if not session_id and not keyword:
        return "请提供 session_name/session_id 或 keyword（至少一个）"

    import time
    min_ts = int(time.time()) - hours * 3600
    cross_session = not session_id
    sid = f"{session_type}-{session_id}" if session_id else ""
    safe_keyword = json.dumps(f"%{keyword}%") if keyword else '""'

    js_code = f"""(function(){{
        if (!window.sqlite || typeof window.sqlite.all !== 'function')
            return JSON.stringify({{error: 'sqlite not available'}});

        var args = {{
            sid: {json.dumps(sid)},
            limit: {limit},
            minTs: {min_ts},
            keyword: {safe_keyword},
            crossSession: {'true' if cross_session else 'false'}
        }};

        var sql = 'SELECT mid, sid, u, c, t, ts, rtmid, q FROM chat_message WHERE ts > ?';
        var sqlArgs = [args.minTs];

        if (!args.crossSession && args.sid) {{
            sql += ' AND sid = ?';
            sqlArgs.push(args.sid);
        }}

        if (args.keyword) {{
            sql += ' AND c LIKE ?';
            sqlArgs.push(args.keyword);
        }}

        sql += ' ORDER BY ts DESC LIMIT ?';
        sqlArgs.push(args.limit);

        // Thread 元数据查询（异步）
        var threadSql = args.crossSession
            ? 'SELECT sid, mid, totalReplyCount, latestReplyTime FROM thread_info WHERE latestReplyTime > ' + args.minTs
            : (args.sid ? "SELECT sid, mid, totalReplyCount, latestReplyTime FROM thread_info WHERE sid = '" + args.sid + "'" : '');
        var threadPromise = threadSql ? window.sqlite.all(threadSql).catch(function() {{ return []; }}) : Promise.resolve([]);

        return Promise.all([window.sqlite.all(sql, sqlArgs), threadPromise]).then(function(results) {{
        var rows = results[0];
        var threadRows = results[1] || [];
        var threadMap = {{}};
        for (var ti = 0; ti < threadRows.length; ti++) {{
            threadMap[threadRows[ti].mid] = {{
                replyCount: threadRows[ti].totalReplyCount || 0,
                lastReply: threadRows[ti].latestReplyTime || 0
            }};
        }}
            var st = window.store.getState();
            var info = st.contact.userInfo;
            var groups = st.contact.groupInfo;

            var userId = st.login && st.login.userid;
            var gfsToken = '';
            var imgEls = document.querySelectorAll("img[src*='f.haiserve.com']");
            for (var ti = 0; ti < imgEls.length; ti++) {{
                var tm = imgEls[ti].src.match(/token=([a-f0-9]+)/);
                if (tm) {{ gfsToken = tm[1]; break; }}
            }}

            function resolveSessName(sid) {{
                var parts = sid.split('-');
                if (parts[0] === 'group') {{
                    var g = groups[parts[1]];
                    return g ? g.name : sid;
                }} else if (parts[0] === 'buddy') {{
                    var u = info[parts[1]];
                    return u ? ('[PM] ' + u.name) : sid;
                }}
                return sid;
            }}

            var sessName = args.sid ? resolveSessName(args.sid) : '(跨群搜索)';

            var messages = [];
            for (var i = rows.length - 1; i >= 0; i--) {{
                var m = rows[i];
                var parsed;
                try {{ parsed = JSON.parse(m.c); }} catch(_) {{ continue; }}
                var tag = m.t || 'text';

                // --- 内容提取（增强版，覆盖 c.c / c.m[] / c.es / c.f） ---
                var text = '';
                if (typeof parsed.c === 'string') {{
                    text = parsed.c;
                }} else if (typeof parsed.text === 'string') {{
                    text = parsed.text;
                }} else if (parsed.c && typeof parsed.c === 'object' && parsed.c.text) {{
                    text = String(parsed.c.text);
                }}
                // c.m[] 嵌套多段消息（转发、富消息）
                if (!text && parsed.m && Array.isArray(parsed.m)) {{
                    // Build uid->name map from parsed.u[] (forwarded message participant list)
                    var fwdUsers = {{}};
                    if (parsed.u && Array.isArray(parsed.u)) {{
                        for (var fu = 0; fu < parsed.u.length; fu++) {{
                            if (parsed.u[fu].uid) fwdUsers[parsed.u[fu].uid] = parsed.u[fu].n || parsed.u[fu].nk || ('user-' + parsed.u[fu].uid);
                        }}
                    }}
                    var mParts = [];
                    var lastUid = null;
                    for (var mi2 = 0; mi2 < parsed.m.length; mi2++) {{
                        var seg = parsed.m[mi2];
                        var segTag = seg.tag || '';
                        var segC = seg.c || {{}};
                        var segUid = seg.uid;
                        var segSender = fwdUsers[segUid] || info[segUid] && info[segUid].name || '';
                        var segText = '';
                        if (segTag === 'text' && segC && typeof segC.c === 'string') segText = segC.c;
                        else if (segTag === 'image') segText = '[图片]';
                        else if (segTag === 'video') segText = '[视频]';
                        else if (segTag === 'file') segText = '[文件' + (segC.n ? ': ' + segC.n : '') + ']';
                        else if (segTag === 'sticker') segText = '[表情]';
                        else if (segTag === 'link') segText = '[链接' + (segC.t ? ': ' + segC.t : (segC.u ? ': ' + segC.u : '')) + ']';
                        else if (segTag === 'history' && segC.m) segText = '[嵌套转发消息]';
                        else if (segC && typeof segC.c === 'string') segText = segC.c;
                        if (segText) {{
                            if (segSender && segUid !== lastUid) {{
                                mParts.push(segSender + ': ' + segText);
                            }} else {{
                                mParts.push(segText);
                            }}
                            lastUid = segUid;
                        }}
                    }}
                    if (mParts.length) {{
                        var fwdTitle = '[转发聊天记录 (' + parsed.m.length + '条)]';
                        text = fwdTitle + '\\n' + mParts.join('\\n');
                    }}
                }}
                // c.es[] 富文本结构
                if (!text && parsed.es && Array.isArray(parsed.es)) {{
                    var esParts = [];
                    for (var ei = 0; ei < parsed.es.length; ei++) {{
                        var esEl = parsed.es[ei];
                        var esC = esEl.c || {{}};
                        var esText = esC.t || esC.c || '';
                        if (esText) esParts.push(esText);
                    }}
                    if (esParts.length) text = esParts.join('\\n');
                }}
                // c.e[] fallback
                if (!text && parsed.e && Array.isArray(parsed.e)) {{
                    text = parsed.e.map(function(el) {{ return el.tx || ''; }}).filter(Boolean).join('\\n');
                }}
                // 按消息类型给占位符
                if (!text) {{
                    var typeLabels = {{image:'[图片]', 'image.gif':'[GIF]', gif:'[GIF]', video:'[视频]', file:'[文件]', sticker:'[表情]', 'sticker.gif':'[表情]', audio:'[语音]', interactive:'[卡片]', history:'[转发]', article:'[链接]'}};
                    text = typeLabels[tag] || '[' + tag + ']';
                }}
                text = String(text);

                var sender = info[m.u];
                var name = sender ? sender.name : String(m.u);

                // --- 媒体 URL + 元数据（增强版） ---
                var mediaUrl = null;
                if ((tag === 'image' || tag === 'image.gif' || tag === 'gif' || tag === 'video' || tag === 'file') && parsed.url && userId && gfsToken) {{
                    mediaUrl = 'https://f.haiserve.com/download/' + parsed.url + '?userid=' + userId + '&token=' + gfsToken + '&exact=true';
                }}
                var mediaInfo = null;
                if (tag === 'image' || tag === 'image.gif' || tag === 'gif') {{
                    mediaInfo = {{w: parsed.w, h: parsed.h, size: parsed.s}};
                    if (parsed.turl) mediaInfo.thumb = parsed.turl;
                }} else if (tag === 'file') {{
                    mediaInfo = {{name: parsed.n || parsed.name || '', size: parsed.s}};
                }} else if (tag === 'video') {{
                    mediaInfo = {{w: parsed.w, h: parsed.h, size: parsed.s, duration: parsed.d}};
                }} else if (tag === 'article') {{
                    var artUrl = (typeof parsed.c === 'string' && parsed.c.indexOf('http') === 0) ? parsed.c : '';
                    if (artUrl || parsed.t) mediaInfo = {{title: parsed.t || '', url: artUrl}};
                }}
                var quote = null;
                if (m.q) {{
                    try {{
                        var qp = JSON.parse(m.q);
                        var qSender = info[qp.u || qp.senderId];
                        var qText = '';
                        if (qp.c) {{
                            try {{
                                var qParsed = JSON.parse(qp.c);
                                qText = typeof qParsed.c === 'string' ? qParsed.c : (typeof qParsed === 'string' ? qParsed : '');
                            }} catch(_) {{ qText = String(qp.c); }}
                        }}
                        quote = {{sender: qSender ? qSender.name : '', text: String(qText).substring(0, 100)}};
                    }} catch(_) {{}}
                }}
                var msgSessName = args.crossSession ? resolveSessName(m.sid) : sessName;
                var threadInfo = threadMap[m.mid];
                messages.push({{
                    mid: m.mid,
                    session: msgSessName,
                    sender: name,
                    text: text.substring(0, 2000),
                    tag: tag,
                    ts: m.ts,
                    isThread: m.rtmid && m.rtmid !== '0',
                    threadRoot: threadInfo ? true : undefined,
                    threadReplies: threadInfo ? threadInfo.replyCount : undefined,
                    mediaUrl: mediaUrl,
                    mediaInfo: mediaInfo,
                    quote: quote
                }});
            }}
            return JSON.stringify({{
                sessionName: sessName,
                sid: args.sid,
                crossSession: args.crossSession,
                total: rows.length,
                messages: messages
            }});
        }});
    }})()"""

    try:
        raw = await _eval_js(js_code)
        data = json.loads(raw) if isinstance(raw, str) else raw

        if isinstance(data, dict) and data.get("error"):
            if "sqlite not available" in data["error"]:
                return (
                    "SQLite 不可用。这可能是因为 SeaTalk 刚启动还未完全加载。\n"
                    "请稍等几秒后重试，或使用 read_seatalk_messages 从 Redux 内存读取。"
                )
            return f"查询失败: {data['error']}"

        is_cross = data.get("crossSession", False)
        session_label = data.get("sessionName", sid)
        prefix = "[群]" if session_type == "group" else "[私]"

        TAG_MAP = {
            "image": "[图片]", "gif": "[GIF]", "file": "[文件]",
            "video": "[视频]", "sticker": "[贴纸]", "audio": "[语音]",
            "interactive": "[卡片]", "history": "[转发]",
        }

        if is_cross:
            kw_display = keyword or "?"
            lines = [
                f"跨群搜索: \"{kw_display}\"",
                f"共 {data.get('total', 0)} 条消息 (最近 {hours}h)\n",
                "─" * 55,
            ]
        else:
            lines = [
                f"{prefix} {session_label} (id={session_id})",
                f"共 {data.get('total', 0)} 条消息 (SQLite 查询，最近 {hours}h)\n",
                "─" * 50,
            ]

        for msg in data.get("messages", []):
            ts_str = datetime.fromtimestamp(msg["ts"], tz=TZ8).strftime("%m-%d %H:%M:%S") if msg.get("ts") else ""
            sender = msg.get("sender", "?")
            tag = msg.get("tag", "text")
            tag_label = (TAG_MAP.get(tag, f"[{tag}]") + " ") if tag != "text" else ""
            thread_mark = ""
            if msg.get("isThread"):
                thread_mark = " [Thread回复]"
            elif msg.get("threadRoot"):
                rc = msg.get("threadReplies", 0)
                thread_mark = f" [Thread·{rc}条回复]" if rc else " [Thread]"
            session_mark = f" [{msg.get('session', '')}]" if is_cross and msg.get("session") else ""

            quote_line = ""
            if msg.get("quote"):
                q = msg["quote"]
                quote_line = f"  (回复 {q['sender']}: \"{q['text'][:50]}\")"

            media_line = ""
            mi = msg.get("mediaInfo") or {}
            if msg.get("mediaUrl"):
                if tag in ("image", "image.gif", "gif"):
                    dim = f" ({mi.get('w', '?')}x{mi.get('h', '?')}, {_fmt_size(mi.get('size', 0))})" if mi else ""
                    media_line = f"  ↳ 图片{dim}: {msg['mediaUrl']}"
                elif tag == "file":
                    fname = mi.get("name", "") if mi else ""
                    fsize = f" ({_fmt_size(mi.get('size', 0))})" if mi and mi.get("size") else ""
                    media_line = f"  ↳ 文件 {fname}{fsize}: {msg['mediaUrl']}"
                elif tag == "video":
                    dur = f" {mi.get('duration', '?')}s" if mi.get("duration") else ""
                    dim = f" {mi.get('w', '?')}x{mi.get('h', '?')}" if mi.get("w") else ""
                    sz = f" {_fmt_size(mi.get('size', 0))}" if mi.get("size") else ""
                    media_line = f"  ↳ 视频{dur}{dim}{sz}: {msg['mediaUrl']}"
            elif tag == "article" and mi.get("url"):
                title = mi.get("title", "")
                media_line = f"  ↳ 链接: {title + ' — ' if title else ''}{mi['url']}"

            text = msg.get("text", "").replace("\n", "\n    ")
            lines.append(f"{ts_str}{session_mark} {sender}: {tag_label}{text}{thread_mark}")
            if quote_line:
                lines.append(quote_line)
            if media_line:
                lines.append(media_line)

        return "\n".join(lines)

    except Exception as e:
        return f"SQLite 查询失败: {e}"


@mcp.tool()
async def query_mentions(
    hours: int = 72,
    limit: int = 50,
) -> str:
    """查询最近 @我 的消息（跨所有群聊和私聊）。

    自动获取当前登录用户 ID，查询 SQLite 中所有在消息内容中提及该用户的消息。
    包括 @提及、直接回复等场景。

    Args:
        hours: 搜索时间范围（小时），默认72（3天）
        limit: 返回消息数量上限，默认50
    """
    err = _check_cdp_available()
    if err:
        return err

    import time
    min_ts = int(time.time()) - hours * 3600

    js_code = f"""(function(){{
        if (!window.sqlite || typeof window.sqlite.all !== 'function')
            return JSON.stringify({{error: 'sqlite not available'}});

        var st = window.store.getState();
        var myUid = st.login && st.login.userid;
        if (!myUid) return JSON.stringify({{error: 'cannot determine current user id'}});

        var uidStr = String(myUid);
        var info = st.contact.userInfo || {{}};
        var groups = st.contact.groupInfo || {{}};

        return window.sqlite.all(
            "SELECT mid, sid, u, c, t, ts, q FROM chat_message WHERE ts > ? AND c LIKE ? AND u != ? ORDER BY ts DESC LIMIT ?",
            [{min_ts}, '%' + uidStr + '%', myUid, {limit}]
        ).then(function(rows) {{
            var results = [];
            for (var i = 0; i < rows.length; i++) {{
                var r = rows[i];
                var senderName = String(r.u);
                if (info[r.u]) senderName = info[r.u].name || info[r.u].nick || senderName;

                var parts = r.sid.split('-');
                var sessionLabel = r.sid;
                if (parts[0] === 'group' && groups[parts[1]]) sessionLabel = groups[parts[1]].name;
                else if (parts[0] === 'buddy' && info[parts[1]]) sessionLabel = '[PM] ' + (info[parts[1]].name || parts[1]);

                var text = '';
                try {{
                    var parsed = JSON.parse(r.c);
                    if (typeof parsed.c === 'string') text = parsed.c;
                    else if (typeof parsed.text === 'string') text = parsed.text;
                    else if (parsed.e && Array.isArray(parsed.e)) {{
                        text = parsed.e.map(function(el) {{ return el.tx || ''; }}).filter(Boolean).join('');
                    }}
                }} catch(e) {{ text = r.c || ''; }}

                var quote = null;
                if (r.q) {{
                    try {{
                        var qp = JSON.parse(r.q);
                        var qSender = info[qp.u || qp.senderId];
                        var qText = '';
                        if (qp.c) {{
                            try {{
                                var qParsed = JSON.parse(qp.c);
                                qText = typeof qParsed.c === 'string' ? qParsed.c : '';
                            }} catch(_) {{ qText = String(qp.c); }}
                        }}
                        quote = {{sender: qSender ? qSender.name : '', text: String(qText).substring(0, 100)}};
                    }} catch(_) {{}}
                }}

                results.push({{
                    session: sessionLabel,
                    sid: r.sid,
                    sender: senderName,
                    text: text.substring(0, 500),
                    tag: r.t || 'text',
                    ts: r.ts,
                    quote: quote
                }});
            }}
            return JSON.stringify({{myUid: myUid, total: results.length, results: results}});
        }});
    }})()"""

    try:
        raw = await _eval_js(js_code)
        data = json.loads(raw) if isinstance(raw, str) else raw

        if isinstance(data, dict) and data.get("error"):
            return f"查询失败: {data['error']}"

        total = data.get("total", 0)
        my_uid = data.get("myUid", "?")

        lines = [
            f"最近 {hours} 小时内 @你(uid={my_uid}) 的消息: {total} 条\n",
            "─" * 55,
        ]

        seen_sessions = set()
        for msg in data.get("results", []):
            ts_str = datetime.fromtimestamp(msg["ts"], tz=TZ8).strftime("%m-%d %H:%M") if msg.get("ts") else ""
            session = msg.get("session", "?")
            sender = msg.get("sender", "?")
            text = msg.get("text", "").replace("\n", " ")[:300]

            lines.append(f"[{ts_str}] [{session}]")
            lines.append(f"  From: {sender}")
            lines.append(f"  {text}")
            if msg.get("quote"):
                q = msg["quote"]
                lines.append(f"  (回复 {q['sender']}: \"{q['text'][:80]}\")")
            lines.append("─" * 55)
            seen_sessions.add(session)

        if total > 0:
            lines.append(f"\n涉及 {len(seen_sessions)} 个会话: {', '.join(sorted(seen_sessions))}")

        return "\n".join(lines)

    except Exception as e:
        return f"查询 @提及 失败: {e}"


@mcp.tool()
async def download_seatalk_image(
    image_url: str = "",
    session_type: str = "group",
    session_id: int = 0,
    message_mid: str = "",
    limit: int = 5,
) -> str:
    """下载 SeaTalk 聊天中的图片到本地，返回本地文件路径。

    下载后可以用 Read 工具读取图片文件，让 AI 理解图片内容。

    三种使用方式（按优先级）：
    1. 提供 image_url — 直接下载（从 query_messages_sqlite 返回的 ↳ 图片 URL）
    2. 提供 session_type + session_id — 自动查找该会话最近的图片消息并下载
    3. 都不提供 — 自动查找当前打开会话的最近图片

    Args:
        image_url: 图片的完整 GFS 下载 URL（从 query_messages_sqlite 结果获取）
        session_type: 会话类型 "group" 或 "buddy"
        session_id: 会话 ID
        message_mid: 指定消息的 mid（精确下载某条消息的图片）
        limit: 最多下载几张图片（默认5，仅在自动查找模式生效）
    """
    import time as _time
    import base64 as _base64
    import urllib.request

    DOWNLOAD_DIR = os.path.expanduser("~/.seatalk-mcp-images")
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)

    err = _check_cdp_available()
    if err:
        return err

    async def _get_gfs_credentials() -> tuple:
        """从 SeaTalk 页面获取 userId 和 GFS token"""
        cred_js = (
            "(function(){"
            "var s = window.store.getState();"
            "var userId = s.login && s.login.userid;"
            "var token = '';"
            "var imgs = document.querySelectorAll('img[src*=\"f.haiserve.com\"]');"
            "for (var i = 0; i < imgs.length; i++) {"
            "var m = imgs[i].src.match(/token=([a-f0-9]+)/);"
            "if (m) { token = m[1]; break; }"
            "}"
            "return JSON.stringify({userId: String(userId || ''), token: token});"
            "})()"
        )
        raw = await _eval_js(cred_js)
        creds = json.loads(raw) if isinstance(raw, str) else raw
        return creds.get("userId", ""), creds.get("token", "")

    def _download_one(url: str, filename: str) -> str:
        """下载单张图片，返回本地路径"""
        filepath = os.path.join(DOWNLOAD_DIR, filename)
        req = urllib.request.Request(url, headers={"User-Agent": "SeaTalk-MCP/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
        with open(filepath, "wb") as f:
            f.write(data)
        return filepath

    # ── 方式1: 直接提供 URL ──
    if image_url:
        try:
            ts = int(_time.time())
            filename = f"img_{ts}.png"
            filepath = _download_one(image_url, filename)
            size = os.path.getsize(filepath)
            return (
                f"图片已下载: {filepath}\n"
                f"大小: {_fmt_size(size)}\n\n"
                f"请用 Read 工具读取此文件来查看图片内容。"
            )
        except Exception as e:
            return f"下载失败: {e}"

    # ── 方式2/3: 从 SQLite 查找图片消息 ──
    userId, gfsToken = await _get_gfs_credentials()
    if not userId or not gfsToken:
        return "无法获取 GFS 凭证（userId 或 token 为空），请确保 SeaTalk 页面已完全加载。"

    # 确定 session
    sid = ""
    if session_id:
        sid = f"{session_type}-{session_id}"
    else:
        sess_js = """(function(){
            var sess = window.store.getState().messages.selectedSession;
            if (!sess) return JSON.stringify({error: 'no session'});
            return JSON.stringify({type: sess.type, id: sess.id});
        })()"""
        sess_raw = await _eval_js(sess_js)
        sess = json.loads(sess_raw) if isinstance(sess_raw, str) else sess_raw
        if sess.get("error"):
            return "未找到当前会话，请提供 session_type 和 session_id。"
        sid = f"{sess['type']}-{sess['id']}"

    # 查询图片消息
    mid_filter = f"AND mid = '{message_mid}'" if message_mid else ""
    find_js = f"""(function(){{
        if (!window.sqlite) return JSON.stringify({{error: 'sqlite not available'}});
        return window.sqlite.all(
            "SELECT mid, c, ts FROM chat_message WHERE sid = ? AND t = 'image' {mid_filter} ORDER BY ts DESC LIMIT ?",
            ['{sid}', {limit}]
        ).then(function(rows) {{
            var results = [];
            for (var i = 0; i < rows.length; i++) {{
                try {{
                    var p = JSON.parse(rows[i].c);
                    results.push({{
                        mid: rows[i].mid,
                        ts: rows[i].ts,
                        url: p.url || '',
                        w: p.w || 0,
                        h: p.h || 0,
                        s: p.s || 0
                    }});
                }} catch(_) {{}}
            }}
            return JSON.stringify(results);
        }});
    }})()"""

    try:
        raw = await _eval_js(find_js)
        images = json.loads(raw) if isinstance(raw, str) else raw
    except Exception as e:
        return f"查询图片消息失败: {e}"

    if isinstance(images, dict) and images.get("error"):
        return f"查询失败: {images['error']}"

    if not images:
        return f"在 {sid} 中未找到图片消息。"

    # 逐张下载
    downloaded = []
    for img in images:
        if not img.get("url"):
            continue
        dl_url = f"https://f.haiserve.com/download/{img['url']}?userid={userId}&token={gfsToken}&exact=true"
        ts_str = datetime.fromtimestamp(img["ts"], tz=TZ8).strftime("%m%d_%H%M%S") if img.get("ts") else str(int(_time.time()))
        filename = f"img_{ts_str}_{img['mid'][-6:]}.png"
        try:
            filepath = _download_one(dl_url, filename)
            size = os.path.getsize(filepath)
            downloaded.append({
                "path": filepath,
                "mid": img["mid"],
                "size": size,
                "w": img.get("w", 0),
                "h": img.get("h", 0),
            })
        except Exception as e:
            downloaded.append({"mid": img["mid"], "error": str(e)})

    if not downloaded:
        return "未找到可下载的图片。"

    lines = [f"已下载 {len([d for d in downloaded if 'path' in d])}/{len(downloaded)} 张图片:\n"]
    for d in downloaded:
        if "path" in d:
            lines.append(
                f"  {d['path']}\n"
                f"    尺寸: {d['w']}x{d['h']}, 大小: {_fmt_size(d['size'])}"
            )
        else:
            lines.append(f"  [失败] mid={d['mid']}: {d.get('error', 'unknown')}")

    lines.append(f"\n请用 Read 工具读取上述图片文件来查看内容。")
    return "\n".join(lines)


@mcp.tool()
async def search_seatalk_users(
    keyword: str = "",
    limit: int = 20,
) -> str:
    """在 SeaTalk 企业通讯录中搜索用户。

    搜索 Redux store 中缓存的所有企业用户（userInfo），支持按姓名、邮箱、
    seatalkId 模糊匹配。

    ⚠️ 重要：搜索到的用户不一定是好友。只有好友（isFavorite=true）才能通过
    send_seatalk_message 私聊发消息。非好友发送消息会"假发送"（前端看似成功，
    但对方实际收不到）。如需给非好友发消息，请先用 add_seatalk_contact 添加好友。

    Args:
        keyword: 搜索关键词（姓名/邮箱/seatalkId，大小写不敏感）
        limit: 返回数量上限，默认20
    """
    if not keyword:
        return "请提供 keyword（搜索关键词）"

    err = _check_cdp_available()
    if err:
        return err

    safe_kw = json.dumps(keyword)
    js_code = f"""(function(){{
        var s = window.store.getState().contact;
        var ui = s.userInfo || {{}};
        var bl = s.buddyList || [];
        var buddyIds = {{}};
        for (var i = 0; i < bl.length; i++) buddyIds[bl[i].id] = true;

        var kw = {safe_kw}.toLowerCase();
        var results = [];
        for (var uid in ui) {{
            var u = ui[uid];
            if (!u) continue;
            var name = (u.name || '').toLowerCase();
            var email = (u.email || '').toLowerCase();
            var stId = (u.seatalkId || '').toLowerCase();
            if (name.indexOf(kw) >= 0 || email.indexOf(kw) >= 0 || stId.indexOf(kw) >= 0) {{
                results.push({{
                    id: parseInt(uid),
                    name: u.name || '',
                    email: u.email || '',
                    seatalkId: u.seatalkId || '',
                    isFavorite: !!buddyIds[uid],
                    status: u.personalStatus || null
                }});
            }}
            if (results.length >= {limit}) break;
        }}
        results.sort(function(a, b) {{
            var aExact = a.name.toLowerCase() === kw || a.email.toLowerCase() === kw;
            var bExact = b.name.toLowerCase() === kw || b.email.toLowerCase() === kw;
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            return 0;
        }});
        return JSON.stringify({{total: Object.keys(ui).length, found: results.length, results: results}});
    }})()"""

    try:
        raw = await _eval_js(js_code)
        data = json.loads(raw) if isinstance(raw, str) else raw

        total = data.get("total", 0)
        found = data.get("found", 0)
        results = data.get("results", [])

        if not results:
            return f"在 {total} 个企业用户中未找到匹配 '{keyword}' 的人。"

        lines = [f"搜索 '{keyword}' — 找到 {found} 人（企业通讯录共 {total} 人）\n"]
        for u in results:
            fav = " [星标]" if u.get("isFavorite") else ""
            status = ""
            if u.get("status"):
                ps = u["status"]
                if isinstance(ps, dict):
                    status_text = ps.get("text") or ps.get("status") or ""
                    if status_text:
                        status = f"  状态: {status_text}"

            lines.append(
                f"  {u['name']}{fav}\n"
                f"    ID: {u['id']}  |  发消息: session=\"buddy-{u['id']}\"\n"
                f"    邮箱: {u['email']}"
                f"{status}"
            )

        lines.append(
            f"\n⚠️ 注意: 只有好友（标记 [星标] 的用户）才能通过 buddy-{{id}} 私聊发消息。"
            f"\n非好友发消息会假发送（前端显示成功但对方收不到）。"
            f"\n如需给非好友发消息，请先用 add_seatalk_contact 添加好友。"
        )
        return "\n".join(lines)

    except Exception as e:
        return f"搜索用户失败: {e}"


@mcp.tool()
async def add_seatalk_contact(
    user_id: int = 0,
    user_name: str = "",
    user_email: str = "",
) -> str:
    """添加 SeaTalk 联系人（好友）— 需用户确认。

    ⚠️ 安全机制：
    - 调用此工具后，请求会提交到 seatalk-agent 的确认队列
    - 用户必须在 SeaTalk Agent 面板中点击「确认添加」才会真正添加
    - 此工具不能直接添加联系人，必须经过 seatalk-agent 的权限控制

    ⚠️ AI 行为规则：
    1. 只有当用户**明确要求添加好友**时才可以调用（如"加一下XX"、"添加XX为好友"）
    2. **禁止**自动批量添加联系人
    3. 调用前必须告知用户即将添加的联系人信息

    Args:
        user_id: 用户 ID（从 search_seatalk_users 获取）
        user_name: 用户名（模糊匹配）
        user_email: 用户邮箱（精确匹配，优先级最高）
    """
    err = _check_cdp_available()
    if err:
        return err

    # Resolve user info from email or name
    if user_email and not user_id:
        result = await _eval_js(f"""(function(){{
            var ui = window.store.getState().contact.userInfo || {{}};
            for (var uid in ui) {{
                if (ui[uid] && ui[uid].email === {json.dumps(user_email)})
                    return JSON.stringify({{id: parseInt(uid), name: ui[uid].name, email: ui[uid].email}});
            }}
            return JSON.stringify({{error: 'not found'}});
        }})()""")
        data = json.loads(result) if isinstance(result, str) else result
        if data.get("error"):
            return f"在企业通讯录中未找到邮箱 '{user_email}'"
        user_id = data["id"]
        user_name = data.get("name", "")
    elif user_name and not user_id:
        result = await _eval_js(f"""(function(){{
            var ui = window.store.getState().contact.userInfo || {{}};
            var kw = {json.dumps(user_name)}.toLowerCase();
            var matches = [];
            for (var uid in ui) {{
                var u = ui[uid];
                if (!u) continue;
                var n = (u.name || '').toLowerCase();
                var e = (u.email || '').toLowerCase();
                if (n.indexOf(kw) >= 0 || e.indexOf(kw) >= 0)
                    matches.push({{id: parseInt(uid), name: u.name, email: u.email}});
                if (matches.length >= 5) break;
            }}
            return JSON.stringify(matches);
        }})()""")
        matches = json.loads(result) if isinstance(result, str) else result
        if not matches:
            return f"未找到匹配 '{user_name}' 的用户"
        if len(matches) > 1:
            lines = [f"找到 {len(matches)} 个匹配，请用 user_email 精确指定:\n"]
            for m in matches:
                lines.append(f"  {m['name']} ({m['email']})  →  user_id={m['id']}")
            return "\n".join(lines)
        user_id = matches[0]["id"]
        user_name = matches[0].get("name", "")

    if not user_id:
        return "请提供 user_id, user_name 或 user_email"

    # Send via seatalk-agent bridge handler which enforces user confirmation
    bridge_js = f"""(function(){{
        if (typeof window.__agentSend !== 'function')
            return JSON.stringify({{error: 'seatalk-agent bridge not available. Is seatalk-agent running with the Agent panel open?'}});
        window.__agentSend(JSON.stringify({{
            type: 'add_contact',
            userId: {user_id},
            name: {json.dumps(user_name or f'user-{user_id}')}
        }}));
        return JSON.stringify({{queued: true}});
    }})()"""

    try:
        raw = await _eval_js(bridge_js)
        result = json.loads(raw) if isinstance(raw, str) else raw

        if isinstance(result, dict) and result.get("error"):
            return f"添加联系人失败: {result['error']}"

        display_name = user_name or f"user-{user_id}"
        return (
            f"添加联系人请求已提交到 seatalk-agent 等待用户确认。\n"
            f"  用户: {display_name} (id={user_id})\n\n"
            f"用户需要在 SeaTalk Agent 面板中点击「确认添加」才会真正添加。"
        )
    except Exception as e:
        return f"添加联系人失败: {str(e)}"


@mcp.tool()
async def send_seatalk_message(
    session: str = "",
    text: str = "",
    format: str = "text",
    session_name: str = "",
    root_mid: str = "",
    reply_to_keyword: str = "",
    reply_to_sender: str = "",
) -> str:
    """向指定的 SeaTalk 会话发送消息（需用户确认）。

    ⚠️ 重要限制 — 好友关系：
    - 私聊（buddy）：只能向**已是好友**的用户发送消息，否则消息会"假发送"
      （前端显示已发送，但对方实际收不到）
    - 群聊（group）：只要是群成员即可正常发送
    - 如果目标用户不是好友，请先用 add_seatalk_contact 添加好友，等对方通过后再发送
    - 企业 SeaTalk 中**不是所有同事都能直接发消息**，必须先成为好友

    ⚠️ 安全机制：
    - 调用此工具后，消息会提交到 seatalk-agent 的确认队列
    - 用户必须在 SeaTalk Agent 面板中点击「确认发送」才会真正发送
    - 如果用户已开启「免确认」模式，消息会自动发送
    - 此工具不能直接发送消息，必须经过 seatalk-agent 的权限控制

    ⚠️ 在 Cursor 中使用本工具（通过 MCP）：
    - Cursor Agent 调用本工具 → 消息提交到 seatalk-agent bridge → 等待用户确认
    - 如果消息一直没发出去，请检查 SeaTalk Agent 面板是否有待确认的卡片
    - 如果希望 Cursor 中自动发送而无需手动确认，需要先在 SeaTalk Agent 面板
      开启「免确认」开关（输入框上方，和模型选择对齐的 toggle 按钮）
    - 「免确认」开关仅在当前 seatalk-agent 会话期间有效，重启后需重新开启

    ⚠️ AI 行为规则：
    1. 只有当用户**明确要求发送**时才可以调用（如"给XX发消息"、"帮我发给XX"、"回复XX"等）
    2. **禁止**自作主张发送消息——即使上下文暗示需要发送，也必须先向用户确认
    3. 调用前必须向用户展示完整的消息内容和目标会话

    使用方法：
    1. 先用 list_seatalk_chats 获取会话列表，确定 session 格式
    2. session 格式为 "group-123456" 或 "buddy-123456"
    3. 如果不确定 session ID，可以用 session_name 模糊匹配
    4. 要在某条消息的线程中回复，有两种方式（见下方"线程回复"）
    5. 私聊前请确认对方是好友（search_seatalk_users 返回的 isFavorite 字段）

    线程回复（两种方式）：
    - 方式1（推荐）：传 reply_to_keyword="关键词"，自动在目标会话中查找包含该关键词的最近消息并回复其线程。
      可选加 reply_to_sender="发送者名字" 进一步限定。一步完成，无需先查 mid。
    - 方式2：先用 query_messages_sqlite 获取 mid，再传 root_mid="消息mid"
    - 如果同时提供 root_mid 和 reply_to_keyword，root_mid 优先
    - 不传 root_mid 和 reply_to_keyword 则为普通消息发送

    Args:
        session: 目标会话，格式 "group-{id}" 或 "buddy-{id}"
        text: 消息文本内容
        format: "text"(纯文本) 或 "markdown"(支持加粗、斜体、代码等)
        session_name: 会话名称（模糊匹配，如果没有 session 参数则用这个查找）
        root_mid: 线程回复的目标消息 mid（可选，传入后消息将作为该消息的线程回复）
        reply_to_keyword: 线程回复关键词（可选）。自动在目标会话的 SQLite 中搜索包含该关键词的最近消息，
            取其 mid 作为线程回复目标。比手动查 mid 更快捷。
        reply_to_sender: 配合 reply_to_keyword 使用（可选）。限定搜索范围到特定发送者（模糊匹配名字）。
    """
    if not text:
        return "请提供 text（消息内容）参数"

    err = _check_cdp_available()
    if err:
        return err

    # If session_name provided but no session, look up the ID
    if session_name and not session:
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
            return JSON.stringify(matches.slice(0, 5));
        }})()""")
        matches = json.loads(search_result) if isinstance(search_result, str) else search_result
        if not matches:
            return f"未找到匹配 '{session_name}' 的会话"
        if len(matches) > 1:
            lines = [f"找到 {len(matches)} 个匹配 '{session_name}' 的会话，请用 session 参数指定:\n"]
            for m in matches:
                prefix = "[群]" if m["type"] == "group" else "[私]"
                lines.append(f"  {prefix} {m['name']} → session=\"{m['type']}-{m['id']}\"")
            return "\n".join(lines)
        session = f"{matches[0]['type']}-{matches[0]['id']}"

    if not session:
        return "请提供 session（如 'group-123456'）或 session_name 参数"

    import re
    if not re.match(r'^(group|buddy)-\d+$', session):
        return f"session 格式错误: '{session}'，应为 'group-NNN' 或 'buddy-NNN'"

    # Resolve session name for confirmation
    parts = session.split('-')
    sess_type, sess_id = parts[0], parts[1]
    name_js = f"""(function(){{
        var s = window.store.getState().contact;
        if ('{sess_type}' === 'group') return (s.groupInfo[{sess_id}] || {{}}).name || '';
        return (s.userInfo[{sess_id}] || {{}}).name || '';
    }})()"""
    try:
        sess_name = await _eval_js(name_js) or session
    except Exception:
        sess_name = session

    # Auto-lookup mid via SQLite when reply_to_keyword is provided
    if not root_mid and reply_to_keyword and session:
        safe_kw = json.dumps(f"%{reply_to_keyword}%")
        sender_filter = ""
        if reply_to_sender:
            sender_filter = f"""
                var senderKw = {json.dumps(reply_to_sender)}.toLowerCase();
                rows = rows.filter(function(r) {{
                    var uName = (info[r.u] || {{}}).name || '';
                    return uName.toLowerCase().indexOf(senderKw) >= 0;
                }});"""

        lookup_js = f"""(function(){{
            if (!window.sqlite || typeof window.sqlite.all !== 'function')
                return JSON.stringify({{error: 'sqlite not available'}});
            return window.sqlite.all(
                "SELECT mid, u, c, ts FROM chat_message WHERE sid = ? AND c LIKE ? ORDER BY ts DESC LIMIT 20",
                [{json.dumps(session)}, {safe_kw}]
            ).then(function(rows) {{
                var info = window.store.getState().contact.userInfo || {{}};
                {sender_filter}
                if (!rows.length) return JSON.stringify({{error: 'no match'}});
                var best = rows[0];
                var senderName = (info[best.u] || {{}}).name || String(best.u);
                var parsed = {{}};
                try {{ parsed = JSON.parse(best.c); }} catch(_) {{}}
                var text = parsed.c || parsed.text || '';
                return JSON.stringify({{mid: best.mid, sender: senderName, text: String(text).substring(0, 100), ts: best.ts}});
            }});
        }})()"""

        try:
            raw = await _eval_js(lookup_js)
            lookup = json.loads(raw) if isinstance(raw, str) else raw
            if isinstance(lookup, dict) and lookup.get("mid"):
                root_mid = str(lookup["mid"])
            elif isinstance(lookup, dict) and lookup.get("error") == "no match":
                scope = f" (发送者: {reply_to_sender})" if reply_to_sender else ""
                return f"在 {sess_name} ({session}) 中未找到包含 '{reply_to_keyword}' 的消息{scope}。"
            elif isinstance(lookup, dict) and lookup.get("error"):
                return f"SQLite 查询失败: {lookup['error']}"
        except Exception as e:
            return f"查找线程目标消息失败: {e}"

    # Build bridge payload
    payload_fields = {
        "type": "send_message",
        "session": session,
        "text": text,
        "format": format,
    }
    if root_mid:
        payload_fields["rootMid"] = root_mid

    # Send via seatalk-agent bridge handler which enforces user confirmation.
    bridge_js = f"""(function(){{
        if (typeof window.__agentSend !== 'function')
            return JSON.stringify({{error: 'seatalk-agent bridge not available. Is seatalk-agent running with the Agent panel open?'}});
        window.__agentSend({json.dumps(json.dumps(payload_fields))});
        return JSON.stringify({{queued: true}});
    }})()"""

    try:
        raw = await _eval_js(bridge_js)
        result = json.loads(raw) if isinstance(raw, str) else raw

        if isinstance(result, dict) and result.get("error"):
            error_msg = result["error"]
            return f"发送失败: {error_msg}"

        preview = text[:80] + ('...' if len(text) > 80 else '')
        thread_info = f"\n  线程: rootMid={root_mid}" if root_mid else ""
        return (
            f"消息已提交到 seatalk-agent 等待用户确认。\n"
            f"  目标: {sess_name} ({session})\n"
            f"  内容: {preview}\n"
            f"  格式: {format}{thread_info}\n\n"
            f"用户需要在 SeaTalk Agent 面板中点击「确认发送」才会真正发送。\n"
            f"如果已开启「会话级免确认」模式，消息会自动发送。"
        )

    except Exception as e:
        return f"发送消息失败: {e}"


@mcp.tool()
async def get_send_targets() -> str:
    """获取可用的 SeaTalk 发送目标列表。

    列出当前登录用户的会话列表，显示可用于 send_seatalk_message 的 session 参数值。
    返回最近活跃的群聊和私聊，包括名称和对应的 session 标识符。
    """
    err = _check_cdp_available()
    if err:
        return err

    try:
        raw = await _eval_js("""(function(){
            if (typeof window.__seatalkSendInfo === 'function') return JSON.stringify(window.__seatalkSendInfo());
            var s = window.store.getState();
            var result = {currentSession: null, sessions: []};
            var sel = s.messages.selectedSession;
            if (sel) result.currentSession = (sel.type === 'group' ? 'group' : 'buddy') + '-' + sel.id;
            var sessions = s.messages.sessionList || [];
            var info = s.contact.userInfo || {};
            var groups = s.contact.groupInfo || {};
            for (var i = 0; i < Math.min(sessions.length, 30); i++) {
                var sess = sessions[i];
                if (!sess) continue;
                var name = '';
                if (sess.type === 'group') name = (groups[sess.id] || {}).name || 'group-' + sess.id;
                else name = (info[sess.id] || {}).name || 'user-' + sess.id;
                result.sessions.push({id: sess.type + '-' + sess.id, name: name});
            }
            return JSON.stringify(result);
        })()""")

        data = json.loads(raw) if isinstance(raw, str) else raw

        lines = []
        if data.get("currentSession"):
            lines.append(f"当前会话: {data['currentSession']}\n")

        sessions = data.get("sessions", [])
        if sessions:
            lines.append(f"最近 {len(sessions)} 个会话 (可直接用于 send_seatalk_message 的 session 参数):\n")
            for s in sessions:
                lines.append(f"  {s['name']}  →  session=\"{s['id']}\"")
        else:
            lines.append("当前没有可用的会话列表。")

        return "\n".join(lines)

    except Exception as e:
        return f"获取发送目标失败: {e}"


@mcp.tool()
async def recall_seatalk_message(
    session: str = "",
    mid: str = "",
    session_name: str = "",
) -> str:
    """撤回已发送的 SeaTalk 消息（需用户确认）。

    ⚠️ 安全机制：
    - 调用此工具后，撤回请求会提交到 seatalk-agent 的确认队列
    - 用户必须在 SeaTalk Agent 面板中点击「确认撤回」才会真正执行
    - 如果用户已开启「免确认」模式，撤回会自动执行
    - 此工具不能直接撤回消息，必须经过 seatalk-agent 的权限控制

    ⚠️ 在 Cursor 中使用本工具（通过 MCP）：
    - Cursor Agent 调用本工具 → 撤回请求提交到 seatalk-agent bridge → 等待用户确认
    - 如果撤回一直没执行，请检查 SeaTalk Agent 面板是否有待确认的卡片
    - 如果希望自动执行而无需手动确认，需要先在 SeaTalk Agent 面板
      开启「免确认」开关（输入框上方，和模型选择对齐的 toggle 按钮）
    - 「免确认」开关仅在当前 seatalk-agent 会话期间有效，重启后需重新开启

    ⚠️ 限制：
    - 只能撤回**自己发送的**消息
    - SeaTalk 有 2 分钟撤回时间窗口限制（群管理员可能没有此限制）
    - 需要消息的 mid（可通过 query_messages_sqlite 或 read_current_chat 获取）

    ⚠️ AI 行为规则：
    1. 只有当用户**明确要求撤回**时才可以调用（如"撤回刚才的消息"、"删掉那条消息"等）
    2. **禁止**自作主张撤回消息
    3. 调用前必须向用户确认要撤回的具体消息

    Args:
        session: 目标会话，格式 "group-{id}" 或 "buddy-{id}"
        mid: 要撤回的消息 ID（mid）
        session_name: 会话名称（模糊匹配，如果没有 session 参数则用这个查找）
    """
    if not mid:
        return "请提供 mid（消息 ID）参数。可通过 query_messages_sqlite 或 read_current_chat 获取。"

    err = _check_cdp_available()
    if err:
        return err

    # If session_name provided but no session, look up the ID
    if session_name and not session:
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
            return JSON.stringify(matches.slice(0, 5));
        }})()""")
        matches = json.loads(search_result) if isinstance(search_result, str) else search_result
        if not matches:
            return f"未找到匹配 '{session_name}' 的会话"
        if len(matches) > 1:
            lines = [f"找到 {len(matches)} 个匹配 '{session_name}' 的会话，请用 session 参数指定:\n"]
            for m in matches:
                prefix = "[群]" if m["type"] == "group" else "[私]"
                lines.append(f"  {prefix} {m['name']} → session=\"{m['type']}-{m['id']}\"")
            return "\n".join(lines)
        session = f"{matches[0]['type']}-{matches[0]['id']}"

    if not session:
        return "请提供 session（如 'group-123456'）或 session_name 参数"

    import re
    if not re.match(r'^(group|buddy)-\d+$', session):
        return f"session 格式错误: '{session}'，应为 'group-NNN' 或 'buddy-NNN'"

    # Resolve session name for display
    parts = session.split('-')
    sess_type, sess_id = parts[0], parts[1]
    name_js = f"""(function(){{
        var s = window.store.getState().contact;
        if ('{sess_type}' === 'group') return (s.groupInfo[{sess_id}] || {{}}).name || '';
        return (s.userInfo[{sess_id}] || {{}}).name || '';
    }})()"""
    try:
        sess_name = await _eval_js(name_js) or session
    except Exception:
        sess_name = session

    payload_fields = {
        "type": "recall_message",
        "session": session,
        "mid": mid,
    }

    bridge_js = f"""(function(){{
        if (typeof window.__agentSend !== 'function')
            return JSON.stringify({{error: 'seatalk-agent bridge not available. Is seatalk-agent running with the Agent panel open?'}});
        window.__agentSend({json.dumps(json.dumps(payload_fields))});
        return JSON.stringify({{queued: true}});
    }})()"""

    try:
        raw = await _eval_js(bridge_js)
        result = json.loads(raw) if isinstance(raw, str) else raw

        if isinstance(result, dict) and result.get("error"):
            error_msg = result["error"]
            return f"撤回失败: {error_msg}"

        return (
            f"撤回请求已提交到 seatalk-agent 等待用户确认。\n"
            f"  会话: {sess_name} ({session})\n"
            f"  消息 ID: {mid}\n\n"
            f"用户需要在 SeaTalk Agent 面板中点击「确认撤回」才会真正执行。\n"
            f"如果已开启「免确认」模式，撤回会自动执行。"
        )

    except Exception as e:
        return f"撤回消息失败: {e}"


# ═══════════════════════════════════════════════════════════════
#  启动入口
# ═══════════════════════════════════════════════════════════════

def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()

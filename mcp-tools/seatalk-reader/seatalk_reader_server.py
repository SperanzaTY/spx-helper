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

        return window.sqlite.all(sql, sqlArgs).then(function(rows) {{
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
                var text = '';
                if (typeof parsed.c === 'string') text = parsed.c;
                else if (typeof parsed.text === 'string') text = parsed.text;
                else if (parsed.c && typeof parsed.c === 'object' && parsed.c.text) text = String(parsed.c.text);
                if (!text && parsed.e && Array.isArray(parsed.e)) {{
                    text = parsed.e.map(function(el) {{ return el.tx || ''; }}).filter(Boolean).join('\\n');
                }}
                text = String(text || '');
                var sender = info[m.u];
                var name = sender ? sender.name : String(m.u);
                var tag = m.t || 'text';
                var mediaUrl = null;
                if ((tag === 'image' || tag === 'gif' || tag === 'video' || tag === 'file') && parsed.url && userId && gfsToken) {{
                    mediaUrl = 'https://f.haiserve.com/download/' + parsed.url + '?userid=' + userId + '&token=' + gfsToken + '&exact=true';
                }}
                var mediaInfo = null;
                if (tag === 'image' || tag === 'gif') {{
                    mediaInfo = {{w: parsed.w, h: parsed.h, size: parsed.s}};
                }} else if (tag === 'file') {{
                    mediaInfo = {{name: parsed.n || parsed.name || '', size: parsed.s}};
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
                messages.push({{
                    mid: m.mid,
                    session: msgSessName,
                    sender: name,
                    text: text.substring(0, 2000),
                    tag: tag,
                    ts: m.ts,
                    isThread: m.rtmid && m.rtmid !== '0',
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
            thread_mark = " [Thread]" if msg.get("isThread") else ""
            session_mark = f" [{msg.get('session', '')}]" if is_cross and msg.get("session") else ""

            quote_line = ""
            if msg.get("quote"):
                q = msg["quote"]
                quote_line = f"  (回复 {q['sender']}: \"{q['text'][:50]}\")"

            media_line = ""
            if msg.get("mediaUrl"):
                mi = msg.get("mediaInfo") or {}
                if tag in ("image", "gif"):
                    dim = f" ({mi.get('w', '?')}x{mi.get('h', '?')}, {_fmt_size(mi.get('size', 0))})" if mi else ""
                    media_line = f"  ↳ 图片{dim}: {msg['mediaUrl']}"
                elif tag == "file":
                    fname = mi.get("name", "") if mi else ""
                    fsize = f" ({_fmt_size(mi.get('size', 0))})" if mi and mi.get("size") else ""
                    media_line = f"  ↳ 文件 {fname}{fsize}: {msg['mediaUrl']}"
                elif tag == "video":
                    media_line = f"  ↳ 视频: {msg['mediaUrl']}"

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


# ═══════════════════════════════════════════════════════════════
#  启动入口
# ═══════════════════════════════════════════════════════════════

def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()

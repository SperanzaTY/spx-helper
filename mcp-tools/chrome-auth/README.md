# chrome-auth — Chrome 认证共享库

从 Chrome 浏览器自动提取认证信息（Cookie、Token、Header），为所有 MCP 提供统一的认证能力。

## 架构

```
┌──────────────────────────────────────────────────────┐
│                     chrome-auth                       │
│                                                       │
│  ┌─────────────────┐  ┌────────────────────────────┐ │
│  │  cookie_provider │  │       cdp_provider          │ │
│  │  (磁盘 Cookie)   │  │  (CDP 实时数据)             │ │
│  │                  │  │                             │ │
│  │  browser_cookie3 │  │  ┌─────────┐ ┌───────────┐ │ │
│  │  读取 Chrome     │  │  │ Storage │ │  Cookies  │ │ │
│  │  Cookie 数据库   │  │  │ local/  │ │ Network.  │ │ │
│  │                  │  │  │ session │ │ getCookies│ │ │
│  │                  │  │  ├─────────┤ ├───────────┤ │ │
│  │                  │  │  │ Header  │               │ │
│  │                  │  │  │ 拦截    │               │ │
│  └────────┬─────────┘  └──┴────┬────┴───────────────┘ │
│           │                    │                       │
│           └────────┬───────────┘                       │
│                    │                                   │
│           ┌────────▼────────┐                          │
│           │    TTL Cache    │  线程安全，30 分钟过期     │
│           └─────────────────┘                          │
└──────────────────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   scheduler-query  datastudio-mcp  你的新 MCP ...
```

## 四种认证策略

| 策略 | 方式 | 需要 CDP | 适用场景 |
|------|------|----------|----------|
| `cookie_db` | 读取 Chrome 磁盘上的 Cookie 数据库 | 否 | 最常用，适合大部分 Web 平台 |
| `cdp_cookie` | 通过 CDP `Network.getCookies` 获取实时 Cookie | 是 | httpOnly Cookie 或 Service Worker 写入的 Cookie |
| `cdp_storage` | 通过 CDP 读取 `localStorage` / `sessionStorage` | 是 | Token 存在浏览器 Storage 中的平台 |
| `cdp_header` | 通过 CDP 拦截网络请求中的 Header | 是 | Token 通过自定义 Header 传递的平台 |

## 安装

```bash
cd mcp-tools/chrome-auth
pip install -e .
```

依赖项：
- `browser-cookie3` — 读取 Chrome Cookie 数据库
- `websocket-client` — CDP WebSocket 通信
- `requests` — HTTP 请求

## API 参考

### `get_cookies(domain, *, force=False, ttl=None, parent_domain=None)`

从 Chrome Cookie 数据库读取指定域名的 Cookie。最常用的 API。

```python
from chrome_auth import get_cookies

cookies = get_cookies(domain="datasuite.shopee.io")
# {'CSRF-TOKEN': '...', 'DATA-SUITE-AUTH-userToken-v4': '...', ...}
```

**参数：**
- `domain` — 目标域名，例如 `"datasuite.shopee.io"`
- `force` — 是否跳过缓存，强制重新读取（默认 `False`）
- `ttl` — 缓存有效期，秒（默认 1800 即 30 分钟）
- `parent_domain` — 覆盖传给 `browser_cookie3` 的查询域名

**已内置的域名映射：**
- `datasuite.shopee.io` → 查询 `shopee.io`
- `data-infra.shopee.io` → 查询 `shopee.io`

如果你的域名不在映射表中，可通过 `parent_domain` 参数指定。

**父域 Cookie：** 过滤逻辑按 RFC 6265 判断 Cookie 的 `Domain` 是否覆盖目标主机，因此 **`Domain=.shopee.io` 的 Cookie（如 `DATA-SUITE-AUTH-userToken-v4`）会正确包含在 `datasuite.shopee.io` 的结果中**，不会被旧版子串匹配误丢。

### `get_auth(domain, *, strategies=None, ...)`

统一认证入口，返回 `AuthResult`。

**`cookie_db` 与 `cdp_cookie`（默认策略）：** 会**合并**磁盘 Cookie 与 CDP 实时 Cookie（**同名键以 CDP 为准**）。这样不会在「磁盘上已有部分 Cookie」时提前返回而导致**永远走不到 CDP**。`result.source` 可能为 `cookie_db`、`cdp_cookie` 或 `cookie_db+cdp_cookie`。

```python
from chrome_auth import get_auth

result = get_auth(
    domain="datasuite.shopee.io",
    strategies=["cookie_db", "cdp_cookie"],
)

if result.ok:
    requests.get(url, cookies=result.cookies)
```

**参数：**
- `domain` — 目标域名
- `strategies` — 策略列表；其中 `cookie_db` 与 `cdp_cookie` 为**合并**关系（见上文），其余策略（`cdp_storage`、`cdp_header`）仍按顺序在 Cookie 为空时尝试。默认 `["cookie_db", "cdp_cookie"]`
- `storage_key` — 使用 `cdp_storage` 策略时必填
- `header_name` — 使用 `cdp_header` 策略时要拦截的 Header 名（默认 `"Authorization"`）
- `cdp_port` — CDP 端口（默认自动检测 9222 / 19222）
- `force` — 跳过缓存
- `auth_failed` — 调用方收到 401/403 时设为 True，无条件触发自动刷新（不受 Cookie 过期时间限制）
- `ttl` — 缓存有效期

**返回 `AuthResult`：**
```python
@dataclass
class AuthResult:
    cookies: Dict[str, str]   # Cookie 字典
    headers: Dict[str, str]   # 认证 Header
    token: Optional[str]      # Token 字符串
    source: str               # 来源（如 "cookie_db"、"cdp_cookie"、"cookie_db+cdp_cookie"）
    expires_at: Optional[float]  # 最早 Cookie 过期时间（Unix timestamp）
    ok: bool                  # 是否获取到有效认证
    expires_soon: bool        # Cookie 是否在 5 分钟内过期
```

**自动刷新**：`get_auth` 在以下两种情况自动尝试 SSO 静默续期：
1. Cookie 即将过期（剩余 < 5 分钟）— 主动刷新
2. 调用方传入 `auth_failed=True`（收到 401/403）— 无条件刷新

刷新链路（按安静程度优先）：

1. **CDP**：对每个可达调试端口依次尝试在**隐藏标签**内 `Page.navigate`（成功后会关闭该标签），**不抢前台**。请尽量用 **Chrome** 带 `--remote-debugging-port=9222` 启动，并设置 `CHROME_CDP_PORT=9222`，避免只连到 SeaTalk 等 Electron 端口时与 Chrome Cookie 罐不一致。`data-infra` / Keyhole 相关域的续期导航指向 **Keyhole 站点根**（`https://keyhole.data-infra.shopee.io/`），不会再去打开 `https://data-infra.shopee.io/` 根路径（该地址通常不是你要看的 Flink 页）。
2. **macOS `open -g`**：无 CDP 时，用系统 `open -g -a "Google Chrome" <url>` 在**后台**打开页面，**不将 Chrome 置前**，通常无明显弹窗感（可能多一个后台标签页）。可用环境变量 `CHROME_AUTH_BROWSER_APP` 指定浏览器名（如 `Chromium`）。
3. **AppleScript（最后手段）**：会新建可见标签并等待，较打扰。若完全不要此步，可设置 `CHROME_AUTH_DISABLE_APPLESCRIPT=1`；若需禁用 `open -g` 试验，可设 `CHROME_AUTH_DISABLE_OPEN_G=1`。

刷新成功后重新读取 Cookie，对调用方透明。每个域名有 **60 秒冷却期**防止频繁刷新；**但若调用方传入 `auth_failed=True`（例如 HTTP 401/403 后重试），会跳过冷却**，保证每次鉴权失败都能再触发一轮静默导航。

**DataSuite 域名**（`datasuite.shopee.io`）会按顺序尝试多个落地页：`/flink/` → `/scheduler/` → `/`，避免单一入口在部分网络下无法完成续期。

401 时 MCP 会通过 **`format_auth_troubleshoot`** 输出结构化说明（`CHROME_CDP_PORT`、可达 CDP 端口、本次静默刷新是否成功、关键 Cookie 是否齐全），便于区分「未连上 CDP」与「会话已彻底失效需人工登录」。

### `invalidate_domain(domain)`

清除指定域名的所有缓存数据（Cookie + 过期信息）。

```python
from chrome_auth import invalidate_domain

invalidate_domain("datasuite.shopee.io")  # 清除该域名的全部缓存
```

### `get_cdp_cookies(url_pattern, *, cdp_port=None, force=False, ttl=None)`

通过 CDP `Network.getCookies` 获取**当前调试端口对应浏览器**里、对目标站点生效的 Cookie。

- **多端口**：会依次尝试环境变量 `CHROME_CDP_PORT`（若设置）、再 `9222`、再 `19222` 等可达端口。
- **无需已打开目标站标签页**：若无 URL 含 `datasuite.shopee.io` 的标签，仍会使用任意可调试页面，并对 `https://datasuite.shopee.io/` 请求 Cookie。
- **与 Chrome 一致**：DataSuite 登录若在 **Google Chrome** 里完成，而 CDP 只连在 **SeaTalk / 其它 Electron（如 19222）** 上，则两套进程 Cookie 罐不同，**仍拿不到** `DATA-SUITE-AUTH-userToken-v4`。请对 **Chrome** 使用 `--remote-debugging-port=9222` 启动（或设置 `CHROME_CDP_PORT` 指向 Chrome 的调试端口），再在本机 Chrome 中登录 DataSuite。

```python
from chrome_auth import get_cdp_cookies

cookies = get_cdp_cookies("datasuite.shopee.io")
```

### `get_storage(url_pattern, key, *, storage_type="local", cdp_port=None, force=False, ttl=None)`

通过 CDP 读取浏览器页面的 `localStorage` 或 `sessionStorage`。

```python
from chrome_auth import get_storage

token = get_storage("myapp.example.com", "access_token", storage_type="local")
```

### `get_header(url_pattern, header_name="Authorization", *, cdp_port=None, force=False, ttl=None, listen_timeout=10)`

通过 CDP 拦截网络请求，捕获指定 Header 的值。会监听 10 秒等待匹配的请求出现。

```python
from chrome_auth import get_header

auth = get_header("api.example.com", "Authorization")
# "Bearer eyJhbGci..."
```

### `get_cache()`

获取全局 TTL 缓存实例，可用于手动清除。

```python
from chrome_auth import get_cache
get_cache().clear()       # 清除所有缓存
get_cache().invalidate("cookie:datasuite.shopee.io")  # 清除特定缓存
```

### `cookie_diagnostic(cookies, *, expires_at=None)`

根据当前读到的 Cookie 字典和过期时间生成诊断说明（供 MCP 在 401 时展示）。传入 `expires_at`（来自 `AuthResult.expires_at`）可获得精确的过期诊断。

```python
from chrome_auth import cookie_diagnostic

print(cookie_diagnostic(result.cookies, expires_at=result.expires_at))
# 例: "Cookie 已于 14:30:00 过期（10 分钟前），请在 Chrome 中打开 https://datasuite.shopee.io 刷新登录"
```

### `format_auth_troubleshoot(domain, cookies, *, cookie_source=..., expires_at=..., sso_refresh_*=..., cdp_port=..., critical_keys=...)`

供 **scheduler-query / flink-query / datamap-query** 等在 401 时拼错误详情：包含 CDP 端口探测、`get_auth` 返回的 **`AuthResult.sso_refresh_*`**（本次是否做过静默导航、尝试了哪些 URL、是否成功）、以及 `cookie_diagnostic` 结论。非 DataSuite 域可传 `critical_keys=()` 跳过「DataSuite 关键键」段落（例如 Grafana）。

---

## DataSuite / Flink / Scheduler MCP 报 401

在较新的 **macOS Google Chrome** 中，DataSuite 登录 Cookie 可能**加密存储**，磁盘 SQLite 中**无** `DATA-SUITE-AUTH-userToken-v4` 明文，**仅**能通过 **同一 Chrome 进程**的 CDP `Network.getCookies` 获取。

**推荐步骤（本机执行一次）：**

1. 保存 Chrome 中未保存的工作。
2. 运行（会退出 Chrome 再以调试端口启动）：

   ```bash
   bash /path/to/spx-helper/mcp-tools/chrome-auth/scripts/start_chrome_remote_debug.sh
   ```

3. 在打开的 Chrome 中访问并登录：<https://datasuite.shopee.io/flink/>
4. 验证：

   ```bash
   python3 /path/to/spx-helper/mcp-tools/chrome-auth/scripts/verify_datasuite_auth.py
   ```

   若输出 `[OK] Flink API 可访问`，再在 Cursor 中刷新 MCP。

可选：在运行 MCP 的环境中设置 `export CHROME_CDP_PORT=9222`，确保 CDP 连到带调试的 Chrome（而非仅 SeaTalk 等占用的 19222）。

---

## 开发新 MCP 指南

### 最简模式：Cookie 认证（推荐）

适用于大部分通过浏览器登录的 Web 平台。只需 3 步：

**第 1 步：创建项目结构**

```
mcp-tools/
  your-mcp/
    your_mcp_server.py
    pyproject.toml          # 可选
```

**第 2 步：编写 MCP Server**

```python
#!/usr/bin/env python3
"""示例：查询某平台的 API"""

import json
import requests
from typing import Dict, Optional
from chrome_auth import get_auth, AuthResult
from chrome_auth.diagnostic import cookie_diagnostic
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Your MCP Server")

DOMAIN = "your-platform.example.com"
BASE_URL = f"https://{DOMAIN}"
MAX_RETRIES = 2

_last_auth: Optional[AuthResult] = None

def _load_cookies(force=False, auth_failed=False) -> Dict[str, str]:
    global _last_auth
    result = get_auth(DOMAIN, force=force, auth_failed=auth_failed)
    _last_auth = result
    return result.cookies

def _diag(cookies: Dict[str, str]) -> str:
    expires_at = _last_auth.expires_at if _last_auth else None
    return cookie_diagnostic(cookies, expires_at=expires_at)

def _request(method, path, **kwargs):
    cookies = _load_cookies()
    headers = {
        "x-csrf-token": cookies.get("CSRF-TOKEN", ""),
        "accept": "application/json",
    }
    for attempt in range(MAX_RETRIES + 1):
        resp = requests.request(method, BASE_URL + path,
                                cookies=cookies, headers=headers, **kwargs)
        if resp.status_code in (401, 403):
            if attempt < MAX_RETRIES:
                cookies = _load_cookies(force=True, auth_failed=True)
                headers["x-csrf-token"] = cookies.get("CSRF-TOKEN", "")
                continue
            raise RuntimeError(f"{resp.status_code}\n{_diag(cookies)}")
        resp.raise_for_status()
        return resp.json()

@mcp.tool()
def query_something(keyword: str) -> str:
    """查询平台数据"""
    data = _request("GET", "/api/v1/search", params={"q": keyword})
    return json.dumps(data, ensure_ascii=False, indent=2)

def main():
    mcp.run()

if __name__ == "__main__":
    main()
```

**第 3 步：配置 `mcp.json`**

```json
{
  "your-mcp": {
    "command": "/opt/anaconda3/bin/python3",
    "args": ["your_mcp_server.py"],
    "cwd": "/path/to/mcp-tools/your-mcp"
  }
}
```

### 进阶模式：Token 在 localStorage 中

```python
from chrome_auth import get_storage

token = get_storage("your-platform.example.com", "access_token")
headers = {"Authorization": f"Bearer {token}"}
resp = requests.get(url, headers=headers)
```

### 进阶模式：Token 在请求 Header 中

需要目标页面在 CDP 浏览器中打开，监听期间会产生匹配请求：

```python
from chrome_auth import get_header

auth = get_header("api.example.com", "X-Auth-Token")
headers = {"X-Auth-Token": auth}
resp = requests.get(url, headers=headers)
```

### 进阶模式：自定义域名映射

如果你的目标域名的 Cookie 存在父域下：

```python
from chrome_auth import get_cookies

# 例如 cookie 存在 .example.com 下，但你要 app.example.com 的
cookies = get_cookies("app.example.com", parent_domain="example.com")
```

### 开发注意事项

1. **域名映射** — `chrome-auth` 内置了 `datasuite.shopee.io` → `shopee.io` 的映射。如果你的新域名也有类似情况，可以直接用 `parent_domain` 参数，或者在 `cookie_provider.py` 的 `_PARENT_DOMAIN_MAP` 中添加。

2. **缓存** — 所有 API 默认缓存 30 分钟，避免频繁读取磁盘或 CDP。首次调用后后续调用几乎零开销。如果需要强制刷新，传 `force=True`。

3. **401 自动重试** — 建议在 MCP 的 HTTP 请求层实现 401 自动重试（参考上面的 `_request` 示例），遇到 401 时用 `force=True` 重新获取 Cookie。

4. **CDP 端口** — 自动检测 `9222` 和 `19222`。也可通过环境变量 `CHROME_CDP_PORT` 指定，或在 API 调用时传 `cdp_port` 参数。

5. **CDP Origin 策略** — Chrome 较新版本默认拒绝来自非白名单 Origin 的 WebSocket 连接（返回 403 Forbidden）。`cdp_provider` 使用 `suppress_origin=True` 跳过 Origin 检查。如果你用 `--remote-debugging-port` 启动 Chrome，建议同时加上 `--remote-allow-origins=*` 参数。

---

## 当前使用此库的 MCP

| MCP | 域名 | 认证策略 | 说明 |
|-----|------|----------|------|
| `scheduler-query` | `datasuite.shopee.io` | `cookie_db` | Scheduler 任务查询 |
| `datamap-query` | `datasuite.shopee.io` | `cookie_db` | DataMap 血缘查询 |
| `datastudio-mcp` | `datasuite.shopee.io` | `cookie_db` | DataStudio 资产管理 |

## 文件结构

```
chrome-auth/
  pyproject.toml              # 包定义和依赖
  chrome_auth/
    __init__.py               # 统一入口：get_auth, invalidate_domain, ...
    cookie_provider.py        # 策略1: 读 Chrome Cookie 数据库（含过期时间感知）
    cdp_provider.py           # 策略2/3/4: CDP + AppleScript 自动刷新
    cache.py                  # 线程安全 TTL 缓存
    types.py                  # AuthResult 数据结构（含 expires_at）
    diagnostic.py             # Cookie 过期诊断
  scripts/
    start_chrome_remote_debug.sh  # 以远程调试端口启动 Chrome
    verify_datasuite_auth.py      # 验证 DataSuite 认证状态
```

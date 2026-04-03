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

### `get_auth(domain, *, strategies=None, ...)`

统一认证入口，按策略顺序尝试获取认证，返回 `AuthResult`。

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
- `strategies` — 策略列表，按顺序尝试，默认 `["cookie_db", "cdp_cookie"]`
- `storage_key` — 使用 `cdp_storage` 策略时必填
- `header_name` — 使用 `cdp_header` 策略时要拦截的 Header 名（默认 `"Authorization"`）
- `cdp_port` — CDP 端口（默认自动检测 9222 / 19222）
- `force` — 跳过缓存
- `ttl` — 缓存有效期

**返回 `AuthResult`：**
```python
@dataclass
class AuthResult:
    cookies: Dict[str, str]   # Cookie 字典
    headers: Dict[str, str]   # 认证 Header
    token: Optional[str]      # Token 字符串
    source: str               # 来源策略名（如 "cookie_db"）
    ok: bool                  # 是否获取到有效认证
```

### `get_cdp_cookies(url_pattern, *, cdp_port=None, force=False, ttl=None)`

通过 CDP 获取浏览器中打开页面的实时 Cookie。

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
from chrome_auth import get_cookies
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Your MCP Server")

DOMAIN = "your-platform.example.com"
BASE_URL = f"https://{DOMAIN}"

def _load_cookies(force=False):
    return get_cookies(domain=DOMAIN, force=force)

def _request(method, path, **kwargs):
    cookies = _load_cookies()
    headers = {
        "x-csrf-token": cookies.get("CSRF-TOKEN", ""),
        "accept": "application/json",
    }
    resp = requests.request(method, BASE_URL + path,
                            cookies=cookies, headers=headers, **kwargs)
    if resp.status_code in (401, 403):
        cookies = _load_cookies(force=True)
        headers["x-csrf-token"] = cookies.get("CSRF-TOKEN", "")
        resp = requests.request(method, BASE_URL + path,
                                cookies=cookies, headers=headers, **kwargs)
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
    __init__.py               # 统一入口：get_auth, get_cookies, ...
    cookie_provider.py        # 策略1: 读 Chrome Cookie 数据库
    cdp_provider.py           # 策略2/3/4: CDP 相关能力
    cache.py                  # 线程安全 TTL 缓存
    types.py                  # AuthResult 数据结构
```

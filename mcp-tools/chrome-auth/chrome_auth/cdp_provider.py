"""CDP provider — extract localStorage, sessionStorage, cookies, and request headers via Chrome DevTools Protocol."""

import json
import logging
import os
import subprocess
import sys
import threading
import time
from typing import Any, Dict, List, Optional

import requests as http_requests
import websocket

from .cache import DEFAULT_TTL, get_cache

logger = logging.getLogger("chrome_auth.cdp")

DEFAULT_CDP_PORTS = [9222, 19222]
_HEADER_LISTEN_TIMEOUT = 10  # seconds

# Domains that support silent SSO refresh via CDP navigation
_SSO_REFRESH_DOMAINS = (
    "datasuite.shopee.io",
    "data-infra.shopee.io",
    "grafana.idata.shopeemobile.com",
)
_SSO_REFRESH_URLS = {
    "datasuite.shopee.io": "https://datasuite.shopee.io/flink/",
    "data-infra.shopee.io": "https://data-infra.shopee.io/",
    "grafana.idata.shopeemobile.com": "https://grafana.idata.shopeemobile.com/",
}


def _effective_ttl(min_expires: Optional[float], user_ttl: Optional[float]) -> Optional[float]:
    """Compute cache TTL = min(time until earliest cookie expiry, user_ttl or default).

    Returns None to let cache use its default when no useful bound exists.
    """
    base = user_ttl if user_ttl is not None else DEFAULT_TTL
    if min_expires is None:
        return base
    remaining = min_expires - time.time()
    if remaining <= 0:
        return 5.0  # already expired — cache very briefly to avoid hammering
    return min(remaining, base)


def _detect_cdp_port() -> Optional[int]:
    """Try env var, then common ports, return the first reachable one."""
    env_port = os.environ.get("CHROME_CDP_PORT")
    if env_port:
        try:
            return int(env_port)
        except ValueError:
            pass

    for port in DEFAULT_CDP_PORTS:
        try:
            resp = http_requests.get(f"http://127.0.0.1:{port}/json", timeout=2)
            if resp.status_code == 200:
                return port
        except Exception:
            continue
    return None


def _list_pages(port: int) -> List[Dict[str, Any]]:
    resp = http_requests.get(f"http://127.0.0.1:{port}/json", timeout=5)
    resp.raise_for_status()
    return resp.json()


def _find_page(port: int, url_pattern: str) -> Optional[Dict[str, Any]]:
    """Find the first page whose URL contains *url_pattern*."""
    for page in _list_pages(port):
        if url_pattern in page.get("url", ""):
            return page
    return None


def _list_reachable_cdp_ports(cdp_port: Optional[int]) -> List[int]:
    """Ports to try: explicit cdp_port, else CHROME_CDP_PORT, then 9222 before 19222 (Chrome 优先于其它 CDP)."""
    if cdp_port is not None:
        return [cdp_port]
    ordered: List[int] = []
    env_port = os.environ.get("CHROME_CDP_PORT")
    if env_port:
        try:
            ordered.append(int(env_port))
        except ValueError:
            pass
    for p in DEFAULT_CDP_PORTS:
        if p not in ordered:
            ordered.append(p)
    reachable: List[int] = []
    for p in ordered:
        try:
            resp = http_requests.get(f"http://127.0.0.1:{p}/json", timeout=2)
            if resp.status_code == 200:
                reachable.append(p)
        except Exception:
            continue
    return reachable


def _pick_page_for_cookie_read(port: int, url_pattern: str) -> Optional[Dict[str, Any]]:
    """Prefer a tab whose URL matches *url_pattern*; else any `page` with a debugger WebSocket."""
    page = _find_page(port, url_pattern)
    if page and page.get("webSocketDebuggerUrl"):
        return page
    try:
        pages = _list_pages(port)
    except Exception:
        return None
    for pg in pages:
        if pg.get("type") == "page" and pg.get("webSocketDebuggerUrl"):
            return pg
    for pg in pages:
        if pg.get("webSocketDebuggerUrl"):
            return pg
    return None


def _cookie_urls_for_pattern(url_pattern: str) -> List[str]:
    """URLs for Network.getCookies — 无需已打开目标站标签页，只要浏览器 Cookie 罐里有即可。"""
    p = (url_pattern or "").strip()
    if p.startswith("http://") or p.startswith("https://"):
        return [p.rstrip("/") + "/"]
    return [f"https://{p}/", f"http://{p}/"]


def _cdp_call(ws_url: str, method: str, params: Optional[dict] = None, timeout: float = 10) -> Any:
    """Send a single CDP command over WebSocket and return the result."""
    ws = websocket.create_connection(ws_url, timeout=timeout, suppress_origin=True)
    try:
        msg_id = 1
        ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            raw = ws.recv()
            data = json.loads(raw)
            if data.get("id") == msg_id:
                if "error" in data:
                    raise RuntimeError(f"CDP error: {data['error']}")
                return data.get("result")
    finally:
        ws.close()
    raise TimeoutError(f"CDP call {method} timed out after {timeout}s")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_storage(
    url_pattern: str,
    key: str,
    *,
    storage_type: str = "local",
    cdp_port: Optional[int] = None,
    force: bool = False,
    ttl: Optional[float] = None,
) -> Optional[str]:
    """
    Read a value from localStorage or sessionStorage of a Chrome page.

    Args:
        url_pattern: Substring to match against page URLs (e.g. "datasuite.shopee.io").
        key: The storage key to read.
        storage_type: "local" or "session".
        cdp_port: CDP port (auto-detected if None).
        force: Bypass cache.
        ttl: Cache TTL in seconds.

    Returns:
        The stored value as a string, or None if not found / CDP unavailable.
    """
    cache = get_cache()
    cache_key = f"storage:{url_pattern}:{key}:{storage_type}"

    if not force:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

    port = cdp_port or _detect_cdp_port()
    if port is None:
        logger.warning("No CDP port available for storage read")
        return None

    page = _find_page(port, url_pattern)
    if page is None:
        logger.warning("No page matching '%s' found on CDP port %d", url_pattern, port)
        return None

    ws_url = page.get("webSocketDebuggerUrl")
    if not ws_url:
        return None

    api = "localStorage" if storage_type == "local" else "sessionStorage"
    expr = f"{api}.getItem({json.dumps(key)})"

    try:
        result = _cdp_call(ws_url, "Runtime.evaluate", {"expression": expr})
        value = result.get("result", {}).get("value")
        if value is not None:
            cache.set(cache_key, value, ttl)
            logger.info("Got storage %s[%s] from %s (port %d)", api, key, url_pattern, port)
        return value
    except Exception as e:
        logger.error("Failed to read %s[%s] via CDP: %s", api, key, e)
        return None


def get_cdp_cookies(
    url_pattern: str,
    *,
    cdp_port: Optional[int] = None,
    force: bool = False,
    ttl: Optional[float] = None,
) -> Dict[str, str]:
    """
    Read cookies via CDP Network.getCookies (live browser state).

    依次尝试所有可达 CDP 端口（默认先 9222 再 19222）。若无标签页 URL 含 *url_pattern*，
    仍可用任意可调试页调用 getCookies，并传入目标站点根 URL（如 https://datasuite.shopee.io/）。
    DataSuite 登录态须存在于**同一 CDP 对应浏览器**（通常为带 remote-debugging 的 Chrome）。
    """
    cache = get_cache()
    cache_key = f"cdp_cookie:{url_pattern}"

    if not force:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

    ports = _list_reachable_cdp_ports(cdp_port)
    if not ports:
        logger.warning("No CDP port reachable for cookie read")
        return {}

    urls = _cookie_urls_for_pattern(url_pattern)

    for port in ports:
        page = _pick_page_for_cookie_read(port, url_pattern)
        if not page:
            logger.debug("No debuggable target on CDP port %d", port)
            continue
        ws_url = page.get("webSocketDebuggerUrl")
        if not ws_url:
            continue

        try:
            result = _cdp_call(ws_url, "Network.getCookies", {"urls": urls})
            cookies: Dict[str, str] = {}
            cookie_expires: List[float] = []
            for c in result.get("cookies", []):
                cookies[c["name"]] = c["value"]
                exp = c.get("expires", -1)
                if exp > 0:
                    cookie_expires.append(exp)
            if cookies:
                min_expires = min(cookie_expires) if cookie_expires else None
                effective_ttl = _effective_ttl(min_expires, ttl)
                cache.set(cache_key, cookies, effective_ttl)
                expiry_key = f"cdp_cookie_expires:{url_pattern}"
                if min_expires is not None:
                    cache.set(expiry_key, min_expires, effective_ttl)
                logger.info(
                    "Got %d cookies via CDP (port %d, urls=%s) for %s, earliest_expiry=%s",
                    len(cookies),
                    port,
                    urls,
                    url_pattern,
                    time.strftime("%H:%M:%S", time.localtime(min_expires)) if min_expires else "unknown",
                )
                return cookies
        except Exception as e:
            logger.warning("CDP Network.getCookies failed on port %d: %s", port, e)
            continue

    return {}


def get_header(
    url_pattern: str,
    header_name: str = "Authorization",
    *,
    cdp_port: Optional[int] = None,
    force: bool = False,
    ttl: Optional[float] = None,
    listen_timeout: float = _HEADER_LISTEN_TIMEOUT,
) -> Optional[str]:
    """
    Intercept a request header by listening to Network.requestWillBeSent.

    Monitors network activity for *listen_timeout* seconds and returns the
    first matching header value from a request whose URL contains *url_pattern*.

    Args:
        url_pattern: Substring to match in request URLs.
        header_name: HTTP header to extract (default "Authorization").
        cdp_port: CDP port (auto-detected if None).
        force: Bypass cache.
        ttl: Cache TTL.
        listen_timeout: How long to listen for matching requests (seconds).

    Returns:
        The header value, or None if no matching request was observed.
    """
    cache = get_cache()
    cache_key = f"header:{url_pattern}:{header_name}"

    if not force:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

    port = cdp_port or _detect_cdp_port()
    if port is None:
        logger.warning("No CDP port available for header interception")
        return None

    page = _find_page(port, url_pattern)
    if page is None:
        pages = _list_pages(port)
        page = pages[0] if pages else None
    if page is None:
        return None

    ws_url = page.get("webSocketDebuggerUrl")
    if not ws_url:
        return None

    result_holder: list = []
    stop_event = threading.Event()

    ws = websocket.create_connection(ws_url, timeout=listen_timeout + 5, suppress_origin=True)
    try:
        ws.send(json.dumps({"id": 1, "method": "Network.enable", "params": {}}))

        deadline = time.time() + listen_timeout
        while time.time() < deadline and not stop_event.is_set():
            ws.settimeout(max(0.1, deadline - time.time()))
            try:
                raw = ws.recv()
            except websocket.WebSocketTimeoutException:
                break
            data = json.loads(raw)

            if data.get("method") == "Network.requestWillBeSent":
                req = data.get("params", {}).get("request", {})
                req_url = req.get("url", "")
                if url_pattern in req_url:
                    headers = req.get("headers", {})
                    # Case-insensitive header lookup
                    for k, v in headers.items():
                        if k.lower() == header_name.lower():
                            result_holder.append(v)
                            stop_event.set()
                            break

        ws.send(json.dumps({"id": 2, "method": "Network.disable", "params": {}}))
    except Exception as e:
        logger.error("Header interception failed: %s", e)
    finally:
        ws.close()

    if result_holder:
        value = result_holder[0]
        cache.set(cache_key, value, ttl)
        logger.info("Intercepted %s from request matching '%s'", header_name, url_pattern)
        return value

    logger.warning("No %s header found in requests matching '%s' within %ds", header_name, url_pattern, listen_timeout)
    return None


def _try_cdp_refresh_on_port(url: str, port: int, timeout: float) -> bool:
    """Single-port: Target.createTarget + Page.navigate (tab is closed afterward; no window focus steal)."""
    page = _pick_page_for_cookie_read(port, "")
    if not page:
        logger.debug("_try_cdp_refresh: no debuggable target on port %d", port)
        return False

    control_ws_url = page.get("webSocketDebuggerUrl")
    if not control_ws_url:
        return False

    target_id = None
    try:
        result = _cdp_call(control_ws_url, "Target.createTarget", {"url": "about:blank"})
        target_id = result.get("targetId")
        if not target_id:
            logger.debug("_try_cdp_refresh: Target.createTarget returned no targetId")
            return False
    except Exception as e:
        logger.debug("_try_cdp_refresh: failed to create tab on port %d: %s", port, e)
        return False

    try:
        time.sleep(0.3)

        new_ws_url = None
        for p in _list_pages(port):
            if p.get("id") == target_id and p.get("webSocketDebuggerUrl"):
                new_ws_url = p["webSocketDebuggerUrl"]
                break

        if not new_ws_url:
            logger.debug("_try_cdp_refresh: could not find WS URL for new tab %s", target_id)
            return False

        ws = websocket.create_connection(new_ws_url, timeout=timeout + 5, suppress_origin=True)
        try:
            msg_id = 1
            ws.send(json.dumps({"id": msg_id, "method": "Page.enable", "params": {}}))
            msg_id += 1

            ws.send(json.dumps({"id": msg_id, "method": "Page.navigate", "params": {"url": url}}))
            msg_id += 1

            deadline = time.time() + timeout
            loaded = False
            final_url = None
            while time.time() < deadline:
                ws.settimeout(max(0.1, deadline - time.time()))
                try:
                    raw = ws.recv()
                except websocket.WebSocketTimeoutException:
                    break
                data = json.loads(raw)

                if data.get("method") == "Page.frameNavigated":
                    frame = data.get("params", {}).get("frame", {})
                    final_url = frame.get("url", "")

                if data.get("method") == "Page.loadEventFired":
                    loaded = True
                    break

            if loaded and final_url:
                is_login = any(kw in final_url.lower() for kw in ("login", "signin", "sso/authorize"))
                if is_login:
                    logger.warning("refresh_session: landed on login page %s — SSO session fully expired", final_url)
                    return False

            logger.info(
                "refresh_session[cdp port=%s]: page loaded=%s, final_url=%s",
                port,
                loaded,
                final_url or "unknown",
            )
            return loaded
        finally:
            ws.close()
    finally:
        if target_id:
            try:
                _cdp_call(control_ws_url, "Target.closeTarget", {"targetId": target_id})
            except Exception:
                pass
    return False


def _try_cdp_refresh(
    url: str,
    cdp_port: Optional[int] = None,
    timeout: float = 15,
) -> bool:
    """Try to refresh session via CDP on every reachable port (Chrome 9222 preferred over Electron 19222)."""
    ports = _list_reachable_cdp_ports(cdp_port)
    if not ports:
        logger.debug("_try_cdp_refresh: no CDP port reachable")
        return False

    for port in ports:
        try:
            if _try_cdp_refresh_on_port(url, port, timeout):
                return True
        except Exception as e:
            logger.debug("_try_cdp_refresh: port %d failed: %s", port, e)
            continue
    return False


def _chrome_app_name() -> str:
    """Application name passed to `open -a` (override with CHROME_AUTH_BROWSER_APP)."""
    return os.environ.get("CHROME_AUTH_BROWSER_APP", "Google Chrome").strip() or "Google Chrome"


def _refresh_via_open_background_macos(url: str, wait_seconds: int = 8) -> bool:
    """macOS: open URL in Chrome without bringing the app to the foreground (`open -g`).

    Avoids the intrusive AppleScript path that creates a visible focused tab and blocks.
    May leave an extra background tab; user can close manually.
    """
    if sys.platform != "darwin":
        return False
    if os.environ.get("CHROME_AUTH_DISABLE_OPEN_G", "").strip():
        return False

    app = _chrome_app_name()
    try:
        r = subprocess.run(
            ["open", "-g", "-a", app, url],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if r.returncode != 0:
            logger.warning("refresh_session[open -g]: open failed: %s", (r.stderr or "").strip())
            return False
        time.sleep(max(3, wait_seconds))
        time.sleep(1)  # let Chrome flush cookies to SQLite
        logger.info("refresh_session[open -g]: completed for %s (app=%s)", url, app)
        return True
    except Exception as e:
        logger.warning("refresh_session[open -g]: %s", e)
        return False


def _refresh_via_applescript(url: str, wait_seconds: int = 8) -> bool:
    """macOS last resort: AppleScript opens visible tab, waits, then closes.

    Disruptive; prefer CDP or `open -g`. Set CHROME_AUTH_DISABLE_APPLESCRIPT=1 to skip.
    """
    if sys.platform != "darwin":
        return False
    if os.environ.get("CHROME_AUTH_DISABLE_APPLESCRIPT", "").strip():
        return False

    script = (
        'tell application "Google Chrome"\n'
        "    if (count of windows) = 0 then\n"
        "        make new window\n"
        "    end if\n"
        f'    set newTab to make new tab at end of tabs of window 1 with properties {{URL:"{url}"}}\n'
        f"    delay {wait_seconds}\n"
        "    close newTab\n"
        "end tell\n"
    )

    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            timeout=wait_seconds + 15,
        )
        if result.returncode == 0:
            time.sleep(1)  # let Chrome flush cookies to SQLite
            logger.info("refresh_session[applescript]: SSO refresh completed for %s", url)
            return True
        logger.warning("refresh_session[applescript]: osascript failed: %s", result.stderr.strip())
        return False
    except subprocess.TimeoutExpired:
        logger.warning("refresh_session[applescript]: osascript timed out after %ds", wait_seconds + 15)
        return False
    except Exception as e:
        logger.warning("refresh_session[applescript]: %s", e)
        return False


def refresh_session(
    url: str,
    *,
    cdp_port: Optional[int] = None,
    timeout: float = 15,
) -> bool:
    """Trigger SSO renewal by navigating Chrome to *url*.

    Strategy chain (best first):
      1. CDP hidden tab on every reachable port (needs --remote-debugging-port; no focus steal)
      2. macOS ``open -g`` — background Chrome open (no focus steal; may leave a tab)
      3. AppleScript visible tab (last resort; set CHROME_AUTH_DISABLE_APPLESCRIPT=1 to skip)
    """
    wait = max(8, int(timeout))
    if _try_cdp_refresh(url, cdp_port, timeout):
        return True
    if _refresh_via_open_background_macos(url, wait_seconds=wait):
        return True
    return _refresh_via_applescript(url, wait_seconds=wait)

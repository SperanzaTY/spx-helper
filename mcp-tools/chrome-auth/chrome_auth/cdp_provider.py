"""CDP provider — extract localStorage, sessionStorage, cookies, and request headers via Chrome DevTools Protocol."""

import json
import logging
import os
import threading
import time
from typing import Any, Dict, List, Optional

import requests as http_requests
import websocket

from .cache import get_cache

logger = logging.getLogger("chrome_auth.cdp")

DEFAULT_CDP_PORTS = [9222, 19222]
_HEADER_LISTEN_TIMEOUT = 10  # seconds


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
    Read cookies for a page via CDP Network.getCookies (live browser state).

    This is different from cookie_provider which reads the on-disk DB.
    Useful when cookies are httpOnly or set by service workers.
    """
    cache = get_cache()
    cache_key = f"cdp_cookie:{url_pattern}"

    if not force:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

    port = cdp_port or _detect_cdp_port()
    if port is None:
        return {}

    page = _find_page(port, url_pattern)
    if page is None:
        return {}

    ws_url = page.get("webSocketDebuggerUrl")
    if not ws_url:
        return {}

    try:
        result = _cdp_call(ws_url, "Network.getCookies", {"urls": [page["url"]]})
        cookies: Dict[str, str] = {}
        for c in result.get("cookies", []):
            cookies[c["name"]] = c["value"]
        if cookies:
            cache.set(cache_key, cookies, ttl)
            logger.info("Got %d cookies via CDP for %s", len(cookies), url_pattern)
        return cookies
    except Exception as e:
        logger.error("Failed to get cookies via CDP: %s", e)
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

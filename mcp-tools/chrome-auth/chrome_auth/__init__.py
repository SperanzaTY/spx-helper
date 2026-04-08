"""
chrome-auth — unified Chrome authentication provider.

Strategies (tried by get_auth):
  1. cookie_db + cdp_cookie — 默认合并：先读磁盘再读 CDP，同名键以 CDP 为准（避免仅磁盘有
     部分 Cookie 就提前返回、永远走不到 CDP 的问题）
  2. cdp_storage — read localStorage / sessionStorage via CDP
  3. cdp_header  — intercept request headers via CDP Network domain

Quick start:
    from chrome_auth import get_cookies
    cookies = get_cookies(domain="datasuite.shopee.io")
"""

from typing import Dict, List, Optional

from .cache import get_cache
from .cookie_provider import get_cookies
from .cdp_provider import get_cdp_cookies, get_header, get_storage
from .types import AuthResult
from .diagnostic import cookie_diagnostic

__all__ = [
    "get_auth",
    "get_cookies",
    "get_cdp_cookies",
    "get_storage",
    "get_header",
    "AuthResult",
    "get_cache",
    "cookie_diagnostic",
]

_DEFAULT_STRATEGIES = ["cookie_db", "cdp_cookie"]


def get_auth(
    domain: str,
    *,
    strategies: Optional[List[str]] = None,
    storage_key: Optional[str] = None,
    header_name: str = "Authorization",
    cdp_port: Optional[int] = None,
    force: bool = False,
    ttl: Optional[float] = None,
) -> AuthResult:
    """
    Try multiple strategies to obtain authentication for *domain*.

    Args:
        domain: Target domain (e.g. "datasuite.shopee.io").
        strategies: List of strategies to try, in order.
                    Supported: "cookie_db", "cdp_cookie", "cdp_storage", "cdp_header".
                    Default: ["cookie_db", "cdp_cookie"].
        storage_key: Required if using "cdp_storage" — the localStorage/sessionStorage key.
        header_name: Header to intercept when using "cdp_header" (default "Authorization").
        cdp_port: CDP port override (auto-detected if None).
        force: Bypass all caches.
        ttl: Cache TTL in seconds.

    Returns:
        AuthResult with cookies, headers, token, and source filled in.
    """
    strats = list(strategies or _DEFAULT_STRATEGIES)

    # cookie_db 与 cdp_cookie 合并：磁盘上的父域过滤修复后仍可能缺 httpOnly；
    # 且旧逻辑在 cookie_db 非空时直接 return，导致永远不会尝试 CDP。
    db_cookies: Dict[str, str] = {}
    cdp_cookies: Dict[str, str] = {}
    if "cookie_db" in strats:
        db_cookies = get_cookies(domain, force=force, ttl=ttl) or {}
    if "cdp_cookie" in strats:
        cdp_cookies = get_cdp_cookies(domain, cdp_port=cdp_port, force=force, ttl=ttl) or {}

    if "cookie_db" in strats or "cdp_cookie" in strats:
        merged: Dict[str, str] = {**db_cookies, **cdp_cookies}
        if merged:
            if db_cookies and cdp_cookies:
                src = "cookie_db+cdp_cookie"
            elif db_cookies:
                src = "cookie_db"
            else:
                src = "cdp_cookie"
            return AuthResult(cookies=merged, source=src)

    for strat in strats:
        if strat in ("cookie_db", "cdp_cookie"):
            continue

        if strat == "cdp_storage":
            if not storage_key:
                continue
            token = get_storage(domain, storage_key, cdp_port=cdp_port, force=force, ttl=ttl)
            if token:
                return AuthResult(
                    token=token,
                    headers={"Authorization": f"Bearer {token}"},
                    source="cdp_storage",
                )

        elif strat == "cdp_header":
            header_val = get_header(domain, header_name, cdp_port=cdp_port, force=force, ttl=ttl)
            if header_val:
                return AuthResult(
                    token=header_val,
                    headers={header_name: header_val},
                    source="cdp_header",
                )

    return AuthResult()

"""
chrome-auth — unified Chrome authentication provider.

Strategies (tried in order by get_auth):
  1. cookie_db  — read Chrome's on-disk cookie database (no CDP needed)
  2. cdp_cookie — read live cookies via CDP Network.getCookies
  3. cdp_storage — read localStorage / sessionStorage via CDP
  4. cdp_header  — intercept request headers via CDP Network domain

Quick start:
    from chrome_auth import get_cookies
    cookies = get_cookies(domain="datasuite.shopee.io")
"""

from typing import Dict, List, Optional

from .cache import get_cache
from .cookie_provider import get_cookies
from .cdp_provider import get_cdp_cookies, get_header, get_storage
from .types import AuthResult

__all__ = [
    "get_auth",
    "get_cookies",
    "get_cdp_cookies",
    "get_storage",
    "get_header",
    "AuthResult",
    "get_cache",
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
    strats = strategies or _DEFAULT_STRATEGIES

    for strat in strats:
        if strat == "cookie_db":
            cookies = get_cookies(domain, force=force, ttl=ttl)
            if cookies:
                return AuthResult(cookies=cookies, source="cookie_db")

        elif strat == "cdp_cookie":
            cookies = get_cdp_cookies(domain, cdp_port=cdp_port, force=force, ttl=ttl)
            if cookies:
                return AuthResult(cookies=cookies, source="cdp_cookie")

        elif strat == "cdp_storage":
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

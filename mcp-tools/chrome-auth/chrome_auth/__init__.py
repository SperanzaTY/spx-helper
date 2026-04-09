"""
chrome-auth — unified Chrome authentication provider.

Strategies (tried by get_auth):
  1. cookie_db + cdp_cookie — merge disk + CDP cookies (CDP wins on name collisions)
  2. cdp_storage — read localStorage / sessionStorage via CDP
  3. cdp_header  — intercept request headers via CDP Network domain

Quick start:
    from chrome_auth import get_cookies
    cookies = get_cookies(domain="datasuite.shopee.io")
"""

import logging
import time
from typing import Dict, List, Optional

from .cache import get_cache
from .cookie_provider import get_cookies
from .cdp_provider import (
    get_cdp_cookies,
    get_header,
    get_storage,
    refresh_session,
    _SSO_REFRESH_DOMAINS,
    _SSO_REFRESH_URLS,
)
from .types import AuthResult
from .diagnostic import cookie_diagnostic

logger = logging.getLogger("chrome_auth")

__all__ = [
    "get_auth",
    "get_cookies",
    "get_cdp_cookies",
    "get_storage",
    "get_header",
    "AuthResult",
    "get_cache",
    "cookie_diagnostic",
    "invalidate_domain",
    "refresh_session",
]

_DEFAULT_STRATEGIES = ["cookie_db", "cdp_cookie"]
_REFRESH_COOLDOWN = 60.0  # seconds between auto-refresh attempts per domain
_EXPIRY_THRESHOLD = 300.0  # proactive refresh when cookies expire within 5 min
_last_refresh: Dict[str, float] = {}


def _get_cookie_expires(domain: str) -> Optional[float]:
    """Read the earliest cookie expiry timestamp from cache (set by providers)."""
    cache = get_cache()
    db_exp = cache.get(f"cookie_expires:{domain}")
    cdp_exp = cache.get(f"cdp_cookie_expires:{domain}")
    candidates = [v for v in (db_exp, cdp_exp) if v is not None]
    return min(candidates) if candidates else None


def _should_refresh(domain: str) -> bool:
    """Check if we should attempt a CDP SSO refresh for this domain."""
    matching = [d for d in _SSO_REFRESH_DOMAINS if d in domain or domain in d]
    if not matching:
        return False
    last = _last_refresh.get(domain, 0)
    return time.time() - last >= _REFRESH_COOLDOWN


def _try_auto_refresh(domain: str, cdp_port: Optional[int]) -> bool:
    """Attempt silent SSO refresh via CDP navigation. Returns True on success."""
    if not _should_refresh(domain):
        return False
    refresh_url = None
    for key, url in _SSO_REFRESH_URLS.items():
        if key in domain or domain in key:
            refresh_url = url
            break
    if not refresh_url:
        return False
    _last_refresh[domain] = time.time()
    logger.info("Attempting auto SSO refresh for %s via %s", domain, refresh_url)
    return refresh_session(refresh_url, cdp_port=cdp_port)


def invalidate_domain(domain: str) -> None:
    """Clear all cached auth data for a domain."""
    cache = get_cache()
    for prefix in ("cookie:", "cdp_cookie:", "cookie_expires:", "cdp_cookie_expires:"):
        cache.invalidate(f"{prefix}{domain}")


def get_auth(
    domain: str,
    *,
    strategies: Optional[List[str]] = None,
    storage_key: Optional[str] = None,
    header_name: str = "Authorization",
    cdp_port: Optional[int] = None,
    force: bool = False,
    auth_failed: bool = False,
    ttl: Optional[float] = None,
) -> AuthResult:
    """
    Try multiple strategies to obtain authentication for *domain*.

    Returns AuthResult with cookies/headers/token, source, and expires_at.

    When *auth_failed* is True (caller got 401/403), unconditionally attempts
    SSO refresh regardless of cookie expiry.  Otherwise, proactive refresh
    triggers when cookies expire within ``_EXPIRY_THRESHOLD`` (5 min).
    """
    strats = list(strategies or _DEFAULT_STRATEGIES)

    db_cookies: Dict[str, str] = {}
    cdp_cookies: Dict[str, str] = {}
    if "cookie_db" in strats:
        db_cookies = get_cookies(domain, force=force, ttl=ttl) or {}
    if "cdp_cookie" in strats:
        cdp_cookies = get_cdp_cookies(domain, cdp_port=cdp_port, force=force, ttl=ttl) or {}

    if "cookie_db" in strats or "cdp_cookie" in strats:
        merged: Dict[str, str] = {**db_cookies, **cdp_cookies}
        if merged:
            expires_at = _get_cookie_expires(domain)
            now = time.time()

            need_refresh = auth_failed or (
                expires_at is not None and expires_at - now < _EXPIRY_THRESHOLD
            )
            if need_refresh:
                reason = "server returned 401/403" if auth_failed else (
                    f"expiring soon (at {time.strftime('%H:%M:%S', time.localtime(expires_at))})"
                )
                logger.warning(
                    "Cookies for %s need refresh (%s), attempting auto-refresh",
                    domain, reason,
                )
                if _try_auto_refresh(domain, cdp_port):
                    invalidate_domain(domain)
                    if "cookie_db" in strats:
                        db_cookies = get_cookies(domain, force=True, ttl=ttl) or {}
                    if "cdp_cookie" in strats:
                        cdp_cookies = get_cdp_cookies(domain, cdp_port=cdp_port, force=True, ttl=ttl) or {}
                    merged = {**db_cookies, **cdp_cookies}
                    expires_at = _get_cookie_expires(domain)

            if db_cookies and cdp_cookies:
                src = "cookie_db+cdp_cookie"
            elif db_cookies:
                src = "cookie_db"
            else:
                src = "cdp_cookie"
            return AuthResult(cookies=merged, source=src, expires_at=expires_at)

        # No cookies found at all — try auto-refresh before giving up
        if _try_auto_refresh(domain, cdp_port):
            if "cdp_cookie" in strats:
                cdp_cookies = get_cdp_cookies(domain, cdp_port=cdp_port, force=True, ttl=ttl) or {}
            if "cookie_db" in strats:
                db_cookies = get_cookies(domain, force=True, ttl=ttl) or {}
            merged = {**db_cookies, **cdp_cookies}
            if merged:
                expires_at = _get_cookie_expires(domain)
                src = "cdp_cookie(refreshed)" if cdp_cookies else "cookie_db(refreshed)"
                return AuthResult(cookies=merged, source=src, expires_at=expires_at)

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

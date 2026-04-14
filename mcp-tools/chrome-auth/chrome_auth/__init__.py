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
from typing import Dict, List, Optional, Tuple

from .cache import get_cache
from .cookie_provider import get_cookies
from .cdp_provider import (
    get_cdp_cookies,
    get_header,
    get_storage,
    refresh_session,
    sso_refresh_urls_for_domain,
    probe_cdp_connectivity,
    _SSO_REFRESH_DOMAINS,
)
from .types import AuthResult
from .diagnostic import cookie_diagnostic, format_auth_troubleshoot

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
    "format_auth_troubleshoot",
    "invalidate_domain",
    "refresh_session",
    "sso_refresh_urls_for_domain",
    "probe_cdp_connectivity",
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


def _try_auto_refresh(
    domain: str, cdp_port: Optional[int], *, force: bool = False
) -> Tuple[bool, Tuple[str, ...]]:
    """Attempt silent SSO refresh via CDP navigation (may try several URLs).

    When *force* is True (e.g. server returned 401), bypass the per-domain cooldown
    so every failed request can trigger a new refresh attempt.

    Returns (success, urls_tried_in_order).
    """
    if not force and not _should_refresh(domain):
        return False, ()
    urls = sso_refresh_urls_for_domain(domain)
    if not urls:
        return False, ()
    _last_refresh[domain] = time.time()
    tried: List[str] = []
    for url in urls:
        logger.info("Attempting auto SSO refresh for %s via %s", domain, url)
        tried.append(url)
        if refresh_session(url, cdp_port=cdp_port):
            return True, tuple(tried)
    return False, tuple(tried)


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

    Returns AuthResult with cookies/headers/token, source, expires_at, and
    optional ``sso_refresh_*`` fields (for MCP 401 diagnostics).

    When *auth_failed* is True (caller got 401/403), unconditionally attempts
    SSO refresh regardless of cookie expiry **and bypasses the 60s per-domain
    refresh cooldown**.  Otherwise, proactive refresh triggers when cookies
    expire within ``_EXPIRY_THRESHOLD`` (5 min).
    """
    strats = list(strategies or _DEFAULT_STRATEGIES)

    db_cookies: Dict[str, str] = {}
    cdp_cookies: Dict[str, str] = {}
    if "cookie_db" in strats:
        db_cookies = get_cookies(domain, force=force, ttl=ttl) or {}
    if "cdp_cookie" in strats:
        cdp_cookies = get_cdp_cookies(domain, cdp_port=cdp_port, force=force, ttl=ttl) or {}

    empty_branch_sso_attempted = False
    empty_branch_sso_ok = False
    empty_branch_sso_urls: Tuple[str, ...] = ()

    if "cookie_db" in strats or "cdp_cookie" in strats:
        merged: Dict[str, str] = {**db_cookies, **cdp_cookies}
        if merged:
            expires_at = _get_cookie_expires(domain)
            now = time.time()

            need_refresh = auth_failed or (
                expires_at is not None and expires_at - now < _EXPIRY_THRESHOLD
            )
            sso_attempted = False
            sso_ok = False
            sso_urls: Tuple[str, ...] = ()
            if need_refresh:
                reason = "server returned 401/403" if auth_failed else (
                    f"expiring soon (at {time.strftime('%H:%M:%S', time.localtime(expires_at))})"
                )
                logger.warning(
                    "Cookies for %s need refresh (%s), attempting auto-refresh",
                    domain, reason,
                )
                sso_attempted = True
                sso_ok, sso_urls = _try_auto_refresh(domain, cdp_port, force=auth_failed)
                if sso_ok:
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
            return AuthResult(
                cookies=merged,
                source=src,
                expires_at=expires_at,
                sso_refresh_attempted=sso_attempted,
                sso_refresh_succeeded=sso_ok if sso_attempted else False,
                sso_refresh_urls_tried=sso_urls,
            )

        # No cookies found at all — try auto-refresh before giving up
        empty_branch_sso_ok, empty_branch_sso_urls = _try_auto_refresh(
            domain, cdp_port, force=auth_failed
        )
        empty_branch_sso_attempted = bool(empty_branch_sso_urls)
        if empty_branch_sso_ok:
            if "cdp_cookie" in strats:
                cdp_cookies = get_cdp_cookies(domain, cdp_port=cdp_port, force=True, ttl=ttl) or {}
            if "cookie_db" in strats:
                db_cookies = get_cookies(domain, force=True, ttl=ttl) or {}
            merged = {**db_cookies, **cdp_cookies}
            if merged:
                expires_at = _get_cookie_expires(domain)
                src = "cdp_cookie(refreshed)" if cdp_cookies else "cookie_db(refreshed)"
                return AuthResult(
                    cookies=merged,
                    source=src,
                    expires_at=expires_at,
                    sso_refresh_attempted=True,
                    sso_refresh_succeeded=True,
                    sso_refresh_urls_tried=empty_branch_sso_urls,
                )

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

    return AuthResult(
        sso_refresh_attempted=empty_branch_sso_attempted,
        sso_refresh_succeeded=empty_branch_sso_ok if empty_branch_sso_attempted else False,
        sso_refresh_urls_tried=empty_branch_sso_urls,
    )

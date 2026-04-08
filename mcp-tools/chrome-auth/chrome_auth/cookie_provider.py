"""Cookie provider — reads cookies from Chrome's on-disk cookie database via browser_cookie3."""

import logging
from typing import Dict, Optional

import browser_cookie3

from .cache import get_cache

logger = logging.getLogger("chrome_auth.cookie")

# browser_cookie3 reads the *parent domain*, so we always query the
# top-level domain and let callers filter by subdomain if needed.
_PARENT_DOMAIN_MAP = {
    "datasuite.shopee.io": "shopee.io",
    "data-infra.shopee.io": "shopee.io",
}


def _cookie_applies_to_host(host: str, cookie_domain: str) -> bool:
    """Whether a cookie with Domain=cookie_domain should be sent to host (RFC 6265 style)."""
    host = (host or "").lower().strip()
    cd = (cookie_domain or "").lstrip(".").lower().strip()
    if not host or not cd:
        return False
    return host == cd or host.endswith("." + cd)


def get_cookies(
    domain: str,
    *,
    force: bool = False,
    ttl: Optional[float] = None,
    parent_domain: Optional[str] = None,
) -> Dict[str, str]:
    """
    Read cookies for *domain* from Chrome's cookie database.

    Args:
        domain: Target domain (e.g. "datasuite.shopee.io").
        force: Bypass cache and re-read from disk.
        ttl: Cache lifetime in seconds (default 1800).
        parent_domain: Override the domain passed to browser_cookie3.
                       By default we map known subdomains to their parent.

    Returns:
        Dict of cookie name → value for cookies whose domain matches.
    """
    cache = get_cache()
    cache_key = f"cookie:{domain}"

    if not force:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

    query_domain = parent_domain or _PARENT_DOMAIN_MAP.get(domain, domain)

    try:
        cj = browser_cookie3.chrome(domain_name=query_domain)
    except Exception as e:
        logger.error("Failed to read Chrome cookies for %s: %s", query_domain, e)
        return cache.get(cache_key) or {}

    cookies: Dict[str, str] = {}
    for c in cj:
        cookie_domain = c.domain or ""
        # 必须包含父域 Cookie：例如 Domain=.shopee.io 的 DATA-SUITE-AUTH-userToken-v4
        # 旧逻辑用 `domain in cookie_domain` 会漏掉仅挂在 .shopee.io 上的 Cookie
        if _cookie_applies_to_host(domain, cookie_domain):
            cookies[c.name] = c.value

    if cookies:
        cache.set(cache_key, cookies, ttl)
        logger.info("Loaded %d cookies for %s (via %s)", len(cookies), domain, query_domain)
    else:
        logger.warning("No cookies found for %s — make sure you are logged in via Chrome", domain)

    return cookies

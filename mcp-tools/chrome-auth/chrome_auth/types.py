"""Shared type definitions for chrome-auth."""

import time
from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple


@dataclass
class AuthResult:
    """Unified authentication result returned by get_auth()."""

    cookies: Dict[str, str] = field(default_factory=dict)
    headers: Dict[str, str] = field(default_factory=dict)
    token: Optional[str] = None
    source: str = ""
    expires_at: Optional[float] = None
    # Last get_auth() SSO refresh attempt (for MCP 401 troubleshooting)
    sso_refresh_attempted: bool = False
    sso_refresh_succeeded: bool = False
    sso_refresh_urls_tried: Tuple[str, ...] = field(default_factory=tuple)

    @property
    def ok(self) -> bool:
        return bool(self.cookies or self.headers or self.token)

    @property
    def expires_soon(self) -> bool:
        """True if cookies expire within 5 minutes."""
        if self.expires_at is None:
            return False
        return self.expires_at - time.time() < 300

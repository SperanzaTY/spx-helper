"""Shared type definitions for chrome-auth."""

from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass
class AuthResult:
    """Unified authentication result returned by get_auth()."""

    cookies: Dict[str, str] = field(default_factory=dict)
    headers: Dict[str, str] = field(default_factory=dict)
    token: Optional[str] = None
    source: str = ""

    @property
    def ok(self) -> bool:
        return bool(self.cookies or self.headers or self.token)

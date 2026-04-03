"""Thread-safe TTL cache for authentication data."""

import threading
import time
from typing import Any, Optional

DEFAULT_TTL = 1800  # 30 minutes


class TTLCache:
    """Simple key-value cache with per-entry TTL and thread safety."""

    def __init__(self, default_ttl: float = DEFAULT_TTL):
        self._store: dict[str, tuple[Any, float]] = {}
        self._lock = threading.Lock()
        self._default_ttl = default_ttl

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, expires_at = entry
            if time.time() > expires_at:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        with self._lock:
            self._store[key] = (value, time.time() + (ttl or self._default_ttl))

    def invalidate(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


# Global singleton shared across all providers
_cache = TTLCache()


def get_cache() -> TTLCache:
    return _cache

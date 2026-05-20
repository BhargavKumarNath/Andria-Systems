import time
from collections.abc import Callable
from functools import wraps
from typing import Any


class TTLCache:
    """
    Lightweight, in-process TTL cache to avoid Redis overhead.
    """
    
    def __init__(self, ttl_seconds: int = 60):
        self.ttl_seconds = ttl_seconds
        self._cache: dict[str, tuple[float, Any]] = {}
        
    def get(self, key: str) -> Any:
        if key in self._cache:
            timestamp, value = self._cache[key]
            if time.time() - timestamp < self.ttl_seconds:
                return value
            else:
                del self._cache[key]
        return None
        
    def set(self, key: str, value: Any) -> None:
        self._cache[key] = (time.time(), value)


# Global in-process cache instance
api_cache = TTLCache(ttl_seconds=300)


def cached(key_prefix: str, ttl: int = 300) -> Callable:
    """Decorator to cache API endpoint responses."""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            # Simple key generation (sufficient for arg-less endpoints)
            cache_key = f"{key_prefix}"
            cached_val = api_cache.get(cache_key)
            if cached_val is not None:
                return cached_val
            
            result = await func(*args, **kwargs)
            # Update cache if custom TTL is given
            api_cache.ttl_seconds = ttl
            api_cache.set(cache_key, result)
            return result
        return wrapper
    return decorator

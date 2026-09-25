"""
Tiny in-memory TTL cache.

The free public services LumaPath depends on (OSRM, Overpass,
Photon, Open-Meteo) rate-limit aggressively, so repeating the same
lookup within a few minutes should never hit them again.
"""

import time


class TTLCache:

    def __init__(self, ttl_seconds, max_items=512):
        self.ttl = ttl_seconds
        self.max_items = max_items
        self._store = {}

    def get(self, key):

        item = self._store.get(key)

        if item is None:
            return None

        expires_at, value = item

        if expires_at < time.monotonic():
            self._store.pop(key, None)
            return None

        return value

    def set(self, key, value):

        if len(self._store) >= self.max_items:
            # Drop the entry closest to expiry.
            oldest = min(self._store, key=lambda k: self._store[k][0])
            self._store.pop(oldest, None)

        self._store[key] = (time.monotonic() + self.ttl, value)

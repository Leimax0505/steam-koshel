"""Steam Koshel — cache layer.

Two levels, no paid infrastructure:

1. In-process dict with TTL (fast path, disappears on restart).
2. SQLite file `cache.db` (survives restarts, keeps Steam prices and
   protects the API from rate limits).

Everything is JSON-serialised, so callers can store plain dicts/lists.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Optional


class Cache:
    def __init__(self, path: str | Path = "cache.db", ttl: int = 86_400) -> None:
        self.path = Path(path)
        self.ttl = int(ttl)
        self._mem: dict[str, tuple[Any, float]] = {}
        self._lock = threading.Lock()
        self._db = sqlite3.connect(str(self.path), check_same_thread=False)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=NORMAL")
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS kv ("
            "key TEXT PRIMARY KEY, value TEXT NOT NULL, expires REAL NOT NULL)"
        )
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS prices ("
            "appid INTEGER PRIMARY KEY, name TEXT, price REAL, discount INTEGER, "
            "currency TEXT, updated REAL)"
        )
        self._db.commit()

    # ------------------------------------------------------------------ kv

    def get(self, key: str, allow_stale: bool = False) -> Optional[Any]:
        """Return a cached value. With allow_stale=True an expired row is fine."""
        now = time.time()
        with self._lock:
            hit = self._mem.get(key)
            if hit and (allow_stale or hit[1] > now):
                return hit[0]
            row = self._db.execute(
                "SELECT value, expires FROM kv WHERE key = ?", (key,)
            ).fetchone()
            if row is None:
                return None
            if not allow_stale and row[1] <= now:
                return None
            try:
                value = json.loads(row[0])
            except json.JSONDecodeError:
                return None
            self._mem[key] = (value, row[1])
            return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        expires = time.time() + int(ttl if ttl is not None else self.ttl)
        payload = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        with self._lock:
            self._mem[key] = (value, expires)
            self._db.execute(
                "INSERT INTO kv (key, value, expires) VALUES (?, ?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value, "
                "expires = excluded.expires",
                (key, payload, expires),
            )
            self._db.commit()

    def delete(self, key: str) -> None:
        with self._lock:
            self._mem.pop(key, None)
            self._db.execute("DELETE FROM kv WHERE key = ?", (key,))
            self._db.commit()

    # --------------------------------------------------------------- prices

    def get_price(self, appid: int) -> Optional[dict[str, Any]]:
        with self._lock:
            row = self._db.execute(
                "SELECT appid, name, price, discount, currency, updated "
                "FROM prices WHERE appid = ?",
                (int(appid),),
            ).fetchone()
        if row is None:
            return None
        return {
            "appid": row[0],
            "name": row[1],
            "price": row[2],
            "discount": row[3],
            "currency": row[4],
            "updated": row[5],
        }

    def set_price(
        self,
        appid: int,
        name: str,
        price: float,
        discount: int = 0,
        currency: str = "USD",
    ) -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO prices (appid, name, price, discount, currency, updated) "
                "VALUES (?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(appid) DO UPDATE SET name = excluded.name, "
                "price = excluded.price, discount = excluded.discount, "
                "currency = excluded.currency, updated = excluded.updated",
                (int(appid), name, float(price), int(discount), currency, time.time()),
            )
            self._db.commit()

    # ----------------------------------------------------------------- misc

    def purge_expired(self) -> int:
        now = time.time()
        with self._lock:
            cur = self._db.execute("DELETE FROM kv WHERE expires <= ?", (now,))
            self._db.commit()
            self._mem = {k: v for k, v in self._mem.items() if v[1] > now}
            return cur.rowcount or 0

    def stats(self) -> dict[str, Any]:
        with self._lock:
            kv = self._db.execute("SELECT COUNT(*) FROM kv").fetchone()[0]
            prices = self._db.execute("SELECT COUNT(*) FROM prices").fetchone()[0]
        size = self.path.stat().st_size if self.path.exists() else 0
        return {"kv_rows": kv, "price_rows": prices, "size_bytes": size, "ttl": self.ttl}

    def close(self) -> None:
        with self._lock:
            self._db.close()

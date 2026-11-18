"""Steam Koshel — FastAPI backend.

Run locally:
    uvicorn app.main:app --reload --port 8000

Open http://127.0.0.1:8000. The front-end needs this backend for live
Steam data; every profile is cached so repeat lookups stay cheap.
"""

from __future__ import annotations

import asyncio
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .analyzer import build_profile
from .cache import Cache
from .steam_client import PrivateProfile, ProfileNotFound, SteamClient, SteamError

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


STEAM_API_KEY = (os.getenv("STEAM_API_KEY") or "").strip()
CACHE_TTL = _env_int("CACHE_TTL_HOURS", 24) * 3_600
CACHE_PATH = os.getenv("CACHE_PATH") or str(BASE_DIR / "cache.db")
MAX_DETAILS = _env_int("MAX_DETAILS", 40)
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
USER_AGENT = "SteamKoshel/1.0 (+https://github.com/; public Steam statistics only)"


@asynccontextmanager
async def lifespan(app: FastAPI):
    cache = Cache(CACHE_PATH, ttl=CACHE_TTL)
    http = httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        follow_redirects=True,
    )
    app.state.cache = cache
    app.state.http = http
    app.state.steam = SteamClient(STEAM_API_KEY, cache, http, ttl=CACHE_TTL)
    try:
        yield
    finally:
        await http.aclose()
        cache.close()


app = FastAPI(
    title="Steam Koshel API",
    description="Public Steam profile analytics: library value, hours, trophies, taste.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------- helpers


def _steam(request: Request) -> SteamClient:
    if not STEAM_API_KEY:
        raise HTTPException(status_code=503, detail="no_api_key")
    return request.app.state.steam


def _clean_query(value: str) -> str:
    query = (value or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="empty_query")
    if len(query) > 200:
        raise HTTPException(status_code=400, detail="query_too_long")
    return query


def _error_response(exc: Exception) -> JSONResponse:
    if isinstance(exc, ProfileNotFound):
        return JSONResponse(status_code=404, content={"detail": "not_found"})
    if isinstance(exc, PrivateProfile):
        return JSONResponse(status_code=403, content={"detail": "private"})
    if isinstance(exc, SteamError):
        return JSONResponse(status_code=502, content={"detail": "steam_unavailable"})
    return JSONResponse(status_code=500, content={"detail": "internal_error"})


def _remember(request: Request, payload: dict[str, Any]) -> None:
    """Keep the week's public records and a short live event feed.

    The pool is deliberately small (60 profiles) and lives in the existing
    SQLite cache, so there is no extra database to maintain.
    """
    try:
        cache: Cache = request.app.state.cache
        profile = payload.get("profile") or {}
        games = payload.get("games") or []
        inventory = payload.get("inventory") or []
        persona = str(profile.get("persona") or "player")
        steamid = str(profile.get("steamid") or "")
        if not steamid:
            return

        library_value = round(sum(float(g.get("salePrice") or g.get("price") or 0) for g in games), 2)
        inventory_value = round(
            sum(float(i.get("price") or 0) * max(1, int(i.get("count") or 1)) for i in inventory), 2
        )
        hours = round(sum(float(g.get("hours") or 0) for g in games))
        rarest = ((payload.get("achievements") or {}).get("rarest") or [{}])[0]
        priced = [g for g in games if float(g.get("salePrice") or g.get("price") or 0) > 0]
        priciest = max(
            priced,
            key=lambda g: float(g.get("salePrice") or g.get("price") or 0),
            default={},
        )
        ts = payload.get("meta", {}).get("generated_at") or 0

        entry = {
            "persona": persona,
            "steamid": steamid,
            "avatar": profile.get("avatar") or "",
            "hours": hours,
            "games": len(games),
            "library": library_value,
            "inventory": inventory_value,
            "rarity": rarest.get("rarity"),
            "rarest_name": rarest.get("name") or "",
            "rarest_game": rarest.get("game") or "",
            "priciest": round(float(priciest.get("salePrice") or priciest.get("price") or 0), 2),
            "priciest_name": priciest.get("name") or "",
            "ts": ts,
        }

        pool = cache.get("hall:pool") or []
        pool = [row for row in pool if row.get("steamid") != steamid]
        pool.insert(0, entry)
        pool = pool[:60]
        cache.set("hall:pool", pool, ttl=7 * 24 * 3_600)

        events = cache.get("hall:events") or []
        # One fresh set of events per profile keeps the feed readable even when
        # the same profile is checked repeatedly.
        events = [row for row in events if row.get("steamid") != steamid]
        events.insert(
            0,
            {
                "type": "check",
                "persona": persona,
                "steamid": steamid,
                "detail": "",
                "ts": ts,
            },
        )
        if rarest.get("name"):
            events.insert(
                0,
                {
                    "type": "trophy",
                    "persona": persona,
                    "steamid": steamid,
                    "detail": f"{rarest.get('name')} · {rarest.get('rarity')}%",
                    "ts": ts,
                },
            )
        if priciest.get("name"):
            events.insert(
                0,
                {
                    "type": "game",
                    "persona": persona,
                    "steamid": steamid,
                    "detail": priciest.get("name"),
                    "ts": ts,
                },
            )
        cache.set("hall:events", events[:40], ttl=7 * 24 * 3_600)
    except Exception:  # never let the ticker break a profile request
        return


# ---------------------------------------------------------------------- routes


@app.get("/api/health")
async def health(request: Request) -> dict[str, Any]:
    return {
        "status": "ok",
        "steam_key": bool(STEAM_API_KEY),
        "cache": request.app.state.cache.stats(),
        "version": "1.0.0",
    }


@app.get("/api/profile")
async def profile(
    request: Request,
    q: str = Query(..., description="Steam link, SteamID64 or nickname"),
    lang: str = Query("ru", pattern="^(ru|en|zh)$"),
    cur: str = Query("RUB", pattern="^(RUB|USD|CNY)$"),
) -> JSONResponse:
    try:
        client = _steam(request)
        query = _clean_query(q)
        payload = await build_profile(client, query, lang=lang, currency=cur, max_games=MAX_DETAILS)
        _remember(request, payload)
        return JSONResponse(
            content=payload,
            headers={"Cache-Control": "public, max-age=60"},
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — mapped to a stable JSON contract
        return _error_response(exc)


@app.get("/api/compare")
async def compare(
    request: Request,
    a: str = Query(...),
    b: str = Query(...),
    lang: str = Query("ru", pattern="^(ru|en|zh)$"),
) -> JSONResponse:
    try:
        client = _steam(request)
        first, second = await asyncio.gather(
            build_profile(client, _clean_query(a), lang=lang, max_games=MAX_DETAILS),
            build_profile(client, _clean_query(b), lang=lang, max_games=MAX_DETAILS),
        )
        return JSONResponse(content={"a": first, "b": second})
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        return _error_response(exc)


def _hall_payload(request: Request) -> dict[str, Any]:
    cache: Cache = request.app.state.cache
    pool = cache.get("hall:pool") or []
    events = cache.get("hall:events") or []
    if not pool:
        return {"records": [], "events": [], "note": "no profiles checked yet"}

    def leader(key: str, *, when: str = "max", category: str = "", kind: str = "int", detail: str = "") -> Optional[dict[str, Any]]:
        rows = [row for row in pool if row.get(key) is not None and float(row.get(key) or 0) > 0]
        if not rows:
            return None
        row = max(rows, key=lambda item: float(item.get(key) or 0)) if when == "max" else min(rows, key=lambda item: float(item.get(key) or 0))
        return {
            "category": category or key,
            "kind": kind,
            "value": row.get(key),
            "detail": row.get(detail) if detail else "",
            "persona": row.get("persona") or "player",
            "steamid": row.get("steamid") or "",
            "ts": row.get("ts") or 0,
        }

    records = [
        leader("library", category="library", kind="money"),
        leader("inventory", category="inventory", kind="money"),
        leader("hours", category="hours", kind="hours"),
        leader("rarity", when="min", category="rarity", kind="percent", detail="rarest_name"),
        leader("games", category="games", kind="int"),
        leader("priciest", category="priciest", kind="money", detail="priciest_name"),
    ]
    return {
        "records": [row for row in records if row],
        "events": events[:24],
        "updated_at": int(time.time()),
    }


@app.get("/api/hall-of-fame")
async def hall_of_fame(request: Request) -> dict[str, Any]:
    return _hall_payload(request)


@app.get("/api/hall")
async def hall(request: Request) -> dict[str, Any]:
    """Backwards-compatible alias for the old endpoint name."""
    return _hall_payload(request)


ALLOWED_IMAGE_HOSTS = (
    "steamstatic.com",
    "steamcdn-a.akamaihd.net",
    "steamcommunity-a.akamaihd.net",
)


@app.get("/api/avatar-proxy")
async def avatar_proxy(request: Request, url: str = Query(..., max_length=500)) -> Response:
    """Small image proxy used only to keep the passport canvas untainted.

    It accepts Steam CDN avatars and nothing else, and never touches videos.
    """
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https") or not any(
        host == allowed or host.endswith("." + allowed) for allowed in ALLOWED_IMAGE_HOSTS
    ):
        raise HTTPException(status_code=400, detail="bad_image_host")
    try:
        upstream = await request.app.state.http.get(
            url,
            timeout=12.0,
            headers={"User-Agent": USER_AGENT, "Accept": "image/*"},
        )
        upstream.raise_for_status()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="image_unavailable") from None
    content_type = upstream.headers.get("content-type", "image/jpeg")
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="not_an_image")
    return Response(
        content=upstream.content,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/api/cache/stats")
async def cache_stats(request: Request) -> dict[str, Any]:
    return request.app.state.cache.stats()


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(BASE_DIR / "index.html", headers={"Cache-Control": "no-store"})


@app.get("/index.html")
async def index_html() -> FileResponse:
    return FileResponse(BASE_DIR / "index.html", headers={"Cache-Control": "no-store"})


app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=_env_int("PORT", 8000),
        reload=bool(os.getenv("RELOAD")),
    )

"""Steam Koshel — FastAPI backend.

Run locally:
    uvicorn app.main:app --reload --port 8000

Open http://127.0.0.1:8000 — the same page also works as a plain file
(`index.html`) with built-in demo profiles and no backend at all.
"""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
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
    """Anonymised weekly hall of fame, kept in the same cache."""
    try:
        cache: Cache = request.app.state.cache
        records = cache.get("hall:week") or []
        profile = payload.get("profile") or {}
        games = payload.get("games") or []
        inventory = payload.get("inventory") or []
        persona = str(profile.get("persona") or "player")
        masked = (persona[:1] + "•••") if len(persona) > 1 else "•••"
        hours = round(sum(float(g.get("hours") or 0) for g in games))
        portfolio = round(
            sum(float(g.get("salePrice") or 0) for g in games)
            + sum(float(i.get("price") or 0) for i in inventory),
            2,
        )
        rarest = ((payload.get("achievements") or {}).get("rarest") or [{}])[0]
        records.append(
            {
                "who": masked,
                "hours": hours,
                "games": len(games),
                "portfolio": portfolio,
                "rarity": rarest.get("rarity"),
                "ts": payload.get("meta", {}).get("generated_at"),
            }
        )
        records = sorted(records, key=lambda r: r.get("ts") or 0, reverse=True)[:50]
        cache.set("hall:week", records, ttl=7 * 24 * 3_600)
    except Exception:  # never let the hall break a profile request
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


@app.get("/api/hall")
async def hall(request: Request) -> dict[str, Any]:
    records = request.app.state.cache.get("hall:week") or []
    if not records:
        return {"records": [], "note": "no profiles checked yet"}

    def best(key: str) -> Optional[dict[str, Any]]:
        rows = [r for r in records if r.get(key) is not None]
        return max(rows, key=lambda r: r[key]) if rows else None

    return {
        "records": records[:20],
        "leaders": {
            "hours": best("hours"),
            "games": best("games"),
            "portfolio": best("portfolio"),
        },
        "note": "anonymised, refreshed weekly",
    }


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

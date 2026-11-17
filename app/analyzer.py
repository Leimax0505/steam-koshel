"""Steam Koshel — turns raw Steam API data into one clean payload.

The front-end does the presentation maths (ranks, charts, portraits) itself,
so this module only has to be honest about the raw material:

    profile + games + achievements + inventory + wishlist + friends

The payload matches `static/app.js` 1:1, which means demo mode and live mode
render through exactly the same code.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from .steam_client import PrivateProfile, SteamClient, SteamError

MAX_RETURNED_GAMES = 120
MAX_DETAILS = 40
MAX_ACHIEVEMENT_GAMES = 7
MAX_FRIENDS = 6

HEAVY_GENRES = {"Action", "RPG", "Adventure", "Simulation", "Racing", "Massively Multiplayer"}
SHORT_HOURS = 12
LONG_HOURS = 80


def _year_from(date_str: str) -> int:
    match = re.search(r"(\d{4})", date_str or "")
    return int(match.group(1)) if match else 0


def _ms(timestamp: Any) -> int:
    try:
        value = int(timestamp or 0)
    except (TypeError, ValueError):
        return 0
    return value * 1000 if value else 0


def _tags_for(game: dict[str, Any]) -> list[str]:
    tags: list[str] = []
    if game["hours"] <= 0.5:
        tags.append("never")
    if game.get("coop"):
        tags.append("coop")
    if game.get("multi"):
        tags.append("multi")
    if game.get("vr"):
        tags.append("vr")
    if game["metacritic"] >= 85:
        tags.append("gem")
    if game["hours"] and game["hours"] <= SHORT_HOURS:
        tags.append("short")
    if game["hours"] >= LONG_HOURS:
        tags.append("long")
    if game.get("delisted"):
        tags.append("delisted")
    return tags


def _weight_for(genres: Iterable[str], metacritic: int, year: int, vr: bool) -> int:
    weight = 2
    genre_set = set(genres)
    if genre_set & HEAVY_GENRES:
        weight += 1
    if metacritic >= 85 and year >= 2018:
        weight += 1
    if vr:
        weight = 5
    return max(1, min(5, weight))


def _game_from(raw: dict[str, Any], detail: Optional[dict[str, Any]], delisted: bool) -> dict[str, Any]:
    appid = int(raw.get("appid") or 0)
    minutes = int(raw.get("playtime_forever") or 0)
    recent = int(raw.get("playtime_2weeks") or 0)
    hours = round(minutes / 60, 1)
    hours_2w = round(recent / 60, 1)

    detail = detail or {}
    genres = [g.get("description", "") for g in detail.get("genres", []) if g.get("description")]
    categories = [c.get("description", "") for c in detail.get("categories", []) if c.get("description")]
    lowered = " ".join(categories).lower()

    metacritic = int((detail.get("metacritic") or {}).get("score") or 0)
    year = _year_from((detail.get("release_date") or {}).get("date", ""))
    price_overview = detail.get("price_overview") or {}
    price = round(float(price_overview.get("initial") or 0) / 100, 2)
    final = round(float(price_overview.get("final") or 0) / 100, 2)
    discount = int(price_overview.get("discount_percent") or 0)
    is_free = bool(detail.get("is_free"))
    if is_free:
        price, final, discount = 0.0, 0.0, 0
    achievements = detail.get("achievements") or {}
    last_played = int(raw.get("rtime_last_played") or 0)

    game = {
        "appid": appid,
        "name": detail.get("name") or raw.get("name") or f"App {appid}",
        "hours": hours,
        "hours2w": hours_2w,
        "genres": genres[:4],
        "metacritic": metacritic,
        "price": price,
        "discount": discount,
        "salePrice": final if price else 0.0,
        "year": year,
        "ach": {"unlocked": 0, "total": int(achievements.get("total") or 0)},
        "lastYear": datetime.fromtimestamp(last_played, tz=timezone.utc).year if last_played else 0,
        "weight": _weight_for(genres, metacritic, year, "vr" in lowered),
        "coop": "co-op" in lowered,
        "multi": "multi-player" in lowered or "multiplayer" in lowered,
        "vr": "vr" in lowered,
        "delisted": delisted,
        "cover": f"https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg",
        "accent": "#7C5CFF",
    }
    game["tags"] = _tags_for(game)
    return game


async def _fill_achievements(
    client: SteamClient,
    steamid: str,
    games: list[dict[str, Any]],
    lang: str,
) -> dict[str, Any]:
    """Player achievements + global rarity for the most played games."""
    targets = [g for g in games if g["ach"]["total"] > 0][:MAX_ACHIEVEMENT_GAMES]
    if not targets:
        return {"first": None, "rarest": []}

    async def load(game: dict[str, Any]):
        stats, globals_ = await asyncio.gather(
            client.player_achievements(steamid, game["appid"], lang),
            client.global_achievement_percentages(game["appid"]),
            return_exceptions=True,
        )
        return game, stats, globals_

    results = await asyncio.gather(*(load(g) for g in targets))

    rare: list[dict[str, Any]] = []
    first: Optional[dict[str, Any]] = None

    for game, stats, globals_ in results:
        if isinstance(stats, BaseException) or not isinstance(stats, dict):
            continue
        if not isinstance(globals_, dict):
            globals_ = {}
        rows = stats.get("achievements") or []
        unlocked = [r for r in rows if r.get("achieved")]
        game["ach"]["unlocked"] = len(unlocked)
        if not game["ach"]["total"]:
            game["ach"]["total"] = len(rows)

        for row in unlocked:
            api_name = str(row.get("apiname") or "")
            percent = float(globals_.get(api_name, 100.0))
            rare.append(
                {
                    "name": row.get("name") or api_name,
                    "game": game["name"],
                    "rarity": round(percent, 2),
                }
            )
            unlock_time = int(row.get("unlocktime") or 0)
            if unlock_time and (first is None or unlock_time < first["_ts"]):
                first = {
                    "name": row.get("name") or api_name,
                    "game": game["name"],
                    "rarity": round(percent, 2),
                    "date": unlock_time * 1000,
                    "_ts": unlock_time,
                }

    rare.sort(key=lambda item: item["rarity"])
    rarest = [
        {
            "name": item["name"],
            "game": item["game"],
            "rarity": item["rarity"],
            "icon": icon,
        }
        for item, icon in zip(rare[:3], ("★", "⚔", "✦"))
    ]

    if first:
        first.pop("_ts", None)

    return {"first": first, "rarest": rarest}


async def _build_wishlist(client: SteamClient, steamid: str, lang: str) -> list[dict[str, Any]]:
    entries = await client.wishlist(steamid, lang)
    if not entries:
        return []

    details = await client.app_details_many(
        [e["appid"] for e in entries if e.get("appid")], lang="english", limit=8
    )

    out: list[dict[str, Any]] = []
    for entry in entries[:8]:
        appid = entry.get("appid") or 0
        detail = details.get(appid) or {}
        price_overview = detail.get("price_overview") or {}
        price = round(float(price_overview.get("initial") or 0) / 100, 2)
        final = round(float(price_overview.get("final") or 0) / 100, 2)
        out.append(
            {
                "name": detail.get("name") or entry.get("name") or f"App {appid}",
                "price": price,
                "final": final,
                "discount": int(price_overview.get("discount_percent") or 0),
                "year": entry.get("year") or _year_from((detail.get("release_date") or {}).get("date", "")),
            }
        )
    return out


async def _build_friends(
    client: SteamClient,
    steamid: str,
    games: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    ids = await client.friend_ids(steamid, MAX_FRIENDS)
    if not ids:
        return []

    summaries = await client.summaries(ids)
    by_id = {p.get("steamid"): p for p in summaries}

    own = {g["appid"]: g for g in games}
    own_ids = set(own)

    async def load(friend_id: str):
        try:
            games_raw = await client.owned_games(friend_id)
        except SteamError:
            games_raw = []
        return friend_id, games_raw

    results = await asyncio.gather(*(load(fid) for fid in ids))

    friends: list[dict[str, Any]] = []
    for friend_id, games_raw in results:
        if not games_raw:
            continue
        friend_ids = {int(g.get("appid") or 0) for g in games_raw}
        shared_ids = own_ids & friend_ids
        shared = sorted(
            (own[a]["name"] for a in shared_ids),
            key=lambda name: -next((g["hours"] for g in games if g["name"] == name), 0),
        )[:6]
        total_hours = sum(int(g.get("playtime_forever") or 0) for g in games_raw) // 60

        summary = by_id.get(friend_id) or {}
        coop_shared = sum(
            1 for a in shared_ids if own[a].get("coop") and own[a]["hours"] <= 0.5
        )
        compat = min(99, 38 + len(shared) * 9 + coop_shared * 11)
        friends.append(
            {
                "steamid": friend_id,
                "persona": summary.get("personaname") or "Steam friend",
                "avatar": summary.get("avatarfull") or summary.get("avatarmedium") or "",
                "hours": total_hours,
                "shared": shared,
                "compat": compat,
            }
        )

    friends.sort(key=lambda f: f["compat"], reverse=True)
    return friends


def _yearly(games: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[int, dict[str, int]] = {}
    for game in games:
        year = game.get("lastYear") or 0
        if not year or not game["hours"]:
            continue
        bucket = buckets.setdefault(year, {"y": year, "h": 0, "g": 0})
        bucket["h"] += game["hours"]
        bucket["g"] += 1
    return [buckets[y] for y in sorted(buckets)]


async def build_profile(
    client: SteamClient,
    query: str,
    lang: str = "ru",
    currency: str = "RUB",
    max_games: int = MAX_DETAILS,
) -> dict[str, Any]:
    """Resolve any Steam link/nickname and return the full payload."""
    steamid = await client.resolve(query)
    summary = await client.summary(steamid)

    bans, level, games_raw = await asyncio.gather(
        client.bans(steamid),
        client.level(steamid),
        client.owned_games(steamid),
        return_exceptions=False,
    )

    if not games_raw:
        raise PrivateProfile("this profile hides its game details")

    games_raw.sort(key=lambda g: int(g.get("playtime_forever") or 0), reverse=True)
    games_raw = games_raw[:MAX_RETURNED_GAMES]

    details = await client.app_details_many(
        [g.get("appid") for g in games_raw if g.get("appid")],
        lang="english",
        limit=max_games,
    )

    games: list[dict[str, Any]] = []
    warnings: list[str] = []
    missing: list[dict[str, Any]] = []

    for raw in games_raw:
        appid = int(raw.get("appid") or 0)
        detail = details.get(appid)
        if detail is None:
            missing.append(raw)
        games.append(_game_from(raw, detail, delisted=False))

    # A second, sequential attempt distinguishes “delisted” from “timed out”.
    if missing:
        retry = await asyncio.gather(
            *(client.app_details(int(raw.get("appid") or 0), "english") for raw in missing[:12])
        )
        for raw, detail in zip(missing, retry):
            appid = int(raw.get("appid") or 0)
            if detail is None:
                for game in games:
                    if game["appid"] == appid:
                        game["delisted"] = True
                        game["tags"] = _tags_for(game)
                continue
            index = next((i for i, g in enumerate(games) if g["appid"] == appid), None)
            if index is not None:
                games[index] = _game_from(raw, detail, delisted=False)
        if sum(1 for g in games if g["delisted"]) > 0:
            warnings.append("delisted_detected")
        if any(g["price"] == 0 and not g["delisted"] and g["hours"] == 0 for g in games):
            warnings.append("partial_prices")

    achievements, inventory, wishlist, friends = await asyncio.gather(
        _fill_achievements(client, steamid, games, lang),
        client.inventory(steamid),
        _build_wishlist(client, steamid, lang),
        _build_friends(client, steamid, games),
    )

    if not inventory:
        warnings.append("inventory_unavailable")
    if not wishlist:
        warnings.append("wishlist_unavailable")

    profile = {
        "steamid": steamid,
        "persona": summary.get("personaname") or "Steam user",
        "realname": summary.get("realname") or "",
        "level": int(level or 0),
        "country": summary.get("loccountrycode") or "",
        "created": _ms(summary.get("timecreated")),
        "online": int(summary.get("personastate") or 0) > 0,
        "avatar": summary.get("avatarfull") or summary.get("avatarmedium") or "",
        "bans": bans,
        "friends": len(friends),
    }

    payload = {
        "source": "live",
        "preset": "",
        "profile": profile,
        "games": games,
        "inventory": inventory,
        "achievements": achievements,
        "yearly": _yearly(games),
        "hourly": None,
        "wishlist": wishlist,
        "friends": friends,
        "warnings": warnings,
        "meta": {
            "lang": lang,
            "currency": currency,
            "price_currency": "USD",
            "games_returned": len(games),
            "details_fetched": sum(1 for g in games if g["price"] or g["metacritic"]),
            "generated_at": int(datetime.now(tz=timezone.utc).timestamp()),
        },
    }
    return payload

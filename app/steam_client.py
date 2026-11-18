"""Steam Koshel — thin, resilient client for the public Steam Web API.

Only official endpoints (plus the public store/community JSON that Steam
itself uses on the web). No scraping of private data, no passwords.

All responses are cached through `app.cache.Cache`, so repeated lookups of
the same profile cost nothing and stay inside Steam rate limits.
"""

from __future__ import annotations

import asyncio
import re
from typing import Any, Iterable, Optional

import httpx

from .cache import Cache

STEAM_API = "https://api.steampowered.com"
STORE_API = "https://store.steampowered.com"
COMMUNITY_API = "https://steamcommunity.com"

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
}

MEDIA_URL_RE = re.compile(r"https?://[^\s\"'<>]+?\.(?:webm|mp4|gif|jpg|jpeg|png)(?:\?[^\s\"'<>]*)?", re.I)

STEAMID64_RE = re.compile(r"7656\d{13}")
PROFILE_ID_RE = re.compile(r"/profiles/(\d{17})")
VANITY_RE = re.compile(r"/id/([^/?#]+)")


class SteamError(Exception):
    """Something went wrong while talking to Steam."""


class ProfileNotFound(SteamError):
    """The nickname / link does not resolve to an account."""


class PrivateProfile(SteamError):
    """The account exists, but game details are not public."""


class SteamClient:
    def __init__(
        self,
        key: str,
        cache: Cache,
        http: httpx.AsyncClient,
        ttl: int = 86_400,
    ) -> None:
        self.key = key
        self.cache = cache
        self.http = http
        self.ttl = ttl
        self._semaphore = asyncio.Semaphore(6)

    # ------------------------------------------------------------- plumbing

    async def _get_json(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        *,
        cache_key: str | None = None,
        ttl: int | None = None,
        allow_stale: bool = False,
        headers: dict[str, str] | None = None,
    ) -> Any:
        params = params or {}
        key = cache_key or f"{url}?{sorted(params.items())}"

        fresh = self.cache.get(key)
        if fresh is not None:
            return fresh

        status = 0
        try:
            async with self._semaphore:
                response = await self.http.get(
                    url, params=params, timeout=16.0, headers=headers
                )
            status = response.status_code
            response.raise_for_status()
            data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            stale = self.cache.get(key, allow_stale=True)
            if stale is not None:
                return stale
            error = SteamError(f"Steam request failed: {exc}")
            response = getattr(exc, "response", None)
            error.status = status or (response.status_code if response is not None else 0)
            raise error from exc

        self.cache.set(key, data, ttl or self.ttl)
        return data

    async def _get_text(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        *,
        cache_key: str,
        ttl: int = 86_400,
    ) -> str:
        """Fetch a public community page once and keep the HTML in cache."""
        fresh = self.cache.get(cache_key)
        if isinstance(fresh, str):
            return fresh
        try:
            async with self._semaphore:
                response = await self.http.get(
                    url, params=params or {}, timeout=16.0, headers=BROWSER_HEADERS
                )
            response.raise_for_status()
            text = response.text
        except httpx.HTTPError as exc:
            stale = self.cache.get(cache_key, allow_stale=True)
            if isinstance(stale, str):
                return stale
            raise SteamError(f"Steam page failed: {exc}") from exc
        self.cache.set(cache_key, text, ttl)
        return text

    # ------------------------------------------------------------- identity

    async def resolve(self, query: str) -> str:
        """Turn any of these into a SteamID64:

        /id/custom, /profiles/7656119..., a bare SteamID64, a nickname,
        or a link to inventory / screenshots / stats.
        """
        raw = (query or "").strip().strip('"').strip("'").strip()
        if not raw:
            raise ProfileNotFound("empty query")

        match = STEAMID64_RE.search(raw)
        if match:
            return match.group(0)

        match = PROFILE_ID_RE.search(raw)
        if match:
            return match.group(1)

        if re.fullmatch(r"\d{17}", raw):
            return raw

        vanity: Optional[str] = None
        match = VANITY_RE.search(raw)
        if match:
            vanity = match.group(1)
        else:
            cleaned = re.sub(r"^https?://", "", raw).split("?")[0].strip("/")
            if cleaned and "/" not in cleaned and "steamcommunity" not in cleaned:
                vanity = cleaned
            elif cleaned.startswith("steamcommunity.com"):
                parts = [p for p in cleaned.split("/") if p and "." not in p]
                vanity = parts[-1] if parts else None

        if not vanity:
            raise ProfileNotFound("could not find a SteamID in that link")

        if vanity.isdigit() and len(vanity) == 17:
            return vanity

        data = await self._get_json(
            f"{STEAM_API}/ISteamUser/ResolveVanityURL/v1/",
            {"key": self.key, "vanityurl": vanity},
        )
        response = (data or {}).get("response", {})
        if response.get("success") != 1 or not response.get("steamid"):
            raise ProfileNotFound(f"no account for “{vanity}”")
        return response["steamid"]

    # -------------------------------------------------------------- profile

    async def summaries(self, steamids: Iterable[str]) -> list[dict[str, Any]]:
        ids = [s for s in steamids if s]
        if not ids:
            return []
        data = await self._get_json(
            f"{STEAM_API}/ISteamUser/GetPlayerSummaries/v2/",
            {"key": self.key, "steamids": ",".join(ids)},
            cache_key=f"summaries:{','.join(sorted(ids))}",
            ttl=3_600,
        )
        return (data or {}).get("response", {}).get("players", []) or []

    async def summary(self, steamid: str) -> dict[str, Any]:
        players = await self.summaries([steamid])
        if not players:
            raise ProfileNotFound("profile does not exist")
        return players[0]

    async def animated_avatar(self, steamid: str) -> str:
        """Direct CDN URL of the animated avatar, if the account has one."""
        try:
            data = await self._get_json(
                f"{STEAM_API}/IPlayerService/GetAnimatedAvatar/v1/",
                {"key": self.key, "steamid": steamid},
                cache_key=f"animated-avatar:{steamid}",
                ttl=7 * 86_400,
            )
            url = self._first_media(data, ("webm", "mp4", "gif"))
            if url:
                return url
        except SteamError:
            pass
        return await self._media_from_profile_html(steamid, "animated_avatar", ("webm", "mp4", "gif"))

    async def profile_background(self, steamid: str) -> dict[str, str]:
        """Background image and, when present, the animated movie URL."""
        image = ""
        movie = ""
        try:
            data = await self._get_json(
                f"{STEAM_API}/IPlayerService/GetProfileBackground/v1/",
                {"key": self.key, "steamid": steamid},
                cache_key=f"profile-background:{steamid}",
                ttl=7 * 86_400,
            )
            image = self._first_media(data, ("jpg", "jpeg", "png", "gif"))
            movie = self._first_media(data, ("webm", "mp4"))
        except SteamError:
            pass

        if not image:
            image = await self._media_from_profile_html(
                steamid, "profile_background_image_url", ("jpg", "jpeg", "png")
            ) or await self._media_from_profile_html(steamid, "background_image", ("jpg", "jpeg", "png"))
        if not movie:
            movie = await self._media_from_profile_html(steamid, "movie_webm", ("webm",)) or \
                await self._media_from_profile_html(steamid, "movie_mp4", ("mp4",))
        return {"image": image, "movie": movie}

    async def profile_media(self, steamid: str) -> dict[str, str]:
        animated, background = await asyncio.gather(
            self.animated_avatar(steamid),
            self.profile_background(steamid),
            return_exceptions=True,
        )
        if isinstance(animated, BaseException):
            animated = ""
        if isinstance(background, BaseException):
            background = {"image": "", "movie": ""}
        return {
            "avatar_animated": animated or "",
            "background": (background or {}).get("image", "") if isinstance(background, dict) else "",
            "background_movie": (background or {}).get("movie", "") if isinstance(background, dict) else "",
        }

    async def _media_from_profile_html(self, steamid: str, field: str, extensions: tuple[str, ...]) -> str:
        try:
            page = await self._get_text(
                f"{COMMUNITY_API}/profiles/{steamid}/",
                {"l": "english"},
                cache_key=f"profile-html:{steamid}",
                ttl=6 * 3_600,
            )
        except SteamError:
            return ""
        patterns = [
            rf'"{field}"\s*:\s*"([^"]+)"',
            rf'{field}\s*=\s*"([^"]+)"',
        ]
        for pattern in patterns:
            for match in re.finditer(pattern, page):
                candidate = match.group(1).replace("\\/", "/")
                if any(candidate.lower().split("?")[0].endswith("." + ext) for ext in extensions):
                    return candidate
        return ""

    @staticmethod
    def _first_media(node: Any, extensions: tuple[str, ...]) -> str:
        """Walk an arbitrary Steam response and return the first media URL."""
        if isinstance(node, str):
            value = node.replace("\\/", "/")
            clean = value.split("?")[0].lower()
            if value.startswith("http") and any(clean.endswith("." + ext) for ext in extensions):
                return value
            return ""
        if isinstance(node, dict):
            for value in node.values():
                found = SteamClient._first_media(value, extensions)
                if found:
                    return found
            return ""
        if isinstance(node, (list, tuple)):
            for value in node:
                found = SteamClient._first_media(value, extensions)
                if found:
                    return found
        return ""

    async def level(self, steamid: str) -> int:
        try:
            data = await self._get_json(
                f"{STEAM_API}/IPlayerService/GetSteamLevel/v1/",
                {"key": self.key, "steamid": steamid},
                cache_key=f"level:{steamid}",
                ttl=86_400,
            )
            return int((data or {}).get("response", {}).get("player_level") or 0)
        except (SteamError, ValueError, TypeError):
            return 0

    async def bans(self, steamid: str) -> dict[str, int]:
        try:
            data = await self._get_json(
                f"{STEAM_API}/ISteamUser/GetPlayerBans/v1/",
                {"key": self.key, "steamids": steamid},
                cache_key=f"bans:{steamid}",
                ttl=3_600,
            )
            player = ((data or {}).get("players") or [{}])[0]
        except SteamError:
            return {"vac": 0, "game": 0, "trade": 0, "community": 0, "lastBanDays": 0}

        vac = int(player.get("NumberOfVACBans") or 0)
        game = int(player.get("NumberOfGameBans") or 0)
        community = 1 if player.get("CommunityBanned") else 0
        trade = 1 if str(player.get("EconomyBan", "none")).lower() not in ("none", "0", "") else 0
        return {
            "vac": vac,
            "game": game,
            "trade": trade,
            "community": community,
            "lastBanDays": int(player.get("DaysSinceLastBan") or 0),
        }

    async def owned_games(self, steamid: str) -> list[dict[str, Any]]:
        data = await self._get_json(
            f"{STEAM_API}/IPlayerService/GetOwnedGames/v1/",
            {
                "key": self.key,
                "steamid": steamid,
                "include_appinfo": 1,
                "include_played_free_games": 1,
                "format": "json",
            },
            cache_key=f"games:{steamid}",
            ttl=21_600,
        )
        games = (data or {}).get("response", {}).get("games")
        if games is None:
            raise PrivateProfile("game details are private")
        return games

    async def friend_ids(self, steamid: str, limit: int = 6) -> list[str]:
        try:
            data = await self._get_json(
                f"{STEAM_API}/ISteamUser/GetFriendList/v1/",
                {"key": self.key, "steamid": steamid, "relationship": "friend"},
                cache_key=f"friends:{steamid}",
                ttl=21_600,
            )
            friends = (data or {}).get("friendslist", {}).get("friends", []) or []
            return [f.get("steamid") for f in friends if f.get("steamid")][:limit]
        except SteamError:
            return []

    # --------------------------------------------------------------- store

    async def app_details(self, appid: int, lang: str = "english") -> Optional[dict[str, Any]]:
        """Store metadata for one app. Returns None for delisted / unknown apps."""
        try:
            data = await self._get_json(
                f"{STORE_API}/api/appdetails",
                {"appids": appid, "cc": "us", "l": lang},
                cache_key=f"app:{appid}:{lang}",
                ttl=7 * 86_400,
            )
        except SteamError:
            return None
        node = (data or {}).get(str(appid)) or {}
        if not node.get("success"):
            return None
        return node.get("data") or None

    async def app_details_many(
        self, appids: Iterable[int], lang: str = "english", limit: int = 40
    ) -> dict[int, Optional[dict[str, Any]]]:
        unique = list(dict.fromkeys(int(a) for a in appids))[:limit]
        results = await asyncio.gather(
            *(self.app_details(appid, lang) for appid in unique),
            return_exceptions=True,
        )
        out: dict[int, Optional[dict[str, Any]]] = {}
        for appid, result in zip(unique, results):
            out[appid] = None if isinstance(result, BaseException) else result
        return out

    # ---------------------------------------------------------- achievements

    async def player_achievements(self, steamid: str, appid: int, lang: str = "english") -> Optional[dict[str, Any]]:
        try:
            data = await self._get_json(
                f"{STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/",
                {"key": self.key, "steamid": steamid, "appid": appid, "l": lang},
                cache_key=f"ach:{steamid}:{appid}:{lang}",
                ttl=21_600,
            )
        except SteamError:
            return None
        stats = (data or {}).get("playerstats") or {}
        if not stats.get("success"):
            return None
        return stats

    async def global_achievement_percentages(self, appid: int) -> dict[str, float]:
        try:
            data = await self._get_json(
                f"{STEAM_API}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/",
                {"gameid": appid},
                cache_key=f"achglobal:{appid}",
                ttl=3 * 86_400,
            )
        except SteamError:
            return {}
        rows = (data or {}).get("achievementpercentages", {}).get("achievements", []) or []
        out: dict[str, float] = {}
        for row in rows:
            try:
                out[str(row.get("name"))] = float(row.get("percent") or 0)
            except (TypeError, ValueError):
                continue
        return out

    # ------------------------------------------------------------ inventory

    async def inventory(self, steamid: str, lang: str = "english") -> dict[str, Any]:
        """Public inventory for CS2 / Dota 2 / TF2 / Rust with market estimates.

        The community inventory endpoint is the same one the Steam website
        uses; it needs browser-like headers and a Referer. A 403 means the
        inventory is private, which we report separately from “empty”.
        """
        games = (
            (730, 2, "CS2"),
            (570, 2, "Dota 2"),
            (440, 2, "TF2"),
            (252490, 2, "Rust"),
        )
        candidates: list[dict[str, Any]] = []
        total_items = 0
        hidden = False

        for appid, context, label in games:
            headers = dict(BROWSER_HEADERS)
            headers["Referer"] = f"{COMMUNITY_API}/profiles/{steamid}/inventory/"
            try:
                data = await self._get_json(
                    f"{COMMUNITY_API}/inventory/{steamid}/{appid}/{context}",
                    {"l": lang, "count": 1000},
                    cache_key=f"inv:{steamid}:{appid}",
                    ttl=3_600,
                    headers=headers,
                )
            except SteamError as exc:
                if getattr(exc, "status", 0) in (401, 403):
                    hidden = True
                continue
            if not isinstance(data, dict):
                continue
            if data.get("success") is False:
                hidden = True
                continue
            if not data.get("success"):
                continue

            descriptions = data.get("descriptions") or []
            assets = data.get("assets") or []
            total_items += int(data.get("total_inventory_count") or len(assets))
            if not descriptions:
                continue

            counts: dict[str, int] = {}
            for asset in assets:
                key = str(asset.get("classid"))
                counts[key] = counts.get(key, 0) + 1

            ranked = sorted(descriptions, key=self._rarity_score, reverse=True)
            for desc in ranked[:4]:
                candidates.append(
                    {
                        "appid": appid,
                        "game": label,
                        "name": desc.get("market_hash_name") or desc.get("name") or "Item",
                        "count": counts.get(str(desc.get("classid"))) or 1,
                    }
                )

        # Price at most six items, all at once, and ignore individual failures.
        top = candidates[:6]
        prices = await asyncio.gather(
            *(self.market_price(item["appid"], item["name"]) for item in top),
            return_exceptions=True,
        )

        out: list[dict[str, Any]] = []
        for item, price in zip(top, prices):
            if isinstance(price, BaseException) or price is None:
                continue
            out.append(
                {
                    "name": item["name"],
                    "game": item["game"],
                    "price": round(float(price), 2),
                    "count": item["count"],
                }
            )
        out.sort(key=lambda item: item.get("price") or 0, reverse=True)
        return {
            "items": out,
            "hidden": bool(hidden and not out),
            "total": total_items,
        }

    @staticmethod
    def _rarity_score(desc: dict[str, Any]) -> int:
        haystack = " ".join(
            str(desc.get(k, "")) for k in ("type", "name", "market_hash_name", "rarity")
        ).lower()
        score = 0
        for needle, weight in (
            ("covert", 50),
            ("exceedingly rare", 60),
            ("rare special", 60),
            ("immortal", 45),
            ("arcana", 45),
            ("unusual", 40),
            ("legendary", 30),
            ("mythical", 20),
            ("★", 55),
            ("factory new", 10),
        ):
            if needle in haystack:
                score += weight
        if desc.get("tradable"):
            score += 5
        return score

    async def market_price(self, appid: int, market_hash_name: str) -> Optional[float]:
        try:
            data = await self._get_json(
                f"{STORE_API}/market/priceoverview/",
                {
                    "appid": appid,
                    "currency": 1,
                    "market_hash_name": market_hash_name,
                },
                cache_key=f"market:{appid}:{market_hash_name}",
                ttl=86_400,
                headers={
                    **BROWSER_HEADERS,
                    "Referer": f"{COMMUNITY_API}/market/listings/{appid}",
                },
            )
        except SteamError:
            return None
        if not isinstance(data, dict) or not data.get("success"):
            return None
        raw = data.get("lowest_price") or data.get("median_price") or ""
        return parse_money(raw)


def parse_money(raw: str) -> Optional[float]:
    """'$1,234.56' / '1 234,56€' / '$12.34' -> float."""
    if not raw:
        return None
    cleaned = re.sub(r"[^\d.,]", "", str(raw))
    if not cleaned:
        return None
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        if cleaned.count(",") == 1 and len(cleaned.split(",")[-1]) <= 2:
            cleaned = cleaned.replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return None

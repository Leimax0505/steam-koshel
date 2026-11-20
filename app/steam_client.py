"""Steam Koshel — thin, resilient client for the public Steam Web API.

Only official endpoints (plus the public store/community JSON that Steam
itself uses on the web). No scraping of private data, no passwords.

All responses are cached through `app.cache.Cache`, so repeated lookups of
the same profile cost nothing and stay inside Steam rate limits.
"""

from __future__ import annotations

import asyncio
import re
import time
from email.utils import parsedate_to_datetime
from typing import Any, Iterable, Optional
from xml.etree import ElementTree

import httpx

from .cache import Cache

STEAM_API = "https://api.steampowered.com"
STORE_API = "https://store.steampowered.com"
COMMUNITY_API = "https://steamcommunity.com"

NEWS_FEED_TTL = 15 * 60
# Big, always-updating pages — their news makes the top marquee feel alive.
TOP_NEWS_APPS = (730, 570, 1172470, 271590)  # CS2, Dota 2, Apex, GTA V

# Games offered in the top news feed (and used as the default set). The list
# is deliberately broad so the marquee never runs out of fresh headlines.
NEWS_APPS: tuple[tuple[int, str], ...] = (
    (730, "Counter-Strike 2"),
    (570, "Dota 2"),
    (252490, "Rust"),
    (271590, "Grand Theft Auto V"),
    (578080, "PUBG: BATTLEGROUNDS"),
    (1172470, "Apex Legends"),
    (440, "Team Fortress 2"),
    (1091500, "Cyberpunk 2077"),
)

# Profile media (animated avatar / wallpaper) is purely decorative — a short
# timeout keeps it from ever slowing down the main profile analysis.
MEDIA_TIMEOUT = 4.0

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
}

# Public community pages are personalised by language, so ask for Russian.
HTML_HEADERS = {
    "User-Agent": BROWSER_HEADERS["User-Agent"],
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
}

MEDIA_URL_RE = re.compile(r"https?://[^\s\"'<>]+?\.(?:webm|mp4|gif|jpg|jpeg|png)(?:\?[^\s\"'<>]*)?", re.I)
HTML_MEDIA_RE = re.compile(r"<(?:source|img)\b[^>]*\bsrc=[\"']([^\"']+)[\"']", re.I)
BG_URL_RE = re.compile(r"background-image\s*:\s*url\(\s*['\"]?([^'\")]+)", re.I)
CDN_HOSTS = ("steamstatic.com", "akamaihd.net", "steamcommunity.com")

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
        timeout: float = 16.0,
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
                    url, params=params, timeout=timeout, headers=headers
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
        headers: dict[str, str] | None = None,
        timeout: float = 16.0,
    ) -> str:
        """Fetch a public community page once and keep the HTML in cache."""
        fresh = self.cache.get(cache_key)
        if isinstance(fresh, str):
            return fresh
        try:
            async with self._semaphore:
                response = await self.http.get(
                    url,
                    params=params or {},
                    timeout=timeout,
                    headers=headers or HTML_HEADERS,
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
                timeout=MEDIA_TIMEOUT,
            )
            url = self._first_media(data, ("webm", "mp4", "gif"))
            if url:
                return url
        except SteamError:
            pass

        page = await self._profile_page(steamid)
        found = (
            self._html_class_media(page, "playerAvatarAutoSizeInner", ("webm", "mp4"))
            or self._html_class_media(page, "playerAvatarAutoSizeInner", ("gif",))
            or self._html_class_media(page, "playerAvatarAutoSizeInner", ("png",))
            or self._html_class_media(page, "playerAvatar", ("webm", "mp4", "gif"))
        )
        if found:
            return found

        # The hover mini-profile renders the same animated avatar for logged-out
        # visitors and is a cheap second chance when the profile page is thin.
        mini = await self._miniprofile_page(steamid)
        return (
            self._html_class_media(mini, "playerAvatarAutoSizeInner", ("webm", "mp4"))
            or self._html_class_media(mini, "playerAvatar", ("webm", "mp4"))
            or self._html_class_media(mini, "playerAvatarAutoSizeInner", ("gif", "png"))
            or self._html_class_media(mini, "playerAvatar", ("gif", "png"))
        )

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
                timeout=MEDIA_TIMEOUT,
            )
            image = self._first_media(data, ("jpg", "jpeg", "png", "gif"))
            movie = self._first_media(data, ("webm", "mp4"))
        except SteamError:
            pass

        # The widget is premium-only: fall back to the public profile page,
        # where the same CDN links are rendered for every account.
        page = "" if (image and movie) else await self._profile_page(steamid)
        if page:
            if not movie:
                movie = self._html_class_media(page, "profile_animated_background", ("mp4", "webm"))
            if not image:
                image = self._html_background_image(page)
            if not movie:
                movie = self._html_class_media(page, "profile_animated_background", ("gif",))
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

    async def _profile_page(self, steamid: str) -> str:
        """The public profile HTML, cached just long enough for one lookup."""
        try:
            return await self._get_text(
                f"{COMMUNITY_API}/profiles/{steamid}/",
                {"l": "russian"},
                cache_key=f"profile-html:{steamid}",
                ttl=15 * 60,
                timeout=MEDIA_TIMEOUT,
            )
        except SteamError:
            return ""

    @staticmethod
    def _account_id(steamid: str) -> str:
        """SteamID64 -> 32-bit account id used by the mini-profile endpoint."""
        try:
            return str(int(steamid) - 76_561_197_960_265_728)
        except (TypeError, ValueError):
            return ""

    async def _miniprofile_page(self, steamid: str) -> str:
        """The hover mini-profile HTML — a second source for avatars / walls."""
        account = self._account_id(steamid)
        if not account:
            return ""
        try:
            return await self._get_text(
                f"{COMMUNITY_API}/miniprofile/{account}/",
                cache_key=f"miniprofile:{steamid}",
                ttl=15 * 60,
                timeout=MEDIA_TIMEOUT,
            )
        except SteamError:
            return ""

    @staticmethod
    def _clean_url(raw: str) -> str:
        return raw.replace("\\/", "/").replace("&amp;", "&").strip()

    @staticmethod
    def _is_cdn(url: str) -> bool:
        host = url.split("//", 1)[-1].split("/", 1)[0].lower()
        return any(host == cdn or host.endswith("." + cdn) for cdn in CDN_HOSTS)

    @classmethod
    def _html_class_media(cls, page: str, marker: str, extensions: tuple[str, ...]) -> str:
        """First `<source>`/`<img>` URL inside the HTML block carrying `marker`."""
        if not page:
            return ""
        for anchor in re.finditer(re.escape(marker), page):
            block = page[anchor.start(): anchor.start() + 4_000]
            for tag in HTML_MEDIA_RE.finditer(block):
                url = cls._clean_url(tag.group(1))
                clean = url.split("?")[0].lower()
                if cls._is_cdn(url) and any(clean.endswith("." + ext) for ext in extensions):
                    return url
        return ""

    @classmethod
    def _html_background_image(cls, page: str) -> str:
        """Static wallpaper from `background-image: url(...)` on the profile."""
        if not page:
            return ""
        for marker in (
            "no_header profile_page",
            "profile_background_image_content",
            "profile_page_primary_bg",
            "has_profile_background",
            "profile_background_image_url",
            "background_image",
        ):
            anchor = page.find(marker)
            if anchor < 0:
                continue
            chunk = page[anchor: anchor + 4_000]
            match = BG_URL_RE.search(chunk)
            if match:
                url = cls._clean_url(match.group(1))
                if cls._is_cdn(url):
                    return url
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

    # ---------------------------------------------------------------- feed

    async def news_rss(self, limit: int = 10) -> list[dict[str, Any]]:
        """Official Steam store news RSS (releases and announcements)."""
        try:
            text = await self._get_text(
                f"{STORE_API}/feeds/news.xml",
                cache_key="feed:steam-news-rss",
                ttl=NEWS_FEED_TTL,
            )
        except SteamError:
            return []
        return self._parse_rss(text, "news", limit=limit)

    async def special_deals(self) -> list[dict[str, Any]]:
        """Current store specials via the JSON the Steam front page uses."""
        try:
            data = await self._get_json(
                f"{STORE_API}/api/featuredcategories",
                {"cc": "us", "l": "english"},
                cache_key="feed:steam-specials",
                ttl=NEWS_FEED_TTL,
            )
        except SteamError:
            return []

        items: list[dict[str, Any]] = []
        for row in ((data or {}).get("specials") or {}).get("items", [])[:10]:
            appid = row.get("id")
            if not appid:
                continue
            items.append(
                {
                    "kind": "deal",
                    "title": row.get("name") or "Steam special",
                    "url": f"{STORE_API}/app/{appid}/",
                    "appid": int(appid),
                    "discount": int(row.get("discount_percent") or 0),
                    "price": int(row.get("final_price") or 0),
                    "original": int(row.get("original_price") or 0),
                    "image": row.get("header_image") or "",
                    "ts": 0,
                }
            )
        return items

    async def _news_one(self, appid: int, per_app: int) -> list[dict[str, Any]]:
        """Headlines for one app via the official ISteamNews endpoint."""
        try:
            data = await self._get_json(
                f"{STEAM_API}/ISteamNews/GetNewsForApp/v2/",
                {"appid": int(appid), "count": per_app, "maxlength": 220, "format": "json"},
                cache_key=f"feed:app-news:{int(appid)}:{per_app}",
                ttl=NEWS_FEED_TTL,
            )
        except SteamError:
            return []
        out: list[dict[str, Any]] = []
        for row in (data or {}).get("appnews", {}).get("newsitems", []):
            title = (row.get("title") or "").strip()
            url = (row.get("url") or "").strip()
            if not title or not url:
                continue
            out.append(
                {
                    "kind": "game",
                    "title": title,
                    "url": url,
                    "source": row.get("feedlabel") or row.get("feedname") or "Steam",
                    "ts": int(row.get("date") or 0),
                }
            )
        return out

    async def app_news(self, appids: Iterable[int] = TOP_NEWS_APPS, per_app: int = 2) -> list[dict[str, Any]]:
        """Fresh news for the biggest games through ISteamNews."""
        ids = [int(appid) for appid in appids]
        if not ids:
            return []
        chunks = await asyncio.gather(*(self._news_one(appid, per_app) for appid in ids), return_exceptions=True)
        items: list[dict[str, Any]] = []
        for chunk in chunks:
            if isinstance(chunk, list):
                items.extend(chunk)
        return items

    async def steam_news(self, appid: Optional[int] = None) -> dict[str, Any]:
        """Cached news feed for the top marquee with an optional game filter.

        Without a filter it merges the official Steam store RSS (store /
        client updates) with ISteamNews headlines for the eight biggest
        games, then interleaves them by source so the same game never shows
        up twice in a row. Cached for fifteen minutes.
        """
        if appid:
            selected = tuple(a for a in NEWS_APPS if a[0] == int(appid)) or ((int(appid), str(int(appid))),)
            per_app = 12
        else:
            selected = NEWS_APPS
            per_app = 8
        labels = {aid: name for aid, name in selected}
        ids = [aid for aid, _ in selected]

        chunks = await asyncio.gather(
            *(self._news_one(aid, per_app) for aid in ids),
            return_exceptions=True,
        )
        groups: list[list[dict[str, Any]]] = []
        for aid, chunk in zip(ids, chunks):
            if not isinstance(chunk, list) or not chunk:
                continue
            rows = sorted(chunk, key=lambda row: row.get("ts") or 0, reverse=True)
            groups.append([{**row, "appid": aid, "game": labels.get(aid, str(aid))} for row in rows])

        # The store-wide RSS leads the feed when no single game was requested.
        if not appid:
            rss = await self.news_rss(limit=20)
            if rss:
                groups.insert(0, [{**row, "appid": 0, "game": "Steam"} for row in rss])

        items = self._interleave(groups)
        return {
            "items": items[:60],
            "apps": [{"appid": aid, "name": name} for aid, name in NEWS_APPS],
            "updated_at": int(time.time()),
        }

    @staticmethod
    def _interleave(groups: list[list[dict[str, Any]]], limit: int = 60) -> list[dict[str, Any]]:
        """Round-robin across sources, skipping duplicate URLs."""
        out: list[dict[str, Any]] = []
        seen: set[str] = set()
        depth = max((len(group) for group in groups), default=0)
        for index in range(depth):
            for group in groups:
                if index >= len(group):
                    continue
                row = group[index]
                url = row.get("url")
                if not url or url in seen:
                    continue
                seen.add(url)
                out.append(row)
                if len(out) >= limit:
                    return out
        return out

    async def home_feed(self) -> dict[str, Any]:
        """Deals first, then store news, then big-game headlines."""
        deals, store_news, game_news = await asyncio.gather(
            self.special_deals(),
            self.news_rss(),
            self.app_news(),
            return_exceptions=True,
        )

        def rows(value: Any) -> list[dict[str, Any]]:
            return value if isinstance(value, list) else []

        merged = rows(deals) + rows(store_news) + rows(game_news)
        seen: set[str] = set()
        items: list[dict[str, Any]] = []
        for item in merged:
            url = item.get("url")
            if not url or url in seen:
                continue
            seen.add(url)
            items.append(item)

        return {"items": items[:24], "updated_at": int(time.time())}

    @staticmethod
    def _parse_rss(text: str, kind: str, limit: int = 10) -> list[dict[str, Any]]:
        try:
            root = ElementTree.fromstring(text)
        except ElementTree.ParseError:
            return []
        items: list[dict[str, Any]] = []
        for node in root.iter("item"):
            title = (node.findtext("title") or "").strip()
            link = (node.findtext("link") or "").strip()
            if not title or not link:
                continue
            ts = 0
            pub = (node.findtext("pubDate") or "").strip()
            if pub:
                try:
                    ts = int(parsedate_to_datetime(pub).timestamp())
                except (TypeError, ValueError):
                    ts = 0
            items.append(
                {"kind": kind, "title": title, "url": link, "source": "Steam", "ts": ts}
            )
            if len(items) >= limit:
                break
        return items

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
                    {"l": lang, "count": 75},
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

# SPDX-License-Identifier: AGPL-3.0-or-later

"""Sanitized Jellyfin sessions using Jellyfin for Kodi's saved connection."""

import json
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

import xbmcvfs
import xbmcaddon


_CREDENTIALS = "special://profile/addon_data/plugin.video.jellyfin/data.json"
_SESSION_TTL = 2.0
_ITEM_TTL = 60.0
_TIMEOUT = 4.0


def _text(value) -> str:
    return "" if value is None else str(value)


def _number(value, default=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _ticks(value) -> float:
    return _number(value) / 10_000_000.0


def _clock(seconds: float) -> str:
    seconds = max(0, int(seconds or 0))
    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return (f"{hours}:{minutes:02d}:{seconds:02d}" if hours
            else f"{minutes}:{seconds:02d}")


def _first_stream(streams, kind: str, index=None) -> dict:
    candidates = [stream for stream in streams
                  if _text(stream.get("Type")).lower() == kind.lower()]
    if index is not None:
        for stream in candidates:
            if stream.get("Index") == index:
                return stream
    return candidates[0] if candidates else {}


def _channel_label(audio: dict) -> str:
    channels = audio.get("Channels")
    if channels:
        common = {1: "1.0", 2: "2.0", 6: "5.1", 8: "7.1"}
        try:
            return common.get(int(channels), _text(channels))
        except (TypeError, ValueError):
            pass
    return _text(audio.get("ChannelLayout"))


def _dv_detail(item: dict, video: dict) -> str:
    profile = video.get("DvProfile")
    compatibility = video.get("DvBlSignalCompatibilityId")
    tags = {str(tag).lower() for tag in (item.get("Tags") or [])}
    if profile == 7:
        if "dolby vision fel" in tags:
            return "Profile 7 (FEL)"
        if "dolby vision mel" in tags:
            return "Profile 7 (MEL)"
        return "Profile 7"
    if profile is not None:
        suffix = (f".{compatibility}" if profile == 8 and compatibility is not None
                  else "")
        return f"Profile {profile}{suffix}"
    return ""


def _hdr_label(item: dict, video: dict) -> str:
    range_type = _text(video.get("VideoRangeType"))
    if video.get("DvProfile") is not None or "dovi" in range_type.lower():
        detail = _dv_detail(item, video)
        return ("Dolby Vision " + detail).strip()
    if range_type.lower() == "hdr10plus":
        return "HDR10+"
    if range_type.lower() == "hdr10":
        return "HDR10"
    if "hlg" in range_type.lower():
        return "HLG"
    return range_type


class JellyfinBridge:
    """Cached, thread-safe access to the server known by Jellyfin for Kodi."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions_at = 0.0
        self._sessions = {"available": False, "sessions": []}
        self._items = {}
        self._local_at = 0.0
        self._local = {}

    @staticmethod
    def _connection() -> dict:
        path = xbmcvfs.translatePath(_CREDENTIALS)
        try:
            with open(path, "rb") as handle:
                data = json.load(handle)
        except (OSError, ValueError, TypeError):
            return {}
        for server in data.get("Servers") or []:
            address = (server.get("address") or server.get("ManualAddress")
                       or server.get("LocalAddress") or server.get("RemoteAddress"))
            token = server.get("AccessToken")
            if address and token:
                return {
                    "address": str(address).rstrip("/"),
                    "token": str(token),
                    "user_id": _text(server.get("UserId")),
                    "name": _text(server.get("Name")),
                }
        return {}

    @staticmethod
    def _request(connection: dict, path: str, binary: bool = False):
        # Match the authenticated header used by Jellyfin for Kodi. Include
        # Token in Authorization rather than a tokenless authorization header
        # alongside a separate token header (some servers prioritize the former).
        authorization = (
            'MediaBrowser Client="TinyPPI", Device="CoreELEC", '
            'DeviceId="tinyppi-dashboard", Version="2.13.9", Token="{}"'
        ).format(quote(connection["token"], safe=""))
        request = Request(connection["address"] + path, headers={
            "Accept": "image/*" if binary else "application/json",
            "Authorization": authorization,
        })
        with urlopen(request, timeout=_TIMEOUT) as response:
            body = response.read()
            if binary:
                return body, response.headers.get_content_type()
            return json.loads(body.decode("utf-8"))

    @staticmethod
    def _failure(exc) -> dict:
        # Never return exception text: it can contain URLs or credentials.
        if isinstance(exc, HTTPError):
            return {"reason": "jellyfin_http_error", "http_status": exc.code}
        if isinstance(exc, (URLError, OSError)):
            return {"reason": "jellyfin_connection_failed"}
        return {"reason": "jellyfin_invalid_response"}

    def local_user(self) -> dict:
        """Identity of this Kodi box, never an arbitrary active server user.

        Prefer the session with this installation's jellyfin_guid. If remote
        session access fails, the name saved by Jellyfin for Kodi is still a
        useful, explicitly labelled configured-user fallback.
        """
        now = time.monotonic()
        with self._lock:
            if now - self._local_at < 10.0:
                return dict(self._local)
            connection = self._connection()
            if not connection:
                result = {"available": False, "user": "",
                          "reason": "jellyfin_for_kodi_not_configured"}
            else:
                try:
                    addon = xbmcaddon.Addon("plugin.video.jellyfin")
                    username = addon.getSetting("username").strip()
                except Exception:
                    username = ""
                try:
                    guid_path = xbmcvfs.translatePath(
                        "special://profile/addon_data/plugin.video.jellyfin/jellyfin_guid"
                    )
                    with open(guid_path, "r", encoding="utf-8") as handle:
                        device_id = handle.read().strip()
                except OSError:
                    device_id = ""
                result = {"available": True, "user": username,
                          "source": "configured", "linked": False}
                try:
                    if device_id:
                        raw = self._request(connection, "/Sessions?" +
                                            urlencode({"DeviceId": device_id}))
                        if not isinstance(raw, list):
                            raise ValueError("invalid sessions")
                        matches = [session for session in raw
                                   if session.get("DeviceId") == device_id
                                   and (not connection.get("user_id") or
                                        session.get("UserId") == connection["user_id"])
                                   and session.get("UserName")]
                        playing = [session for session in matches
                                   if session.get("NowPlayingItem")]
                        match = (playing or matches or [None])[0]
                        if match:
                            result.update(user=match["UserName"], source="session",
                                          linked=True)
                    if not result["linked"]:
                        user = self._request(connection, "/Users/Me")
                        if isinstance(user, dict) and user.get("Name"):
                            result.update(user=user["Name"], source="account", linked=True)
                except (HTTPError, URLError, OSError, ValueError, TypeError) as exc:
                    result.update(self._failure(exc))
            self._local_at = time.monotonic()
            self._local = result
            return dict(result)

    def _item(self, connection: dict, item: dict) -> dict:
        item_id = _text(item.get("Id"))
        if not item_id:
            return item
        now = time.monotonic()
        held = self._items.get(item_id)
        if held and now - held[0] < _ITEM_TTL:
            return held[1]
        user_id = connection.get("user_id")
        if not user_id:
            return item
        params = urlencode({"Fields": "MediaStreams,Genres,Tags,Overview"})
        try:
            detailed = self._request(
                connection,
                "/Users/{}/Items/{}?{}".format(quote(user_id), quote(item_id), params),
            )
        except (HTTPError, URLError, OSError, ValueError):
            return item
        self._items[item_id] = (now, detailed)
        return detailed

    def sessions(self) -> dict:
        now = time.monotonic()
        with self._lock:
            if now - self._sessions_at < _SESSION_TTL:
                return self._sessions
            connection = self._connection()
            if not connection:
                result = {"available": False, "sessions": [],
                          "reason": "jellyfin_for_kodi_not_configured"}
            else:
                try:
                    raw = self._request(connection, "/Sessions?ActiveWithinSeconds=90")
                    active = [self._session(connection, session) for session in raw
                              if session.get("NowPlayingItem")]
                    active.sort(key=lambda value: (
                        value.get("user", "").lower(),
                        value.get("device", "").lower(),
                    ))
                    result = {"available": True, "server": connection.get("name", ""),
                              "sessions": active}
                except (HTTPError, URLError, OSError, ValueError, TypeError) as exc:
                    result = {"available": True, "sessions": [],
                              **self._failure(exc)}
            self._sessions_at = now
            self._sessions = result
            return result

    def _session(self, connection: dict, session: dict) -> dict:
        base_item = session.get("NowPlayingItem") or {}
        item = self._item(connection, base_item)
        state = session.get("PlayState") or {}
        transcode = session.get("TranscodingInfo") or {}
        streams = item.get("MediaStreams") or base_item.get("MediaStreams") or []
        video = _first_stream(streams, "Video")
        audio = _first_stream(streams, "Audio", state.get("AudioStreamIndex"))
        subtitle = _first_stream(streams, "Subtitle", state.get("SubtitleStreamIndex"))

        runtime = _ticks(item.get("RunTimeTicks") or base_item.get("RunTimeTicks"))
        position = _ticks(state.get("PositionTicks"))
        percent = (position / runtime * 100.0) if runtime else 0.0
        method = _text(session.get("PlayMethod") or state.get("PlayMethod"))
        if not method:
            method = "Transcode" if transcode else "DirectPlay"
        title = _text(item.get("Name") or base_item.get("Name"))
        series = _text(item.get("SeriesName") or base_item.get("SeriesName"))
        season_number = item.get("ParentIndexNumber", base_item.get("ParentIndexNumber"))
        episode_number = item.get("IndexNumber", base_item.get("IndexNumber"))
        episode = ""
        if series:
            episode = "S{:02d}E{:02d}".format(int(season_number or 0), int(episode_number or 0))

        image_item = (_text(item.get("SeriesId")) if series else _text(item.get("Id")))
        if not image_item:
            image_item = _text(base_item.get("Id"))
        backdrop_item = (_text(item.get("ParentBackdropItemId")) or
                         _text(item.get("SeriesId")) or _text(item.get("Id")))

        bitrate = transcode.get("Bitrate") or video.get("BitRate") or item.get("Bitrate")
        framerate = (transcode.get("Framerate") or video.get("RealFrameRate")
                     or video.get("AverageFrameRate"))
        reasons = transcode.get("TranscodeReasons") or []
        if isinstance(reasons, str):
            reasons = [part.strip() for part in reasons.split(",") if part.strip()]

        return {
            "id": _text(session.get("Id")),
            "user": _text(session.get("UserName")) or "Unknown user",
            "client": _text(session.get("Client")),
            "device": _text(session.get("DeviceName")),
            "paused": bool(state.get("IsPaused")),
            "muted": bool(state.get("IsMuted")),
            "method": method,
            "title": title,
            "series": series,
            "episode": episode,
            "year": item.get("ProductionYear") or base_item.get("ProductionYear"),
            "genres": item.get("Genres") or base_item.get("Genres") or [],
            "image_item": image_item,
            "backdrop_item": backdrop_item,
            "position": _clock(position),
            "remaining": _clock(max(0, runtime - position)),
            "duration": _clock(runtime),
            "progress": round(max(0, min(100, percent)), 1),
            "video": {
                "codec": _text(transcode.get("VideoCodec") or video.get("Codec")),
                "profile": _text(video.get("Profile")),
                "width": transcode.get("Width") or video.get("Width"),
                "height": transcode.get("Height") or video.get("Height"),
                "bit_depth": video.get("BitDepth"),
                "frame_rate": framerate,
                "range": _hdr_label(item, video),
                "direct": bool(transcode.get("IsVideoDirect")) if transcode else method != "Transcode",
            },
            "audio": {
                "codec": _text(transcode.get("AudioCodec") or audio.get("Codec")),
                "channels": _channel_label(audio),
                "language": _text(audio.get("Language")),
                "title": _text(audio.get("DisplayTitle") or audio.get("Title")),
                "sample_rate": audio.get("SampleRate"),
                "bitrate": audio.get("BitRate"),
                "direct": bool(transcode.get("IsAudioDirect")) if transcode else method != "Transcode",
            },
            "subtitle": {
                "codec": _text(subtitle.get("Codec")),
                "language": _text(subtitle.get("Language")),
                "title": _text(subtitle.get("DisplayTitle") or subtitle.get("Title")),
                "external": bool(subtitle.get("IsExternal")),
            },
            "container": _text(transcode.get("Container") or item.get("Container")),
            "bitrate": round(_number(bitrate) / 1_000_000.0, 1) if bitrate else None,
            "reasons": reasons,
        }

    def artwork(self, item_id: str, kind: str):
        connection = self._connection()
        if not connection or not item_id or kind not in ("primary", "backdrop"):
            return None
        image = "Primary" if kind == "primary" else "Backdrop/0"
        width = 520 if kind == "primary" else 1600
        path = "/Items/{}/Images/{}?{}".format(
            quote(item_id), image, urlencode({"maxWidth": width, "quality": 88})
        )
        try:
            return self._request(connection, path, binary=True)
        except (HTTPError, URLError, OSError):
            return None


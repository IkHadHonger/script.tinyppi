# SPDX-License-Identifier: AGPL-3.0-or-later
"""Read one selected library title, without enlarging the poster listings."""
from __future__ import annotations

from web.library import common
from web.mdblist import api_key, asking, with_mdblist
from web.ratings import details_ratings
from web.values import Json, Unchecked, library_id, plain_text
from web.whatson import api_key as whatson_key
from web.whatson import with_whatson

_KINDS = {
    "movie": ("VideoLibrary.GetMovieDetails", "movieid", "moviedetails"),
    "tvshow": ("VideoLibrary.GetTVShowDetails", "tvshowid", "tvshowdetails"),
    "episode": ("VideoLibrary.GetEpisodeDetails", "episodeid", "episodedetails"),
}


def overview(kind: str, item_id: Unchecked) -> dict[str, object] | None:
    """Return the selected title's overview, or None for an unknown title."""
    wanted = library_id(item_id)
    if kind not in _KINDS or not wanted:
        return None
    method, id_key, result_key = _KINDS[kind]
    properties = ["title", "plot", "ratings", "userrating", "cast", "uniqueid"]
    properties += ["genre", "studio", "mpaa"] if kind == "tvshow" else ["director"]
    if kind == "movie":
        properties += ["tagline", "mpaa", "top250", "genre", "studio"]
    if kind == "episode":
        properties += ["tvshowid"]
    answer = common.rpc(method, {id_key: wanted, "properties": properties})
    result = answer.get("result")
    details = result.get(result_key) if isinstance(result, dict) else None
    if not isinstance(details, dict) or details.get(id_key) != wanted:
        return None
    parent: Json = details
    if kind == "episode" and (show_id := library_id(details.get("tvshowid"))):
        show = common.rpc("VideoLibrary.GetTVShowDetails", {
            "tvshowid": show_id, "properties": ["mpaa", "uniqueid"]}).get("result")
        if isinstance(show, dict) and isinstance(show.get("tvshowdetails"), dict):
            parent = show["tvshowdetails"]
    ratings = details_ratings(details, kind, parent)
    key = api_key()
    ratings = with_mdblist(ratings, key=key)
    if not asking(key, ratings["ids"]):
        ratings = with_whatson(ratings, key=whatson_key())
    cast = details.get("cast")
    names = [str(entry.get("name") or "")[:160] for entry in cast
             if isinstance(entry, dict) and entry.get("name")] if isinstance(cast, list) else []
    return {
        "title": common.clean_title(details),
        "plot": plain_text(str(details.get("plot") or ""))[:30000],
        "tagline": plain_text(str(details.get("tagline") or ""))[:1000],
        "directors": _names(details.get("director")),
        "cast": names[:20], "cast_more": len(names) > 20,
        **{name: value for name, value in ratings.items() if name != "ids"},
    }


def _names(value: object) -> list[str]:
    return [plain_text(str(name))[:160] for name in value[:30]
            if isinstance(name, str) and name.strip()] if isinstance(value, list) else []

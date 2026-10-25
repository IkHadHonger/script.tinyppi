"""Selection details must belong to the library item, never the player."""
import json

import pytest

from dashboard_server import request
from web import library
from web.library import details


@pytest.mark.parametrize(("kind", "id_key", "result_key"), [
    ("movie", "movieid", "moviedetails"),
    ("tvshow", "tvshowid", "tvshowdetails"),
    ("episode", "episodeid", "episodedetails"),
])
def test_selected_title_details(monkeypatch, kind, id_key, result_key):
    calls = []

    def rpc(method, params):
        calls.append((method, params))
        if params.get("tvshowid") == 7:
            return {"result": {"tvshowdetails": {"tvshowid": 7, "mpaa": "FSK 12"}}}
        return {"result": {result_key: {
            id_key: 4, "title": "Selected", "plot": "[B]Story[/B]", "tagline": "Slogan",
            "ratings": {"imdb": {"rating": 8.4}}, "mpaa": "FSK 12",
            "director": ["Director"], "cast": [{"name": f"Actor {i}"} for i in range(25)],
            "tvshowid": 7 if kind == "episode" else 4,
        }}}

    monkeypatch.setattr(details.common, "rpc", rpc)
    monkeypatch.setattr(details, "with_mdblist", lambda ratings, key: ratings)
    monkeypatch.setattr(details, "with_whatson", lambda ratings, key: ratings)
    result = details.overview(kind, 4)
    assert result["title"] == "Selected"
    assert result["plot"] == "Story"
    assert result["ratings"][0]["rating"] == 8.4
    assert result["mpaa"] == "FSK 12"
    assert result["cast_more"] and len(result["cast"]) == 20
    assert "ids" not in result
    assert all(method.startswith("VideoLibrary.") for method, _ in calls)
    assert "plot" in calls[0][1]["properties"]


def test_unknown_and_invalid_titles(monkeypatch):
    monkeypatch.setattr(details.common, "rpc", lambda *args: {"error": "missing"})
    for kind, value in [("movie", 4), ("movie", -1), ("other", 4), ("movie", True)]:
        assert details.overview(kind, value) is None


def test_overview_reuses_configured_rating_keys(monkeypatch):
    monkeypatch.setattr(details.common, "rpc", lambda *args: {
        "result": {"moviedetails": {"movieid": 1, "title": "Film"}}})
    seen = []
    monkeypatch.setattr(details, "api_key", lambda: "existing-mdblist-key")
    monkeypatch.setattr(details, "whatson_key", lambda: "existing-whatson-key")
    monkeypatch.setattr(details, "with_mdblist", lambda ratings, key: seen.append(key) or ratings)
    monkeypatch.setattr(details, "with_whatson", lambda ratings, key: seen.append(key) or ratings)
    monkeypatch.setattr(details, "asking", lambda *args: False)
    result = details.overview("movie", 1)
    assert seen == ["existing-mdblist-key", "existing-whatson-key"]
    assert "existing-mdblist-key" not in json.dumps(result)


def test_overview_route_checks_access_and_selection(dashboard, monkeypatch):
    monkeypatch.setattr(library, "overview", lambda kind, value: {"plot": kind + value})
    status, _, raw = request(dashboard, "/api/overview?movieid=4")
    assert status == 200 and json.loads(raw)["plot"] == "movie4"
    for query in ["", "movieid=1&tvshowid=2"]:
        assert request(dashboard, "/api/overview?" + query)[0] == 400
    dashboard.allow_control = False
    assert request(dashboard, "/api/overview?movieid=4")[0] == 403


def test_overview_missing_and_failed_reads(dashboard, monkeypatch):
    monkeypatch.setattr(library, "overview", lambda *args: None)
    assert request(dashboard, "/api/overview?tvshowid=5")[0] == 404

    def broken(*args):
        raise RuntimeError("database locked")
    monkeypatch.setattr(library, "overview", broken)
    assert request(dashboard, "/api/overview?episodeid=5")[0] == 503

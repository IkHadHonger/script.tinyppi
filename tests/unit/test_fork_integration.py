"""Runtime regressions for the Jellyfin fork after upstream module splits."""

import json

import xbmc
from dashboard_server import request
from web import snapshot
from web.dashboard_trust import page_policy, trusted_origins


def test_programme_art_follows_current_live_title():
    xbmc.CONDITIONS["PVR.IsPlayingTV"] = True
    xbmc.INFO.update({"PVR.EpgEventIcon": "/programme.jpg",
                      "Player.Art(poster)": "/channel.jpg"})
    assert snapshot.art_path("poster") == "/programme.jpg"
    first = snapshot._art_tags()
    xbmc.INFO["PVR.EpgEventIcon"] = "/next.jpg"
    assert first != snapshot._art_tags()


def test_trusted_framing_survives_upstream_http_changes():
    origins = "http://100.84.251.68:8099 http://192.168.1.15:8099"
    assert len(trusted_origins(origins, strict=True)) == 2
    policy = page_policy("frame-ancestors 'none'", origins)
    assert "frame-ancestors 'self'" in policy
    assert "frame-src 'self'" in policy
    assert trusted_origins("https://public.example") == []


def test_local_jellyfin_identity_endpoint(dashboard, monkeypatch):
    monkeypatch.setattr(dashboard.jellyfin, "local_user",
                        lambda: {"available": True, "user": "Eric"})
    status, _, body = request(dashboard, "/api/jellyfin/local")
    assert status == 200
    assert json.loads(body)["user"] == "Eric"

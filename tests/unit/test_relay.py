"""Narrow relay boundaries: credentials, targets, response types, and auth."""

import io
import json
from types import SimpleNamespace
from urllib.parse import urlencode

import pytest

import xbmcaddon
from dashboard_server import TOKEN, request
from web import relay

ORIGIN = "http://100.76.102.114:8099"


@pytest.fixture
def bridge(tmp_path):
    return relay.Relay(tmp_path / "relay.json")


@pytest.mark.parametrize("origin", ["http://127.0.0.1:8099", "http://192.168.1.1:8099",
    "http://example.com:8099", "http://100.76.102.114:80", "http://100.76.102.114:8099/",
    "http://user@100.76.102.114:8099", "https://100.76.102.114:8099",
    "http://100.76.102.114:8099/path", "http://8.8.8.8:8099"])
def test_reject_unsafe_targets(origin):
    assert not relay.valid_origin(origin, [origin])


@pytest.mark.parametrize("path", ["/", "/api/command", "/api/stream", "/api/library",
    "http://100.76.102.114:8099/api/state", "//localhost/api/state", "/api/state?token=secret",
    "/api/state#fragment", "/api/art?movieid=1", "/api/state\r\nInjected: yes"])
def test_reject_non_read_routes(path):
    assert not relay.valid_path(path)


def test_save_is_explicit_and_scoped(bridge):
    with pytest.raises(ValueError):
        bridge.save(ORIGIN, "REMOTE11", [])
    bridge.save(ORIGIN, "REMOTE11", [ORIGIN])
    assert bridge.origins([ORIGIN]) == [ORIGIN]
    assert bridge.origins([]) == []
    assert json.loads(bridge.path.read_text()) == {ORIGIN: "REMOTE11"}
    assert list(bridge.path.parent.glob(".relay-*")) == []
    assert bridge.read(ORIGIN, "/api/state", [])[0] == 403


def test_missing_remote_token(bridge):
    assert bridge.read(ORIGIN, "/api/state", [ORIGIN])[0] == 409


def fake_remote(monkeypatch, body=b'{"playing":true,"control":true,"vs10":{"options":[1]}}',
                status=200, content_type="application/json"):
    response = SimpleNamespace(status=status, getheader=lambda *_: content_type,
                               read1=io.BytesIO(body).read, close=lambda: None)
    calls = []

    class Connection:
        sock = None

        def __init__(self, host, port, timeout):
            calls.append((host, port, timeout))

        def connect(self):
            pass

        def request(self, method, path, headers, body=None):
            calls.append((method, path, headers) if body is None else (method, path, headers, body))

        def getresponse(self):
            return response

        def close(self):
            calls.append("closed")

    monkeypatch.setattr(relay.http.client, "HTTPConnection", Connection)
    return calls


def test_uses_only_remote_token_and_preserves_remote_permissions(bridge, monkeypatch):
    bridge.save(ORIGIN, "REMOTE11", [ORIGIN])
    calls = fake_remote(monkeypatch)
    status, body, kind = bridge.read(ORIGIN, "/api/state", [ORIGIN])
    assert status == 200 and kind == "application/json"
    assert json.loads(body) == {"playing": True, "control": True, "vs10": {"options": [1]}}
    assert calls == [("100.76.102.114", 8099, 2),
                     ("GET", "/api/state", {"X-TinyPPI-Token": "REMOTE11", "Connection": "close"}),
                     "closed"]


@pytest.mark.parametrize(("status", "kind", "body", "expected"), [
    (302, "application/json", b"{}", 502),
    (401, "application/json", b"{}", 409),
    (403, "application/json", b"{}", 403),
    (200, "text/html", b"<script>bad</script>", 502),
    (200, "application/json", b"invalid", 502),
    (200, "application/json", b"[]", 502),
    (200, "application/json", b"x" * (relay._MAX_BYTES + 1), 502),
], ids=["redirect", "unauthorized", "forbidden", "html", "invalid-json", "array", "oversized"])
def test_refuses_redirects_html_invalid_and_oversized_data(bridge, monkeypatch, status, kind, body, expected):
    bridge.save(ORIGIN, "REMOTE11", [ORIGIN])
    fake_remote(monkeypatch, body, status, kind)
    assert bridge.read(ORIGIN, "/api/state", [ORIGIN])[0] == expected


def test_relay_api_always_requires_main_token(dashboard, bridge, monkeypatch):
    dashboard.relay = bridge
    dashboard.auth_read = False
    path = "/api/relay?" + urlencode({"origin": ORIGIN, "path": "/api/state"})
    assert request(dashboard, path, token="")[0] == 401
    assert request(dashboard, path, token=TOKEN)[0] == 403  # not a main dashboard
    assert request(dashboard, "/api/relay/token", "POST",
                   {"origin": ORIGIN, "token": "REMOTE11"}, token="")[0] == 401
    assert not bridge.path.exists()


def test_main_dashboard_can_save_remote_token_without_player_control(dashboard, bridge):
    dashboard.relay = bridge
    dashboard.allow_control = False
    xbmcaddon.SETTINGS.update({"web_main_dashboard": "true", "web_dashboard_trust": ORIGIN})
    status, _, body = request(dashboard, "/api/relay/token", "POST",
                              {"origin": ORIGIN, "token": "REMOTE11"}, token=TOKEN)
    assert status == 200 and json.loads(body) == {"ok": True}
    assert "REMOTE11" not in body.decode()
    status, _, body = request(dashboard, "/api/hello", token=TOKEN)
    assert status == 200 and json.loads(body)["relay_origins"] == [ORIGIN]
    assert "REMOTE11" not in body.decode()


@pytest.mark.parametrize(("path", "payload"), [
    ("/api/command", {"action": "playpause"}),
    ("/api/command", {"action": "seek", "value": 10}),
    ("/api/command", {"action": "subtitle", "value": 1}),
    ("/api/mode", {"mode": "hdr10"}),
])
def test_control_uses_remote_token_once(bridge, monkeypatch, path, payload):
    bridge.save(ORIGIN, "REMOTE11", [ORIGIN])
    calls = fake_remote(monkeypatch, b'{"ok":true}')
    assert bridge.write(ORIGIN, path, payload, [ORIGIN])[0] == 200
    assert calls[1][:3] == ("POST", path, {"X-TinyPPI-Token": "REMOTE11",
                                          "Connection": "close", "Content-Type": "application/json"})
    assert json.loads(calls[1][3]) == payload
    assert len(calls) == 3


@pytest.mark.parametrize("path", ["/api/play", "/api/dashboard/trust", "/api/relay/control",
    "/api/session", "/api/command?token=x", "http://127.0.0.1/api/command"])
def test_write_allowlist(bridge, path):
    assert bridge.write(ORIGIN, path, {"action": "stop"}, [ORIGIN])[0] == 403


def test_control_route_requires_header_not_session_and_never_calls_local_player(dashboard, monkeypatch):
    from web import routes
    sent = []
    monkeypatch.setattr(routes, "apply_command", lambda *_: pytest.fail("local player touched"))
    monkeypatch.setattr(routes, "apply_mode", lambda *_: pytest.fail("local mode touched"))
    monkeypatch.setattr(dashboard.relay, "write", lambda *args: (
        sent.append(args) or (200, b'{"ok":true}', "application/json")))
    envelope = {"origin": ORIGIN, "path": "/api/command", "payload": {"action": "stop"}}
    assert request(dashboard, "/api/relay/control", "POST", envelope, token="")[0] == 401
    assert request(dashboard, "/api/relay/control", "POST", envelope,
                   cookie="tinyppi_session=" + dashboard.session)[0] == 401
    assert not sent
    assert request(dashboard, "/api/relay/control", "POST", envelope, token=TOKEN)[0] == 200
    assert sent[0][:3] == (ORIGIN, "/api/command", {"action": "stop"})


@pytest.mark.parametrize("status", [401, 403, 429, 500])
def test_failed_control_is_not_retried(bridge, monkeypatch, status):
    bridge.save(ORIGIN, "REMOTE11", [ORIGIN])
    calls = fake_remote(monkeypatch, b'{}', status)
    result = bridge.write(ORIGIN, "/api/command", {"action": "playpause"}, [ORIGIN])
    assert result[0] == {401: 409, 403: 403, 429: 429, 500: 502}[status]
    assert len(calls) == 3


def test_remote_disabled_controls_remain_disabled(bridge, monkeypatch):
    bridge.save(ORIGIN, "REMOTE11", [ORIGIN])
    fake_remote(monkeypatch, b'{"playing":true,"control":false}')
    assert json.loads(bridge.read(ORIGIN, "/api/state", [ORIGIN])[1])["control"] is False

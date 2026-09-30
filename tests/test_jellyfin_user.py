# SPDX-License-Identifier: AGPL-3.0-or-later
"""Verify that a local card never adopts another device's Jellyfin user."""
import importlib.util
import io
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

sys.modules.setdefault("xbmcvfs", types.SimpleNamespace(translatePath=lambda path: path))
sys.modules.setdefault("xbmcaddon", types.SimpleNamespace(
    Addon=lambda name: types.SimpleNamespace(getSetting=lambda setting: "Saved user")
))
spec = importlib.util.spec_from_file_location(
    "tinyppi_jellyfin", Path(__file__).resolve().parents[1] /
    "resources/lib/web/jellyfin.py"
)
bridge_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge_module)


class LocalUserTests(unittest.TestCase):
    def setUp(self):
        self.bridge = bridge_module.JellyfinBridge()
        self.connection = {"address": "http://example.invalid", "token": "test-token",
                           "user_id": "local-user"}
        self.bridge._connection = lambda: self.connection

    def test_other_device_same_film_does_not_supply_local_user(self):
        self.bridge._request = lambda connection, path: [
            {"DeviceId": "other-device", "UserId": "other-user", "UserName": "Other",
             "NowPlayingItem": {"Id": "same-film"}},
            {"DeviceId": "local-device", "UserId": "local-user", "UserName": "Eric",
             "NowPlayingItem": {"Id": "same-film"}},
        ]
        with patch("builtins.open", return_value=io.StringIO("local-device")):
            identity = self.bridge.local_user()
        self.assertEqual(identity["user"], "Eric")
        self.assertEqual(identity["source"], "session")
        self.assertTrue(identity["linked"])

    def test_missing_device_uses_authenticated_account_not_first_session(self):
        def request(connection, path):
            if path.startswith("/Sessions"):
                return [{"DeviceId": "other-device", "UserId": "other-user", "UserName": "Other"}]
            return {"Name": "Eric"}
        self.bridge._request = request
        with patch("builtins.open", return_value=io.StringIO("local-device")):
            identity = self.bridge.local_user()
        self.assertEqual(identity["user"], "Eric")
        self.assertEqual(identity["source"], "account")

    def test_http_error_preserves_saved_account_without_claiming_live_link(self):
        def request(connection, path):
            raise HTTPError("http://example.invalid/secret", 401, "hidden", {}, None)
        self.bridge._request = request
        with patch("builtins.open", return_value=io.StringIO("local-device")):
            identity = self.bridge.local_user()
        self.assertEqual(identity["user"], "Saved user")
        self.assertFalse(identity["linked"])
        self.assertEqual(identity["http_status"], 401)
        self.assertNotIn("secret", str(identity))
        self.assertNotIn("test-token", str(identity))

    def test_authorization_contains_token_in_same_header(self):
        class Response(io.BytesIO):
            pass
        response = Response(b'[]')
        with patch.object(bridge_module, "urlopen", return_value=response) as opener:
            self.assertEqual(self.bridge._request(self.connection, "/Sessions"), [])
        request = opener.call_args.args[0]
        self.assertIn('Token="test-token"', request.get_header("Authorization"))
        self.assertIsNone(request.get_header("X-emby-authorization"))


if __name__ == "__main__":
    unittest.main()

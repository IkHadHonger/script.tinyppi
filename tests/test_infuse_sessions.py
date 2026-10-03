"""Infuse source metadata must never masquerade as Apple TV measurements."""
import json
import unittest
from test_jellyfin_user import bridge_module


class InfuseSessionTests(unittest.TestCase):
    def setUp(self):
        self.bridge = bridge_module.JellyfinBridge()
        self.video = {"Type": "Video", "Codec": "hevc", "Width": 3840,
                      "Height": 2160, "BitDepth": 10, "DvProfile": 7,
                      "DvBlSignalCompatibilityId": 1, "RealFrameRate": 23.976}
        self.item = {"Id": "film", "Name": "Movie", "RunTimeTicks": 600000000,
                     "MediaStreams": [self.video], "Bitrate": 50000000}
        self.bridge._item = lambda connection, item: self.item
        self.session = {"Id": "a", "Client": "Infuse", "DeviceName": "Apple TV 4K",
                        "UserName": "Lorenzo", "NowPlayingItem": self.item,
                        "PlayState": {"PositionTicks": 100000000, "SubtitleStreamIndex": -1}}

    def render(self):
        return self.bridge._session({}, self.session)

    def test_hdr10_is_unconfirmed_and_missing_method_is_unknown(self):
        result = self.render()
        self.assertEqual(result["method"], "Unknown")
        self.assertEqual(result["infuse"]["source"]["range"], "Dolby Vision Profile 7")
        self.assertEqual(result["infuse"]["output"]["expected"], "HDR10-fallback verwacht")
        self.assertFalse(result["infuse"]["output"]["confirmed"])
        self.assertFalse(result["infuse"]["hardware_available"])
        self.assertEqual(result["infuse"]["source"]["subtitle"], "")

    def test_server_encoder_fps_is_not_source_or_display_fps(self):
        self.session["TranscodingInfo"] = {"VideoCodec": "h264", "Width": 1920,
                                            "Height": 1080, "Framerate": 120, "Bitrate": 8000000}
        result = self.render()["infuse"]
        self.assertEqual(result["source"]["frame_rate"], 23.976)
        self.assertEqual(result["source"]["codec"], "hevc")
        self.assertEqual(result["server"]["encoder_fps"], 120)
        self.assertEqual(result["server"]["video_codec"], "h264")
        self.assertEqual(result["output"]["expected"], "Niet gemeld")

    def test_no_apple_tv_fallback_for_other_devices_or_profiles(self):
        self.session["DeviceName"] = "iPhone"
        self.assertEqual(self.render()["infuse"]["output"]["expected"], "Niet gemeld")
        self.session["DeviceName"] = "Apple TV"
        self.video["DvProfile"] = 8
        self.assertEqual(self.render()["infuse"]["output"]["expected"], "Niet gemeld")

    def test_unknown_hdr10_base_is_only_possible(self):
        del self.video["DvBlSignalCompatibilityId"]
        self.assertEqual(self.render()["infuse"]["output"]["expected"], "HDR10-fallback mogelijk")

    def test_correct_media_source_and_track_and_no_credentials(self):
        self.item["MediaSources"] = [
            {"Id": "wrong", "MediaStreams": [{"Type": "Video", "Codec": "wrong"}]},
            {"Id": "right", "Bitrate": 90000000, "MediaStreams": [self.video,
                {"Type": "Audio", "Index": 2, "Language": "eng"},
                {"Type": "Audio", "Index": 3, "Language": "nld"}]}]
        self.session["PlayState"].update(MediaSourceId="right", AudioStreamIndex=3)
        self.session["AccessToken"] = "private-token"
        result = self.render()
        self.assertEqual(result["infuse"]["source"]["bitrate"], 90000000)
        self.assertEqual(result["infuse"]["source"]["audio_language"], "nld")
        self.assertNotIn("private-token", json.dumps(result))
        self.session["PlayState"]["AudioStreamIndex"] = 8
        self.assertEqual(self.render()["infuse"]["source"]["audio_language"], "")

    def test_kodi_sessions_have_no_infuse_hardware_or_fallback(self):
        self.session["Client"] = "Kodi"
        self.assertNotIn("infuse", self.render())

    def test_multiple_sources_without_matching_id_do_not_guess_source(self):
        self.item["MediaSources"] = [{"Id": "one"}, {"Id": "two"}]
        result = self.render()["infuse"]
        self.assertEqual(result["source"]["codec"], "")
        self.assertIsNone(result["source"]["bitrate"])
        self.assertEqual(result["output"]["expected"], "Niet gemeld")


if __name__ == "__main__":
    unittest.main()

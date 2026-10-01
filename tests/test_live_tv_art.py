"""Test artwork selection without importing Kodi-only runtime modules."""
import ast
from pathlib import Path
import unittest
import zlib

source = Path(__file__).resolve().parents[1] / 'resources/lib/web/snapshot.py'
tree = ast.parse(source.read_text(encoding='utf-8'))
selected = [node for node in tree.body if
            isinstance(node, ast.FunctionDef) and node.name in ('art_path', '_art_tags', '_is_live_tv') or
            isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == '_ART_LABELS' for t in node.targets)]
compiled = compile(ast.Module(body=selected, type_ignores=[]), str(source), 'exec')


class LiveArtTests(unittest.TestCase):
    def setUp(self):
        self.labels = {'Player.Art(poster)': 'channel-logo', 'PVR.EpgEventIcon': 'programme-poster'}
        self.live = True
        self.scope = {'info': lambda key: self.labels.get(key, ''),
                      'cond': lambda key: self.live and key == 'PVR.IsPlayingTV', 'zlib': zlib}
        exec(compiled, self.scope)

    def test_programme_art_beats_channel_logo(self):
        self.assertEqual(self.scope['art_path']('poster'), 'programme-poster')

    def test_missing_programme_art_keeps_existing_fallback(self):
        self.labels['PVR.EpgEventIcon'] = ' '
        self.assertEqual(self.scope['art_path']('poster'), 'channel-logo')

    def test_movie_art_is_unchanged(self):
        self.live = False
        self.assertEqual(self.scope['art_path']('poster'), 'channel-logo')

    def test_programme_change_refreshes_browser_art(self):
        first = self.scope['_art_tags']()['poster']
        self.labels['PVR.EpgEventIcon'] = 'next-programme-poster'
        self.assertNotEqual(first, self.scope['_art_tags']()['poster'])

    def test_fanart_is_not_replaced_by_programme_icon(self):
        self.labels['Player.Art(fanart)'] = 'background'
        self.assertEqual(self.scope['art_path']('fanart'), 'background')

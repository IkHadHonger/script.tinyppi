import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('sync_upstream', ROOT / 'tools/sync_upstream.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class SyncTests(unittest.TestCase):
    def test_only_bookkeeping_is_normalized(self):
        text = '<addon version="2.14.0" provider-name="upstream"><requires><import addon="other" version="5.0"/></requires></addon>'
        result = sync.normalize(text, {'version': '2.13.7', 'provider-name': 'upstream, fork'})
        self.assertIn('version="2.13.7"', result)
        self.assertIn('provider-name="upstream, fork"', result)
        self.assertIn('addon="other" version="5.0"', result)
        self.assertEqual(sync.version(result), (2, 13, 7))

    def test_unknown_versions_require_review(self):
        with self.assertRaises(ValueError):
            sync.version('<addon version="2.14.0-beta"/>')

    def test_fork_integration_remains_wired(self):
        server = (ROOT / 'resources/lib/web/server.py').read_text(encoding='utf-8')
        self.assertIn('JellyfinBridge', server)
        routes = (ROOT / 'resources/lib/web/routes.py').read_text(encoding='utf-8')
        for marker in ['/api/jellyfin/local', 'web_main_dashboard']:
            self.assertIn(marker, routes)
        self.assertIn('/js/multi-user.js', (ROOT / 'resources/web/index.html').read_text(encoding='utf-8'))
        core = (ROOT / 'resources/web/js/core.js').read_text(encoding='utf-8')
        self.assertIn('tinyppi.token', core)
        layout = (ROOT / 'resources/web/css/multi-user.css').read_text(encoding='utf-8')
        self.assertIn('flex-direction: column', layout)
        self.assertIn('@media (min-width: 900px)', layout)


if __name__ == '__main__':
    unittest.main()

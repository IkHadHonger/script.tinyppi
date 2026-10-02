import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / 'resources/lib/web/dashboard_trust.py'
spec = importlib.util.spec_from_file_location('dashboard_trust', path)
trust = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trust)

class DashboardTrustTests(unittest.TestCase):
    def test_private_and_tailnet_origins(self):
        self.assertEqual(trust.trusted_origins('http://192.168.1.15:8099/ http://100.118.20.75:8099', True),
                         ['http://192.168.1.15:8099', 'http://100.118.20.75:8099'])

    def test_invalid_entries_fail_closed(self):
        for origin in ['http://example.com', 'http://8.8.8.8', 'http://192.168.1.15/path',
                       'http://user:pass@192.168.1.15', 'http://0.0.0.0',
                       "http://192.168.1.15;script-src *", 'http://192.168.1.15:bad']:
            with self.assertRaises(ValueError):
                trust.trusted_origins(origin, True)
            self.assertEqual(trust.trusted_origins(origin), [])

    def test_policy_limits_trust_to_explicit_origins(self):
        base = "script-src 'self'; frame-ancestors 'none'; object-src 'none'"
        policy = trust.page_policy(base, 'http://192.168.1.15:8099')
        self.assertIn("frame-ancestors 'self' http://192.168.1.15:8099", policy)
        self.assertIn("frame-src 'self' http://192.168.1.15:8099", policy)
        self.assertIn("script-src 'self'", policy)
        self.assertNotIn('*', policy)

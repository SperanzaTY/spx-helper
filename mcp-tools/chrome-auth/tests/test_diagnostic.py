import unittest
from unittest.mock import patch

from chrome_auth.diagnostic import format_auth_troubleshoot


class DiagnosticTests(unittest.TestCase):
    def test_auth_troubleshoot_mentions_skipped_seatalk_cdp(self) -> None:
        probe = {
            "env_chrome_cdp_port": "(未设置)",
            "ports_probe_order": [9222, 19222],
            "reachable_ports": [19222],
            "port_browser": {19222: "SeaTalk/CDP-Proxy"},
            "auth_skipped_ports": {19222: "SeaTalk/CDP-Proxy"},
            "per_port_error": {9222: "connection refused"},
        }
        with patch("chrome_auth.cdp_provider.probe_cdp_connectivity", return_value=probe):
            text = format_auth_troubleshoot(
                "datasuite.shopee.io",
                {},
                sso_refresh_attempted=True,
                sso_refresh_succeeded=False,
                sso_refresh_urls_tried=("https://datasuite.shopee.io/",),
            )

        self.assertIn("19222=SeaTalk/CDP-Proxy", text)
        self.assertIn("不共享你在 Chrome 里的 DataSuite 登录态", text)


if __name__ == "__main__":
    unittest.main()

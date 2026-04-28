import unittest
from unittest.mock import patch

from chrome_auth.cache import get_cache
from chrome_auth import cdp_provider


class CdpProviderAuthPortTests(unittest.TestCase):
    def setUp(self) -> None:
        get_cache().clear()

    def test_datasuite_auth_skips_seatalk_cdp_proxy(self) -> None:
        with patch.object(cdp_provider, "_list_reachable_cdp_ports", return_value=[19222, 9222]), patch.object(
            cdp_provider,
            "_cdp_browser_name",
            side_effect=lambda port: "SeaTalk/CDP-Proxy" if port == 19222 else "Chrome/124.0.0.0",
        ):
            self.assertEqual(cdp_provider._cdp_ports_for_auth("datasuite.shopee.io", None), [9222])

    def test_generic_cdp_cookie_read_can_still_use_non_chrome_ports(self) -> None:
        with patch.object(cdp_provider, "_list_reachable_cdp_ports", return_value=[19222]), patch.object(
            cdp_provider,
            "_cdp_browser_name",
            return_value="SeaTalk/CDP-Proxy",
        ):
            self.assertEqual(cdp_provider._cdp_ports_for_auth("web.haiserve.com", None), [19222])

    def test_datasuite_cookie_read_prefers_port_with_auth_token(self) -> None:
        def fake_cdp_call(ws_url, method, params=None, timeout=10):
            if "9222" in ws_url:
                return {"cookies": [{"name": "CSRF-TOKEN", "value": "csrf"}]}
            return {
                "cookies": [
                    {"name": "CSRF-TOKEN", "value": "csrf2"},
                    {"name": "DATA-SUITE-AUTH-userToken-v4", "value": "token"},
                ]
            }

        with patch.object(cdp_provider, "_cdp_ports_for_auth", return_value=[9222, 9333]), patch.object(
            cdp_provider,
            "_pick_page_for_cookie_read",
            side_effect=lambda port, pattern: {"type": "page", "webSocketDebuggerUrl": f"ws://127.0.0.1:{port}/page"},
        ), patch.object(cdp_provider, "_cdp_call", side_effect=fake_cdp_call):
            cookies = cdp_provider.get_cdp_cookies("datasuite.shopee.io", force=True)

        self.assertEqual(cookies["DATA-SUITE-AUTH-userToken-v4"], "token")
        self.assertEqual(cookies["CSRF-TOKEN"], "csrf2")


if __name__ == "__main__":
    unittest.main()

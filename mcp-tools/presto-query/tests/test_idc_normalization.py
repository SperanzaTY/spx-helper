import importlib
import os
import unittest


class PrestoIdcNormalizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        os.environ.setdefault("PRESTO_PERSONAL_TOKEN", "dummy")
        os.environ.setdefault("PRESTO_USERNAME", "dummy")
        cls.server = importlib.import_module("presto_mcp_server")

    def test_query_idc_aliases_match_datasuite_region_values(self) -> None:
        self.assertEqual(self.server._normalize_idc("sg"), "SG")
        self.assertEqual(self.server._normalize_idc("singapore"), "SG")
        self.assertEqual(self.server._normalize_idc("us"), "USEast")
        self.assertEqual(self.server._normalize_idc("USEast"), "USEast")
        self.assertEqual(self.server._normalize_idc("us-east"), "USEast")
        self.assertEqual(self.server._normalize_idc("useast1"), "USEast")

    def test_query_and_metadata_idc_aliases_are_consistent(self) -> None:
        query_region = self.server._normalize_idc("USEast")
        metadata_region, qn_suffix = self.server._normalize_metadata_idc("USEast")
        self.assertEqual(query_region, metadata_region)
        self.assertEqual(qn_suffix, "USEast")

    def test_invalid_idc_message_mentions_useast(self) -> None:
        with self.assertRaisesRegex(ValueError, "USEast"):
            self.server._normalize_idc("br")


if __name__ == "__main__":
    unittest.main()

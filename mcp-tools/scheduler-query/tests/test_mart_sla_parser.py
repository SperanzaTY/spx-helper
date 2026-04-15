"""mart_sla_parser 单元测试。"""

from __future__ import annotations

import json
import pathlib
import sys

_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from mart_sla_parser import parse_mart_sla_alert  # noqa: E402


def main() -> None:
    sample = """
Your SLA fundmart__data_observation_sgidc__400_medium(spx_datamart.fundmart__data_observation_sgidc__600_medium) in Data Environment prod is delayed.
Business Time (UTC +8): 2026-04-15 00:00:00
Configured SLA (UTC +8): 2026-04-15 04:00:00
Estimated Completion (UTC +8): 2026-04-15 04:48:23
Related Events: 125013105 trigger delayed - spx_datamart.datahub.bti.422404.hdfscopy.spx_datamart__x.prod (spx_datamart.datahub.bti.422404.hdfscopy_20260414_DAY_1)
For more details, please check https://shp.ee/jAwuk1H7
""".strip()
    p = parse_mart_sla_alert(sample)
    assert p.get("ok") is True
    assert p.get("sla_rule_name") == "fundmart__data_observation_sgidc__400_medium"
    assert "fundmart__data_observation_sgidc__600_medium" in (p.get("mart_table") or "")
    assert p.get("data_environment") == "prod"
    assert "2026-04-15 00:00:00" in (p.get("business_time") or "")
    assert p.get("task_instance_codes") == ["spx_datamart.datahub.bti.422404.hdfscopy_20260414_DAY_1"]
    assert "https://shp.ee/jAwuk1H7" in (p.get("detail_urls") or [])

    empty_rel = parse_mart_sla_alert(
        "Your SLA x(y) in Data Environment prod is delayed. Related Events: -"
    )
    assert empty_rel.get("task_instance_codes") == []

    one_line = (
        "Your SLA fundmart__data_observation_usidc__1830_medium(spx_datamart.fundmart__data_observation_usidc__1830_medium) "
        "in Data Environment prod is delayed. Business Time (UTC +8): 2026-04-14 00:00:00 "
        "Configured SLA (UTC +8): 2026-04-14 18:30:00 Estimated Completion (UTC +8): 2026-04-14 21:32:35 "
        "Related Events: x (spx_datamart.studio_10909596_20260414_DAY_1) For more details https://shp.ee/abc12DEfgh"
    )
    ol = parse_mart_sla_alert(one_line)
    assert ol.get("business_time") == "2026-04-14 00:00:00"
    assert ol.get("configured_sla") == "2026-04-14 18:30:00"
    assert ol.get("estimated_completion") == "2026-04-14 21:32:35"

    print("ok:", json.dumps(p, ensure_ascii=False, indent=2)[:400], "...")


if __name__ == "__main__":
    main()

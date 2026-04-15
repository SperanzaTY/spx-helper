"""mart_sla_shortlink 单元测试（解析逻辑可离线；可选网络测短链）。"""

from __future__ import annotations

import pathlib
import sys

_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from mart_sla_shortlink import parse_shortlink_landing_location, resolve_mart_sla_shortlink  # noqa: E402


def test_parse_landing_pc() -> None:
    loc = (
        "https://datasuite.shopeemobile.com/fe-public/landing-page.html?"
        "m=https%3A%2F%2Flink.seatalk.io%2Fv4%2F1%2Fs%2Fx&"
        "pc=https%3A%2F%2Fdatasuite.shopee.io%2Fscheduler%2Fsla%2Finstance%2Fdetail%2F"
        "spx_datamart.fundmart__data_observation_usidc__1830_medium_20260414"
        "%3FslaCode%3Dspx_datamart.fundmart__data_observation_usidc__1830_medium"
        "&projectCode=spx_datamart&slaBizTime=2026-04-14%2B00%3A00%3A00"
    )
    d = parse_shortlink_landing_location(loc)
    assert d.get("ok") is True
    assert d.get("sla_instance_key") == "spx_datamart.fundmart__data_observation_usidc__1830_medium_20260414"
    assert d.get("sla_code") == "spx_datamart.fundmart__data_observation_usidc__1830_medium"
    assert d.get("project_code") == "spx_datamart"
    assert "datasuite.shopee.io/scheduler/sla/instance/detail/" in d.get("datasuite_sla_open_url", "")
    assert "projectCode=spx_datamart" in d.get("datasuite_sla_open_url", "")


def main() -> None:
    test_parse_landing_pc()
    print("offline ok")
    r = resolve_mart_sla_shortlink("https://shp.ee/ef9mfKa4")
    if not r.get("ok"):
        print("network skip or fail:", r.get("error"))
    else:
        print("network ok:", r.get("datasuite_sla_open_url", "")[:120], "...")


if __name__ == "__main__":
    main()

"""mart_sla_instance_api 单元测试。"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mart_sla_instance_api import (  # noqa: E402
    build_sla_instance_get_params,
    extract_task_codes_from_sla_instance_get,
)


def test_build_params():
    r = build_sla_instance_get_params(
        {
            "ok": True,
            "sla_code": "spx_datamart.x",
            "sla_instance_key": "spx_datamart.x_20260414",
            "project_code": "spx_datamart",
        }
    )
    assert r == {
        "slaCode": "spx_datamart.x",
        "slaInstanceCode": "spx_datamart.x_20260414",
        "projectCode": "spx_datamart",
    }


def test_build_params_missing():
    assert build_sla_instance_get_params({"ok": False}) is None
    assert build_sla_instance_get_params({"ok": True, "sla_code": "", "sla_instance_key": "x"}) is None


def test_extract_from_cur_run():
    body = {
        "success": True,
        "data": {
            "curRunTaskInstanceCode": "spx_mart.studio_10429983_20260414_DAY_1",
            "estimateLastTaskInstanceCode": "spx_mart.studio_10429983_20260414_DAY_2",
        },
    }
    codes = extract_task_codes_from_sla_instance_get(body)
    assert "spx_mart.studio_10429983_20260414_DAY_1" in codes
    assert "spx_mart.studio_10429983_20260414_DAY_2" in codes


def test_extract_nested_gantt_style():
    raw = {
        "success": True,
        "data": {
            "taskExecutionGanttVOList": [
                {"taskInstanceCode": "spx_mart.studio_10429983_20250729_DAY_1"},
                {"multiExecutionGanttList": [{"taskInstanceCode": "spx_mart.studio_10429983_20250729_DAY_2"}]},
            ]
        },
    }
    codes = extract_task_codes_from_sla_instance_get(raw)
    assert "spx_mart.studio_10429983_20250729_DAY_1" in codes
    assert "spx_mart.studio_10429983_20250729_DAY_2" in codes


if __name__ == "__main__":
    test_build_params()
    test_build_params_missing()
    test_extract_from_cur_run()
    test_extract_nested_gantt_style()
    print("ok", json.dumps({"tests": 4}))

"""extract_task_code 单元测试：从 taskInstanceCode 解析 taskCode。

在包目录下执行:
  python3 tests/test_extract_task_code.py
"""

from __future__ import annotations

import pathlib
import sys

_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from scheduler_task_code import extract_task_code  # noqa: E402


def _assert_eq(a: str, b: str) -> None:
    if a != b:
        raise AssertionError(f"expected {b!r}, got {a!r}")


def main() -> None:
    cases = [
        ("spx_mart.studio_10429983_20260401_DAY_1", "spx_mart.studio_10429983"),
        ("regops_spx.studio_10628558_2026041417_HOUR_1", "regops_spx.studio_10628558"),
        ("twbi_spx_ops.studio_6786158_202604012010_MINUTE_1", "twbi_spx_ops.studio_6786158"),
        ("idecbi_sc.studio_8044569_202604_MONTH_1", "idecbi_sc.studio_8044569"),
        ("proj.studio_1_2026_WEEK_3_1", "proj.studio_1"),
        ("proj.studio_1_2026_YEAR_1", "proj.studio_1"),
        (
            "spx_mart.datahub.etl_batch.281196_20260101_DAY_1",
            "spx_mart.datahub.etl_batch.281196",
        ),
        ("only_project", "only_project"),
        ("spx_mart.studio_1", "spx_mart.studio_1"),
    ]
    for inst, want in cases:
        got = extract_task_code(inst)
        _assert_eq(got, want)
    print("ok:", len(cases), "cases")


if __name__ == "__main__":
    main()

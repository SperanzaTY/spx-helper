"""presto_history_sql_hints 单元测试。

在包目录下执行:
  python3 tests/test_presto_hints.py
"""

from __future__ import annotations

import pathlib
import sys

_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from scheduler_task_code import presto_history_sql_hints  # noqa: E402


def main() -> None:
    assert "presto_sql_warning" in presto_history_sql_hints("")
    assert "presto_sql_warning" in presto_history_sql_hints("   ")

    h = presto_history_sql_hints("  ALTER TABLE foo SET bar = 1")
    assert h.get("presto_sql_kind") == "ddl_or_metadata"
    assert "presto_sql_warning" in h

    assert presto_history_sql_hints("INSERT INTO t SELECT 1").get("presto_sql_kind") == "dml_insert"
    assert presto_history_sql_hints("SELECT 1").get("presto_sql_kind") == "select"
    assert presto_history_sql_hints("(SELECT 1)").get("presto_sql_kind") == "select"
    assert presto_history_sql_hints("WITH x AS (SELECT 1) SELECT * FROM x").get("presto_sql_kind") == "other"

    print("ok: test_presto_hints")


if __name__ == "__main__":
    main()

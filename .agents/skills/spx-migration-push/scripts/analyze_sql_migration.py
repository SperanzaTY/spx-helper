#!/usr/bin/env python3
"""Analyze SQL text for SPX migration old-table references and propose snippets."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


def normalize_identifier(identifier: str) -> str:
    return identifier.strip().strip("`").strip('"').lower()


def line_col(text: str, index: int) -> tuple[int, int]:
    line = text.count("\n", 0, index) + 1
    last_newline = text.rfind("\n", 0, index)
    col = index + 1 if last_newline < 0 else index - last_newline
    return line, col


def context_window(text: str, start: int, end: int, radius_lines: int = 8) -> str:
    lines = text.splitlines()
    line_no, _ = line_col(text, start)
    lo = max(1, line_no - radius_lines)
    hi = min(len(lines), line_no + radius_lines)
    return "\n".join(lines[lo - 1 : hi])


def build_replacement_notes(old_table: str, new_table: str, guide: str, comment: str) -> list[str]:
    notes: list[str] = []
    lower_old = old_table.lower()
    lower_new = new_table.lower()
    lower_comment = comment.lower()

    if "direct" in guide.lower():
        notes.append("Replacement guide says direct switch to the new table.")
    if "subquery" in guide.lower():
        notes.append("Replacement guide says a subquery is required; use the GSheet Comment as the replacement block.")
    if "_df_" in lower_old and ("_di_" in lower_new or "_tab_di_" in lower_new):
        notes.append("Old table looks like daily full (df) and new table looks incremental (di); review grass_date filtering.")
    if "grass_date" in lower_comment:
        notes.append("GSheet Comment mentions grass_date behavior; preserve this warning in owner guidance.")
    if "station_id" in lower_comment or "dim_spx_station" in lower_old:
        notes.append("For station dimension migration, old column id usually maps to new column station_id.")
    if "tz_type" in lower_comment or "dim_spx_station" in lower_old:
        notes.append("Old station table partition filters such as tz_type/grass_region may not exist on the new network station table.")
    return notes


def simple_after_snippet(before: str, old_table: str, new_table: str, comment: str) -> str:
    after = re.sub(re.escape(old_table), new_table, before, flags=re.IGNORECASE)
    old_schema, _, old_name = old_table.partition(".")
    if old_name:
        after = re.sub(rf"(?<![\w.]){re.escape(old_name)}(?![\w.])", old_name, after, flags=re.IGNORECASE)

    lower_comment = comment.lower()
    if "station_id" in lower_comment or "dim_spx_station" in old_table.lower():
        after = re.sub(r"\bid\s+AS\s+station_id\b", "station_id", after, flags=re.IGNORECASE)
        after = re.sub(r"\bAND\s+tz_type\s*=\s*'local'\s*\n?", "", after, flags=re.IGNORECASE)
        after = re.sub(r"\bAND\s+grass_region\s*=\s*'BR'\s*\n?", "", after, flags=re.IGNORECASE)
        after = re.sub(
            r"grass_date\s*=\s*DATE\s*\(\s*max_pt\s*\(\s*'[^']+'\s*,\s*'grass_date'\s*\)\s*\)",
            f"grass_date = (SELECT max(grass_date) FROM {new_table})",
            after,
            flags=re.IGNORECASE,
        )
    return after


def analyze(sql: str, old_table: str, new_table: str, guide: str, comment: str) -> dict:
    old_norm = normalize_identifier(old_table)
    table_name = old_norm.split(".")[-1]

    patterns = [
        ("exact_table", re.compile(rf"(?<![\w.]){re.escape(old_table)}(?![\w.])", re.IGNORECASE)),
        ("bare_table", re.compile(rf"(?<![\w.]){re.escape(table_name)}(?![\w.])", re.IGNORECASE)),
    ]

    matches = []
    seen = set()
    for kind, pattern in patterns:
        for match in pattern.finditer(sql):
            key = (match.start(), match.end())
            if key in seen:
                continue
            seen.add(key)
            line, col = line_col(sql, match.start())
            before = context_window(sql, match.start(), match.end())
            matches.append(
                {
                    "kind": kind,
                    "line": line,
                    "column": col,
                    "matched_text": match.group(0),
                    "before_snippet": before,
                    "after_snippet": simple_after_snippet(before, old_table, new_table, comment),
                }
            )

    notes = build_replacement_notes(old_table, new_table, guide, comment)
    manual_review = not matches or "subquery" in guide.lower()
    return {
        "old_table": old_table,
        "new_table": new_table,
        "replace_guide": guide,
        "match_count": len(matches),
        "matches": matches,
        "notes": notes,
        "manual_review_required": manual_review,
        "manual_review_reason": "old table not found or subquery replacement required" if manual_review else "",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--old-table", required=True)
    parser.add_argument("--new-table", required=True)
    parser.add_argument("--replace-guide", default="")
    parser.add_argument("--comment", default="")
    parser.add_argument("--sql-file")
    args = parser.parse_args()

    if args.sql_file:
        sql = Path(args.sql_file).read_text()
    else:
        sql = sys.stdin.read()

    result = analyze(sql, args.old_table, args.new_table, args.replace_guide, args.comment)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

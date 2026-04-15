---
name: spx-bug-trace
description: Use when diagnosing SPX business data issues in this repository, including wrong page values, missing rows, stale dashboards, API lineage questions, old-vs-new table validation, or root-cause tracing across API, Presto, ClickHouse, Flink, Confluence, SeaTalk, and Google Sheets workflows.
---

# SPX Business Bug Trace

Use this skill for business-facing data investigations. The goal is to move from symptom to evidence-backed conclusion without guessing.

## When To Use It

- A page metric, field, or card is wrong or missing
- A user asks for API lineage, source tables, or biz SQL
- A dashboard is stale and the question may involve CK, Flink, or Scheduler
- A migration check compares old and new tables and needs data validation

## Core Workflow

1. Start from the concrete symptom and identify the likely boundary: frontend/API, Presto warehouse table, ClickHouse realtime table, Flink pipeline, or Scheduler task.
2. If the problem starts from an API, use `api-trace` first. If it starts from a table or pipeline, go straight to `presto-query`, `ck-query`, `flink-query`, or `scheduler-query`.
3. Validate data with live queries before drawing conclusions. Prefer one small confirming query per hypothesis.
4. If the issue is caused by pipeline health, switch to Flink or Scheduler diagnosis instead of staying in lineage mode.
5. End with a concise conclusion: what is wrong, what evidence proves it, what the root cause is, and what the next action should be.

## Operating Rules

- Name the MCP tool and error summary explicitly when a query fails.
- Prefer MCP facts over spreadsheet notes or memory.
- Treat Google Sheets and Confluence as supporting context, not the primary source of truth.
- If code behavior matters, inspect the relevant repo before assuming the logic.

## Load References As Needed

- For the full investigation playbook: [references/workflow.md](references/workflow.md)
- For MCP usage patterns and failure handling: [references/tools.md](references/tools.md)
- For common table relationships and mapping hints: [references/table-mapping.md](references/table-mapping.md)
- For report structure and write-up shape: [references/report-template.md](references/report-template.md)

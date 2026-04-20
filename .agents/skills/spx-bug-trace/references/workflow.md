# Workflow

Use this deeper workflow when the issue is non-trivial.

## Phase 0: Stabilize Context

- Confirm the exact page, field, market, time range, and whether the problem is current or historical.
- If code inspection is needed, make sure the relevant repo is up to date before trusting local source.
- Check whether the symptom is isolated to one market or widespread.

## Phase 1: Find The Entry Point

- If the user already has an API path or `api_id`, use that directly.
- If the symptom is on a page and the API is unknown, recover the `api_id` from known page routes, browser traces, or existing notes.
- If the user starts from a table or ETL task, skip API recovery and move directly to data validation.

## Phase 2: Establish Lineage Or Pipeline Ownership

- Use `get_api_lineage` when you need fast lineage only.
- Use `api_trace` when you need richer output or source-table checks.
- For stale or missing data, determine whether the failure is in:
  - warehouse logic
  - realtime CK write path
  - upstream Flink app
  - upstream Scheduler task

## Phase 3: Validate Hypotheses

- Use `query_presto` for warehouse and offline table checks.
- Use `query_ck` or `query_ck_bundle` for ClickHouse realtime tables.
- Use `search_flink_apps`, `diagnose_flink_app`, and related Flink tools if freshness is broken.
- Use `search_tasks`, `get_instance_detail`, and related Scheduler tools for batch pipelines.
- If a CK realtime DIM or ADS table is missing a single entity, do not stay in SQL lineage mode after confirming the source fact or source DIM already has that entity.
- For standalone realtime apps, check `search_flink_apps` first and confirm whether the owner is Scheduler or an independent Flink application.
- If `scheduleStatus = NO` or `taskCode = null`, treat the problem as a Flink application issue and inspect current instance status, restart count, recent exceptions, and historical instance failures.
- If the current instance is only barely alive but historical instances are failing repeatedly, classify the issue as pipeline instability rather than single-row business filtering.

## Phase 4: Close The Loop

- State whether the issue is data missing, data delayed, logic changed, source mismatch, or expected behavior.
- Include the minimal evidence needed to justify the conclusion.
- If remediation is outside read-only scope, say who should act and what they should inspect next.
- When writing the final case document, preserve the replay path: the exact SQL, the MCP tools used, the key empty-result checks, and the repo code locations that were necessary to close the loop.

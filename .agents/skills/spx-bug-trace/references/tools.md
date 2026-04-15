# Tools

Use these MCP tools in roughly this order.

## API And Lineage

- `get_api_lineage(api_id)`: fastest lineage lookup
- `api_trace(api_id, ...)`: richer lineage and source-table oriented workflow

## Data Validation

- `query_presto(sql=...)`: warehouse and offline validation
- `query_ck(sql=..., env=..., cluster=...)`: realtime CK checks
- `query_ck_bundle(bundle=...)`: fallback when multi-arg CK calls are unreliable

## Pipeline Diagnosis

- `search_flink_apps`, `diagnose_flink_app`, `get_flink_app_detail`
- `search_flink_table_lineage` when a table or topic is the best starting point
- `search_tasks`, `get_task_info`, `get_task_instances`, `get_instance_detail`, `get_instance_log`

## Supporting Context

- `confluence_search` and `confluence_get_page` for PRD and historical cases
- `get_sheet_data` for team-maintained notes and tracking sheets
- `query_messages_sqlite` when SeaTalk alarm history helps identify app ids or recurrence

## Failure Handling

- When a tool returns 401, 403, permission errors, missing params, or null data, say so explicitly.
- Do not replace missing evidence with confident prose.
- For Presto, remember the SQL argument name is `sql`, not `query`.
- For CK, prefer `query_ck_bundle` if the client drops required fields.

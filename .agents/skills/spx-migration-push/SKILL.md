---
name: spx-migration-push
description: Use when following up SPX mart table migration owners from a Google Sheet, checking real migration status, reading online DataStudio assets across mart projects, analyzing Scheduler/Presto task SQL, generating task-specific old-table to new-table migration guidance, updating tracking sheets, and drafting or sending SeaTalk reminders/replies.
---

# SPX Migration Push

## Core Rules

- Do not send SeaTalk messages unless the user explicitly asks to send or reply.
- Before sending, show or derive the exact target session, recipient, and message content.
- For private SeaTalk messages, send only to friends. If the user is not a friend, add/contact first or use GSheet sharing/email as a fallback; do not fake-send to non-friends.
- Validate sent SeaTalk messages by checking local message history after sending.
- Treat `dev_spx_mart.tmp_zld_20260423_v4` as D-1 validation data. Use `max(grass_date)` unless the user requests a specific date.
- A task is migrated only when the latest successful instance no longer accesses the old table. If a task was changed but latest run failed or is blocked, keep it pending.

## Required Inputs

- Tracking GSheet URL or spreadsheet id.
- Owner scope, usually `DE PIC = <email>` and `Status = Not Start`.
- Candidate task owner(s), or a request to process all pending owners.
- Whether the user wants analysis only, draft messages, or actual SeaTalk sending.

## Standard Workflow

1. Read the latest GSheet headers before updating ranges.
2. Build the pending owner/task list:
   - Filter `Migration List` by `DE PIC` and `Status`.
   - Group by `task_owner`.
   - Deduplicate by `task_link`.
3. Check real migration status:
   - Query `dev_spx_mart.tmp_zld_20260423_v4`.
   - Use `grass_date = (SELECT max(grass_date) ...)`.
   - Aggregate by `task_owner` and task where needed.
4. Read current SeaTalk replies:
   - Anchor replies to this campaign's sent message timestamp, not older conversations.
   - Exclude the current user's own messages and contact-system messages.
5. For each reply or pending task, decide:
   - Already migrated: verify with validation table and ask owner to update GSheet `Status` column with exact row/cell link.
   - Not migrated and old table found in SQL: generate migration guidance.
   - Not migrated but old table not found: check latest successful instance, upstream dependency, SQL variants, or possible stale validation.
   - Transferred owner: ask for or follow the new owner if user approves.
6. If sending, send with SeaTalk at a safe rate, then verify messages are in local history.
7. Update the GSheet status columns with timestamps and outcomes.

## Migration Guidance Workflow

Use this when the user asks how a task should migrate.

1. Locate the GSheet row:
   - `task_owner`, `task_name`, `task_link`, `schema`, `table_name`, `replace_table`, `replace_guide`, `Comment`, `Status`.
   - Build `old_table = schema.table_name`.
2. Parse Scheduler task code from `task_link`, for example:
   - `https://datasuite.shopee.io/scheduler/task/brbi_opslgc.studio_123`
   - `https://datasuite.shopee.io/scheduler/dev/task/brbi_opslgc.studio_123`
3. Get latest instances with `scheduler-query.get_task_instances`.
   - Use `env=dev` for `/scheduler/dev/task/...`, otherwise `env=prod`.
   - Use the latest successful instance when the newest instance is waiting/failed.
4. Get instance detail with `scheduler-query.get_instance_detail`.
   - If Presto, use `scheduler-query.get_presto_query_sql`.
   - If Spark/Hive, use `scheduler-query.get_spark_query_sql` or Spark SQL plan tools.
5. Read online DataStudio assets when available:
   - Treat DataStudio as the source of the currently saved production/dev code.
   - Use the task `project_code` from GSheet/Scheduler to read the owner task asset.
   - Search/list by `workflow_name`, `task_name`, and table name. If the project root search fails, use Scheduler SQL as fallback and report that DataStudio asset lookup failed.
   - Read the replacement table asset from `spx_datamart`, not from the owner mart project.
   - For asset wrappers with empty content, inspect metadata/program arguments, main resource, zip/resource names, and local `/Users/tianyi.liang/spx-datamart` code when available.
   - For RTI/BTI tables, prefer the realtime/DataStudio project asset that owns the realtime job; for offline mart tables, search the offline mart/DataStudio project and local `spx-datamart` repository.
6. Analyze the SQL:
   - Search for exact `old_table`, unqualified `table_name`, and common variants.
   - Use `scripts/analyze_sql_migration.py` for deterministic matching and initial before/after snippets.
7. Verify new table metadata:
   - Use `presto-query.get_presto_table_metadata`, not `DESCRIBE` or `SHOW`.
   - Confirm referenced columns exist or note required renames.
8. Optionally run a lightweight validation query against only the changed CTE/table reference.
   - Do not run full production SQL unless the user asks.
9. Produce concise guidance:
   - Current validation status and latest instance.
   - Online task SQL source: DataStudio asset if found, otherwise latest successful Scheduler SQL.
   - Old table found and SQL context.
   - Recommended new table and before/after.
   - Evidence from replacement table code/metadata.
   - Special notes from GSheet `Comment`.
   - GSheet row and exact `Status` cell to update after completion.

## DataStudio Asset Strategy

- Owner task SQL lives in the owner project, for example `brbi_listings`, `brbi_opslgc`, or another mart space from the GSheet `project_code`.
- Replacement table logic lives in `spx_datamart`; search/read this space separately for the new table asset.
- Scheduler `source = Data Studio`, `workflow_name`, `workflow_code`, `task_name`, and `task_code` help locate the asset path.
- `datastudio_mcp.search_datastudio_assets` can fail for some project roots; fall back to `scheduler-query.get_presto_query_sql` or `get_spark_query_sql` for latest expanded SQL, then use DataStudio/local code for replacement-table semantics.
- Empty DataStudio asset content usually means the asset is a PySpark/task wrapper. Use metadata and program arguments to identify `--job`, main resources, and the local module path under `/Users/tianyi.liang/spx-datamart/datamart/src/`.
- Always distinguish three sources in the final guidance:
  - owner task code: what the user needs to edit;
  - old table logic/metadata: what the current SQL depends on;
  - new table logic/metadata: what fields/partition semantics should replace it.

## Replacement Heuristics

- `1 - Direct switch to the new table`: replace table reference and adjust renamed columns/partition filters.
- `Subquery required`: use the GSheet `Comment` as the replacement CTE/subquery. Preserve aliases expected by downstream SQL.
- `df -> di` migration: if the old table was daily full and the new table is incremental, do not blindly keep `grass_date = current_date - 1` or `grass_date = max(grass_date)` when the query needs the full dataset.
- Legacy fleet order ODS/DF to `spx_datamart.dwd_spx_fleet_order_di_{cid}`:
  - The new table is incremental by `grass_date`; remove old full-snapshot filters when the business logic needs all historical shipments.
  - Prefer direct columns such as `manual_package_length`, `manual_package_width`, `manual_package_height`, `manual_package_weight` when replacing JSON extraction from `manual_measure_info`.
  - If the user needs legacy column names/type compatibility, consider `spx_datamart.dwd_spx_fleet_order_tab_di_{cid}` for Presto or `dwd_spx_fleet_order_tab_spark_view_di_{cid}` for Spark SQL.
- `dim_spx_station_{cid}` to `dim_spx_network_station_{cid}`:
  - Old `id` maps to new `station_id`.
  - `station_name` usually keeps the same name.
  - Old partition filters `tz_type` and `grass_region` usually do not exist on the new table.
  - New `grass_date` is a string partition.
- Always confirm actual columns with metadata before finalizing guidance.

## Migration Guidance Examples

Load `references/migration-guidance-examples.md` when generating owner-facing SQL advice or when validating a new replacement pattern.

## Sheet Updates

- Read headers before adding columns or writing statuses.
- Keep source row numbers in generated tabs so messages can link to exact cells.
- Use direct cell links for owner action, for example:
  - `https://docs.google.com/spreadsheets/d/<spreadsheet_id>/edit#gid=0&range=H6948`
- For user-owned migration status, use `Status` column, usually column `H`.
- For DE-only status, use `Status for check（Only For DE side）`, usually column `P`.

## Message Templates

Use `references/message-templates.md` for reminder, reply, and migration-guidance templates. Keep messages short and task-specific.

## Script

Use `scripts/analyze_sql_migration.py` to analyze a SQL file or stdin against a GSheet row payload:

```bash
python scripts/analyze_sql_migration.py \
  --old-table spx_mart.dim_spx_station_br \
  --new-table spx_datamart.dim_spx_network_station_br \
  --replace-guide "1 - Direct switch to the new table" \
  --comment "..." \
  --sql-file task.sql
```

The script emits JSON with old table matches, suggested snippets, notes, and whether manual review is needed.

# Table Mapping

Use this as a lightweight reminder, not as ground truth.

## Common Patterns

- `spx_datamart.*` often represents newer warehouse targets used in migration checks.
- `spx_mart.*` frequently appears as the older comparison side in old-vs-new validation.
- `spx_mart_manage_app.*` often shows up in ClickHouse or operational metrics paths.

## How To Use This File

- Use it to generate the next hypothesis, then confirm with MCP queries.
- If this note conflicts with live lineage, DataMap, or query results, trust the live evidence.

## Typical Comparisons

- old warehouse table vs new warehouse table
- CK serving table vs upstream Flink output
- page API result vs underlying source table aggregation

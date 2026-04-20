# Output Sinks And Naming Rules

Load this reference when the investigation needs any durable writeback: local markdown, Confluence, or Google Sheets.

## Local Process Document

- Save the full process record under `docs/investigations/` when the target repo has that directory.
- Filename format: `YYYYMMDD-<short-description>.md`
- Keep the document replayable: symptom, lineage, SQL checks with actual values, Flink or Scheduler evidence when relevant, CK re-checks, and final conclusion.
- Prefer the local markdown as the source of truth before syncing the same content elsewhere.

## Confluence

- Historical investigation pages live under `space_key="SPSC"` and `parent_id="3105880558"`.
- Title format must start with one business prefix directly followed by the short description:
  - `FM-...` for First Mile or pickup topics
  - `MM-...` for Middle Mile topics
  - `LM-...` for Last Mile or delivery topics
- Do not use bracketed prefixes such as `[LM]-...`.
- Write the full markdown body into the page content. Do not use an attachment-only update when the user wants the investigation synced.
- If the page already exists, update the full body with `confluence_update_page(...)` instead of creating a second page.

## Google Sheets

- Google Sheets is optional supporting context and postmortem sedimentation, not the primary source of truth for root cause.
- Main spreadsheet id: `1WRDykqhPTsG4t1P1M2A5fNVqWxrpj1jurQ8DBXNSkNw`
- Required service account access: `cursor@spx-helper.iam.gserviceaccount.com`
- If Sheets returns 403, tell the user to share the spreadsheet with that service account.

### app问题整理

- Read the current sheet first, then append one row.
- Sheet name: `app问题整理`
- Column mapping:
  - A: date in `YYYY-MM-DD`
  - B: online issue summary
  - C: root cause summary plus Confluence link when available
  - D: investigation duration
  - E: issue category
  - F: whether it is a valid issue
  - G: whether monitoring alerted
  - H: fixed value `SPX APP`

### 坑点

- Use sheet `坑点` for reusable pitfalls that the skill did not already cover.
- If the sheet does not exist, create it first.
- Recommended columns: pitfall description, symptom, mitigation, related scenario, source case, date.

## Formatting Rules

- Do not use emoji in the process document or Confluence investigation page.
- Keep SQL aliases in English.
- Preserve actual values in tables or code blocks instead of replacing them with prose summaries.
- Explain the root cause in business language, then keep the technical depth in a separate background or process section.

## Source Of Deeper Detail

- The fuller upstream Cursor skill remains at `.cursor/skills/spx-bug-trace/SKILL.md`.
- For the Google Sheets design rationale and table usage, see `.cursor/skills/spx-bug-trace/GOOGLE_SHEETS_INTEGRATION_DESIGN.md`.

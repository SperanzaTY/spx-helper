# Workflow

Use this playbook when building or extending an MCP capability from a real platform page in SPX Helper.

The main target is the repo's existing MCP framework:
- server code in `mcp-tools/<tool>/`
- shared auth in `mcp-tools/chrome-auth`
- DataSuite-family browser auth and CDP workflows
- release and docs conventions already enforced by hooks

## Phase 0: Lock The User Goal

- Write down the concrete operator question first.
- Good examples:
  - "Is this table updating normally?"
  - "Who are the downstream applications of this table?"
  - "Does this column have field-level lineage?"
- Do not start from "there is a new tab in the UI" alone.

## Phase 0.5: Mine Candidate Capabilities From The Page

- If the user gives only a page or link, extract a candidate list before implementation.
- Look for:
  - new tabs, cards, side panels, drawers, exports, filters, detail popovers
  - richer fields already shown in UI but missing from MCP
  - actions that imply a backend capability such as search, aggregation, drill-down, compare, status, owner lookup, or downstream usage
- For each candidate, write a short record:
  - operator question it answers
  - likely value
  - likely backend source
  - whether it appears read-only or write-capable
  - rough implementation cost
- The first output to the user should be this shortlist when the request is still open-ended.

## Phase 1: Audit The Existing MCP Surface And Framework Hooks

- Read the current MCP server and module README.
- For DataSuite-family tools, also inspect sibling servers such as `datamap-query`, `scheduler-query`, `flink-query`, or `datastudio-mcp`.
- Identify:
  - what the tool already returns
  - which fields were simplified away
  - whether there are old correctness issues nearby
  - whether auth is already standardized through `_load_cookies`, retry wrappers, and `format_auth_troubleshoot`
- Treat this as a gap analysis, not proof of backend behavior.

## Phase 2: Explore With Real Evidence

- Best path: use page-level CDP or browser network capture and observe real requests when clicking the relevant UI.
- Fallback path when CDP is unavailable:
  - fetch the actual page HTML or front-end bundle
  - inspect likely API routes or request builders
  - call the live backend with current authenticated cookies
- State explicitly which path you used.
- If CDP is unavailable, do not stop at "can't inspect"; switch to backend probing with the current login state.

## Phase 2.5: Build A Shortlist For User Selection

- After exploration, convert the evidence into 2-5 concrete MCP options when the page supports more than one useful capability.
- For each option, provide:
  - proposed MCP tool or extension name
  - one-line user value
  - verified endpoint or evidence path
  - main implementation risk or unknown
- If the user's ask is ambiguous, stop here and let them choose the first priority.
- If the user clearly asked to "do all of them" or named a specific one, continue without waiting.

## Phase 3: Prove Request, Response, And Auth Shapes

- For every candidate endpoint, verify:
  - HTTP method
  - route
  - required params or JSON body
  - enum spelling and casing
  - whether table qualifiedName, column qualifiedName, serviceType, or typeName are required
  - whether `CSRF-TOKEN` is required
  - whether one failed request should trigger `force=True, auth_failed=True` cookie reload
- Record one real successful request or one real empty-result request for each endpoint.
- Empty-result requests still prove the endpoint exists if the response shape is valid.

## Phase 3.5: Verify Cookie Source And Refresh Behavior

- For DataSuite-family MCPs, inspect or reuse:
  - `chrome_auth.get_auth(...)`
  - `cookie_db + cdp_cookie` merge
  - earliest cookie expiry handling
  - auto SSO refresh path
  - `format_auth_troubleshoot`
- Treat these as first-class behavior, not plumbing.
- Hard rules:
  - if the service uses browser session auth, do not hardcode tokens
  - if 401/403 is recoverable via refresh, implement the retry path once and reuse it
  - if refresh still fails, return structured diagnostics instead of generic "auth failed"
- Remember the environment reality:
  - `9222` is usually the real Chrome remote debug port when available
  - `19222` may belong to SeaTalk or another embedded Chromium, which can be useful for some flows but does not guarantee DataSuite Chrome cookies

## Phase 4: Separate Proven Facts From Inference

- Proven:
  - fields seen in successful responses
  - counts returned by live data
  - exact request parameters accepted by backend
- Inference:
  - likely UI grouping logic
  - likely intent behind a page tab
  - likely reusable patterns across entities
- Do not mix them in the same sentence without labeling the inference.

## Phase 5: Design The MCP Tool Surface

- Name tools by operator task, not backend route names.
- Prefer stable parameters:
  - `table_ref`
  - `column_name`
  - `direction`
  - `engine`
  - `idc_region`
- Avoid leaking backend-only noise unless it is necessary for correctness.
- Return:
  - investigation-ready fields
  - URLs when they help jump to owner systems
  - counts or summaries when they prevent extra parsing
- Keep raw sub-objects when flattening would discard useful evidence.
- If the backend has a shared auth and retry pattern, keep helper names and flow close to sibling MCP servers for maintainability.
- When there are multiple candidate tools, prefer:
  - one summary or discovery tool
  - a small number of sharp task-oriented tools
  - no duplicate tools that differ only by backend route naming

## Phase 6: Implement And Tighten Adjacent Correctness

- Add the new tool or extend the existing one.
- Fix nearby correctness issues discovered during exploration if they would make the new capability misleading.
- Prefer using existing helpers over cloning logic. If a new helper is broadly reusable, place it where sibling MCPs can follow the same pattern.
- Example classes of fixes:
  - resolved qualifiedName differs from requested one
  - fallback IDC changes the current entity match
  - edge flattening drops nested results
  - task metadata is over-trimmed
  - auth retry path exists in sibling MCPs but not in this tool
  - cookies are loaded but CSRF header is not propagated

## Phase 7: Verify In Two Layers

- Layer 1: static verification
  - syntax or compile checks
- Layer 2: real-auth smoke
  - call the new MCP function with one known live sample
  - verify both existence and returned shape
  - capture one or two key output facts for the release note or final answer
- If the tool depends on browser auth, include at least one proof that the live cookie path actually worked.

## Phase 8: Sync Docs

- Update the module README with:
  - tool list
  - natural-language examples
  - endpoint or behavior notes when they matter
- Update the shared guide so other engineers know the capability exists.

## Phase 9: Release Or Handoff

- If the user asked only for exploration or local implementation, stop after code, tests, and docs.
- If the user wants the capability shipped:
  - follow the repo's release path, not a raw ad hoc push
  - update versioned release metadata
  - make sure release docs and notices are present
  - use the repo's release workflow so notifications and remote sync happen correctly
- In this repo, release is a distinct step with hooks and metadata requirements. Treat it as part of delivery, not an afterthought.

## Anti-Patterns

- Jumping from one discovered tab straight into implementation without first surfacing the candidate MCP options
- Treating an open-ended page link as implicit approval to implement whichever endpoint looks easiest
- Claiming CDP evidence when only direct backend probing was done
- Guessing endpoint names and describing them as confirmed
- Stopping after front-end wording without validating live backend responses
- Returning a flattened schema that hides fields the operator actually needs
- Saying "field lineage is unavailable" when only one sample column returned empty
- Writing a new browser-auth flow instead of reusing `chrome-auth`
- Returning a bare 401 string without cookie diagnostics
- Confusing SeaTalk or embedded Chromium CDP with the user's real Chrome session
- Calling local implementation "done" when the user explicitly asked for publish or release

---
name: mcp-capability-build
description: Use when building or extending MCP tools in SPX Helper, especially for DataSuite-style products that require CDP exploration, chrome-auth cookie reuse, silent SSO refresh, and real logged-in backend verification before implementation.
---

# MCP Capability Build

Use this skill when a user asks to add a new MCP capability or extend an existing one in this repository and the exact backend behavior is not yet proven.

This skill is specific to the SPX Helper framework:
- MCP servers often sit under `mcp-tools/`
- many DataSuite-facing tools share `mcp-tools/chrome-auth`
- page exploration may rely on Chrome CDP
- auth behavior must work with cookie DB, CDP cookies, silent SSO refresh, and 401 retry paths

## When To Use It

- A product page shows a new tab, panel, or action and the MCP tool does not support it yet
- The user asks whether a platform has field-level lineage, downstream application details, task metadata, or another likely hidden capability
- A tool currently returns simplified data and you need to discover what richer fields the real backend exposes
- You need to turn page exploration into a concrete MCP design, implementation, and verification plan
- You are adding a new DataSuite-family MCP that should reuse the shared auth and troubleshooting conventions

## Core Workflow

1. Start from the user's actual use case, not the page label. Identify what decision the user wants to make with the capability.
2. If the user only gives a page or link, first mine the page for implementable MCP opportunities instead of choosing one silently.
3. Inspect the existing MCP implementation, shared auth path, and docs first so you know what is missing and what is already available.
4. Prove the backend behavior with real evidence before designing the tool:
   - Prefer page-level CDP or browser network capture when available
   - If CDP is blocked, inspect real page resources and call the logged-in backend endpoints directly
   - Distinguish clearly between what was proven from responses and what is only inferred from page structure
5. Turn exploration into a shortlist for the user when there is more than one viable capability:
   - list the candidate MCP abilities
   - note which endpoint or evidence supports each one
   - note value, implementation scope, and uncertainty
   - let the user choose the first priority unless the ask already clearly selects one item
6. Validate exact request and auth shapes with real calls:
   - endpoint path
   - required params or JSON body
   - enum spelling
   - direction flags
   - cookie and CSRF requirements
   - 401/403 retry behavior
   - empty-result behavior
7. Only after that, design the MCP surface in the style used by this repo:
   - keep tool names aligned to the user task
   - expose the smallest stable parameter set
   - return fields that help investigation, not only raw IDs
   - preserve raw or rich backend fields where simplification would hide useful context
8. Reuse the framework instead of rebuilding it:
   - use `chrome-auth` for cookie loading and diagnostics on DataSuite-family domains
   - keep the standard 401 refresh pattern: first request, force refresh on 401/403, then return structured auth diagnostics if still failing
   - keep shared troubleshooting output consistent with sibling MCP tools
9. Implement the tool and fix adjacent old issues discovered during the exploration if they affect correctness.
10. Sync the module README and the shared guide so the new capability is discoverable.
11. Run both syntax checks and real-auth smoke tests against one known live sample before claiming the feature works.
12. If the user wants the work shipped, finish the release path instead of stopping at local code:
   - update release metadata
   - run required release checks
   - publish through the repo's release flow

## Operating Rules

- Do not describe page-level CDP exploration unless you actually captured the page or network behavior.
- Do not assume a new UI section means a new backend endpoint; verify it.
- Do not assume an endpoint name or enum value from memory; confirm with a successful response.
- If a sample returns empty data, separate "endpoint exists" from "this sample has no lineage/app/task result".
- When auth or CDP blocks you, say so plainly and switch to the best available evidence path instead of bluffing.
- If the user only gave a page or link, the first deliverable is a capability-mining shortlist, not code.
- When multiple viable MCP abilities are discovered, pause and let the user choose the priority unless they already asked for all of them or named one explicitly.
- Prefer extending `chrome-auth` or reusing its diagnostics over inventing one-off cookie code for a new DataSuite MCP.
- If `browser_cookie3` and CDP point to different browser processes, call that out explicitly. In this repo, `19222` may be SeaTalk or another embedded Chromium, while the real Chrome target may need `9222`.
- For DataSuite-family MCPs, treat `cookie_db + cdp_cookie` merge, `CSRF-TOKEN` propagation, and `format_auth_troubleshoot` style diagnostics as framework conventions, not optional extras.
- Treat release as a separate explicit phase. Do not assume "implemented" means "published".
- In the final implementation notes, keep a short map of:
  - page capability
  - verified backend endpoint
  - MCP tool added or updated
  - real sample used for smoke testing

## Load References As Needed

- For the detailed exploration and implementation playbook: [references/workflow.md](references/workflow.md)

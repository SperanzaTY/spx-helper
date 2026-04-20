# SPX Helper

## Project Overview

SPX Helper is a productivity toolkit for Shopee data engineers. The repository has four main parts:

- `chrome-extension/`: Chrome extension for quick links, API trace helpers, calendar tools, SQL/HTTP/Regex/Mermaid helpers, and related utilities
- `mcp-tools/`: MCP servers for Presto, ClickHouse, Spark, Scheduler, Flink, SeaTalk, DataMap, DataStudio, and API lineage workflows
- `seatalk-agent/`: SeaTalk desktop agent built with Node.js and TypeScript, using CDP injection and ACP-based agent processes
- `.cursor/skills/`: Existing team workflows and investigation playbooks created for Cursor

## Working Rules

- Do not commit or push unless the user explicitly asks for it.
- Treat `chrome-extension/manifest.json` as the single source of truth for the project version.
- When behavior changes, update the relevant docs in `README.md` or `docs/guides/`.
- Do not hardcode passwords or tokens. Prefer environment variables.
- Default version bumps are patch-only unless the user explicitly wants a minor bump.
- Before commit or push, run `npm run verify:hooks`. If hooks are missing, run `npm run setup`.

## Git And Release Notes

- Preferred release push flow is `npm run push:release` or `bash scripts/push-release.sh`.
- If using raw `git push gitlab release`, follow it with `bash scripts/finish-release-push.sh` after the GitLab push succeeds.
- The repository syncs GitLab first, then GitHub and release notifications.

## MCP Notes

- Most project-specific AI capability lives in `mcp-tools/`.
- `scheduler-query`, `flink-query`, `datamap-query`, and `datastudio-mcp` depend on the shared `mcp-tools/chrome-auth` package.
- SeaTalk-related tooling assumes local CDP access when troubleshooting desktop integration.

## Skills Notes

- Cursor-era skills live in `.cursor/skills/`.
- Codex repo-scoped skills should live in `.agents/skills/`.
- `.cursor/skills/*` or `~/.cursor/skills/*` existing on disk does not make them automatically usable in a Codex session.
- For Codex, treat Cursor skills as migration source material; to make one directly usable, add a repo-scoped entrypoint under `.agents/skills/` or install it into `~/.codex/skills/`.
- Keep Codex skill entrypoints concise and point to existing project knowledge where needed instead of duplicating large workflows.

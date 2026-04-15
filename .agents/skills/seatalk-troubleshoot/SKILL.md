---
name: seatalk-troubleshoot
description: Use when diagnosing SeaTalk agent failures in this repository, including startup issues, duplicate UI injection, CDP connection failures, remote agent problems, updater regressions, message bridge problems, or SeaTalk desktop integration bugs.
---

# SeaTalk Agent Troubleshoot

Use this skill for `seatalk-agent/` incidents and local SeaTalk integration failures.

## When To Use It

- The agent does not start or silently exits
- The sidebar or panel is missing, duplicated, or broken
- CDP cannot connect or inject scripts
- Remote agent commands stop responding
- Messages are not observed, sent, or routed correctly

## Core Workflow

1. Verify process state first: agent process, multiple copies, and log files.
2. Verify CDP connectivity before assuming frontend injection bugs.
3. Map the failure to one layer: process lifecycle, CDP, injection, bridge, ACP child agent, updater, or UI cleanup.
4. Reproduce with repo scripts when possible.
5. Tie every conclusion to concrete evidence from logs, ports, DOM state, or source code.

## Operating Rules

- Multiple agent processes are a first-class suspect when UI duplicates appear.
- Do not jump straight to frontend code edits before confirming CDP and lifecycle health.
- Prefer repo scripts and logs over speculation.

## Load References As Needed

- For the layered troubleshooting workflow: [references/workflow.md](references/workflow.md)
- For commands, files, and fast lookups: [references/commands.md](references/commands.md)

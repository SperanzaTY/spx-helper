---
name: flink-alert-triage
description: Use when triaging Flink alerts, lag spikes, checkpoint failures, repeated restarts, FAILED states, or related operational incidents in this repository, especially when the response should use flink-query, scheduler-query, ck-query, and SeaTalk evidence to produce an actionable diagnosis.
---

# Flink Alert Triage

Use this skill for Flink alert handling, whether the input comes from SeaTalk alarm text or a human asking for incident triage.

## When To Use It

- Checkpoint failures
- Kafka lag or backpressure alerts
- Job restart storms
- Application status changed to FAILED or LOST
- Repeated alarms on the same app id or task series

## Core Workflow

1. Parse the alert into app id, task name, alert type, market, and whether it is active or resolved.
2. Use `flink-query` as the primary source of truth. Pull live evidence before writing a conclusion.
3. Escalate response depth based on severity: quick summary for repeats, deeper diagnosis for first or severe alerts.
4. If needed, correlate with `scheduler-query`, `ck-query`, or `seatalk-reader`.
5. End with a short operational answer: what is happening, what proves it, and what action should be taken now.

## Operating Rules

- Prefer `diagnose_flink_app` plus focused follow-up tools over manual guessing.
- Do not tell the user to inspect dashboards as the main answer if MCP can already provide the facts.
- Treat links as supporting evidence, not the primary output.

## Load References As Needed

- For diagnosis depth, severity, and repeat-alarm handling: [references/workflow.md](references/workflow.md)
- For compact bot-style response formatting: [references/output-format.md](references/output-format.md)

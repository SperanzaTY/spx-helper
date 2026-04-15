---
name: release-publish
description: Use when preparing, reviewing, or executing a release for this repository, including version alignment, release log updates, hook verification, docs sync, SeaTalk agent verification, release notification generation, and the GitLab-first release push workflow.
---

# Release Publish

Use this skill for release work in SPX Helper.

## When To Use It

- The user asks to release, publish, bump the version, or push to `release`
- A change should be packaged into a formal versioned release
- You need to verify release docs, hooks, and notifications are in sync

## Core Workflow

1. Run pre-flight checks: branch, hooks, and remote sync.
2. Align versions and release notes.
3. Update affected docs, especially for changed modules.
4. If SeaTalk agent code changed, run the CDP verification path.
5. Prepare the release notification, then wait for explicit user approval before commit or push.

## Operating Rules

- `chrome-extension/manifest.json` is the version source of truth.
- Do not commit or push unless the user explicitly authorizes it.
- Prefer project release scripts over ad hoc remote commands.

## Load References As Needed

- For the release checklist and decision points: [references/checklist.md](references/checklist.md)
- For CDP verification expectations: [references/cdp-verification.md](references/cdp-verification.md)

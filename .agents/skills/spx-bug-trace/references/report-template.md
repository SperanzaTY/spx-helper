# Report Template

Use this shape for non-trivial investigations. The output should be a process document that another engineer can replay, not just a conclusion summary.

## Required Sections

- Context: market, page, metric or entity, time range, user symptom, link to the original thread if available
- Conclusion: symptom, root cause, confidence, ownership
- Investigation Process: phase-by-phase checks in actual execution order
- Next Action: who should act, what they should inspect or fix, and what to re-check after the change

## Process Section Requirements

- For each phase, record the tool or repo used
- Keep the exact SQL for key validation steps
- Keep the key result summary after each SQL or tool call
- Keep important negative findings, not only positive hits
- When code is relevant, include the concrete file paths and the logic that mattered
- For realtime issues, include current instance status, restart count, and at least one recent exception or historical failure signal

## What To Avoid

- Do not write a conclusion-only page
- Do not drop the SQL and replace it with prose
- Do not omit failed or empty checks if they were part of the attribution chain

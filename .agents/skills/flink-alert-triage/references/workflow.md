# Workflow

## Phase 0: Parse The Alert

Extract:

- app id
- project
- task name
- alert type
- market
- resolved vs active

## Phase 1: Choose Depth

- First alert or severe state: do a deeper L2-style diagnosis
- Repeats: give a shorter L1 update with trend change
- Resolved: confirm recovery and mention residual risk if any

## Phase 2: Pull Evidence

Preferred Flink tool sequence:

- `get_flink_app_detail`
- `get_flink_instance`
- `diagnose_flink_app`
- `get_flink_checkpoints`
- `get_flink_vertices`
- `get_flink_taskmanagers`
- `get_flink_metrics`

Use extra tools only when needed:

- `scheduler-query` for upstream batch dependencies
- `ck-query` for downstream freshness confirmation
- `seatalk-reader` for historical alarm context

## Phase 3: Decide The Likely Cause

Common patterns:

- lag + low backpressure: upstream burst or temporary lag
- checkpoint timeout + high backpressure: downstream or processing bottleneck
- restart storm + heartbeat timeout: TM, GC, or cluster instability
- FAILED + no recent checkpoint: higher recovery risk

## Phase 4: Respond

- First line should be immediately actionable
- Include only the most relevant metrics
- Say whether the user can self-serve or whether manual escalation is needed

# Workflow

## Phase 0: Process Health

- Check whether the agent is running.
- Check for duplicate agent processes.
- Confirm whether `launch.sh` or direct `tsx` is being used.

## Phase 1: CDP Availability

- Verify the SeaTalk CDP endpoint is reachable.
- Confirm the target page is the expected SeaTalk web surface.
- If CDP is down, fix that before touching injected code.

## Phase 2: Logs And Startup Path

- Inspect agent logs and restart logs.
- Identify the last successful startup stage.
- Use the last printed stage to localize the subsystem at fault.

## Phase 3: Injection And UI

- Check whether the expected DOM elements and global functions exist.
- If duplicate elements appear, confirm whether cleanup ran and whether multiple processes are racing.
- Review the injected files under `seatalk-agent/src/inject/`.

## Phase 4: Bridge And ACP

- Validate message bridge bindings.
- Confirm ACP child agent startup and any remote-agent-specific failures.
- Only after transport is healthy should you debug reply logic or tool behavior.

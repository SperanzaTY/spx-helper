#!/bin/bash
# Launch SeaTalk + Agent. Ctrl-C kills both.
# Exit code 42 from agent = update applied, restart automatically.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CDP_PORT=${CDP_PORT:-19222}

cleanup() {
  echo "[launch] shutting down..."
}
trap cleanup EXIT

export SEATALK_LAUNCHER=1

while true; do
  echo "[launch] starting agent..."
  npx tsx "${SCRIPT_DIR}/src/main.ts"
  EXIT_CODE=$?
  if [ "$EXIT_CODE" -eq 42 ]; then
    echo "[launch] 🔄 update applied, restarting..."
    sleep 1
    continue
  fi
  echo "[launch] agent exited with code ${EXIT_CODE}"
  break
done

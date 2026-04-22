#!/bin/bash
# Launch SeaTalk + Agent. Ctrl-C kills both.
# Exit code 42 from agent = update applied, restart automatically.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CDP_PORT=${CDP_PORT:-19222}

cleanup() {
  echo "[launch] shutting down, killing child processes..."
  pkill -P $$ 2>/dev/null
  sleep 0.3
  pkill -9 -P $$ 2>/dev/null
}
trap cleanup EXIT INT TERM

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
  echo "[launch] agent exited unexpectedly, restarting in 3s..."
  sleep 3
done

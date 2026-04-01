#!/bin/bash
# seatalk-cdp-daemon.sh — 后台守护进程，确保 SeaTalk 始终以 CDP 模式运行
# 当检测到 SeaTalk 在运行但 CDP 端口不通时，自动重启它并带上 CDP 参数。
# 用户双击/Dock/Spotlight 打开 SeaTalk 都会被自动修正。

CDP_PORT="${CDP_PORT:-19222}"
CHECK_INTERVAL=3          # 检查间隔（秒）
RESTART_COOLDOWN=30       # 重启后冷却期（秒），避免反复重启
AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="${SEATALK_CDP_LOG:-$HOME/.seatalk-agent/logs/cdp-daemon.log}"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  local msg="[$(date '+%H:%M:%S')] $*"
  echo "$msg" >> "$LOG_FILE"
}

cdp_available() {
  curl -s -o /dev/null -w "%{http_code}" "http://localhost:${CDP_PORT}/json" 2>/dev/null | grep -q "200"
}

seatalk_running() {
  pgrep -x SeaTalk >/dev/null 2>&1
}

restart_with_cdp() {
  log "SeaTalk running without CDP, restarting with --remote-debugging-port=${CDP_PORT}..."
  pkill -x SeaTalk 2>/dev/null
  sleep 2
  open -a SeaTalk --args --remote-debugging-port="${CDP_PORT}"
  log "SeaTalk restarted with CDP"
}

log "daemon started (pid=$$, CDP_PORT=${CDP_PORT})"

LAST_RESTART=0

while true; do
  if seatalk_running; then
    if ! cdp_available; then
      NOW=$(date +%s)
      ELAPSED=$((NOW - LAST_RESTART))
      if [ "$ELAPSED" -ge "$RESTART_COOLDOWN" ]; then
        restart_with_cdp
        LAST_RESTART=$(date +%s)
      fi
    fi
  fi
  sleep "$CHECK_INTERVAL"
done

#!/usr/bin/env bash
# 完全退出 Google Chrome 后，用 --remote-debugging-port=9222 重新启动，
# 使 chrome-auth 的 CDP 能从「同一用户配置」下读到 DataSuite 登录 Cookie（含加密项）。
#
# 使用前：请保存 Chrome 中未保存的工作；脚本会退出 Chrome。
#
# Usage:
#   bash mcp-tools/chrome-auth/scripts/start_chrome_remote_debug.sh

set -euo pipefail

echo "[INFO] 约 5 秒后将退出 Google Chrome。请先保存标签页与表单。"
sleep 5

osascript -e 'quit application "Google Chrome"' 2>/dev/null || true

for _ in $(seq 1 40); do
  if ! pgrep -x "Google Chrome" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if pgrep -x "Google Chrome" >/dev/null 2>&1; then
  echo "[ERROR] Chrome 仍在运行，请手动退出后重试。"
  exit 1
fi

open -a "Google Chrome" --args --remote-debugging-port=9222

echo "[INFO] 已启动 Chrome（远程调试 9222）。请在 Chrome 中打开并登录："
echo "       https://datasuite.shopee.io/scheduler/ （推荐，Scheduler API 与 MCP 一致）"
echo "       或 https://datasuite.shopee.io/ 根站"
echo ""

for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:9222/json" >/dev/null 2>&1; then
    echo "[OK] CDP 已就绪: http://127.0.0.1:9222/json"
    echo "[INFO] 可在 MCP 环境或 shell 中设置: export CHROME_CDP_PORT=9222"
    exit 0
  fi
  sleep 0.5
done

echo "[WARNING] 60 秒内未检测到 9222。若 Chrome 已打开，请检查是否被策略禁止远程调试。"
exit 1

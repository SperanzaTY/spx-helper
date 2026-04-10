#!/usr/bin/env bash
# finish-release-push.sh — 在「git push gitlab release」成功之后执行
# - 同步 GitHub（origin/release，失败不阻塞发版）
# - 若存在 .release-notification，则 POST 到 SeaTalk 并发后删除该文件
#
# 勿在 pre-push 内调用：pre-push 结束时 Git 尚未完成向 GitLab 的传输。
# 推荐：bash scripts/push-release.sh（内部会先 push gitlab 再调本脚本）

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

sync_github() {
  if ! git remote get-url origin >/dev/null 2>&1; then
    return 0
  fi
  echo "[release] Syncing to GitHub (origin/release)..."
  if git push origin release 2>/dev/null; then
    echo "[release] GitHub sync OK"
  else
    echo "[release] WARN: GitHub sync failed (owner may sync later)"
  fi
}

notify_seatalk() {
  local notify="$REPO_ROOT/scripts/notify-release.sh"
  if [ ! -f "$notify" ]; then
    return 0
  fi
  if [ ! -f "$REPO_ROOT/.release-notification" ]; then
    return 0
  fi
  echo "[release] Sending SeaTalk release notification..."
  bash "$notify" || true
}

sync_github
notify_seatalk

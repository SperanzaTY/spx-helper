#!/usr/bin/env bash
# push-release.sh — 推荐的发版推送入口：先 push GitLab，成功后再同步 GitHub + 群通知
# 用法: bash scripts/push-release.sh [额外 git push 参数]
# 等价: git push gitlab release "$@" && bash scripts/finish-release-push.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "release" ]; then
  echo "[release] 当前分支为「${BRANCH}」，本脚本仅用于向 gitlab 推送 release。已中止。"
  exit 1
fi

git push gitlab release "$@"
bash "$REPO_ROOT/scripts/finish-release-push.sh"

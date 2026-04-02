#!/bin/bash
# setup-hooks.sh — 安装 Git hooks
# 会在 npm install 时自动执行（通过 package.json prepare 脚本）
# 也可以手动执行: bash scripts/setup-hooks.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_DIR="$REPO_ROOT/.githooks"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "[hooks] .githooks 目录不存在，跳过"
  exit 0
fi

# 设置 Git hooks 路径
git config core.hooksPath .githooks

# 确保所有 hook 文件有执行权限
chmod +x "$HOOKS_DIR"/* 2>/dev/null

echo "[hooks] Git hooks 已安装 (core.hooksPath = .githooks)"
echo "[hooks] 活跃的 hooks:"
for HOOK in "$HOOKS_DIR"/*; do
  [ -f "$HOOK" ] && echo "  - $(basename "$HOOK")"
done

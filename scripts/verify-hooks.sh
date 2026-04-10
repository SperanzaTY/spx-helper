#!/bin/bash
# verify-hooks.sh — 确认本仓库已按项目约定安装 .githooks（避免 hook 更新后未执行 setup 导致推送漏检）
# 用法: bash scripts/verify-hooks.sh
# 修复: npm run setup  或  git config core.hooksPath .githooks && chmod +x .githooks/*

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

CONFIG_PATH="$(git config --get core.hooksPath 2>/dev/null || true)"
EXPECTED_REL=".githooks"
HOOKS_DIR="$REPO_ROOT/$EXPECTED_REL"

resolve_hooks_dir() {
  if [ -z "$CONFIG_PATH" ]; then
    echo ""
    return
  fi
  if [ "${CONFIG_PATH#/}" != "$CONFIG_PATH" ]; then
    echo "$CONFIG_PATH"
  else
    echo "$REPO_ROOT/$CONFIG_PATH"
  fi
}

ACTUAL_DIR="$(resolve_hooks_dir)"
CANON_EXPECT="$(cd "$HOOKS_DIR" 2>/dev/null && pwd || echo "")"

if [ -z "$CONFIG_PATH" ]; then
  echo "[hooks-check] FAIL: core.hooksPath 未设置，当前会使用默认 .git/hooks，不会执行项目 .githooks/"
  echo "[hooks-check] 请执行: npm run setup"
  echo "            或: git config core.hooksPath $EXPECTED_REL && chmod +x .githooks/*"
  exit 1
fi

if [ -z "$CANON_EXPECT" ] || [ ! -d "$HOOKS_DIR" ]; then
  echo "[hooks-check] FAIL: 目录 $EXPECTED_REL 不存在"
  exit 1
fi

if [ "$(cd "$ACTUAL_DIR" 2>/dev/null && pwd || echo "")" != "$CANON_EXPECT" ]; then
  echo "[hooks-check] FAIL: core.hooksPath=$CONFIG_PATH 未指向本仓库的 .githooks/"
  echo "[hooks-check] 解析得到: ${ACTUAL_DIR:-<无效路径>}"
  echo "[hooks-check] 请执行: npm run setup"
  exit 1
fi

MISSING=0
for f in pre-push pre-commit commit-msg; do
  if [ ! -f "$HOOKS_DIR/$f" ]; then
    echo "[hooks-check] FAIL: 缺少 $HOOKS_DIR/$f"
    MISSING=1
  elif [ ! -x "$HOOKS_DIR/$f" ]; then
    echo "[hooks-check] WARN: $f 不可执行，尝试 chmod +x"
    chmod +x "$HOOKS_DIR/$f" 2>/dev/null || true
    if [ ! -x "$HOOKS_DIR/$f" ]; then
      echo "[hooks-check] FAIL: $f 仍不可执行"
      MISSING=1
    fi
  fi
done

if [ "$MISSING" -ne 0 ]; then
  exit 1
fi

echo "[hooks-check] OK: core.hooksPath=${CONFIG_PATH} (pre-push, pre-commit, commit-msg)"
exit 0

# shellcheck shell=bash
# 相对 REMOTE/release 上 chrome-extension/manifest.json 的 version，本地版本最多「领先一档」。
# 由 pre-push、pre-commit 共用（pre-commit：任意分支暂存 manifest 即比对主远程 release）。
#
# manifest_version_step_check REMOTE_NAME LOCAL_VERSION
#   REMOTE_NAME: 如 gitlab、origin（与 git remote 名一致）
#   LOCAL_VERSION: 待比较的版本字符串（如 manifest 的 version）
# 返回 0：跳过（无 release 引用或无法取远程版本）、或校验通过
# 返回 1：相对远程跨档领先

manifest_version_step_check() {
  local PRIMARY_REMOTE="$1"
  local VERSION="$2"
  local REMOTE_REF="${PRIMARY_REMOTE}/release"

  if ! git rev-parse --verify "$REMOTE_REF" >/dev/null 2>&1; then
    return 0
  fi

  local REMOTE_MANIFEST_VER
  REMOTE_MANIFEST_VER=$(git show "$REMOTE_REF:chrome-extension/manifest.json" 2>/dev/null | grep '"version"' | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/' || echo "")
  if [ -z "$REMOTE_MANIFEST_VER" ] || [ -z "$VERSION" ]; then
    return 0
  fi

  _semver_split() {
    local v="$1"
    v="${v%%-*}"
    local a b c
    a=$(echo "$v" | cut -d. -f1)
    b=$(echo "$v" | cut -d. -f2)
    c=$(echo "$v" | cut -d. -f3)
    a=$((10#${a:-0}))
    b=$((10#${b:-0}))
    c=$((10#${c:-0}))
    echo "$a $b $c"
  }

  local rM rm rp lM lm lp
  read -r rM rm rp <<EOF
$(_semver_split "$REMOTE_MANIFEST_VER")
EOF
  read -r lM lm lp <<EOF
$(_semver_split "$VERSION")
EOF

  local STEP_OK=1
  if [ "$lM" -lt "$rM" ] || { [ "$lM" -eq "$rM" ] && [ "$lm" -lt "$rm" ]; } || { [ "$lM" -eq "$rM" ] && [ "$lm" -eq "$rm" ] && [ "$lp" -lt "$rp" ]; }; then
    STEP_OK=1
  elif [ "$lM" -eq "$rM" ] && [ "$lm" -eq "$rm" ] && [ "$lp" -eq "$rp" ]; then
    STEP_OK=1
  elif [ "$lM" -eq "$rM" ] && [ "$lm" -eq "$rm" ] && [ "$lp" -gt "$rp" ]; then
    if [ "$((lp - rp))" -ne 1 ]; then
      STEP_OK=0
    fi
  elif [ "$lM" -eq "$rM" ] && [ "$lm" -gt "$rm" ]; then
    if [ "$((lm - rm))" -ne 1 ]; then
      STEP_OK=0
    fi
  elif [ "$lM" -gt "$rM" ]; then
    if [ "$((lM - rM))" -ne 1 ]; then
      STEP_OK=0
    fi
  else
    STEP_OK=0
  fi

  if [ "$STEP_OK" -eq 0 ]; then
    echo "❌ 版本相对 ${PRIMARY_REMOTE}/release 领先超过「一档」！"
    echo "   远程 manifest: v${REMOTE_MANIFEST_VER}  →  本地 manifest: v${VERSION}"
    echo "   允许：同 MAJOR.MINOR 下 PATCH 仅 +1；或 MINOR 仅 +1；或 MAJOR 仅 +1。"
    echo "   禁止：未推送中间版本就连续改版本号（例如远程 3.5.20 时本地直接 3.5.22）。"
    echo "   请先推送或 rebase 后再升版；每个发版提交只升一档。"
    echo ""
    return 1
  fi
  echo "✅ 版本相对 ${PRIMARY_REMOTE}/release 步长合法 (v${REMOTE_MANIFEST_VER} → v${VERSION})"
  return 0
}

#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-}"
VENV_ROOT="${SPX_MCP_VENV_ROOT:-${ROOT_DIR}/.mcp-venvs}"
FORCE=0

usage() {
  cat <<'EOF'
usage: scripts/setup-mcp-env.sh [--force]

Create an architecture-specific Python virtualenv for all repo MCP servers.

Environment:
  PYTHON_BIN          Python interpreter to use. Defaults to python3.12, then python3.
  SPX_MCP_VENV_ROOT   Venv parent directory. Defaults to <repo>/.mcp-venvs.

The venv path includes machine architecture and Python minor version, so arm64
and x86_64 wheels cannot be mixed.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

pick_python() {
  if [[ -n "${PYTHON_BIN}" ]]; then
    printf '%s\n' "${PYTHON_BIN}"
    return
  fi

  local candidate
  for candidate in python3.12 python3; do
    if command -v "${candidate}" >/dev/null 2>&1; then
      command -v "${candidate}"
      return
    fi
  done

  for candidate in /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3 /usr/local/bin/python3 /opt/anaconda3/bin/python3 /usr/bin/python3; do
    if [[ -x "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return
    fi
  done

  return 1
}

PYTHON_BIN="$(pick_python || true)"
if [[ -z "${PYTHON_BIN}" ]]; then
  echo "[mcp-env] cannot find python3. Install Python 3.12 first." >&2
  exit 69
fi

PY_INFO="$("${PYTHON_BIN}" - <<'PY'
import platform
import sys

print(f"{sys.version_info.major}.{sys.version_info.minor}")
print(sys.version_info.major * 100 + sys.version_info.minor)
print(platform.machine() or "unknown")
PY
)"
PY_VERSION="$(printf '%s\n' "${PY_INFO}" | sed -n '1p')"
PY_NUM="$(printf '%s\n' "${PY_INFO}" | sed -n '2p')"
PY_ARCH="$(printf '%s\n' "${PY_INFO}" | sed -n '3p')"
HOST_ARCH="$(uname -m)"

if [[ "${PY_NUM}" -lt 312 ]]; then
  cat >&2 <<EOF
[mcp-env] Python ${PY_VERSION} is too old for the full MCP set.
[mcp-env] datastudio-mcp requires Python 3.12+, and this script installs all MCPs together.
[mcp-env] Install Python 3.12 or set PYTHON_BIN=/path/to/python3.12.
EOF
  exit 69
fi

if [[ "${PY_ARCH}" != "${HOST_ARCH}" ]]; then
  cat >&2 <<EOF
[mcp-env] warning: Python architecture (${PY_ARCH}) differs from host (${HOST_ARCH}).
[mcp-env] The venv will be isolated under ${PY_ARCH}, but native browser/keychain
[mcp-env] integrations may behave differently under Rosetta.
EOF
fi

VENV_DIR="${VENV_ROOT}/${PY_ARCH}-py${PY_VERSION}"
LOCK_DIR="${VENV_DIR}.lock"
READY_FILE="${VENV_DIR}/.spx-mcp-ready"

mkdir -p "${VENV_ROOT}"

while ! mkdir "${LOCK_DIR}" 2>/dev/null; do
  echo "[mcp-env] waiting for another setup process: ${LOCK_DIR}" >&2
  sleep 1
done
trap 'rmdir "${LOCK_DIR}" 2>/dev/null || true' EXIT

if [[ "${FORCE}" -eq 1 && -d "${VENV_DIR}" ]]; then
  echo "[mcp-env] removing existing venv: ${VENV_DIR}" >&2
  rm -rf "${VENV_DIR}"
fi

if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  echo "[mcp-env] creating venv: ${VENV_DIR}" >&2
  "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

VENV_PY="${VENV_DIR}/bin/python"

rm -f "${READY_FILE}"

echo "[mcp-env] using python: ${VENV_PY}" >&2
"${VENV_PY}" -m pip install --upgrade pip setuptools wheel

packages=(
  "mcp-tools/chrome-auth"
  "mcp-tools/presto-query"
  "mcp-tools/ck-query"
  "mcp-tools/spark-query"
  "mcp-tools/api-trace"
  "mcp-tools/seatalk-reader"
  "mcp-tools/scheduler-query"
  "mcp-tools/seatalk-group"
  "mcp-tools/flink-query"
  "mcp-tools/datamap-query"
  "mcp-tools/datastudio-mcp"
)

install_args=()
for pkg in "${packages[@]}"; do
  install_args+=("-e" "${ROOT_DIR}/${pkg}")
done

"${VENV_PY}" -m pip install "${install_args[@]}"

"${VENV_PY}" - <<'PY'
import importlib
import platform
import sys

mods = [
    "mcp.server.fastmcp",
    "requests",
    "websockets",
    "browser_cookie3",
    "jwt",
    "cryptography",
    "fastmcp",
    "chrome_auth",
]
failed = []
for mod in mods:
    try:
        importlib.import_module(mod)
    except Exception as exc:
        failed.append((mod, exc))

print(f"[mcp-env] verified Python {sys.version.split()[0]} ({platform.machine()})")
if failed:
    for mod, exc in failed:
        print(f"[mcp-env] import failed: {mod}: {exc}", file=sys.stderr)
    raise SystemExit(1)
PY

{
  printf 'python=%s\n' "${VENV_PY}"
  printf 'python_version=%s\n' "${PY_VERSION}"
  printf 'python_arch=%s\n' "${PY_ARCH}"
  printf 'created_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
} > "${READY_FILE}"

cat <<EOF
[mcp-env] ready: ${VENV_DIR}
EOF

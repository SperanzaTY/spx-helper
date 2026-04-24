#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_NAME="${1:-}"
PYTHON_BIN="${PYTHON_BIN:-}"
USE_VENV="${SPX_MCP_USE_VENV:-1}"
AUTO_SETUP="${SPX_MCP_AUTO_SETUP:-1}"
VENV_ROOT="${SPX_MCP_VENV_ROOT:-${ROOT_DIR}/.mcp-venvs}"

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

venv_python_for() {
  local base_python="$1"
  local py_info py_version py_arch
  py_info="$("${base_python}" - <<'PY'
import platform
import sys

print(f"{sys.version_info.major}.{sys.version_info.minor}")
print(sys.version_info.major * 100 + sys.version_info.minor)
print(platform.machine() or "unknown")
PY
)"
  py_version="$(printf '%s\n' "${py_info}" | sed -n '1p')"
  py_arch="$(printf '%s\n' "${py_info}" | sed -n '3p')"
  printf '%s/%s-py%s/bin/python\n' "${VENV_ROOT}" "${py_arch}" "${py_version}"
}

venv_is_ready() {
  local venv_python="$1"
  local venv_dir

  [[ -x "${venv_python}" ]] || return 1

  venv_dir="$(cd "$(dirname "${venv_python}")/.." && pwd)"

  [[ -f "${venv_dir}/.spx-mcp-ready" ]] || return 1

  "${venv_python}" - <<'PY' >/dev/null 2>&1
import importlib

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

for mod in mods:
    importlib.import_module(mod)
PY
}

ensure_venv_ready() {
  local venv_python="$1"

  if venv_is_ready "${venv_python}"; then
    return 0
  fi

  if [[ "${AUTO_SETUP}" == "1" ]]; then
    "${ROOT_DIR}/scripts/setup-mcp-env.sh" >/dev/null
    venv_is_ready "${venv_python}" && return 0
    echo "MCP Python environment setup finished but validation still failed: ${venv_python}" >&2
    exit 69
  fi

  cat >&2 <<EOF
MCP Python environment is not initialized or failed validation:
  ${venv_python}

Run:
  bash ${ROOT_DIR}/scripts/setup-mcp-env.sh

This creates an architecture-specific venv and verifies the shared MCP imports.
EOF
  exit 69
}

PYTHON_BIN="$(pick_python || true)"

if [[ -z "${SERVER_NAME}" ]]; then
  echo "usage: $0 <server-name>" >&2
  exit 64
fi

if [[ "${SERVER_NAME}" == "--list" ]]; then
  cat <<'EOF'
presto-query
ck-query
spark-query
api-trace
seatalk-reader
scheduler-query
seatalk-group
flink-query
datamap-query
datastudio-mcp
EOF
  exit 0
fi

if [[ -z "${PYTHON_BIN}" ]]; then
  echo "cannot find python3. Install Python 3.12 first." >&2
  exit 69
fi

if [[ "${USE_VENV}" != "0" ]]; then
  VENV_PY="$(venv_python_for "${PYTHON_BIN}")"
  ensure_venv_ready "${VENV_PY}"
  PYTHON_BIN="${VENV_PY}"
fi

export PYTHONPATH="${ROOT_DIR}/mcp-tools/chrome-auth${PYTHONPATH:+:${PYTHONPATH}}"

case "${SERVER_NAME}" in
  presto-query)
    exec "${PYTHON_BIN}" "${ROOT_DIR}/mcp-tools/presto-query/presto_mcp_server.py"
    ;;
  ck-query)
    exec "${PYTHON_BIN}" "${ROOT_DIR}/mcp-tools/ck-query/ck_mcp_server.py"
    ;;
  spark-query)
    exec "${PYTHON_BIN}" "${ROOT_DIR}/mcp-tools/spark-query/spark_mcp_server.py"
    ;;
  api-trace)
    exec "${PYTHON_BIN}" "${ROOT_DIR}/mcp-tools/api-trace/api_trace_server.py"
    ;;
  seatalk-reader)
    exec "${PYTHON_BIN}" "${ROOT_DIR}/mcp-tools/seatalk-reader/seatalk_reader_server.py"
    ;;
  scheduler-query)
    exec "${PYTHON_BIN}" "${ROOT_DIR}/mcp-tools/scheduler-query/scheduler_mcp_server.py"
    ;;
  seatalk-group)
    exec "${PYTHON_BIN}" "${ROOT_DIR}/mcp-tools/seatalk-group/seatalk_group_server.py"
    ;;
  flink-query)
    exec "${PYTHON_BIN}" "${ROOT_DIR}/mcp-tools/flink-query/flink_mcp_server.py"
    ;;
  datamap-query)
    exec "${PYTHON_BIN}" "${ROOT_DIR}/mcp-tools/datamap-query/datamap_mcp_server.py"
    ;;
  datastudio-mcp)
    export PYTHONPATH="${ROOT_DIR}/mcp-tools/datastudio-mcp:${PYTHONPATH}"
    exec "${PYTHON_BIN}" -m datastudio_mcp.mcp_server
    ;;
  *)
    echo "unknown server: ${SERVER_NAME}" >&2
    exit 64
    ;;
esac

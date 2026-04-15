#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_NAME="${1:-}"
PYTHON_BIN="${PYTHON_BIN:-}"

if [[ -z "${PYTHON_BIN}" ]]; then
  if [[ -x "/opt/anaconda3/bin/python3" ]]; then
    PYTHON_BIN="/opt/anaconda3/bin/python3"
  else
    PYTHON_BIN="$(command -v python3)"
  fi
fi

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

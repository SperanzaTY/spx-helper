#!/usr/bin/env python3
"""
Spark MCP Server - 为 Cursor 提供 Spark SQL 查询能力

通过 Livy REST API（Interactive Session + Statement）执行 Spark SQL，支持 Hive 表查询。

配置方式（在 mcp.json 中）:
{
  "spark-query": {
    "command": "python3",
    "args": ["/path/to/spark_mcp_server.py"],
    "env": {
      "LIVY_URL": "http://livy-rest.data-infra.shopee.io",
      "LIVY_USERNAME": "your_dmp_username",
      "LIVY_PASSWORD": "your_dmp_password"
    }
  }
}
"""

import asyncio
import base64
import json
import os
from typing import Optional, Tuple
import sys
import time

import requests
from mcp.server.fastmcp import FastMCP

# ====== 配置（从环境变量读取）======
LIVY_URL = os.environ.get("LIVY_URL", "").rstrip("/")
LIVY_USERNAME = os.environ.get("LIVY_USERNAME", "")
LIVY_PASSWORD = os.environ.get("LIVY_PASSWORD", "")
DEFAULT_QUEUE = os.environ.get("LIVY_QUEUE", "szsc-dev")
DEFAULT_REGION = os.environ.get("LIVY_REGION", "SG")

# 按 region 选择 Livy 地址（仅当 LIVY_URL 未设置时）
LIVY_URLS = {
    "SG": "http://livy-rest.data-infra.shopee.io",
    "US": "http://livy-rest-us.data-infra.shopee.io",
}

if not LIVY_USERNAME or not LIVY_PASSWORD:
    print("错误: 未设置 LIVY_USERNAME 和 LIVY_PASSWORD 环境变量", file=sys.stderr)
    sys.exit(1)


def _get_base_url(region: str) -> str:
    """优先使用 LIVY_URL，否则按 region 选择"""
    if LIVY_URL:
        return LIVY_URL
    return LIVY_URLS.get(region.upper(), LIVY_URLS["SG"])

mcp = FastMCP("spark-query")

# 轮询间隔与超时
SESSION_POLL_INTERVAL = 5
SESSION_READY_TIMEOUT = 180  # Session 启动约 1-2 分钟
STATEMENT_POLL_INTERVAL = 2
DEFAULT_STATEMENT_TIMEOUT = int(os.environ.get("LIVY_STATEMENT_TIMEOUT", "300"))


def _get_auth_headers() -> dict:
    """HTTP Basic Auth"""
    cred = base64.b64encode(f"{LIVY_USERNAME}:{LIVY_PASSWORD}".encode()).decode()
    return {"Authorization": f"Basic {cred}", "Content-Type": "application/json"}


def _livy_post(base: str, path: str, data: dict, timeout: int = 30) -> dict:
    url = f"{base}{path}"
    resp = requests.post(url, headers=_get_auth_headers(), json=data, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _livy_get(base: str, path: str, timeout: int = 30) -> dict:
    url = f"{base}{path}"
    resp = requests.get(url, headers=_get_auth_headers(), timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _livy_delete(base: str, path: str, timeout: int = 10) -> None:
    url = f"{base}{path}"
    requests.delete(url, headers=_get_auth_headers(), timeout=timeout)


def _parse_statement_output(output: dict, max_rows: int) -> Tuple[list, list, Optional[str]]:
    """解析 Livy Statement output，返回 (columns, rows, raw_text)。"""
    if not output:
        return [], [], None

    data = output.get("data") or {}
    status = output.get("status", "")

    if status == "error":
        err = data.get("text/plain") or data.get("application/json")
        if isinstance(err, dict):
            err = err.get("message", str(err))
        return [], [], str(err) if err else "执行出错"

    # 1. Livy table 格式：application/vnd.livy.table.v1+json
    table_json = data.get("application/vnd.livy.table.v1+json")
    if table_json:
        try:
            tbl = table_json if isinstance(table_json, dict) else json.loads(table_json)
            headers = tbl.get("headers", [])
            rows_data = tbl.get("data", [])[:max_rows]
            columns = [h.get("name", h.get("type", f"col_{i}")) for i, h in enumerate(headers)]
            rows = [dict(zip(columns, row)) for row in rows_data]
            return columns, rows, None
        except Exception:
            pass

    # 2. application/json（如 schema + data）
    app_json = data.get("application/json")
    if app_json is not None:
        try:
            if isinstance(app_json, str):
                app_json = json.loads(app_json)
            if isinstance(app_json, dict):
                schema = app_json.get("schema", [])
                columns = [s.get("name", f"col_{i}") for i, s in enumerate(schema)]
                rows_raw = app_json.get("data", app_json.get("rows", []))[:max_rows]
                if columns and rows_raw:
                    rows = [dict(zip(columns, r)) if isinstance(r, (list, tuple)) else r for r in rows_raw]
                    return columns, rows, None
        except Exception:
            pass

    # 3. text/plain：直接返回
    text = data.get("text/plain")
    if text:
        return [], [], str(text)

    return [], [], None


def format_result_as_table(columns: list, rows: list) -> str:
    if not rows:
        return "(0 rows)"

    col_widths = {col: len(str(col)) for col in columns}
    for row in rows:
        for col in columns:
            val = str(row.get(col, ""))
            col_widths[col] = max(col_widths[col], min(len(val), 50))

    header = " | ".join(str(col).ljust(col_widths[col]) for col in columns)
    separator = "-|-".join("-" * col_widths[col] for col in columns)
    lines = [header, separator]

    for row in rows:
        values = []
        for col in columns:
            val = str(row.get(col, ""))
            if len(val) > 50:
                val = val[:47] + "..."
            values.append(val.ljust(col_widths[col]))
        lines.append(" | ".join(values))

    return "\n".join(lines)


def _wrap_for_syntax_validation(sql: str) -> str:
    """语法验证模式：用 EXPLAIN EXTENDED 包装，只解析不取数"""
    s = sql.strip().rstrip(";")
    if s.upper().startswith("EXPLAIN"):
        return s
    return f"EXPLAIN EXTENDED {s}"


def _execute_spark_sql(
    base_url: str,
    sql: str,
    queue: str,
    spark_version: str,
    max_rows: int,
    statement_timeout: int,
    validate_syntax: bool = False,
) -> dict:
    """同步执行 Livy Session + Statement 流程，返回 {success, columns, rows, raw_text, error}"""
    session_id = None
    try:
        # 1. 创建 Session (kind: sql)
        create_body = {
            "kind": "sql",
            "conf": {
                "spark.yarn.queue": queue,
                "spark.livy.spark_version_name": spark_version,
            },
        }
        sess = _livy_post(base_url, "/sessions", create_body, timeout=60)
        session_id = sess.get("id")
        if session_id is None:
            return {"success": False, "error": f"创建 Session 失败: {sess}"}

        # 2. 轮询 Session 直到 idle
        start = time.time()
        while time.time() - start < SESSION_READY_TIMEOUT:
            s = _livy_get(base_url, f"/sessions/{session_id}", timeout=30)
            state = s.get("state", "")
            if state == "idle":
                break
            if state in ("error", "dead", "killed"):
                return {"success": False, "error": f"Session 失败: state={state}, 详情: {s}"}
            time.sleep(SESSION_POLL_INTERVAL)

        if s.get("state") != "idle":
            return {"success": False, "error": f"Session 启动超时 (>={SESSION_READY_TIMEOUT}s)"}

        # 3. 执行 Statement（若为语法验证模式则用 EXPLAIN 包装）
        exec_sql = _wrap_for_syntax_validation(sql) if validate_syntax else sql.strip().rstrip(";")
        stmt_body = {"kind": "sql", "code": exec_sql}
        stmt = _livy_post(base_url, f"/sessions/{session_id}/statements", stmt_body, timeout=30)
        stmt_id = stmt.get("id")
        if stmt_id is None:
            return {"success": False, "error": f"提交 Statement 失败: {stmt}"}

        # 4. 轮询 Statement 直到 available
        start = time.time()
        while time.time() - start < statement_timeout:
            st = _livy_get(base_url, f"/sessions/{session_id}/statements/{stmt_id}", timeout=30)
            state = st.get("state", "")
            if state == "available":
                out = st.get("output", {})
                cols, rows, raw = _parse_statement_output(out, max_rows)
                if raw and not cols and not rows:
                    # 纯文本输出或错误
                    if out.get("status") == "error":
                        return {"success": False, "error": raw or "执行出错"}
                    return {"success": True, "columns": [], "rows": [], "raw_text": raw}
                return {"success": True, "columns": cols, "rows": rows, "raw_text": raw}
            if state == "error":
                out = st.get("output", {})
                _, _, err = _parse_statement_output(out, max_rows)
                return {"success": False, "error": err or "Statement 执行失败"}
            if state in ("cancelled", "cancelling"):
                return {"success": False, "error": "Statement 已取消"}
            time.sleep(STATEMENT_POLL_INTERVAL)

        return {"success": False, "error": f"Statement 执行超时 (>={statement_timeout}s)"}

    except requests.exceptions.RequestException as e:
        return {"success": False, "error": f"请求失败: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": f"执行错误: {str(e)}"}
    finally:
        if session_id is not None:
            try:
                _livy_delete(base_url, f"/sessions/{session_id}")
            except Exception:
                pass


@mcp.tool()
async def query_spark(
    sql: str,
    queue: str = DEFAULT_QUEUE,
    region: str = DEFAULT_REGION,
    max_rows: int = 200,
    spark_version: str = "v3",
    validate_syntax: bool = False,
    statement_timeout: int = DEFAULT_STATEMENT_TIMEOUT,
) -> str:
    """查询 Spark（Hive）数据库，通过 Livy REST API 执行 Spark SQL。

    离线开发数据验证流程建议：
    1. 语法验证：validate_syntax=True，用 EXPLAIN 检查 SQL 语法和表存在性，不取数据
    2. 数据验证：validate_syntax=False，执行 SELECT 抽样验证结果

    使用场景：
    - 语法验证: query_spark(sql="SELECT ...", validate_syntax=True)
    - 数据验证: query_spark(sql="SELECT * FROM dwd_xxx LIMIT 100")
    - 长查询: 通过 statement_timeout 调整（默认 300s，可设 1800 支持约 30 分钟）

    Args:
        sql: 要执行的 Spark SQL 语句
        queue: YARN 队列（默认 szsc-dev，PROD 用 szsc）
        region: 区域 SG 或 US（默认 SG）
        max_rows: 最多返回行数（默认 200，最大 1000）
        spark_version: Spark 版本 v3（默认）或 v2
        validate_syntax:  True 时用 EXPLAIN 做语法验证，不取数据，适合先校验再跑数
        statement_timeout: Statement 执行超时秒数（默认 300，长查询可设 1800）
    """
    base_url = _get_base_url(region)
    max_rows = min(max_rows, 1000)
    statement_timeout = min(max(statement_timeout, 60), 3600)  # 限制 60~3600 秒

    result = await asyncio.to_thread(
        _execute_spark_sql,
        base_url,
        sql,
        queue,
        spark_version,
        max_rows,
        statement_timeout,
        validate_syntax,
    )

    if not result["success"]:
        return f"❌ 执行失败（Spark / {region}）\n\n错误: {result['error']}"

    if result.get("raw_text") and not result.get("rows"):
        label = "语法验证通过" if validate_syntax else "执行成功"
        return f"✅ {label}（Spark / {region}）\n\n{result['raw_text']}"

    table = format_result_as_table(result["columns"], result["rows"])
    total = len(result["rows"])
    truncated = total >= max_rows
    out = f"✅ 查询成功（Spark / {region}）\n\n"
    out += f"总行数: {total}，显示行数: {len(result['rows'])}\n"
    if truncated:
        out += f"⚠️ 结果已截断（只显示前 {max_rows} 行）\n"
    out += f"\n{table}"
    return out


if __name__ == "__main__":
    mcp.run()

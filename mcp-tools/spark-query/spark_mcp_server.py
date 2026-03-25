#!/usr/bin/env python3
"""
Spark MCP Server - 为 Cursor 提供 Spark SQL 查询能力

通过 Livy REST API（Interactive Session + Statement）执行 Spark SQL，支持 Hive 表查询。
采用 kind=spark (Scala) session + spark.sql() 包装方式，与 DataSuite 平台一致，
完整支持 SELECT / DESCRIBE / SHOW / DDL 等所有 Spark SQL 语句。

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
import re
from typing import Any, Dict, List, Optional, Tuple
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

LIVY_URLS = {
    "SG": "http://livy-rest.data-infra.shopee.io",
    "US": "http://livy-rest-us.data-infra.shopee.io",
}

if not LIVY_USERNAME or not LIVY_PASSWORD:
    print("错误: 未设置 LIVY_USERNAME 和 LIVY_PASSWORD 环境变量", file=sys.stderr)
    sys.exit(1)


def _get_base_url(region: str) -> str:
    if LIVY_URL:
        return LIVY_URL
    return LIVY_URLS.get(region.upper(), LIVY_URLS["SG"])

mcp = FastMCP("spark-query")

SESSION_POLL_INTERVAL = 5
SESSION_READY_TIMEOUT = 180
STATEMENT_POLL_INTERVAL = 2
DEFAULT_STATEMENT_TIMEOUT = int(os.environ.get("LIVY_STATEMENT_TIMEOUT", "300"))


def _get_auth_headers() -> dict:
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


# ---------- SQL 分类 ----------

_METADATA_PATTERNS = [
    (re.compile(r"^\s*DESCRIBE\b", re.IGNORECASE), "DESCRIBE"),
    (re.compile(r"^\s*DESC\b", re.IGNORECASE), "DESC"),
    (re.compile(r"^\s*SHOW\b", re.IGNORECASE), "SHOW"),
    (re.compile(r"^\s*EXPLAIN\b", re.IGNORECASE), "EXPLAIN"),
    (re.compile(r"^\s*SET\b", re.IGNORECASE), "SET"),
    (re.compile(r"^\s*MSCK\b", re.IGNORECASE), "MSCK"),
    (re.compile(r"^\s*ALTER\b", re.IGNORECASE), "ALTER"),
    (re.compile(r"^\s*CREATE\b", re.IGNORECASE), "CREATE"),
    (re.compile(r"^\s*DROP\b", re.IGNORECASE), "DROP"),
    (re.compile(r"^\s*INSERT\b", re.IGNORECASE), "INSERT"),
]


def _classify_sql(sql: str) -> Tuple[str, Optional[str]]:
    """分类 SQL: SELECT / METADATA / DDL / DML"""
    stripped = sql.strip().rstrip(";").strip()
    for pattern, stmt_type in _METADATA_PATTERNS:
        if pattern.match(stripped):
            if stmt_type in ("ALTER", "CREATE", "DROP", "MSCK", "INSERT"):
                return "DDL", stmt_type
            return "METADATA", stmt_type
    return "SELECT", None


# ---------- Scala 代码生成 ----------

def _escape_scala_string(sql: str) -> str:
    """转义 SQL 中的特殊字符以安全嵌入 Scala 三引号字符串"""
    return sql.replace("\\", "\\\\").replace("$", "\\$")


def _build_query_code(sql: str, max_rows: int) -> str:
    """生成 Scala 代码：执行 SQL 并以 JSON Lines 输出结果。

    与 DataSuite 平台一致，使用 kind=spark session + spark.sql() 包装。
    """
    escaped = _escape_scala_string(sql.strip().rstrip(";"))

    return f'''val _df = spark.sql("""{escaped}""")
val _schema = _df.schema.fields.map(f => s""""${{f.name}}": "${{f.dataType.simpleString}}"""").mkString("{{", ", ", "}}")
println("__SCHEMA__" + _schema)
val _rows = _df.take({max_rows})
_rows.foreach {{ row =>
  val vals = _df.schema.fields.zipWithIndex.map {{ case (f, i) =>
    val v = if (row.isNullAt(i)) "null" else {{
      val raw = row.get(i).toString.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"").replace("\\n", "\\\\n").replace("\\r", "\\\\r").replace("\\t", "\\\\t")
      s""""$raw""""
    }}
    s""""${{f.name}}": $v"""
  }}.mkString("{{", ", ", "}}")
  println("__ROW__" + vals)
}}
println("__TOTAL__" + _df.count())'''


def _build_syntax_check_code(sql: str) -> str:
    """生成 Scala 代码：EXPLAIN 做语法检查"""
    escaped = _escape_scala_string(sql.strip().rstrip(";"))
    s = escaped
    if not re.match(r"^\s*EXPLAIN\b", s, re.IGNORECASE):
        s = f"EXPLAIN EXTENDED {s}"
    return f'''val _df = spark.sql("""{s}""")
_df.show(200, truncate = false)'''


# ---------- 结果解析 ----------

def _parse_spark_output(text: str, max_rows: int) -> Dict[str, Any]:
    """解析 kind=spark 输出的 text/plain，提取 schema + rows。

    协议：
      __SCHEMA__{"col": "type", ...}
      __ROW__{"col": value, ...}   (每行一个)
      __TOTAL__<number>
    """
    if not text:
        return {"columns": [], "rows": [], "total": 0, "raw_text": None}

    lines = text.strip().split("\n")
    schema_line = None
    row_lines = []
    total = None
    other_lines = []

    for line in lines:
        if line.startswith("__SCHEMA__"):
            schema_line = line[len("__SCHEMA__"):]
        elif line.startswith("__ROW__"):
            row_lines.append(line[len("__ROW__"):])
        elif line.startswith("__TOTAL__"):
            try:
                total = int(line[len("__TOTAL__"):].strip())
            except ValueError:
                pass
        else:
            other_lines.append(line)

    if schema_line is None:
        return {"columns": [], "rows": [], "total": 0, "raw_text": text}

    try:
        schema = json.loads(schema_line)
        columns = list(schema.keys())
    except json.JSONDecodeError:
        return {"columns": [], "rows": [], "total": 0, "raw_text": text}

    rows = []
    for rl in row_lines[:max_rows]:
        try:
            row = json.loads(rl)
            rows.append(row)
        except json.JSONDecodeError:
            pass

    return {
        "columns": columns,
        "column_types": schema,
        "rows": rows,
        "total": total if total is not None else len(rows),
        "raw_text": None,
    }


# ---------- 表格格式化 ----------

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


def _format_spark_progress(progress: dict) -> str:
    if not progress:
        return ""
    se = progress.get("session_elapsed", 0)
    st = progress.get("statement_elapsed", 0)
    if se == 0 and st == 0:
        return ""
    parts = [f"Session 启动: {se}s", f"Statement 执行: {st}s", f"总耗时: {se + st}s"]
    return " | ".join(parts)


# ---------- 核心执行流程 ----------

def _execute_spark_sql(
    base_url: str,
    sql: str,
    queue: str,
    spark_version: str,
    max_rows: int,
    statement_timeout: int,
    validate_syntax: bool = False,
) -> dict:
    """同步执行 Livy Session(kind=spark) + spark.sql() 包装。"""
    session_id = None
    progress = {"session_elapsed": 0, "statement_elapsed": 0}
    sql_category, sql_stmt_type = _classify_sql(sql)

    try:
        # 1. 创建 Session (kind=spark，与 DataSuite 一致)
        create_body = {
            "kind": "spark",
            "conf": {
                "spark.yarn.queue": queue,
                "spark.livy.spark_version_name": spark_version,
            },
        }
        sess = _livy_post(base_url, "/sessions", create_body, timeout=60)
        session_id = sess.get("id")
        if session_id is None:
            return {"success": False, "error": f"创建 Session 失败: {sess}", "progress": None,
                    "sql_category": sql_category, "sql_stmt_type": sql_stmt_type}

        # 2. 等待 Session idle
        start = time.time()
        s = {}
        while time.time() - start < SESSION_READY_TIMEOUT:
            s = _livy_get(base_url, f"/sessions/{session_id}", timeout=30)
            state = s.get("state", "")
            if state == "idle":
                progress["session_elapsed"] = int(time.time() - start)
                break
            if state in ("error", "dead", "killed"):
                return {"success": False, "error": f"Session 失败: state={state}, 详情: {s}",
                        "progress": progress, "sql_category": sql_category, "sql_stmt_type": sql_stmt_type}
            time.sleep(SESSION_POLL_INTERVAL)

        if s.get("state") != "idle":
            return {"success": False, "error": f"Session 启动超时 (>={SESSION_READY_TIMEOUT}s)",
                    "progress": progress, "sql_category": sql_category, "sql_stmt_type": sql_stmt_type}

        # 3. 构建 Scala 代码并提交 Statement
        if validate_syntax:
            code = _build_syntax_check_code(sql)
        else:
            code = _build_query_code(sql, max_rows)

        stmt_body = {"code": code}
        stmt = _livy_post(base_url, f"/sessions/{session_id}/statements", stmt_body, timeout=30)
        stmt_id = stmt.get("id")
        if stmt_id is None:
            return {"success": False, "error": f"提交 Statement 失败: {stmt}",
                    "progress": progress, "sql_category": sql_category, "sql_stmt_type": sql_stmt_type}

        # 4. 轮询 Statement
        start = time.time()
        while time.time() - start < statement_timeout:
            st = _livy_get(base_url, f"/sessions/{session_id}/statements/{stmt_id}", timeout=30)
            state = st.get("state", "")

            if state == "available":
                progress["statement_elapsed"] = int(time.time() - start)
                out = st.get("output", {})
                out_status = out.get("status", "")
                data = out.get("data", {})

                if out_status == "error":
                    ename = out.get("ename", "")
                    evalue = out.get("evalue", "")
                    traceback_lines = out.get("traceback", [])
                    err_text = data.get("text/plain", "")
                    error_msg = evalue or err_text or ename or "执行出错"
                    if traceback_lines:
                        tb = "\n".join(traceback_lines) if isinstance(traceback_lines, list) else str(traceback_lines)
                        ansi_pattern = re.compile(r'\x1b\[[0-9;]*m')
                        tb = ansi_pattern.sub('', tb)
                        if len(tb) > 2000:
                            tb = tb[:2000] + "\n... (truncated)"
                        error_msg += f"\n\nTraceback:\n{tb}"
                    return {"success": False, "error": error_msg,
                            "progress": progress, "sql_category": sql_category, "sql_stmt_type": sql_stmt_type}

                text = data.get("text/plain", "")
                return {"success": True, "raw_output": text,
                        "progress": progress, "sql_category": sql_category, "sql_stmt_type": sql_stmt_type}

            if state == "error":
                progress["statement_elapsed"] = int(time.time() - start)
                return {"success": False, "error": "Statement 执行失败",
                        "progress": progress, "sql_category": sql_category, "sql_stmt_type": sql_stmt_type}

            if state in ("cancelled", "cancelling"):
                progress["statement_elapsed"] = int(time.time() - start)
                return {"success": False, "error": "Statement 已取消",
                        "progress": progress, "sql_category": sql_category, "sql_stmt_type": sql_stmt_type}

            time.sleep(STATEMENT_POLL_INTERVAL)

        progress["statement_elapsed"] = statement_timeout
        return {"success": False, "error": f"Statement 执行超时 (>={statement_timeout}s)",
                "progress": progress, "sql_category": sql_category, "sql_stmt_type": sql_stmt_type}

    except requests.exceptions.RequestException as e:
        return {"success": False, "error": f"请求失败: {str(e)}",
                "progress": progress, "sql_category": sql_category, "sql_stmt_type": sql_stmt_type}
    except Exception as e:
        return {"success": False, "error": f"执行错误: {str(e)}",
                "progress": progress, "sql_category": sql_category, "sql_stmt_type": sql_stmt_type}
    finally:
        if session_id is not None:
            try:
                _livy_delete(base_url, f"/sessions/{session_id}")
            except Exception:
                pass


# ---------- MCP Tool ----------

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

    采用 kind=spark + spark.sql() 包装方式（与 DataSuite 平台一致），
    完整支持 SELECT / DESCRIBE / SHOW / DDL 等所有 Spark SQL 语句。

    【Agent 调用须知 - 调用前需向用户确认】
    1. 验证目的：用户是「只做语法校验」还是「要查数据」？
       - 语法校验 → validate_syntax=True（快速，不取数）
       - 查数据抽样 → validate_syntax=False
    2. 长查询：若 SQL 可能运行超过 5 分钟，需先问用户预期耗时，并设置 statement_timeout（如 1800）
    3. 队列/区域：一般用默认 szsc-dev/SG；若用户明确说 PROD 或 US，再改 queue/region

    离线开发建议流程：先 validate_syntax=True 校验语法，再查数据。

    Args:
        sql: 要执行的 Spark SQL 语句（支持 SELECT / DESCRIBE / SHOW 等所有语句）
        queue: YARN 队列（默认 szsc-dev，PROD 用 szsc）
        region: 区域 SG 或 US（默认 SG）
        max_rows: 最多返回行数（默认 200，最大 1000）
        spark_version: Spark 版本 v3（默认）或 v2
        validate_syntax: True 时用 EXPLAIN 做语法验证，不取数据
        statement_timeout: Statement 执行超时秒数（默认 300，长查询可设 1800）
    """
    base_url = _get_base_url(region)
    max_rows = min(max_rows, 1000)
    statement_timeout = min(max(statement_timeout, 60), 3600)

    result = await asyncio.to_thread(
        _execute_spark_sql,
        base_url, sql, queue, spark_version, max_rows, statement_timeout, validate_syntax,
    )

    progress_line = _format_spark_progress(result.get("progress") or {})
    sql_category = result.get("sql_category", "SELECT")
    sql_stmt_type = result.get("sql_stmt_type")

    if not result["success"]:
        err_out = f"❌ 执行失败（Spark / {region}）\n\n"
        if sql_stmt_type:
            err_out += f"SQL 类型: {sql_stmt_type}\n"
        err_out += f"错误: {result['error']}\n"
        if progress_line:
            err_out += f"执行进度: {progress_line}\n"
        return err_out

    raw_output = result.get("raw_output", "")

    if validate_syntax:
        out = f"✅ 语法验证通过（Spark / {region}）\n\n"
        if progress_line:
            out += f"执行进度: {progress_line}\n\n"
        out += raw_output
        return out

    parsed = _parse_spark_output(raw_output, max_rows)

    if parsed["raw_text"] is not None:
        out = f"✅ 执行成功（Spark / {region}）\n\n"
        if sql_stmt_type:
            out += f"SQL 类型: {sql_stmt_type}\n"
        if progress_line:
            out += f"执行进度: {progress_line}\n\n"
        out += parsed["raw_text"]
        return out

    columns = parsed["columns"]
    rows = parsed["rows"]
    total = parsed["total"]
    table = format_result_as_table(columns, rows)

    out = f"✅ 查询成功（Spark / {region}）\n\n"
    if sql_stmt_type:
        out += f"SQL 类型: {sql_stmt_type}\n"
    if progress_line:
        out += f"执行进度: {progress_line}\n"
    out += f"总行数: {total}，显示行数: {len(rows)}\n"

    if total == 0:
        if sql_category == "SELECT":
            out += "\n该查询返回 0 行数据，表确实为空或不满足 WHERE 条件。\n"
        else:
            out += "\n该语句执行成功，返回 0 行数据。\n"
    else:
        if total > len(rows):
            out += f"⚠️ 结果已截断（只显示前 {max_rows} 行，总共 {total} 行）\n"
        out += f"\n{table}"

    if parsed.get("column_types"):
        type_info = ", ".join(f"{k}({v})" for k, v in parsed["column_types"].items())
        out += f"\n\n列信息: {type_info}"

    return out


def main():
    mcp.run()


if __name__ == "__main__":
    main()

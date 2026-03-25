#!/usr/bin/env python3
from __future__ import annotations

"""
Presto MCP Server - 为 Cursor 提供 Presto 查询能力

配置方式（在 mcp.json 中）:
{
  "presto-query": {
    "command": "python3",
    "args": ["path/to/presto_mcp_server.py"],
    "env": {
      "PRESTO_PERSONAL_TOKEN": "your_token",
      "PRESTO_USERNAME": "your_username"
    }
  }
}
"""

import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from mcp.server.fastmcp import FastMCP

# 从环境变量读取配置
PERSONAL_TOKEN = os.environ.get('PRESTO_PERSONAL_TOKEN', '')
DEFAULT_USERNAME = os.environ.get('PRESTO_USERNAME', '')
DEFAULT_QUEUE = os.environ.get('PRESTO_QUEUE', 'szsc-adhoc')
DEFAULT_REGION = os.environ.get('PRESTO_REGION', 'SG')

if not PERSONAL_TOKEN:
    print("错误: 未设置 PRESTO_PERSONAL_TOKEN 环境变量", file=sys.stderr)
    sys.exit(1)

if not DEFAULT_USERNAME:
    print("错误: 未设置 PRESTO_USERNAME 环境变量", file=sys.stderr)
    sys.exit(1)

mcp = FastMCP("presto-query")

BASE_URL = "https://open-api.datasuite.shopee.io/dataservice/personal"


_METADATA_PATTERNS = [
    (re.compile(r"^\s*DESCRIBE\b", re.IGNORECASE), "DESCRIBE"),
    (re.compile(r"^\s*DESC\b", re.IGNORECASE), "DESC"),
    (re.compile(r"^\s*SHOW\s+COLUMNS\b", re.IGNORECASE), "SHOW COLUMNS"),
    (re.compile(r"^\s*SHOW\s+TABLES\b", re.IGNORECASE), "SHOW TABLES"),
    (re.compile(r"^\s*SHOW\s+SCHEMAS\b", re.IGNORECASE), "SHOW SCHEMAS"),
    (re.compile(r"^\s*SHOW\s+CATALOGS\b", re.IGNORECASE), "SHOW CATALOGS"),
    (re.compile(r"^\s*SHOW\s+PARTITIONS\b", re.IGNORECASE), "SHOW PARTITIONS"),
    (re.compile(r"^\s*SHOW\s+CREATE\b", re.IGNORECASE), "SHOW CREATE"),
    (re.compile(r"^\s*SHOW\s+STATS\b", re.IGNORECASE), "SHOW STATS"),
    (re.compile(r"^\s*ALTER\b", re.IGNORECASE), "ALTER"),
    (re.compile(r"^\s*CREATE\b", re.IGNORECASE), "CREATE"),
    (re.compile(r"^\s*DROP\b", re.IGNORECASE), "DROP"),
]


def _classify_sql(sql: str) -> Tuple[str, Optional[str]]:
    """分类 SQL 语句。

    Returns: (category, stmt_type)
        category: "SELECT" | "METADATA" | "DDL"
        stmt_type: 具体语句类型，SELECT 类返回 None
    """
    stripped = sql.strip().rstrip(";").strip()
    for pattern, stmt_type in _METADATA_PATTERNS:
        if pattern.match(stripped):
            if stmt_type in ("ALTER", "CREATE", "DROP"):
                return "DDL", stmt_type
            return "METADATA", stmt_type
    return "SELECT", None


def _http_post(url: str, headers: dict, payload: dict, timeout: int = 10) -> dict:
    """同步 POST，在线程池中执行"""
    resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _http_get(url: str, headers: dict, timeout: int = 10) -> dict:
    """同步 GET，在线程池中执行"""
    resp = requests.get(url, headers=headers, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _format_progress(events: list) -> str:
    """将进度事件格式化为可读字符串，如: QUEUED(4s) → RUNNING(41s) → FINISH"""
    if not events:
        return ""
    parts = []
    for i, (elapsed, status) in enumerate(events):
        if i == 0:
            duration = elapsed
        else:
            duration = elapsed - events[i - 1][0]
        parts.append(f"{status}({duration}s)")
    return " → ".join(parts)


def _cell_display(raw: str, cell_max_len: int) -> str:
    """cell_max_len <= 0 表示不截断。"""
    if cell_max_len <= 0:
        return raw
    if len(raw) > cell_max_len:
        return raw[: max(0, cell_max_len - 3)] + '...'
    return raw


def format_result_as_table(
    columns: List[str],
    rows: List[Dict[str, Any]],
    cell_max_len: int = 50,
) -> str:
    """将查询结果格式化为 Markdown 友好表格文本。"""
    if not rows:
        return "(0 rows)"

    col_widths: Dict[str, int] = {col: len(col) for col in columns}
    for row in rows:
        for col in columns:
            disp = _cell_display(str(row.get(col, '')), cell_max_len)
            col_widths[col] = max(col_widths[col], len(disp))

    header = " | ".join(col.ljust(col_widths[col]) for col in columns)
    separator = "-|-".join("-" * col_widths[col] for col in columns)
    lines = [header, separator]

    for row in rows:
        values = []
        for col in columns:
            raw = str(row.get(col, ''))
            val = _cell_display(raw, cell_max_len)
            values.append(val.ljust(col_widths[col]))
        lines.append(" | ".join(values))

    return "\n".join(lines)


def _resolve_write_path(path_str: str) -> Path:
    """相对路径相对 PRESTO_MCP_OUTPUT_DIR（未设则为进程 cwd，一般为 Cursor 工作区根）。"""
    p = Path(path_str).expanduser()
    if p.is_absolute():
        return p
    base = os.environ.get('PRESTO_MCP_OUTPUT_DIR', os.getcwd())
    return Path(base) / p


def _write_full_result_json(
    path: Path,
    job_id: str,
    columns: List[str],
    rows: List[Dict[str, Any]],
    total_rows: int,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        'jobId': job_id,
        'columns': columns,
        'rows': rows,
        'totalRows': total_rows,
        'writtenRows': len(rows),
    }
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


# 返回类型使用 Any：FastMCP + Pydantic 2.10 对裸注解 -> str 会触发
# create_model(..., result=str) 的 PydanticUserError（见 issue：非 Annotated 的 result 字段）
@mcp.tool()
async def query_presto(
    sql: str,
    username: str = DEFAULT_USERNAME,
    queue: str = DEFAULT_QUEUE,
    region: str = DEFAULT_REGION,
    max_rows: int = 100,
    cell_max_len: int = 0,
    write_full_result_to: Optional[str] = None,
) -> Any:
    """查询 Presto 数据库，执行只读 SELECT 查询。

    【Agent 调用须知 - 调用前需向用户确认】
    1. 表/库：确保用户已明确要查的表名（含 schema，如 spx_mart.xxx）
    2. 查询条件：若需按日期/市场等过滤，先问用户具体条件再拼 WHERE
    3. 行数：默认返回 100 行，大数据量统计可适当提高 max_rows
    4. **长单元格 / 血缘大字段**：默认 cell_max_len=0（不在表格中截断列宽）。
       若对话仍被宿主截断，请使用 write_full_result_to 将完整 JSON 写入仓库路径再读文件。

    注意:
    - 只支持只读 SELECT 查询
    - SHOW / DESCRIBE 等元数据命令在此 API 中支持不完整，可能返回错误或空结果。
      建议改用 SELECT * FROM table LIMIT 1 查看字段，或用 information_schema 查元数据。
    - DDL 语句（CREATE / ALTER / DROP）不被支持
    - 每次最多返回 2000 行（可通过 max_rows 参数限制）
    - 查询超时时间为 5 分钟
    - 环境变量 PRESTO_MCP_OUTPUT_DIR：write_full_result_to 为相对路径时的基准目录（默认进程 cwd）

    Args:
        sql: 要执行的 SQL 查询语句（必须是只读的 SELECT 语句）
        username: 用户名（默认使用配置的用户名）
        queue: Presto 队列名称，szsc-adhoc 或 szsc-scheduled（默认 szsc-adhoc）
        region: IDC 集群，SG 或 US（默认 SG）
        max_rows: 最多返回行数（默认 100，最大 2000）
        cell_max_len: 表格展示时每个单元格最大字符数；**0 表示不截断**（适合 sink/source 长 JSON）；
            设为 50–120 可缩短 MCP 文本体积。默认 0。
        write_full_result_to: 若提供相对/绝对路径，将 **完整** 查询结果写入 UTF-8 JSON
           （columns + rows + jobId），便于后续脚本合并或写 Sheet；相对路径基于 PRESTO_MCP_OUTPUT_DIR 或 cwd。
            写入后回复中附带 **短预览表**（前若干行、单元格最多 96 字符），完整数据以文件为准。
    """
    sql_category, sql_stmt_type = _classify_sql(sql)

    if sql_category == "DDL":
        return (
            f"❌ 不支持执行（Presto API）\n\n"
            f"SQL 类型: {sql_stmt_type}（DDL 语句）\n"
            f"DataSuite API 仅支持只读 SELECT 查询，不支持 {sql_stmt_type} 等 DDL 操作。"
        )

    if sql_category == "METADATA":
        metadata_warning = (
            f"\n⚠️ 注意: {sql_stmt_type} 是元数据查询，DataSuite API 对此类语句支持不完整，可能返回错误。"
            f"\n建议改用等效 SELECT:"
            f"\n  - DESCRIBE table → SELECT * FROM table LIMIT 1"
            f"\n  - SHOW TABLES → SELECT table_name FROM information_schema.tables WHERE table_schema='xxx'"
            f"\n  - SHOW COLUMNS → SELECT column_name, data_type FROM information_schema.columns WHERE table_name='xxx'"
        )

    end_user = username if '@' in username else f"{username}@shopee.com"
    headers = {
        'Authorization': PERSONAL_TOKEN,
        'X-End-User': end_user,
        'Content-Type': 'application/json'
    }
    max_rows = min(max_rows, 2000)
    effective_cell = cell_max_len if cell_max_len >= 0 else 0

    try:
        data = await asyncio.to_thread(
            _http_post,
            f"{BASE_URL}/query/presto",
            headers,
            {'sql': sql.strip(), 'prestoQueue': queue, 'idcRegion': region, 'priority': '3'}
        )
        job_id = data.get('jobId')
        if not job_id:
            err = f"❌ 提交失败: {data.get('errorMsg', data.get('message', 'Unknown error'))}"
            if sql_category == "METADATA":
                err += f"\n\nSQL 类型: {sql_stmt_type}"
                err += metadata_warning
            return err

        start_time = time.time()
        progress_events = []
        last_status = None

        while True:
            elapsed = int(time.time() - start_time)
            if elapsed > 300:
                out = f"❌ 查询超时 (>300秒)\n\nJob ID: {job_id}\nSQL 类型: {sql_stmt_type or sql_category}"
                if sql_category == "METADATA":
                    out += metadata_warning
                return out

            status_data = await asyncio.to_thread(
                _http_get, f"{BASE_URL}/status/{job_id}", headers
            )
            query_status = status_data.get('status')

            if query_status != last_status:
                progress_events.append((elapsed, query_status))
                last_status = query_status

            if query_status == 'FINISH':
                break
            elif query_status == 'FAILED':
                progress_events.append((elapsed, 'FAILED'))
                err_msg = (
                    status_data.get('errorMessage')
                    or status_data.get('errorMsg')
                    or status_data.get('error')
                    or status_data.get('message')
                    or status_data.get('msg')
                    or str(status_data)
                )
                progress_line = _format_progress(progress_events)
                out = f"❌ 查询失败\n\nJob ID: {job_id}\nSQL 类型: {sql_stmt_type or sql_category}\n\n查询进度: {progress_line}\n总耗时: {elapsed}s\n\n错误: {err_msg}"
                if sql_category == "METADATA":
                    out += metadata_warning
                return out
            elif query_status in ['RUNNING', 'PENDING', 'QUEUED']:
                await asyncio.sleep(2)
            else:
                return f"❌ 未知状态: {query_status}\nJob ID: {job_id}"

        result_data = await asyncio.to_thread(
            _http_get, f"{BASE_URL}/result/{job_id}", headers
        )
        if 'resultSchema' not in result_data:
            return f"❌ 获取结果失败: {result_data.get('errorMsg', 'Unknown error')}\nJob ID: {job_id}"

        columns = [col['columnName'] for col in result_data.get('resultSchema', [])]
        rows_raw = result_data.get('rows', [])
        total_rows = len(rows_raw)
        rows = [row.get('values', {}) for row in rows_raw[:max_rows]]

        total_elapsed = int(time.time() - start_time)
        progress_line = _format_progress(progress_events)

        file_note = ""
        if write_full_result_to and write_full_result_to.strip():
            out_path = _resolve_write_path(write_full_result_to.strip())
            await asyncio.to_thread(
                _write_full_result_json, out_path, job_id, columns, rows, total_rows
            )
            file_note = (
                f"\n\n📁 **完整结果已写入（JSON，未截断单元格）:**\n`{out_path}`\n"
                f"（writtenRows={len(rows)}, totalRows={total_rows}）\n"
                "下方为短预览；血缘长字段请以该文件为准。\n"
            )
            preview_rows = rows[: min(20, len(rows))]
            table = format_result_as_table(columns, preview_rows, cell_max_len=96)
            if len(rows) > len(preview_rows):
                table += f"\n\n… 预览仅含前 {len(preview_rows)} 行，共 {len(rows)} 行写入文件。"
        else:
            table = format_result_as_table(columns, rows, cell_max_len=effective_cell)

        if total_rows == 0 and sql_category == "METADATA":
            output = f"⚠️ 查询完成但返回 0 行（Presto）\n\n"
            output += f"Job ID: {job_id}\nSQL 类型: {sql_stmt_type}\n"
            output += f"查询进度: {progress_line}\n总耗时: {total_elapsed}s\n"
            output += (
                f"\n诊断: {sql_stmt_type} 在 DataSuite API 中执行成功但未返回数据。"
                f"这不代表表不存在，而是 API 对 {sql_stmt_type} 的支持不完整。"
            )
            output += metadata_warning
            return output

        output = f"✅ 查询成功\n\n"
        output += f"Job ID: {job_id}\n"
        if sql_stmt_type:
            output += f"SQL 类型: {sql_stmt_type}\n"
        output += f"查询进度: {progress_line}\n"
        output += f"总耗时: {total_elapsed}s\n"
        output += f"总行数: {total_rows}，显示行数: {len(rows)}\n"

        if total_rows == 0 and sql_category == "SELECT":
            output += "\n该查询返回 0 行数据，表确实为空或不满足 WHERE 条件。\n"

        if total_rows > max_rows:
            output += f"⚠️ 结果已截断（只拉取前 {max_rows} 行；若需更多可提高 max_rows，最大 2000）\n"
        output += file_note
        if total_rows > 0:
            output += f"\n{table}\n\n列名: {', '.join(columns)}"
        return output

    except requests.exceptions.RequestException as e:
        return f"❌ 请求失败: {str(e)}"
    except Exception as e:
        return f"❌ 执行错误: {str(e)}"


def main():
    mcp.run()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
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
import os
import sys
import time

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


def format_result_as_table(columns: list, rows: list) -> str:
    if not rows:
        return "(0 rows)"

    col_widths = {col: len(col) for col in columns}
    for row in rows:
        for col in columns:
            col_widths[col] = max(col_widths[col], min(len(str(row.get(col, ''))), 50))

    header = " | ".join(col.ljust(col_widths[col]) for col in columns)
    separator = "-|-".join("-" * col_widths[col] for col in columns)
    lines = [header, separator]

    for row in rows:
        values = []
        for col in columns:
            val = str(row.get(col, ''))
            if len(val) > 50:
                val = val[:47] + '...'
            values.append(val.ljust(col_widths[col]))
        lines.append(" | ".join(values))

    return "\n".join(lines)


@mcp.tool()
async def query_presto(
    sql: str,
    username: str = DEFAULT_USERNAME,
    queue: str = DEFAULT_QUEUE,
    region: str = DEFAULT_REGION,
    max_rows: int = 100
) -> str:
    """查询 Presto 数据库，执行只读 SELECT 查询。

    使用场景:
    - 查询表数据: SELECT * FROM table LIMIT 100
    - 统计行数: SELECT COUNT(*) FROM table
    - 条件查询: SELECT * FROM table WHERE condition
    - 分组统计: SELECT col, COUNT(*) FROM table GROUP BY col

    注意:
    - 只支持只读 SELECT 查询
    - SHOW 命令可能不被允许
    - 每次最多返回 2000 行（可通过 max_rows 参数限制）
    - 查询超时时间为 5 分钟

    Args:
        sql: 要执行的 SQL 查询语句（必须是只读的 SELECT 语句）
        username: 用户名（默认使用配置的用户名）
        queue: Presto 队列名称，szsc-adhoc 或 szsc-scheduled（默认 szsc-adhoc）
        region: IDC 集群，SG 或 US（默认 SG）
        max_rows: 最多返回行数（默认 100，最大 2000）
    """
    end_user = username if '@' in username else f"{username}@shopee.com"
    headers = {
        'Authorization': PERSONAL_TOKEN,
        'X-End-User': end_user,
        'Content-Type': 'application/json'
    }
    max_rows = min(max_rows, 2000)

    try:
        # 1. 提交查询（在线程池中执行，不阻塞事件循环）
        data = await asyncio.to_thread(
            _http_post,
            f"{BASE_URL}/query/presto",
            headers,
            {'sql': sql.strip(), 'prestoQueue': queue, 'idcRegion': region, 'priority': '3'}
        )
        job_id = data.get('jobId')
        if not job_id:
            return f"❌ 提交失败: {data.get('errorMsg', data.get('message', 'Unknown error'))}"

        # 2. 异步轮询状态（asyncio.sleep 不阻塞事件循环）
        start_time = time.time()
        while True:
            if time.time() - start_time > 300:
                return f"❌ 查询超时 (>300秒)\nJob ID: {job_id}"

            status_data = await asyncio.to_thread(
                _http_get, f"{BASE_URL}/status/{job_id}", headers
            )
            query_status = status_data.get('status')

            if query_status == 'FINISH':
                break
            elif query_status == 'FAILED':
                # 尝试多个可能的错误字段名，并附上完整响应便于调试
                err_msg = (
                    status_data.get('errorMessage')
                    or status_data.get('errorMsg')
                    or status_data.get('error')
                    or status_data.get('message')
                    or status_data.get('msg')
                    or str(status_data)  # fallback：输出完整响应
                )
                return f"❌ 查询失败\n\nJob ID: {job_id}\n错误: {err_msg}"
            elif query_status in ['RUNNING', 'PENDING', 'QUEUED']:
                await asyncio.sleep(2)  # 异步等待，不阻塞 MCP 心跳
            else:
                return f"❌ 未知状态: {query_status}\nJob ID: {job_id}"

        # 3. 获取结果
        result_data = await asyncio.to_thread(
            _http_get, f"{BASE_URL}/result/{job_id}", headers
        )
        if 'resultSchema' not in result_data:
            return f"❌ 获取结果失败: {result_data.get('errorMsg', 'Unknown error')}\nJob ID: {job_id}"

        columns = [col['columnName'] for col in result_data.get('resultSchema', [])]
        rows_raw = result_data.get('rows', [])
        total_rows = len(rows_raw)
        rows = [row.get('values', {}) for row in rows_raw[:max_rows]]

        table = format_result_as_table(columns, rows)
        output = f"✅ 查询成功\n\n"
        output += f"Job ID: {job_id}\n"
        output += f"总行数: {total_rows}，显示行数: {len(rows)}\n"
        if total_rows > max_rows:
            output += f"⚠️ 结果已截断（只显示前 {max_rows} 行）\n"
        output += f"\n{table}\n\n列名: {', '.join(columns)}"
        return output

    except requests.exceptions.RequestException as e:
        return f"❌ 请求失败: {str(e)}"
    except Exception as e:
        return f"❌ 执行错误: {str(e)}"


if __name__ == "__main__":
    mcp.run()

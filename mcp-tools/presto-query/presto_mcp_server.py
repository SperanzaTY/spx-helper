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

import os
import sys
import time
from typing import Optional

import requests
from mcp.server.fastmcp import FastMCP

# 从环境变量读取配置
PERSONAL_TOKEN = os.environ.get('PRESTO_PERSONAL_TOKEN', '')
DEFAULT_USERNAME = os.environ.get('PRESTO_USERNAME', '')
DEFAULT_QUEUE = os.environ.get('PRESTO_QUEUE', 'szsc-adhoc')
DEFAULT_REGION = os.environ.get('PRESTO_REGION', 'SG')

if not PERSONAL_TOKEN:
    print("错误: 未设置 PRESTO_PERSONAL_TOKEN 环境变量", file=sys.stderr)
    print("请在 mcp.json 中配置 env.PRESTO_PERSONAL_TOKEN", file=sys.stderr)
    sys.exit(1)

if not DEFAULT_USERNAME:
    print("错误: 未设置 PRESTO_USERNAME 环境变量", file=sys.stderr)
    print("请在 mcp.json 中配置 env.PRESTO_USERNAME", file=sys.stderr)
    sys.exit(1)

mcp = FastMCP("presto-query")


def run_presto_query(sql: str, username: str, queue: str, region: str, max_rows: int) -> dict:
    """执行 Presto 查询（提交 → 轮询 → 取结果）"""
    end_user = username if '@' in username else f"{username}@shopee.com"
    base_url = "https://open-api.datasuite.shopee.io/dataservice/personal"
    headers = {
        'Authorization': PERSONAL_TOKEN,
        'X-End-User': end_user,
        'Content-Type': 'application/json'
    }

    try:
        # 1. 提交查询
        response = requests.post(
            f"{base_url}/query/presto",
            headers=headers,
            json={'sql': sql.strip(), 'prestoQueue': queue, 'idcRegion': region, 'priority': '3'},
            timeout=10
        )
        response.raise_for_status()
        data = response.json()

        job_id = data.get('jobId')
        if not job_id:
            return {'success': False, 'error': f"提交失败: {data.get('errorMsg', data.get('message', 'Unknown error'))}"}

        # 2. 轮询状态
        start_time = time.time()
        while True:
            if time.time() - start_time > 300:
                return {'success': False, 'error': '查询超时 (>300秒)', 'jobId': job_id}

            status_resp = requests.get(f"{base_url}/status/{job_id}", headers=headers, timeout=10)
            status_resp.raise_for_status()
            status_data = status_resp.json()
            query_status = status_data.get('status')

            if query_status == 'FINISH':
                break
            elif query_status == 'FAILED':
                return {'success': False, 'error': f"查询失败: {status_data.get('errorMessage', 'Unknown error')}", 'jobId': job_id}
            elif query_status in ['RUNNING', 'PENDING', 'QUEUED']:
                time.sleep(2)
            else:
                return {'success': False, 'error': f'未知状态: {query_status}', 'jobId': job_id}

        # 3. 获取结果
        result_resp = requests.get(f"{base_url}/result/{job_id}", headers=headers, timeout=30)
        result_resp.raise_for_status()
        result_data = result_resp.json()

        if 'resultSchema' not in result_data:
            return {'success': False, 'error': f"获取结果失败: {result_data.get('errorMsg', 'Unknown error')}", 'jobId': job_id}

        columns = [col['columnName'] for col in result_data.get('resultSchema', [])]
        rows_raw = result_data.get('rows', [])
        total_rows = len(rows_raw)
        rows = [row.get('values', {}) for row in rows_raw[:max_rows]]

        return {
            'success': True,
            'jobId': job_id,
            'columns': columns,
            'rows': rows,
            'total_rows': total_rows,
            'displayed_rows': len(rows),
            'truncated': total_rows > max_rows
        }

    except requests.exceptions.RequestException as e:
        return {'success': False, 'error': f'请求失败: {str(e)}'}
    except Exception as e:
        return {'success': False, 'error': f'执行错误: {str(e)}'}


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
def query_presto(
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
    result = run_presto_query(
        sql=sql,
        username=username,
        queue=queue,
        region=region,
        max_rows=min(max_rows, 2000)
    )

    if not result['success']:
        error_msg = f"❌ 查询失败\n\n错误: {result['error']}"
        if 'jobId' in result:
            error_msg += f"\nJob ID: {result['jobId']}"
        return error_msg

    table = format_result_as_table(result['columns'], result['rows'])
    output = f"✅ 查询成功\n\n"
    output += f"Job ID: {result['jobId']}\n"
    output += f"总行数: {result['total_rows']}，显示行数: {result['displayed_rows']}\n"
    if result['truncated']:
        output += f"⚠️ 结果已截断（只显示前 {max_rows} 行）\n"
    output += f"\n{table}\n\n列名: {', '.join(result['columns'])}"
    return output


if __name__ == "__main__":
    mcp.run()

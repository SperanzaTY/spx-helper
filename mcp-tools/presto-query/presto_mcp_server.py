#!/usr/bin/env python3
"""
Presto MCP Server - 为Cursor提供Presto查询能力

这个MCP服务器允许AI助手直接查询Presto数据库

配置方式:
1. 设置环境变量:
   export PRESTO_PERSONAL_TOKEN="your_token"
   export PRESTO_USERNAME="your_username"

2. 或在mcp.json中配置:
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
import sys
import os
import requests
import time
from typing import Any
from mcp.server.models import InitializationOptions
from mcp.server import NotificationOptions, Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    Tool,
    TextContent,
    ImageContent,
    EmbeddedResource,
)

# 从环境变量读取配置
PERSONAL_TOKEN = os.environ.get('PRESTO_PERSONAL_TOKEN', '')
DEFAULT_USERNAME = os.environ.get('PRESTO_USERNAME', '')
DEFAULT_QUEUE = os.environ.get('PRESTO_QUEUE', 'szsc-adhoc')
DEFAULT_REGION = os.environ.get('PRESTO_REGION', 'SG')

# 验证必需的配置
if not PERSONAL_TOKEN:
    print("错误: 未设置 PRESTO_PERSONAL_TOKEN 环境变量", file=sys.stderr)
    print("请在 mcp.json 中配置 env.PRESTO_PERSONAL_TOKEN", file=sys.stderr)
    sys.exit(1)

if not DEFAULT_USERNAME:
    print("错误: 未设置 PRESTO_USERNAME 环境变量", file=sys.stderr)
    print("请在 mcp.json 中配置 env.PRESTO_USERNAME", file=sys.stderr)
    sys.exit(1)

server = Server("presto-query-server")


def query_presto(sql: str, username: str = DEFAULT_USERNAME, 
                 queue: str = DEFAULT_QUEUE, region: str = DEFAULT_REGION,
                 max_rows: int = 100) -> dict:
    """
    执行Presto查询
    
    Args:
        sql: SQL查询语句
        username: 用户名
        queue: Presto队列
        region: IDC集群 (SG 或 US)
        max_rows: 最多返回行数
        
    Returns:
        查询结果字典
    """
    # 确保用户名是邮箱格式
    end_user = username if '@' in username else f"{username}@shopee.com"
    base_url = "https://open-api.datasuite.shopee.io/dataservice/personal"
    
    headers = {
        'Authorization': PERSONAL_TOKEN,
        'X-End-User': end_user,
        'Content-Type': 'application/json'
    }
    
    # 1. 提交查询
    submit_url = f"{base_url}/query/presto"
    payload = {
        'sql': sql.strip(),
        'prestoQueue': queue,
        'idcRegion': region,
        'priority': '3'
    }
    
    try:
        response = requests.post(submit_url, headers=headers, json=payload, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        job_id = data.get('jobId')
        if not job_id:
            return {
                'success': False,
                'error': f"提交失败: {data.get('errorMsg', data.get('message', 'Unknown error'))}"
            }
        
        # 2. 轮询状态
        status_url = f"{base_url}/status/{job_id}"
        start_time = time.time()
        max_wait = 300  # 最多等待5分钟
        
        while True:
            if time.time() - start_time > max_wait:
                return {
                    'success': False,
                    'error': f'查询超时 (>{max_wait}秒)',
                    'jobId': job_id
                }
            
            status_response = requests.get(status_url, headers=headers, timeout=10)
            status_response.raise_for_status()
            status_data = status_response.json()
            
            query_status = status_data.get('status')
            
            if query_status == 'FINISH':
                break
            elif query_status == 'FAILED':
                return {
                    'success': False,
                    'error': f"查询失败: {status_data.get('errorMessage', 'Unknown error')}",
                    'jobId': job_id
                }
            elif query_status in ['RUNNING', 'PENDING', 'QUEUED']:
                time.sleep(2)
            else:
                return {
                    'success': False,
                    'error': f'未知状态: {query_status}',
                    'jobId': job_id
                }
        
        # 3. 获取结果
        result_url = f"{base_url}/result/{job_id}"
        result_response = requests.get(result_url, headers=headers, timeout=30)
        result_response.raise_for_status()
        result_data = result_response.json()
        
        if 'resultSchema' not in result_data:
            return {
                'success': False,
                'error': f"获取结果失败: {result_data.get('errorMsg', 'Unknown error')}",
                'jobId': job_id
            }
        
        # 解析结果
        columns = [col['columnName'] for col in result_data.get('resultSchema', [])]
        rows = []
        
        for row_data in result_data.get('rows', [])[:max_rows]:
            rows.append(row_data.get('values', {}))
        
        total_rows = len(result_data.get('rows', []))
        
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
        return {
            'success': False,
            'error': f'请求失败: {str(e)}'
        }
    except Exception as e:
        return {
            'success': False,
            'error': f'执行错误: {str(e)}'
        }


def format_result_as_table(columns: list, rows: list) -> str:
    """将查询结果格式化为表格字符串"""
    if not rows:
        return "(0 rows)"
    
    # 计算列宽
    col_widths = {col: len(col) for col in columns}
    
    for row in rows:
        for col in columns:
            value = str(row.get(col, ''))
            col_widths[col] = max(col_widths[col], min(len(value), 50))
    
    # 构建表格
    lines = []
    
    # 表头
    header = " | ".join(col.ljust(col_widths[col]) for col in columns)
    lines.append(header)
    lines.append("-" * len(header))
    
    # 数据行
    for row in rows:
        values = []
        for col in columns:
            value = str(row.get(col, ''))
            if len(value) > 50:
                value = value[:47] + '...'
            values.append(value.ljust(col_widths[col]))
        lines.append(" | ".join(values))
    
    return "\n".join(lines)


@server.list_tools()
async def handle_list_tools() -> list[Tool]:
    """列出可用的工具"""
    return [
        Tool(
            name="query_presto",
            description="""查询Presto数据库。可以执行SELECT查询来获取数据。

使用场景:
- 查询表数据: SELECT * FROM table LIMIT 100
- 统计行数: SELECT COUNT(*) FROM table
- 条件查询: SELECT * FROM table WHERE condition
- 分组统计: SELECT col, COUNT(*) FROM table GROUP BY col

注意:
- 只支持只读SELECT查询
- SHOW命令可能不被允许
- 每次最多返回2000行(可通过max_rows参数限制)
- 查询超时时间为5分钟""",
            inputSchema={
                "type": "object",
                "properties": {
                    "sql": {
                        "type": "string",
                        "description": "要执行的SQL查询语句(必须是只读的SELECT语句)"
                    },
                    "username": {
                        "type": "string",
                        "description": f"用户名(默认: {DEFAULT_USERNAME})",
                        "default": DEFAULT_USERNAME
                    },
                    "queue": {
                        "type": "string",
                        "description": "Presto队列名称(默认: szsc-adhoc)",
                        "default": DEFAULT_QUEUE,
                        "enum": ["szsc-adhoc", "szsc-scheduled"]
                    },
                    "region": {
                        "type": "string",
                        "description": "IDC集群(默认: SG)",
                        "default": DEFAULT_REGION,
                        "enum": ["SG", "US"]
                    },
                    "max_rows": {
                        "type": "integer",
                        "description": "最多返回行数(默认: 100，最大: 2000)",
                        "default": 100,
                        "minimum": 1,
                        "maximum": 2000
                    }
                },
                "required": ["sql"]
            }
        )
    ]


@server.call_tool()
async def handle_call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    """处理工具调用"""
    if name != "query_presto":
        raise ValueError(f"未知工具: {name}")
    
    sql = arguments.get("sql")
    if not sql:
        return [TextContent(type="text", text="错误: 缺少SQL参数")]
    
    username = arguments.get("username", DEFAULT_USERNAME)
    queue = arguments.get("queue", DEFAULT_QUEUE)
    region = arguments.get("region", DEFAULT_REGION)
    max_rows = arguments.get("max_rows", 100)
    
    # 执行查询
    result = query_presto(
        sql=sql,
        username=username,
        queue=queue,
        region=region,
        max_rows=max_rows
    )
    
    if not result['success']:
        error_msg = f"❌ 查询失败\n\n错误: {result['error']}"
        if 'jobId' in result:
            error_msg += f"\nJob ID: {result['jobId']}"
        return [TextContent(type="text", text=error_msg)]
    
    # 格式化成功结果
    table = format_result_as_table(result['columns'], result['rows'])
    
    output = f"✅ 查询成功\n\n"
    output += f"Job ID: {result['jobId']}\n"
    output += f"列数: {len(result['columns'])}\n"
    output += f"总行数: {result['total_rows']}\n"
    output += f"显示行数: {result['displayed_rows']}\n"
    
    if result['truncated']:
        output += f"⚠️ 结果已截断(只显示前{max_rows}行)\n"
    
    output += f"\n查询结果:\n\n{table}\n\n"
    output += f"列名: {', '.join(result['columns'])}"
    
    return [TextContent(type="text", text=output)]


async def main():
    """主函数"""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="presto-query",
                server_version="1.0.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


if __name__ == "__main__":
    asyncio.run(main())

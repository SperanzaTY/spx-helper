#!/usr/bin/env python3
"""
ClickHouse MCP Server - 为 Cursor 提供 ClickHouse 查询能力

一个 query_ck 工具，通过 env 参数区分环境：
- env=live：通过 internal_search API（JWT 认证）查询 LIVE 环境，需指定 cluster（ck2/ck6）
- env=test：直连 TEST 环境 ClickHouse（Basic Auth），支持 SELECT 和写入操作

配置方式（在 mcp.json 中）:
{
  "ck-query": {
    "command": "python3",
    "args": ["/path/to/ck_mcp_server.py"]
  }
}
"""

import base64
import hashlib
import hmac
import json
import time
from typing import Optional

import requests
import urllib3
from mcp.server.fastmcp import FastMCP

# 屏蔽 SSL 警告（TEST 直连走自签证书）
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ====== LIVE 环境：JWT 配置（与浏览器扩展保持一致）======
JWT_ACCOUNT = 'test_project_account'
JWT_SECRET = 'test10010'

# ====== LIVE 环境：CK 集群 API 地址 ======
CK_API_URLS = {
    'ck2': 'https://mgmt-data.ssc.test.shopeemobile.com/api_mart/mgmt_app/data_api/internal_search_ck2',
    'ck6': 'https://mgmt-data.ssc.test.shopeemobile.com/api_mart/mgmt_app/data_api/internal_search_ck6',
}

# ====== TEST 环境：直连配置（与浏览器扩展保持一致）======
TEST_CK_HOST = 'clickhouse-k8s-sg-prod.data-infra.shopee.io'
TEST_CK_PORT = '443'
TEST_CK_USER = 'spx_mart-cluster_szsc_data_shared_online'
TEST_CK_PASSWORD = 'RtL3jHWkDoHp'
TEST_CK_DATABASE = 'spx_mart_pub'

mcp = FastMCP("ck-query")


# ==================== LIVE 环境工具函数 ====================

def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')


def generate_jwt_token() -> str:
    """生成 ApiMart JWT Token（HS256，与浏览器扩展逻辑一致）"""
    header = {'alg': 'HS256', 'typ': 'JWT', 'account': JWT_ACCOUNT}
    payload = {'timestamp': int(time.time())}
    header_encoded = base64url_encode(json.dumps(header, separators=(',', ':')).encode())
    payload_encoded = base64url_encode(json.dumps(payload, separators=(',', ':')).encode())
    signing_input = f"{header_encoded}.{payload_encoded}"
    signature = hmac.new(JWT_SECRET.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{base64url_encode(signature)}"


def ensure_flag_suffix(sql: str) -> str:
    """LIVE API 要求 SQL 最后一列为 '1 as flag'，自动补充"""
    sql_stripped = sql.strip().rstrip(';')
    if not sql_stripped.lower().endswith(', 1 as flag') and \
       not sql_stripped.lower().endswith(',1 as flag'):
        sql_stripped += ', 1 as flag'
    return sql_stripped


def execute_live(sql: str, cluster: str, max_rows: int) -> dict:
    """通过 API 查询 LIVE 环境 ClickHouse"""
    api_url = CK_API_URLS.get(cluster)
    if not api_url:
        return {'success': False, 'error': f'不支持的集群: {cluster}，可选值为 ck2、ck6'}

    try:
        response = requests.post(
            api_url,
            headers={'Content-Type': 'application/json', 'jwt-token': generate_jwt_token()},
            json={'sql': ensure_flag_suffix(sql)},
            timeout=60
        )
        response.raise_for_status()
        result = response.json()

        if result.get('retcode') != 0:
            return {'success': False, 'error': result.get('message', '未知业务错误')}

        rows_raw = result.get('data', {}).get('list', [])
        columns = [c for c in (list(rows_raw[0].keys()) if rows_raw else []) if c != 'flag']
        total_rows = len(rows_raw)
        rows = [{k: v for k, v in row.items() if k != 'flag'} for row in rows_raw[:max_rows]]

        return {'success': True, 'columns': columns, 'rows': rows,
                'total_rows': total_rows, 'displayed_rows': len(rows),
                'truncated': total_rows > max_rows, 'is_write': False}

    except requests.exceptions.RequestException as e:
        return {'success': False, 'error': f'请求失败: {str(e)}'}
    except Exception as e:
        return {'success': False, 'error': f'执行错误: {str(e)}'}


# ==================== TEST 环境工具函数 ====================

def execute_test(sql: str, database: str, max_rows: int) -> dict:
    """直连 TEST 环境 ClickHouse（HTTPS + Basic Auth），支持 SELECT 和写入"""
    url = f"https://{TEST_CK_HOST}:{TEST_CK_PORT}/"
    basic_auth = base64.b64encode(f"{TEST_CK_USER}:{TEST_CK_PASSWORD}".encode()).decode()
    headers = {'Authorization': f'Basic {basic_auth}', 'Content-Type': 'text/plain'}
    sql_stripped = sql.strip().rstrip(';')
    is_select = sql_stripped.lstrip().upper().startswith('SELECT')

    try:
        if not is_select:
            response = requests.post(url, headers=headers, data=sql_stripped,
                                     params={'database': database}, timeout=60, verify=False)
            response.raise_for_status()
            return {'success': True, 'is_write': True,
                    'message': response.text.strip() or '执行成功'}

        # SELECT：追加 FORMAT TabSeparatedWithNames 获取列名
        query_sql = sql_stripped if 'format' in sql_stripped.lower() \
            else sql_stripped + ' FORMAT TabSeparatedWithNames'

        response = requests.post(url, headers=headers, data=query_sql,
                                 params={'database': database}, timeout=60, verify=False)
        response.raise_for_status()

        lines = [l for l in response.text.strip().splitlines() if l]
        if not lines:
            return {'success': True, 'is_write': False, 'columns': [], 'rows': [],
                    'total_rows': 0, 'displayed_rows': 0, 'truncated': False}

        columns = lines[0].split('\t')
        total_rows = len(lines) - 1
        rows = [dict(zip(columns, line.split('\t'))) for line in lines[1:max_rows + 1]]

        return {'success': True, 'is_write': False, 'columns': columns, 'rows': rows,
                'total_rows': total_rows, 'displayed_rows': len(rows),
                'truncated': total_rows > max_rows}

    except requests.exceptions.RequestException as e:
        return {'success': False, 'error': f'请求失败: {str(e)}'}
    except Exception as e:
        return {'success': False, 'error': f'执行错误: {str(e)}'}


# ==================== 格式化输出 ====================

def format_result_as_table(columns: list, rows: list) -> str:
    if not rows:
        return "(0 rows)"

    col_widths = {col: len(col) for col in columns}
    for row in rows:
        for col in columns:
            col_widths[col] = max(col_widths[col], min(len(str(row.get(col, ''))), 60))

    header = " | ".join(col.ljust(col_widths[col]) for col in columns)
    separator = "-|-".join("-" * col_widths[col] for col in columns)
    lines = [header, separator]

    for row in rows:
        values = []
        for col in columns:
            val = str(row.get(col, ''))
            if len(val) > 60:
                val = val[:57] + '...'
            values.append(val.ljust(col_widths[col]))
        lines.append(" | ".join(values))

    return "\n".join(lines)


# ==================== MCP Tool ====================

@mcp.tool()
def query_ck(
    sql: str,
    env: str,
    cluster: Optional[str] = None,
    database: str = TEST_CK_DATABASE,
    max_rows: int = 200
) -> str:
    """查询 ClickHouse 数据库，通过 env 参数区分 LIVE / TEST 环境。

    【调用前必须确认以下两点】
    1. env（环境）：
       - live：查询 LIVE 生产数据（只读）
       - test：查询/写入 TEST 数据（支持 SELECT、INSERT、CREATE 等）
    2. 若 env=live，还需确认 cluster（集群）：
       - ck2：CK2 集群
       - ck6：CK6 集群

    如果用户未明确说明以上信息，请在调用前先问清楚。

    环境说明：
    - LIVE（env=live）：通过 API 网关查询，仅支持只读 SELECT，SQL 末尾会自动补充 ', 1 as flag'
    - TEST（env=test）：直连 TEST ClickHouse，支持读写操作，写入前需向用户确认，默认库：spx_mart_pub

    注意：
    - 每次最多返回 200 行（可通过 max_rows 调整，最大 1000）
    - 请求超时时间为 60 秒

    Args:
        sql: 要执行的 SQL 语句
        env: 环境，live（LIVE 只读）或 test（TEST 读写），调用前需向用户确认
        cluster: CK 集群（env=live 时必填）：ck2 或 ck6，调用前需向用户确认
        database: 目标数据库（env=test 时有效，默认：spx_mart_pub）
        max_rows: SELECT 最多返回行数（默认 200，最大 1000）
    """
    if env == "live":
        if not cluster:
            return "错误: env=live 时必须指定 cluster（ck2 或 ck6），请先询问用户"
        result = execute_live(sql=sql, cluster=cluster, max_rows=max_rows)
        env_label = f"LIVE {cluster}"

    elif env == "test":
        result = execute_test(sql=sql, database=database, max_rows=max_rows)
        env_label = f"TEST / {database}"

    else:
        return f"错误: 不支持的 env 值 '{env}'，请使用 live 或 test"

    if not result['success']:
        return f"❌ 执行失败（{env_label}）\n\n错误: {result['error']}"

    if result.get('is_write'):
        return f"✅ 执行成功（{env_label}）\n\n{result.get('message', '操作已完成')}"

    table = format_result_as_table(result['columns'], result['rows'])
    output = f"✅ 查询成功（{env_label}）\n\n"
    output += f"总行数: {result['total_rows']}，显示行数: {result['displayed_rows']}\n"
    if result['truncated']:
        output += f"⚠️ 结果已截断（只显示前 {max_rows} 行）\n"
    output += f"\n{table}"
    return output


if __name__ == "__main__":
    mcp.run()

#!/usr/bin/env python3
"""
ClickHouse MCP Server - 为 Cursor 提供 ClickHouse 查询能力

采用 DBeaver 直连方式：HTTP 接口 + Basic Auth，不使用 internal_search API。

cluster 可选值：
- test：测试集群 spx_mart_pub
- ddc：DDC 集群 spx_mart_ddc
- ck2 / online_2：ck2 写集群
- ck6 / online_6：ck6 写集群
- online_4：test 读集群
- ck5 / online_5：ck2 读集群
- ck7 / online_7：ck6 读集群

配置方式（在 mcp.json 中）:
{
  "ck-query": {
    "command": "python3",
    "args": ["/path/to/ck_mcp_server.py"]
  }
}
"""

import asyncio
import base64
from typing import Optional

import requests
import urllib3
from mcp.server.fastmcp import FastMCP

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ====== 统一密码 ======
CK_PASSWORD = 'RtL3jHWkDoHp'

# ====== 集群配置（DBeaver 直连方式：host + port + database + user）======
# 格式: (host, port, default_database, user)
# default_database 为空时，SQL 需使用 db.table 全限定名，或通过 database 参数指定
CK_CLUSTERS = {
    'test': (
        'clickhouse-k8s-sg-prod.data-infra.shopee.io',
        443,
        'spx_mart_pub',
        'spx_mart-cluster_szsc_data_shared_online',
    ),
    'ddc': (
        'clickhouse-k8s-sg-prod.data-infra.shopee.io',
        443,
        'spx_mart_ddc',
        'spx_mart-cluster_szsc_spx_mart_online',
    ),
    'online_2': (
        'clickhouse-k8s-sg-prod.data-infra.shopee.io',
        443,
        'spx_mart_manage_app',
        'spx_mart-cluster_szsc_spx_mart_online_2',
    ),
    'online_4': (
        'clickhouse-office-only-ytl.data-infra.shopee.io',
        443,
        'spx_mart_pub',
        'spx_mart-cluster_szsc_spx_mart_online_4',
    ),
    'online_5': (
        'clickhouse-office-only-ytl.data-infra.shopee.io',
        443,
        'spx_mart_manage_app',  # ck2 读集群
        'spx_mart-cluster_szsc_spx_mart_online_5',
    ),
    'online_6': (
        'clickhouse-k8s-sg-prod.data-infra.shopee.io',
        443,
        'spx_mart_manage_app',
        'spx_mart-cluster_szsc_spx_mart_online_6',
    ),
    'online_7': (
        'clickhouse-office-only-ytl.data-infra.shopee.io',
        443,
        'spx_mart_manage_app',  # ck6 读集群
        'spx_mart-cluster_szsc_spx_mart_online_7',
    ),
}
# 别名
CK_CLUSTERS['ck2'] = CK_CLUSTERS['online_2']
CK_CLUSTERS['ck6'] = CK_CLUSTERS['online_6']
CK_CLUSTERS['ck5'] = CK_CLUSTERS['online_5']  # ck2 读集群
CK_CLUSTERS['ck7'] = CK_CLUSTERS['online_7']  # ck6 读集群

mcp = FastMCP("ck-query")


def _format_error_detail(url: str, sql_sent: str, **extra) -> str:
    """汇总调试信息到错误详情"""
    sql_len = len(sql_sent)
    sql_preview = sql_sent[:500] + ('...' if sql_len > 500 else '')
    parts = [
        f"[调试] URL: {url}",
        f"[调试] SQL 长度: {sql_len} 字符",
        f"[调试] SQL 预览: {sql_preview}",
    ]
    for k, v in extra.items():
        if v is not None and v != '':
            parts.append(f"[调试] {k}: {v}")
    return "\n".join(parts)


def execute_direct(
    sql: str,
    cluster: str,
    database_override: Optional[str],
    max_rows: int,
) -> dict:
    """DBeaver 方式直连 ClickHouse：HTTP 接口 + Basic Auth"""
    cfg = CK_CLUSTERS.get(cluster)
    if not cfg:
        valid = ', '.join(sorted(set(k for k in CK_CLUSTERS if not k.startswith('ck')) | {'ck2', 'ck5', 'ck6', 'ck7'}))
        return {'success': False, 'error': f'不支持的集群: {cluster}，可选: {valid}'}

    host, port, default_db, user = cfg
    database = database_override or default_db or 'default'
    url = f"https://{host}:{port}/"
    basic_auth = base64.b64encode(f"{user}:{CK_PASSWORD}".encode()).decode()
    headers = {
        'Authorization': f'Basic {basic_auth}',
        'Content-Type': 'text/plain; charset=utf-8',
    }

    sql_stripped = sql.strip().rstrip(';')
    normalized = sql_stripped.lstrip().upper()
    # WITH...SELECT、SELECT、DESCRIBE、SHOW 等均为读操作，需 FORMAT 以便解析表头
    is_read_query = (
        normalized.startswith('SELECT')
        or normalized.startswith('WITH')
        or normalized.startswith('DESCRIBE')
        or normalized.startswith('DESC ')
        or normalized.startswith('SHOW')
    )
    query_sql = (
        sql_stripped
        if (not is_read_query or 'format' in sql_stripped.lower())
        else sql_stripped + ' FORMAT TabSeparatedWithNames'
    )
    sql_for_debug = query_sql if is_read_query else sql_stripped

    try:
        if not is_read_query:
            response = requests.post(
                url,
                headers=headers,
                data=sql_stripped.encode('utf-8'),
                params={'database': database},
                timeout=120,
                verify=False,
            )
            response.raise_for_status()
            return {'success': True, 'is_write': True, 'message': response.text.strip() or '执行成功'}

        params = {'database': database}
        response = requests.post(
            url,
            headers=headers,
            data=query_sql.encode('utf-8'),
            params=params,
            timeout=180,
            verify=False,
        )
        # 404 时重试：部分网关对 raw body 的 POST 返回 404，改用 form-data 的 query 字段
        if response.status_code == 404:
            response = requests.post(
                url,
                headers={'Authorization': headers['Authorization']},
                files={'query': (None, query_sql)},
                params=params,
                timeout=180,
                verify=False,
            )
        # ClickHouse 对“表不存在”等错误可能返回 404，需解析 body 中的实际错误
        if not response.ok:
            err_body = (response.text or '').strip()
            err_detail = err_body[:2000] + ('...' if len(err_body) > 2000 else '')
            detail = _format_error_detail(url, sql_for_debug, status_code=response.status_code)
            hint = ""
            if cluster in ('ck5', 'ck7', 'online_5', 'online_7') and 'UNKNOWN_TABLE' in err_body:
                hint = "\n\n💡 ck5/ck7 为读集群，表为子集。若表不存在，请改用 ck2 或 ck6（写集群表更全）。"
            return {
                'success': False,
                'error': f"ClickHouse 错误 (HTTP {response.status_code}):\n\n{err_detail or '(响应体为空)'}\n\n{detail}{hint}"
            }

        lines = [l for l in response.text.strip().splitlines() if l]
        if not lines:
            return {'success': True, 'is_write': False, 'columns': [], 'rows': [],
                    'total_rows': 0, 'displayed_rows': 0, 'truncated': False}

        columns = lines[0].split('\t')
        total_rows = len(lines) - 1
        rows = [dict(zip(columns, line.split('\t'))) for line in lines[1 : max_rows + 1]]

        return {'success': True, 'is_write': False, 'columns': columns, 'rows': rows,
                'total_rows': total_rows, 'displayed_rows': len(rows),
                'truncated': total_rows > max_rows}

    except requests.exceptions.Timeout:
        timeout_sec = 180 if is_read_query else 120
        detail = _format_error_detail(url, sql_for_debug, note=f"请求超时({timeout_sec}s)")
        return {'success': False, 'error': f"请求超时\n\n{detail}"}
    except requests.exceptions.RequestException as e:
        resp = e.response if hasattr(e, 'response') and e.response is not None else None
        body = (resp.text or '').strip()[:2000] if resp else ''
        detail = _format_error_detail(
            url, sql_for_debug,
            status_code=resp.status_code if resp else None,
        )
        # 优先展示响应体中的 ClickHouse 错误详情（适用于 HTTPError 等有 response 的情况）
        if body:
            status = resp.status_code if resp else '?'
            err_msg = f"ClickHouse 错误 (HTTP {status}):\n\n{body}\n\n{detail}\n\n原始异常: {str(e)}"
        else:
            err_msg = f"请求失败: {str(e)}\n\n{detail}"
        return {'success': False, 'error': err_msg}
    except Exception as e:
        import traceback
        detail = _format_error_detail(url, sql_for_debug, exception=str(e), traceback=traceback.format_exc())
        return {'success': False, 'error': f"执行错误: {str(e)}\n\n{detail}"}


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


@mcp.tool()
async def query_ck(
    sql: str = "",
    env: str = "",
    cluster: Optional[str] = None,
    database: Optional[str] = None,
    max_rows: int = 200
) -> str:
    """Query ClickHouse via HTTP + Basic Auth.

    IMPORTANT: sql and env are REQUIRED. You MUST provide them in every call.

    Args:
        sql: SQL statement (REQUIRED)
        env: "live" or "test" (REQUIRED)
        cluster: cluster name (REQUIRED when env=live): ddc, ck2, ck5, ck6, ck7, online_2/4/5/6/7
        database: override default database (optional)
        max_rows: max rows to return (default 200)

    Cluster info: test=spx_mart_pub, ck2/ck6=write clusters (most tables), ck5/ck7=read clusters (subset).
    If ck5/ck7 returns UNKNOWN_TABLE, use ck2/ck6 instead.
    """
    if not sql or not env:
        return (
            "ERROR: sql and env parameters are REQUIRED but were not provided.\n"
            "You MUST call this tool with both parameters.\n\n"
            "Example:\n"
            '  {"sql": "SELECT count() FROM spx_mart_manage_app.your_table", "env": "live", "cluster": "ck2"}\n\n'
            "Please retry with the correct parameters."
        )

    if env == "test":
        cluster_key = "test"
        db = database or "spx_mart_pub"
    elif env == "live":
        if not cluster:
            return "错误: env=live 时必须指定 cluster（ddc、ck2/ck5/ck6/ck7 或 online_2/4/5/6/7）"
        cluster_key = cluster
        db = database
    else:
        return f"错误: 不支持的 env '{env}'，请用 live 或 test"

    result = await asyncio.to_thread(execute_direct, sql, cluster_key, db, max_rows)
    env_label = f"{env.upper()} {cluster_key}"

    if not result['success']:
        return f"❌ 执行失败（{env_label}）\n\n错误: {result['error']}"

    if result.get('is_write'):
        return f"✅ 执行成功（{env_label}）\n\n{result.get('message', '操作已完成')}"

    table = format_result_as_table(result['columns'], result['rows'])
    output = f"✅ 查询成功（{env_label}）\n\n"
    output += f"总行数: {result['total_rows']}，显示: {result['displayed_rows']}\n"
    if result['truncated']:
        output += f"⚠️ 已截断（前 {max_rows} 行）\n"
    output += f"\n{table}"
    return output


def main():
    mcp.run()


if __name__ == "__main__":
    main()

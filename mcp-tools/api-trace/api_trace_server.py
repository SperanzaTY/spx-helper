#!/usr/bin/env python3
"""
API Trace MCP Server - API 血缘溯源与 Bug 定位工具

工作流程：
1. 根据 api_id 通过 Presto 查询 API 血缘信息（biz_sql、源表）
2. 解析 biz_sql，提取源表及字段
3. 直接用 Presto 查询源表数据（可自定义条件），不走 DataService 中间层
4. 返回溯源报告 + 可执行的 Presto 查询建议，辅助 Bug 定位

配合使用：
- 用 Cursor 浏览器（cursor-ide-browser）在页面获取问题元素对应的 API 信息
- 再用本工具溯源 + 用 query_presto / query_ck 进一步排查

配置方式（在 mcp.json 中）:
{
  "api-trace": {
    "command": "python3",
    "args": ["/path/to/api_trace_server.py"],
    "env": {
      "PRESTO_PERSONAL_TOKEN": "your_token",
      "PRESTO_USERNAME": "your_username"
    }
  }
}
"""

import asyncio
import os
import re
import sys
from typing import Optional

import requests
import time
from mcp.server.fastmcp import FastMCP

# 从环境变量读取 Presto 配置（与 presto_mcp_server 保持一致）
PERSONAL_TOKEN = os.environ.get('PRESTO_PERSONAL_TOKEN', '')
DEFAULT_USERNAME = os.environ.get('PRESTO_USERNAME', '')

if not PERSONAL_TOKEN:
    print("错误: 未设置 PRESTO_PERSONAL_TOKEN 环境变量", file=sys.stderr)
    sys.exit(1)
if not DEFAULT_USERNAME:
    print("错误: 未设置 PRESTO_USERNAME 环境变量", file=sys.stderr)
    sys.exit(1)

# API 血缘表（sls_mart 中的 API 元数据表）
LINEAGE_TABLE = os.environ.get(
    'LINEAGE_PRESTO_TABLE',
    'sls_mart.shopee_ssc_data_api_mart_db__api_mart_api_tab__reg_continuous_s0_live'
)

BASE_URL = "https://open-api.datasuite.shopee.io/dataservice/personal"

mcp = FastMCP("api-trace")


# ==================== Presto 查询工具函数 ====================

def _http_post(url, headers, payload, timeout=10):
    resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _http_get(url, headers, timeout=10):
    resp = requests.get(url, headers=headers, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


async def run_presto(sql: str, max_rows: int = 100) -> dict:
    """通过 Presto 执行 SQL，返回结构化结果"""
    end_user = DEFAULT_USERNAME if '@' in DEFAULT_USERNAME else f"{DEFAULT_USERNAME}@shopee.com"
    headers = {
        'Authorization': PERSONAL_TOKEN,
        'X-End-User': end_user,
        'Content-Type': 'application/json'
    }

    try:
        data = await asyncio.to_thread(
            _http_post,
            f"{BASE_URL}/query/presto",
            headers,
            {'sql': sql.strip(), 'prestoQueue': 'szsc-adhoc', 'idcRegion': 'SG', 'priority': '3'}
        )
        job_id = data.get('jobId')
        if not job_id:
            return {'success': False, 'error': f"提交失败: {data.get('errorMsg', 'Unknown')}"}

        start = time.time()
        while True:
            if time.time() - start > 120:
                return {'success': False, 'error': '查询超时（120秒）'}

            status = await asyncio.to_thread(_http_get, f"{BASE_URL}/status/{job_id}", headers)
            s = status.get('status')
            if s == 'FINISH':
                break
            elif s == 'FAILED':
                return {'success': False, 'error': f"查询失败: {status.get('errorMessage', '')}"}
            await asyncio.sleep(2)

        result = await asyncio.to_thread(_http_get, f"{BASE_URL}/result/{job_id}", headers)
        if 'resultSchema' not in result:
            return {'success': False, 'error': '获取结果失败'}

        columns = [c['columnName'] for c in result.get('resultSchema', [])]
        rows = [row.get('values', {}) for row in result.get('rows', [])[:max_rows]]
        return {'success': True, 'columns': columns, 'rows': rows, 'total': len(result.get('rows', []))}

    except Exception as e:
        return {'success': False, 'error': str(e)}


# ==================== 血缘解析工具函数 ====================

def extract_tables_from_sql(sql: str) -> list[dict]:
    """从 biz_sql 中解析源表（db.table 格式）"""
    tables = []
    seen = set()

    # 匹配 FROM / JOIN 后的 db.table 或 {var}.table
    pattern = r'\b(?:from|join)\s+([\w\{\}]+)\.([\w\{\}\-]+)(?:\s+(?:as\s+)?[\w]+)?'
    for m in re.finditer(pattern, sql, re.IGNORECASE):
        db, table = m.group(1), m.group(2)
        key = f"{db}.{table}"
        if key not in seen:
            seen.add(key)
            tables.append({'database': db, 'table': table, 'full': key})

    return tables


def extract_select_columns(sql: str) -> list[str]:
    """提取 SELECT 字段列表（简化版）"""
    m = re.search(r'\bSELECT\s+(.*?)\s+FROM\b', sql, re.IGNORECASE | re.DOTALL)
    if not m:
        return []
    cols_str = m.group(1)
    cols = [c.strip() for c in cols_str.split(',')]
    # 去掉注释和复杂表达式，只保留简单字段名
    simple = []
    for c in cols[:20]:  # 最多显示20列
        c = re.sub(r'/\*.*?\*/', '', c).strip()
        simple.append(c)
    return simple


def replace_sql_placeholders(sql: str) -> str:
    """替换 biz_sql 中的占位符为可执行形式（仅展示用）"""
    sql = re.sub(r'\{mgmt_db2\}', 'spx_mart_manage_app', sql)
    sql = re.sub(r'\{mgmt_db\}', 'spx_mart_manage_app', sql)
    sql = re.sub(r'\{ds_db\}', 'spx_mart', sql)
    sql = re.sub(r'\{date\}', 'CURRENT_DATE', sql)
    sql = re.sub(r'\{market\}', "'sg'", sql)
    return sql


def format_table(columns, rows):
    if not rows:
        return "(0 rows)"
    col_widths = {c: len(c) for c in columns}
    for row in rows:
        for c in columns:
            col_widths[c] = max(col_widths[c], min(len(str(row.get(c, ''))), 50))
    header = " | ".join(c.ljust(col_widths[c]) for c in columns)
    sep = "-|-".join("-" * col_widths[c] for c in columns)
    lines = [header, sep]
    for row in rows:
        vals = []
        for c in columns:
            v = str(row.get(c, ''))
            vals.append((v[:47] + '...').ljust(col_widths[c]) if len(v) > 50 else v.ljust(col_widths[c]))
        lines.append(" | ".join(vals))
    return "\n".join(lines)


# ==================== MCP Tool ====================

@mcp.tool()
async def api_trace(
    api_id: str,
    issue_description: str = "",
    custom_where: str = "",
    api_response_sample: str = "",
    query_source_data: bool = True,
    max_rows: int = 20
) -> str:
    """API 血缘溯源与 Bug 定位工具。

    根据 api_id 查询 API 的数据血缘（biz_sql、源表），直接通过 Presto 查询源表原始数据，
    帮助定位数据问题（字段错误、数据缺失、数值偏差等）。

    典型使用场景：
    1. 通过 Cursor 浏览器抓取页面网络请求，找到问题数据对应的 API URL
    2. 从 URL 提取 api_id，调用本工具溯源
    3. 结合 issue_description 和 api_response_sample 进行对比分析

    api_id 提取方式：
    - API URL 通常包含 api_id，如 /api/xxx/get_station_info → api_id = "get_station_info"
    - 或直接传完整路径如 "spx_mart.get_station_list"

    Args:
        api_id: API 标识符，从网络请求 URL 中提取
        issue_description: 问题描述，如"站点数量显示不正确"、"某字段为空"
        custom_where: 自定义 WHERE 条件，用于精准查询源表，如 "station_id = 123 AND market = 'sg'"
        api_response_sample: 粘贴 API 响应中问题数据的 JSON 片段（用于与源表数据对比）
        query_source_data: 是否直接查询源表数据（默认 True），False 则只返回血缘信息
        max_rows: 源表查询返回行数（默认 20）
    """
    output = []
    output.append(f"# API 溯源报告：{api_id}")
    if issue_description:
        output.append(f"\n**问题描述**: {issue_description}\n")

    # ===== Step 1：查询 API 血缘信息 =====
    output.append("## Step 1：查询 API 血缘信息")
    output.append(f"查询表：`{LINEAGE_TABLE}`\n")

    lineage_sql = f"""
SELECT
    api_id,
    api_version,
    biz_sql,
    ds_id,
    publish_env,
    array_join(
        array_distinct(
            regexp_extract_all(biz_sql, '\\{{mgmt_db2\\}}\\.([a-zA-Z0-9_{{}}\\-]+)', 1)
        ), ', '
    ) AS mgmt_tables,
    array_join(
        array_distinct(
            regexp_extract_all(
                lower(biz_sql),
                '\\bfrom\\s+([a-zA-Z0-9_]+\\.[a-zA-Z0-9_{{}}\\-]+)',
                1
            )
        ), ', '
    ) AS all_tables
FROM (
    SELECT *,
           row_number() OVER (PARTITION BY api_id ORDER BY api_version DESC) AS rn
    FROM {LINEAGE_TABLE}
    WHERE publish_env = 'live'
      AND api_id LIKE '%{api_id}%'
)
WHERE rn = 1
ORDER BY api_id ASC
LIMIT 5
"""
    lineage_result = await run_presto(lineage_sql, max_rows=5)

    if not lineage_result['success']:
        # 血缘表名可能不对，返回错误和建议
        output.append(f"⚠️ 血缘查询失败：{lineage_result['error']}")
        output.append(f"\n**提示**：血缘表名 `{LINEAGE_TABLE}` 可能需要调整，")
        output.append("可通过环境变量 `LINEAGE_PRESTO_TABLE` 配置正确的表名。")
        output.append("\n**备用方案**：请手动提供 biz_sql，或通过浏览器扩展查看 API 血缘后粘贴 SQL。")
        return "\n".join(output)

    if not lineage_result['rows']:
        output.append(f"⚠️ 未找到 api_id 包含 `{api_id}` 的血缘记录（live 环境）")
        output.append("\n**建议**：")
        output.append(f"- 确认 api_id 是否正确（当前：`{api_id}`）")
        output.append("- 尝试使用更短的关键词，如 URL 中的最后一段路径")
        return "\n".join(output)

    # 取最新版本
    row = lineage_result['rows'][0]
    found_api_id = row.get('api_id', api_id)
    api_version = row.get('api_version', 'unknown')
    biz_sql = row.get('biz_sql', '')
    ds_id = row.get('ds_id', '')
    mgmt_tables_str = row.get('mgmt_tables', '')
    all_tables_str = row.get('all_tables', '')

    output.append(f"✅ 找到血缘记录")
    output.append(f"- **api_id**: `{found_api_id}`")
    output.append(f"- **api_version**: `{api_version}`")
    output.append(f"- **ds_id**: `{ds_id}`")

    # ===== Step 2：解析 biz_sql =====
    output.append("\n## Step 2：biz_sql 解析")

    if not biz_sql:
        output.append("⚠️ biz_sql 为空，无法继续溯源")
        return "\n".join(output)

    # 用 Presto 已解析的表名结果
    mgmt_tables = [t.strip() for t in mgmt_tables_str.split(',') if t.strip()]
    all_tables_raw = [t.strip() for t in all_tables_str.split(',') if t.strip()]
    # 去掉 {mgmt_db2} 占位符表，用真实库名替换后加回
    all_tables = []
    seen = set()
    for t in all_tables_raw:
        t_replaced = replace_sql_placeholders(t)
        if t_replaced not in seen:
            seen.add(t_replaced)
            all_tables.append(t_replaced)

    tables = extract_tables_from_sql(biz_sql)
    columns = extract_select_columns(biz_sql)
    readable_sql = replace_sql_placeholders(biz_sql)

    # 检测 dynamic where（条件 SQL 特征）
    has_dynamic_where = bool(
        re.search(r'\$\{|#\{|\{where\}|\{filter\}|dynamic.*where|where.*dynamic', biz_sql, re.IGNORECASE)
    )

    if mgmt_tables:
        output.append(f"\n**{'{mgmt_db2}'} 源表**（已识别 {len(mgmt_tables)} 张）：")
        for t in mgmt_tables:
            output.append(f"  - `spx_mart_manage_app.{t}`")

    if all_tables:
        output.append(f"\n**所有源表**（FROM/JOIN 解析）：")
        for t in all_tables:
            output.append(f"  - `{t}`")

    if columns:
        output.append(f"\n**SELECT 字段**（前20列）：")
        output.append("  " + ", ".join(f"`{c}`" for c in columns[:20]))

    if has_dynamic_where:
        output.append("\n⚠️ **检测到 Dynamic WHERE**：biz_sql 中包含动态条件占位符，")
        output.append("  实际查询条件由调用方传入，直查源表时需手动补充 WHERE 条件。")

    output.append(f"\n**biz_sql**（占位符已替换）：")
    output.append("```sql")
    output.append(readable_sql.strip())
    output.append("```")

    # ===== Step 3：直接查询源表 =====
    if query_source_data and (mgmt_tables or all_tables):
        output.append("\n## Step 3：直接查询源表数据（Presto）")

        # 优先查 mgmt_db2 源表（最常见）
        query_tables = [f"spx_mart_manage_app.{t}" for t in mgmt_tables[:2]]
        if not query_tables:
            query_tables = all_tables[:2]

        for table_full in query_tables:
            where_clause = f"WHERE {custom_where}" if custom_where else ""
            source_sql = f"SELECT * FROM {table_full} {where_clause} LIMIT {max_rows}"

            output.append(f"\n### 源表：`{table_full}`")
            output.append(f"```sql\n{source_sql}\n```")

            source_result = await run_presto(source_sql, max_rows=max_rows)

            if not source_result['success']:
                output.append(f"⚠️ 查询失败：{source_result['error']}")
            elif not source_result['rows']:
                output.append(f"📭 查询返回 0 行" + (f"（WHERE: `{custom_where}`）" if custom_where else ""))
            else:
                table_str = format_table(source_result['columns'], source_result['rows'])
                output.append(f"返回 {source_result['total']} 行，显示前 {len(source_result['rows'])} 行：\n")
                output.append(table_str)

    # ===== Step 4：对比分析建议 =====
    output.append("\n## Step 4：分析建议")

    if api_response_sample:
        output.append(f"\n**API 响应样本**：")
        output.append(f"```json\n{api_response_sample[:2000]}\n```")
        output.append("\n请对比以上源表数据与 API 响应：")
        output.append("- 若源表数据正确但 API 响应错误 → 问题在 API 层（SQL 逻辑、字段映射）")
        output.append("- 若源表数据已错误 → 问题在上游数据处理或写入逻辑")
    else:
        output.append("\n**后续排查建议**：")
        if tables:
            output.append(f"1. 对比 API 响应与源表 `{tables[0]['full']}` 中的数据")
        output.append("2. 如有具体数据 ID，在 custom_where 中传入精准条件重新查询")
        output.append("3. 可用 `query_ck(env=live)` 查询 CK 层数据，对比 Presto 源表是否一致")
        output.append("4. 检查 biz_sql 中的 JOIN 逻辑和过滤条件是否符合预期")

    output.append(f"\n---\n*溯源完成，如需深入排查可继续使用 query_presto / query_ck 工具*")
    return "\n".join(output)


@mcp.tool()
async def get_api_lineage(api_id: str) -> str:
    """快速查询 API 血缘信息，只返回 biz_sql 和源表，不查询源数据。

    适合先快速了解 API 的数据来源，再决定如何进一步排查。

    Args:
        api_id: API 标识符
    """
    lineage_sql = f"""
SELECT
    api_id,
    api_version,
    biz_sql,
    ds_id,
    array_join(
        array_distinct(
            regexp_extract_all(biz_sql, '\\{{mgmt_db2\\}}\\.([a-zA-Z0-9_{{}}\\-]+)', 1)
        ), ', '
    ) AS mgmt_tables,
    array_join(
        array_distinct(
            regexp_extract_all(
                lower(biz_sql),
                '\\bfrom\\s+([a-zA-Z0-9_]+\\.[a-zA-Z0-9_{{}}\\-]+)',
                1
            )
        ), ', '
    ) AS all_tables
FROM (
    SELECT *,
           row_number() OVER (PARTITION BY api_id ORDER BY api_version DESC) AS rn
    FROM {LINEAGE_TABLE}
    WHERE publish_env = 'live'
      AND api_id LIKE '%{api_id}%'
)
WHERE rn = 1
ORDER BY api_id ASC
LIMIT 3
"""
    result = await run_presto(lineage_sql, max_rows=3)

    if not result['success']:
        return f"❌ 查询失败：{result['error']}\n\n血缘表：`{LINEAGE_TABLE}`"

    if not result['rows']:
        return f"未找到 `{api_id}` 的血缘记录（live 环境）"

    row = result['rows'][0]
    biz_sql = row.get('biz_sql', '')
    tables = extract_tables_from_sql(biz_sql)
    readable_sql = replace_sql_placeholders(biz_sql)
    mgmt_tables = [t.strip() for t in row.get('mgmt_tables', '').split(',') if t.strip()]
    has_dynamic = bool(re.search(r'\$\{|#\{|\{where\}|\{filter\}', biz_sql))

    out = [
        f"## API 血缘：{row.get('api_id')}",
        f"- 版本：{row.get('api_version')}",
        f"- ds_id：{row.get('ds_id')}",
    ]
    if has_dynamic:
        out.append("- ⚠️ 含 **Dynamic WHERE**（动态条件 SQL）")
    if mgmt_tables:
        out.append(f"\n**{{mgmt_db2}} 源表**：" + "、".join(f"`spx_mart_manage_app.{t}`" for t in mgmt_tables))
    out.append(f"\n**所有源表**：" + "、".join(f"`{t['full']}`" for t in tables))
    out.append(f"\n**biz_sql**：\n```sql\n{readable_sql.strip()}\n```")
    return "\n".join(out)


if __name__ == "__main__":
    mcp.run()

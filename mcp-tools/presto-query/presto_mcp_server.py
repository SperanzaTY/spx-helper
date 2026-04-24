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
DEFAULT_IDC = os.environ.get('PRESTO_IDC') or os.environ.get('PRESTO_REGION', 'sg')
DEFAULT_HTTP_CONNECT_TIMEOUT_SECONDS = float(
    os.environ.get('PRESTO_HTTP_CONNECT_TIMEOUT_SECONDS', '10')
)
DEFAULT_HTTP_READ_TIMEOUT_SECONDS = float(
    os.environ.get('PRESTO_HTTP_READ_TIMEOUT_SECONDS', '60')
)
DEFAULT_MAX_WAIT_SECONDS = int(os.environ.get('PRESTO_MAX_WAIT_SECONDS', '600'))

if not PERSONAL_TOKEN:
    print("错误: 未设置 PRESTO_PERSONAL_TOKEN 环境变量", file=sys.stderr)
    sys.exit(1)

if not DEFAULT_USERNAME:
    print("错误: 未设置 PRESTO_USERNAME 环境变量", file=sys.stderr)
    sys.exit(1)

mcp = FastMCP("presto-query")

BASE_URL = "https://open-api.datasuite.shopee.io/dataservice/personal"
DATASUITE_BASE_URL = "https://datasuite.shopee.io"
DATAMAP_API_PREFIX = "/datamap/api/v3"
DATASTUDIO_API_PREFIX = "/datastudio/api/v1"
DATASUITE_DOMAIN = "datasuite.shopee.io"


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


def _normalize_idc(idc: str) -> str:
    """将用户输入的 IDC 标识规范化为 DataSuite API 所需的值。"""
    normalized = (idc or DEFAULT_IDC or 'sg').strip().lower()
    if normalized not in {'sg', 'us'}:
        raise ValueError("idc 仅支持 `sg` 或 `us`，默认 `sg`")
    return normalized.upper()


def _normalize_metadata_idc(idc: str) -> Tuple[str, str]:
    """Return (DataStudio idcRegion, DataMap qualifiedName IDC suffix)."""
    normalized = (idc or DEFAULT_IDC or 'sg').strip().lower()
    if normalized in {'sg', 'singapore', ''}:
        return "SG", ""
    if normalized in {'us', 'useast', 'us-east', 'useast1'}:
        return "USEast", "USEast"
    raise ValueError("idc 仅支持 `sg` 或 `us`/`USEast`，默认 `sg`")


def _parse_table_ref(table_ref: str) -> Tuple[str, str]:
    """Parse database.table. Presto metadata lookup requires an explicit schema."""
    cleaned = table_ref.strip().strip("`").strip()
    cleaned = cleaned.replace('"', '').replace('`', '')
    parts = [p for p in cleaned.split('.') if p]
    if len(parts) == 2:
        return parts[0], parts[1]
    if len(parts) == 3:
        return parts[1], parts[2]
    raise ValueError("table_ref 必须包含 schema，例如 `spx_datamart.dwd_spx_fleet_order_di_id`")


def _qualified_name(database: str, table: str, engine: str = "hive", env: str = "prod", idc: str = "") -> str:
    env_part = f"{env}#{idc}" if idc else env
    return f"{engine}@{env_part}@{database}@{table}"


def _load_datasuite_cookies() -> Dict[str, str]:
    """Load DataSuite cookies using the shared chrome-auth package when available."""
    try:
        from chrome_auth import get_auth  # type: ignore

        result = get_auth(DATASUITE_DOMAIN)
        if result.ok and result.cookies:
            return result.cookies
    except Exception:
        pass

    try:
        import browser_cookie3  # type: ignore

        jar = browser_cookie3.chrome(domain_name=DATASUITE_DOMAIN)
        cookies = {c.name: c.value for c in jar}
        if cookies:
            return cookies
    except Exception as exc:
        raise RuntimeError(
            "无法读取 DataSuite 登录态。请用仓库统一 launcher 启动 MCP："
            "`bash scripts/codex-mcp-launch.sh presto-query`，或先运行 "
            "`bash scripts/setup-mcp-env.sh` 后重启 MCP。"
        ) from exc

    raise RuntimeError(
        f"没有找到 {DATASUITE_DOMAIN} 的 Chrome Cookie。请先在 Chrome 打开 "
        f"{DATASUITE_BASE_URL}/studio 并确认已登录。"
    )


def _datasuite_get(path: str, params: dict, *, prefix: str) -> Any:
    cookies = _load_datasuite_cookies()
    headers = {
        "accept": "application/json, text/plain, */*",
        "referer": f"{DATASUITE_BASE_URL}/studio",
        "user-agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
        ),
    }
    if "CSRF-TOKEN" in cookies:
        headers["x-csrf-token"] = cookies["CSRF-TOKEN"]

    resp = requests.get(
        f"{DATASUITE_BASE_URL}{prefix}{path}",
        params=params,
        cookies=cookies,
        headers=headers,
        timeout=30,
    )
    if resp.status_code in (401, 403):
        raise RuntimeError(
            f"DataSuite 认证失败 ({resp.status_code})。请刷新 Chrome 中的 "
            f"{DATASUITE_BASE_URL}/studio 登录态后重启 MCP。"
        )
    resp.raise_for_status()
    body = resp.json()
    if isinstance(body, dict) and "success" in body:
        if not body.get("success"):
            raise RuntimeError(f"DataSuite API error {body.get('code')}: {body.get('message') or body.get('msg')}")
        return body.get("data")
    return body


def _format_bytes(value: Any) -> str:
    try:
        size = float(value)
    except (TypeError, ValueError):
        return str(value or "")
    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.2f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024


def _metadata_guidance(stmt_type: str, sql: str) -> str:
    return (
        f"❌ 不要用 `query_presto` 执行 {stmt_type} 元数据语句。\n\n"
        f"{_format_sql_block(sql)}\n\n"
        "DataSuite Personal Presto API 对 `DESCRIBE` / `SHOW` / `information_schema` 支持不稳定，"
        "经常返回空结果或报错。请改用 MCP 工具：\n\n"
        "- 本 MCP 已提供: `get_presto_table_metadata(table_ref=\"schema.table\", idc=\"sg\")`\n"
        "- 若单独启用了 DataMap MCP，也可以用: `datamap-query.get_table_info` / `get_table_detail`\n\n"
        "拿到字段后，再用 `query_presto` 执行业务 SELECT。"
    )


def _looks_like_table_discovery_sql(sql: str) -> bool:
    """Detect SELECTs that use Presto metadata tables to search table names."""
    normalized = re.sub(r"\s+", " ", sql.strip().rstrip(";").lower())
    metadata_sources = (
        "information_schema.tables",
        "information_schema.columns",
        "system.jdbc.tables",
        "system.jdbc.columns",
    )
    if not any(source in normalized for source in metadata_sources):
        return False
    table_lookup_terms = (
        "table_name",
        "table_schema",
        "column_name",
        "regexp_like",
        " like ",
        " ilike ",
    )
    return any(term in normalized for term in table_lookup_terms)


def _extract_table_search_hint(sql: str) -> str:
    patterns = [
        r"(?:lower\s*\(\s*)?table_name(?:\s*\))?\s+(?:i?like)\s+['\"]%?([^%'\"\s]+)",
        r"regexp_like\s*\(\s*(?:lower\s*\(\s*)?table_name(?:\s*\))?\s*,\s*['\"]([^'\"]+)",
        r"table_name\s*=\s*['\"]([^'\"]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, sql, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return ""


def _table_search_guidance(sql: str) -> str:
    keyword = _extract_table_search_hint(sql)
    example = f'keyword="{keyword}"' if keyword else 'keyword="fleet_order"'
    return (
        "❌ 不要用 `query_presto` 查询 `information_schema` / `system.jdbc` 来按关键字找表。\n\n"
        f"{_format_sql_block(sql)}\n\n"
        "这类 SQL 在 DataSuite Personal Presto API 上容易慢、空结果或行为不稳定。"
        "请改用 MCP 表搜索工具，它走 DataStudio metadata search：\n\n"
        f"- `search_presto_tables({example}, schema=\"spx_datamart\", idc=\"sg\")`\n"
        "- 找到候选表后，再用 `get_presto_table_metadata(table_ref=\"schema.table\")` 查看字段和分区。\n"
    )


def _validate_identifier(identifier: str, label: str = "identifier") -> str:
    cleaned = (identifier or "").strip().strip('"').strip("`")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", cleaned):
        raise ValueError(f"{label} 只能包含字母、数字、下划线，且不能以数字开头: {identifier}")
    return cleaned


def _quote_identifier(identifier: str) -> str:
    return f'"{_validate_identifier(identifier)}"'


def _format_table_name(database: str, table: str) -> str:
    return f"{_quote_identifier(database)}.{_quote_identifier(table)}"


def _parse_column_list(columns: str) -> List[str]:
    columns = (columns or "").strip()
    if not columns or columns == "*":
        return ["*"]
    parsed = []
    for col in columns.split(","):
        parsed.append(_validate_identifier(col.strip(), "column"))
    return parsed


def _validate_sql_filter(filter_sql: str, label: str = "filter") -> str:
    cleaned = (filter_sql or "").strip()
    if not cleaned:
        return ""
    forbidden = [";", "--", "/*", "*/"]
    if any(token in cleaned for token in forbidden):
        raise ValueError(f"{label} 不允许包含分号或 SQL 注释")
    if re.search(r"\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|merge)\b", cleaned, re.IGNORECASE):
        raise ValueError(f"{label} 只能是 WHERE 条件片段，不能包含写操作或 DDL")
    return cleaned


async def _get_table_columns_for_metadata(table_ref: str, idc: str) -> Tuple[str, str, str, List[Dict[str, Any]]]:
    database, table = _parse_table_ref(table_ref)
    idc_region, _ = _normalize_metadata_idc(idc)
    columns = await asyncio.to_thread(
        _datasuite_get,
        "/metadata/queryColumn",
        {
            "schema": database,
            "tableName": table,
            "storageType": "HIVE",
            "idcRegion": idc_region,
        },
        prefix=DATASTUDIO_API_PREFIX,
    )
    return database, table, idc_region, columns if isinstance(columns, list) else []


def _partition_columns(columns: List[Dict[str, Any]]) -> List[str]:
    return [str(c.get("name")) for c in columns if c.get("isPartition") and c.get("name")]


def _filter_mentions_any_column(filter_sql: str, columns: List[str]) -> bool:
    lowered = filter_sql.lower()
    return any(re.search(rf"\b{re.escape(col.lower())}\b", lowered) for col in columns)


def _first_referenced_table(sql: str) -> Optional[str]:
    match = re.search(
        r"\bfrom\s+([A-Za-z_][\w]*\.[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)?)",
        sql,
        re.IGNORECASE,
    )
    return match.group(1) if match else None


def _format_review_result(dimensions: List[Dict[str, Any]], score: int, passed: bool) -> str:
    total_issues = sum(len(d.get("issues", [])) for d in dimensions)
    lines = [
        "# Presto SQL Review",
        "",
        f"- **overall_score**: {score}/100",
        f"- **passed**: {str(passed).lower()}",
        f"- **total_issues**: {total_issues}",
        "",
    ]
    for dim in dimensions:
        lines.append(f"## {dim['name']} - {dim['status']}")
        issues = dim.get("issues") or []
        if not issues:
            lines.append("- No issues found.")
        for issue in issues:
            lines.append(
                f"- [{issue.get('severity', 'info')}] {issue.get('description', '')} "
                f"Suggestion: {issue.get('suggestion', '')}"
            )
        lines.append("")
    return "\n".join(lines).strip()


def _format_sql_block(sql: str) -> str:
    """在 MCP 返回中打印实际执行的 SQL。"""
    return f"执行 SQL:\n```sql\n{sql.strip()}\n```"


def _build_http_timeout(read_timeout_seconds: float) -> Tuple[float, float]:
    """requests 超时使用 (connect_timeout, read_timeout) 元组。"""
    return (DEFAULT_HTTP_CONNECT_TIMEOUT_SECONDS, read_timeout_seconds)


def _http_post(url: str, headers: dict, payload: dict, timeout: Tuple[float, float]) -> dict:
    """同步 POST，在线程池中执行"""
    resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _http_get(url: str, headers: dict, timeout: Tuple[float, float]) -> dict:
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
async def search_presto_tables(
    keyword: str,
    schema: str = "",
    idc: str = DEFAULT_IDC,
    max_results: int = 20,
    include_descriptions: bool = True,
) -> Any:
    """按关键字搜索 Presto/Hive 表。Agent 不要用 information_schema/LIKE 查表，改用此工具。

    用途:
    - 用户只给了表名关键词时，搜索相似表名
    - 在生成 SQL 前确认候选 schema.table
    - 替代 `SELECT ... FROM information_schema.tables WHERE table_name LIKE ...`

    Args:
        keyword: 表名或描述关键词，例如 `fleet_order`
        schema: 可选 schema 过滤，例如 `spx_datamart`
        idc: IDC，支持 `sg` 或 `us`/`USEast`，默认跟随 PRESTO_IDC/PRESTO_REGION
        max_results: 最多展示结果数，默认 20，最大 100
        include_descriptions: 是否展示表描述，默认 True
    """
    keyword = (keyword or "").strip()
    schema = (schema or "").strip()
    if not keyword:
        return "❌ 参数错误: keyword 不能为空。示例: `search_presto_tables(keyword=\"fleet_order\", schema=\"spx_datamart\")`"

    try:
        idc_region, _ = _normalize_metadata_idc(idc)
        page_size = max(1, min(int(max_results), 100))
        params = {
            "keyWord": keyword,
            "pageNo": 1,
            "pageSize": page_size,
            "idcRegion": idc_region,
        }
        if schema:
            params["schema"] = schema

        data = await asyncio.to_thread(
            _datasuite_get,
            "/metadata/search",
            params,
            prefix=DATASTUDIO_API_PREFIX,
        )
        data = data if isinstance(data, dict) else {}
        hits = data.get("highlightedTables") or data.get("items") or []
        total = data.get("total", len(hits))

        lines = [
            f"# Search Presto Tables: {keyword}",
            "",
            f"- **idcRegion**: {idc_region}",
            f"- **schema filter**: {schema or '(none)'}",
            f"- **total matches**: {total}",
            f"- **shown**: {len(hits)}",
            "",
            "| # | Table | Type | Region | Status | Size | Query Count | PIC |",
            "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
        for idx, hit in enumerate(hits, 1):
            entity = hit.get("tableEntity") if isinstance(hit, dict) else {}
            entity = entity if isinstance(entity, dict) else {}
            table_schema = entity.get("schema") or ""
            table_name = entity.get("name") or ""
            pics = entity.get("technicalPIC") or entity.get("pic") or []
            if isinstance(pics, str):
                pic_text = pics
            else:
                pic_text = ", ".join(str(pic) for pic in pics[:3])
            lines.append(
                f"| {idx} | `{table_schema}.{table_name}` | {entity.get('tableType') or ''} | "
                f"{entity.get('tableRegion') or ''} | {entity.get('tableStatus') or ''} | "
                f"{entity.get('dataSize') or ''} | {entity.get('queryCount') or ''} | {pic_text} |"
            )
            if include_descriptions and entity.get("description"):
                desc = str(entity.get("description") or "").replace("\n", " ").strip()
                if len(desc) > 260:
                    desc = desc[:257] + "..."
                lines.append(f"|  | Description |  |  |  |  |  | {desc.replace('|', '/')} |")

        if not hits:
            lines.append("")
            lines.append("未找到匹配表。可以放宽 schema 过滤或换一个关键词。")
        else:
            lines.append("")
            lines.append("下一步: 对候选表调用 `get_presto_table_metadata(table_ref=\"schema.table\")` 查看字段和分区。")

        return "\n".join(lines)
    except Exception as e:
        return (
            f"❌ 搜索表失败: {e}\n\n"
            "如果是登录态问题，请在 Chrome 打开 DataStudio/DataMap 确认已登录后重启 MCP。"
        )


@mcp.tool()
async def get_presto_table_metadata(
    table_ref: str,
    idc: str = DEFAULT_IDC,
    include_column_descriptions: bool = True,
    max_columns: int = 200,
) -> Any:
    """获取 Presto/Hive 表元数据。Agent 不要用 DESCRIBE/SHOW，改用此工具。

    用途:
    - 查看字段名、字段类型、分区字段、字段描述
    - 查看表描述、HDFS 路径、表大小、更新频率、Owner/PIC、最近查询量
    - 在生成 SELECT 前确认 schema，避免 `DESCRIBE table` 在 DataSuite Presto API 中报错

    Args:
        table_ref: 表名，必须包含 schema，例如 `spx_datamart.dwd_spx_fleet_order_di_id`
        idc: IDC，支持 `sg` 或 `us`/`USEast`，默认跟随 PRESTO_IDC/PRESTO_REGION
        include_column_descriptions: 是否返回字段描述，默认 True
        max_columns: 最多展示字段数，默认 200
    """
    try:
        database, table = _parse_table_ref(table_ref)
        idc_region, qn_idc = _normalize_metadata_idc(idc)
        qn = _qualified_name(database, table, idc=qn_idc)

        info = await asyncio.to_thread(
            _datasuite_get,
            f"/dataWarehouse/HIVE/info",
            {"qualifiedName": qn},
            prefix=DATAMAP_API_PREFIX,
        )
        detail = await asyncio.to_thread(
            _datasuite_get,
            f"/dataWarehouse/HIVE/expandDetail",
            {"qualifiedName": qn},
            prefix=DATAMAP_API_PREFIX,
        )
        columns = await asyncio.to_thread(
            _datasuite_get,
            "/metadata/queryColumn",
            {
                "schema": database,
                "tableName": table,
                "storageType": "HIVE",
                "idcRegion": idc_region,
            },
            prefix=DATASTUDIO_API_PREFIX,
        )

        info = info if isinstance(info, dict) else {}
        detail = detail if isinstance(detail, dict) else {}
        columns = columns if isinstance(columns, list) else []
        max_columns = max(1, min(max_columns, 2000))
        shown_columns = columns[:max_columns]
        partition_columns = [c.get("name", "") for c in columns if c.get("isPartition")]
        technical_pics = (
            info.get("technicalPIC")
            or detail.get("displayTechnicalPIC")
            or detail.get("techPics")
            or []
        )

        lines = [
            f"# {database}.{table}",
            "",
            f"- **idcRegion**: {idc_region}",
            f"- **description**: {info.get('description') or detail.get('description') or ''}",
            f"- **location**: {info.get('hdfsPath') or ''}",
            f"- **dataSize**: {_format_bytes(info.get('tableSize'))}",
            f"- **tableStatus**: {info.get('tableStatus') or ''}",
            f"- **warehouseLayer**: {info.get('dataWarehouseLayer') or ''}",
            f"- **marketRegion**: {info.get('region') or detail.get('region') or ''}",
            f"- **updateFrequency**: {(info.get('updateFrequency') or {}).get('frequency') or info.get('updateFrequency') or ''}",
            f"- **lastUpdateTime**: {info.get('lastUpdateTime') or detail.get('lastUpdateTime') or ''}",
            f"- **taskOwner**: {info.get('taskOwner') or detail.get('taskOwner') or ''}",
            f"- **technicalPIC**: {', '.join(technical_pics)}",
            f"- **last7daysQueryCount**: {info.get('last7daysQueryCount') or detail.get('last7daysQueryCount') or ''}",
            f"- **partitionColumns**: {', '.join(partition_columns) if partition_columns else '(none)'}",
            "",
        ]

        if include_column_descriptions:
            lines.append("| Column | Type | Partition | Description |")
            lines.append("| --- | --- | --- | --- |")
            for col in shown_columns:
                lines.append(
                    f"| {col.get('name', '')} | {col.get('dataType', '')} | "
                    f"{'Yes' if col.get('isPartition') else 'No'} | "
                    f"{str(col.get('description') or '').replace('|', '/')} |"
                )
        else:
            lines.append("| Column | Type | Partition |")
            lines.append("| --- | --- | --- |")
            for col in shown_columns:
                lines.append(
                    f"| {col.get('name', '')} | {col.get('dataType', '')} | "
                    f"{'Yes' if col.get('isPartition') else 'No'} |"
                )

        if len(columns) > len(shown_columns):
            lines.append("")
            lines.append(f"... truncated: showing {len(shown_columns)} of {len(columns)} columns. Increase max_columns if needed.")

        return "\n".join(lines)
    except Exception as e:
        return (
            f"❌ 获取表元数据失败: {e}\n\n"
            "请确认表名包含 schema，例如 `spx_datamart.dwd_spx_fleet_order_di_id`。"
            "如果是登录态问题，请在 Chrome 打开 DataStudio/DataMap 确认已登录后重启 MCP。"
        )


@mcp.tool()
async def preview_presto_table_data(
    table_ref: str,
    columns: str = "*",
    partition_filter: str = "",
    where_filter: str = "",
    limit: int = 10,
    idc: str = DEFAULT_IDC,
    require_partition_filter: bool = True,
) -> Any:
    """安全预览 Presto/Hive 表数据。

    Agent 不要直接生成 `SELECT * FROM huge_table LIMIT 10`。先用此工具，它会：
    - 自动加 LIMIT
    - 校验字段名和 filter 片段
    - 对分区表默认要求 partition_filter，避免误扫大表

    Args:
        table_ref: schema.table，例如 `spx_datamart.dwd_spx_fleet_order_di_id`
        columns: 逗号分隔字段名，默认 `*`
        partition_filter: 分区过滤条件片段，例如 `grass_date = '2026-04-24'`
        where_filter: 额外过滤条件片段，例如 `display_status = 1`
        limit: 返回行数，默认 10，最大 100
        idc: IDC，支持 `sg` 或 `us`
        require_partition_filter: 分区表是否强制要求 partition_filter，默认 True
    """
    try:
        database, table, idc_region, metadata_columns = await _get_table_columns_for_metadata(table_ref, idc)
        partitions = _partition_columns(metadata_columns)
        partition_filter = _validate_sql_filter(partition_filter, "partition_filter")
        where_filter = _validate_sql_filter(where_filter, "where_filter")

        if require_partition_filter and partitions and not _filter_mentions_any_column(partition_filter, partitions):
            return (
                "❌ 该表是分区表，预览前必须提供 partition_filter，避免误扫大表。\n\n"
                f"- table: `{database}.{table}`\n"
                f"- partition columns: {', '.join(partitions)}\n"
                "示例: `preview_presto_table_data(table_ref=\"schema.table\", partition_filter=\"grass_date = '2026-04-24'\")`"
            )

        selected_columns = _parse_column_list(columns)
        select_sql = "*" if selected_columns == ["*"] else ", ".join(_quote_identifier(c) for c in selected_columns)
        filters = [f for f in [partition_filter, where_filter] if f]
        where_sql = f" WHERE {' AND '.join(f'({f})' for f in filters)}" if filters else ""
        limit = max(1, min(int(limit), 100))
        sql = f"SELECT {select_sql} FROM {_format_table_name(database, table)}{where_sql} LIMIT {limit}"
        return await query_presto(sql=sql, idc=idc, max_rows=limit)
    except Exception as e:
        return f"❌ 预览表数据失败: {e}"


@mcp.tool()
async def get_presto_column_distinct_values(
    table_ref: str,
    column_name: str,
    partition_filter: str = "",
    where_filter: str = "",
    limit: int = 20,
    idc: str = DEFAULT_IDC,
    require_partition_filter: bool = True,
) -> Any:
    """查看某个字段的 Top N 枚举值/分布。

    用途:
    - 在写 WHERE 前确认字段值长什么样
    - 替代 agent 直接猜状态值、类型值、枚举值
    - 分区表默认要求 partition_filter，避免全表 GROUP BY

    Args:
        table_ref: schema.table
        column_name: 字段名
        partition_filter: 分区过滤条件片段，例如 `grass_date = '2026-04-24'`
        where_filter: 额外过滤条件片段
        limit: Top N，默认 20，最大 100
        idc: IDC，支持 `sg` 或 `us`
        require_partition_filter: 分区表是否强制要求 partition_filter，默认 True
    """
    try:
        database, table, _, metadata_columns = await _get_table_columns_for_metadata(table_ref, idc)
        valid_columns = {str(c.get("name")) for c in metadata_columns if c.get("name")}
        column_name = _validate_identifier(column_name, "column_name")
        if valid_columns and column_name not in valid_columns:
            sample = ", ".join(sorted(list(valid_columns))[:30])
            return f"❌ 字段 `{column_name}` 不在 `{database}.{table}` 元数据中。可用字段示例: {sample}"

        partitions = _partition_columns(metadata_columns)
        partition_filter = _validate_sql_filter(partition_filter, "partition_filter")
        where_filter = _validate_sql_filter(where_filter, "where_filter")
        if require_partition_filter and partitions and not _filter_mentions_any_column(partition_filter, partitions):
            return (
                "❌ 该表是分区表，统计字段分布前必须提供 partition_filter，避免全表 GROUP BY。\n\n"
                f"- table: `{database}.{table}`\n"
                f"- partition columns: {', '.join(partitions)}"
            )

        filters = [f for f in [partition_filter, where_filter] if f]
        where_sql = f" WHERE {' AND '.join(f'({f})' for f in filters)}" if filters else ""
        limit = max(1, min(int(limit), 100))
        col_sql = _quote_identifier(column_name)
        sql = (
            f"SELECT {col_sql} AS value, COUNT(*) AS cnt "
            f"FROM {_format_table_name(database, table)}"
            f"{where_sql} "
            f"GROUP BY {col_sql} "
            f"ORDER BY cnt DESC "
            f"LIMIT {limit}"
        )
        return await query_presto(sql=sql, idc=idc, max_rows=limit)
    except Exception as e:
        return f"❌ 获取字段枚举值失败: {e}"


@mcp.tool()
async def review_presto_sql(sql: str, table_context: str = "", idc: str = DEFAULT_IDC) -> Any:
    """规则化 review Presto SQL，检查常见正确性和性能风险，不执行 SQL。"""
    sql_clean = sql.strip().rstrip(";").strip()
    dimensions = [
        {"name": "Correctness", "status": "pass", "issues": []},
        {"name": "Security", "status": "pass", "issues": []},
        {"name": "Performance", "status": "pass", "issues": []},
        {"name": "Standards", "status": "pass", "issues": []},
    ]

    def add(dim_name: str, severity: str, description: str, suggestion: str) -> None:
        for dim in dimensions:
            if dim["name"] == dim_name:
                dim["issues"].append({
                    "severity": severity,
                    "description": description,
                    "suggestion": suggestion,
                })
                dim["status"] = "error" if severity in {"high", "critical"} else "warning"
                return

    if not re.match(r"^\s*(select|with|explain)\b", sql_clean, re.IGNORECASE):
        add("Security", "high", "SQL is not a read-only SELECT/WITH/EXPLAIN statement.", "Only run read-only analytical SQL through Presto MCP.")
    if re.search(r"\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|merge)\b", sql_clean, re.IGNORECASE):
        add("Security", "critical", "SQL contains write operation or DDL keyword.", "Remove write/DDL operations; this MCP is for read-only analysis.")
    if re.search(r"select\s+\*", sql_clean, re.IGNORECASE):
        add("Performance", "medium", "SELECT * is used and may fetch unnecessary columns.", "Select only required columns.")
    if not re.search(r"\blimit\s+\d+\b", sql_clean, re.IGNORECASE):
        add("Performance", "medium", "No LIMIT detected.", "Add LIMIT for exploration queries.")
    if re.search(r"\binformation_schema\.|system\.jdbc\.", sql_clean, re.IGNORECASE):
        add("Performance", "high", "SQL queries Presto metadata tables directly.", "Use search_presto_tables or get_presto_table_metadata instead.")

    table_ref = _first_referenced_table(sql_clean)
    if table_ref and "information_schema" not in table_ref.lower():
        try:
            _, _, _, metadata_columns = await _get_table_columns_for_metadata(table_ref, idc)
            partitions = _partition_columns(metadata_columns)
            if partitions and not _filter_mentions_any_column(sql_clean, partitions):
                add(
                    "Performance",
                    "high",
                    f"No partition filter detected for partitioned table `{table_ref}`.",
                    f"Add partition predicate on: {', '.join(partitions)}.",
                )
        except Exception:
            pass

    if re.search(r"\bwhere\b", sql_clean, re.IGNORECASE) is None and table_ref:
        add("Performance", "medium", "No WHERE clause detected.", "Add selective filters, especially date/partition filters.")
    if re.search(r"\b[A-Z]{2,}\b", sql_clean) and re.search(r"\bselect\b", sql_clean):
        add("Standards", "info", "Mixed SQL keyword casing detected.", "Use a consistent style; uppercase keywords and lowercase identifiers are preferred.")

    score = 100
    severity_penalty = {"critical": 35, "high": 25, "medium": 10, "low": 5, "info": 2}
    for dim in dimensions:
        for issue in dim["issues"]:
            score -= severity_penalty.get(issue.get("severity"), 2)
    score = max(0, score)
    passed = all(
        issue.get("severity") not in {"critical", "high"}
        for dim in dimensions
        for issue in dim["issues"]
    )
    result = _format_review_result(dimensions, score, passed)
    if table_context:
        result += f"\n\n## Provided Table Context\n{table_context.strip()}"
    return result


@mcp.tool()
async def explain_presto_sql(
    sql: str,
    idc: str = DEFAULT_IDC,
    explain_type: str = "DISTRIBUTED",
    max_rows: int = 50,
) -> Any:
    """执行 Presto EXPLAIN，查看 query plan / scan 风险。"""
    sql_clean = sql.strip().rstrip(";").strip()
    if not re.match(r"^\s*(select|with|explain)\b", sql_clean, re.IGNORECASE):
        return "❌ 只支持对 SELECT/WITH/EXPLAIN 做 query plan 分析。"
    if re.match(r"^\s*explain\b", sql_clean, re.IGNORECASE):
        explain_sql = sql_clean
    else:
        explain_type = explain_type.strip().upper()
        if explain_type not in {"LOGICAL", "DISTRIBUTED", "VALIDATE", "IO"}:
            return "❌ explain_type 仅支持 LOGICAL / DISTRIBUTED / VALIDATE / IO"
        explain_sql = f"EXPLAIN (TYPE {explain_type}) {sql_clean}"
    return await query_presto(sql=explain_sql, idc=idc, max_rows=max(1, min(int(max_rows), 200)))


@mcp.tool()
async def execute_datastudio_adhoc_query(
    content: str,
    engine_name: str = "prestosql",
    idc: str = DEFAULT_IDC,
    max_rows: int = 100,
    max_wait_seconds: int = DEFAULT_MAX_WAIT_SECONDS,
) -> Any:
    """执行 ad-hoc SQL。

    当前实现复用 DataSuite Personal Presto API 的稳定执行链路，适用于 `prestosql`。
    DataStudio 页面内置 Agent 的 adhoc submit endpoint 仍可继续逆向；在 payload 完全稳定前，
    MCP 不伪造前端 asset/editor 上下文。
    """
    if engine_name.lower() not in {"presto", "prestosql", "presto sql"}:
        return "❌ 当前只支持 prestosql。Spark/ClickHouse adhoc 需要单独实现对应 DataStudio 执行链路。"
    return await query_presto(
        sql=content,
        idc=idc,
        max_rows=max_rows,
        max_wait_seconds=max_wait_seconds,
    )


@mcp.tool()
async def query_presto(
    sql: str,
    username: str = DEFAULT_USERNAME,
    queue: str = DEFAULT_QUEUE,
    idc: str = DEFAULT_IDC,
    max_rows: int = 100,
    cell_max_len: int = 0,
    write_full_result_to: Optional[str] = None,
    max_wait_seconds: int = DEFAULT_MAX_WAIT_SECONDS,
    request_timeout_seconds: int = int(DEFAULT_HTTP_READ_TIMEOUT_SECONDS),
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
    - 不要用 SHOW / DESCRIBE / information_schema 查元数据；请调用 `get_presto_table_metadata`
    - 不要用 information_schema.tables LIKE 按关键字找表；请调用 `search_presto_tables`
    - DDL 语句（CREATE / ALTER / DROP）不被支持
    - 每次最多返回 2000 行（可通过 max_rows 参数限制）
    - 默认查询等待超时时间为 10 分钟，可通过 `max_wait_seconds` 调整
    - 单次 HTTP 请求默认读超时为 60 秒，可通过 `request_timeout_seconds` 调整
    - 环境变量 PRESTO_MCP_OUTPUT_DIR：write_full_result_to 为相对路径时的基准目录（默认进程 cwd）

    Args:
        sql: 要执行的 SQL 查询语句（必须是只读的 SELECT 语句）
        username: 用户名（默认使用配置的用户名）
        queue: Presto 队列名称，szsc-adhoc 或 szsc-scheduled（默认 szsc-adhoc）
        idc: IDC 集群，支持传 `sg` 或 `us`（默认 `sg`）
        max_rows: 最多返回行数（默认 100，最大 2000）
        cell_max_len: 表格展示时每个单元格最大字符数；**0 表示不截断**（适合 sink/source 长 JSON）；
            设为 50–120 可缩短 MCP 文本体积。默认 0。
        write_full_result_to: 若提供相对/绝对路径，将 **完整** 查询结果写入 UTF-8 JSON
           （columns + rows + jobId），便于后续脚本合并或写 Sheet；相对路径基于 PRESTO_MCP_OUTPUT_DIR 或 cwd。
            写入后回复中附带 **短预览表**（前若干行、单元格最多 96 字符），完整数据以文件为准。
        max_wait_seconds: 查询轮询的总等待时间（秒），默认 600，最大不做额外限制。
        request_timeout_seconds: 单次 HTTP 请求的读超时（秒），默认 60。
    """
    sql = sql.strip()
    sql_block = _format_sql_block(sql)
    sql_category, sql_stmt_type = _classify_sql(sql)

    if sql_category == "DDL":
        return (
            f"❌ 不支持执行（Presto API）\n\n"
            f"SQL 类型: {sql_stmt_type}（DDL 语句）\n"
            f"{sql_block}\n"
            f"DataSuite API 仅支持只读 SELECT 查询，不支持 {sql_stmt_type} 等 DDL 操作。"
        )

    if sql_category == "METADATA":
        return _metadata_guidance(sql_stmt_type or "METADATA", sql)

    if sql_category == "SELECT" and _looks_like_table_discovery_sql(sql):
        return _table_search_guidance(sql)

    end_user = username if '@' in username else f"{username}@shopee.com"
    try:
        normalized_idc = _normalize_idc(idc)
    except ValueError as e:
        return f"❌ 参数错误: {e}"

    headers = {
        'Authorization': PERSONAL_TOKEN,
        'X-End-User': end_user,
        'Content-Type': 'application/json'
    }
    max_rows = min(max_rows, 2000)
    effective_cell = cell_max_len if cell_max_len >= 0 else 0
    if max_wait_seconds <= 0:
        return "❌ 参数错误: max_wait_seconds 必须大于 0"
    if request_timeout_seconds <= 0:
        return "❌ 参数错误: request_timeout_seconds 必须大于 0"
    http_timeout = _build_http_timeout(float(request_timeout_seconds))

    try:
        data = await asyncio.to_thread(
            _http_post,
            f"{BASE_URL}/query/presto",
            headers,
            {'sql': sql, 'prestoQueue': queue, 'idcRegion': normalized_idc, 'priority': '3'},
            http_timeout,
        )
        job_id = data.get('jobId')
        if not job_id:
            err = (
                f"❌ 提交失败: {data.get('errorMsg', data.get('message', 'Unknown error'))}\n\n"
                f"{sql_block}"
            )
            if sql_category == "METADATA":
                err += f"\n\nSQL 类型: {sql_stmt_type}"
                err += metadata_warning
            return err

        start_time = time.time()
        progress_events = []
        last_status = None

        while True:
            elapsed = int(time.time() - start_time)
            if elapsed > max_wait_seconds:
                out = (
                    f"❌ 查询超时 (>{max_wait_seconds}秒)\n\nJob ID: {job_id}\nSQL 类型: {sql_stmt_type or sql_category}\n"
                    f"{sql_block}"
                )
                if sql_category == "METADATA":
                    out += metadata_warning
                return out

            status_data = await asyncio.to_thread(
                _http_get, f"{BASE_URL}/status/{job_id}", headers, http_timeout
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
                out = (
                    f"❌ 查询失败\n\nJob ID: {job_id}\nSQL 类型: {sql_stmt_type or sql_category}\n"
                    f"{sql_block}\n\n查询进度: {progress_line}\n总耗时: {elapsed}s\n\n错误: {err_msg}"
                )
                if sql_category == "METADATA":
                    out += metadata_warning
                return out
            elif query_status in ['RUNNING', 'PENDING', 'QUEUED']:
                await asyncio.sleep(2)
            else:
                return f"❌ 未知状态: {query_status}\nJob ID: {job_id}\n{sql_block}"

        result_data = await asyncio.to_thread(
            _http_get, f"{BASE_URL}/result/{job_id}", headers, http_timeout
        )
        if 'resultSchema' not in result_data:
            return f"❌ 获取结果失败: {result_data.get('errorMsg', 'Unknown error')}\nJob ID: {job_id}\n{sql_block}"

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
            output += f"{sql_block}\n"
            output += f"查询进度: {progress_line}\n总耗时: {total_elapsed}s\n"
            output += (
                f"\n诊断: {sql_stmt_type} 在 DataSuite API 中执行成功但未返回数据。"
                f"这不代表表不存在，而是 API 对 {sql_stmt_type} 的支持不完整。"
            )
            output += metadata_warning
            return output

        output = f"✅ 查询成功\n\n"
        output += f"Job ID: {job_id}\n"
        output += f"IDC: {normalized_idc.lower()}\n"
        if sql_stmt_type:
            output += f"SQL 类型: {sql_stmt_type}\n"
        output += f"{sql_block}\n"
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
        return f"❌ 请求失败: {str(e)}\n\n{sql_block}"
    except Exception as e:
        return f"❌ 执行错误: {str(e)}\n\n{sql_block}"


def main():
    mcp.run()


if __name__ == "__main__":
    main()

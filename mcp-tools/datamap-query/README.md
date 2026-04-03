# DataMap MCP Server

DataSuite DataMap 表元数据查询工具，让 Cursor AI 直连 DataMap 获取 Hive/ClickHouse/StarRocks 表的元数据信息。

## 功能说明

通过 DataMap Web API 查询表的元数据，包括：
- 表基本信息（Owner、描述、存储格式、分区等）
- 完整字段列表及字段详情
- 数据血缘关系（上下游表和任务）
- 使用统计与质量评分
- SLA 信息与审计日志
- 表搜索（关键词 / 全局搜索）

## 认证方式

自动从 Chrome 读取 `datasuite.shopee.io` 的 Cookie（与 scheduler-query 相同）。

**前置条件**：使用前请先在 Chrome 浏览器中登录 [DataSuite](https://datasuite.shopee.io)。

## 安装

### 方式一：本地路径（已克隆仓库）

在 `~/.cursor/mcp.json` 中添加：

```json
{
  "datamap-query": {
    "command": "python3",
    "args": ["path/to/mcp-tools/datamap-query/datamap_mcp_server.py"]
  }
}
```

### 方式二：GitLab uvx（免克隆）

```json
{
  "datamap-query": {
    "command": "uvx",
    "args": [
      "--from",
      "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/datamap-query",
      "datamap-mcp"
    ]
  }
}
```

## 工具列表

| 工具 | 说明 |
|------|------|
| `get_table_info(table_ref, engine?)` | 获取表基本信息（描述、Owner、分区、存储格式等） |
| `get_table_detail(table_ref, engine?)` | 获取表扩展详情（含完整字段元数据） |
| `get_column_detail(table_ref, column_name, engine?)` | 获取某一列的详细信息 |
| `get_partition_columns(table_ref, engine?)` | 获取表的分区字段列表 |
| `get_table_usage(table_ref, engine?)` | 获取表的使用统计（查询频次、热度） |
| `get_table_lineage(table_ref, engine?)` | 获取表的数据血缘关系 |
| `get_table_score(table_ref, score_type?, engine?)` | 获取表的质量评分（completeness/popularity） |
| `get_table_sla(table_ref, engine?)` | 获取表关联的 SLA 信息 |
| `list_schemas(engine?)` | 列出所有 schema（数据库） |
| `list_tables(database, engine?)` | 列出指定 schema 下的表 |
| `search_tables(keyword, engine?)` | 按关键词搜索表 |
| `search_global(keyword)` | 全局搜索（跨引擎、跨类型） |
| `get_table_audit_log(table_ref, engine?, page_size?)` | 获取表的变更审计日志 |

**`table_ref` 参数格式**：`"database.table"` 或 `"table"`（省略 database 默认使用 `spx_mart`）

**`engine` 参数**：默认 `HIVE`，也支持 `CLICKHOUSE`、`STARROCKS`

## 使用示例

在 Cursor 中直接用自然语言：

- "查一下 `spx_mart.dwd_spx_spsso_delivery_trajectory_di_br` 这个表的信息"
- "这个表的血缘关系是什么？上下游有哪些表？"
- "搜索包含 fleet_order 的表"
- "`dwd_spx_fleet_order_di_br` 的分区字段是什么？"
- "列出 spx_mart 下所有的表"

## 注意事项

- Cookie 有效期约 30 分钟自动刷新，如遇 401 错误请重新登录 DataSuite
- API 来自 DataMap 前端（非官方 Open API），接口格式可能随 DataMap 版本更新而变化

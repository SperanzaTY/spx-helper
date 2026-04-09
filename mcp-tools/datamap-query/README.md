# DataMap MCP Server

DataSuite DataMap 表元数据查询 + 写入工具，让 Cursor AI 直连 DataMap 获取和修改 Hive/ClickHouse/StarRocks 表的元数据信息。

## 功能说明

通过 DataMap Web API 查询表的元数据，包括：
- 表基本信息（Owner、描述、存储格式、分区等）
- 完整字段列表及字段详情
- 数据血缘关系（上下游表和任务）
- 使用统计与质量评分
- SLA 信息与审计日志
- 表搜索（关键词 / 全局搜索）

通过 DataMap Open API 修改表/字段元数据：
- 更新表描述、负责人、数仓分层等
- 更新字段描述、计算逻辑、枚举值等
- 内置 dry_run 模式预览变更

## 认证方式

### 查询操作（Chrome Cookie）

使用 [chrome-auth](../chrome-auth/README.md) 共享库自动从 Chrome 读取 `datasuite.shopee.io` 的 Cookie。

**前置条件**：
1. 安装 chrome-auth：`cd mcp-tools/chrome-auth && pip install -e .`
2. 在 Chrome 浏览器中登录 [DataSuite](https://datasuite.shopee.io)

### 写入操作（Open API Token）

`update_table_info` 和 `update_column_info` 使用 DataMap Open API，需要配置 Basic Auth Token：

在 MCP 配置中添加 `env` 字段：
```json
{
  "datamap-query": {
    "command": "python3",
    "args": ["/path/to/datamap_mcp_server.py"],
    "env": {
      "DATAMAP_OPEN_API_TOKEN": "Basic xxxxxx"
    }
  }
}
```

Token 为团队共享的 DataMap Open API 凭证（格式：`Basic <base64>`），联系 yixin.yang@shopee.com 申请。

> 不配置 Token 不影响所有查询工具的正常使用，仅在执行写入操作（`update_table_info` / `update_column_info` + `dry_run=False`）时需要。

## 安装

### 方式一：本地路径（已克隆仓库）

```bash
# 1. 安装 chrome-auth 共享库
cd /path/to/spx-helper/mcp-tools/chrome-auth
pip install -e .
```

在 `~/.cursor/mcp.json` 中添加：

```json
{
  "datamap-query": {
    "command": "python3",
    "args": ["/path/to/mcp-tools/datamap-query/datamap_mcp_server.py"]
  }
}
```

### 方式二：GitLab uvx（免克隆）

> 注意：uvx 方式需要 chrome-auth 已通过 pip 安装到当前 Python 环境。

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
| `get_table_detail(table_ref, engine?)` | 获取表扩展详情（技术 PIC、查询频次、敏感度等级等） |
| `get_column_detail(table_ref, column_name, engine?)` | 获取某一列的详细信息 |
| `get_partition_columns(table_ref, engine?)` | 获取表的分区字段列表 |
| `get_table_usage(table_ref, engine?)` | 获取表的使用统计（查询频次、热度） |
| `get_table_lineage(table_ref, engine?)` | 获取表的数据血缘关系 |
| `get_table_score(table_ref, score_type?, engine?)` | 获取表的质量评分（completeness/popularity） |
| `get_table_sla(table_ref, engine?)` | 获取表关联的 SLA 信息 |
| `list_schemas(engine?)` | 列出所有 schema（数据库） |
| `list_tables(database, engine?)` | 列出指定 schema 下的表 |
| `search_tables(keyword, engine?)` | 按关键词搜索表（DataMap previewSearch） |
| `search_global(keyword)` | 全局搜索（跨引擎、跨类型，使用 SearchCenter API） |
| `get_table_audit_log(table_ref, engine?, page_size?)` | 获取表的变更审计日志 |

### 写入工具（需配置 Open API Token）

| 工具 | 说明 |
|------|------|
| `update_table_info(table_ref, description?, technical_pic?, ...)` | 更新表元数据（描述、负责人、数仓分层等） |
| `update_column_info(table_ref, column_name, description?, ...)` | 更新字段元数据（描述、计算逻辑、枚举值等） |

写入工具内置 `dry_run` 参数（默认 True）：
- `dry_run=True`：预览变更（对比当前值与目标值），不执行修改
- `dry_run=False`：执行实际更新

**`table_ref` 参数格式**：`"database.table"` 或 `"table"`（省略 database 默认使用 `spx_mart`）

**`engine` 参数**：默认 `HIVE`，也支持 `CLICKHOUSE`、`STARROCKS`

## API 端点说明

DataMap MCP 使用三组 API：

| API | 用途 |
|------|------|
| `datasuite.shopee.io/datamap/api/v3/` | 表信息、字段、血缘、评分等查询（Cookie 认证） |
| `datasuite.shopee.io/datamap/searchcenter/api/v1/` | 全局搜索（Cookie 认证） |
| `open-api.datasuite.shopee.io/datamap/api/v3/` | 表/字段元数据写入（Basic Auth 认证） |

> DataMap 前端 API 非官方 Open API，接口格式可能随 DataMap 版本更新而变化。如遇到 404/405 错误，可通过 CDP 抓取浏览器实际请求来确认最新 API 路径。

## 使用示例

在 Cursor 中直接用自然语言：

- "查一下 `spx_mart.dwd_spx_spsso_delivery_trajectory_di_br` 这个表的信息"
- "这个表的血缘关系是什么？上下游有哪些表？"
- "搜索包含 fleet_order 的表"
- "更新 `spx_datamart.dwd_spx_spsso_order_di_id` 的表描述为 'SPX order base info'"
- "更新 order_id 列的描述为 'unique order identifier'"
- "全局搜索 delivery_trajectory"

## Changelog

### v3.5.1

- 合并 `update_table_info` + `update_column_info` 为统一的 `update_datamap` 工具
- 修复 tableStatus 更新无效：status 需嵌套在 `{"status": {"status": "MIGRATED", "migrationEntity": {...}}}` 结构中
- 工具接受灵活 JSON payload，自动路由到 updateTableInfo / updateColumnInfo 端点
- 删除冗余的 `batch_update_table_status.py`

### v3.5.0

- `update_table_info` 新增 `table_status` 参数，支持设置表生命周期状态（ACTIVE/MIGRATED/DEPRECATED/OFFLINE）
- 新增 `batch_update_table_status.py` 批量更新表状态脚本

## 注意事项

- Cookie 有效期约 30 分钟自动刷新（chrome-auth 内置 TTL 缓存），如遇 401 错误会自动重试刷新 Cookie
- 如果持续 401，请在 Chrome 中重新登录 [DataSuite](https://datasuite.shopee.io)
- 写入操作（`update_datamap`）需要配置 `DATAMAP_OPEN_API_TOKEN` 环境变量
- 写入操作默认 dry_run=True，预览确认后再设置 dry_run=False 执行
- `search_global` 使用 SearchCenter API（`/datamap/searchcenter/api/v1/`），与其他工具的 API 前缀不同
- Cookie 诊断逻辑由 `chrome_auth.diagnostic` 统一提供，各 MCP 工具共享

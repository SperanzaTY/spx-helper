# ClickHouse 查询工具 (ck-query)

通过 HTTP 直连（DBeaver 方式）查询 ClickHouse 集群。

## 认证

密码由团队统一管理，内置于 `ck_mcp_server.py` 中，无需额外配置凭证。

## 配置

在 `~/.cursor/mcp.json` 中添加：

```json
{
  "ck-query": {
    "command": "uvx",
    "args": [
      "--from",
      "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/ck-query",
      "ck-query-mcp"
    ]
  }
}
```

## 工具列表

### `query_ck`

执行 ClickHouse SQL 查询。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sql` | string | 是 | SQL 查询语句 |
| `env` | string | 是 | `live`（生产）或 `test`（测试） |
| `cluster` | string | env=live 时必填 | 集群名称，支持 ddc/ck2/ck5/ck6/ck7/online_2/4/5/6/7 |
| `database` | string | 否 | 数据库名，默认取集群配置 |
| `max_rows` | int | 否 | 最大返回行数，默认 200 |

> 当 `sql` 或 `env` 未传入时，工具会返回自我纠正提示（含示例），引导模型重试。

## 可用集群

| 集群名 | 别名 | 默认数据库 | 说明 |
|--------|------|-----------|------|
| `test` | — | `spx_mart_pub` | 测试集群（默认） |
| `ddc` | — | `spx_mart_ddc` | DDC 集群 |
| `online_2` | `ck2` | `spx_mart_manage_app` | ck2 写集群 |
| `online_4` | — | `spx_mart_pub` | test 读集群 |
| `online_5` | `ck5` | `spx_mart_manage_app` | ck2 读集群 |
| `online_6` | `ck6` | `spx_mart_manage_app` | ck6 写集群 |
| `online_7` | `ck7` | `spx_mart_manage_app` | ck6 读集群 |

## 使用示例

在 Cursor Agent 中：

```
查询 spx_mart_pub.dim_station 表最近 10 条数据
```

```
用 ck2 集群查询 spx_mart_manage_app.xxx 表
```

## 注意事项

- 默认查询 `test` 集群，写集群操作请谨慎
- 读集群（online_4/5/7）走 office-only 域名，适合大查询
- 写集群（online_2/6）走生产域名，避免大查询影响线上

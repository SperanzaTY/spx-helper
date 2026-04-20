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

返回结果会附带 **实际执行的 SQL**，便于在对话中核对本次查询语句。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sql` | string | 是 | SQL 查询语句 |
| `env` | string | 是 | `live`（生产）或 `test`（测试） |
| `cluster` | string | env=live 时必填 | 集群名称，支持 ddc/ck2/ck5/ck6/ck7/online_2/4/5/6/7 |
| `database` | string | 否 | 数据库名，默认取集群配置 |
| `max_rows` | int | 否 | 最大返回行数，默认 200 |

> `sql`、`env` 为无默认值的必填参数（Schema 含 `required`）。若 **Cursor Agent 仍把多参数调用序列化成空对象**（`input_value={}`），请改用下面的 **`query_ck_bundle`**：只需一个字符串参数，把整份 JSON 放进 `bundle`。

### `query_ck_bundle`

与 `query_ck` 等价，但**只接收一个参数** `bundle`（JSON 对象字符串），用于规避部分环境下 Agent 多参数工具调用丢失字段的问题。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `bundle` | string | 是 | 例如 `{"sql":"SELECT 1","env":"live","cluster":"ck2"}`，可选键：`database`、`max_rows` |

示例 `bundle` 内容：

```json
{"sql":"SELECT station_id, count() FROM db.t FINAL WHERE station_id=26252 GROUP BY station_id","env":"live","cluster":"ck2","max_rows":200}
```

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

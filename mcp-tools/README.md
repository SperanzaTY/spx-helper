# MCP 工具集

SPX Helper 配套的 Cursor MCP 工具，用于 API 溯源、Presto/Spark/CK 查询等。

## 凭证获取指引

| MCP | 凭证来源 | 获取路径 |
|-----|----------|----------|
| **presto-query** | Data Suite API 管理 | 访问 [DataSuite API 管理](https://datasuite.shopee.io/dataservice/ds_api_management) → 左上角 ☰ → 获取 Personal Token |
| **spark-query** | Data Suite 个人中心 | 访问 [Data Suite](https://datasuite.shopee.io) → **个人中心** → **Profile** → BigData Account / BigData Account Password（点击 View 显示） |
| **api-trace** | 同 presto-query | 使用与 Presto 相同的 `PRESTO_PERSONAL_TOKEN`、`PRESTO_USERNAME` |
| **ck-query** | 团队配置 | 密码由团队统一管理，配置在 `ck_mcp_server.py` 中 |

## 工具列表

| 目录 | 说明 | 文档 |
|------|------|------|
| presto-query | Presto 查询 | [README](presto-query/README.md) |
| spark-query | Spark SQL 查询（Livy） | [README](spark-query/README.md) |
| ck-query | ClickHouse 查询 | 见 `ck_mcp_server.py` 注释 |
| api-trace | API 血缘溯源 | 见 `api_trace_server.py` 注释 |
| worklens | 问题上下文采集 | [README](worklens/README.md) |

## 配置位置

MCP 配置在 `~/.cursor/mcp.json`，新增或修改后需在 Cursor 设置中**关闭再开启**对应 MCP 以刷新。

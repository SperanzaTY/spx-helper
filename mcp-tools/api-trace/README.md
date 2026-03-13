# API Trace MCP

API 血缘溯源与 Bug 定位工具，根据 api_id 查询 biz_sql、源表，并支持直查源表数据。

## 配置

### 凭证（与 Presto MCP 相同）

使用 **PRESTO_PERSONAL_TOKEN** 和 **PRESTO_USERNAME**，获取方式见 [presto-query/README.md](../presto-query/README.md)。

- 访问 [DataSuite API 管理](https://datasuite.shopee.io/dataservice/ds_api_management)
- 左上角 ☰ → 获取 Personal Token

### mcp.json 示例

```json
{
  "api-trace": {
    "command": "python3",
    "args": ["/path/to/api_trace_server.py"],
    "env": {
      "PRESTO_PERSONAL_TOKEN": "你的 Personal Token",
      "PRESTO_USERNAME": "你的用户名"
    }
  }
}
```

## 配合使用

- **cursor-ide-browser**：在页面获取问题元素对应的 API
- **query_presto / query_ck**：进一步排查源表数据

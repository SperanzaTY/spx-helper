# Spark 查询 MCP 工具

通过 Livy REST API 为 Cursor 提供 Spark SQL 查询能力，支持 Hive 表查询。

## 配置

### 1. 环境变量（在 mcp.json 中）

```json
{
  "spark-query": {
    "command": "python3",
    "args": ["/absolute/path/to/spark_mcp_server.py"],
    "env": {
      "LIVY_USERNAME": "你的 DMP 账号",
      "LIVY_PASSWORD": "你的 DMP 密码",
      "LIVY_URL": "http://livy-rest.data-infra.shopee.io",
      "LIVY_QUEUE": "szsc-dev",
      "LIVY_REGION": "SG"
    }
  }
}
```

### 2. 配置说明

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| LIVY_USERNAME | ✅ | - | DMP 个人或项目账号 |
| LIVY_PASSWORD | ✅ | - | DMP 密码 |
| LIVY_URL | ❌ | - | Livy 地址，不设则按 region 选择 |
| LIVY_QUEUE | ❌ | szsc-dev | YARN 队列（DEV 用 szsc-dev，PROD 用 szsc） |
| LIVY_REGION | ❌ | SG | 区域：SG / US |

### 3. Livy 地址

| 环境 | LIVY_URL |
|------|----------|
| Live (SG) | http://livy-rest.data-infra.shopee.io |
| Live (US) | http://livy-rest-us.data-infra.shopee.io |
| UAT | http://livy-rest.data-infra.uat.shopee.io |
| Staging | http://livy-rest-staging.data-infra.shopee.io |

不设置 `LIVY_URL` 时，将根据 `LIVY_REGION` 自动选择 SG 或 US Live 地址。

### 4. YARN 队列（从 Data Suite RAM 获取）

| 环境 | 队列 | 说明 |
|------|------|------|
| DEV (Batch) | szsc-dev | 开发/Ad-hoc 查询（默认） |
| PROD (Batch) | szsc | 生产任务 |

## 使用

配置并重启 Cursor 后，在对话中使用：

- 「查一下 spx_mart.xxx 表的数据」
- 「用 query_spark 执行这个 Spark SQL」

## 注意事项

1. **Session 启动耗时**：首次执行约 1–2 分钟（YARN 分配资源），之后执行会快很多
2. **只读建议**：推荐只执行 SELECT 查询，避免 DDL/写入
3. **认证**：使用 HTTP Basic Auth，每个请求必须携带凭证
4. **网络**：MCP 需能访问内网 Livy 地址（VPN 或内网环境）

## 依赖

```bash
pip3 install requests mcp
```

## 故障排除

- **Session 创建失败**：检查 LIVY_USERNAME/LIVY_PASSWORD 及网络
- **超时**：Session 启动 180s、Statement 执行 300s
- **SQL 报错**：检查 Spark SQL 语法及表名

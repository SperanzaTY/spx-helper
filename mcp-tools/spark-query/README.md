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
      "LIVY_USERNAME": "你的 BigData Account 用户名",
      "LIVY_PASSWORD": "你的 BigData Account 密码",
      "LIVY_URL": "http://livy-rest.data-infra.shopee.io",
      "LIVY_QUEUE": "szsc-dev",
      "LIVY_REGION": "SG"
    }
  }
}
```

### 2. 获取 BigData Account

**LIVY_USERNAME** 和 **LIVY_PASSWORD** 即 DataSuite 的 BigData 凭证，获取方式：

1. 打开 [DataSuite RAM Profile](https://datasuite.shopee.io/ram/personal/profile)
2. 在页面中找到 **BigData Account** 区域：
   - **Account**（用户名）→ 填入 `LIVY_USERNAME`
   - **Password** → 点击 **View** 显示密码 → 填入 `LIVY_PASSWORD`

### 3. 配置说明

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| LIVY_USERNAME | ✅ | - | [DataSuite RAM Profile](https://datasuite.shopee.io/ram/personal/profile) → BigData Account |
| LIVY_PASSWORD | ✅ | - | 同上 → Password → 点 View 查看 |
| LIVY_URL | ❌ | - | Livy 地址，不设则按 region 选择 |
| LIVY_QUEUE | ❌ | szsc-dev | YARN 队列（DEV 用 szsc-dev，PROD 用 szsc） |
| LIVY_REGION | ❌ | SG | 区域：SG / US |
| LIVY_STATEMENT_TIMEOUT | ❌ | 300 | Statement 执行超时（秒），长查询可设 1800 |

### 4. Livy 地址

| 环境 | LIVY_URL |
|------|----------|
| Live (SG) | http://livy-rest.data-infra.shopee.io |
| Live (US) | http://livy-rest-us.data-infra.shopee.io |
| UAT | http://livy-rest.data-infra.uat.shopee.io |
| Staging | http://livy-rest-staging.data-infra.shopee.io |

不设置 `LIVY_URL` 时，将根据 `LIVY_REGION` 自动选择 SG 或 US Live 地址。

### 5. YARN 队列

| 环境 | 队列 | 说明 |
|------|------|------|
| DEV (Batch) | szsc-dev | 开发/Ad-hoc 查询（默认） |
| PROD (Batch) | szsc | 生产任务 |

## 使用

配置并重启 Cursor 后，在对话中使用：

- 「查一下 spx_mart.xxx 表的数据」
- 「用 query_spark 执行这个 Spark SQL」

## 离线开发数据验证流程

推荐两步验证：先语法校验，再数据抽样。

| 步骤 | 参数 | 说明 |
|------|------|------|
| **1. 语法验证** | `validate_syntax=True` | 用 EXPLAIN 检查 SQL 语法、表/字段存在性，不取数据，耗时短 |
| **2. 数据验证** | `validate_syntax=False` | 执行 SELECT 抽样，验证结果数据 |

示例：
```
// Step 1: 语法验证
query_spark(sql="SELECT * FROM dwd_xxx WHERE grass_date='2024-01-01'", validate_syntax=True)

// Step 2: 数据抽样
query_spark(sql="SELECT * FROM dwd_xxx WHERE grass_date='2024-01-01' LIMIT 100")
```

## 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| validate_syntax | false | 为 true 时用 EXPLAIN 做语法验证，不取数据 |
| statement_timeout | 300 | Statement 执行超时（秒），长查询可设 1800（30 分钟） |
| max_rows | 200 | 最多返回行数（最大 1000） |

环境变量 `LIVY_STATEMENT_TIMEOUT` 可配置默认超时（秒）。

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
- **超时**：Session 启动 180s，Statement 默认 300s（可通过 statement_timeout 或 LIVY_STATEMENT_TIMEOUT 调整）
- **长查询**：将 statement_timeout 设为 1800 可支持约 30 分钟
- **SQL 报错**：先用 validate_syntax=True 做语法验证

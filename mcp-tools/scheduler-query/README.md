# DataSuite Scheduler 查询工具 (scheduler-query)

查询 DataSuite Scheduler 平台的任务状态、实例列表、运行日志、血缘关系，以及 Presto/Spark 的 SQL 和性能诊断。

## 认证

自动从 Chrome 浏览器读取 Cookie，需要：
1. 登录 https://datasuite.shopee.io（Scheduler API 认证）
2. 登录 https://keyhole.data-infra.shopee.io（Spark History Server 和 Keyhole 认证）
3. 安装依赖：`pip3 install mcp requests browser-cookie3`

## 配置

### 方式一：uvx 远程安装（免克隆）

在 `~/.cursor/mcp.json` 中添加：

```json
{
  "scheduler-query": {
    "command": "uvx",
    "args": [
      "-p", "3.12",
      "--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/scheduler-query",
      "--with", "chrome-auth@git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/chrome-auth",
      "scheduler-mcp"
    ]
  }
}
```

### 方式二：本地路径（开发者推荐）

```json
{
  "scheduler-query": {
    "command": "python3",
    "args": [
      "/你的路径/spx-helper/mcp-tools/scheduler-query/scheduler_mcp_server.py"
    ],
    "env": { "PYTHONPATH": "/你的路径/spx-helper/mcp-tools/chrome-auth" }
  }
}
```

> 替换 `/你的路径/spx-helper` 为实际的项目路径。使用方式二前需先 `pip install -e chrome-auth`。

## 工具列表

### Scheduler 任务管理

#### `search_tasks`
搜索 Scheduler 任务。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `keyword` | string | 是 | 搜索关键词（任务名） |
| `project_code` | string | 否 | 项目代码，默认 `spx_mart` |
| `page_size` | int | 否 | 返回条数，默认 20 |
| `env` | string | 否 | 环境：`prod`/`dev`/`staging`，默认 `prod` |

#### `get_task_info`
获取任务详情。

#### `get_task_instances`
查询任务的运行实例列表。

#### `get_instance_detail`
查询实例详情，包含 YARN Application ID / Presto Query ID（可跳转到对应的查询工具）。

#### `get_instance_log`
查询实例运行日志。

#### `get_task_lineage`
查询任务的上下游血缘关系。

#### `get_task_metric_summary`
查询任务的运行指标汇总（最近 10 次平均耗时、CPU、内存、成本）。

#### `get_task_operation_log`
查询任务的操作日志（谁改了什么）。

#### `get_task_violations`
查询任务的 SLA 违规记录。

### Presto SQL 查询

#### `get_presto_query_sql`
通过 Presto Query ID 或实例代码获取 **Presto 类型任务**执行的 SQL 和查询统计。

> 参数 `presto_query_id` 或 `task_instance_code` 至少提供一个。

### Spark 日志与诊断

#### `get_spark_query_sql`
通过 YARN Application ID 或实例代码获取 **Spark/Hive 类型任务**的 Driver stdout 日志（含 SQL）。

通过 Keyhole 平台获取完整的 Driver AM stdout 日志。如果 Keyhole 不可用，自动回退到 Spark History Server 的 `/sql` 端点。

#### `get_spark_app_summary`
获取 Spark 应用的概览信息和关键配置。

通过 Spark History Server REST API 获取：应用名称、用户、运行时间、Spark 关键配置（内存、并行度、executor 数量、AQE 等）。

#### `get_spark_stages`
获取 Spark 应用所有 Stage 的详细指标，自动检测数据倾斜和慢 Stage。

返回每个 Stage 的：耗时及占比、输入/输出行数和大小、Shuffle 读写量、磁盘溢出、数据倾斜指标（基于 task 耗时分位数）。

#### `get_spark_executors`
获取 Spark 应用的 Executor 资源使用详情。

返回每个 Executor 的：内存用量及利用率、GC 时间及占比、任务完成/失败数、Shuffle 读写量。自动标记 GC 压力过大和 OOM 风险。

#### `get_spark_sql_plan`
获取 Spark 应用的 SQL 执行计划和各算子指标。

返回 SQL 文本、物理执行计划（planDescription）、关键算子的行数/大小指标（Scan、Join、Shuffle 等）。

#### `get_spark_jobs`
获取 Spark 应用的 Job 列表及状态。每个 Spark Action（save/collect/count）对应一个 Job。

返回每个 Job 的：提交/完成时间、Stage 构成、Task 成功/失败数。

#### `get_spark_stage_tasks`
获取指定 Stage 的 **Task 级明细**。这是精确定位数据倾斜的关键工具。

返回每个 Task 的：耗时、GC 时间、输入数据量、Shuffle 读写、内存/磁盘溢出。
自动计算 P50/P90/P99 分位数和倾斜比（max/median）。

参数：`stage_id`（必须，从 `get_spark_stages` 获取）、`sort_by`（duration/shuffle_read/spill/gc_time）、`limit`（默认 20）。

#### `get_spark_storage`
获取 Spark 应用的 RDD/DataFrame 缓存信息。

返回缓存的 RDD/DataFrame 列表：名称、存储级别、分区数、内存/磁盘占用。

#### `diagnose_spark_app`
**综合性能诊断工具**。自动聚合应用概览、Stage/Executor/SQL 计划信息，内置规则引擎检测：

- 数据倾斜（Stage 级 + Task 级双层检测，采样 Top Stage 做精确 max/median 分析）
- OOM 风险（executor 内存使用率 > 85%）
- GC 压力（GC 时间占比 > 15%）
- Shuffle 瓶颈（大量 shuffle + 磁盘溢出）
- 配置不当（AQE 未启用、shuffle.partitions 不合理等）

输出 severity 级别（HEALTHY / WARNING / CRITICAL）+ 具体优化建议 + 倾斜 Task 详情。
倾斜检测后可用 `get_spark_stage_tasks` 深入查看完整 Task 分布。

> 以上 Spark 工具的参数格式统一：`yarn_application_id`（如 `application_1773126131675_5513239`）或 `task_instance_code` 二选一。

## 使用示例

```
搜索 scheduler 里包含 dim_station 的任务
```

```
查看 thopsbi_spxa.studio_11116186 最近的运行实例
```

```
诊断这个 Spark 任务的性能：application_1773126131675_5513239
```

```
这个 Spark 任务有数据倾斜吗？查看 Stage 详情：
https://datasuite.shopee.io/scheduler/task/mkpldp_shop_health.studio_6075240/instance/mkpldp_shop_health.studio_6075240_20260401_DAY_1/detail
```

## 注意事项

- `env` 参数区分环境，从 Scheduler URL 中可判断：`/scheduler/dev/` -> `dev`，`/scheduler/task/` -> `prod`
- Cookie 过期或收到 401 时会自动尝试 SSO 静默刷新（401 会跳过 chrome-auth 的 60s 冷却）；仍失败时错误信息含 **CDP 端口探测、本次静默导航 URL 与结果、关键 Cookie 是否齐全**（`format_auth_troubleshoot`），便于区分未连上调试 Chrome 与需重新登录
- 若自动刷新后仍失败（SSO 主会话过期），需在 Chrome 中重新登录 DataSuite
- Presto 任务用 `get_presto_query_sql`，Spark/Hive 任务用 `get_spark_query_sql` 或 `diagnose_spark_app`
- Spark History Server 数据有保留期限（通常 7 天），较早的 application 可能查不到
- `diagnose_spark_app` 是最全面的 Spark 诊断入口，推荐用于告警排查
- 认证诊断由 `chrome_auth.diagnostic.format_auth_troubleshoot` 与 `cookie_diagnostic` 统一提供，各 MCP 工具共享

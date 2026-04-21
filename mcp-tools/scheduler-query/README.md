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

## 实例编码（taskInstanceCode）与 taskCode

`get_instance_detail`、`get_presto_query_sql`（传 `task_instance_code`）等会先根据实例编码解析 **taskCode**，再请求 Scheduler 的 `/taskInstance/get`。解析规则与调度周期（天/小时/分钟/月等）无关，只要满足「固定任务前缀 + 下划线后缀」即可。

### Studio 任务（`{project}.studio_{数字}_...`）

| 周期 | 实例编码示例 | 解析得到的 taskCode |
|------|----------------|---------------------|
| 天 | `spx_mart.studio_10429983_20260401_DAY_1` | `spx_mart.studio_10429983` |
| 小时 | `regops_spx.studio_10628558_2026041417_HOUR_1` | `regops_spx.studio_10628558` |
| 分钟 | `twbi_spx_ops.studio_6786158_202604012010_MINUTE_1` | `twbi_spx_ops.studio_6786158` |
| 月 | `idecbi_sc.studio_8044569_202604_MONTH_1` | `idecbi_sc.studio_8044569` |
| 周/年等 | `proj.studio_1_2026_WEEK_3_1`、`proj.studio_1_2026_YEAR_1` | `proj.studio_1` |

业务时间字段可能是 `YYYYMMDD`、`YYYYMMDDHH`、`YYYYMMDDHHMM`、`YYYYMM` 等纯数字，**不能**仅靠「下一段是否为 8 位数字」推断 taskCode；实现上优先匹配 `...studio_<数字>_` 后的整段后缀。

### DataHub 批任务（`...etl_batch.{数字}_...`）

| 实例编码示例 | taskCode |
|--------------|----------|
| `spx_mart.datahub.etl_batch.281196_20260101_DAY_1` | `spx_mart.datahub.etl_batch.281196` |

### DataHub BTI 任务（`...datahub.bti.{数字}.{后缀}_...`）

| 实例编码示例 | taskCode |
|--------------|----------|
| `spx_datamart.datahub.bti.422404.hdfscopy_20260414_DAY_1` | `spx_datamart.datahub.bti.422404.hdfscopy` |

其它命名形态若无法匹配上述规则，会回退到旧逻辑（兼容部分非标准 studio 实例）；仍无法解析时 **taskCode 与实例编码相同**，可能导致接口返回 `data: null`，需对照 Scheduler 页面上的任务编码核对。

本地校验解析规则（无需 MCP 依赖）：在 `mcp-tools/scheduler-query` 目录执行 `python3 tests/test_extract_task_code.py`；Mart SLA 解析单测：`python3 tests/test_mart_sla_parser.py`；**`python3 tests/test_mart_sla_instance_api.py`**。

## 新 Mart SLA 告警（`parse_mart_sla_alert` / `triage_mart_sla_alert`）

面向 SeaTalk「新 mart SLA」类英文告警：从粘贴的正文中提取 SLA 规则名、Mart 表、`Data Environment`、业务日/承诺/预计完成时间、`Related Events` 片段、`shp.ee` 链接，以及 **taskInstanceCode**（支持 `studio_*`、`datahub.bti.*`、`datahub.etl_batch.*` 等形态）。

| 工具 | 说明 |
|------|------|
| `parse_mart_sla_alert(alert_text)` | 仅本地解析，不请求 Scheduler |
| `resolve_mart_sla_shortlink(shp_url)` | 将 **`https://shp.ee/...`** 短链 HEAD 一次，从 ``Location`` 解析出 **DataSuite** ``/scheduler/sla/instance/detail/...`` 的浏览器打开链接（**无需 Cookie**；不调用页面内 XHR） |
| `fetch_mart_sla_instances_from_shortlink(shp_url, env?)` | 短链解析后，用 **与 Scheduler 相同的 Chrome Cookie** 调用 **`GET {datasuite}/sla/slaInstance/get`**（非 prod 为 ``/sla/dev/``、``/sla/uat/`` 等），从返回体抽取 **taskInstanceCode**（含 ``curRunTaskInstanceCode`` / Gantt 嵌套字段） |
| `triage_mart_sla_alert(alert_text, env?, max_instances?, deep_spark?, resolve_shortlinks?, sla_shortlink_fetch_instances?)` | 解析后对每个实例（默认最多 3 个）调用 `get_instance_detail`、`get_instance_log`；**默认** ``sla_shortlink_fetch_instances=true``：正文无 **taskInstanceCode** 时，对 ``shp.ee`` 走 **slaInstance/get** 补全后再拉 Scheduler；`deep_spark=true` 时对 Spark 实例额外调用 `get_spark_app_summary`；**默认**填充 **`shortlink_resolutions`**（可设 `resolve_shortlinks=false`）；补全过程见 **`sla_shortlink_fetch_trace`** |

返回 JSON；`triage_mart_sla_alert` 另含 `markdown_report` 简报，便于直接贴到值班群。

**关于短链**：`shp.ee` 的 **HEAD** 即可还原浏览器打开的 SLA 详情 URL（**无需 Cookie**）。要从详情页同源 JSON 拉 **Scheduler 实例编码**，MCP 已接入 SLA 子服务的 **`slaInstance/get`**（路径经 Confluence / Web API regression 对照）。若接口升级或权限异常，可用仓库根 **`scripts/probe-datasuite-sla-cdp.js`** 列出本机 Chrome CDP 中含 DataSuite 的 tab，在 **DevTools → Network** 过滤关键字 **`slaInstance`** 与 MCP 请求对比。

## Presto History 与 get_presto_query_sql

- Presto 类型实例的 **yarn_application_id** 在多数场景下对应 Presto History 中的 **单条** query。
- **`get_presto_query_sql`** 在返回 JSON 中会合并 **`presto_sql_kind`**，并在空 SQL、DDL/元数据类语句等情况下附带 **`presto_sql_warning`**，提示到实例详情核对其它 **Presto Query ID** 或显式传入 **`presto_query_id`**。
- 启发式实现见 **`scheduler_task_code.presto_history_sql_hints`**；单测：`python3 tests/test_presto_hints.py`。
- Agent 侧通用排查顺序见顶层 **`docs/guides/MCP_TOOLS.md`** 中的 **「Agent triage: MCP and query failures」**。

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

#### `parse_mart_sla_alert`
解析「新 Mart SLA」告警正文（纯本地），输出结构化字段与 `task_instance_codes`。

#### `triage_mart_sla_alert`
在 `parse_mart_sla_alert` 基础上自动拉取实例详情与日志（可选 Spark 应用摘要）。

#### `resolve_mart_sla_shortlink`
将告警中的 **`shp.ee`** 短链解析为 **DataSuite SLA 详情页** 完整 URL（HEAD + 解析 ``Location``，无需登录）。

#### `fetch_mart_sla_instances_from_shortlink`
短链 + Cookie 调用 **`slaInstance/get`**，返回抽取的 **`task_instance_codes`** 与原始响应摘要。

#### `get_task_lineage`
查询任务的上下游血缘关系。

#### `get_task_metric_summary`
查询任务的运行指标汇总（最近 10 次平均耗时、CPU、内存、成本）。

#### `get_task_operation_log`
查询任务的操作日志（谁改了什么）。

#### `get_task_violations`
查询任务的 SLA 违规记录。

### DataSuite 批量运维接口（与 Google Sheet / 刷新脚本对齐）

以下接口在 **已登录 DataSuite 的 Chrome Cookie** 下与 Web 一致；需标头 `x-datasuites-project-code`（如 `spx_datamart`）的已标出。完整路径与说明见同目录 **`datasuite_bulk_api.py`**（`api_reference_markdown()` 可生成文档片段）。

| 工具 | 说明 |
|------|------|
| `search_scheduler_tasks_fuzzy` | `GET /scheduler/api/v1/task/getList`（`search=1`、任务名、可选 `idcRegion`、项目头） |
| `list_task_instances_by_update_time` | `GET .../taskInstance/getList`（`updateTimeOrder` 分页；**不**等于按 `endRunTime` 排序，见工具说明） |
| `get_sla_full_configuration` | `GET /sla/sla/getAllStatus?slaCode=`（`slaTasks`、`slaTimeDef` 等） |
| `query_marker_task_bindings` | `GET .../data-dependency/v2/withoutTag/marker/all`（`marker_name` → 列表 `task_id` 即 taskCode） |
| `list_sla_bindings_for_task_instance` | `GET /sla/slaInstance/getSlaInstanceListByTaskInstance` |

**已存在工具**中，`get_task_instances` 现支持从 `taskCode` 自动带项目头；`search_tasks` 的请求也会带上 `project_code` 对应的 `x-datasuites-project-code`。

**写入类接口**（如 ``POST /sla/sla/update``）可能影响生产 SLA 配置，未封装为 MCP，仅在 `datasuite_bulk_api.py` 列作参考。

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

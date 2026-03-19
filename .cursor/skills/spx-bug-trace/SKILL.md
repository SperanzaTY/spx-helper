---
name: spx-bug-trace
description: SPX Helper 业务问题定位工作流。用于从页面元素出发，定位数据异常的根因：通过浏览器捕获 API 请求 → 数据管道健康检查 → 查询 API 血缘（biz_sql、源表）→ 分层验证假设 → 用 Presto/CK 工具直查源表数据验证 → 输出用户可读的结论。支持从 Confluence 查找 PRD 与历史排查经验；排查完成后将详情沉淀到 Confluence，将问题摘要与坑点沉淀到 Google Sheets。当用户描述页面数据不对、某个字段异常、数据缺失、数值偏差等业务问题时使用，也适用于"帮我查一下这个 Bug"、"这个数据为什么不对"、"溯源一下这个接口"等场景。
---

<!-- 本 Skill 位于 .cursor/skills/，版本随 SPX_Helper 仓库维护。
     SPX_Helper 项目内自动加载；其他项目需 sync_skills.sh 同步到 ~/.cursor/skills/。
     若本地有修改，sync 会拒绝覆盖，需先在 Cursor 中比较合并后再同步。
     依赖：user-api-trace、user-ck-query、user-presto-query、cursor-ide-browser、user-mcp-atlassian、user-google-sheets 六个 MCP。-->

# SPX Business Bug Trace

## 前置：代码仓库准备

**在开始任何代码排查之前，必须确保所有相关仓库都是最新状态。** 否则可能将已修复的问题误判为 Bug。

```bash
# 对每个相关仓库都执行
cd /Users/tianyi.liang/SpxMgmtAppSop/code-repos/<仓库名>
git checkout release
git pull origin release
```

常见仓库：`fm-realtime`、`fm-offline`、`lm-realtime`、`lm-offline`、`mm-realtime`、`mm-offline`

**如果在代码里找不到预期的逻辑，优先怀疑本地代码不是最新**，而不是假设逻辑不存在：
1. 先用 `git log --all --oneline -10 -- <文件路径>` 查看所有分支的提交历史
2. 看是否有比当前 HEAD 更新的 commit（尤其关注描述中含关键词的）
3. 若有则 `git pull origin release` 同步后再继续排查

## 工具清单

| 工具 | 用途 |
|------|------|
| `cursor-ide-browser` MCP | 操控浏览器：导航、截图、点击、抓网络请求 |
| `get_api_lineage` (api-trace MCP) | 快速查 API 血缘：biz_sql、源表、Dynamic WHERE |
| `api_trace` (api-trace MCP) | 完整溯源 + 直查源表，可传 `custom_where` 和 `api_response_sample` |
| `query_ck` (ck-query MCP) | 查 ClickHouse：`env=live`(ck2/ck6) 或 `env=test` |
| `query_presto` (presto-query MCP) | 查 Presto：离线宽表、维表、源表验证 |
| `confluence_search` / `confluence_get_page` / `confluence_get_page_children` (mcp-atlassian) | 查 Confluence：PRD 背景、历史排查经验、沉淀知识 |
| `confluence_create_page` (mcp-atlassian) | 在历史问题排查目录下创建知识文档 |
| `get_sheet_data` / `update_cells` / `create_sheet` (google-sheets MCP) | 读写 GSheet：app问题整理、坑点、任务上下游信息梳理 |
| 代码库文件读取 | 查看 `background.js`/`content.js`/`popup.js` 等源码逻辑 |

---

## 完整排查流程

### Phase -1：Confluence 辅助（可选）

在排查前或排查中，可借助 Confluence 获取背景与历史经验，缩短定位时间。

| 用途 | 方法 | 说明 |
|------|------|------|
| **了解板块 PRD、设计口径** | `confluence_search` 搜索对应板块关键词（如「Hub Overview」「Driver Overview」「Facility」） | 在 SPSC 等 space 中查找 PRD 文档，了解业务背景、统计口径、字段定义 |
| **查找历史排查经验** | `confluence_get_page_children`(parent_id=3105880558) 或 `confluence_search` 搜索相关 api_id/表名/现象关键词 | 历史问题排查文档目录下已有案例，可参考类似问题的根因与验证路径 |

**历史问题排查目录**：https://confluence.shopee.io/pages/viewpage.action?pageId=3105880558 （pageId=3105880558，space_key=SPSC）

---

### Phase 0：前置检查 — 数据管道健康

**在查业务逻辑之前，先确认数据是否在正常写入。** 如果上游没有数据，后面所有分析都是白费。

**第一步：确认表的实际字段名**（不同表的写入时间字段名不同）：
```sql
-- 先看一行数据，确认字段名
SELECT * FROM spx_mart_manage_app.<表名>_<market>_all LIMIT 1
```

常见写入时间字段：`process_time`（Unix 时间戳）、`_process_time`（元数据字段）、`_version`（ReplacingMergeTree 版本，部分 10m 表用此）、`update_time`

**第二步：检查最近写入时间**：
```sql
-- 优先尝试 process_time；若报错 Missing columns，则改用 _version 或 _process_time
SELECT 
    toDateTime(max(process_time)) AS last_write_time,
    max(data_timestamp) AS last_data_ts,
    toDateTime(max(data_timestamp)) AS last_data_time
FROM spx_mart_manage_app.<表名>_<market>_all
-- 若 process_time 不存在，改用：
-- toDateTime(max(_version)) AS last_version_time, max(data_timestamp) AS last_data_ts ...
```

**判断标准**：
- `last_write_time` 距今 > 30 分钟 → 数据管道可能异常
- 横向对比多个市场（SG/ID/MY/TH/PH/VN）的 `last_write_time`，若某市场明显落后 → 该市场 Flink 任务异常

如果数据管道正常，跳到 Phase 1。如果异常，先走 **Phase 0.1（Flink 链路排查）**。

#### Phase 0.1：Flink 上游链路排查（数据断流时）

数据断流的常见链路（从 CK 往上追）：

```
CK 表无新数据
  ↓ 检查 Kafka-to-CK 任务是否正常
    → 任务正常 + Kafka 无积压 → 上游 Kafka topic 就没有消息
      ↓ 检查 Flink 聚合任务（如 DwsSpxFmPickupTaskProcessRi2）
        → FAILED/RESTARTING → 查错误日志
          - exitCode=127 → 容器启动失败（镜像拉取失败/JAR路径不存在）
          - TimeoutException: heartbeat timed out → TM 节点被驱逐/OOM，后续重启失败
        → 任务正常 → 检查上游 CDC/Kafka source topic 是否有消息
```

**[重要] 优先检查运维事件**：

在深入排查代码和配置之前，**如果数据突然停止但之前一直正常**，优先询问/确认：

1. **最近是否有集群迁移/升级**（K8S 迁移、Flink 集群升级、ClickHouse 升级）
2. **依赖包是否有更换**（Paimon、Flink 版本、Hadoop 依赖等）
3. **任务是否有重启/重新部署**（可能导致配置回退或 Checkpoint 丢失）
4. **是否有 DDL 变更**（表结构修改、分区策略调整）

这些运维事件往往是数据突然停滞的直接原因，比代码 bug 更常见。

**检查 ClickHouse 表的实际物理结构**：

对于分布式表（Distributed Engine），使用 `SHOW CREATE TABLE` 查看实际指向的 local 表：

```sql
SHOW CREATE TABLE spx_mart_ddc.<表名>;
-- 查看 ENGINE = Distributed(..., '<local_table_name>', ...) 
-- 确认实际写入的是哪个 local 表
```

**常见场景**：
- 分布式表名为 `dwd_spx_fm_pickup_task_tab`，但可能指向 `dwd_spx_fm_pickup_task_tab_v2_local`
- 表结构升级时，分布式表指向可能变更，但 Flink 任务配置未同步
- 不同市场的表可能指向不同版本的 local 表

**横向对比其他市场**：

当某个市场数据异常时，快速对比其他市场的状态：

```sql
SELECT 
    'BR' AS market,
    toDateTime(max(_process_time)) AS last_write,
    CAST((now() - max(_process_time)) / 3600 AS Int32) AS hours_ago
FROM spx_mart_ddc.dwd_spx_fm_pickup_task_tab_v2_local
UNION ALL
SELECT 
    'ID' AS market,
    toDateTime(max(_process_time)) AS last_write,
    CAST((now() - max(_process_time)) / 3600 AS Int32) AS hours_ago
FROM spx_mart_ddc.dwd_spx_fm_pickup_task_tab_id_local;
```

若其他市场正常，问题通常出在：
- 该市场的 Flink 任务配置差异
- 该市场的表结构特殊性（如 BR 不带 region 后缀）
- 迁移/升级时该市场被遗漏

**Flink 任务名称生成规则**（用于从表名反推 DataSuite 中的任务名）：

FM/LM/MM Realtime 项目的 Flink 任务名由以下规则拼接：

```
{job_name_prefix} + convert({job_origin_name}) + _{region} + _{sink}
```

各部分含义：
- `job_name_prefix`：根据环境确定
  - live → `spx_mart__`
  - uat → `staging_spx_mart__uat_`
  - staging → `staging_spx_mart__staging_`
  - test → `dev_spx_mart__test_`
  - dev → `dev_spx_mart__dev_`
- `convert(job_origin_name)`：将配置文件中的任务名 CamelCase 转为 snake_case
  - 转换规则：`replaceAll("([a-z])([A-Z])", "$1_$2").toLowerCase()`
  - 示例：`DwdSpxFmPickupTaskTabSink` → `dwd_spx_fm_pickup_task_tab_sink`
- `region`：市场代码（`br`/`id`/`sg`/`my`/`ph`/`th`/`vn`/`tw` 等）
- `sink`：数据写入目标类型
  - `clickhouse`：写入主 CK 集群（根据 `app_type` 参数决定用 `clickhouse_jdbc_url` 还是 `clickhouse_mgmt6_jdbc_url`，默认后者对应 DDC/mgmt6）
  - `gray_clickhouse`：灰度发布 CK 集群（通常对应 `clickhouse_pub2_jdbc_url`，如 ck2/pub2）
  - `ck_kafka`：写入 Kafka 用于下游消费
  - `kafka`/`g_kafka_ver`：其他 Kafka sink 变体

**示例**：
```
任务配置名：DwdSpxFmPickupTaskTabSink
环境：live
市场：br
Sink：clickhouse
→ 生成的任务名：spx_mart__dwd_spx_fm_pickup_task_tab_sink_br_clickhouse
```

**表名到任务名的反推流程**：
1. 从 CK 表名提取核心名称（如 `dwd_spx_fm_pickup_task_tab`）
2. 在代码仓库中搜索对应的 Metadata 文件（如 `DwdSpxPickupTaskMetadata.scala`）
3. 查看 `dwd_live_flink.conf` 或 `ads_live_flink.conf` 中该 Metadata 对应的任务配置名（如 `DwdSpxFmPickupTaskTabSink`）
4. 查看 `regions` 和 `sinks` 配置项，确认支持哪些市场和 sink 类型
5. 应用上述命名规则拼接出完整任务名

**判断 `clickhouse` sink 的实际写入集群**：
- 查看 Metadata 文件中的 JDBC URL 选择逻辑
- `app_type="pc"` → 使用 `clickhouse_jdbc_url`（通常是业务特定集群）
- 其他/默认 → 使用 `clickhouse_mgmt6_jdbc_url`（通常是 DDC/mgmt6）
- BR 市场的表名规则：
  - 若 `region=="br"`，表名通常不带 region 后缀（如 `dwd_spx_fm_pickup_task_tab`）
  - 其他市场表名带后缀（如 `dwd_spx_fm_pickup_task_tab_id_all`）

**任务配置版本管理**：

同一个表可能存在多个版本的 Flink 任务（V1/V2/RiVersion 等），它们的 sink 配置可能不同：

- **V1 (Sink)**：直接写 ClickHouse + Kafka（`sinks = ["clickhouse", "gray_clickhouse"]`）
- **V2 (RiVersion)**：只写 Kafka，由独立 Consumer 写 ClickHouse（`sinks = ["ck_kafka"]`）

**查找任务时注意**：
1. 任务名可能包含版本后缀（如 `_ri_version`）
2. 不同版本的任务 sink 配置差异很大
3. 依赖包更换可能导致任务配置意外回退（V1 → V2）
4. 需确认当前运行的是哪个版本，以及该版本是否包含所需的 sink

**验证任务实际 sink 配置**：
```bash
# 在 DataSuite 查看任务详情
Configuration → 搜索 "sink" 关键词
确认包含哪些 sink：clickhouse / gray_clickhouse / ck_kafka
```

Flink 恢复操作参考：
1. 若有可用 Checkpoint → 从 Checkpoint 恢复（注意确认 Kafka offset 是否还在保留期内）
2. 若 Kafka offset 越界 → 设置 `scan.startup.mode=timestamp` 从指定时间重消费
3. 切换 State Backend 到 RocksDB 可解决大状态下 GC 压力问题

---

### Phase 1：捕获问题 API

> **重要前提：信任用户提供的页面上下文。** 如果用户已通过截图、DOM 路径、HTML 元素等方式标明了出问题的元素，**不要主动跳转到其他页面或重新导航**。应直接在用户指向的当前页面上捕获 API。乱跳转会导致原页面 XHR 记录丢失，且干扰用户操作。

1. **优先检查浏览器是否已在目标页面**：调用 `browser_tabs` 列出当前标签，若已在正确页面则**直接**调用 `browser_network_requests`，无需 `browser_navigate`
2. 用 `browser_network_requests` 抓取页面 XHR 请求列表
3. 从 URL 提取 `api_id`：路径最后一段即为 api_id。例如：
   - `/mgmt/api/pc/forward/data/api_mart/mgmt_app/data_api/operation__soc_facility__incoming_volume_split_by_eta__10m_v3` → `api_id = operation__soc_facility__incoming_volume_split_by_eta__10m_v3`
   - `/operation__fm__facility_driver_overview_v2` → `api_id = operation__fm__facility_driver_overview_v2`
4. 如需截图确认当前状态，用 `browser_take_screenshot`，但**不要因此跳转页面**

**多接口并发时，如何定位目标 API**：

同一页面通常同时发出 10+ 个接口请求，用以下方法缩小范围（按优先级排序）：

| 优先级 | 定位线索 | 方法 |
|--------|---------|------|
| 1 | **用户已指明** | 用户提供完整 URL 路径或 api_id → **直接采用，无需推断** |
| 2 | **数值对比** | 用户已标明页面显示的具体数值（如 436.819）→ 在各接口的 **response body** 中搜索该数值，匹配到的即为目标 API（最可靠） |
| 3 | **URL 关键词** | 在 `browser_network_requests` 的 URL 列表中，按业务含义搜索：`incoming_volume`、`order_volume`、`driver_overview`、`split_by_eta` 等 |
| 4 | 用户描述 | 用户描述"司机数量"→ 查 `driver` 相关接口；"按 ETA 拆分的到港量" → 查 `incoming_volume_split_by_eta` |
| 5 | 接口时效性 | `_10m` 结尾 = 10 分钟刷新；`_1d` 结尾 = 日级数据 |

**数值对比操作**：获取各接口的 response body（`browser_network_requests` 若含 responseBody 则直接查；否则需刷新页面重新抓取或通过 DevTools 等方式），在 JSON 中搜索用户指明的数值（注意四舍五入、格式差异，如 `436.819` 可能与 `436.82` 或字符串形式存在）。

**切勿依赖**：~~「第 N 个卡片 ≈ 第 N 个业务接口」~~ —— 接口加载有快有慢，network_requests 列表顺序不稳定，难以与卡片一一对应。

**确认后，还需查 API 实际返回值**，方法见 Phase 2.1。

> 如果用户已知 api_id，直接进入 Phase 2。

---

### Phase 2：查 API 血缘，建立初始假设

```
get_api_lineage(api_id=<api_id>)
```

#### Phase 2.1：确认 API 返回值字段映射（可选但重要）

biz_sql 通常返回多个字段，需要确认页面显示的数值对应哪个字段，避免后续查源表方向错误。

**方法**：用 `browser_network_requests` 的 response body 查看接口实际返回值：

```javascript
// 在 browser_evaluate 中执行，读取最近一次目标接口的 response
// 或者刷新页面时用 browser_network_requests 获取包含 responseBody 的完整记录
```

**常见字段命名规律**：
- `*_eoh` = End of Hour 累计量（当前小时截至当前时刻的量）
- `*_qty` = 数量
- `*_rate` = 比率（0~1 之间，前端乘以 100 显示为百分比）
- `sla_flag` = 数据时效性标记（1=数据延迟超标，前端可能显示橙色/红色警告）

解读 biz_sql，识别**可能导致无数据的高风险点**：

| 风险点 | 识别方式 | 示例 |
|--------|---------|------|
| 动态过滤参数 | `{xxx_filter}` 占位符 | `{trip_zero_filter}` 若值为 `AND trip_id<>0` |
| 日期过滤 | `= current_day` / `= today()` | 时区计算错误可导致全空 |
| 最外层过滤 | WHERE 里的新增条件 | `driver_status_filter` 默认值非空 |
| JOIN 过滤 | INNER JOIN 可能过滤掉数据 | 改 GLOBAL LEFT JOIN 可保留 |
| State TTL | ClickHouse FINAL 性能问题 | 大表加 FINAL 可能超时返回空 |

#### Phase 2.2：上下游校验（可选，用户说「校验上下游」「核对血缘」时）

1. `get_sheet_data` 读取「任务上下游信息梳理」；
2. 从「依赖的接口(仅活跃)」取 api_id，或从「app 任务」取任务名；
3. 对每个 api_id 调用 `get_api_lineage` 获取血缘；
4. 与表中血缘列（G～M：来源 kafka/hbase/hive/clickhouse，sink kafka/clickhouse/hbase）比对，输出差异（缺失、多余、需人工确认）。结果仅供参考，不自动改表。spreadsheet_id=`1WRDykqhPTsG4t1P1M2A5fNVqWxrpj1jurQ8DBXNSkNw`。

---

### Phase 3：分层验证假设

每次验证一个假设，结果驱动下一步。核心原则：**从最近的数据层往上追，逐层排除**。

#### 验证层次（从下往上）

```
Layer 4: 前端参数是否传错（trip_zero_filter 值是什么）
    ↑ 如果源表有数据但看板没数据
Layer 3: biz_sql 哪个过滤条件把数据过滤光了
    ↑ 如果 CK 表有数据
Layer 2: CK/Presto 源表是否有今日数据（Phase 0 检查）
    ↑ 如果写入时间正常
Layer 1: 上游 Flink 任务是否正常（Phase 0.1）
```

**CK 分层验证 SQL 模板**：
```sql
-- 每次加一个条件，观察数据量变化
SELECT 
    count(*)                                        AS total,
    countIf(<条件A>)                                AS after_A,
    countIf(<条件A> AND <条件B>)                    AS after_A_B
FROM <表名>
WHERE <分区条件>
  AND <主键条件>
```

**CK FINAL 注意事项**：
- 大表（亿级）加 `FINAL` 会触发全量去重合并，可能超时返回空
- 调试时先去掉 `FINAL`，确认数据存在后再加回来验证去重结果

---

### Phase 4：根据源表类型直查数据

**CK 表**（`spx_mart_manage_app`、含 `{region}` 占位符）：
```
query_ck(env=live, cluster=<ck2 或 ck6>, sql="SELECT ...")
```
> 接口查到的是读集群，我们直查写集群；cluster 由 ds_id 映射决定（107/110/112/119→ck2，114/115/122→ck6），`api_trace`/`get_api_lineage` 会自动建议；`spx_mart_pub` 为 TEST，用 env=test 直连

**Presto 表**（`sls_mart`、`spx_mart`、`spx_smartsort_ddc` 等）：
```
query_presto(sql="SELECT ...")
```

> Presto 查大表需加分区过滤（`grass_date`、`dt` 等），否则扫全表超时。

**`{region}` 占位符替换**：`sg`/`id`/`my`/`ph`/`th`/`vn`/`tw`/`br`

也可用 `api_trace` 一步完成 Phase 2+3+4：
```
api_trace(api_id, issue_description, custom_where="station_id=166 AND grass_region='id'")
```

---

### Phase 5：输出结论 — 用业务语言解释，附查询证据

面向业务用户的结论需包含：

1. **现象确认**：直接查询源表，给出实际数据数字（司机数、任务数等），证明数据本身是否正常
2. **根因说明**：用业务语言描述，不暴露技术细节（不说"参数传错"，说"看板统计口径与站点业务模式不匹配"）
3. **查询证据**：附上可重现的 SQL + 结果截图/数值
4. **建议**：短期绕过方案 + 长期修复建议

**证据 SQL 的规范**：
- 别名必须用英文（`AS task_cnt`，不能用中文）
- 附上实际查询结果数值
- 区分 CK 和 Presto 两套 SQL

**两阶段根因模板**（常见于数据管道故障 + 业务逻辑问题叠加）：
```
第一阶段：[时间范围]，[基础设施原因，业务化描述]
  证据：查询 max(_process_time) 结果 = [时间]

第二阶段：[数据恢复后]，[业务逻辑/口径问题]
  证据：查询源表结果：task_cnt=X, no_trip_cnt=X(100%), has_trip_cnt=0
  说明：[业务模式 A] 的站点不适用 [业务模式 B] 的看板统计口径

建议：
  短期：使用旧版/替代方案
  长期：产品侧评估口径扩展或入口提示
```

---

### Phase 6：输出过程文档与知识沉淀

每次排查完成后，按以下规范输出文档。

#### 6.1 本地过程文档（必选）

保存到 `docs/investigations/` 目录，文件名格式为 `YYYYMMDD-<简短描述>.md`。文档内容见 [investigation-template.md](investigation-template.md)。

#### 6.2 Confluence 知识沉淀（推荐）

将排查结论整理为知识文档，创建到**历史问题排查文档**目录下：

```
confluence_create_page(
  space_key="SPSC",
  parent_id="3105880558",
  title="[FM|MM|LM]-<简短描述>",
  content="...",
  content_format="markdown"
)
```

**命名规范**：标题必须以域名前缀开头，格式为 `[FM|MM|LM]-<简短描述>`：
- **FM**：First Mile / 取件侧相关（facility、pickup、driver 等）
- **MM**：Middle Mile / 中间链路
- **LM**：Last Mile / 派送侧相关

示例：`FM-司机看板无数据之 trip_zero_filter 口径`、`LM-派送量统计延迟根因`

**内容建议**：精简版排查结论，包含现象、根因、验证证据、建议；技术细节可放在「技术背景」小节。便于后续类似问题时通过 `confluence_search` 快速检索。

#### 6.3 Google Sheets 问题沉淀（推荐）

**内容分工**：Confluence 存详情与过程；GSheet 存一行摘要与坑点，便于快速浏览与排雷。

**目标表格**：spreadsheet_id=`1WRDykqhPTsG4t1P1M2A5fNVqWxrpj1jurQ8DBXNSkNw`，需已共享给 `cursor@spx-helper.iam.gserviceaccount.com`。

**6.3.1 app问题整理 — 一行摘要**：先 `get_sheet_data`(spreadsheet_id, sheet="app问题整理") 取当前行数，再 `update_cells` 追加一行。列映射：A 时间、B 线上问题、C 根本原因、D 耗时、E 问题原因、F 是否有效问题、G 是否有监控告警、H 类别。写前可询问用户是否写入。

**文字格式要求**：
- **A 列时间**：只到日期（YYYY-MM-DD），不到小时；若 Confluence 中为月份级（如 2026-02），需补全为具体日期（可从问题报告创建日期或文档内容推断）
- **C 列根本原因**：需追加 Confluence 详情页链接，便于溯源

**6.3.2 坑点 — 排雷要点**：排查中发现 Skill 未覆盖的坑时，写入「坑点」表。若工作表不存在，先 `create_sheet`(spreadsheet_id, title="坑点")，再写表头与数据。表头：坑点描述、现象、解决/规避方式、关联场景、来源问题、日期。

**规范要求**（本地与 Confluence 通用）：
- 不使用 emoji
- SQL 别名全部使用英文
- 所有查询结果以表格或代码块形式附上实际数值
- 根因说明使用业务语言，技术细节放在「技术背景」小节

---

### Phase 7：Skill 自优化

每次排查完成后，评估本次排查是否暴露了 Skill 的不足，若有则立即更新。

**触发更新的条件**：
- 遇到了 Skill 中未覆盖的排查路径（新的 Phase 或分支）
- 发现了新的常见坑
- 某个步骤的顺序不对，导致走了弯路
- 新增了可复用的 SQL 模板或表名
- 对用户的解释方式有更好的模板

**更新方式**：直接修改 `.cursor/skills/spx-bug-trace/SKILL.md`（项目内路径），在对应位置追加或修改内容。更新后在文档的 `## Skill 更新记录` 节记录本次改动。

**不要更新的内容**：与本次问题强相关的业务细节（具体表名、站点 ID 等），这些放进过程文档而不是 Skill。

---

## 常见坑

|| 坑 | 现象 | 解决 |
|----|------|------|
| CK FINAL 超时 | 大表加 FINAL 返回空 | 先去掉 FINAL 调试 |
| Presto 扫全表超时 | 无分区过滤查询失败 | 加 `grass_date = '...'` |
| Presto/CK 字段名不同 | 同一业务字段两边名字不同 | 先 `SELECT * LIMIT 1` 看列名 |
| Dynamic WHERE 直查源表 | biz_sql 有 `{xxx_filter}` 占位符 | 手动补充等价 WHERE 条件 |
| 表写入时间字段名不统一 | `process_time`/`_process_time` 不存在报错 | 先 `SELECT * LIMIT 1` 确认字段名；常见为 `process_time`、`_version`、`_process_time`，按此顺序尝试 |
| API 定位依赖卡片顺序 | 多卡片看板（10+ 接口）时，按「第 N 卡片 = 第 N 接口」猜错 | 优先用 URL 关键词匹配；用户若已提供接口路径或 api_id，直接采用 |
| 乱跳转页面丢失 XHR | 用户已在问题页面，跳转后原 XHR 记录消失 | 先 `browser_tabs` 确认当前 URL，若已在目标页面直接 `browser_network_requests`，禁止主动 `browser_navigate` |
| 排查时擅自修改代码 | 定位阶段不应修改任何代码文件 | 定位阶段只读不写，修复需用户明确授权后再动手 |
| 本地代码不是最新 | 排查代码时找不到预期逻辑，或误判已修复的问题为 Bug | 排查前对所有相关仓库执行 `git pull origin release`；找不到逻辑时先用 `git log --all --oneline` 查全分支历史，确认是否有未拉取的新 commit |
| 不确定源表在哪个 CK 集群 | 手动试 ck2/ck6 导致字段缺失报错 | 优先用 `api_trace` 溯源，工具会自动标注该 API 源表属于 ck2 还是 ck6；或从 biz_sql 里看 `{mgmt_db2}` 占位符，`spx_mart_manage_app` 的 ID 市场表通常在 ck6，其他市场在 ck2 |
| get_api_lineage 查询超时 | 血缘表查询 120 秒超时 | 若项目内有血缘文档（如 `app-analysis/知识沉淀` 下的 CSV），可查 `operation__xxx` 或表名关键词获取源表；或重试 `get_api_lineage`，或改 `api_trace(query_source_data=False)` 仅取血缘 |
| **过度关注代码/配置变更** | 数据突然停止，但过度分析 git 历史、DDL 变更，忽略运维事件 | **数据之前正常、突然停止 → 优先检查集群迁移、依赖更换、任务重启等运维事件**；这些比代码 bug 更常见 |
| **找不到 Flink 任务** | 按预期任务名搜索，但找不到或任务配置与预期不符 | 1) 任务可能有版本后缀（如 `_ri_version`）；2) 依赖包更换可能导致配置回退（V1→V2）；3) 用 `SHOW CREATE TABLE` 查分布式表实际指向的 local 表；4) 横向对比其他市场任务配置 |
| **分布式表指向变更** | Flink 写入表名正确，但数据未更新 | 分布式表可能在 DDL 层重定向到新表（如 v2_local），但 Flink 配置未同步；用 `SHOW CREATE TABLE` 验证实际 local 表 |
| **CK 忘记加 FINAL** | ReplacingMergeTree 表查询到重复记录 | 查询 `dwd_spx_fo_order_ri` 等表时必须加 FINAL，否则会看到同一订单的多个版本 |
| **看板数据与业务系统不一致** | 看板显示异常数据，但业务系统查询正常 | 可能是数据源不同导致：看板用 order_tracking 轨迹，业务系统用 FO 订单终态；需交叉验证两个数据源，确认是否存在状态同步问题 |

## 更多参考

- 工具参数详情见 [tools-reference.md](tools-reference.md)
- 表库对照关系见 [table-mapping.md](table-mapping.md)
- 过程文档模板见 [investigation-template.md](investigation-template.md)
- GSheet 集成设计见 [GOOGLE_SHEETS_INTEGRATION_DESIGN.md](GOOGLE_SHEETS_INTEGRATION_DESIGN.md)

---

## Skill 更新记录

| 日期 | 更新内容 | 触发原因 |
|------|----------|----------|
| 2026-03 | 新增 Phase 6.3 Google Sheets 沉淀：app问题整理（一行摘要）、坑点（排雷要点）；Phase 2.2 上下游校验；Phase -1 Confluence 辅助；依赖增加 user-mcp-atlassian、user-google-sheets | GSheet MCP 配置完成，用户要求 Confluence 存详情、GSheet 存摘要与坑点；历史问题排查目录 parent_id=3105880558 |
| 2026-03-06 | Phase 1：新增「数值对比」法——用用户标明的页面数值在 response body 中搜索匹配，作为最可靠的接口定位方式；URL 关键词优先于 DOM 顺序；明确不依赖「第 N 卡片 = 第 N 接口」 | Facility-SOC 看板数据延迟排查时，依赖卡片顺序猜错接口；用户建议应用选取的数值去对比接口返回值来定位 |
| 2026-03-06 | Phase 0：补充 `_version` 为写入时间字段，支持 process_time 不存在时的 fallback 查询 | dws_spx_soc_hub_order_volume_10m 等表无 process_time，用 _version 成功 |
| 2026-03-06 | 常见坑：新增「API 定位依赖卡片顺序」「get_api_lineage 超时」的应对 | 同上排查经验 |
| 2026-03-13 | **透明化排查流程**：每个推理步骤必须展示查询过程和中间结果，不能直接给出结论；追溯数据链路时应逐层展示；代码分析必须先展示代码片段再解释；表名确定、因果关系验证都需要可见的证据链 | BR Dashboard Sequence Bar 排查：用户反馈"希望把溯源过程也展示出来，这样我能更加相信你的论据"；排查中直接给出了上游表结论但没有充分展示推理过程（代码→表名→验证→因果），导致用户需要追问依据 |
| 2026-03-13 | **Phase 0.1：Flink 任务名称生成规则**：新增从表名反推 DataSuite 任务名的完整逻辑，包括环境前缀、CamelCase→snake_case 转换、sink 类型判断、BR 市场表名规则、JDBC URL 选择机制 | BR Dashboard Sequence Bar 排查：需要定位 `dwd_spx_fm_pickup_task_tab` 对应的 Flink 任务，通过分析 `ParseDeployConfigUtil.scala`、`DwdSpxPickupTaskMetadata.scala`、`dwd_live_flink.conf` 总结出命名规则；用户发现代码中存在 `_v2` 表但未被使用，需验证实际依赖关系 |
| 2026-03-13 | **Phase 0.1：运维事件优先排查原则**：数据突然停止时，优先检查集群迁移、依赖更换、任务重启等运维事件，避免过度关注代码变更；新增 ClickHouse 分布式表 DDL 检查方法（`SHOW CREATE TABLE`）、任务版本管理说明（V1/V2/RiVersion sink 差异）、横向对比其他市场的验证方法 | BR Dashboard Sequence Bar 排查：数据在 3.10 集群迁移后停止，但初期过度分析 git 历史和 DDL 变更；实际根因是 Paimon 依赖冲突导致任务配置回退（V1→V2），去掉了 ClickHouse sink；通过 `SHOW CREATE TABLE` 发现分布式表指向 v2_local，横向对比发现只有 BR 市场异常 |
| 2026-03-18 | **常见坑：CK 忘记加 FINAL & 数据源不一致**：ReplacingMergeTree 表查询必须加 FINAL；看板数据与业务系统不一致时需交叉验证数据源差异（order_tracking 轨迹 vs FO 订单终态） | ID LM Driver Performance 看板排查：初期查询 `dwd_spx_fo_order_ri_id_all` 未加 FINAL 导致看到重复记录；用户反馈订单在 FO 系统已 delivered 但看板仍显示 Backlog，发现 order_tracking 轨迹状态未同步到终态，需 Order 域同学修复数据一致性问题 |
| 2026-03-19 | **app问题整理 文字格式要求**：A 列时间只到日期（YYYY-MM-DD），不到小时；月份级时间需补全为具体日期；C 列根本原因需追加 Confluence 链接 | 从 Confluence 历史问题目录整理到 GSheet 时，时间格式与根本原因链接的规范化要求 |

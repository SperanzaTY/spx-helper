---
name: flink-alert-triage
description: SPX Flink 任务告警自动分诊与排查工作流。解析 SeaTalk 告警群消息 -> 结构化提取告警信息 -> 分级诊断 -> 输出标准化排查报告。支持 Bot 自动响应和人工深度排查两种模式。当收到 Flink 告警（Checkpoint 失败、Kafka Lag、任务重启、任务 FAILED 等）时使用。
---

<!-- 本 Skill 位于 ~/.cursor/skills/flink-alert-triage/，全局可用。
     项目副本维护在 SPX_Helper/.cursor/skills/flink-alert-triage/ 中。
     依赖 MCP：flink-query、ck-query、seatalk-reader。-->

# Flink Alert Triage -- 告警自动分诊与排查

## 总览

本 skill 定义了一套 **三层递进** 的 Flink 告警响应框架：

| 层次 | 名称 | 触发方式 | 耗时 | 输出 |
|------|------|----------|------|------|
| **L1** | 快速分诊 | Bot 自动 / 人工 | <30s | 3-5 行简报 |
| **L2** | 深度诊断 | 首次告警自动 / 人工触发 | 30s-90s | 完整排查报告 |
| **L3** | 恢复操作 | 人工触发 | 按需 | 操作步骤 + 监控清单 |

**核心原则**：
1. **首次详查，后续简报** -- 同一任务的第一次告警做 L2 深度诊断，后续重复告警用 L1 简报 + 趋势变化
2. **严重度驱动响应深度** -- INFO/LOW 不调 API，MEDIUM 查关键指标，HIGH/CRITICAL 全链路诊断
3. **跨任务关联** -- 同系列任务（同 task 前缀不同 market）首次告警时主动批量扫描
4. **降级优雅** -- Cookie 过期时切换到"告警文本分析"模式，不输出空洞的 API 错误

---

## Phase 0: 告警解析

### 0.1 告警消息格式

SeaTalk 告警群中 `flink job alarm` 发送的消息遵循固定格式：

**活跃告警**:
```
[Flink Alarm][{project}][{task_name}] {alert_type}
    Alarm Sent Time: {timestamp}
    Message:
    {alert_type}> {threshold_detail}
    Job Link:https://datasuite.shopee.io/flink/operation/stream/{app_id}
    PrometheusUrl:{prometheus_url}
```

**恢复告警**:
```
[resolved][Flink Alarm][{project}][{task_name}] {alert_type}
    Recover Time:{timestamp}
    Message:
    {alert_type}> {threshold_detail}
    Job Link:https://datasuite.shopee.io/flink/operation/stream/{app_id}
    PrometheusUrl:{prometheus_url}
```

### 0.2 结构化提取

从告警文本中提取以下字段：

| 字段 | 提取方式 | 示例 |
|------|----------|------|
| `is_resolved` | 消息以 `[resolved]` 开头 | `true` / `false` |
| `project` | 第一个 `[]` 内（跳过 resolved/Flink Alarm） | `spx_mart` |
| `task_name` | 第二个实质 `[]` 内 | `spx_mart__ads_spx_mgmt_fm_hub_pup_order_volume10m_tab_vn_g_kafka_ver` |
| `alert_type` | `]` 后的文本（标准化） | `checkpoint_failed` / `kafka_lag` / `job_restart` |
| `app_id` | Job Link URL 中 `/stream/` 后的数字 | `741496` |
| `threshold` | Message 行 `>` 后的内容 | `10000000` / `2 in 30 minutes` |
| `timestamp` | Alarm Sent Time 或 Recover Time | `2026-04-09 08:20:32` |
| `prometheus_url` | PrometheusUrl 行 | URL |
| `market` | 从 task_name 中提取 `_tab_{market}_` 部分 | `vn` / `id` / `ph` / `my` |
| `task_series` | task_name 去掉 market 和 sink 后缀的公共前缀 | `ads_spx_mgmt_fm_hub_pup_order_volume10m_tab` |

### 0.3 告警类型标准化

| 原始文本 | 标准类型 | 简称 |
|----------|----------|------|
| `TaskManager Kafka Lag Exceeds Threshold` | `kafka_lag` | Kafka Lag |
| `Number of Failed Checkpoints Exceeds Threshold` | `checkpoint_failed` | CP 失败 |
| `Job Full Restart Times Exceeds Threshold` | `job_restart` | 任务重启 |
| `Application Status Changed to FAILED` | `task_failed` | 任务 FAILED |
| `Application Status Changed to LOST` | `task_lost` | 任务 LOST |
| `TaskManager Backpressure Exceeds Threshold` | `backpressure` | 背压 |

### 0.4 严重度初判（仅基于告警文本，不调 API）

| 条件 | 严重度 | 说明 |
|------|--------|------|
| `is_resolved = true` | **INFO** | 已恢复，仅确认 |
| `alert_type = kafka_lag` | **LOW** | 消费积压，通常可自愈 |
| `alert_type = checkpoint_failed` | **MEDIUM** | Checkpoint 失败，需关注 |
| `alert_type = backpressure` | **MEDIUM** | 背压告警 |
| `alert_type = job_restart` | **HIGH** | 频繁重启，可能进入恶性循环 |
| `alert_type = task_failed` | **CRITICAL** | 任务已停止，不会自愈 |
| `alert_type = task_lost` | **CRITICAL** | 任务丢失，需紧急处理 |

---

## 输出与 SeaTalk 宿主（全局）

发到群聊前，**SeaTalk Agent 会自动**在正文外包一层：`[Alarm Bot] Auto-Investigation` 标题、上下分隔线、结尾耗时与会话名。

因此排查回复**不要**再输出：

- `[Alarm Bot]`、`Auto-Investigation`、`**[Alarm Bot]**` 等标题行
- 整行仅由 `━` `═` `-` 组成的装饰分隔线（Markdown 表格的 `| --- |` 除外）

**正文从第一行任务摘要或标题开始即可**（例如 `Flink 告警 -- App 741496` 或 `第 2 次告警 - xxx (VN)`）。Agent 侧也会对重复外层格式做去重，但 prompt 与模板应以「仅正文」为准。

---

## Phase 1: 重复告警处理策略

### 1.1 告警计数与分级响应

对同一 `app_id` + `alert_type` 的告警，按出现次数递进响应：

| 次数 | 响应级别 | 行为 |
|------|----------|------|
| **第 1 次** | L2 深度诊断 | 完整报告（见 Phase 2） |
| **第 2-3 次** | L1 趋势简报 | 仅输出趋势变化（恶化/稳定/改善），3-5 行 |
| **第 4+ 次** | L1 升级告急 | 强调无人响应 + 关键数字，呼吁人工介入 |
| **resolved** | L1 恢复确认 | 确认恢复 + 残留风险提示 |

### 1.2 L1 趋势简报模板（第 2-3 次）

```
第{N}次告警 - {task_name简称} ({market})

状态: {与上次对比的趋势描述}
关键变化: {最重要的1-2个指标变化}
结论: {是否需要人工介入的一句话判断}

Job: {job_url}
```

**关键**：趋势判断需要拉取少量指标。调用：
- `get_flink_metrics(app_id, category="overview")` -- 获取延迟和重启次数
- 对比上次诊断的数值，判断恶化/稳定/改善

### 1.3 L1 升级告急模板（第 4+ 次）

```
第{N}次告警 - {task_name简称} | 已持续{duration}无人响应

{一句话核心问题} | 延迟: {latency} | 状态: {status}

[需立即人工介入] {job_url}
```

### 1.4 L1 恢复确认模板

```
已恢复 - {task_name简称} ({market})

{恢复原因一句话} | 残留风险: {有/无}
{如有残留风险，一行说明}
```

### 1.5 重复告警抑制规则

以下情况**不产生新回复**（避免刷屏）：
- 同一 `app_id` + `alert_type` 在 **5 分钟内** 重复触发（告警系统批量发送）
- `[resolved]` 告警紧接着同类型 `[active]` 告警（阈值边缘波动）-- 合并为一条回复

---

## Phase 2: L2 深度诊断（首次告警或人工触发）

### 2.0 诊断前置检查

在调用 Flink MCP 工具前，先检查可用性：

```
尝试调用 get_flink_app_detail(app_id)
  成功 → 正常诊断流程
  失败(401) → Cookie 过期，切换到"降级模式"（Phase 2.9）
```

### 2.1 并行数据拉取

为减少响应时间，以下调用**并行执行**：

**第一批（必要）**：
```
get_flink_app_detail(app_id)           -- 基本信息
get_flink_instance(app_id)             -- 实例状态
get_flink_exceptions(app_id)           -- 异常列表
get_flink_metrics(app_id, "overview")  -- 概览指标
```

**第二批（按告警类型选择性拉取）**：

| 告警类型 | 额外拉取 |
|----------|----------|
| `kafka_lag` | `get_flink_metrics(app_id, "kafka")`, `get_flink_metrics(app_id, "backpressure")` |
| `checkpoint_failed` | `get_flink_checkpoints(app_id)`, `get_flink_metrics(app_id, "checkpoint")` |
| `job_restart` | `get_flink_runtime_exceptions(app_id)`, `get_flink_operation_log(app_id)` |
| `task_failed` | `get_flink_runtime_exceptions(app_id)`, `get_flink_operation_log(app_id)`, `get_flink_alarm_log(app_id)` |
| `backpressure` | `get_flink_graph_metrics(app_id)`, `get_flink_vertices(app_id)` |

**第三批（可选深入）**：
```
get_flink_metrics(app_id, "cpu_memory")     -- 资源使用
get_flink_metrics(app_id, "gc")             -- GC 压力
get_flink_resource_estimation(app_id)        -- 资源调优建议
get_flink_taskmanagers(app_id)               -- TM 列表
get_flink_job_config(app_id)                 -- 运行时配置
```

### 2.2 根因分析决策树

按告警类型 + 指标组合判断根因：

#### Kafka Lag 告警
```
Kafka Lag 超阈值
├── Checkpoint 正常 + 背压低 → 上游流量突增（通常自愈）
├── Checkpoint 正常 + 背压高 → 处理能力不足，需扩容
├── Checkpoint 失败 + 背压高 → 资源严重不足，数据有丢失风险
└── 任务状态非 RUNNING → 任务已挂，见 task_failed 流程
```

#### Checkpoint 失败告警
```
Checkpoint 失败
├── 失败原因: expired/timeout
│   ├── 背压高 → 反压导致 Barrier 对齐超时
│   ├── State 大(>5GB) → State 过大，考虑增量 CP 或 TTL
│   └── 背压低 + State 小 → 存储后端(HDFS/S3)慢
├── 失败原因: TaskManager heartbeat timeout
│   ├── GC 时间占比 > 15% → GC 压力大，增加内存
│   ├── CPU > 90% → CPU 打满
│   └── 多个不同 TM 超时 → K8s 节点级问题
├── 失败原因: Checkpoint Coordinator suspending
│   └── ResourceManager leader changed → K8s Pod 重调度
└── 连续失败 N 小时 → 高风险：crash 后无法恢复
```

#### 任务重启告警
```
Job Full Restart
├── 异常: KAFKA_OFFSET_OUT_OF_RANGE_EXCEPTION
│   └── Kafka 数据过期，消费位点已不存在 → 需无状态重启
├── 异常: OutOfMemoryError
│   └── 内存不足 → 增加 TM 内存
├── 异常: TaskManager heartbeat timeout
│   └── TM 失联 → 检查 K8s 节点和 GC
├── 异常: SQL execution failed
│   └── SQL 逻辑错误 → 检查 Logify 日志
└── 重启次数已达上限(restart-strategy exhausted)
    └── 任务即将 FAILED → 准备人工恢复
```

#### 任务 FAILED 告警
```
Task FAILED
├── 检查 restart-strategy → 重启次数已耗尽
├── 检查最后异常 → 定位根因（同上述分类）
├── 检查最后成功 Checkpoint → 评估能否带状态恢复
│   ├── 有近期 CP → 可从 CP 恢复
│   └── 无近期 CP / KAFKA_OFFSET_OUT_OF_RANGE
│       └── 只能无状态重启，存在数据缺口
└── 检查同系列其他市场 → 是否批量故障
```

### 2.3 同系列任务关联扫描

当首次触发告警时，识别 `task_series`（去掉 market 后缀的公共前缀），主动扫描同系列其他市场：

```
从 task_name 提取 task_series（如 ads_spx_mgmt_fm_hub_pup_order_volume10m_tab）
search_flink_apps(keyword="{task_series 的核心关键词}", project_name="{project}")
对每个匹配的任务，快速检查：
  get_flink_instance(app_id) → 状态是否正常
  get_flink_metrics(app_id, "overview") → 延迟是否异常
```

输出格式：
```
同系列任务扫描:
| 市场 | App ID | 状态 | 延迟 | 风险 |
|------|--------|------|------|------|
```

**限制**：关联扫描仅在首次 L2 诊断中执行，后续 L1 简报不重复。

### 2.4 严重度精判（基于诊断数据）

在 Phase 0.4 初判基础上，结合实际指标调整：

| 升级条件 | 从 → 到 |
|----------|---------|
| 任务状态 = FAILED | 任何 → CRITICAL |
| 延迟 > 6 小时 | LOW/MEDIUM → HIGH |
| 连续 N 小时无成功 Checkpoint (N>=6) | MEDIUM → HIGH |
| 连续 N 小时无成功 Checkpoint (N>=12) | HIGH → CRITICAL |
| CPU 或 Heap > 95% | 加一级 |
| 重启次数接近策略上限 | 加一级 |
| 异常中包含 KAFKA_OFFSET_OUT_OF_RANGE | 加一级 |

| 降级条件 | 从 → 到 |
|----------|---------|
| resolved + 延迟 < 1 分钟 | 任何 → INFO |
| Kafka Lag 已回落到阈值 50% 以下 | LOW → INFO |

### 2.5 L2 诊断报告模板

```
Flink 告警排查 -- App {app_id} ({market})

任务: {task_name_short}
状态: {status} | 资源: {cpu} CPU / {memory} GB
告警类型: {alert_type_cn}

---

根因分析

{根因描述，2-4 句话，含直接原因和深层原因}

关键指标:
| 指标 | 当前值 | 状态 |
|------|--------|------|
| 延迟 | {value} | [{severity}] |
| Kafka Lag | {value} | [{severity}] |
| 背压 | {value} | [{severity}] |
| CP 成功率 | {value} | [{severity}] |
| CPU/Heap | {value} | [{severity}] |

{同系列扫描结果表格，仅首次}

---

结论: [{severity}]

{一句话结论}

建议:
1. {最重要的建议}
2. {次要建议}

链接: Job: {url} | Grafana: {url}
```

### 2.6 输出约束

- L2 报告总长度**不超过 60 行**（SeaTalk 消息过长影响阅读）
- 指标表格只列**异常项**（全部正常则写一句"各项指标正常"）
- 不输出完整异常堆栈（仅提取关键类名和一句话描述）
- 不输出 API 原始返回（仅提取有用数据）
- Grafana 链接始终附上，即使当前无法访问

### 2.7 Cookie 过期降级模式

当 Flink MCP 工具返回 401 或连接失败时，切换到降级模式：

**降级模式行为**：
1. 不再尝试调用 Flink MCP 工具（避免输出大量错误信息）
2. 仅基于告警文本内容进行分析
3. 利用 `query_messages_sqlite` 搜索同任务的历史告警，补充上下文
4. 输出中明确标注 `[降级模式]`，并提示刷新 Cookie 的方法

**降级模式报告模板**：
```
Flink 告警 [降级模式] -- App {app_id}

{基于告警文本的分析，参照 Phase 2.2 决策树}

[NOTE] Flink MCP 工具不可用（Cookie 过期），诊断基于告警文本。
如需深入排查：Chrome 登录 DataSuite 后执行 refresh_cookies_from_browser()。
```

---

## Phase 3: L3 恢复操作引导（人工触发）

当人工决定介入恢复时，按此流程操作。

### 3.1 恢复决策树

```
任务需要恢复
├── 任务状态 = RUNNING（但异常）
│   ├── 延迟可接受 → 观察，不操作
│   ├── 延迟不可接受 + 有 Savepoint → 从 Savepoint 重启
│   └── 延迟不可接受 + 无 Savepoint → 从最新 Checkpoint 重启
├── 任务状态 = FAILED
│   ├── 最近有成功 Checkpoint（<6h）
│   │   ├── 异常非 KAFKA_OFFSET_OUT_OF_RANGE → 从 Checkpoint 带状态重启
│   │   └── 异常为 KAFKA_OFFSET_OUT_OF_RANGE → 无状态重启（数据会有缺口）
│   ├── 无近期 Checkpoint
│   │   └── 无状态重启（Start without state）
│   └── 反复重启失败（带状态启动 → 同样异常 → 再次 FAILED）
│       └── 必须无状态重启，带状态恢复会反复失败
└── 任务状态 = LOST
    └── 联系平台或集群管理员
```

### 3.2 无状态重启 SOP（Start without state）

**什么是无状态重启**：跳过 Checkpoint/Savepoint 状态，从 Kafka 最新 offset 开始消费。代价是丢失窗口状态和精确一次语义保证，可能产生数据缺口。

**操作步骤**：
1. 打开 DataSuite Job 页面：`https://datasuite.shopee.io/flink/operation/stream/{app_id}`
2. 点击 "Start" 按钮（非 "Restart"）
3. 在启动选项中选择 "Start without state"
4. 确认启动

### 3.3 重启后监控清单

重启后需要持续监控以下指标（建议关注 30 分钟）：

| 检查项 | 工具 | 预期 |
|--------|------|------|
| 任务状态 | `get_flink_instance(app_id)` | RUNNING，无新异常 |
| Kafka Lag | `get_flink_metrics(app_id, "kafka")` | 持续下降 |
| 背压 | `get_flink_metrics(app_id, "backpressure")` | 低于 500ms/s |
| Checkpoint | `get_flink_checkpoints(app_id)` | 至少 1 次成功 |
| 下游数据 | `query_ck(sql, env="live", cluster="ck2")` | 有新数据写入 |
| CPU/Heap | `get_flink_metrics(app_id, "cpu_memory")` | CPU < 80%, Heap < 85% |

**注意**：任务状态 `RUNNING` 不代表数据已恢复！必须检查下游表有新数据写入才算真正恢复。

### 3.4 下游 ClickHouse 数据检查 SQL

```sql
-- 检查最新写入时间（适用于 gray_clickhouse sink）
SELECT
    count() AS row_cnt,
    toDateTime(max(process_time)) AS latest_write,
    dateDiff('minute', toDateTime(max(process_time)), now()) AS minutes_ago
FROM spx_mart_manage_app.{table_name}_{market}_all
```

如需批量检查所有市场：

```sql
SELECT 'sg' AS market, count() AS row_cnt, toDateTime(max(process_time)) AS latest_write
FROM spx_mart_manage_app.{table_name}_sg_all
UNION ALL
SELECT 'id', count(), toDateTime(max(process_time))
FROM spx_mart_manage_app.{table_name}_id_all
UNION ALL
SELECT 'my', count(), toDateTime(max(process_time))
FROM spx_mart_manage_app.{table_name}_my_all
UNION ALL
SELECT 'th', count(), toDateTime(max(process_time))
FROM spx_mart_manage_app.{table_name}_th_all
UNION ALL
SELECT 'ph', count(), toDateTime(max(process_time))
FROM spx_mart_manage_app.{table_name}_ph_all
UNION ALL
SELECT 'vn', count(), toDateTime(max(process_time))
FROM spx_mart_manage_app.{table_name}_vn_all
UNION ALL
SELECT 'br', count(), toDateTime(max(process_time))
FROM spx_mart_manage_app.{table_name}_br_all
ORDER BY row_cnt ASC
```

---

## Phase 4: 特殊场景处理

### 4.1 同系列批量故障

当 2 个以上同系列任务同时告警时（如今晚 VN/ID/PH/MY 四个市场同时出问题）：

1. **合并报告**：不为每个市场单独输出 L2 报告，而是输出一份"系列汇总报告"
2. **按严重度排序**：最严重的市场放最前
3. **共性根因分析**：判断是否有公共原因（如上游 Kafka topic 问题、K8s 集群问题）

**汇总报告模板**：
```
系列任务批量告警 - {task_series}

{task_series} 系列多个市场同时告警:

| 市场 | App ID | 告警类型 | 严重度 | 核心问题 |
|------|--------|----------|--------|----------|
| {market} | {id} | {type} | [{severity}] | {一句话} |
...

共性分析: {是否有公共根因}

建议:
1. 优先处理 {最严重的市场}
2. {统一建议}
```

### 4.2 告警风暴抑制

当短时间内（10 分钟内）收到 **5 条以上** 来自不同任务的告警时，切换到"风暴模式"：

- 不再逐条回复
- 收集所有告警后输出一份汇总
- 按严重度排序，标注需要人工介入的任务

### 4.3 非工作时间告警

如果告警发生在非工作时间（20:00 - 09:00 或周末），在报告末尾追加：

```
[NOTE] 当前为非工作时间，如需紧急处理请联系值班同学。
```

---

## Phase 5: 工具清单

| 工具 | 用途 | 使用场景 |
|------|------|----------|
| `get_flink_app_detail` | 任务基本信息（名称、状态、Owner、配置） | L2 必需 |
| `get_flink_instance` | 实例状态（当前/历史，延迟、异常数） | L1/L2 必需 |
| `get_flink_exceptions` | DataSuite 异常列表（摘要级） | L2 必需 |
| `get_flink_runtime_exceptions` | Runtime 完整异常堆栈 | L2 按需（task_failed/job_restart） |
| `get_flink_metrics(category)` | 分类指标（overview/kafka/cpu_memory/checkpoint/backpressure/gc） | L1/L2 核心 |
| `get_flink_checkpoints` | Checkpoint 详细统计（失败原因、耗时） | L2 按需（checkpoint_failed） |
| `get_flink_operation_log` | 操作记录（启动/停止/重启历史） | L2 按需 |
| `get_flink_alarm_log` | 告警历史 | L2 按需 |
| `get_flink_graph_metrics` | 算子级指标（定位瓶颈算子） | L2 按需（backpressure） |
| `get_flink_vertices` | 算子拓扑和并行度 | L2 按需 |
| `get_flink_taskmanagers` | TaskManager 资源详情 | L2 按需 |
| `get_flink_job_config` | 运行时配置 | L2 按需 |
| `get_flink_resource_estimation` | 资源调优建议 | L3 |
| `get_flink_latency_analysis` | 延迟根因分析 | L3 |
| `get_flink_lineage` | 数据血缘（Source/Sink） | L3 |
| `search_flink_apps` | 按关键词搜索任务 | 同系列扫描 |
| `search_flink_table_lineage` | 从表名反查 Flink 任务 | 同系列扫描 |
| `query_flink_logs` | 查询 Logify 日志（注意独立认证） | L3 按需 |
| `get_flink_log_url` | 生成 Logify 日志链接 | L2/L3 |
| `diagnose_flink_app` | 一键全栈诊断 | L3（耗时较长，不适合 Bot 自动） |
| `query_ck` | 查询 ClickHouse 下游数据 | L3 恢复验证 |
| `query_messages_sqlite` | 搜索 SeaTalk 历史消息 | 降级模式 / 历史关联 |
| `refresh_cookies_from_browser` | 刷新 DataSuite Cookie | Cookie 过期时 |

---

## Phase 6: 常见根因速查表

| 现象组合 | 根因 | 建议 |
|----------|------|------|
| Kafka Lag 高 + 背压高 + CPU 高 | 计算资源不足 | 增加并行度或 TM CPU |
| Kafka Lag 高 + 背压高 + CPU 低 | I/O 瓶颈（Sink 或 Lookup 慢） | 检查下游系统响应时间 |
| CP 失败 + TM heartbeat timeout + 不同 TM 轮流超时 | K8s 节点级问题或资源争抢 | 检查 K8s 节点健康状态 |
| CP 失败 + expired/timeout + State 大 | State 过大导致 CP 超时 | 增大 CP timeout / 启用增量 CP |
| CP 失败 + RM leader changed to null | ResourceManager Pod 被驱逐 | K8s 资源不足 |
| 任务 FAILED + restart-strategy exhausted | 异常超过重启策略上限 | 查最后异常根因，修复后重启 |
| 任务 FAILED + KAFKA_OFFSET_OUT_OF_RANGE | 消费位点过期 | 无状态重启，评估数据缺口 |
| Heap > 95% + GC 时间占比 > 15% | 内存压力导致 GC 风暴 | 增加 TM 内存 |
| 同系列多市场同时告警 | 公共依赖故障或资源池问题 | 先检查公共上游和 K8s 集群 |

---

## Phase 7: 常见坑与经验教训

### 7.1 "带状态启动"导致反复失败

当任务因 `KAFKA_OFFSET_OUT_OF_RANGE_EXCEPTION` 失败后，从 Checkpoint 带状态恢复会**再次失败**，因为 Checkpoint 中保存的 offset 同样已过期。此时必须"Start without state"。

**识别方法**：任务反复 FAILED → 重启 → FAILED，且异常始终是 `KAFKA_OFFSET_OUT_OF_RANGE`。

### 7.2 RUNNING 不等于数据已恢复

任务重启后状态变为 `RUNNING`，但下游表可能仍无新数据。必须检查 ClickHouse 的 `max(process_time)` 才能确认数据恢复。

### 7.3 Logify 认证独立于 DataSuite

`query_flink_logs` 使用 Logify API，其认证 Cookie 与 DataSuite 独立。即使 DataSuite Cookie 有效，Logify 也可能 401。需在浏览器中单独访问 Logify 页面刷新 Cookie。

### 7.4 告警 resolved 不代表问题解决

`[resolved]` 告警仅表示指标回落到阈值以下，不代表根因已解决。常见场景：
- Kafka Lag 阈值边缘反复波动（resolved 后几分钟再次 active）
- Checkpoint 失败的 30 分钟滑动窗口滑过（失败仍在发生，只是不在窗口内）

### 7.5 DataSuite 搜索 API 不精确

`search_flink_apps` 的模糊匹配经常返回无关结果。推荐：
- 使用 `search_flink_table_lineage` 从表名精确反查
- 使用尽可能短且唯一的关键词
- 从 SeaTalk 告警消息中直接提取 `app_id`

### 7.6 同系列任务的资源配置差异大

同一 `task_series` 不同市场的资源配置可能差异很大（如 ID: 145 CPU vs VN: 97 CPU），相同问题在不同市场表现不同。不能假设一个市场的修复方案直接适用于另一个。

---

## Skill 更新记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-04-09 | v1.0 | 初始版本：三层响应模型、告警解析、根因决策树、重复告警策略、输出模板 |

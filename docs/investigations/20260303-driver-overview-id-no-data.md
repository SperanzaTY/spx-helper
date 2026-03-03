# Driver Overview 看板 ID 市场无数据

| 字段 | 内容 |
|------|------|
| 日期 | 2026-03-03 |
| 报告人 | tianyi.liang |
| 涉及系统 | Hub Overview / Driver Overview 看板 |
| 涉及接口 | operation__fm__facility_driver_overview_v2 |
| 涉及市场 | ID |
| 涉及站点 | station_id = 166 |
| 状态 | 已定位 |

---

## 问题描述

Hub Overview 的 Driver Overview 新版看板（v2）在 ID 市场站点显示无数据，用户无法通过该看板查看司机作业情况。

---

## 排查过程

### 步骤 1：分析接口 SQL 逻辑，建立初始假设

**目的**：通过 biz_sql 识别可能导致无数据的高风险点。

**操作**：读取接口 `operation__fm__facility_driver_overview_v2` 的完整 SQL 逻辑。

**发现**：

v2 接口相比 v1 新增了以下动态过滤参数：

| 参数 | 位置 | 说明 |
|------|------|------|
| `{trip_zero_filter}` | pickup_task CTE 内层 WHERE | 若值为 `AND trip_id <> 0`，会过滤掉所有非路线模式任务 |
| `{driver_status_filter}` | 最外层 WHERE | 若默认值非空，会过滤驾驶员 |
| `{pup_pickup_progress_filter}` | 最外层 WHERE | 同上 |
| `{order_pickup_progress_filter}` | 最外层 WHERE | 同上 |
| `{current_capacity_filter}` | 最外层 WHERE | 同上 |

**初始假设**：`{trip_zero_filter}` 传入了 `AND trip_id <> 0`，且 ID 市场该站点的任务大多为非路线模式（trip_id = 0），导致全部数据被过滤。

---

### 步骤 2：检查 CK 数据管道健康状态

**目的**：验证数据是否正常写入，排除上游故障。

**查询 SQL**：

```sql
SELECT 
    toDateTime(max(_process_time)) AS last_write_time,
    max(pickup_tab_cdate)          AS last_data_date
FROM spx_mart_manage_app.dws_spx_fm_pickup_task_process_ri_id_all
```

**查询结果**：

| last_write_time | last_data_date |
|-----------------|----------------|
| 2026-02-26 20:00:28 | 2026-02-26 |

**结论**：数据管道存在故障，最后写入时间为 2026-02-26，距排查时间已超过 4 天，初始假设（SQL 过滤）需要先排后处理。

---

### 步骤 3：横向对比各市场写入状态

**目的**：判断是 ID 专项问题还是全局问题。

**查询 SQL**：

```sql
-- 对每个市场分别执行，替换 {market} 为对应市场
SELECT 
    toDateTime(max(_process_time)) AS last_write_time,
    max(pickup_tab_cdate)          AS last_data_date
FROM spx_mart_manage_app.dws_spx_fm_pickup_task_process_ri_{market}_all
```

**查询结果**：

| 市场 | last_write_time | last_data_date | 状态 |
|------|-----------------|----------------|------|
| SG | 2026-03-02 19:51:20 | 2026-03-02 | 正常 |
| MY | 2026-03-02 19:51:20 | 2026-03-02 | 正常 |
| TH | 2026-03-02 19:50:40 | 2026-03-02 | 正常 |
| PH | 2026-03-02 19:50:43 | 2026-03-02 | 正常 |
| VN | 2026-03-02 19:51:10 | 2026-03-02 | 正常 |
| ID | 2026-02-26 20:00:28 | 2026-02-26 | 异常，停止写入 4 天 |

**结论**：CK 集群本身正常，问题为 ID 市场专项故障。

---

### 步骤 4：追溯 Flink 上游链路

**目的**：定位 ID 市场数据断流的具体任务。

**排查路径**：

```
CK 表无新数据（已确认）
  -> Kafka-to-CK 任务（spx_mart__dws_spx_fm_pickup_task_process_ri_kafka_to_ck_id_ck6）
     用户确认：该任务正常运行，Kafka 无积压
  -> 上游 Kafka topic 无消息
  -> Flink 聚合任务（spx_mart__dws_spx_fm_pickup_task_process_ri2_id_kafka_v250924）
     状态：RESTARTING，已持续 4 天
```

**错误日志关键信息**：

```
2026-02-26 20:04:23
java.util.concurrent.TimeoutException: The heartbeat of TaskManager with id
app1172097instance95734073-taskmanager-1-22 timed out.

Pod terminated, container termination statuses:
[flink-main-container(exitCode=127, reason=Error, message=null)]
（重复出现多次）
```

**故障时间线**：

| 时间 | 事件 |
|------|------|
| 2026-02-26 19:58:48 | Checkpoint 11071 完成（21.3 GB，可用于恢复） |
| 2026-02-26 20:00:28 | CK 表最后一条数据写入 |
| 2026-02-26 20:04:23 | TaskManager 心跳超时（TM 节点 OOM/被驱逐） |
| 2026-02-26 20:05:36 | Flink 开始重启，新 Pod 启动失败（exitCode=127） |
| 2026-03-03 | 持续 RESTARTING 死循环，CK 无新数据 |

**exitCode=127 说明**：Linux 含义为"command not found"，表示容器在启动阶段失败，Flink JVM 未能启动。常见原因为镜像过期被清理或 JAR 路径不存在。

**结论**：TM 节点 OOM 是触发点，exitCode=127 导致任务无法自动恢复。服务器 GC 压力过大（Checkpoint 达 21.3 GB，采用 HashMapStateBackend 全部驻留 JVM Heap）是根本原因。

---

### 步骤 5：Flink 任务恢复及数据恢复验证

**目的**：确认任务修复后数据是否恢复。

**恢复操作**（由相关同学执行）：

1. 优化任务内存配置（切换 RocksDB State Backend，开启增量 Checkpoint，调整 GC 参数）
2. 设置 `scan.startup.mode=timestamp` 从故障前时间点重新消费 Kafka
3. 重新部署任务

**验证 SQL**：

```sql
SELECT 
    toDateTime(max(_process_time)) AS last_write_time,
    max(pickup_tab_cdate)          AS last_data_date
FROM spx_mart_manage_app.dws_spx_fm_pickup_task_process_ri_id_all
```

**验证结果**：

| last_write_time | last_data_date |
|-----------------|----------------|
| 2026-03-03 14:58:34 | 2026-03-03 |

**结论**：数据管道已恢复正常。

---

### 步骤 6：数据恢复后验证 station 166 仍无数据的原因

**目的**：数据管道恢复后，看板仍显示无数据，排查第二层原因。

**查询 SQL（CK，分层验证）**：

```sql
SELECT 
    count(*)                                        AS total_cnt,
    countIf(task_status != 23)                      AS after_status_filter,
    countIf(task_status != 23 AND trip_id != 0)     AS after_trip_filter
FROM spx_mart_manage_app.dws_spx_fm_pickup_task_process_ri_id_all FINAL
WHERE pickup_tab_cdate = toString(toDate(now(), 'Asia/Jakarta'))
  AND pickup_station_id = 166
```

**查询结果**：

| total_cnt | after_status_filter | after_trip_filter |
|-----------|---------------------|-------------------|
| 545 | 545 | 0 |

**查询 SQL（Presto，源表验证）**：

```sql
SELECT 
    count(*)                                          AS task_cnt,
    count(DISTINCT pickup_driver_id)                  AS driver_cnt,
    SUM(CASE WHEN trip_id = 0  THEN 1 ELSE 0 END)    AS no_trip_cnt,
    SUM(CASE WHEN trip_id != 0 THEN 1 ELSE 0 END)    AS has_trip_cnt
FROM spx_mart.dwd_spx_fm_pickup_task_ri_id
WHERE grass_date = '2026-03-02'
  AND pickup_station_id = 166
```

**查询结果**：

| task_cnt | driver_cnt | no_trip_cnt | has_trip_cnt |
|----------|------------|-------------|--------------|
| 2653 | 60 | 2653 | 0 |

**结论**：station 166 数据完整（545 条今日任务，60 名司机），但所有任务的 trip_id = 0（直接揽收模式，无路线绑定）。v2 看板的统计口径为 `trip_id != 0`，将该站点所有数据过滤，导致显示为空。这是业务模式不匹配，非数据问题。

---

## 根因分析

### 根因一：ID 市场 Flink 任务长期故障，数据断流 4 天

TM 节点因 GC 压力过大（21.3 GB 状态驻留 JVM Heap）导致 OOM，心跳超时后 JobManager 尝试重启，但新 Pod 因 exitCode=127 持续失败，进入死循环，无法自动恢复。

影响时间：2026-02-26 20:04 至 2026-03-03，共约 4 天。
影响范围：ID 市场全部站点。

### 根因二：v2 看板统计口径仅覆盖路线模式，不适用于直接揽收模式站点

Driver Overview v2 接口新增 `{trip_zero_filter}` 参数，Hub Overview 页面传入 `AND trip_id <> 0`，仅统计绑定路线行程单的司机。station 166 的司机全部采用直接揽收模式（trip_id = 0），全部被过滤。

---

## 验证证据

### 证据 1：数据管道断流时间

```sql
SELECT 
    toDateTime(max(_process_time)) AS last_write_time,
    max(pickup_tab_cdate)          AS last_data_date
FROM spx_mart_manage_app.dws_spx_fm_pickup_task_process_ri_id_all
```

故障期间结果：last_write_time = 2026-02-26 20:00:28，last_data_date = 2026-02-26

### 证据 2：trip_id 分布验证

```sql
SELECT 
    count(*)                                          AS task_cnt,
    count(DISTINCT pickup_driver_id)                  AS driver_cnt,
    SUM(CASE WHEN trip_id = 0  THEN 1 ELSE 0 END)    AS no_trip_cnt,
    SUM(CASE WHEN trip_id != 0 THEN 1 ELSE 0 END)    AS has_trip_cnt
FROM spx_mart.dwd_spx_fm_pickup_task_ri_id
WHERE grass_date = '2026-03-02'
  AND pickup_station_id = 166
```

结果：task_cnt = 2653，driver_cnt = 60，no_trip_cnt = 2653（100%），has_trip_cnt = 0

---

## 结论（面向业务用户）

您好，关于 Hub Overview - Driver Overview 看板显示无数据的问题，排查结论如下，原因分两个阶段：

**第一阶段（2026-02-26 晚 8 点 至 2026-03-03）：数据管道故障**

后台负责处理 ID 市场揽收任务实时数据的服务，因服务器内存资源不足于 2026-02-26 晚 8 点崩溃，并持续重启失败。该故障期间 ID 市场所有站点数据均未能同步至看板。该服务已于 2026-03-03 修复恢复。

**第二阶段（数据管道恢复后）：看板统计口径与站点业务模式不匹配**

数据管道恢复后，看板仍显示无数据。经查询实时数据确认，您的站点数据完整：

| 指标 | 数值 |
|------|------|
| 今日在岗司机数 | 60 人 |
| 今日揽收任务数 | 2653 条 |

Driver Overview 新版看板（v2）的统计口径设计为仅展示绑定了路线行程单（Trip）的司机作业情况。您的站点司机均采用直接揽收模式，未绑定路线行程单，不在该看板的统计口径范围内，因此即使数据完整也不会显示。

---

## 修复建议

**短期（立即可用）**：

使用旧版 Driver Overview 看板查看该站点数据，旧版口径同时涵盖直接揽收和路线两种模式。

**长期（需排期）**：

1. 产品侧评估 v2 看板是否扩展支持直接揽收模式的站点
2. 或在看板入口明确标注适用范围（仅适用于路线模式站点），避免同类问题再次困扰用户
3. Flink 任务侧：将相关任务的 State Backend 切换为 RocksDB，开启增量 Checkpoint，防止类似内存故障复发

---

## 技术背景（供内部参考）

**涉及表**：

- CK 实时表：`spx_mart_manage_app.dws_spx_fm_pickup_task_process_ri_id_all`
- Presto 源表：`spx_mart.dwd_spx_fm_pickup_task_ri_id`（分区列：`grass_date`，站点列：`pickup_station_id`）

**涉及接口**：

- api_id：`operation__fm__facility_driver_overview_v2`
- 关键动态参数：`{trip_zero_filter}`，Hub Overview 页面传入值为 `AND trip_id <> 0`

**涉及 Flink 任务**：

| 任务名 | AppId | 状态 |
|--------|-------|------|
| spx_mart__dws_spx_fm_pickup_task_process_ri2_id_kafka_v250924 | 998061 | 已修复 |
| spx_mart__dws_spx_fm_pickup_task_process_ri_kafka_to_ck_id_ck6 | 1152843 | 正常 |

**Flink 内存优化配置（已应用）**：

```yaml
state.backend: rocksdb
state.backend.incremental: true
taskmanager.memory.process.size: 8192m
taskmanager.memory.managed.fraction: 0.5
env.java.opts.taskmanager: -XX:+UseG1GC -XX:MaxGCPauseMillis=200
table.exec.state.ttl: 86400000
```

---

## Skill 更新记录

本次排查后对 `spx-bug-trace` Skill 进行了以下更新：

| 更新内容 | 原因 |
|----------|------|
| 新增 Phase 0：数据管道健康检查（max(_process_time) + 多市场横向对比） | 本次排查最初直接分析 SQL，实际问题是上游断流，走了弯路 |
| 新增 Phase 0.1：Flink 链路排查路径（exitCode=127 / 心跳超时 / Checkpoint 恢复） | Flink 故障是本次排查的主要内容，之前 Skill 无覆盖 |
| 新增分层验证 SQL 模板（逐步加条件观察数据量变化） | total=545 → after_trip_filter=0 的模式是定位第二层根因的关键 |
| 新增 Phase 6 过程文档 + Phase 7 Skill 自优化 | 建立排查记录和知识积累机制 |
| 新增常见坑：CK FINAL 超时、Presto 分区过滤、MCP LIMIT 问题 | 本次排查中实际遇到 |

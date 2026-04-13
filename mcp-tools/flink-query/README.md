# Flink Query MCP

Flink 全栈查询与诊断 MCP 工具。整合 DataSuite API、Flink REST API（Keyhole 代理）、Grafana 监控指标三大数据源，覆盖任务管理、运行时诊断、实时指标查询。

## 数据源架构

| 数据源 | 认证方式 | 覆盖范围 |
|--------|---------|---------|
| DataSuite Flink API | Chrome Cookie (`datasuite.shopee.io`) | 任务管理、延迟、告警、血缘、资源估算 |
| Flink REST API (Keyhole) | Chrome Cookie (`data-infra.shopee.io`) | Checkpoint 详情、完整异常栈、Job 配置、TM 资源、算子拓扑 |
| Grafana / VictoriaMetrics | Chrome Cookie (`grafana.idata.shopeemobile.com`) | Kafka Lag、CPU/内存/GC、背压、Checkpoint 趋势 |

## 功能概览

### Phase 1: 核心查询（DataSuite API）

| 工具 | 说明 |
|------|------|
| `search_flink_apps` | 搜索流/批任务列表，支持关键词、项目名过滤 |
| `get_flink_app_detail` | 获取应用详情（配置、状态、资源、调度信息）；返回字段 **`url`** 为当前 DataSuite 运营页 `.../flink/operation/application?operationType=...&appId=...&project_code=...` |
| `get_flink_instance` | 获取当前/历史实例信息（集群、资源、监控链接） |
| `get_flink_exceptions` | 查看应用异常列表（异常消息、堆栈、次数） |
| `get_flink_alarm_log` | 查看告警日志（告警内容、接收者、通知状态） |

### Phase 2: 诊断分析（DataSuite API）

| 工具 | 说明 |
|------|------|
| `get_flink_latency` | 获取延迟趋势（Kafka Source、算子、Producer 延迟拆解） |
| `get_flink_latency_analysis` | 延迟根因分析（异常诊断、系统指标、热力图） |
| `get_flink_graph_metrics` | 算子级指标（Graph Monitor），定位瓶颈算子 |
| `get_flink_resource_estimation` | 资源调优建议（并行度估算、CPU/内存使用） |
| `diagnose_flink_app` | 一键诊断：聚合 DataSuite（含 **Graph Monitor 算子级摘要**、延迟/异常/告警/资源等）+ Keyhole(Checkpoint/异常) + Grafana(背压/Lag/CPU)；Keyhole 失败时仍优先看 `graph_monitor` 与 `get_flink_graph_metrics` |

### Phase 3: 扩展（DataSuite API）

| 工具 | 说明 |
|------|------|
| `get_flink_lineage` | 数据血缘关系（Source / Lookup / Sink 表）；若接口 `data` 为数组而非对象，工具会解析表列表，边关系可能为空 |
| `search_flink_table_lineage` | 从表名反查上下游 Flink 任务（哪些任务在读/写这张表） |
| `get_flink_log_url` | 生成 Logify (Kibana) 日志链接，附带常用搜索关键词提示 |
| `query_flink_logs` | 直接查询 Flink 应用日志内容（调用 Logify SSE API），支持 LogiQL 搜索、日志级别过滤 |
| `get_flink_operation_log` | 操作日志（启动、停止、重启记录） |
| `get_flink_sla_dr` | SLA 等级与容灾信息 |

### Phase 4: Flink Runtime（Keyhole / Flink REST API）

| 工具 | 说明 |
|------|------|
| `get_flink_checkpoints` | Checkpoint 详细统计：完成/失败计数、耗时、大小、失败原因、Checkpoint 配置 |
| `get_flink_job_config` | 运行时配置：并行度、重启策略、状态后端、用户自定义参数 |
| `get_flink_runtime_exceptions` | 完整异常堆栈（Java StackTrace）、异常发生的 Task/TM 位置 |
| `get_flink_taskmanagers` | TaskManager 列表：Slot 分配、CPU/内存/磁盘硬件信息 |
| `get_flink_vertices` | 作业算子拓扑：各 Vertex 的并行度、状态、运行时长 |

### Phase 5: 实时指标（Grafana / VictoriaMetrics）

| 工具 | 说明 |
|------|------|
| `get_flink_metrics` | 按类别查询实时指标，返回当前值+趋势摘要（avg/max/min） |
| `get_flink_grafana_custom` | 自定义 PromQL 查询（高级用法） |

`get_flink_metrics` 支持的类别：

| category | 包含指标 |
|----------|---------|
| `overview` | 运行时间、重启次数、Checkpoint 完成/失败数、最近 CP 耗时和大小 |
| `kafka` | Kafka Lag Max/Sum、消费速率、Fetch 限流 |
| `cpu_memory` | TM/JM 的 CPU 使用率、Heap 使用率（平均值和最大值） |
| `checkpoint` | 失败 CP 累计数趋势、CP 耗时趋势、CP 大小趋势 |
| `backpressure` | 最大/平均背压（ms/s）、最大/平均繁忙度 |
| `gc` | Old/Young GC 频率和耗时（自动适配 G1/PS/CMS 收集器） |

## 安装

### 开发者：本机仓库（推荐）

克隆 **spx-helper** 后，对同一个 `python3` 安装依赖：

```bash
cd /path/to/spx-helper/mcp-tools/chrome-auth && python3 -m pip install -e .
cd ../flink-query && python3 -m pip install -e .
```

在 `~/.cursor/mcp.json` 的 `mcpServers` 中增加（把路径换成你的仓库根目录）：

```json
"flink-query": {
  "command": "python3",
  "args": ["/path/to/spx-helper/mcp-tools/flink-query/flink_mcp_server.py"],
  "env": {
    "PYTHONPATH": "/path/to/spx-helper/mcp-tools/chrome-auth"
  }
}
```

保存后在 Cursor **Settings → MCP** 中刷新。若已把 `flink-mcp` 装到 PATH，也可改用 `"command": "flink-mcp", "args": []`。

### 仅使用 release：GitLab uvx（免克隆）

未克隆仓库时可用 uv 从 Git 子目录运行，详见顶层 [MCP_TOOLS.md](../../docs/guides/MCP_TOOLS.md) 中「GitLab / GitHub release」一节。

### 本地命令行调试

```bash
cd mcp-tools/flink-query
python3 -m pip install -e ../chrome-auth -e .
flink-mcp
```

## 认证

复用 chrome-auth 库，自动从 Chrome 浏览器读取以下域的 Cookie。v3.5.9 起，遇到 401/403 时会自动尝试 SSO 静默刷新（通过 `auth_failed=True` 触发），大多数情况下无需手动干预。

Grafana 侧（`/api/frontend/settings` 解析数据源、`/api/ds/query` 拉指标）已与 DataSuite 请求对齐：401/403 时会 `force` 重读 Cookie 并带 `auth_failed=True` 走同一套刷新逻辑；此前仅 DataSuite 走该路径，容易导致「浏览器里 Grafana 正常、MCP 仍 Unauthorized」。

| 数据源 | 域名 | 关键 Cookie |
|--------|------|------------|
| DataSuite | `datasuite.shopee.io` | `CSRF-TOKEN`, `JSESSIONID`, `DATA-SUITE-AUTH-userToken-v4` |
| Keyhole | `data-infra.shopee.io`, `keyhole.data-infra.shopee.io` | 登录后自动获取 |
| Grafana | `grafana.idata.shopeemobile.com` | `grafana_session` |

前置条件：在 Chrome 中分别登录以上三个平台。

## Keyhole / 日志排障（找不到算子、REST 报错、日志为空时）

### Keyhole 不可用时如何看算子

`diagnose_flink_app` 会附带 **`graph_monitor`**（DataSuite Graph Monitor 摘要）。需要完整字段时调用 **`get_flink_graph_metrics(app_id)`**（与运营页图监控同源，不经过 Keyhole REST）。

### `Exceeded 30 redirects` 或 `get_flink_vertices` / `get_flink_job_config` 失败

常见原因：

1. **Cookie / SSO**：`data-infra.shopee.io` 与 `keyhole.data-infra.shopee.io` 未在 Chrome 登录或会话过期，请求被反复 302 到登录页。处理：在浏览器打开 DataSuite 里该任务的 **Keyhole / Web UI 链接** 确认能进；仍失败时让 chrome-auth 刷新（对 MCP 而言重试一次会自动 `force` + `auth_failed` 读 Cookie）。自动续期时 CDP 会打开 **`https://keyhole.data-infra.shopee.io/`**（Keyhole 入口），不会用 `https://data-infra.shopee.io/` 根域做刷新页。
2. **REST 根路径**：`webKeyholeTrackUrl` 往往带一段 **path 前缀**（代理到具体 JobManager），若 MCP 始终打在 `https://keyhole.../` 根上会走错网关。当前实现会从实例 URL 的 `path` 推断前缀并与 `/jobs/...` 拼接；若仍失败，请把 DataSuite 返回的 `webKeyholeTrackUrl`（可对 query 脱敏）发给维护者对照浏览器实际请求 URL。
3. **与浏览器对齐**：在 Keyhole 页 F12 → Network，点开任意 `jobs/...` XHR，把 **Request URL** 与 MCP 报错里的 `URL:` 对比，是否缺 path、缺 query。

### `query_flink_logs` 返回 0 条

可能原因：时间窗内无匹配、Logify 索引延迟、LogiQL 过滤过严、或 Logify 返回 HTML 登录页（认证失败）。处理：先用 `get_flink_log_url` 在浏览器打开同条件；放宽时间窗与关键字；确认 DataSuite 域 Cookie 有效。

### `search_flink_table_lineage` 搜不到 Kafka topic

血缘库表名常与 **topic 字符串** 不一致。处理：先用 `get_flink_lineage`（按 `app_id`）看接口返回的表名/边；或从任务配置 / Flink UI 取 **注册表名** 再反查。

## 使用示例

### 查询流任务

```
搜索 spx_mart 项目下的流任务
```

### 告警排查（综合诊断）

```
帮我看一下 Flink 任务 741498 为什么告警了，诊断一下
```

### Checkpoint 排查

```
看一下 Flink 741498 的 Checkpoint 状态，最近有没有失败的
```

### 资源和背压

```
查看 Flink 741498 的 CPU 和内存使用情况
Flink 741498 有背压吗？
```

### Kafka 消费

```
Flink 741498 的 Kafka Lag 是多少？消费速率怎么样？
```

### 自定义指标

```
帮我查一下 Flink 741498 的 Kafka fetch latency，
PromQL: avg(flink_taskmanager_job_task_operator_KafkaConsumer_fetch_latency_avg{__FILTER__})
```

### 日志查询

```
帮我查一下 Flink 741498 最近的 ERROR 日志
查一下 Flink 741498 最近 1 小时有没有 Exception
搜一下 Flink 741498 日志中的 "Failed to execute sql"
```

### 血缘查询

```
查一下 Flink 任务 741498 的上下游数据血缘
```

## Changelog

### v0.2.2（仓库内持续迭代，与 SPX Helper manifest 版本号独立）

- **diagnose_flink_app**：聚合 Graph Monitor（`graph-config` + `task-metrics`）摘要；启发式提取算子名与背压等相关指标；高背压写入 issues/suggestions
- **链接**：`get_flink_app_detail` / `search_flink_apps` 的 `url` 与前端一致（`operation/application?...`），去掉旧的 `/operation/stream/{id}`

### v0.2.1（仓库内持续迭代，与 SPX Helper manifest 版本号独立）

- **Keyhole**：从 `webKeyholeTrackUrl` 解析 REST 前缀并与 Flink 路径拼接；401/403 与重定向过多时自动刷新 Cookie 重试；失败信息中带最终请求 URL 便于与浏览器对照
- **diagnose_flink_app**：Keyhole 的 Checkpoint / Exceptions 改为 `/jobs/{jid}/...`，与 Phase 4 工具一致

### v0.2.0

- 新增 Phase 4: Flink Runtime 工具（5 个），通过 Keyhole 代理访问 Flink REST API
  - `get_flink_checkpoints`: Checkpoint 详细统计（完成/失败/配置/历史）
  - `get_flink_job_config`: 运行时配置（并行度、重启策略、用户参数）
  - `get_flink_runtime_exceptions`: 完整 Java 异常堆栈
  - `get_flink_taskmanagers`: TaskManager 资源详情
  - `get_flink_vertices`: 算子拓扑与状态
- 新增 Phase 5: Grafana 实时指标工具（2 个）
  - `get_flink_metrics`: 6 类预定义指标（overview/kafka/cpu_memory/checkpoint/backpressure/gc）
  - `get_flink_grafana_custom`: 自定义 PromQL 查询
- 新增基础设施：Keyhole Cookie 管理、Grafana datasource UID 自动解析、实例信息缓存
- GC 指标自动适配 G1/PS/CMS 等不同垃圾收集器

### v0.1.1

- 修复 `_format_ts` 函数兼容字符串类型时间戳，避免 `str / int` 除法报错

### v0.1.0

- 初始版本
- 实现 13 个 MCP 工具，覆盖核心查询、诊断分析、扩展三个阶段

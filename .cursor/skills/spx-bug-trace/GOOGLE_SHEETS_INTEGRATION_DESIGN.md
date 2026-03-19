# spx-bug-trace 与 Google Sheets 集成方案

## 内容分工（设计原则）

| 位置 | 内容 | 用途 |
|------|------|------|
| **Confluence** | 问题详情 + 完整排查过程 | 详细文档，含步骤、证据、技术背景，便于检索与学习 |
| **GSheet app问题整理** | 一行总结 | 快速浏览、筛选、统计 |
| **GSheet 坑点** | 排雷要点 | 独立沉淀坑点，便于日后排雷 |

---

## 一、探查结论

### 1. 目标表格与工作表

| 用途 | spreadsheet_id | 工作表名称 | 说明 |
|------|---------------|------------|------|
| 问题总结写入 | 1WRDykqhPTsG4t1P1M2A5fNVqWxrpj1jurQ8DBXNSkNw | **app问题整理** | 历史问题一行摘要 |
| 坑点沉淀 | 同上 | **坑点** | 排雷要点，便于日后检索 |
| 上下游校验 | 同上 | **任务上下游信息梳理** | 任务血缘与上下游信息 |

两个目标均在同一 spreadsheet 内，需已共享给 `cursor@spx-helper.iam.gserviceaccount.com`。

---

### 2. app问题整理 — 表结构与写入方式

**表头（第 1 行）**：

| 列 | 字段名 | 含义 |
|----|--------|------|
| A | 时间 | 问题日期，格式 YYYY-MM-DD |
| B | 线上问题 | 现象描述，可含 SeaTalk/Jira 链接 |
| C | 根本原因 | 根因说明（业务语言） |
| D | 耗时 | 排查耗时，如 1 hour、2 hour、1 day |
| E | 问题原因 | 分类：业务理解、clickhouse、hbase、流量增加、配置问题等 |
| F | 是否有效问题 | 是/否 |
| G | 是否有监控告警 | 有/无/空 |
| H | 类别 | 固定填 SPX APP |

**现有数据**：第 2～27 行有数据，第 28 行为空行，下一可用行为 **29**。

**写入方式**：使用 `update_cells` 追加一行。需先 `get_sheet_data` 取当前数据量以确定下一行号，再 `update_cells` 写入 `A{next_row}:H{next_row}`。

**Phase 5 结论与列映射**：

| Phase 5 输出 | 映射到列 |
|-------------|----------|
| 排查日期 | → 时间 (A) |
| 现象确认 + 问题描述 | → 线上问题 (B) |
| 根因说明 | → 根本原因 (C) |
| 估算排查耗时 | → 耗时 (D) |
| 根因分类（基础设施/业务逻辑/配置/...） | → 问题原因 (E) |
| 是否为真实 Bug | → 是否有效问题 (F) |
| 是否由监控发现 | → 是否有监控告警 (G) |
| 固定值 SPX APP | → 类别 (H) |

---

### 3. 任务上下游信息梳理 — 表结构与校验逻辑

**表头（第 1 行）**：

| 列 | 字段名 | 用途 |
|----|--------|------|
| B | app 任务 | Flink 任务名，如 AdsSpxMgmtFmHubPerformance10mRi |
| G | 血缘查询--来源kafka | 上游 Kafka topic |
| H | 血缘查询--来源hbase | 上游 HBase 表 |
| I | 血缘查询--来源hive | 上游 Hive 表 |
| J | 血缘查询--来源clickhouse | 上游 CK 表 |
| K | 血缘查询--sink kafka | 下游 Kafka |
| L | 血缘查询--sink clickhouse | 下游 CK 表 |
| M | 血缘查询--sink hbase | 下游 HBase 表 |
| N | 依赖的接口(仅活跃) | 该任务支撑的 api_id |

**校验思路**：

1. 从「app 任务」或「依赖的接口」选出要校验的任务/接口；
2. 用 `get_api_lineage` 或 `api_trace` 获取真实血缘（源表、sink 表）；
3. 与表中 血缘查询 列（G～M）对比，找出：
   - 缺失的上下游；
   - 多余的、已不存在的上下游；
   - 命名或格式不一致。

**校验触发**：用户明确要求「校验上下游」时执行；或排查中涉及的任务/接口与表内记录不一致时，主动提示可校验。

---

## 二、Skill 更新方案

### 1. 工具清单补充

在「工具清单」中增加：

| 工具 | 用途 |
|------|------|
| `get_sheet_data` / `update_cells` (google-sheets MCP) | 读写 app问题整理、任务上下游信息梳理 |

依赖中加入 `user-google-sheets`。

---

### 2. Phase 6 扩展：Google Sheets 问题沉淀

在 Phase 6 中新增 **6.3 Google Sheets 问题沉淀**：

**写入目标**：`app问题整理`（spreadsheet_id: 1WRDykqhPTsG4t1P1M2A5fNVqWxrpj1jurQ8DBXNSkNw）

**流程**：

1. `get_sheet_data`(spreadsheet_id, sheet="app问题整理", range="A2:H") 获取当前行数；
2. 计算 next_row = 已有数据行数 + 1；
3. 按 Phase 5 结论构造一行 8 列数据；
4. `update_cells`(spreadsheet_id, sheet="app问题整理", range="A{next_row}:H{next_row}", data=[[...]]) 写入。

**字段填写规范**：

- 时间：当天日期 YYYY-MM-DD；
- 线上问题：简要现象 + 可选链接（SeaTalk/Jira）；
- 根本原因：业务化表述，与 Phase 5 一致；
- 耗时：如 1hour、2hour、1day；
- 问题原因：业务理解 / clickhouse / hbase / 流量增加 / 配置问题 / 无效问题 等；
- 是否有效问题：是/否；
- 是否有监控告警：有/无；
- 类别：SPX APP。

**可选**：写前询问用户「是否写入 app问题整理」。

---

### 3. Phase 2/4 扩展：上下游校验（可选）

**触发**：用户说「校验上下游」「核对血缘」「检查任务上下游信息」等。

**流程**：

1. `get_sheet_data` 读取「任务上下游信息梳理」全表或指定任务行；
2. 从「依赖的接口(仅活跃)」取 api_id，或从「app 任务」取任务名；
3. 对每个 api_id 调用 `get_api_lineage`，得到血缘；
4. 与表中 G～M 列比对，输出差异：
   - 缺失：血缘有但表中无；
   - 多余：表中有但血缘无；
   - 需人工确认的差异。

**注意**：血缘表与 DataSuite Data Link 可能有延迟，结果作参考，不直接改表。

---

### 4. Phase 6 扩展：坑点沉淀（独立工作表）

**写入目标**：新建工作表 **坑点**（若不存在则 `create_sheet` 创建）

**表结构（第 1 行表头）**：

| 列 | 字段名 | 说明 |
|----|--------|------|
| A | 坑点描述 | 如「CK 大表加 FINAL 易超时返回空」 |
| B | 现象 | 典型表现 |
| C | 解决/规避方式 | 如何规避或修复 |
| D | 关联场景 | 如「Phase 3 CK 验证」「Phase 0 数据管道检查」 |
| E | 来源问题 | 可关联 app问题整理 对应行或 Confluence 文档 |
| F | 日期 | 记录日期 YYYY-MM-DD |

**触发时机**：排查过程中发现 Skill 中未覆盖的坑，或「常见坑」表中可补充的新坑点。

**流程**：

1. 若工作表「坑点」不存在，`create_sheet` 创建并写入表头；
2. `get_sheet_data` 获取当前行数；
3. `update_cells` 追加一行坑点。

**与 Confluence / app问题整理 的关系**：坑点可单独沉淀、单独检索，不依赖具体问题行，方便按「排雷」场景浏览。

---

## 三、实现清单

| 项 | 内容 |
|----|------|
| 1 | Skill 工具清单增加 google-sheets，依赖增加 user-google-sheets |
| 2 | Phase 6 新增 6.3「Google Sheets 问题沉淀」（app问题整理 + 坑点） |
| 3 | 坑点工作表：若不存在则创建，表头与字段规范见上 |
| 4 | Phase 2/4 或新 Phase 增加「上下游校验」流程（可选触发） |
| 5 | 在 Skill 更新记录中记录本次变更 |

---

## 四、注意事项

1. **权限**：该 spreadsheet 需已共享给 `cursor@spx-helper.iam.gserviceaccount.com`；
2. **行号**：每次写前重新读取以确定 next_row，避免并发或手动编辑导致错行；
3. **内容**：避免写 token、密码等敏感信息；
4. **上下游**：校验结果仅供人工复核，不自动修改「任务上下游信息梳理」。

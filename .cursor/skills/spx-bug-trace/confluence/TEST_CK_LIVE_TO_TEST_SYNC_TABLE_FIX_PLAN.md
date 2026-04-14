# Test ClickHouse：Live（manage_app）→ Test（mart_pub）同步失败逐表修复方案

**Confluence 已发布页**：https://confluence.shopee.io/pages/viewpage.action?pageId=3160657626  

> 本文档供 **QA / 数仓 / 同步工具维护方** 在 **test 环境** 落地修复与验收使用。  
> 证据快照：使用 **ck-query MCP** 对 `system.columns` 做 `count(*)` 等价统计（按 `database` + `table` 过滤），**live** 侧分别查询 **`cluster=ck2`（对应 online2）** 与 **`cluster=ck6`（对应 online6）**，**test** 侧为 **`env=test`**、库 **`spx_mart_pub`**。  
> 快照日期：**2026-04-14**。若后续表结构变更，以重新查询为准。

---

## 1. 约定与先决条件

### 1.1 库与集群语义

| 环境 | 库名 | MCP 说明 |
|------|------|----------|
| Live 源 | `spx_mart_manage_app` | `env=live`，`cluster` 取 `ck2` 或 `ck6` |
| Test 目标 | `spx_mart_pub` | `env=test` |

### 1.2 修复前必须统一的前提

1. **Gold 源**：同一张逻辑表在 **ck2 与 ck6 列数可能不一致**。修复 test 或同步脚本前，必须与 **表 Owner / 数仓** 确认「以哪条集群为写入真相」，否则会出现「修 test 对齐了 ck2 却与 ck6 冲突」之类问题。  
2. **变更窗口**：test 上 `DROP TABLE` / 大表 `ALTER` 前确认无并行任务；生产无关，但仍建议低峰操作。  
3. **验收 SQL**（每张表修复后执行）：

```sql
SELECT count() AS col_cnt
FROM system.columns
WHERE database = 'spx_mart_pub' AND table = '<表名>';
```

---

## 2. 分类总览

| 分类 | 典型日志 | test 侧主要动作 |
|------|-----------|------------------|
| A | 两 online 均未找到源表 | **一般不改 test 表**；下掉同步或等 live 有表 |
| B | `UNKNOWN_TABLE`，CH 提示 `Maybe you meant` | **改名映射** 或 **按 live DDL 补建** 目标表 |
| C | 列数不匹配 / 源列数未知 | **对齐 DDL**（`ALTER` 或删表重建）并修正 **同步源集群** |
| D | 源在单集群存在、另一集群无表 | 优先修 **同步 fallback**；必要时 **live 补表** |

---

## 3. A 类：Live 上 ck2 与 ck6 均无表（列数均为 0），Test 也无

以下表在 **`spx_mart_manage_app`** 上 **ck2、ck6** 的列统计均为 **0**，且 **test `spx_mart_pub`** 也为 **0**（表不存在）。

| 表名 | 根因归纳 | test 修复方案 | 同步工具 / 配置 |
|------|-----------|---------------|----------------|
| `ads_spx_fm_sp_operation_ri_id_all` | 三条线均无该物理表 | **勿**在 test 盲建空壳表。从同步白名单**删除**或标记「待 live 发布」。若 QA 必须可查询：由数仓在 **live 先建表并写入**后再同步。 | 更新映射或暂停任务 |
| `dim_spx_fm_sp_locker_box_ri_id_all` | 同上 | 同上 | 同上 |
| `dim_spx_fm_sp_locker_ri_id_all` | 同上 | 同上 | 同上 |
| `dwd_spx_ndd_order_10m_id_all` | 同上 | 同上 | 同上 |

**验收**：上述表在 test 仍可为 0；验收项是 **同步任务不再报错重试**（配置层关闭）。

---

## 4. B 类：`UNKNOWN_TABLE`（Test 缺表，CH 建议替代名）

### 4.1 `_id_all` vs `_sg_all`（test 仅有 `sg_all`）

| 同步目标（test 缺） | 建议替代（test 已存在） | Live ck2 列数（参考） | Live ck6 列数（参考） | test 修复方案 |
|---------------------|-------------------------|----------------------|----------------------|---------------|
| `ads_spx_lm_market_same_day_delivery_performance_id_all` | `ads_spx_lm_market_same_day_delivery_performance_sg_all` | 34 | 0 | **优先**：同步配置将 **目标表** 改为 `..._sg_all`，源仍读 live 上存在的 `..._id_all` 或 `..._sg_all`（需与 Owner 确认市场口径）。**备选**：在 test **新建** `..._id_all`，`SHOW CREATE TABLE` 以 **live ck2** 为准拉 DDL 后全量同步（ck6 无此表，勿以 ck6 为 DDL 源）。 |
| `dws_spx_lm_same_day_delivery_order_tab_id_all` | `dws_spx_lm_same_day_delivery_order_tab_sg_all` | 18 | 0 | 同上：优先 **映射到 `..._sg_all`**；备选在 test **建 `..._id_all`**（DDL 来自 live ck2）。 |

**验收**：对选用目标表执行 `SELECT count() FROM spx_mart_pub.<目标表> LIMIT 1` 无 `UNKNOWN_TABLE`；列数与约定 gold 一致。

### 4.2 `_1d_all` vs `_1d`（test 仅有 `_1d`）

| 同步目标（test 缺） | 建议替代（test 已存在） | Live ck2 | Live ck6 | test 修复方案 |
|---------------------|-------------------------|----------|----------|---------------|
| `ads_spx_mgmt_fm_hub_driver_productivity_1d_all` | `ads_spx_mgmt_fm_hub_driver_productivity_1d` | 0 | 7 | **优先**：同步 **目标** 改为 `..._1d`，**源** 指定从 **ck6** 读 `..._1d_all`（7 列与 test 的 `..._1d` 列数一致，但仍需核对列名顺序与类型）。**备选**：在 test 建 `..._1d_all`（DDL 以 ck6 为准）。 |
| `ads_spx_mgmt_fm_market_driver_productivity_1d_all` | `ads_spx_mgmt_fm_market_driver_productivity_1d` | 0 | 6 | 同上（6 列）。 |

**验收**：`INSERT`/同步任务写入的表名与 test 物理表一致；`DESCRIBE` 与源列一一对应或可映射。

---

## 5. C 类：列数不一致（含「源列数未知」场景）

下列数字为 **MCP 快照**：`ck2 列数 / ck6 列数 / test 列数`。

### 5.1 `ads_spx_fm_market_backlog_performance_detail_tab_id_all`

| ck2 | ck6 | test |
|-----|-----|------|
| 21 | 0 | 28 |

**根因**：ck6 **无表**；test **比 live ck2 多 7 列**（DDL 分叉）。

**test 修复方案**：

1. 与 Owner 确认 gold：若以 **live ck2（21）** 为准：在 test **删除多余 7 列**或 **删表后按 ck2 DDL 重建**，再全量同步。  
2. 若以 **test（28）** 为准：应先在 **live** 升级到 28 列再同步，否则 live→test 单向无法自洽。  
3. 同步脚本：对「源列数未知」应 **先 fallback 到 ck2** 再取元数据，避免 ck6 为 0 时整条失败。

**验收**：test 列数等于选定 gold；同步不再报列数不匹配。

### 5.2 `ads_spx_fm_market_backlog_performance_summary_tab_id_all`

| ck2 | ck6 | test |
|-----|-----|------|
| 29 | 0 | 43 |

**根因**：同 5.1，**test 多 14 列**。

**test 修复方案**：与 5.1 相同思路；**更推荐整表对齐后重建**（列差较大）。

### 5.3 `ads_spx_lm_hub_operation_process_10m_id_all`

| ck2 | ck6 | test |
|-----|-----|------|
| 51 | 39 | 57 |

**根因**：**ck2 与 ck6 同表名不同结构**；test 又与两者皆不同。

**test 修复方案**：

1. **暂停自动同步**，由 Owner 输出 **唯一标准 DDL**（含引擎、分区、排序、`_version` 等）。  
2. test：**DROP 后按标准重建** 或 **分步 ALTER** 至标准。  
3. 在标准未定前，**禁止**继续自动全表同步。

### 5.4 `ads_spx_mgmt_fm_pending_pickup_detail_10m_br_all`

| ck2 | ck6 | test |
|-----|-----|------|
| 47 | 47 | 48 |

**根因**：live 两线一致 **47**；test **多 1 列**。

**test 修复方案**：

1. 执行 **live ck2 与 test** 的 `system.columns` **按 `name` 做差集**，定位多出的列。  
2. 若确认为误加列：在 test **`DROP COLUMN`** 或重建为 47 列。  
3. 若确认为业务新增：应在 **live 先加列** 再同步，避免 test 长期领先 live。

### 5.5 `ads_spx_lm_driver_performance_10m_id_all`

| ck2 | ck6 | test |
|-----|-----|------|
| 111 | 74 | 74 |

**根因**：**ck2 与 ck6 严重不一致**；**test 与 ck6 一致（74）**。

**test 修复方案**：

1. **test 表通常无需修改**（已与 74 列对齐）。  
2. 必须修改 **同步工具**：该表 **源集群固定为 ck6**（或能稳定得到 74 列的那条线），**禁止**从 ck2 拉 111 列写入 test。  
3. 若业务要求 ck2 的 111 列为准：则 test 需 **按 111 列重建**（与当前 test 冲突，需业务决策）。

### 5.6 `ads_spx_soc_hub_wsg_ops_10m_id_all`

| ck2 | ck6 | test |
|-----|-----|------|
| 69 | 0 | 69 |

**根因**：**ck6 无表**；ck2 与 test **列数一致**。

**test 修复方案**：

1. **test 一般无需改表**。  
2. 修同步逻辑：**ck6 失败后必须 fallback ck2**；该表勿强依赖 online6 元数据探测。  
3. 若要求 ck6 可读：由 **live 运维在 ck6 补建表**（超出 test 职责）。

---

## 6. 同步工具侧建议（减少「每次来问」）

1. **错误码分支**：`Code 60`、`列数不匹配`、`源表未找到` 分开展示与计数。  
2. **表级路由配置**：对已知分叉表（如 `ads_spx_lm_driver_performance_10m_id_all`）**写死源 cluster**。  
3. **维护 `live_table → test_table` 映射表**（文件或 DB）：覆盖 `_id_all`→`_sg_all`、`_1d_all`→`_1d` 等。  
4. **元数据探测**：仅在 **两集群都返回 0** 时标记「源不存在」；若 **一侧 0 一侧非 0**，应记录 **「部分集群缺失」** 并继续用非 0 侧作为候选源。

---

## 7. 附录：快照数据一览表

| 表名 | ck2 | ck6 | test | 建议归类 |
|------|-----|-----|------|----------|
| `ads_spx_fm_sp_operation_ri_id_all` | 0 | 0 | 0 | A |
| `dim_spx_fm_sp_locker_box_ri_id_all` | 0 | 0 | 0 | A |
| `dim_spx_fm_sp_locker_ri_id_all` | 0 | 0 | 0 | A |
| `dwd_spx_ndd_order_10m_id_all` | 0 | 0 | 0 | A |
| `ads_spx_fm_market_backlog_performance_detail_tab_id_all` | 21 | 0 | 28 | C |
| `ads_spx_fm_market_backlog_performance_summary_tab_id_all` | 29 | 0 | 43 | C |
| `ads_spx_lm_hub_operation_process_10m_id_all` | 51 | 39 | 57 | C |
| `ads_spx_mgmt_fm_pending_pickup_detail_10m_br_all` | 47 | 47 | 48 | C |
| `ads_spx_lm_driver_performance_10m_id_all` | 111 | 74 | 74 | C（改源，少改 test） |
| `ads_spx_soc_hub_wsg_ops_10m_id_all` | 69 | 0 | 69 | D / 工具 |
| `ads_spx_lm_market_same_day_delivery_performance_id_all` | 34 | 0 | 0（用 sg_all） | B |
| `ads_spx_lm_market_same_day_delivery_performance_sg_all` | 34 | 0 | 34 | 已存在 |
| `dws_spx_lm_same_day_delivery_order_tab_id_all` | 18 | 0 | 0（用 sg_all） | B |
| `dws_spx_lm_same_day_delivery_order_tab_sg_all` | 18 | 0 | 18 | 已存在 |
| `ads_spx_mgmt_fm_hub_driver_productivity_1d_all` | 0 | 7 | 0（用 1d） | B |
| `ads_spx_mgmt_fm_hub_driver_productivity_1d` | 0 | 0 | 7 | 已存在 |
| `ads_spx_mgmt_fm_market_driver_productivity_1d_all` | 0 | 6 | 0（用 1d） | B |
| `ads_spx_mgmt_fm_market_driver_productivity_1d` | 0 | 0 | 6 | 已存在 |

---

## 8. Confluence 与本地同步

1. **线上页面**：https://confluence.shopee.io/pages/viewpage.action?pageId=3160657626（父目录 pageId=3105880558）。  
2. **更新正文**：修改本地本文后，使用 `confluence_update_page(page_id=3160657626, title=..., content=..., content_format="markdown")` 与 Confluence 对齐。  
3. **GSheet**：可在坑点表追加一行摘要并链接上述 URL（按 Skill Phase 6.3 规范）。

---

**文档维护**：表结构或同步策略变更时，更新 **第 7 节附录** 并重跑 MCP 校验列数。

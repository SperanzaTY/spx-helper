# SPX Bug Trace 工具参数参考

## api_trace

```python
api_trace(
    api_id: str,              # 必填：API 标识符
    issue_description: str,   # 问题描述，如"站点数量显示不正确"
    custom_where: str,        # WHERE 条件，如 "station_id=166 AND grass_region='sg'"
    api_response_sample: str, # 粘贴 API 返回的 JSON（用于对比）
    query_source_data: bool,  # 是否直查源表，默认 True
    max_rows: int             # 返回行数，默认 20
)
```

## get_api_lineage

```python
get_api_lineage(api_id: str)  # 只返回血缘，不查源表，速度更快
```

## query_ck

```python
query_ck(
    sql: str,
    env: str,           # "live" 或 "test"
    cluster: str,       # env=live 时必填
    database: str,      # 可选，覆盖默认库
    max_rows: int       # 默认 200
)
```

若 Agent 调 `query_ck` 时参数被桥接成空对象 `{}`，改用 **`query_ck_bundle`**，只传一个参数 `bundle`（整段 JSON 字符串），例如：

```python
query_ck_bundle(
    bundle='{"sql":"SELECT 1","env":"live","cluster":"ck2"}'
)
```

**连接方式**：DBeaver 直连（HTTP + Basic Auth），无 internal_search API

**env=live（线上）** cluster 可选：
- `ck2` / `online_2`：ck2 写集群
- `ck6` / `online_6`：ck6 写集群
- `online_4`：test 读集群
- `online_5`：ck2 读集群（需内网）
- `online_7`：ck6 读集群（需内网）

**env=test**：测试集群 `spx_mart_pub`，直连

**ds_id 映射**：107/110/112/119→ck2；114/115/122→ck6（详见 table-mapping.md）

**常用操作**：SELECT 查询、INSERT 写入（test 环境）

## query_presto

```python
query_presto(
    sql: str,
    queue: str,    # "szsc-adhoc"（默认）或 "szsc-scheduled"
    region: str,   # "SG"（默认）或 "US"
    max_rows: int  # 默认 100，最大 2000
)
```

**常用 Presto 库：**
- `sls_mart`：API 元数据血缘表所在库
- `spx_mart`：SPX 业务宽表、汇总表
- `spx_smartsort_ddc`：路网规划相关表（需要对应权限）
- `data_metamart`：元数据 ODS；**Flink 平台 connector 血缘**见下表

---

## Flink 平台 connector 元数据（Hive）

**表名**：`data_metamart.ods_flink_platform_connector_metadata_df`

**用途**：从 **Flink 平台** 侧查询 connector 相关元数据，用于与代码推出的任务名对齐、确认上下游（Kafka/CK/Hive 等以实际列为准）。**Agent 检索平台血缘时优先查本表**，Google Sheet「任务上下游信息梳理」为人工维护补充。

**注意**：
- **必须**带分区条件（常见为 `grass_date`，以 `DESCRIBE` / DDL 为准）。
- 列名可能随数仓变更，**先 `DESCRIBE` 或 `SELECT * ... LIMIT 5`** 再写业务过滤。

```sql
-- 1) 确认分区列与字段
DESCRIBE data_metamart.ods_flink_platform_connector_metadata_df;

-- 2) 样例：限定分区后探查（日期改为最近有数据的分区）
SELECT *
FROM data_metamart.ods_flink_platform_connector_metadata_df
WHERE grass_date = DATE '2026-03-04'
LIMIT 20;

-- 3) 在确认列名后，按任务名/表名/connector 等追加过滤
-- AND lower(cast(<column> AS varchar)) LIKE '%<keyword>%'
```

---

## 血缘表查询参考 SQL

```sql
-- 查某个 api_id 的最新版本血缘
SELECT api_id, api_version, biz_sql, ds_id
FROM (
    SELECT *,
           row_number() OVER (PARTITION BY api_id ORDER BY api_version DESC) AS rn
    FROM sls_mart.shopee_ssc_data_api_mart_db__api_mart_api_tab__reg_continuous_s0_live
    WHERE publish_env = 'live'
      AND api_id LIKE '%<关键词>%'
)
WHERE rn = 1
ORDER BY api_id
LIMIT 10;

-- 查用到某张表的所有 API
SELECT api_id, ds_id
FROM (
    SELECT *,
           row_number() OVER (PARTITION BY api_id ORDER BY api_version DESC) AS rn
    FROM sls_mart.shopee_ssc_data_api_mart_db__api_mart_api_tab__reg_continuous_s0_live
    WHERE publish_env = 'live'
      AND biz_sql LIKE '%<表名关键词>%'
)
WHERE rn = 1
LIMIT 20;
```

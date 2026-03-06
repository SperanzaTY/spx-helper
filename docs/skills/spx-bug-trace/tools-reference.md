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
    cluster: str,       # env=live 时必填："ck2" 或 "ck6"
    database: str,      # env=test 时有效，默认 "spx_mart_pub"
    max_rows: int       # 默认 200
)
```

**env=live（线上）**：
- 集群由接口 **ds_id** 决定，`get_api_lineage` 返回的 ds_id 即该接口连接的 CK
- 接口查到的是读集群，query_ck 直接查写集群（internal_search_ck2/ck6）
- ds_id 映射：107/110/112/119→ck2；114/115/122→ck6（详见 table-mapping.md）

**env=test**：测试 CK，直连配置方式
- `spx_mart_pub` 为 TEST 集群，用 `query_ck(env=test)` 直连，非线上数据

**集群对照**：ck2 = online2/online5 互为读写；ck6 = online6/online7 互为读写

**env=test 常用操作：**
- SELECT 查询验证
- INSERT 写入测试数据

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

# SPX 常用表库对照

## ClickHouse 库（用 query_ck）

| 库名 | 集群 | 说明 |
|------|------|------|
| `spx_mart_manage_app` | **ck6**（online6/online7 互为读写） | 管理系统维表，含 `dim_spx_station_tab_*_all`（各市场站点信息） |
| `spx_mart_pub` | **ck6**（online6/online7 互为读写） | 业务数据公开表 |

> 集群对照：ck2 = online2/online5 互为读写；ck6 = online6/online7 互为读写

**{mgmt_db2} 占位符** = `spx_mart_manage_app`（在 biz_sql 中常见）

## Presto 库（用 query_presto）

| 库名 | 说明 |
|------|------|
| `sls_mart` | 包含 API 血缘元数据表 |
| `spx_mart` | SPX 业务宽表，如 `dwd_spx_fm_pickup_task_ri_id_all` |
| `spx_smartsort_ddc` | 路网规划表（需权限） |

## 典型表名规律

| 规律 | 示例 |
|------|------|
| `dim_*` | 维表，相对静态 |
| `dwd_*` | 明细宽表，行级数据 |
| `dws_*` | 汇总宽表 |
| `*_ri_*` | 实时增量（Real-time Incremental） |
| `*_{region}_all` | 含市场标识的分区表，`{region}` = sg/id/my/ph/th/vn/tw/br |
| `*_10m_*` | 10分钟级实时表 |

## {region} 市场对照

| region | 市场 |
|--------|------|
| sg | 新加坡 |
| id | 印尼 |
| my | 马来西亚 |
| ph | 菲律宾 |
| th | 泰国 |
| vn | 越南 |
| tw | 台湾 |
| br | 巴西 |

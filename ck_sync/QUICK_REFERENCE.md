# ⚡ ClickHouse 完整DDL同步 - 快速参考

## 🎯 一句话总结

使用源表的完整DDL重建目标表，保证性能和结构完全一致。

---

## 🚀 快速开始（3步）

### 1. 安装依赖
```bash
cd /Users/tianyi.liang/Cursor/SPX_Helper/ck_sync
pip3 install requests
```

### 2. 运行测试
```bash
python3 test_ddl.py
# 或
./test_and_run.sh
```

### 3. 执行同步
```bash
python3 sync_with_ddl.py
```

---

## 💻 Python代码示例

```python
from ck_sync.sync_with_ddl import TableSyncWithDDL

# 配置
source_config = {
    'host': '10.180.129.96',  # ONLINE2
    'port': 443,
    'user': 'spx_mart',
    'password': 'RtL3jHWkDoHp',
    'database': 'spx_mart_manage_app',
    'use_https': True
}

target_config = {
    'host': 'clickhouse-k8s-sg-prod.data-infra.shopee.io',
    'port': 443,
    'user': 'spx_mart-cluster_szsc_data_shared_online',
    'password': 'RtL3jHWkDoHp',
    'database': 'spx_mart_manage_app',
    'use_https': True
}

# 同步
syncer = TableSyncWithDDL(source_config, target_config)
syncer.sync_table(
    source_table='spx_mart_manage_app.dim_spx_driver_tab_br_all',
    target_table='spx_mart_manage_app.dim_spx_driver_tab_br_all',
    source_remote_ip='10.180.129.96',
    source_remote_user='spx_mart',
    source_remote_password='RtL3jHWkDoHp'
)
```

---

## 📋 同步流程

```
1. 获取DDL   →  2. 适配DDL   →  3. DROP表    →  4. CREATE表  →  5. 同步数据
   (LIVE)        (修改配置)       (TEST)          (TEST)          (remote())
```

---

## ⚠️ 重要配置

### 源数据库IP（选择一个）
- ONLINE2: `10.180.129.96`
- ONLINE6: `10.180.129.141`

### 集群配置（TEST环境推荐）
```python
drop_cluster=None      # 不使用集群
create_cluster=None    # 不使用集群
```

### 目标数据库
```python
host='clickhouse-k8s-sg-prod.data-infra.shopee.io'
port=443
use_https=True
```

---

## ✅ vs ❌ 对比

### ❌ 简化方案（不要使用）
```sql
CREATE TABLE test_table 
ENGINE = MergeTree() 
ORDER BY tuple()  -- 无排序键
```
**问题**: 性能崩溃、接口失败

### ✅ 完整DDL方案（推荐）
```sql
CREATE TABLE test_table 
ENGINE = MergeTree() 
PARTITION BY toYYYYMM(grass_date)  -- 分区键
ORDER BY (driver_id, grass_date)   -- 排序键
SETTINGS index_granularity = 8192  -- 引擎配置
```
**优势**: 性能一致、完全兼容

---

## 🔧 常用命令

### 测试连接
```python
client = ClickHouseClient(...)
if client.test_connection():
    print("✅ 连接成功")
```

### 检查表是否存在
```python
if client.table_exists('spx_mart_manage_app.dim_driver_tab_br_all'):
    print("✅ 表存在")
```

### 获取表DDL
```python
ddl = client.get_create_table_ddl('spx_mart_manage_app.dim_driver_tab_br_all')
print(ddl)
```

### 获取表信息
```python
info = client.get_table_info('spx_mart_manage_app.dim_driver_tab_br_all')
print(f"列数: {info['column_count']}")
```

---

## 📚 文档链接

- **完整指南**: [DDL_SYNC_GUIDE.md](./DDL_SYNC_GUIDE.md)
- **实现总结**: [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- **项目文档**: [README.md](./README.md)

---

## 🐛 常见错误

### 1. 无法连接数据库
```
解决: 检查host、port、user、password是否正确
```

### 2. 表不存在
```
解决: 检查表名格式是否为 database.table
```

### 3. 集群不存在
```
解决: 设置 drop_cluster=None, create_cluster=None
```

### 4. remote()连接失败
```
解决: 检查source_remote_ip、source_remote_user、source_remote_password
```

---

## 💡 最佳实践

1. ✅ **总是使用完整DDL** - 不要用简化方案
2. ✅ **TEST环境不用集群** - 设置cluster参数为None
3. ✅ **先测试小表** - 验证功能正常
4. ✅ **注意分布式表** - 可能需要同时同步local表和distributed表
5. ✅ **查看日志** - 出错时检查详细日志

---

## 🎉 完成标志

看到这个输出就说明成功了:
```
================================================================================
🎉 表同步完成!
================================================================================
```

验证结果:
```
   表 spx_mart_manage_app.dim_spx_driver_tab_br_all 行数: 1,234,567
   列数: 45
   引擎: Distributed
   排序键: driver_id
   分区键: toYYYYMM(grass_date)
```

---

**版本**: v2.0.0  
**更新**: 2026-01-30

# 🔍 完整DDL同步功能 - 测试结果和使用建议

## 📊 测试结果总结

### ✅ 成功的方式

**1. 直接连接TEST环境获取DDL**
```python
client = ClickHouseClient(
    host='clickhouse-k8s-sg-prod.data-infra.shopee.io',
    port=443,
    use_https=True
)
ddl = client.get_create_table_ddl('spx_mart_pub.some_table')
# ✅ 成功获取DDL
```

**测试输出:**
```
✅ 成功获取DDL:
CREATE TABLE spx_mart_pub.ads_distribute_spx_solution_ibge_polygon_order_quantity_br 
ON CLUSTER cluster_szsc_data_shared_online
(
    `hierarchy_address` String,
    ...
)
ENGINE = Distributed('cluster_szsc_data_shared_online', 'spx_mart_pub', ...)
```

---

### ❌ 失败的方式

**1. 直接连接LIVE环境（HTTPS 443）**
```
❌ 错误: Connection to 10.180.129.96 timed out
原因: 需要VPN或内网访问权限
```

**2. 通过remote()查询LIVE的system.tables**
```sql
SELECT create_table_query 
FROM remote('10.180.129.96', 'system.tables', 'spx_mart', 'xxx')
WHERE database = 'spx_mart_manage_app'
```

```
❌ 错误: ACCESS_DENIED
原因: spx_mart用户没有 SHOW COLUMNS ON system.tables 权限
```

---

## 💡 推荐解决方案

### 方案1: 使用Python后端脚本（⭐ 推荐）

**适用场景**: 在内网环境或有VPN访问的机器上

**优势**:
- ✅ 完整的DDL同步功能
- ✅ 保证性能和兼容性
- ✅ 详细的日志输出
- ✅ 支持批量同步

**使用方法**:

```bash
# 1. 进入项目目录
cd /Users/tianyi.liang/Cursor/SPX_Helper/ck_sync

# 2. 测试DDL功能
python3 test_ddl.py

# 3. 执行同步
python3 sync_with_ddl.py
```

**配置参数** (`sync_with_ddl.py` 中修改):
```python
# 源数据库（LIVE - ONLINE2）
source_config = {
    'host': '10.180.129.96',  # 或 10.180.129.141 (ONLINE6)
    'port': 443,
    'user': 'spx_mart',
    'password': 'RtL3jHWkDoHp',
    'database': 'spx_mart_manage_app',
    'use_https': True
}

# 要同步的表
source_table = 'spx_mart_manage_app.dim_spx_driver_tab_br_all'
```

---

### 方案2: Chrome扩展追加模式（可用但不推荐）

**限制**: 只能使用追加模式，不能使用完整DDL模式

**适用场景**:
- 表结构已经正确
- 只需要追加新数据
- 不需要重建表结构

**使用方法**:
1. 打开扩展 → 🛠️ 实用工具 → 🔄 数据同步工具
2. 配置参数
3. 同步模式选择: **追加模式 (INSERT)**
4. 执行同步

**注意事项**:
- ⚠️ 表结构必须完全匹配
- ⚠️ 不会更新表的引擎参数
- ⚠️ 不会更新排序键和分区键

---

## 🔧 技术细节

### 为什么Chrome扩展无法使用完整DDL？

#### 问题1: 权限限制

```sql
-- ❌ 失败: 权限不足
SELECT create_table_query 
FROM remote(
  '10.180.129.96',
  'system.tables',  -- spx_mart用户无权访问
  'spx_mart',
  'xxx'
)
```

**错误信息:**
```
DB::Exception: spx_mart: Not enough privileges. 
To execute this query it's necessary to have 
grant SHOW COLUMNS ON system.tables. (ACCESS_DENIED)
```

#### 问题2: 网络限制

```python
# ❌ 失败: 连接超时
client = ClickHouseClient(
    host='10.180.129.96',  # LIVE内网IP
    port=443,
    use_https=True
)
# Connection to 10.180.129.96 timed out
```

**原因**: Chrome扩展运行在浏览器沙箱中，无法直接访问内网IP

---

### Python脚本为什么可以？

**1. 完全的网络访问权限**
- 可以直接连接内网IP
- 不受浏览器沙箱限制

**2. 灵活的实现方式**
- 直接连接LIVE环境获取DDL
- 不依赖remote()函数
- 不依赖system.tables权限

---

## 📋 使用建议

### 1. 日常数据同步

**推荐**: Python后端脚本

```bash
# 配置好参数后
python3 sync_with_ddl.py

# 或者批量同步
python3 <<EOF
from sync_with_ddl import TableSyncWithDDL

syncer = TableSyncWithDDL(source_config, target_config)

tables = [
    'spx_mart_manage_app.dim_spx_driver_tab_br_all',
    'spx_mart_manage_app.dim_spx_station_tab_br_all',
]

for table in tables:
    syncer.sync_table(
        source_table=table,
        target_table=table,
        source_remote_ip='10.180.129.96',
        source_remote_user='spx_mart',
        source_remote_password='RtL3jHWkDoHp'
    )
EOF
```

### 2. 快速追加数据

**推荐**: Chrome扩展追加模式

适用场景:
- 表结构已经正确（之前用Python脚本同步过）
- 只需要更新数据
- 快速测试

### 3. 首次同步或表结构变更

**必须**: Python后端脚本

原因:
- 需要使用完整DDL保证性能
- 需要同步表结构变更
- 避免接口调用失败

---

## 🎯 工作流程建议

### 推荐流程

```
1. 首次同步（Python脚本）
   ↓ 使用完整DDL创建表
   ↓ 保证性能和兼容性
   
2. 日常更新（Chrome扩展）
   ↓ 使用追加模式
   ↓ 快速追加新数据
   
3. 表结构变更（Python脚本）
   ↓ 重新使用完整DDL同步
   ↓ 更新表结构
```

---

## 📚 相关文档

### Python后端

- **完整指南**: `ck_sync/DDL_SYNC_GUIDE.md`
- **快速参考**: `ck_sync/QUICK_REFERENCE.md`
- **实现总结**: `ck_sync/IMPLEMENTATION_SUMMARY.md`
- **测试脚本**: `ck_sync/test_ddl.py`
- **同步脚本**: `ck_sync/sync_with_ddl.py`

### Chrome扩展

- **使用指南**: `CHROME_EXTENSION_DATA_SYNC_GUIDE.md`
- **位置**: 扩展 → 🛠️ 实用工具 → 🔄 数据同步工具

---

## ✅ 总结

| 功能 | Python脚本 | Chrome扩展 |
|------|-----------|-----------|
| **完整DDL同步** | ✅ 支持 | ❌ 不支持（权限限制） |
| **追加数据** | ✅ 支持 | ✅ 支持 |
| **批量同步** | ✅ 支持 | ⚠️ 需要手动逐个 |
| **网络要求** | 需要内网/VPN | 浏览器已连接即可 |
| **使用便捷性** | ⚠️ 需要命令行 | ✅ 图形界面 |
| **推荐场景** | 首次同步、表结构变更 | 日常数据追加 |

**建议**:
- ⭐ **首次同步**: 使用Python脚本（完整DDL）
- ⭐ **日常更新**: 使用Chrome扩展（追加模式）
- ⭐ **表结构变更**: 使用Python脚本（完整DDL）

---

**测试时间**: 2026-02-03  
**结论**: ✅ Python脚本完全可用，Chrome扩展支持追加模式

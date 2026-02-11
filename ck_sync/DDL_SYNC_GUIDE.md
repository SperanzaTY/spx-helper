# 🔧 完整DDL表结构同步方案

## 📌 重要说明

**必须使用完整DDL同步，不能使用简化方案！**

原因:
- ❌ 简化方案会导致性能崩溃
- ❌ 下游接口调用失败
- ❌ 数据查询错误
- ✅ **必须严格使用与LIVE环境一样的DDL**

---

## 🎯 方案架构

### 完整同步流程

```
LIVE环境 (ONLINE2/ONLINE6)
    │
    ├─ 步骤1: 获取完整DDL
    │   └─ SHOW CREATE TABLE source_table
    │
    ├─ 步骤2: DDL适配
    │   ├─ 替换表名
    │   ├─ 处理集群配置（ON CLUSTER）
    │   └─ 修改Distributed引擎参数
    │
    ├─ 步骤3: 重建目标表
    │   ├─ DROP TABLE IF EXISTS target_table
    │   └─ CREATE TABLE target_table (使用完整DDL)
    │
    └─ 步骤4: 同步数据
        └─ INSERT INTO target_table
           SELECT * FROM remote(source_ip, source_table, ...)
```

---

## 🚀 使用方法

### 方法1: 使用Python脚本

```python
from ck_sync.sync_with_ddl import TableSyncWithDDL

# 1. 配置源和目标数据库
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

# 2. 创建同步工具
syncer = TableSyncWithDDL(source_config, target_config)

# 3. 同步表
success = syncer.sync_table(
    source_table='spx_mart_manage_app.dim_spx_driver_tab_br_all',
    target_table='spx_mart_manage_app.dim_spx_driver_tab_br_all',
    source_remote_ip='10.180.129.96',
    source_remote_user='spx_mart',
    source_remote_password='RtL3jHWkDoHp'
)
```

### 方法2: 直接运行脚本

```bash
cd /Users/tianyi.liang/Cursor/SPX_Helper/ck_sync
python sync_with_ddl.py
```

**修改配置**（编辑 `sync_with_ddl.py`）:
```python
# 要同步的表
source_table = 'spx_mart_manage_app.你的表名'
target_table = 'spx_mart_manage_app.你的表名'

# 源数据库IP（ONLINE2 或 ONLINE6）
source_remote_ip = '10.180.129.96'  # ONLINE2
# 或
source_remote_ip = '10.180.129.141'  # ONLINE6
```

---

## 🔍 技术细节

### 1. DDL获取

使用 `SHOW CREATE TABLE` 获取完整的表定义:

```sql
SHOW CREATE TABLE spx_mart_manage_app.dim_spx_driver_tab_br_all
```

返回示例:
```sql
CREATE TABLE spx_mart_manage_app.dim_spx_driver_tab_br_all ON CLUSTER cluster_szsc_spx_mart_online_2
(
    driver_id Int64,
    driver_name String,
    phone String,
    status Int32,
    ...
)
ENGINE = Distributed('cluster_szsc_spx_mart_online_2', 'spx_mart_manage_app', 'dim_spx_driver_tab_br_local', xxHash64(driver_id))
```

### 2. DDL适配处理

#### a. 表名替换
```python
# 原始: CREATE TABLE source_db.source_table
# 修改: CREATE TABLE target_db.target_table
```

#### b. 集群配置处理

**场景1: LIVE有集群，TEST无集群（常见）**
```python
# 原始: CREATE TABLE ... ON CLUSTER cluster_name
# 修改: CREATE TABLE ... (移除ON CLUSTER)

# 原始: ENGINE = Distributed('cluster_name', ...)
# 修改: 保持原样（或提示警告）
```

**场景2: LIVE有集群，TEST也有集群**
```python
# 原始: CREATE TABLE ... ON CLUSTER old_cluster
# 修改: CREATE TABLE ... ON CLUSTER new_cluster

# 原始: ENGINE = Distributed('old_cluster', ...)
# 修改: ENGINE = Distributed('new_cluster', ...)
```

#### c. 保留所有引擎参数

完整保留:
- `ORDER BY` - 排序键
- `PARTITION BY` - 分区键
- `PRIMARY KEY` - 主键
- `SAMPLE BY` - 采样键
- `SETTINGS` - 表设置
- `TTL` - 数据过期策略

### 3. 代码实现核心

```python
def recreate_table_with_ddl(self, source_table, target_table, 
                            source_client, drop_cluster=None, 
                            create_cluster=None):
    """使用完整DDL重建表"""
    
    # 1. 获取源表DDL
    source_ddl = source_client.get_create_table_ddl(source_table)
    
    # 2. 修改DDL
    modified_ddl = self._modify_ddl_for_target(
        source_ddl, source_table, target_table, create_cluster
    )
    
    # 3. 删除旧表
    if drop_cluster:
        drop_sql = f"DROP TABLE IF EXISTS {target_table} ON CLUSTER {drop_cluster}"
    else:
        drop_sql = f"DROP TABLE IF EXISTS {target_table}"
    
    self.execute(drop_sql)
    
    # 4. 创建新表
    self.execute(modified_ddl)
    
    return True, "重建成功"
```

---

## 📊 执行日志示例

```
================================================================================
🚀 开始同步表:
   源表: spx_mart_manage_app.dim_spx_driver_tab_br_all
   目标表: spx_mart_manage_app.dim_spx_driver_tab_br_all
================================================================================

📋 步骤1/2: 重建表结构（使用完整DDL）
📥 从源获取表 spx_mart_manage_app.dim_spx_driver_tab_br_all 的DDL...
🔧 修改DDL以适配目标环境...
🗑️  删除旧表: spx_mart_manage_app.dim_spx_driver_tab_br_all
🏗️  使用完整DDL创建新表: spx_mart_manage_app.dim_spx_driver_tab_br_all
✅ 表结构重建成功

📦 步骤2/2: 同步数据
📥 从 10.180.129.96 同步数据...
✅ 数据同步成功

🔍 验证同步结果:
   表 spx_mart_manage_app.dim_spx_driver_tab_br_all 行数: 1,234,567
   列数: 45
   列名: driver_id, driver_name, phone, status, ctime...
   引擎: Distributed
   排序键: driver_id
   分区键: toYYYYMM(grass_date)

================================================================================
🎉 表同步完成!
================================================================================
```

---

## ⚠️ 注意事项

### 1. 分布式表的特殊处理

如果源表是 **Distributed 表**:

```sql
ENGINE = Distributed('cluster_name', 'database', 'local_table', sharding_key)
```

**问题**: TEST环境可能没有对应的集群和local表

**解决方案**:

#### 方案A: 同时同步local表和distributed表
```python
# 1. 先同步local表
syncer.sync_table(
    source_table='spx_mart_manage_app.dim_spx_driver_tab_br_local',
    target_table='spx_mart_manage_app.dim_spx_driver_tab_br_local'
)

# 2. 再同步distributed表
syncer.sync_table(
    source_table='spx_mart_manage_app.dim_spx_driver_tab_br_all',
    target_table='spx_mart_manage_app.dim_spx_driver_tab_br_all'
)
```

#### 方案B: 只同步local表（推荐TEST环境）
```python
# TEST环境通常只需要local表
syncer.sync_table(
    source_table='spx_mart_manage_app.dim_spx_driver_tab_br_local',
    target_table='spx_mart_manage_app.dim_spx_driver_tab_br_all'  # 注意目标表名
)
```

### 2. 集群配置建议

| 环境 | 是否使用集群 | 配置建议 |
|------|------------|----------|
| LIVE (ONLINE2/6) | 是 | 保持原集群配置 |
| TEST | 否（推荐） | `drop_cluster=None, create_cluster=None` |
| TEST | 是（如果有集群） | 指定TEST集群名 |

### 3. 性能考虑

**大表同步时间估算**:

| 数据量 | DDL重建 | 数据同步 | 总时间 |
|--------|---------|---------|--------|
| < 1万行 | 5秒 | 10秒 | 15秒 |
| 1-10万行 | 5秒 | 30-60秒 | 35-65秒 |
| 10-100万行 | 5秒 | 2-5分钟 | 2-5分钟 |
| > 100万行 | 5秒 | 5-30分钟 | 5-30分钟 |

### 4. 权限要求

需要的权限:
- ✅ `DROP TABLE` - 删除表权限
- ✅ `CREATE TABLE` - 创建表权限
- ✅ `INSERT` - 插入数据权限
- ✅ `SELECT` - 查询权限（用于remote()）

### 5. 常见错误

#### 错误1: 无法获取DDL
```
错误: DB::Exception: Table doesn't exist
解决: 检查源表名是否正确，表是否存在
```

#### 错误2: 集群不存在
```
错误: DB::Exception: Requested cluster 'cluster_name' not found
解决: 设置 drop_cluster=None 和 create_cluster=None
```

#### 错误3: remote()连接失败
```
错误: DB::Exception: All connection tries failed
解决: 检查源数据库IP、用户名、密码是否正确
```

---

## 🎯 与简化方案的对比

| 特性 | 简化方案 | 完整DDL方案 |
|------|---------|------------|
| **表结构** | ❌ 使用默认引擎 | ✅ 完全一致 |
| **排序键** | ❌ 无排序键 | ✅ 保留原排序键 |
| **分区键** | ❌ 无分区 | ✅ 保留原分区 |
| **性能** | ❌ 查询慢 | ✅ 性能一致 |
| **兼容性** | ❌ 接口可能失败 | ✅ 完全兼容 |
| **推荐度** | ❌ 不推荐 | ✅ **强烈推荐** |

---

## 📚 示例：同步多个表

```python
from ck_sync.sync_with_ddl import TableSyncWithDDL

# 配置
source_config = {...}
target_config = {...}
syncer = TableSyncWithDDL(source_config, target_config)

# 要同步的表列表
tables = [
    'spx_mart_manage_app.dim_spx_driver_tab_br_all',
    'spx_mart_manage_app.dim_spx_station_tab_br_all',
    'spx_mart_manage_app.dim_spx_order_tab_br_all',
]

# 批量同步
for table in tables:
    print(f"\n开始同步表: {table}")
    success = syncer.sync_table(
        source_table=table,
        target_table=table,
        source_remote_ip='10.180.129.96',
        source_remote_user='spx_mart',
        source_remote_password='RtL3jHWkDoHp'
    )
    
    if success:
        print(f"✅ {table} 同步成功")
    else:
        print(f"❌ {table} 同步失败")
```

---

## 🔄 后续集成到扩展

可以将此功能集成到Chrome扩展中:

```javascript
// popup.js 中添加
async function syncTableWithFullDDL(tableName, market) {
    // 调用后端API执行Python脚本
    const response = await fetch('http://localhost:5000/sync_table_ddl', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            table: tableName,
            market: market,
            use_full_ddl: true  // 使用完整DDL
        })
    });
    
    const result = await response.json();
    return result.success;
}
```

---

## ✅ 总结

1. **必须使用完整DDL方案** - 保证性能和兼容性
2. **自动处理集群配置** - 适配不同环境
3. **保留所有引擎参数** - 完全复制表结构
4. **支持分布式表** - 处理复杂表结构
5. **完整的日志输出** - 易于调试和监控

---

**版本**: v1.0  
**最后更新**: 2026-01-30  
**状态**: ✅ 已实现并测试

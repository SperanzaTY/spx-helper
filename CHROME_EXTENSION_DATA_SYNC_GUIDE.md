# 🔄 Chrome扩展数据同步工具 - 完整DDL模式使用指南

## 📍 位置

打开扩展 → 🛠️ 实用工具 → 🔄 数据同步工具 (LIVE → TEST)

---

## ⭐ 新增功能：完整DDL模式

现在数据同步工具支持**完整DDL模式**，自动从LIVE环境获取完整的表DDL，保证TEST环境的表结构、性能、配置完全一致！

---

## 🚀 使用方法

### 1. 打开数据同步工具

```
扩展主界面 
  → 点击 "🛠️ 实用工具" 标签
  → 找到 "🔄 数据同步工具 (LIVE → TEST)"
```

### 2. 配置同步参数

| 配置项 | 说明 | 示例 |
|--------|------|------|
| **源服务器** | 选择LIVE环境服务器 | ONLINE2 (10.180.129.96) |
| **表名模板** | 不包含市场后缀和_all | `dim_spx_driver_tab` |
| **市场** | 选择要同步的市场 | Singapore (SG) |
| **数据库** | 数据库名称 | `spx_mart_manage_app` |
| **同步模式** | 选择 **⭐ 完整DDL模式（推荐）** | ⭐ 完整DDL模式 |

### 3. 执行同步（3步）

#### 步骤1: 验证源数据
```
点击 "1️⃣ 验证源数据" 按钮
→ 查看LIVE环境的表信息
→ 确认数据行数正常
```

#### 步骤2: 执行同步
```
点击 "2️⃣ 执行同步" 按钮
→ 确认操作提示
→ 等待同步完成（大表需要几分钟）
```

#### 步骤3: 验证结果
```
点击 "3️⃣ 验证结果" 按钮
→ 查看TEST环境的数据行数
→ 确认同步成功
```

---

## 🎯 三种同步模式对比

### ⭐ 完整DDL模式（强烈推荐）

**工作流程:**
1. 从 LIVE 环境获取完整 DDL (通过 `system.tables`)
2. 自动修改DDL适配TEST环境（移除集群配置）
3. 删除 TEST 环境的旧表
4. 使用 LIVE 的完整DDL创建表
5. 使用 `remote()` 函数导入数据

**优势:**
- ✅ 完全复制LIVE环境的表结构
- ✅ 保留排序键 (ORDER BY)
- ✅ 保留分区键 (PARTITION BY)
- ✅ 保留所有引擎参数和配置
- ✅ 查询性能与LIVE一致
- ✅ 确保接口兼容性

**适用场景:**
- **所有情况（强烈推荐）**
- 特别是需要保证性能和兼容性的场景

---

### 追加模式 (INSERT)

**工作流程:**
1. 直接使用 `remote()` 函数插入数据到现有表

**优势:**
- ✅ 保留现有数据
- ✅ 执行速度快

**限制:**
- ❌ 表结构必须完全匹配
- ❌ 不修改表结构

**适用场景:**
- 表结构已经正确
- 只需要追加新数据

---

### ⚠️ 简化重建模式（已废弃，不推荐）

**问题:**
- ❌ 使用默认引擎，无排序键和分区键
- ❌ 查询性能慢100-1000倍
- ❌ 可能导致接口调用失败
- ❌ 数据查询错误

**结论: 不要使用！**

---

## 📊 完整DDL模式的技术实现

### 步骤1: 获取LIVE环境的DDL

通过 `system.tables` 系统表查询：

```sql
SELECT create_table_query 
FROM remote(
  '10.180.129.96',
  'system.tables',
  'spx_mart',
  'RtL3jHWkDoHp'
)
WHERE database = 'spx_mart_manage_app' 
  AND name = 'dim_spx_driver_tab_sg_all'
FORMAT TabSeparated
```

获得完整DDL：
```sql
CREATE TABLE spx_mart_manage_app.dim_spx_driver_tab_sg_all 
ON CLUSTER cluster_szsc_spx_mart_online_2
(
    driver_id Int64,
    driver_name String,
    ...
)
ENGINE = Distributed('cluster_szsc_spx_mart_online_2', ...)
PARTITION BY toYYYYMM(grass_date)
ORDER BY (driver_id, grass_date)
SETTINGS index_granularity = 8192
```

### 步骤2: 修改DDL适配TEST环境

自动处理：
- 移除 `ON CLUSTER` 子句（TEST环境不使用集群）
- 保留所有其他配置

修改后：
```sql
CREATE TABLE spx_mart_manage_app.dim_spx_driver_tab_sg_all
(
    driver_id Int64,
    driver_name String,
    ...
)
ENGINE = Distributed('cluster_szsc_spx_mart_online_2', ...)
PARTITION BY toYYYYMM(grass_date)
ORDER BY (driver_id, grass_date)
SETTINGS index_granularity = 8192
```

### 步骤3-6: 执行重建和数据导入

3. DROP TABLE IF EXISTS (TEST)
4. CREATE TABLE (使用完整DDL)
5. 同样处理local表（如果存在）
6. INSERT INTO ... SELECT * FROM remote(...)

---

## 🔍 同步状态说明

### 成功状态

```
✅ 完整DDL同步完成
✅ 已使用 LIVE 环境的完整DDL重建表
✅ 排序键、分区键、引擎参数完全一致
源表: spx_mart_manage_app.dim_spx_driver_tab_sg_all
目标表: spx_mart_manage_app.dim_spx_driver_tab_sg_all
模式: ⭐ 完整DDL模式
💡 点击"验证结果"查看 TEST 环境的数据
```

### 验证结果

```
✅ 验证完成
TEST 环境表: spx_mart_manage_app.dim_spx_driver_tab_sg_all
数据行数: 1,234,567
🎉 数据同步流程完成！
```

---

## ⚠️ 注意事项

### 1. 数据丢失警告

完整DDL模式会：
- ❌ 删除 TEST 环境的所有现有数据
- ❌ 删除表的统计信息

**解决方案**: 如果需要保留数据，使用追加模式

### 2. 同步时间

| 数据量 | 预计时间 |
|--------|---------|
| < 1万行 | 15-30秒 |
| 1-10万行 | 1-2分钟 |
| 10-100万行 | 3-10分钟 |
| > 100万行 | 10-30分钟 |

### 3. 分布式表处理

扩展会自动处理：
- ✅ 检测并同步 local 表
- ✅ 检测并同步 distributed (all) 表
- ✅ 保留表之间的关系

### 4. 集群配置

自动处理：
- ✅ 移除 `ON CLUSTER` 子句（TEST环境通常不使用）
- ✅ 保留 Distributed 引擎参数（可能需要对应的local表）

---

## 🐛 常见问题

### Q1: 同步失败 "无法从 LIVE 获取表DDL"

**原因**: 表在指定的源服务器上不存在

**解决**:
1. 切换源服务器（ONLINE2 ↔ ONLINE6）
2. 检查表名是否正确
3. 检查市场和数据库是否正确

### Q2: 同步失败 "创建表失败"

**原因**: DDL包含TEST环境不支持的配置

**解决**:
1. 查看错误详情
2. 可能需要手动调整DDL
3. 或联系管理员

### Q3: 数据同步很慢

**原因**: 
- 大表数据量大
- 网络带宽限制
- LIVE环境负载高

**解决**:
- 等待完成（大表需要几分钟）
- 在低峰期执行
- 分批同步（如果支持）

### Q4: 验证结果显示行数为0

**原因**:
- 数据导入失败
- 导入到错误的表
- 分布式表配置问题

**解决**:
1. 查看同步日志
2. 检查local表的数据
3. 重新执行同步

---

## 💡 使用建议

### 1. 优先使用完整DDL模式

除非有特殊原因（如需要保留TEST数据），**总是使用完整DDL模式**：
- ✅ 保证性能
- ✅ 保证兼容性
- ✅ 避免问题

### 2. 先验证再同步

总是先点击"验证源数据"：
- 确认表存在
- 确认数据行数合理
- 避免同步错误的表

### 3. 定期同步

建议定期同步TEST环境：
- 每周同步一次
- 保持TEST环境数据新鲜
- 便于测试验证

### 4. 注意同步时机

选择合适的同步时间：
- ✅ 低峰期（如凌晨）
- ✅ 测试前
- ❌ 避免高峰期

---

## 📚 相关文档

### Python后端实现

完整的DDL同步功能也有Python后端实现：

- **详细指南**: `ck_sync/DDL_SYNC_GUIDE.md`
- **快速参考**: `ck_sync/QUICK_REFERENCE.md`
- **实现总结**: `ck_sync/IMPLEMENTATION_SUMMARY.md`

### 使用Python脚本

如果需要批量同步或自动化，可以使用Python脚本：

```bash
cd /Users/tianyi.liang/Cursor/SPX_Helper/ck_sync
python3 sync_with_ddl.py
```

---

## ✅ 总结

### 新功能亮点

1. ⭐ **完整DDL模式** - 从LIVE自动获取完整DDL
2. ✅ **自动适配** - 智能处理集群配置差异
3. ✅ **性能保证** - 排序键、分区键完全一致
4. ✅ **易于使用** - 3步完成同步
5. ✅ **实时反馈** - 详细的状态提示

### 使用流程

```
配置参数 → 验证源数据 → 执行同步 → 验证结果 → 完成！
```

### 最佳实践

- ✅ 总是使用完整DDL模式
- ✅ 同步前先验证
- ✅ 定期同步保持数据新鲜
- ✅ 选择低峰期执行

---

**版本**: v2.9.0+  
**最后更新**: 2026-01-30  
**功能状态**: ✅ 已实现并可用

# 🔧 表结构同步方案

## ❌ 问题场景

当 LIVE 和 TEST 环境的表结构不一致时，直接 INSERT 会失败：

```
错误: DB::Exception: Number of columns doesn't match

原因:
- LIVE 表有 50 列
- TEST 表只有 45 列
或者
- 列的顺序不同
- 列的类型不同
```

---

## ✅ 解决方案

### 方案 1: 重建模式 (DROP + CREATE) ⭐⭐⭐ 推荐

**操作**：删除 TEST 环境的旧表，从 LIVE 表重新创建

**优点**：
- ✅ 自动同步表结构（列、类型、顺序完全一致）
- ✅ 简单，一步到位
- ✅ 不需要手动处理列差异

**缺点**：
- ❌ 删除 TEST 环境的现有数据
- ❌ 如果 TEST 有自定义索引/分区，会丢失

**适用场景**：
- TEST 环境的数据可以随时重建
- 表结构频繁变化
- 需要完整同步表结构

---

### 方案 2: 追加模式 (INSERT)

**操作**：直接插入数据到现有表

**优点**：
- ✅ 保留 TEST 环境的现有数据
- ✅ 保留自定义配置（索引、分区等）

**缺点**：
- ❌ 表结构必须完全匹配，否则失败
- ❌ 需要手动维护 TEST 表结构

**适用场景**：
- 表结构稳定，不常变化
- 需要保留 TEST 环境的现有数据
- 只是追加新数据

---

## 🎯 使用重建模式

### 步骤 1: 在扩展中选择模式

```
同步模式: [重建模式 (DROP + CREATE) - 重新创建表结构 ▼]
```

### 步骤 2: 点击"执行同步"

确认对话框：
```
⚠️ 重建模式 - 将删除并重新创建表！

操作:
1. DROP TABLE spx_mart_manage_app.dim_spx_driver_tab_br_all
2. CREATE TABLE ... AS SELECT FROM remote(...)

源: 10.180.129.96 / spx_mart_manage_app.dim_spx_driver_tab_br_all
目标: TEST / spx_mart_manage_app.dim_spx_driver_tab_br_all

⚠️ 警告：TEST 环境的现有数据将被完全删除！

确认继续？
```

### 步骤 3: 自动执行

```
🚀 正在重建表并同步数据...
步骤 1/2: 删除旧表
步骤 2/2: 创建新表并导入数据

请稍候，大表可能需要几分钟...
```

### 步骤 4: 完成

```
✅ 表重建完成
已删除旧表并从源表重新创建
源表: spx_mart_manage_app.dim_spx_driver_tab_br_all
目标表: spx_mart_manage_app.dim_spx_driver_tab_br_all
模式: 重建模式 (DROP + CREATE)
💡 点击"验证结果"查看 TEST 环境的数据
```

---

## 🔧 技术实现

### 执行的 SQL

#### 步骤 1: 删除旧表
```sql
DROP TABLE IF EXISTS spx_mart_manage_app.dim_spx_driver_tab_br_all
```

#### 步骤 2: 创建新表并导入数据
```sql
CREATE TABLE spx_mart_manage_app.dim_spx_driver_tab_br_all
ENGINE = MergeTree()
ORDER BY tuple()
AS SELECT * FROM remote(
  '10.180.129.96',
  'spx_mart_manage_app.dim_spx_driver_tab_br_all',
  'spx_mart',
  'RtL3jHWkDoHp'
)
```

**说明**：
- `ENGINE = MergeTree()` - 使用 ClickHouse 默认引擎
- `ORDER BY tuple()` - 无排序键（适合临时测试表）
- `AS SELECT * FROM remote(...)` - 从源表复制结构和数据

---

## 📊 两种模式对比

| 特性 | 追加模式 (INSERT) | 重建模式 (DROP + CREATE) |
|------|-------------------|--------------------------|
| **表结构要求** | 必须完全匹配 | 自动同步 |
| **现有数据** | 保留 | 删除 |
| **执行速度** | 快 | 稍慢（需要删除+创建） |
| **适用场景** | 表结构稳定 | 表结构变化 |
| **失败风险** | 高（结构不匹配会失败） | 低（自动处理结构差异） |
| **推荐使用** | 数据追加 | 完整同步 |

---

## ⚠️ 注意事项

### 1. 数据丢失风险

**重建模式会删除 TEST 环境的所有数据**，包括：
- 表中的所有行
- 表的统计信息
- （如果有自定义）索引、分区配置

**解决方案**：
- 如果需要保留数据，使用追加模式
- 或者先备份 TEST 数据

### 2. 表引擎和配置

重建模式使用默认配置：
```sql
ENGINE = MergeTree()
ORDER BY tuple()
```

**如果需要自定义配置**：
- 先在 TEST 手动创建表（指定引擎、分区、排序键）
- 然后使用追加模式同步数据

### 3. 权限要求

重建模式需要：
- ✅ `DROP TABLE` 权限
- ✅ `CREATE TABLE` 权限

如果权限不足，会报错：
```
DB::Exception: Not enough privileges
```

### 4. 同步时间

重建模式比追加模式稍慢：

| 数据量 | 追加模式 | 重建模式 |
|--------|----------|----------|
| < 1万行 | 5-10 秒 | 10-15 秒 |
| 1-10万行 | 30-60 秒 | 40-70 秒 |
| > 10万行 | 1-5 分钟 | 1.5-6 分钟 |

---

## 💡 使用场景示例

### 场景 1: 新增列

**LIVE 表**：
```sql
CREATE TABLE driver_tab (
  driver_id Int64,
  name String,
  phone String,
  email String  -- 新增列
) ENGINE = MergeTree() ORDER BY driver_id;
```

**TEST 表**（旧结构）：
```sql
CREATE TABLE driver_tab (
  driver_id Int64,
  name String,
  phone String
  -- 缺少 email 列
) ENGINE = MergeTree() ORDER BY driver_id;
```

**解决方案**：
1. 选择"重建模式"
2. 执行同步
3. TEST 表自动包含 `email` 列

---

### 场景 2: 修改列类型

**LIVE 表**：
```sql
phone String  -- 改为 String
```

**TEST 表**：
```sql
phone Int64  -- 原来是 Int64
```

**解决方案**：
1. 选择"重建模式"
2. TEST 表自动使用 String 类型

---

### 场景 3: 列顺序不同

**LIVE 表**：
```sql
driver_id, name, phone, email
```

**TEST 表**：
```sql
driver_id, phone, name, email  -- 顺序不同
```

**解决方案**：
1. 选择"重建模式"
2. 列顺序自动与 LIVE 一致

---

## 🎨 UI 界面

```
┌─────────────────────────────────────────────────────┐
│ 同步模式: [重建模式 (DROP + CREATE) ▼]               │
│                                                       │
│ 追加模式 (INSERT) - 保留现有数据                      │
│ 重建模式 (DROP + CREATE) - 重新创建表结构 ✅          │
│                                                       │
│ 提示:                                                 │
│ • 追加模式: 将数据插入现有表（表结构必须匹配）         │
│ • 重建模式: 删除旧表并从源表重新创建（自动同步表结构） │
└─────────────────────────────────────────────────────┘
```

---

## 🔍 常见错误和解决方案

### 错误 1: 列数不匹配

```
DB::Exception: Number of columns doesn't match
Expected 50 columns, got 45
```

**原因**：表结构不一致

**解决方案**：
1. 改用"重建模式"
2. 或者手动在 TEST 修改表结构

---

### 错误 2: 列类型不匹配

```
DB::Exception: Type mismatch for column 'phone'
Cannot convert String to Int64
```

**原因**：列类型不同

**解决方案**：改用"重建模式"

---

### 错误 3: 权限不足

```
DB::Exception: Not enough privileges
Cannot execute DROP TABLE
```

**原因**：没有 DROP 权限

**解决方案**：
1. 联系管理员授权
2. 或使用追加模式（不需要 DROP 权限）

---

## 📋 最佳实践

### 1. 优先使用重建模式

除非有特殊原因（需要保留 TEST 数据），**优先使用重建模式**：
- ✅ 避免结构不一致问题
- ✅ 简单可靠
- ✅ 不需要手动维护

### 2. 定期同步

建议**定期同步**（如每周），保持 TEST 环境与 LIVE 一致：
```
每周一早上
    ↓
使用重建模式同步所有测试表
    ↓
TEST 环境数据和结构保持最新
```

### 3. 自动化同步（未来功能）

可以考虑添加：
- 定时自动同步
- 批量同步多个表
- 同步历史记录

---

## 🎉 总结

✅ **新增功能**：
- 同步模式选择（追加 / 重建）
- 重建模式自动同步表结构
- 智能确认对话框

✅ **解决问题**：
- 表结构不一致导致的同步失败
- 新增列、修改类型、列顺序不同等

✅ **使用建议**：
- 优先使用重建模式（简单可靠）
- 追加模式用于数据追加场景

---

**现在可以轻松处理表结构不一致的问题了！** 🚀

**测试步骤**：
1. 重新加载扩展
2. 打开数据同步工具
3. 选择"重建模式"
4. 执行同步

---

**版本**: v2.9.0  
**最后更新**: 2026-01-30

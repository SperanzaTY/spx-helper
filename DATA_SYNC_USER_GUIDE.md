# 🔄 数据同步工具使用指南

## ✨ 功能介绍

将 LIVE 环境的 ClickHouse 数据同步到 TEST 环境，用于测试和开发。

---

## 🎯 使用步骤

### 步骤 1: 填写同步配置

1. **源服务器** - 选择 LIVE 环境的服务器
   - `ONLINE2 (10.180.129.96)` - 默认
   - `ONLINE6 (10.180.129.141)` - 备选

2. **表名模板** - 输入不含市场后缀的表名
   ```
   例如: dim_spx_driver_tab
   不要输入: dim_spx_driver_tab_br_all
   ```

3. **市场** - 选择要同步的市场
   ```
   SG, ID, MY, TH, PH, VN, TW, BR
   ```

4. **数据库** - 输入数据库名
   ```
   例如: spx_mart_manage_app
   ```

5. **完整表名预览** - 自动显示完整的表名
   ```
   例如: spx_mart_manage_app.dim_spx_driver_tab_br_all
   ```

---

### 步骤 2: 验证源数据

点击 **"1️⃣ 验证源数据"** 按钮

**作用**：
- 查询 LIVE 环境的表数据量
- 验证表是否存在
- 确认连接是否正常

**成功返回**：
```
✅ 源数据验证成功
源表: spx_mart_manage_app.dim_spx_driver_tab_br_all
源服务器: 10.180.129.96
数据行数: 12,345
⚠️ 准备好后，点击"执行同步"开始同步数据到 TEST 环境
```

**失败情况**：
- `Table does not exist` - 表不存在，检查表名和服务器
- `Timeout` - 连接超时，稍后重试
- `Permission denied` - 权限不足

---

### 步骤 3: 执行同步

点击 **"2️⃣ 执行同步"** 按钮

**确认对话框**：
```
确认同步数据？

源: 10.180.129.96 / spx_mart_manage_app.dim_spx_driver_tab_br_all
目标: TEST / spx_mart_manage_app.dim_spx_driver_tab_br_all

⚠️ 注意：这将直接写入 TEST 环境的 ClickHouse
```

**同步过程**：
```
🚀 正在同步数据...
请稍候，大表可能需要几分钟...
```

**成功返回**：
```
✅ 同步完成
已将数据从 LIVE 同步到 TEST 环境
源表: spx_mart_manage_app.dim_spx_driver_tab_br_all
目标表: spx_mart_manage_app.dim_spx_driver_tab_br_all
💡 点击"验证结果"查看 TEST 环境的数据
```

---

### 步骤 4: 验证结果

点击 **"3️⃣ 验证结果"** 按钮

**作用**：
- 查询 TEST 环境的表数据量
- 确认同步是否成功

**成功返回**：
```
✅ 验证完成
TEST 环境表: spx_mart_manage_app.dim_spx_driver_tab_br_all
数据行数: 12,345
🎉 数据同步流程完成！
```

---

## 🎨 界面预览

```
┌─────────────────────────────────────────────────────────┐
│ 🔄 数据同步工具 (LIVE → TEST)                            │
├─────────────────────────────────────────────────────────┤
│                                                           │
│ 📋 功能说明                                               │
│ 将 LIVE 环境的 ClickHouse 数据同步到 TEST 环境          │
│                                                           │
│ ┌───────────────────────────────────────────────────┐   │
│ │ 源服务器 (LIVE): [ONLINE2 (10.180.129.96) ▼]     │   │
│ │                                                    │   │
│ │ 表名模板: [dim_spx_driver_tab              ]     │   │
│ │ 不包含市场后缀和 _all，例如: dim_spx_driver_tab  │   │
│ │                                                    │   │
│ │ 市场: [Brazil (BR) ▼]                             │   │
│ │                                                    │   │
│ │ 数据库: [spx_mart_manage_app              ]      │   │
│ │                                                    │   │
│ │ 完整表名预览:                                      │   │
│ │ spx_mart_manage_app.dim_spx_driver_tab_br_all    │   │
│ └───────────────────────────────────────────────────┘   │
│                                                           │
│ [1️⃣ 验证源数据] [2️⃣ 执行同步] [3️⃣ 验证结果]             │
│                                                           │
│ ┌───────────────────────────────────────────────────┐   │
│ │ ✅ 源数据验证成功                                  │   │
│ │ 源表: spx_mart_manage_app.dim_spx_driver_tab_br_all │
│ │ 源服务器: 10.180.129.96                           │   │
│ │ 数据行数: 12,345                                   │   │
│ └───────────────────────────────────────────────────┘   │
│                                                           │
│ 💡 使用步骤                                              │
│ 1. 填写表名模板和选择市场                                │
│ 2. 点击"验证源数据"查看 LIVE 环境的数据量                │
│ 3. 确认无误后，点击"执行同步"开始同步                    │
│ 4. 同步完成后，点击"验证结果"确认 TEST 环境的数据        │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 技术架构

### 数据流向

```
浏览器扩展 (executeTestClickHouseSQL)
        ↓
TEST ClickHouse (clickhouse-k8s-sg-prod:443)
        ↓ (remote() 函数)
LIVE ClickHouse (10.180.129.96 / 10.180.129.141)
        ↓
数据同步完成
```

### 执行的 SQL

#### 验证源数据
```sql
SELECT 
  count() as row_count,
  'source_verified' as status
FROM remote(
  '10.180.129.96',
  'spx_mart_manage_app.dim_spx_driver_tab_br_all',
  'spx_mart',
  'RtL3jHWkDoHp'
)
FORMAT JSON
```

#### 执行同步
```sql
INSERT INTO spx_mart_manage_app.dim_spx_driver_tab_br_all
SELECT * FROM remote(
  '10.180.129.96',
  'spx_mart_manage_app.dim_spx_driver_tab_br_all',
  'spx_mart',
  'RtL3jHWkDoHp'
)
```

#### 验证结果
```sql
SELECT count() as row_count
FROM spx_mart_manage_app.dim_spx_driver_tab_br_all
FORMAT JSON
```

---

## 📋 支持的表

### 示例表名（不含市场后缀）

```
dim_spx_driver_tab          - Driver 维度表
dim_spx_station_tab         - Station 维度表
dim_spx_vehicle_tab         - Vehicle 维度表
dim_spx_hub_tab             - Hub 维度表
ads_driver_performance      - Driver 性能汇总表
dws_station_metrics         - Station 指标表
```

### 市场列表

| 代码 | 市场 |
|------|------|
| `sg` | Singapore |
| `id` | Indonesia |
| `my` | Malaysia |
| `th` | Thailand |
| `ph` | Philippines |
| `vn` | Vietnam |
| `tw` | Taiwan |
| `br` | Brazil |

---

## ⚠️ 注意事项

### 1. 数据覆盖

**默认行为**：INSERT 会**追加数据**，不会清空原有数据

**如果需要替换数据**：
- 先在 TEST 环境手动 TRUNCATE 表
- 或者在执行同步前先清空

```sql
-- 手动在 TEST ClickHouse 执行
TRUNCATE TABLE spx_mart_manage_app.dim_spx_driver_tab_br_all;
```

### 2. 同步时间

| 数据量 | 预计时间 |
|--------|----------|
| < 1万行 | 5-10 秒 |
| 1-10万行 | 30-60 秒 |
| 10-100万行 | 1-5 分钟 |
| > 100万行 | 5+ 分钟 |

### 3. 网络要求

- ✅ TEST ClickHouse 无墙，可直接访问
- ✅ 浏览器可以访问 `clickhouse-k8s-sg-prod.data-infra.shopee.io:443`
- ❌ 不需要 VPN（TEST 环境公网可访问）

### 4. 权限要求

- ✅ 扩展已配置 TEST ClickHouse 的用户名和密码
- ✅ remote() 函数使用 LIVE 环境的凭证
- ❌ 不需要额外配置

### 5. 错误处理

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| `Table does not exist` | 表不存在 | 检查表名和数据库名 |
| `Permission denied` | 权限不足 | 联系管理员 |
| `Timeout` | 连接超时 | 稍后重试，或检查网络 |
| `NUMBER_OF_COLUMNS_DOESNT_MATCH` | 列数不匹配 | 源表和目标表结构不一致 |

---

## 💡 使用场景

### 场景 1: 测试新功能

```
开发了新的数据处理逻辑
     ↓
需要在 TEST 环境验证
     ↓
同步 LIVE 数据到 TEST
     ↓
运行测试脚本
```

### 场景 2: 调试问题

```
LIVE 环境发现数据异常
     ↓
同步相关表到 TEST
     ↓
在 TEST 环境调试分析
```

### 场景 3: 数据探索

```
需要查询大表
     ↓
不想影响 LIVE 性能
     ↓
同步到 TEST 进行查询
```

---

## 🎉 完成

现在你可以轻松地将 LIVE 环境的数据同步到 TEST 环境了！

**快捷访问**：
1. 打开扩展
2. 点击"实用工具"
3. 选择"🔄 数据同步"
4. 开始使用

---

**版本**: v2.9.0  
**最后更新**: 2026-01-30

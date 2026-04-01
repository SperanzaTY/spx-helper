# 🚀 简化版Presto查询工具使用指南

## 📋 快速开始（3步搞定）

### 1️⃣ 打开文件，修改配置

打开 `simple_query.py`，找到文件开头的配置部分：

```python
# ============================================================
# 配置参数 - 在这里修改你的查询设置
# ============================================================

# 用户信息
USERNAME = 'tianyi.liang'  # 改成你的用户名
PERSONAL_TOKEN = 'l7Vx4TGfwhmA1gtPn+JmUQ=='  # 改成你的Token

# SQL查询（改成你想查询的SQL）
SQL = """
SELECT * 
FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id 
LIMIT 10
"""

# 输出设置
OUTPUT_FORMAT = 'table'  # 输出格式: 'table', 'json', 'csv', 'simple'
OUTPUT_FILE = None  # 输出文件: None 或 'result.json' 或 'result.csv'
MAX_DISPLAY_ROWS = 20  # 最多显示多少行
```

### 2️⃣ 运行脚本

```bash
python3 simple_query.py
```

### 3️⃣ 查看结果

结果会直接显示在终端！

## 🎯 配置说明

### 用户信息

```python
USERNAME = 'tianyi.liang'  # 你的用户名（会自动转为邮箱格式）
PERSONAL_TOKEN = 'l7Vx4TGfwhmA1gtPn+JmUQ=='  # 从DataSuite获取的Personal Token
```

### SQL查询

```python
# 可以写任意SQL，支持多行
SQL = """
SELECT * 
FROM spx_mart.your_table 
WHERE date = '2026-02-28'
LIMIT 100
"""
```

### 查询参数

```python
QUEUE = 'szsc-adhoc'  # Presto队列
# 可选值:
#   - 'szsc-adhoc'     -> Ad-hoc查询（默认）
#   - 'szsc-scheduled' -> 定时任务

REGION = 'SG'  # IDC区域
# 常用值: 'SG', 'ID', 'VN', 'TH', 'PH', 'MY', 'TW', 'BR'

PRIORITY = '3'  # 优先级: 1-5
# 数字越小优先级越高（1最高，5最低）
```

### 输出设置

```python
# 输出格式
OUTPUT_FORMAT = 'table'
# 可选值:
#   - 'table'  -> 表格格式（最直观）
#   - 'json'   -> JSON格式（适合保存）
#   - 'csv'    -> CSV格式（适合Excel打开）
#   - 'simple' -> 简单列表格式

# 输出文件（可选）
OUTPUT_FILE = None  # 不保存
# 或
OUTPUT_FILE = 'result.json'  # 保存为JSON
# 或
OUTPUT_FILE = 'result.csv'   # 保存为CSV

# 最多显示行数
MAX_DISPLAY_ROWS = 20  # 只显示前20行（如果结果很多）
```

### 超时设置

```python
TIMEOUT = 300  # 查询超时时间(秒)，默认5分钟
# 如果查询复杂，可以增加：
TIMEOUT = 600  # 10分钟
```

## 📚 使用示例

### 示例1: 查询表数据（表格格式）

```python
USERNAME = 'tianyi.liang'
PERSONAL_TOKEN = 'l7Vx4TGfwhmA1gtPn+JmUQ=='

SQL = """
SELECT * 
FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id 
LIMIT 10
"""

OUTPUT_FORMAT = 'table'  # 表格格式
OUTPUT_FILE = None  # 不保存到文件
MAX_DISPLAY_ROWS = 10
```

运行后输出：
```
id | name | value | ...
-------------------
1  | foo  | bar   | ...
2  | baz  | qux   | ...

(10 rows)
```

### 示例2: 查看所有Catalog

```python
SQL = "SHOW CATALOGS"
OUTPUT_FORMAT = 'simple'
```

### 示例3: 查询并保存为JSON

```python
SQL = """
SELECT * 
FROM spx_mart.some_table 
WHERE date >= '2026-02-01'
LIMIT 1000
"""

OUTPUT_FORMAT = 'json'  # JSON格式显示
OUTPUT_FILE = 'result.json'  # 同时保存到文件
```

### 示例4: 查询并保存为CSV（可用Excel打开）

```python
SQL = """
SELECT station_code, station_name, region 
FROM spx_mart.dim_station 
LIMIT 500
"""

OUTPUT_FORMAT = 'csv'  # CSV格式显示
OUTPUT_FILE = 'stations.csv'  # 保存为CSV
```

### 示例5: 统计查询

```python
SQL = """
SELECT 
    region,
    COUNT(*) as total,
    COUNT(DISTINCT station_code) as unique_stations
FROM spx_mart.some_table
GROUP BY region
ORDER BY total DESC
"""

OUTPUT_FORMAT = 'table'
MAX_DISPLAY_ROWS = 100  # 显示更多行
```

### 示例6: 查看表结构

```python
SQL = "DESCRIBE spx_mart.dim_spx_lm_station_user_configuration_tab_id"
OUTPUT_FORMAT = 'table'
```

## 🎨 输出格式对比

### 1. table（表格）- 推荐日常使用

```
id | name   | value
-------------------
1  | foo    | bar
2  | baz    | qux

(2 rows)
```

### 2. json - 适合保存和程序处理

```json
{
  "columns": ["id", "name", "value"],
  "rows": [
    {"id": "1", "name": "foo", "value": "bar"},
    {"id": "2", "name": "baz", "value": "qux"}
  ],
  "jobId": "xxx"
}
```

### 3. csv - 适合Excel打开

```csv
id,name,value
1,foo,bar
2,baz,qux
```

### 4. simple - 适合少量数据详细查看

```
第 1 行:
  id: 1
  name: foo
  value: bar

第 2 行:
  id: 2
  name: baz
  value: qux
```

## ⚠️ 注意事项

1. **2000行限制**: Personal SQL API每次最多返回2000行
2. **Token安全**: 不要把带Token的文件提交到Git
3. **SQL格式**: SQL可以多行书写，更清晰
4. **注释**: 配置里的注释可以保留，方便提醒

## 🔧 常见问题

### Q: 如何获取Personal Token?

A: 登录DataSuite → 右上角头像 → Personal Token

### Q: 查询超时怎么办?

A: 增加 `TIMEOUT` 值，比如改为 `600`（10分钟）

### Q: 想查询超过2000行怎么办?

A: Personal SQL API有限制，需要用分页或在DataSuite平台查询

### Q: 可以同时保存多种格式吗?

A: 不能直接同时保存，但可以运行两次，每次设置不同的 `OUTPUT_FILE`

### Q: SQL很长怎么办?

A: 可以用三引号 `"""` 写多行SQL，更清晰：

```python
SQL = """
SELECT 
    a.station_code,
    a.station_name,
    b.order_count,
    c.revenue
FROM spx_mart.dim_station a
LEFT JOIN spx_mart.fact_orders b 
    ON a.station_code = b.station_code
LEFT JOIN spx_mart.fact_revenue c 
    ON a.station_code = c.station_code
WHERE a.date = '2026-02-28'
LIMIT 100
"""
```

## 💡 使用技巧

### 技巧1: 快速测试表是否存在

```python
SQL = "SELECT 1 FROM spx_mart.your_table LIMIT 1"
```

### 技巧2: 快速查看表行数

```python
SQL = "SELECT COUNT(*) as total FROM spx_mart.your_table"
```

### 技巧3: 查看最新数据

```python
SQL = """
SELECT * 
FROM spx_mart.your_table 
ORDER BY create_time DESC 
LIMIT 10
"""
```

### 技巧4: 多次查询，只改SQL

保持其他配置不变，每次只修改 `SQL` 部分，快速切换查询

## 📊 完整运行示例

```bash
$ python3 simple_query.py

======================================================================
                    🚀 Presto查询工具
======================================================================
📤 提交查询...
   Queue: szsc-adhoc
   Region: SG
   SQL: SELECT * FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id LIMIT 10
✅ 查询已提交! jobId: 7a51fbc1-6eb1-4441-a875-29da83c863ff
⏳ 等待查询完成...
🔄 状态 (1): RUNNING
🔄 状态 (2): RUNNING
✅ 查询完成！(轮询 3 次)
📥 获取结果...
📊 查询结果: 11 列, 10 行

======================================================================
                         📊 查询结果
======================================================================

id | name | value | ...
----------------------
1  | foo  | bar   | ...
2  | baz  | qux   | ...

(10 rows)

======================================================================
✅ 查询成功!
   JobId: 7a51fbc1-6eb1-4441-a875-29da83c863ff
   列数: 11
   行数: 10
======================================================================
```

---

**✅ 简单三步：改配置 → 运行 → 看结果！**

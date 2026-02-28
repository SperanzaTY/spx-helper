# 🎯 Presto查询工具 - 完整方案总结

你现在有**3种方式**查询Presto！根据使用场景选择最合适的：

## 📊 三种方式对比

| 特性 | Chrome扩展 | 命令行版 | 配置文件版 ⭐ |
|------|-----------|---------|-------------|
| **文件** | `background.js` | `query_presto.py` | `simple_query.py` |
| **运行方式** | 扩展内部调用 | 命令行传参 | 修改配置运行 |
| **使用难度** | ⭐⭐⭐ | ⭐⭐ | ⭐ |
| **适用场景** | 扩展功能集成 | 脚本自动化 | 快速查询 |
| **需要参数** | 代码传递 | 命令行输入 | 文件配置 |
| **灵活性** | 高 | 高 | 中 |
| **上手速度** | 慢 | 中 | 快 |

---

## 方案1️⃣: Chrome扩展集成

### 📁 相关文件
- `background.js` - 包含 `QUERY_PRESTO` 处理器

### 🎯 适用场景
- 在Chrome扩展的其他功能中调用Presto查询
- 需要和扩展的其他功能联动
- 比如: API血缘查询时验证表是否存在

### 💡 使用方法

在扩展的任何地方调用：

```javascript
const result = await chrome.runtime.sendMessage({
  action: 'QUERY_PRESTO',
  username: 'tianyi.liang',
  password: '',  // 不需要
  sql: 'SELECT * FROM table LIMIT 10',
  queue: 'szsc-adhoc',
  region: 'SG'
});

if (result.success) {
  console.log('数据:', result.data.rows);
}
```

### ✅ 优点
- 集成在扩展内，无需外部工具
- 可以和扩展其他功能联动
- 用户无需离开浏览器

### ❌ 缺点
- 需要懂Chrome扩展开发
- 调试相对麻烦
- 只能在扩展环境使用

---

## 方案2️⃣: 命令行版 (query_presto.py)

### 📁 相关文件
- `query_presto.py` - 主程序
- `README_PRESTO_PYTHON.md` - 快速指南
- `PYTHON_QUERY_GUIDE.md` - 详细文档

### 🎯 适用场景
- 命令行环境使用
- 脚本自动化
- 需要灵活传参
- 和其他脚本配合

### 💡 使用方法

#### 命令行直接使用

```bash
# 基本查询
python3 query_presto.py "SELECT * FROM table LIMIT 10"

# 指定参数
python3 query_presto.py "SELECT * FROM table" \
  --queue szsc-adhoc \
  --region SG \
  --output result.csv

# 查看帮助
python3 query_presto.py --help
```

#### 在Python代码中导入

```python
from query_presto import PrestoQueryClient

client = PrestoQueryClient(
    personal_token='l7Vx4TGfwhmA1gtPn+JmUQ==',
    username='tianyi.liang'
)

result = client.query("SELECT * FROM table LIMIT 10")
print(result['rows'])
```

### ✅ 优点
- 功能完整，参数灵活
- 可以在命令行直接用
- 可以导入到其他Python脚本
- 适合自动化脚本

### ❌ 缺点
- 需要记住参数名
- 命令可能很长
- 每次都要输入完整命令

---

## 方案3️⃣: 配置文件版 (simple_query.py) ⭐ **推荐新手**

### 📁 相关文件
- `simple_query.py` - 主程序
- `SIMPLE_QUERY_GUIDE.md` - 使用指南

### 🎯 适用场景
- **快速查询数据** ⭐
- 不想记参数
- 重复查询同类SQL
- 新手友好

### 💡 使用方法

#### 只需3步

**1. 打开文件，修改配置**

```python
# 第15-40行的配置
USERNAME = 'tianyi.liang'
PERSONAL_TOKEN = 'l7Vx4TGfwhmA1gtPn+JmUQ=='

SQL = """
SELECT * 
FROM spx_mart.your_table 
LIMIT 10
"""

OUTPUT_FORMAT = 'table'  # table, json, csv, simple
OUTPUT_FILE = None       # 或 'result.json'
```

**2. 运行**

```bash
python3 simple_query.py
```

**3. 查看结果**

结果直接显示在终端！

### ✅ 优点
- **超级简单** - 改配置就能用
- 所有参数一目了然
- 适合反复修改SQL测试
- 新手友好，无需学命令

### ❌ 缺点
- 不如命令行版灵活
- 每次要改文件
- 不适合自动化脚本

---

## 🎯 使用建议

### 场景 → 方案选择

| 你想做什么 | 推荐方案 | 理由 |
|-----------|---------|------|
| 快速查看某个表数据 | **配置版** ⭐ | 改SQL就能看，最快 |
| 导出数据到CSV | **配置版** ⭐ | 设置OUTPUT_FILE即可 |
| 在扩展中验证表是否存在 | **扩展版** | 和扩展功能集成 |
| 写自动化脚本批量查询 | **命令行版** | 可以循环调用 |
| 定时任务查询数据 | **命令行版** | cron调用方便 |
| 不懂命令行，只想查数据 | **配置版** ⭐ | 最简单 |
| 需要在其他Python程序中用 | **命令行版** | 可以import |

---

## 📚 详细文档

### Chrome扩展版
- 查看 `PRESTO_SUCCESS.md` - 扩展中的实现总结

### 命令行版
- 查看 `README_PRESTO_PYTHON.md` - 快速开始
- 查看 `PYTHON_QUERY_GUIDE.md` - 详细文档

### 配置文件版
- 查看 `SIMPLE_QUERY_GUIDE.md` - 使用指南

---

## 🚀 快速开始示例

### 示例1: 我想快速查看一个表的数据

**推荐: 配置版**

```bash
# 1. 打开 simple_query.py
# 2. 改这一行:
SQL = "SELECT * FROM spx_mart.your_table LIMIT 10"
# 3. 运行:
python3 simple_query.py
```

### 示例2: 我要在扩展的API血缘功能中验证表

**推荐: 扩展版**

```javascript
// 在你的扩展代码中
async function verifyTable(tableName) {
  const result = await chrome.runtime.sendMessage({
    action: 'QUERY_PRESTO',
    username: 'tianyi.liang',
    sql: `SELECT 1 FROM ${tableName} LIMIT 1`,
    queue: 'szsc-adhoc',
    region: 'SG'
  });
  
  return result.success;
}
```

### 示例3: 我要写个脚本每天查询10个表的行数

**推荐: 命令行版**

```python
from query_presto import PrestoQueryClient

client = PrestoQueryClient(
    personal_token='l7Vx4TGfwhmA1gtPn+JmUQ==',
    username='tianyi.liang'
)

tables = ['table1', 'table2', 'table3', ...]

for table in tables:
    result = client.query(f"SELECT COUNT(*) FROM {table}")
    print(f"{table}: {result['rows'][0]} rows")
```

---

## 🎓 学习路径

### 🐣 新手 → 用配置版

1. 打开 `simple_query.py`
2. 看第15-40行的配置说明
3. 改SQL，运行
4. 慢慢熟悉各个参数

### 🚴 进阶 → 用命令行版

1. 学会基本命令: `python3 query_presto.py "SQL"`
2. 学会加参数: `--output result.csv`
3. 学会在Python中导入使用
4. 写自动化脚本

### 🚀 高级 → 用扩展版

1. 了解Chrome扩展架构
2. 在扩展功能中集成Presto查询
3. 和其他扩展功能联动

---

## ⚠️ 共同注意事项

所有方案都有这些限制和注意事项：

1. **2000行限制**: Personal SQL API每次最多返回2000行
2. **Token安全**: 不要把Token提交到Git
3. **邮箱格式**: 用户名会自动转为 `username@shopee.com`
4. **队列选择**:
   - Ad-hoc查询: `szsc-adhoc`
   - 定时任务: `szsc-scheduled`
5. **超时设置**: 复杂查询可能需要增加timeout

---

## 📖 总结

你现在有了**完整的Presto查询解决方案**：

✅ **在Chrome扩展中** → 使用 `background.js` 的 `QUERY_PRESTO`  
✅ **在命令行/脚本中** → 使用 `query_presto.py`  
✅ **快速查询** → 使用 `simple_query.py` ⭐ **最推荐新手**

**三种方案各有优势，根据场景选择最合适的！**

---

**🎉 现在你可以随心所欲地查询Presto了！**

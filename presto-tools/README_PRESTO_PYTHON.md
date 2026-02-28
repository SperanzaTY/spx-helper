# 🐍 Presto查询Python工具

一个独立的Python脚本，可以直接查询Presto数据库（通过Personal SQL API）。

## 🚀 快速开始

### 1. 安装依赖

```bash
pip3 install requests
```

### 2. 基本使用

```bash
# 查询表数据
python3 query_presto.py "SELECT * FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id LIMIT 10"

# 显示所有Catalog
python3 query_presto.py "SHOW CATALOGS"

# 显示所有表
python3 query_presto.py "SHOW TABLES IN spx_mart"
```

### 3. 保存结果

```bash
# 保存为JSON
python3 query_presto.py "SELECT * FROM table LIMIT 100" --output result.json

# 保存为CSV
python3 query_presto.py "SELECT * FROM table LIMIT 100" --output result.csv
```

## 📋 所有参数

```bash
python3 query_presto.py [SQL] [选项]

必需参数:
  SQL                   要执行的SQL查询语句

可选参数:
  -u, --username        用户名 (默认: tianyi.liang)
  -t, --token          Personal Token (默认: 已配置)
  -q, --queue          Presto队列 (默认: szsc-adhoc)
  -r, --region         IDC区域 (默认: SG)
  -p, --priority       优先级 1-5 (默认: 3)
  -c, --catalog        Catalog名称 (默认: hive)
  -s, --schema         Schema名称 (默认: shopee)
  -o, --output         输出文件路径 (.json 或 .csv)
  -m, --max-rows       最多显示行数 (默认: 20)
  --timeout            超时时间(秒) (默认: 300)
  -h, --help           显示帮助信息
```

## 📚 使用示例

### 查看数据库结构

```bash
# 查看所有catalog
python3 query_presto.py "SHOW CATALOGS"

# 查看所有schema
python3 query_presto.py "SHOW SCHEMAS FROM hive"

# 查看spx_mart下的所有表
python3 query_presto.py "SHOW TABLES IN spx_mart"

# 查看表结构
python3 query_presto.py "DESCRIBE spx_mart.dim_spx_lm_station_user_configuration_tab_id"
```

### 数据查询

```bash
# 基本查询
python3 query_presto.py "SELECT * FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id LIMIT 10"

# 统计行数
python3 query_presto.py "SELECT COUNT(*) as total FROM spx_mart.some_table"

# 分组统计
python3 query_presto.py "SELECT region, COUNT(*) as cnt FROM table GROUP BY region"

# 条件查询
python3 query_presto.py "SELECT * FROM table WHERE date = '2026-02-28' LIMIT 100"
```

### 高级用法

```bash
# 显示更多行
python3 query_presto.py "SELECT * FROM table LIMIT 100" --max-rows 100

# 指定不同的队列
python3 query_presto.py "SELECT * FROM table" --queue szsc-scheduled

# 增加超时时间
python3 query_presto.py "SELECT * FROM large_table" --timeout 600

# 保存结果到文件
python3 query_presto.py "SELECT * FROM table LIMIT 1000" -o result.csv
```

## 🔧 在代码中使用

可以在Python代码中导入使用：

```python
from query_presto import PrestoQueryClient

# 创建客户端
client = PrestoQueryClient(
    personal_token='l7Vx4TGfwhmA1gtPn+JmUQ==',
    username='tianyi.liang'
)

# 执行查询
result = client.query(
    sql='SELECT * FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id LIMIT 10',
    queue='szsc-adhoc',
    region='SG'
)

# 处理结果
print(f"列数: {len(result['columns'])}")
print(f"行数: {len(result['rows'])}")

# 遍历数据
for row in result['rows']:
    print(row)
```

## 📊 输出格式

### 命令行输出

```
============================================================
🚀 Presto查询工具 (Personal SQL API)
============================================================
📤 提交查询...
   Queue: szsc-adhoc
   Region: SG
   SQL: SELECT * FROM table LIMIT 10
✅ 查询已提交! jobId: 7a51fbc1-6eb1-4441-a875-29da83c863ff
⏳ 等待查询完成...
🔄 状态 (1): RUNNING
✅ 查询完成！(轮询 2 次)
📥 获取结果...
📊 查询结果: 11 列, 10 行

id | name | value | ...
-------------------
1  | foo  | bar   | ...

(10 rows)

✅ 查询成功! jobId: 7a51fbc1-6eb1-4441-a875-29da83c863ff
```

### JSON输出格式 (--output result.json)

```json
{
  "columns": ["id", "name", "value"],
  "rows": [
    {"id": "1", "name": "foo", "value": "bar"},
    {"id": "2", "name": "baz", "value": "qux"}
  ],
  "jobId": "7a51fbc1-6eb1-4441-a875-29da83c863ff",
  "engine": "PRESTO"
}
```

### CSV输出格式 (--output result.csv)

```csv
id,name,value
1,foo,bar
2,baz,qux
```

## ⚠️ 注意事项

1. **2000行限制**: Personal SQL API每次最多返回2000行
2. **Token安全**: 不要将Personal Token提交到Git
3. **队列选择**:
   - Ad-hoc查询: `szsc-adhoc`
   - 定时任务: `szsc-scheduled`
4. **超时设置**: 复杂查询可能需要更长时间，使用`--timeout`增加

## 🐛 常见问题

### 问: 提示"Invalid End-User provided"

**答**: 脚本会自动将用户名转换为邮箱格式，无需手动处理

### 问: 查询超时怎么办？

**答**: 使用`--timeout 600`增加超时时间到10分钟

### 问: 如何查询超过2000行的数据？

**答**: Personal SQL API有2000行限制，需要使用分页或在DataSuite平台查询

### 问: 如何获取Personal Token？

**答**: 登录DataSuite → 个人设置 → Personal Token

## 📁 文件说明

- `query_presto.py` - 主程序脚本
- `PYTHON_QUERY_GUIDE.md` - 详细使用指南
- `test_query.sh` - 快速测试脚本

## 🎯 典型使用场景

### 1. 快速验证表是否存在

```bash
python3 query_presto.py "SELECT 1 FROM spx_mart.some_table LIMIT 1"
```

### 2. 检查表的行数

```bash
python3 query_presto.py "SELECT COUNT(*) FROM spx_mart.some_table"
```

### 3. 查看最新数据

```bash
python3 query_presto.py "SELECT * FROM table ORDER BY create_time DESC LIMIT 10"
```

### 4. 导出数据到CSV

```bash
python3 query_presto.py "SELECT * FROM table WHERE date >= '2026-02-01'" -o data.csv
```

## 📖 更多信息

详细使用指南请查看: `PYTHON_QUERY_GUIDE.md`

---

**✅ 现在可以直接运行Python脚本查询Presto了！**

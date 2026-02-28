# Presto查询Python脚本使用指南

## 📦 安装依赖

```bash
pip install requests
```

## 🚀 快速开始

### 1. 基本查询

```bash
# 查询表数据
python query_presto.py "SELECT * FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id LIMIT 10"

# 显示所有Catalog
python query_presto.py "SHOW CATALOGS"

# 显示所有表
python query_presto.py "SHOW TABLES IN spx_mart"

# 查看表结构
python query_presto.py "DESCRIBE spx_mart.dim_spx_lm_station_user_configuration_tab_id"
```

### 2. 保存结果

```bash
# 保存为JSON
python query_presto.py "SELECT * FROM table LIMIT 100" --output result.json

# 保存为CSV
python query_presto.py "SELECT * FROM table LIMIT 100" --output result.csv
```

### 3. 自定义参数

```bash
# 指定队列和区域
python query_presto.py "SELECT * FROM table" --queue szsc-adhoc --region SG

# 指定优先级（1-5，数字越小优先级越高）
python query_presto.py "SELECT * FROM table" --priority 2

# 指定catalog和schema
python query_presto.py "SELECT * FROM table" --catalog hive --schema dev_spx_mart

# 显示更多行数
python query_presto.py "SELECT * FROM table" --max-rows 50

# 设置超时时间
python query_presto.py "SELECT * FROM table" --timeout 600
```

### 4. 在代码中使用

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

# 获取结果
print(f"列数: {len(result['columns'])}")
print(f"行数: {len(result['rows'])}")
print(f"jobId: {result['jobId']}")

# 遍历数据
for row in result['rows']:
    print(row)
```

## 📋 所有参数说明

| 参数 | 简写 | 默认值 | 说明 |
|------|------|--------|------|
| `sql` | - | (必填) | SQL查询语句 |
| `--username` | `-u` | `tianyi.liang` | 用户名 |
| `--token` | `-t` | `l7Vx4TGfwhmA1gtPn+JmUQ==` | Personal Token |
| `--queue` | `-q` | `szsc-adhoc` | Presto队列 |
| `--region` | `-r` | `SG` | IDC区域 |
| `--priority` | `-p` | `3` | 优先级(1-5) |
| `--catalog` | `-c` | `hive` | Catalog名称 |
| `--schema` | `-s` | `shopee` | Schema名称 |
| `--output` | `-o` | 无 | 输出文件(.json/.csv) |
| `--max-rows` | `-m` | `20` | 最多显示行数 |
| `--timeout` | - | `300` | 最大等待时间(秒) |

## 🔍 常用查询示例

### 查看数据库和表

```bash
# 查看所有catalog
python query_presto.py "SHOW CATALOGS"

# 查看指定catalog下的所有schema
python query_presto.py "SHOW SCHEMAS FROM hive"

# 查看指定schema下的所有表
python query_presto.py "SHOW TABLES IN spx_mart"

# 查看表结构
python query_presto.py "DESCRIBE spx_mart.dim_spx_lm_station_user_configuration_tab_id"

# 查看表的创建语句
python query_presto.py "SHOW CREATE TABLE spx_mart.dim_spx_lm_station_user_configuration_tab_id"
```

### 数据查询

```bash
# 查询前10行
python query_presto.py "SELECT * FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id LIMIT 10"

# 统计行数
python query_presto.py "SELECT COUNT(*) FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id"

# 分组统计
python query_presto.py "SELECT region, COUNT(*) as cnt FROM spx_mart.some_table GROUP BY region"

# 条件查询
python query_presto.py "SELECT * FROM spx_mart.some_table WHERE date = '2026-02-28'"
```

## ⚠️ 注意事项

1. **2000行限制**: Personal SQL API每次查询最多返回2000行
2. **超时设置**: 复杂查询可能需要更长时间，使用`--timeout`增加超时时间
3. **Token安全**: 不要将Personal Token提交到Git仓库
4. **队列选择**: 
   - Ad-hoc查询使用 `szsc-adhoc`
   - 定时任务使用 `szsc-scheduled`

## 🛠️ 高级用法

### 批量查询多个表

```python
from query_presto import PrestoQueryClient

client = PrestoQueryClient(
    personal_token='l7Vx4TGfwhmA1gtPn+JmUQ==',
    username='tianyi.liang'
)

tables = [
    'spx_mart.table1',
    'spx_mart.table2',
    'spx_mart.table3'
]

for table in tables:
    print(f"\n查询表: {table}")
    try:
        result = client.query(f"SELECT COUNT(*) as cnt FROM {table}")
        print(f"行数: {result['rows'][0]['cnt']}")
    except Exception as e:
        print(f"查询失败: {e}")
```

### 数据验证

```python
# 验证表是否存在
def table_exists(client, table_name):
    try:
        result = client.query(f"SELECT 1 FROM {table_name} LIMIT 1")
        return True
    except:
        return False

# 获取表的列信息
def get_table_columns(client, table_name):
    result = client.query(f"DESCRIBE {table_name}")
    columns = []
    for row in result['rows']:
        columns.append({
            'name': row.get('Column'),
            'type': row.get('Type'),
            'comment': row.get('Comment')
        })
    return columns
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
   SQL: SELECT * FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id LIMIT 10
✅ 查询已提交! jobId: 7a51fbc1-6eb1-4441-a875-29da83c863ff
⏳ 等待查询完成...
🔄 状态 (1): RUNNING
🔄 状态 (2): RUNNING
✅ 查询完成！(轮询 7 次)
📥 获取结果...
📊 查询结果: 11 列, 10 行

id | name | value | ...
-------------------
1  | foo  | bar   | ...
2  | baz  | qux   | ...

(10 rows)

✅ 查询成功! jobId: 7a51fbc1-6eb1-4441-a875-29da83c863ff
```

### JSON输出格式

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

### CSV输出格式

```csv
id,name,value
1,foo,bar
2,baz,qux
```

## 🐛 故障排除

### 错误: "Invalid End-User provided"

**原因**: X-End-User必须是邮箱格式

**解决**: 脚本会自动将用户名转换为邮箱格式（加上@shopee.com）

### 错误: "查询超时"

**原因**: 查询时间超过了设置的超时时间

**解决**: 增加超时时间 `--timeout 600`

### 错误: "提交查询失败: 401"

**原因**: Personal Token无效或过期

**解决**: 从DataSuite重新获取Personal Token

### 错误: "查询失败: SYNTAX_ERROR"

**原因**: SQL语法错误

**解决**: 检查SQL语法，可以先在DataSuite平台测试

## 📚 更多资源

- DataSuite文档: https://datasuite.shopee.io
- Personal SQL API文档: https://datasuite.shopee.io/forum/article/detail/a39b7c7d4d8d45e6be83d13db72aeb59
- Presto SQL语法: https://trino.io/docs/current/sql.html

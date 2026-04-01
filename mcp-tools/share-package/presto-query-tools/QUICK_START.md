# 5分钟快速上手 ⚡

## 方式1: Python脚本（最快）

### 步骤1: 获取Token (1分钟)
1. 打开 https://datasuite.shopee.io/dataservice/ds_api_management
2. 左上角三个横线菜单（☰）→ 获取Personal Token
3. 复制token

### 步骤2: 修改配置 (1分钟)
```bash
# 用文本编辑器打开 simple_query.py
# 修改这几行:

USERNAME = 'tianyi.liang'                    # 改成你的用户名
PERSONAL_TOKEN = 'your_token_here'           # 粘贴你的token
SQL = "SELECT * FROM your_table LIMIT 10"    # 改成你要查询的SQL
```

### 步骤3: 运行 (30秒)
```bash
pip3 install requests
python3 simple_query.py
```

**完成！** 查询结果会显示在终端。

---

## 方式2: MCP工具（推荐）

### 步骤1: 安装 (2分钟)
```bash
./install_mcp.sh
# 按提示输入token和用户名
```

### 步骤2: 重启Cursor (30秒)
完全退出Cursor后重新打开

### 步骤3: 使用 (1分钟)
在Cursor中对AI说：
```
"查询 spx_mart.dim_station 表的数据"
```

**完成！** AI会自动查询并显示结果。

---

## 🎯 最简示例

### Python脚本示例
```python
# simple_query.py 的配置部分
USERNAME = 'tianyi.liang'
PERSONAL_TOKEN = 'l7Vx4TGfwhmA1gtPn+JmUQ=='
SQL = "SELECT station_id, station_name FROM spx_mart.dim_station LIMIT 5"
OUTPUT_FORMAT = 'table'  # 或 'json', 'csv'
```

运行：
```bash
python3 simple_query.py
```

### MCP工具示例对话
```
你: 查询订单表的最新10条记录
AI: [调用工具查询] 
    以下是查询结果：
    [表格形式显示数据]

你: 分析一下这些数据的特点
AI: [基于查询结果进行分析]
```

---

## ❓ 遇到问题？

### Token错误
```bash
❌ 401 Unauthorized
✅ 解决: 重新从DataSuite获取token
```

### SQL语法错误
```bash
❌ 400 Bad Request
✅ 解决: 检查SQL语法，必须是SELECT语句
```

### MCP无法使用
```bash
❌ 工具不可用
✅ 解决: 
   1. pip3 install mcp requests
   2. 重启Cursor
   3. 检查 ~/.cursor/mcp.json
```

---

## 📚 下一步

- 详细使用: `SIMPLE_QUERY_GUIDE.md`
- MCP完整手册: `PRESTO_MCP_README.md`
- 完整README: `README.md`

Happy Querying! 🚀

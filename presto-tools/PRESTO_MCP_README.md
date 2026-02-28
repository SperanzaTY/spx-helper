# Presto MCP Server

为Cursor提供Presto查询能力的MCP服务器。

## 功能

- 🔍 在Cursor中直接查询Presto数据库
- 📊 结果以表格形式展示
- 🤖 让AI直接分析查询结果
- ⚡ 支持自定义队列、区域等参数

## 安装

### 1. 安装依赖

```bash
pip3 install mcp requests
```

### 2. 获取Personal Token

1. 登录 [DataSuite](https://datasuite.shopee.io)
2. 点击右上角头像 → **Personal Token**
3. 复制你的token

### 3. 配置Cursor

在 `~/.cursor/mcp.json` 中添加配置：

```json
{
  "mcpServers": {
    "presto-query": {
      "command": "python3",
      "args": [
        "/path/to/presto_mcp_server.py"
      ],
      "env": {
        "PRESTO_PERSONAL_TOKEN": "你的Personal Token",
        "PRESTO_USERNAME": "你的用户名"
      }
    }
  }
}
```

**重要**: 
- 将 `/path/to/presto_mcp_server.py` 替换为实际路径
- 将 `你的Personal Token` 替换为从DataSuite获取的token
- 将 `你的用户名` 替换为你的用户名（不需要@shopee.com后缀）

详细配置说明见: [PRESTO_MCP_CONFIG_GUIDE.md](./PRESTO_MCP_CONFIG_GUIDE.md)

### 4. 重启Cursor

重启Cursor后，MCP工具就可以使用了。

## 使用方法

### 在Cursor中使用

直接在对话中询问AI：

```
请查询 spx_mart.dim_spx_lm_station_user_configuration_tab_id 表的前10行数据
```

```
帮我统计一下 spx_mart.some_table 表有多少行
```

```
查询 spx_mart.some_table 表中 station_id = '12345' 的数据
```

AI会自动调用 `query_presto` 工具执行查询并分析结果。

### 工具参数

- **sql** (必需): SQL查询语句
- **username** (可选): 用户名，默认 'tianyi.liang'
- **queue** (可选): 队列，默认 'szsc-adhoc'
  - `szsc-adhoc`: Ad-hoc查询
  - `szsc-scheduled`: 定时任务
- **region** (可选): IDC集群，默认 'SG'
  - `SG`: 新加坡
  - `US`: 美国
- **max_rows** (可选): 最多返回行数，默认 100，最大 2000

### 示例对话

**你**: "帮我查询一下配置表的数据"

**AI**: 会自动调用工具：
```
query_presto(
  sql="SELECT * FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id LIMIT 10"
)
```

**AI**: 返回结果并分析：
```
✅ 查询成功

列数: 11
总行数: 10

查询结果:
[表格展示]

分析: 从数据可以看出...
```

## 支持的查询类型

### ✅ 支持

- `SELECT * FROM table LIMIT 100`
- `SELECT COUNT(*) FROM table`
- `SELECT col1, col2 FROM table WHERE condition`
- `SELECT col, COUNT(*) FROM table GROUP BY col`

### ❌ 不支持

- `SHOW CATALOGS` (可能被拒绝)
- `SHOW TABLES` (可能被拒绝)
- `INSERT/UPDATE/DELETE` (只读API)

## 注意事项

1. **查询限制**: Personal SQL API限制每次最多返回2000行
2. **超时时间**: 查询最多等待5分钟
3. **只读查询**: 只支持SELECT查询
4. **Token安全**: Personal Token已硬编码在脚本中

## 故障排除

### MCP工具没有出现

1. 检查配置文件路径是否正确
2. 确认Python脚本路径正确
3. 查看Cursor的MCP日志

### 查询失败

1. 检查SQL语法是否正确
2. 确认表名和列名是否存在
3. 查看错误信息中的Job ID

### 权限错误

1. 确认Personal Token是否有效
2. 检查用户名是否正确

## 高级使用

### 多步骤分析

```
1. 查询表数据
2. 统计某个字段的分布
3. 分析异常值
```

AI会自动执行多次查询并综合分析。

### 数据探索

```
帮我探索一下这个表的数据结构和内容分布
```

AI会查询表结构、样本数据、统计信息等。

### 问题排查

```
帮我查一下为什么station_id=12345的配置没有生效
```

AI会查询相关数据并分析可能的原因。

## 配置Token

如需更新Personal Token，编辑 `presto_mcp_server.py` 中的 `PERSONAL_TOKEN` 变量：

```python
PERSONAL_TOKEN = 'your_new_token'
```

## 更新

```bash
cd /Users/tianyi.liang/.cursor/worktrees/SPX_Helper/sri
git pull
```

## 相关文件

- `presto_mcp_server.py` - MCP服务器主程序
- `simple_query.py` - 独立查询脚本
- `query_presto.py` - 命令行查询工具

---

**现在你可以在Cursor中直接让AI查询Presto并分析数据了！** 🎉

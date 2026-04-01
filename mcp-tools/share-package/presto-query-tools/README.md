# Presto查询工具 - 快速上手指南

这是一套简单易用的Presto数据查询工具，包含Python脚本和Cursor MCP集成。

## 🎯 包含内容

### 1️⃣ Python查询脚本
- `simple_query.py` - 配置式查询工具，修改配置直接运行

### 2️⃣ Cursor MCP工具
- `presto_mcp_server.py` - MCP服务器，让AI在Cursor中直接查询Presto
- `install_mcp.sh` - 自动安装脚本
- `mcp_config_template.json` - 配置模板

### 3️⃣ 文档
- `SIMPLE_QUERY_GUIDE.md` - Python脚本详细使用指南
- `PRESTO_MCP_README.md` - MCP工具完整文档

## 🚀 快速开始

### 方式1: 使用Python脚本（最简单）

**适合场景**: 快速查询数据，不需要AI辅助

1. **获取Personal Token**
   - 访问 https://datasuite.shopee.io/dataservice/ds_api_management
   - 点击右上角头像 → Personal Token
   - 复制token

2. **修改配置**
   ```bash
   # 编辑 simple_query.py
   USERNAME = 'your.username'           # 你的用户名
   PERSONAL_TOKEN = 'your_token_here'   # 你的token
   SQL = "SELECT * FROM table LIMIT 10" # 你的SQL查询
   ```

3. **安装依赖并运行**
   ```bash
   pip3 install requests
   python3 simple_query.py
   ```

### 方式2: 使用MCP工具（推荐）

**适合场景**: 在Cursor中让AI帮你查询和分析数据

1. **运行安装脚本**
   ```bash
   ./install_mcp.sh
   ```

2. **按提示输入**
   - Personal Token（从DataSuite获取）
   - 用户名

3. **重启Cursor**

4. **在Cursor中使用**
   ```
   你: "查询 spx_mart.dim_station 表的前10条数据"
   AI: [自动调用MCP工具查询并显示结果]
   ```

## 📝 配置说明

### Personal Token获取步骤

1. 访问 https://datasuite.shopee.io/dataservice/ds_api_management
2. 点击页面左上角的三个横线菜单（☰）
3. 在展开的菜单中选择"获取Personal Token"
4. 复制或生成新的token
5. **重要**: 不要分享你的token！

### 常用参数

- **queue**: 队列选择
  - `szsc-adhoc` - 临时查询（默认，推荐）
  - `szsc-scheduled` - 定时任务
  
- **region**: IDC集群
  - `SG` - 新加坡（默认）
  - `US` - 美国

## ⚠️ 重要提示

### 安全注意事项

1. **不要分享Personal Token** - 这是你的个人凭证
2. **不要提交到Git** - token应该保存在本地配置中
3. **定期更换token** - 建议每3-6个月更换一次

### 使用限制

1. **查询限制**: Personal SQL API单次最多返回2000行
2. **只读查询**: 只支持SELECT语句，不支持INSERT/UPDATE/DELETE
3. **队列资源**: 建议使用`szsc-adhoc`队列进行临时查询

## 📖 详细文档

- **Python脚本详细使用**: 查看 `SIMPLE_QUERY_GUIDE.md`
- **MCP工具完整手册**: 查看 `PRESTO_MCP_README.md`

## 🐛 常见问题

### 1. 401 Unauthorized错误
- 检查Personal Token是否正确
- 确认token未过期
- 重新从DataSuite获取token

### 2. 400 Bad Request错误
- 检查SQL语法
- 确认使用SELECT语句（不支持SHOW等命令）
- 确认表名和字段名正确

### 3. MCP工具无法使用
- 确认已重启Cursor
- 检查 `~/.cursor/mcp.json` 配置
- 确认Python依赖已安装：`pip3 install mcp requests`

### 4. 查询超时
- 简化查询语句
- 添加LIMIT限制返回行数
- 检查网络连接

## 💡 使用技巧

### Python脚本技巧

1. **修改输出格式**
   ```python
   OUTPUT_FORMAT = 'table'  # 表格格式（默认）
   OUTPUT_FORMAT = 'json'   # JSON格式
   OUTPUT_FORMAT = 'csv'    # CSV格式
   ```

2. **调整返回行数**
   ```python
   MAX_ROWS = 100  # 最多显示100行
   ```

### MCP工具技巧

1. **让AI分析数据**
   ```
   "查询用户配置表，并分析数据分布"
   ```

2. **组合多个查询**
   ```
   "分别查询订单表和用户表，找出关联关系"
   ```

3. **数据导出**
   ```
   "查询数据并帮我生成CSV格式"
   ```

## 🔗 相关链接

- DataSuite: https://datasuite.shopee.io/dataservice/ds_api_management
- SPX Helper项目: https://github.com/SperanzaTY/spx-helper

## 📞 获取帮助

如有问题，可以：
1. 查看详细文档（`SIMPLE_QUERY_GUIDE.md` 和 `PRESTO_MCP_README.md`）
2. 联系工具提供者
3. 查看项目仓库的issues

---

**版本**: v1.0  
**更新日期**: 2026-02-28  
**适用于**: Python 3.6+ / Cursor IDE

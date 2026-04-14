# Presto查询工具集

这是一套独立的Presto查询工具，用于辅助日常工作中的数据查询和分析。

## 📦 工具列表

### 1. MCP工具（推荐）

让AI在Cursor中直接查询Presto数据库。

**MCP 参数名**：工具 **`query_presto`** 的 SQL 参数名为 **`sql`**（勿写成 `query`）。权限类错误（如对 `information_schema` 无权限）需在血缘或目标库表上换用可执行的 `DESCRIBE` / `SELECT ... LIMIT`。Agent 排查顺序见仓库 **`docs/guides/MCP_TOOLS.md`** 章节 **「Agent triage: MCP and query failures」**。

**核心文件:**
- `presto_mcp_server.py` - MCP服务器
- `presto_query_tool.py` - `PrestoQueryTool` 类（平台 Agent / 非 MCP Python 集成，直连 Personal API）
- `install_mcp.sh` - 自动安装脚本
- `mcp_config_template.json` - 配置模板

**文档:**
- `PRESTO_MCP_README.md` - 使用手册
- `PRESTO_MCP_CONFIG_GUIDE.md` - 配置指南
- `PRESTO_MCP_SHARING_GUIDE.md` - 团队分享指南
- `PRESTO_MCP_TEST_GUIDE.md` - 测试指南

**使用方式:**
```bash
# 安装
./install_mcp.sh

# 配置后重启Cursor，然后在对话中:
"请查询 spx_mart.xxx 表的数据"
```

### 2. 简化版查询脚本

最简单的使用方式，修改配置直接运行。

**文件:**
- `simple_query.py` - 配置式查询工具

**文档:**
- `SIMPLE_QUERY_GUIDE.md` - 使用指南

**使用方式:**
```python
# 1. 编辑 simple_query.py，修改配置
SQL = "SELECT * FROM table LIMIT 10"
OUTPUT_FORMAT = 'table'

# 2. 运行
python3 simple_query.py
```

### 3. 命令行查询工具

功能完整的命令行工具，支持各种参数。

**文件:**
- `query_presto.py` - 命令行工具

**文档:**
- `PYTHON_QUERY_GUIDE.md` - 详细文档

**使用方式:**
```bash
# 基本查询
python3 query_presto.py "SELECT * FROM table LIMIT 10"

# 保存为CSV
python3 query_presto.py "SELECT * FROM table" --output result.csv

# 查看帮助
python3 query_presto.py --help
```

### 4. 代码集成示例

演示如何在Python代码中使用。

**文件:**
- `example_use_in_code.py` - 集成示例

### 5. PrestoQueryTool 类（平台 Agent）

面向需在 **非 Cursor MCP** 环境（自建 Agent、批跑脚本等）复用同一 DataSuite Personal SQL 流程的场景。

**文件:** `presto_query_tool.py`

**用法概要:** 构造 `PrestoQueryTool(personal_token=..., username=...)` 后调用 `execute(sql, queue=..., region=..., ...)`；返回字典含 `success`、`columns`、`rows`、`error` 等。Token 与用户名由调用方从环境变量或密钥系统读取，**勿写入仓库**。

## 🚀 快速开始

### 方式1: 使用MCP工具（最推荐）

```bash
# 1. 安装
./install_mcp.sh

# 2. 输入你的token和用户名

# 3. 重启Cursor

# 4. 在对话中使用
"查询xxx表的数据"
```

### 方式2: 使用简化版脚本

```bash
# 1. 编辑simple_query.py配置
vim simple_query.py

# 2. 运行
python3 simple_query.py
```

### 方式3: 使用命令行工具

```bash
python3 query_presto.py "你的SQL查询"
```

## 📤 MCP `query_presto`：长单元格与落盘（v1.1+）

历史行为曾将**每个单元格固定截断为 50 字符**，血缘类大字段在对话里不可读。已优化为：

| 参数 / 环境变量 | 说明 |
|-----------------|------|
| `cell_max_len` | **默认 0** = 表格展示**不截断**；设为 `50`–`120` 可缩短 MCP 返回体积。 |
| `write_full_result_to` | 传入相对或绝对路径（如 `docs/investigations/presto_lineage.json`），将 **完整** 结果写入 UTF-8 JSON（`columns` + `rows` + `jobId`），对话中仅保留短预览表。后续用脚本读文件合并或写 Google Sheet。 |
| `PRESTO_MCP_OUTPUT_DIR` | 可选；`write_full_result_to` 为**相对路径**时的基准目录（未设则用 MCP 进程当前工作目录，一般为 Cursor 工作区根）。 |

**仍可能受限**：宿主对单条 MCP 消息的长度限制；超大结果务必使用 `write_full_result_to` 或命令行 `query_presto.py --output`。

## 📋 依赖安装

所有工具都需要安装以下依赖：

```bash
pip3 install requests

# MCP工具额外需要:
pip3 install mcp
```

## 🔑 配置说明

所有工具都需要：
1. **Personal Token** - 从 [DataSuite API 管理](https://datasuite.shopee.io/dataservice/ds_api_management) 获取
2. **用户名** - 你的用户名

### 获取Personal Token

1. 访问 https://datasuite.shopee.io/dataservice/ds_api_management
2. 点击页面左上角的三个横线菜单（☰）
3. 在展开的菜单中选择"获取Personal Token"
4. 复制token

## 📖 详细文档

- **MCP工具**: 查看 `PRESTO_MCP_README.md`
- **简化脚本**: 查看 `SIMPLE_QUERY_GUIDE.md`
- **命令行工具**: 查看 `PYTHON_QUERY_GUIDE.md`
- **配置指南**: 查看 `PRESTO_MCP_CONFIG_GUIDE.md`
- **分享指南**: 查看 `PRESTO_MCP_SHARING_GUIDE.md`

## 🎯 工具对比

| 特性 | MCP工具 | 简化脚本 | 命令行工具 |
|------|---------|----------|-----------|
| **易用性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **灵活性** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **AI集成** | ✅ | ❌ | ❌ |
| **自动化** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **适用场景** | 日常查询 | 快速查询 | 脚本集成 |

## 🔐 安全提醒

1. **不要分享token** - Personal Token是你的个人凭证
2. **不要提交配置** - 包含token的配置文件不要提交到Git
3. **定期更换** - 建议定期更换token

## 🤝 团队使用

如果要分享给团队成员：

1. 分享整个 `presto-tools` 目录
2. 让每个人配置自己的token
3. 参考 `PRESTO_MCP_SHARING_GUIDE.md`

## ⚙️ 配置参数说明

### 常用参数

- **username**: 用户名（会自动转为邮箱格式）
- **token**: Personal Token
- **queue**: Presto队列
  - `szsc-adhoc` - Ad-hoc查询（默认）
  - `szsc-scheduled` - 定时任务
- **region**: IDC集群
  - `SG` - 新加坡（默认）
  - `US` - 美国

## 🐛 故障排除

### Token无效
- 检查token是否正确
- 重新从DataSuite获取

### 查询失败
- 检查SQL语法
- 确认表名存在
- 查看详细错误信息

### MCP工具不可用
- 确认已重启Cursor
- 检查 `~/.cursor/mcp.json` 配置
- 查看Cursor的MCP日志

### MCP 启动失败：`PydanticUserError: result = <class 'str'>`
- 已在本仓库将 `query_presto` 的返回注解改为 `Any`，以兼容 **FastMCP + Pydantic 2.10**（裸 `-> str` 会触发该错误）。
- 若你本地仍用旧版 `presto_mcp_server.py`，请 `git pull` 后重启 Cursor。

## 📝 更新日志

### v1.2 (2026-04-14)

- 新增 `presto_query_tool.py`：`PrestoQueryTool` 类，供平台 Agent 等 Python 集成。

### v1.1 (2026-03-05)
- MCP：取消固定 50 字单元格截断；默认 `cell_max_len=0`；新增 `write_full_result_to` 落盘完整 JSON。

### v1.0 (2026-02-28)
- ✅ 创建MCP工具
- ✅ 支持环境变量配置
- ✅ 添加简化版和命令行版工具
- ✅ 完善文档

## 🔗 相关链接

- DataSuite: https://datasuite.shopee.io/dataservice/ds_api_management
- Personal SQL API文档: (内部文档链接)

---

**注意**: 这些工具独立于SPX Helper扩展，是辅助性的数据查询工具。

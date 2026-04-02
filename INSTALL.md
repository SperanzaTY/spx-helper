# SPX Helper 安装指南

> **给 Cursor AI 看的安装指南**：用户克隆项目后，把这个文件发给 Cursor AI 或者说"帮我安装 SPX Helper"即可。
> AI 会介绍项目功能，让用户选择需要安装的模块，然后按步骤完成安装。

---

## 项目简介

SPX Helper 是一套为 Shopee 大数据开发工程师打造的效率工具集，包含 **三个独立模块**，可以按需安装：

| 模块 | 说明 | 适合谁 |
|------|------|--------|
| **A. MCP 工具套件** | 让 Cursor AI 能直接查 Presto/Spark/ClickHouse、追踪 API 血缘、查询 Scheduler 任务状态 | 所有使用 Cursor 的开发者 |
| **B. SeaTalk Agent** | 把 Cursor AI 注入 SeaTalk 桌面客户端，在聊天中直接与 AI 对话、引用消息排查问题 | 想在 SeaTalk 里用 AI 的人 |
| **C. Chrome 扩展** | 快速链接、API 数据溯源、日程管理、SQL/HTTP/正则等实用小工具 | 日常浏览器使用 |

> **依赖关系**：B 依赖 A（SeaTalk Agent 需要 MCP 工具才能查数据）。A 和 C 互相独立。

---

## 安装前：确认你需要什么

请根据你的需求选择：

- **只需要 AI 查数据**（Presto/CK/Spark） → 安装 **A**
- **想在 SeaTalk 里用 AI** → 安装 **A + B**
- **只需要 Chrome 浏览器工具** → 安装 **C**
- **全部都要** → 安装 **A + B + C**

---

## 通用步骤：克隆项目

所有模块共用同一个仓库：

```bash
# GitLab（推荐，公司内网更快）
git clone https://git.garena.com/tianyi.liang/spx-helper.git

# 或 GitHub
git clone https://github.com/SperanzaTY/spx-helper.git
```

如果之前已经有旧版本：

```bash
cd spx-helper
git checkout release
git pull origin release
```

克隆完成后，启用项目级 Git hooks（推送前自动检查版本号和发版日志）：

```bash
cd spx-helper
git config core.hooksPath .githooks
```

---

## 模块 A：MCP 工具套件

让 Cursor AI 能直接查数据库、分析 API 血缘、查询 Scheduler 任务。

### A.1 前置条件

```bash
# 检查 Python（需要 3.10+）
python3 --version

# 安装 uv（Python 包管理器）— 如果没有
curl -LsSf https://astral.sh/uv/install.sh | sh
# 安装后必须重启终端
```

### A.2 准备凭证

| 凭证 | 获取方式 |
|------|---------|
| **Presto Personal Token** | https://datasuite.shopee.io/dataservice/ds_api_management → 左上角 ☰ → Personal Token |
| **Shopee 用户名** | 你的 Shopee 用户名（**不是邮箱**），格式如 `john.doe`，即邮箱 `@shopee.com` 前面的部分 |
| **DMP 用户名/密码**（可选，Spark 用） | https://datasuite.shopee.io → 右上角头像 → **RAM** → Profile → BigData Account（用户名和密码点 View 查看） |
| **InfraBot Token**（可选，seatalk-group 用） | 找 @tianyi.liang 获取，或自行在 [InfraBot API Playground](https://space.shopee.io/utility/seatalkbot/api-playground) 申请 |

> **注意**：Presto 的用户名和 DMP 的用户名可能不同。Presto 用的是 Shopee 用户名（如 `john.doe`），DMP 用的是 BigData Account 里显示的用户名。

### A.3 配置 MCP

打开或创建 `~/.cursor/mcp.json`：

```bash
mkdir -p ~/.cursor
cursor ~/.cursor/mcp.json
```

写入以下内容（**替换占位符**）。

下面先给一个**已填写好的示例**（用代称 `john.doe` 代替真实信息），帮你理解每个字段应该填什么：

```
✅ 正确示例（供参考，不要直接复制）：

  "PRESTO_PERSONAL_TOKEN": "eyJhbGciOiJS...很长的一串Token"    ← DataSuite 生成的 Token
  "PRESTO_USERNAME":       "john.doe"                          ← Shopee 用户名，不是邮箱
  "LIVY_USERNAME":         "john.doe_bigdata"                  ← DMP BigData Account 的用户名（RAM → Profile 查看）
  "LIVY_PASSWORD":         "MyBigData@2026"                    ← DMP BigData Account 的密码（RAM → Profile → View）
  "INFRABOT_TOKEN":        "infrabot.xxxxxxxxxxxxxxxx"         ← InfraBot Token（找 tianyi 要）
```

实际配置模板：

```json
{
  "mcpServers": {
    "presto-query": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/presto-query",
        "presto-query-mcp"
      ],
      "env": {
        "PRESTO_PERSONAL_TOKEN": "替换为你的Token",
        "PRESTO_USERNAME": "替换为你的用户名"
      }
    },
    "ck-query": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/ck-query",
        "ck-query-mcp"
      ]
    },
    "spark-query": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/spark-query",
        "spark-query-mcp"
      ],
      "env": {
        "LIVY_USERNAME": "替换为DMP用户名",
        "LIVY_PASSWORD": "替换为DMP密码"
      }
    },
    "api-trace": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/api-trace",
        "api-trace-mcp"
      ],
      "env": {
        "PRESTO_PERSONAL_TOKEN": "替换为你的Token",
        "PRESTO_USERNAME": "替换为你的用户名"
      }
    },
    "seatalk-reader": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/seatalk-reader",
        "seatalk-reader-mcp"
      ]
    },
    "scheduler-query": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/scheduler-query",
        "scheduler-mcp"
      ]
    },
    "seatalk-group": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/seatalk-group",
        "seatalk-group-mcp"
      ],
      "env": {
        "INFRABOT_TOKEN": "替换为InfraBot Token"
      }
    }
  }
}
```

**需要替换的内容**：

| 占位符 | 格式 | 获取位置 |
|--------|------|----------|
| `替换为你的Token` | `eyJhbGci...`（很长的字符串） | DataSuite → ☰ → Personal Token |
| `替换为你的用户名` | `john.doe`（**不是邮箱**，不带 `@shopee.com`） | 你的 Shopee 用户名 |
| `替换为DMP用户名` | `john.doe_bigdata` 或类似 | DataSuite → RAM → Profile → BigData Account |
| `替换为DMP密码` | 密码字符串 | 同上，点 View 查看密码 |
| `替换为InfraBot Token` | `infrabot.xxxx`（找 @tianyi.liang 获取） | 不用批量拉群可不填 |

### A.4 验证

1. 重启 Cursor
2. `Cmd + Shift + J` → MCP → 检查各工具状态是否为绿点
3. 在 Agent 模式输入测试：`查询 spx_mart.dim_station 表最近一天的数据量`

---

## 模块 B：SeaTalk Agent

把 Cursor AI 注入 SeaTalk 桌面客户端。**需要先完成模块 A**。

### B.1 前置条件

```bash
# Node.js（需要 v22+）
node --version
# 如果没有或版本低：brew install node

# Cursor Agent CLI（必须！启动时会自动检测）
agent --version
# 如果没有：Cursor → Cmd+Shift+P → 输入 "Install 'agent' command" → 回车
# 或手动安装：curl -fsSL https://cursor.sh/install-agent | bash
```

> Agent 启动时会自动检测 `agent` 命令是否可用。如果未安装，会在 SeaTalk 面板中显示详细的安装指引，不需要手动排查。

### B.2 安装

```bash
cd spx-helper/seatalk-agent
npm install
bash install.sh
```

### B.3 重启终端并启动

```bash
# 关闭当前终端，打开新终端
seatalk
```

等待出现以下日志：

```
[agent] connected: SeaTalk (https://web.haiserve.com/)
[agent] SPA ready
[agent] injection complete!
[agent] ACP agent connected
```

### B.4 验证

- SeaTalk 左侧出现 ✦ 星形图标
- 点击打开 AI 面板
- 输入"你好"测试

### B.5 日常使用

- 终端输入 `seatalk` 一键启动
- 或者直接打开 SeaTalk（CDP 守护进程会自动处理）

### B.6 自动更新

Agent 内置了版本检查和一键更新功能：

1. 打开 AI 面板，状态栏会显示当前版本号
2. 有新版本时，版本徽章旁会出现更新提示
3. 点击"应用更新"，Agent 自动拉取最新代码并重启
4. 通过 `seatalk` 命令或安装脚本启动时，更新后会自动重启（exit code 42 触发重启循环）

> 如果用 `npm start` 或 `npx tsx src/main.ts` 开发模式启动，更新后需要手动重新运行。

---

## 模块 C：Chrome 扩展

浏览器工具集，独立安装即可。

### C.1 安装

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角 **"开发者模式"**
3. 点击 **"加载已解压的扩展程序"**
4. 选择 `spx-helper/chrome-extension/` 目录

### C.2 验证

点击 Chrome 工具栏上的 SPX Helper 图标，打开弹出面板。

---

## 升级指南（已有旧版本的用户）

### 拉取最新代码

```bash
cd spx-helper
git checkout release
git pull origin release
```

### 重装 SeaTalk Agent（如果之前安装过）

项目结构已重构，`seatalk-agent` 从 `mcp-tools/seatalk-agent/` 移到了顶级 `seatalk-agent/`。需要卸载旧版后重新安装：

```bash
# 卸载旧版
bash mcp-tools/seatalk-agent/install.sh uninstall 2>/dev/null
# 如果上面报错，手动清理：
launchctl unload ~/Library/LaunchAgents/com.seatalk.cursor-agent.plist 2>/dev/null
launchctl unload ~/Library/LaunchAgents/com.seatalk.cdp-daemon.plist 2>/dev/null
rm -f ~/Library/LaunchAgents/com.seatalk.cursor-agent.plist
rm -f ~/Library/LaunchAgents/com.seatalk.cdp-daemon.plist
rm -rf ~/.seatalk-agent

# 重新安装
cd seatalk-agent
npm install
bash install.sh
```

### 清理 shell 配置

检查 `~/.zshrc`，如果有多条 `alias seatalk=` 行，只保留最后一条。

### Chrome 扩展

扩展文件已从根目录移到 `chrome-extension/`：
1. 打开 `chrome://extensions/`
2. 删除旧的 SPX Helper 扩展
3. 重新加载 `spx-helper/chrome-extension/` 目录

### MCP 配置

MCP 工具的 uvx 路径没有变化（仍然通过 git 远程安装），**不需要改 `mcp.json`**。

---

## 常见问题

### MCP 工具显示红点/连接失败
1. 确认 `uv` 和 `uvx` 命令可用（终端运行 `uvx --version`）
2. 确认网络可以访问 `git.garena.com`（需要公司 VPN）
3. 点击 MCP 名称旁的错误信息查看详细日志

### SeaTalk 打开了但没有 Cursor 面板
1. 确认 `bash install.sh` 已执行
2. 终端执行 `seatalk` 启动 Agent
3. `curl -s http://127.0.0.1:19222/json` 应返回 JSON

### SeaTalk 启动后会闪一下
正常现象。CDP 守护进程检测到 SeaTalk 未开启调试端口，会自动重启一次。

### node 版本低于 22
```bash
brew install node
```

### Python 版本低于 3.10
```bash
uv python install 3.12
```

---

## 项目结构

```
spx-helper/
├── chrome-extension/      # 模块 C: Chrome 浏览器扩展
├── seatalk-agent/         # 模块 B: SeaTalk Cursor Agent
│   ├── install.sh         #   安装脚本
│   ├── launch.sh          #   启动脚本
│   └── src/               #   Agent 源码
├── mcp-tools/             # 模块 A: MCP 工具集
│   ├── presto-query/      #   Presto SQL 查询
│   ├── spark-query/       #   Spark SQL 查询
│   ├── ck-query/          #   ClickHouse 查询
│   ├── api-trace/         #   API 血缘追踪
│   ├── seatalk-reader/    #   SeaTalk 消息读取
│   ├── scheduler-query/   #   DataSuite Scheduler 查询
│   └── seatalk-group/     #   SeaTalk 批量拉群与群管理
├── docs/                  # 文档
├── scripts/               # 构建脚本
├── INSTALL.md             # ← 本文件
└── README.md              # 项目总览
```

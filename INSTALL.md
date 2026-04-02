# SPX Helper 安装指南

> **给 Cursor AI 看的安装指南**：用户克隆项目后，把这个文件发给 Cursor AI 或者说"帮我安装 SPX Helper"即可。
> AI 会介绍项目功能，让用户选择需要安装的模块，然后按步骤完成安装。

---

## 第一步：了解项目

SPX Helper 是一套为 Shopee 大数据开发工程师打造的效率工具集，包含四个独立模块。

**安装前，建议先快速浏览各模块的功能说明，了解它们能做什么、是否适合你**：

| 模块 | 一句话说明 | 详细指南 |
|------|-----------|----------|
| **MCP 工具套件** | 让 Cursor AI 直接查 Presto/Spark/CK、追踪 API 血缘 | [MCP_TOOLS.md](docs/guides/MCP_TOOLS.md) |
| **SeaTalk Agent** | 把 Cursor AI 注入 SeaTalk 桌面端，聊天中直接调 AI | [SEATALK_AGENT.md](docs/guides/SEATALK_AGENT.md) |
| **Chrome 扩展** | 快速链接、API 溯源、日程管理、SQL 格式化等工具箱 | [CHROME_EXTENSION.md](docs/guides/CHROME_EXTENSION.md) |
| **Cursor Skill** | 标准化工作流（Bug 排查、故障诊断） | [SKILL.md](docs/guides/SKILL.md) |

> **依赖关系**：SeaTalk Agent 依赖 MCP 工具（需要先安装 MCP 才能在 SeaTalk 里查数据）。其余模块互相独立。

---

## 第二步：选择你需要的模块

| 你的需求 | 安装什么 |
|---------|---------|
| 只需要 AI 查数据（Presto/CK/Spark） | MCP 工具 |
| 想在 SeaTalk 里用 AI | MCP 工具 + SeaTalk Agent |
| 只需要 Chrome 浏览器工具 | Chrome 扩展 |
| 全部都要 | 全部 |

---

## 第三步：克隆项目

所有模块共用同一个仓库：

```bash
# GitLab（推荐，公司内网更快）
git clone https://git.garena.com/tianyi.liang/spx-helper.git

# 或 GitHub
git clone https://github.com/SperanzaTY/spx-helper.git
```

如果已有旧版本：

```bash
cd spx-helper
git checkout release
git pull origin release
```

---

## 第四步：按模块安装

### A. MCP 工具套件

让 Cursor AI 能直接查数据库、分析 API 血缘。

#### A.1 安装 uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
# 安装后必须重启终端
```

#### A.2 准备凭证

| 凭证 | 获取方式 |
|------|---------|
| **Presto Personal Token** | [DataSuite API 管理](https://datasuite.shopee.io/dataservice/ds_api_management) → ☰ → Personal Token |
| **Shopee 用户名** | 你的用户名（**不是邮箱**），格式如 `john.doe` |
| **DMP 用户名/密码**（可选，Spark 用） | [DataSuite](https://datasuite.shopee.io) → **RAM** → Profile → BigData Account（点 View 查看） |
| **InfraBot Token**（可选，群管理用） | 找 @tianyi.liang 获取 |

> Presto 用户名和 DMP 用户名可能不同。Presto 用 Shopee 用户名，DMP 用 BigData Account 里的用户名。

#### A.3 配置 MCP

```bash
mkdir -p ~/.cursor
cursor ~/.cursor/mcp.json
```

写入以下内容（**替换占位符**）：

```json
{
  "mcpServers": {
    "presto-query": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/presto-query", "presto-query-mcp"],
      "env": {
        "PRESTO_PERSONAL_TOKEN": "替换为你的Token",
        "PRESTO_USERNAME": "替换为你的用户名"
      }
    },
    "ck-query": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/ck-query", "ck-query-mcp"]
    },
    "spark-query": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/spark-query", "spark-query-mcp"],
      "env": {
        "LIVY_USERNAME": "替换为DMP用户名",
        "LIVY_PASSWORD": "替换为DMP密码"
      }
    },
    "api-trace": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/api-trace", "api-trace-mcp"],
      "env": {
        "PRESTO_PERSONAL_TOKEN": "替换为你的Token",
        "PRESTO_USERNAME": "替换为你的用户名"
      }
    },
    "seatalk-reader": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/seatalk-reader", "seatalk-reader-mcp"]
    },
    "scheduler-query": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/scheduler-query", "scheduler-mcp"]
    },
    "seatalk-group": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/seatalk-group", "seatalk-group-mcp"],
      "env": {
        "INFRABOT_TOKEN": "替换为InfraBot Token"
      }
    }
  }
}
```

#### A.4 验证

1. 重启 Cursor
2. `Cmd + Shift + J` → MCP → 检查各工具状态是否为绿点
3. 在 Agent 模式输入：`查询 spx_mart.dim_station 表最近一天的数据量`

> 遇到问题？参见 [MCP 工具指南 — 常见问题](docs/guides/MCP_TOOLS.md#五常见问题)

---

### B. SeaTalk Agent

把 Cursor AI 注入 SeaTalk 桌面客户端。**需要先完成模块 A**。

#### B.1 前置条件

```bash
node --version       # 需要 v22+，没有则 brew install node
agent --version      # 需要有输出，没有则 Cursor → Cmd+Shift+P → "Install 'agent' command"
```

#### B.2 安装并启动

```bash
cd spx-helper/seatalk-agent
npm install
bash install.sh

# 关闭终端，打开新终端
seatalk
```

#### B.3 验证

- SeaTalk 左侧出现 ✦ 图标 → 点击打开 AI 面板 → 输入"你好"测试

> 详细功能和使用说明参见 [SeaTalk Agent 指南](docs/guides/SEATALK_AGENT.md)
>
> 遇到问题？参见 [SeaTalk Agent 指南 — 常见问题](docs/guides/SEATALK_AGENT.md)

---

### C. Chrome 扩展

浏览器工具集，独立安装。

1. Chrome 访问 `chrome://extensions/` → 开启 **开发者模式**
2. 点击 **加载已解压的扩展程序** → 选择 `spx-helper/chrome-extension/`
3. 点击工具栏图标验证

> 详细功能参见 [Chrome 扩展指南](docs/guides/CHROME_EXTENSION.md)

---

### D. Cursor Skill（可选）

```bash
mkdir -p ~/.cursor/skills
for skill in .cursor/skills/*/; do
  name=$(basename "$skill")
  [ "$name" = "README.md" ] && continue
  cp -r "$skill" ~/.cursor/skills/
  echo "✅ 已安装: $name"
done
```

重启 Cursor 生效。

> 部分 Skill 依赖外部 MCP（如 Atlassian、Google Sheets），详见 [Skill 指南](docs/guides/SKILL.md)

---

## 升级指南（已有旧版本）

```bash
cd spx-helper
git checkout release
git pull origin release
```

- **MCP**：uvx 通过 git 远程安装，**不需要改 `mcp.json`**，重启 MCP 即可
- **SeaTalk Agent**：终端运行 `seatalk`，或在面板中点击"检查更新"
- **Chrome 扩展**：`chrome://extensions/` 点击刷新按钮

> 如果从 v3.0 之前升级，SeaTalk Agent 目录已从 `mcp-tools/seatalk-agent/` 移到顶级 `seatalk-agent/`，需要先卸载旧版（`bash mcp-tools/seatalk-agent/install.sh uninstall`）再重新安装。

---

## 常见问题

| 问题 | 解决方案 |
|------|---------|
| `uvx` 找不到 | 安装 uv 后重启终端，或 `export PATH="$HOME/.local/bin:$PATH"` |
| MCP 一直红点 | 确认 VPN 连接 + `uvx --version` 可用 |
| SeaTalk 没有 Cursor 面板 | 确认 `bash install.sh` 已执行，终端运行 `seatalk` |
| SeaTalk 启动闪一下 | 正常，CDP 守护进程自动重启 |
| node 版本低于 22 | `brew install node` |
| Python 版本低于 3.10 | `uv python install 3.12` |

更多问题参见各模块指南的常见问题章节。

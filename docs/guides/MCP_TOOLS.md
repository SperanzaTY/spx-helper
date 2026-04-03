# MCP 工具使用指南

> Cursor AI 的数据查询与 SeaTalk 集成工具 — 让 AI 直接操作 Presto/ClickHouse/Spark/SeaTalk

---

## 概述

MCP（Model Context Protocol）工具让 Cursor AI 能直接查询数据库、分析 API 血缘、读取 SeaTalk 消息。

在 Cursor Agent 中用自然语言即可调用：

```
"查询 spx_mart.dim_station 表最近一天的数据量"
"帮我分析 get_vehicle_list 这个 API 的数据血缘"
"查一下 ClickHouse ck2 集群 spx_ods.ods_order_detail 最近一小时的数据"
"提交一个 Spark SQL 任务到 sg3 集群"
"打开这个 SeaTalk 链接，帮我看看他们在讨论什么问题"
```

---

## 一、自研 MCP

| 工具                     | 功能                                         | 凭证                      |
| ------------------------ | -------------------------------------------- | ------------------------- |
| **presto-query**   | 通过 DataSuite Personal SQL API 查询 Presto  | Personal Token + Username |
| **ck-query**       | 查询 ClickHouse 集群（ck2/ck6/sg3/br/mx 等） | 团队统一配置              |
| **spark-query**    | 通过 Livy 提交 Spark SQL 任务                | BigData Account（见下方获取方式） |
| **api-trace**      | API 接口血缘分析，查找上下游依赖             | 同 presto-query           |
| **seatalk-reader** | 读取 SeaTalk 聊天消息、发送消息（需确认）、线程回复（root_mid）、撤回消息（需确认）、加好友（需确认） | 需 SeaTalk Agent 运行     |
| **scheduler-query** | DataSuite Scheduler 任务查询 + Presto History | 浏览器 Cookie 自动认证（chrome-auth） |
| **datamap-query** | DataMap 表元数据、血缘查询 | 浏览器 Cookie 自动认证（chrome-auth） |
| **datastudio-mcp** | DataStudio 资产管理：批量下载、同步、创建、更新、解锁 | 浏览器 Cookie 自动认证（chrome-auth） |
| **seatalk-group** | 通过 InfraBot API 批量邀请/移除 SeaTalk 群成员 | InfraBot API Token       |

### 共享认证库：chrome-auth

`scheduler-query`、`datamap-query`、`datastudio-mcp` 均使用 **chrome-auth** 共享库自动从 Chrome 浏览器获取认证 Cookie，无需手动配置 Token。只需确保在 Chrome 中已登录对应平台即可。

详细文档：[chrome-auth README](../../mcp-tools/chrome-auth/README.md)

### 安装方式：GitLab 链接安装（推荐，免克隆）

使用 [uv](https://docs.astral.sh/uv/) 通过 GitLab 链接直接运行。在 `~/.cursor/mcp.json` 中配置：

```jsonc
{
  "mcpServers": {
    // Presto 查询
    "presto-query": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/presto-query", "presto-query-mcp"],
      "env": {
        "PRESTO_PERSONAL_TOKEN": "替换为你的Token",
        "PRESTO_USERNAME": "替换为你的用户名"
      }
    },
    // ClickHouse 查询
    "ck-query": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/ck-query", "ck-query-mcp"]
    },
    // Spark SQL 查询（通过 Livy）
    "spark-query": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/spark-query", "spark-query-mcp"],
      "env": {
        "LIVY_USERNAME": "替换为 BigData Account 用户名",
        "LIVY_PASSWORD": "替换为 BigData Account 密码"
      }
    },
    // API 血缘溯源
    "api-trace": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/api-trace", "api-trace-mcp"],
      "env": {
        "PRESTO_PERSONAL_TOKEN": "替换为你的Token",
        "PRESTO_USERNAME": "替换为你的用户名"
      }
    },
    // SeaTalk 消息读取
    "seatalk-reader": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/seatalk-reader", "seatalk-reader-mcp"]
    },
    // Scheduler 任务查询
    "scheduler-query": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/scheduler-query", "scheduler-mcp"]
    },
    // SeaTalk 群组管理
    "seatalk-group": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/seatalk-group", "seatalk-group-mcp"],
      "env": {
        "INFRABOT_TOKEN": "替换为InfraBot Token"
      }
    },
    // DataMap 元数据查询（需先 pip install -e chrome-auth）
    "datamap-query": {
      "command": "python3",
      "args": ["/path/to/spx-helper/mcp-tools/datamap-query/datamap_mcp_server.py"]
    },
    // DataStudio 资产管理（需先 pip install -e chrome-auth）
    "datastudio-mcp": {
      "command": "python3",
      "args": ["-m", "datastudio_mcp.mcp_server"],
      "cwd": "/path/to/spx-helper/mcp-tools/datastudio-mcp",
      "env": {
        "DATASTUDIO_BASE_PATH": "替换为你的本地DataStudio工作目录",
        "DATASTUDIO_PROJECTS": "项目代码,逗号分隔",
        "PYTHONPATH": "/path/to/spx-helper/mcp-tools/datastudio-mcp"
      }
    }
  }
}
```

> JSON 标准不支持注释，保存时如报错请删除 `//` 注释行。

**前置条件**：需安装 [uv](https://docs.astral.sh/uv/install/)（`curl -LsSf https://astral.sh/uv/install.sh | sh`）

**GitLab 说明**：团队推荐使用 GitLab 链接（需内网/VPN 访问 git.garena.com）。若无法访问 GitLab，可改用 GitHub：`git+https://github.com/SperanzaTY/spx-helper@release#subdirectory=mcp-tools/<tool>`

> **注意**：`datamap-query`、`datastudio-mcp` 依赖 `chrome-auth` 共享库，需要克隆仓库后本地安装。

### 安装方式：本地路径安装（克隆后）

克隆仓库后本地安装。`scheduler-query`、`datamap-query`、`datastudio-mcp` 需要先安装 chrome-auth：

```bash
# 1. 安装 chrome-auth 共享认证库（必需）
cd /path/to/spx-helper/mcp-tools/chrome-auth
pip install -e .

# 2. 然后在 mcp.json 中配置本地路径即可
```

各 MCP 的详细配置见目录下的 README。

---

## 二、推荐外部 MCP

### 1. MCP Atlassian（Confluence / Jira）

连接 Atlassian Confluence 和 Jira，支持搜索、读取、创建、更新页面。已在 confluence.shopee.io 验证可用。

```json
"mcp-atlassian": {
  "command": "/Users/你的用户名/.local/bin/uvx",
  "args": ["mcp-atlassian"],
  "env": {
    "CONFLUENCE_URL": "https://confluence.shopee.io",
    "CONFLUENCE_PERSONAL_TOKEN": "你的Confluence_PAT",
    "CONFLUENCE_SSL_VERIFY": "false"
  }
}
```

**凭证获取**：个人头像 → Profile → [Personal Access Tokens](https://confluence.shopee.io/plugins/personalaccesstokens/usertokens.action)

### 2. DrawIO MCP（架构图 / 流程图）

用自然语言生成 draw.io 图表，支持 mxGraphModel XML。

```json
"drawio": {
  "command": "/usr/local/bin/npx",
  "args": ["--yes", "@next-ai-drawio/mcp-server@latest"],
  "env": {
    "PATH": "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  }
}
```

若 Node 由 Homebrew 安装在 Apple Silicon 上，`command` 改为 `/opt/homebrew/bin/npx`。

### 3. Google Sheets MCP

AI 直接读写 Google Sheets，用于任务管理和数据整理。

1. 向 tianyi.liang@shopee.com 获取 `spx-helper-mcp-sheets.json`
2. 放置到 `~/.google-credentials/spx-helper-mcp-sheets.json`
3. 配置：

```json
"google-sheets": {
  "command": "uvx",
  "args": ["mcp-google-sheets"],
  "env": {
    "SERVICE_ACCOUNT_PATH": "/Users/你的用户名/.google-credentials/spx-helper-mcp-sheets.json",
    "DRIVE_FOLDER_ID": "1USyHneT0j17IMEpm0AW5LeVJ6mop511W"
  }
}
```

### 4. cursor-ide-browser（Cursor 内置）

操控浏览器：导航、截图、点击、抓取网络请求。Cursor 内置，在 MCP 设置中启用即可。

---

## 三、凭证获取

| 凭证 | 格式 | 获取位置 |
| ---- | ---- | -------- |
| `PRESTO_PERSONAL_TOKEN` | `eyJhbGci...` 长字符串 | [DataSuite API 管理](https://datasuite.shopee.io/dataservice/ds_api_management) → 左侧菜单 ☰ → Personal Token → 复制 Token |
| `PRESTO_USERNAME` | `john.doe`（**不是邮箱**） | 你的 Shopee 用户名（如 `tianyi.liang`） |
| `LIVY_USERNAME` / `LIVY_PASSWORD` | BigData Account | [DataSuite RAM Profile](https://datasuite.shopee.io/ram/personal/profile) → **BigData Account** 区域 → Account 即用户名，Password 点 **View** 查看 |
| `INFRABOT_TOKEN` | `infrabot.xxxx` | 找 @tianyi.liang 获取，或在 [InfraBot API Playground](https://space.shopee.io/utility/seatalkbot/api-playground) 申请 |
| `CONFLUENCE_PERSONAL_TOKEN` | 令牌字符串 | [Confluence PAT 管理页](https://confluence.shopee.io/plugins/personalaccesstokens/usertokens.action) → 创建新 Token |
| **chrome-auth 认证** | 无需配置 | `scheduler-query`、`datamap-query`、`datastudio-mcp` 自动从 Chrome Cookie 获取认证，只需在 Chrome 中登录 [DataSuite](https://datasuite.shopee.io) |

---

## 四、验证与刷新

1. 保存 `~/.cursor/mcp.json` 后，按 `Cmd + Shift + J` 打开 Cursor 设置 → 选择 **MCP**
2. 确认各 MCP 状态为绿点（已连接）
3. 如果显示红点，点击刷新按钮 ↻
4. 在 Agent 中输入测试查询，如 `查询 spx_mart.dim_station 表最近一天的数据量`

### SeaTalk 相关 MCP 快速更新（拉代码 / 升 Cursor 后）

**seatalk-reader**、**seatalk-group** 通过 **uvx + Git 子目录** 安装时，Cursor 会在子进程里解析依赖；大版本或仓库更新后应 **在 MCP 设置里对这两项关闭再开启**（与项目规则「`mcp-tools/` 有变更要 toggle MCP」一致）。

**想缩短等待**：若本机已克隆 **spx-helper**，在终端用 **本地目录** 预热/强制重装，通常比反复从 GitLab 拉同一引用快得多：

```bash
cd /path/to/spx-helper/mcp-tools/seatalk-reader
uvx --reinstall --from . seatalk-reader-mcp --help >/dev/null

cd ../seatalk-group
uvx --reinstall --from . seatalk-group-mcp --help >/dev/null
```

将 `/path/to/spx-helper` 换成你的仓库根路径。然后再到 Cursor **MCP** 页面刷新对应服务。

仅依赖 `git+https://...@release#subdirectory=...` 时，也可执行 `uvx --reinstall --from 'git+https://…'` 强制换新，但 **耗时可达到数分钟**（网络与解析依赖），属正常现象。

完整启动顺序（含侧边栏 Agent、CDP）见 **[SeaTalk Agent 使用指南](./SEATALK_AGENT.md)** 中的「更新仓库 / 升级 Cursor 后：快速恢复」。

---

## 五、常见问题

<details>
<summary>uvx 命令找不到？</summary>

安装 uv 后需重启终端。手动加入 PATH：`export PATH="$HOME/.local/bin:$PATH"`，加到 `~/.zshrc` 后重启终端。

</details>

<details>
<summary>MCP 一直红点/连接失败？</summary>

1. 确认 `uv`/`uvx` 命令可用
2. 确认网络可以访问 `git.garena.com`（需 VPN）
3. 点击 MCP 名称旁的错误信息查看详细日志
4. 终端手动运行 MCP 命令验证

</details>

<details>
<summary>Python 版本不兼容？</summary>

MCP 工具需要 Python 3.10+。通过 uv 安装：`uv python install 3.12`

</details>

---

## 六、配置位置

MCP 配置在 `~/.cursor/mcp.json`，新增或修改后需在 Cursor 设置中**关闭再开启**对应 MCP 以刷新。

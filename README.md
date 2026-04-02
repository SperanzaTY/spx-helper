# SPX Helper

> **Shopee 大数据开发助手** — Chrome 扩展 + MCP 工具套件 + SeaTalk AI Agent

[![Version](https://img.shields.io/badge/version-3.1.1-blue.svg)](https://github.com/SperanzaTY/spx-helper/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

SPX Helper 是一套为 Shopee 大数据开发工程师打造的效率工具集，包含三个核心模块：

| 模块                    | 说明                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| **Chrome 扩展**   | 快速链接、API 数据溯源、日程管理、SQL/HTTP/正则/Mermaid 等实用工具                        |
| **MCP 工具套件**  | Presto/Spark/ClickHouse 查询、API 血缘分析、SeaTalk 消息读取 — 让 Cursor AI 直接操作数据 |
| **SeaTalk Agent** | 将 Cursor AI Agent 注入 SeaTalk 桌面客户端，在聊天中直接调用 AI 排查问题                  |

---

## 快速开始

### 0. 安装 Cursor IDE（必须）

MCP 工具和 SeaTalk Agent 都依赖 [Cursor](https://www.cursor.com/) IDE。如果你还没有安装：

1. 打开 https://www.cursor.com/
2. 点击 **Download** 下载 macOS 版本
3. 将下载的 `.dmg` 文件拖入 Applications 文件夹
4. 启动 Cursor，使用 GitHub / Google 账号登录

> 如果你之前用 VS Code，Cursor 可以一键导入你的所有扩展和设置。

### 1. Chrome 扩展安装

```bash
git clone https://github.com/SperanzaTY/spx-helper.git
# 或 GitLab：
# git clone https://git.garena.com/tianyi.liang/spx-helper.git
```

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角 **"开发者模式"**
3. 点击 **"加载已解压的扩展程序"**
4. 选择仓库中的 `spx-helper/chrome-extension/` 目录
5. 点击工具栏图标即可使用

### 2. MCP 工具安装（Cursor AI 集成）

MCP（Model Context Protocol）工具让 Cursor AI 能直接查询数据库、分析 API 血缘、读取 SeaTalk 消息。

#### 步骤 1：安装 uv（Python 包管理器）

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

安装完成后**重启终端**，验证：

```bash
uv --version    # 应输出 uv 0.x.x
uvx --version   # 应输出 uvx 0.x.x
```

#### 步骤 2：编辑 MCP 配置文件

MCP 配置文件位于 `~/.cursor/mcp.json`。如果文件不存在则新建一个。

**方式一：通过 Cursor 界面**（推荐）

1. 打开 Cursor → 按 `Cmd + Shift + J` 打开 Cursor 设置
2. 在左侧列表中选择 **MCP**
3. 点击 **"Add new global MCP server"** 按钮
4. Cursor 会自动打开 `~/.cursor/mcp.json` 文件供编辑

**方式二：通过终端直接编辑**

```bash
# 确保目录存在
mkdir -p ~/.cursor

# 用你喜欢的编辑器打开（或用 Cursor 打开）
cursor ~/.cursor/mcp.json
# 或 vim ~/.cursor/mcp.json
# 或 open -a TextEdit ~/.cursor/mcp.json
```

#### 步骤 3：粘贴配置

将以下内容粘贴到 `~/.cursor/mcp.json`（如果已有内容，合并到 `mcpServers` 中）：

```jsonc
{
  "mcpServers": {
    // Presto 查询（通过 DataSuite Personal SQL API）
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
    // ClickHouse 查询
    "ck-query": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/ck-query",
        "ck-query-mcp"
      ]
    },
    // Spark SQL 查询（通过 Livy）
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
    // API 血缘溯源
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
    // SeaTalk 消息读取（需 SeaTalk 开启 CDP 调试端口）
    "seatalk-reader": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/seatalk-reader",
        "seatalk-reader-mcp"
      ]
    }
  }
}
```

> **注意**：JSON 标准不支持注释。如果保存时报错，删除所有 `//` 注释行即可。

#### 步骤 4：替换凭证

将配置中的占位符替换为你自己的凭证（参见下方 [凭证获取](#凭证获取)）：

| 占位符                                  | 获取方式                                  |
| --------------------------------------- | ----------------------------------------- |
| `替换为你的Token`                     | DataSuite → 左上角 ☰ → Personal Token  |
| `替换为你的用户名`                    | 你的 Shopee 用户名（如 `tianyi.liang`） |
| `替换为DMP用户名` / `替换为DMP密码` | DataSuite → Profile → BigData Account   |

#### 步骤 5：刷新 MCP

保存配置文件后，回到 Cursor：

1. 按 `Cmd + Shift + J` 打开设置 → 选择 **MCP**
2. 你应该看到刚添加的 MCP 服务器列表
3. 如果某个工具状态显示红点/未连接，点击旁边的 **刷新按钮** ↻
4. 等待状态变为绿点（已连接）

#### 步骤 6：验证

在 Cursor 的 Agent 模式中输入任意查询测试，例如：

```
查询 spx_mart.dim_station 表最近一天的数据量
```

如果 Cursor 成功调用了 `presto-query` 工具并返回结果，说明配置成功。

#### 常见问题

<details>
<summary>uvx 命令找不到？</summary>

安装 uv 后需要重启终端。如果还是找不到，手动将 uv 加入 PATH：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

将这行加入 `~/.zshrc` 或 `~/.bashrc` 后重启终端。

</details>

<details>
<summary>MCP 一直显示红点/连接失败？</summary>

1. 先确认 `uv` 和 `uvx` 命令可用（在终端运行 `uvx --version`）
2. 确认网络可以访问 `git.garena.com`（公司 VPN 可能需要开启）
3. 点击 MCP 名称旁的错误信息查看详细日志
4. 尝试在终端手动运行 MCP 命令验证：
   ```bash
   uvx --from "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/presto-query" presto-query-mcp
   ```

</details>

<details>
<summary>提示 Python 版本不兼容？</summary>

MCP 工具需要 Python 3.10+。检查版本：

```bash
python3 --version
```

如果版本过低，通过 uv 安装：

```bash
uv python install 3.12
```

</details>

### 3. SeaTalk Agent 安装（进阶）

SeaTalk Agent 将 Cursor AI 注入 SeaTalk 桌面端，支持在聊天窗口中直接与 AI 交互、引用消息排查问题。

> 这是最高级的集成形态，需要先完成上面的 Cursor 和 MCP 配置。

#### 前置条件检查

在终端逐项验证：

```bash
node --version       # 需要 v22+，如果没有：brew install node
agent --version      # 需要有输出，如果没有：Cursor → Cmd+Shift+P → Install 'agent' command
npm --version        # 随 Node.js 一起安装
```

#### 步骤 1：安装依赖

```bash
cd spx-helper/seatalk-agent
npm install
```

#### 步骤 2：一键安装（推荐）

```bash
bash install.sh
```

安装完成后会配置：
- **CDP 守护进程**（开机自启）：持续监听 SeaTalk 进程，**无论怎么打开 SeaTalk（双击/Dock/Spotlight），都会自动启用 CDP 端口**。用户不用关心 CDP 是什么
- **`seatalk` 命令**：在终端输入即可一键启动 SeaTalk + Agent

```bash
# 安装后，推荐用这个命令启动 SeaTalk + Agent
seatalk
```

> 安装后即使直接双击 SeaTalk 图标打开，CDP 守护进程也会自动在后台将其重启为 CDP 模式（SeaTalk 会闪一下然后正常使用），之后只需 `npm start` 启动 Agent 即可。

> 卸载：`bash install.sh uninstall`

#### 步骤 2（备选）：手动启动

如果不想用安装脚本：

```bash
# 1. 先完全退出 SeaTalk（Cmd+Q）
# 2. 启动 Agent（会自动以 CDP 模式拉起 SeaTalk 并注入）
npm start
```

启动成功后你应该看到类似输出：

```
[xx:xx:xx] [agent] SeaTalk launched with --remote-debugging-port=19222
[xx:xx:xx] [agent] connected: SeaTalk (https://web.haiserve.com/)
[xx:xx:xx] [agent] SPA ready
[xx:xx:xx] [agent] ACP agent connected
[xx:xx:xx] [agent] injection complete!
```

> 注意：如果没有运行 `install.sh`，直接双击打开 SeaTalk 不会启用 CDP 端口，需要手动用 `open -a SeaTalk --args --remote-debugging-port=19222` 启动。

#### 步骤 3：使用

- 在 SeaTalk 窗口中会出现一个 **Cursor 侧边栏图标**（紫色），点击打开面板
- 直接输入问题，或选中聊天消息点击 **✦ Ask Cursor** 引用到面板
- Agent 会自动调用已配置的 MCP 工具查询数据、分析问题

#### SeaTalk Agent 常见问题

<details>
<summary>SeaTalk 打开了但看不到 Cursor 面板？</summary>

1. 确认已运行过 `bash install.sh`（CDP 守护进程会自动处理 CDP 模式）
2. 确认 Agent 在运行：终端执行 `seatalk` 或 `cd seatalk-agent && npm start`
3. 验证 CDP 是否生效：`curl -s http://127.0.0.1:19222/json`，应返回 JSON
4. 如果 CDP 没开启且未安装守护进程，手动执行：
   - `pkill -x SeaTalk`
   - `open -a SeaTalk --args --remote-debugging-port=19222`

</details>

<details>
<summary>SeaTalk 启动后会闪一下？</summary>

这是 CDP 守护进程在工作 — 它检测到 SeaTalk 没有开启 CDP 端口，会自动重启它。这只在首次打开时发生一次，之后正常使用。

</details>

<details>
<summary>终端一直显示 "waiting for SeaTalk..."？</summary>

说明 Agent 连不上 SeaTalk 的 CDP 端口：

1. 确认 SeaTalk 正在运行
2. 确认是以 CDP 模式启动的：`curl -s http://127.0.0.1:19222/json` 应返回 JSON
3. 如果返回 "连接被拒绝" 且已安装守护进程，检查守护进程日志：`cat ~/.seatalk-agent/logs/cdp-daemon.log`
4. 确保没有其他程序占用 19222 端口：`lsof -i :19222`

</details>

<details>
<summary>Agent 启动但面板没有出现？</summary>

1. 检查终端输出是否有 `injection complete!`
2. 如果显示 `skipping injection (agent UI already present)`，说明 UI 已注入但可能被隐藏了，点击 SeaTalk 窗口右侧的紫色图标
3. 如果有错误，尝试完全退出 SeaTalk 和 Agent 后重新启动

</details>

<details>
<summary>每次都要从终端启动很麻烦？</summary>

运行 `bash install.sh` 后，只需在终端输入 `seatalk` 一个命令即可完成所有启动。也可以将 `seatalk` 命令设置为开机自启。

</details>

---

## 功能详解

### Chrome 扩展

| 功能                    | 说明                                                   |
| ----------------------- | ------------------------------------------------------ |
| **API 数据溯源**  | 自动拦截页面 API 请求，记录参数/响应，支持 AI 血缘分析 |
| **快速链接**      | 一键访问 Flink/Spark/HDFS/Kafka/DataSuite 等平台       |
| **日程管理**      | Google Calendar 集成 + 待办事项看板                    |
| **Mermaid 图表**  | 流程图/时序图/ER图渲染，支持高清导出                   |
| **HTTP 请求测试** | 支持多种请求方式和认证方式                             |
| **SQL 格式化**    | SQL 格式化/压缩/关键字转换                             |
| **时区转换**      | 支持 Shopee 各区域时区快速转换                         |
| **文本差异对比**  | VS Code 风格的字符级差异对比                           |
| **正则测试**      | 实时匹配、高亮结果                                     |
| **独立窗口模式**  | 常驻桌面，窗口位置自动保存                             |

### MCP 工具套件

在 Cursor 中直接用自然语言操作：

```
"查询 spx_mart.dim_station 表最近一天的数据量"
"帮我分析 get_vehicle_list 这个 API 的数据血缘"
"查一下 ClickHouse ck2 集群 spx_ods.ods_order_detail 最近一小时的数据"
"提交一个 Spark SQL 任务到 sg3 集群"
"打开这个 SeaTalk 链接，帮我看看他们在讨论什么问题"
```

| 工具                     | 功能                                         | 凭证                      |
| ------------------------ | -------------------------------------------- | ------------------------- |
| **presto-query**   | 通过 DataSuite Personal SQL API 查询 Presto  | Personal Token + Username |
| **ck-query**       | 查询 ClickHouse 集群（ck2/ck6/sg3/br/mx 等） | 团队统一配置              |
| **spark-query**    | 通过 Livy 提交 Spark SQL 任务                | DMP Username + Password   |
| **api-trace**      | API 接口血缘分析，查找上下游依赖             | 同 presto-query           |
| **seatalk-reader** | 读取 SeaTalk 聊天消息、打开消息链接          | 需 SeaTalk 开启 CDP       |

### SeaTalk Agent

将 Cursor AI 的完整能力注入 SeaTalk 桌面端：

- **聊天面板** — Cursor 风格的 AI 对话界面，支持浮窗和侧边栏模式
- **消息引用** — 选中消息文字或点击 "Ask Cursor" 图标，自动将上下文传给 AI
  - 线程内引用：传入整个线程所有消息
  - 主聊天引用：传入前后上下文消息
- **MCP 工具调用** — 对话中自动调用 Presto/CK/Spark/API-Trace 等工具
- **工作区切换** — 切换 Cursor 工作区，加载对应项目的 rules 和 skills
- **会话持久化** — 重启后自动恢复上一次的对话上下文
- **深色/浅色主题** — 跟随用户偏好
- **面板可缩放** — 支持 8 方向拖拽调整大小

---

## 凭证获取

| 工具                               | 凭证来源                 | 获取方式                                                                                                             |
| ---------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **presto-query / api-trace** | DataSuite Personal Token | 访问[DataSuite API 管理](https://datasuite.shopee.io/dataservice/ds_api_management) → 左上角 ☰ → 获取 Personal Token |
| **spark-query**              | DMP BigData Account      | 访问[DataSuite 个人中心](https://datasuite.shopee.io) → Profile → BigData Account / Password（点击 View）             |
| **ck-query**                 | 团队统一配置             | 密码已配置在 `ck_mcp_server.py` 中                                                                                 |
| **seatalk-reader**           | 无需凭证                 | 需 SeaTalk 开启 `--remote-debugging-port=19222`                                                                    |

---

## 项目结构

```
spx-helper/
├── chrome-extension/             # Chrome 扩展（独立可加载目录）
│   ├── manifest.json             # Chrome 扩展配置（MV3）
│   ├── background.js             # Service Worker（消息中枢）
│   ├── content.js                # 内容脚本（API 拦截 UI）
│   ├── injected.js               # 注入脚本（fetch/XHR Hook）
│   ├── popup.html / popup.js     # 扩展主界面
│   ├── styles.css                # 扩展样式
│   ├── images/                   # 扩展图标
│   ├── station_query/            # 站点查询工具（Python 后端）
│   └── ck_sync/                  # ClickHouse DDL 同步工具
│
├── seatalk-agent/                # SeaTalk AI Agent（Node + TypeScript）
│   ├── install.sh                # 一键安装脚本（seatalk 命令 + 自动启动）
│   ├── launch.sh                 # 启动器（支持自动重启）
│   ├── src/main.ts               # 主入口（CDP + ACP 编排）
│   ├── src/acp.ts                # Cursor ACP 客户端
│   ├── src/bridge.ts             # CDP ↔ 注入脚本通信桥
│   ├── src/cdp.ts                # Chrome DevTools Protocol 客户端
│   └── src/inject/               # 注入到 SeaTalk 的 UI 脚本
│       ├── cursor-ui.js          # 基础 UI 层（面板、Markdown 渲染）
│       └── sidebar-app.js        # 聊天面板（对话、工具调用、主题）
│
├── mcp-tools/                    # MCP 工具套件
│   ├── presto-query/             # Presto 查询（Python, FastMCP）
│   ├── ck-query/                 # ClickHouse 查询
│   ├── spark-query/              # Spark SQL（Livy）
│   ├── api-trace/                # API 血缘溯源
│   ├── seatalk-reader/           # SeaTalk 消息读取（CDP）
│   ├── seatalk-group/            # SeaTalk 群组管理
│   ├── scheduler-query/          # DataSuite Scheduler 查询 + Presto History Server
│   └── share-package/            # 可分发的 Presto 查询工具包
│
├── .cursor/skills/               # Cursor Skills
│   └── spx-bug-trace/            # Bug 排查技能（API 溯源 + 数据验证流程）
│
├── scripts/                      # 构建/发布/测试脚本
└── docs/                         # 文档（安装、使用、架构、变更日志）
```

---

## SeaTalk Agent 架构

```
┌─────────────────────────────────────────────────────┐
│  SeaTalk Desktop (Electron)                         │
│  ┌─────────────────────────────────────────────┐    │
│  │  注入的 Cursor 面板 (cursor-ui + sidebar)    │    │
│  │  ← __agentReceive() ── Bridge ──→            │    │
│  │  ── __agentSend() ──→                        │    │
│  └─────────────────────────────────────────────┘    │
│       ▲ CDP (WebSocket)                             │
└───────┼─────────────────────────────────────────────┘
        │
┌───────┴─────────────────────────────────────────────┐
│  seatalk-agent (Node.js)                            │
│  main.ts                                            │
│  ├── cdp.ts     → 连接 SeaTalk CDP                 │
│  ├── bridge.ts  → 双向消息桥                        │
│  └── acp.ts     → 连接 Cursor Agent                │
│       │                                             │
│       ▼ stdio (JSON-RPC)                            │
│  ┌──────────────────────────────────────────┐       │
│  │  cursor agent acp                        │       │
│  │  ├── LLM (Claude/GPT/...)               │       │
│  │  └── MCP Tools                           │       │
│  │      ├── presto-query                    │       │
│  │      ├── ck-query                        │       │
│  │      ├── seatalk-reader                  │       │
│  │      └── ...                             │       │
│  └──────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────┘
```

---

## Skills（技能）

项目内置了 `spx-bug-trace` 技能，提供标准化的 Bug 排查流程：

1. 从 SeaTalk 消息中提取问题描述和相关 API 链接
2. 通过 `seatalk-reader` 读取完整上下文
3. 通过 `api-trace` 分析 API 血缘关系
4. 通过 `presto-query` / `ck-query` 验证数据
5. 生成排查报告

使用方式：在 Cursor 中打开 SPX Helper 项目后，直接描述问题即可自动触发。

---

## 完整能力清单

要获得 SPX Helper 的**完整能力**，需要完成以下配置：

| 步骤 | 组件                | 效果                                         |
| ---- | ------------------- | -------------------------------------------- |
| 1    | Chrome 扩展         | API 溯源、快速链接、日程、工具箱             |
| 2    | presto-query MCP    | Cursor 中查询 Presto 数据                    |
| 3    | ck-query MCP        | Cursor 中查询 ClickHouse                     |
| 4    | spark-query MCP     | Cursor 中提交 Spark SQL                      |
| 5    | api-trace MCP       | Cursor 中分析 API 血缘                       |
| 6    | seatalk-reader MCP  | Cursor 中读取 SeaTalk 消息                   |
| 7    | SeaTalk Agent       | 在 SeaTalk 中直接使用 AI（集成以上所有 MCP） |
| 8    | spx-bug-trace Skill | 标准化 Bug 排查流程                          |

> 每个组件独立可用，按需安装即可。SeaTalk Agent 是最高级的集成形态，它会自动加载所有已配置的 MCP 工具。

---

## 开发

### 扩展开发

修改代码后在 `chrome://extensions/` 点击刷新即可热加载。

### MCP 工具开发

各 MCP 工具基于 Python FastMCP 框架，入口文件即 `*_server.py` 或 `*_mcp_server.py`。

### SeaTalk Agent 开发

```bash
cd seatalk-agent
npm run dev    # tsx watch 模式，代码修改自动重启
```

---

## 更新日志

### v3.1.1 (2026-04)

- **SeaTalk Agent（空发版 / 协作复现）**：基于 **v3.1.0** 仅递增版本号与说明文档，**无任何业务代码或注入脚本变更**，用于同事复现 **内置更新检查卡顿 / 更新流程体验** 等问题。见 [docs/SEATALK_AGENT_UPDATE_REPRO_v3.1.1.md](docs/SEATALK_AGENT_UPDATE_REPRO_v3.1.1.md)。

### v3.1.0 (2026-04)

- **项目结构重构**：seatalk-agent 从 mcp-tools/ 提升为顶级目录
- **CDP 守护进程**：用户任意方式打开 SeaTalk 都自动启用 CDP，无需手动带参数
- **Spark SQL 查询工具**：新增 `get_spark_query_sql`，通过 Keyhole 获取 Spark 任务执行的 SQL
- **Scheduler MCP 增强**：`get_instance_detail` 自动区分 Presto/Spark 任务并给出对应提示
- **Agent 更新路径修复**：修复重构后 PROJECT_ROOT 路径错误导致的更新检查失败
- **模块化安装指南**：INSTALL.md 分 A/B/C 三模块按需安装，AI 交互式引导
- **Cursor Rules 分域重构**：.cursorrules 拆分为 .cursor/rules/*.mdc 按需加载体系
- **MCP README 全补齐**：ck-query、seatalk-reader、scheduler-query、seatalk-group 均有完整文档
- **Skill 共享机制**：团队 Skill 仓库 + 安装/更新/贡献/AI 对比优化全流程

### v3.0.0 (2026-04)

- **自动更新推送**：后台静默检查新版本，状态栏 Badge 实时提示，一键更新 + 自动重启
- **注入模式优化**：对齐 seatalk-enhance 架构，Page.loadEventFired 自动注入，重启后智能跳过重复注入只 rebind 通信桥
- **launch.sh 启动器**：`npm start` 支持 exit code 42 自动重启循环，更新后无缝衔接
- **版本管理规范化**：统一 manifest.json / package.json 版本号，.cursorrules 约定发版流程

### v2.20.0 (2026-04)

- SeaTalk Agent：图片消息发送（粘贴/拖拽/选择图片，Agent 自动分析）
- SeaTalk Agent：一键安装脚本（`bash install.sh` + `seatalk` 命令）
- SeaTalk Agent：`npm start` 自动拉起 SeaTalk（无需手动带 CDP 参数启动）
- MCP：seatalk-reader 消息解析增强（Thread 回复数、富文本、附件元数据）
- ACP：修复模型列表解析支持 `(current, default)` 组合标记

### v2.19.0 (2026-03)

- SeaTalk Agent：Token 消耗实时展示（上下文窗口 + 每轮统计）
- SeaTalk Agent：原生 ACP 模型切换（无需重启 Agent 进程）
- SeaTalk Agent：MCP 使用策略优化（跨群搜索、@我 消息查询）
- MCP：seatalk-reader 新增 `query_mentions` 工具、`query_messages_sqlite` 支持跨群搜索
- ACP：进程异常退出早期检测，避免静默失败

### v2.18.4 (2026-03)

- SeaTalk Agent：会话持久化（重启自动恢复上下文）
- SeaTalk Agent：深色/浅色主题切换
- SeaTalk Agent：面板侧边栏嵌入模式
- SeaTalk Agent：线程内消息全量引用
- SeaTalk Agent：MCP 工具调用过程可视化
- MCP：seatalk-reader 支持打开消息链接、读取 SQLite 历史消息

### v2.18.x (2026-02 ~ 03)

- 新增 SeaTalk Agent（CDP + ACP 架构）
- 新增 seatalk-reader MCP
- 新增 spx-bug-trace Skill
- Chrome 扩展 API 溯源功能增强

### v2.8.x (2026-02)

- 新增 MCP 工具套件（presto-query, ck-query, spark-query, api-trace）
- 新增 API 数据血缘分析
- 项目结构重组

查看 [CHANGELOG.md](docs/CHANGELOG.md) 了解完整更新历史。

---

## 仓库地址

- **GitLab**（主仓库）：https://git.garena.com/tianyi.liang/spx-helper
- **GitHub**（备份）：https://github.com/SperanzaTY/spx-helper

---

## License

[MIT](LICENSE)

**SPX Helper** — 让大数据开发更高效

Made with ❤️ for Shopee Data Engineers

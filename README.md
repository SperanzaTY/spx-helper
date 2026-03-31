# SPX Helper

> **Shopee 大数据开发助手** — Chrome 扩展 + MCP 工具套件 + SeaTalk AI Agent

[![Version](https://img.shields.io/badge/version-2.18.4-blue.svg)](https://github.com/SperanzaTY/spx-helper/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

SPX Helper 是一套为 Shopee 大数据开发工程师打造的效率工具集，包含三个核心模块：

| 模块 | 说明 |
|------|------|
| **Chrome 扩展** | 快速链接、API 数据溯源、日程管理、SQL/HTTP/正则/Mermaid 等实用工具 |
| **MCP 工具套件** | Presto/Spark/ClickHouse 查询、API 血缘分析、SeaTalk 消息读取 — 让 Cursor AI 直接操作数据 |
| **SeaTalk Agent** | 将 Cursor AI Agent 注入 SeaTalk 桌面客户端，在聊天中直接调用 AI 排查问题 |

---

## 快速开始

### 1. Chrome 扩展安装

```bash
git clone https://github.com/SperanzaTY/spx-helper.git
# 或 GitLab：
# git clone https://git.garena.com/tianyi.liang/spx-helper.git
```

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角 **"开发者模式"**
3. 点击 **"加载已解压的扩展程序"**
4. 选择仓库根目录 `spx-helper/`
5. 点击工具栏图标即可使用

### 2. MCP 工具安装（Cursor AI 集成）

**前置条件**：安装 [uv](https://docs.astral.sh/uv/install/)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

在 `~/.cursor/mcp.json` 中添加配置（无需克隆仓库）：

```jsonc
{
  "mcpServers": {
    // Presto 查询
    "presto-query": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/presto-query",
        "presto-query-mcp"
      ],
      "env": {
        "PRESTO_PERSONAL_TOKEN": "你的Token",
        "PRESTO_USERNAME": "你的用户名"
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
    // Spark SQL 查询
    "spark-query": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/spark-query",
        "spark-query-mcp"
      ],
      "env": {
        "LIVY_USERNAME": "DMP用户名",
        "LIVY_PASSWORD": "DMP密码"
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
        "PRESTO_PERSONAL_TOKEN": "你的Token",
        "PRESTO_USERNAME": "你的用户名"
      }
    },
    // SeaTalk 消息读取
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

配置完成后，在 Cursor 设置中 **关闭再开启** 对应 MCP 即可刷新。

> **凭证获取**：见下方 [凭证说明](#凭证获取) 章节。

### 3. SeaTalk Agent 安装

SeaTalk Agent 将 Cursor AI 注入 SeaTalk 桌面端，支持在聊天窗口中直接与 AI 交互、引用消息排查问题。

**前置条件**：
- Node.js 22+（推荐通过 nvm 安装）
- SeaTalk 桌面端开启远程调试端口
- Cursor 已安装 `agent` CLI

**步骤 1：SeaTalk 开启远程调试**

macOS 下修改 SeaTalk 启动参数：

```bash
# 方式一：命令行启动
open -a SeaTalk --args --remote-debugging-port=19222

# 方式二：永久配置（修改 Info.plist 或 Desktop Entry）
# 在 SeaTalk 的启动参数中添加 --remote-debugging-port=19222
```

**步骤 2：安装并启动 Agent**

```bash
cd mcp-tools/seatalk-agent
npm install     # 或 pnpm install
npm start       # 启动 agent
```

Agent 启动后会自动：
1. 通过 CDP 连接 SeaTalk
2. 注入 Cursor 风格的聊天面板
3. 启动 ACP 连接到 Cursor Agent
4. 加载 `~/.cursor/mcp.json` 中配置的所有 MCP 工具

**步骤 3：使用**

- 点击 SeaTalk 侧边栏的 Cursor 图标打开面板
- 直接输入问题，或选中聊天消息点击 "Ask Cursor" 引用到面板
- Agent 会自动调用 MCP 工具查询数据、分析问题

---

## 功能详解

### Chrome 扩展

| 功能 | 说明 |
|------|------|
| **API 数据溯源** | 自动拦截页面 API 请求，记录参数/响应，支持 AI 血缘分析 |
| **快速链接** | 一键访问 Flink/Spark/HDFS/Kafka/DataSuite 等平台 |
| **日程管理** | Google Calendar 集成 + 待办事项看板 |
| **Mermaid 图表** | 流程图/时序图/ER图渲染，支持高清导出 |
| **HTTP 请求测试** | 支持多种请求方式和认证方式 |
| **SQL 格式化** | SQL 格式化/压缩/关键字转换 |
| **时区转换** | 支持 Shopee 各区域时区快速转换 |
| **文本差异对比** | VS Code 风格的字符级差异对比 |
| **正则测试** | 实时匹配、高亮结果 |
| **独立窗口模式** | 常驻桌面，窗口位置自动保存 |

### MCP 工具套件

在 Cursor 中直接用自然语言操作：

```
"查询 spx_mart.dim_station 表最近一天的数据量"
"帮我分析 get_vehicle_list 这个 API 的数据血缘"
"查一下 ClickHouse ck2 集群 spx_ods.ods_order_detail 最近一小时的数据"
"提交一个 Spark SQL 任务到 sg3 集群"
"打开这个 SeaTalk 链接，帮我看看他们在讨论什么问题"
```

| 工具 | 功能 | 凭证 |
|------|------|------|
| **presto-query** | 通过 DataSuite Personal SQL API 查询 Presto | Personal Token + Username |
| **ck-query** | 查询 ClickHouse 集群（ck2/ck6/sg3/br/mx 等） | 团队统一配置 |
| **spark-query** | 通过 Livy 提交 Spark SQL 任务 | DMP Username + Password |
| **api-trace** | API 接口血缘分析，查找上下游依赖 | 同 presto-query |
| **seatalk-reader** | 读取 SeaTalk 聊天消息、打开消息链接 | 需 SeaTalk 开启 CDP |

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

| 工具 | 凭证来源 | 获取方式 |
|------|----------|----------|
| **presto-query / api-trace** | DataSuite Personal Token | 访问 [DataSuite API 管理](https://datasuite.shopee.io/dataservice/ds_api_management) → 左上角 ☰ → 获取 Personal Token |
| **spark-query** | DMP BigData Account | 访问 [DataSuite 个人中心](https://datasuite.shopee.io) → Profile → BigData Account / Password（点击 View） |
| **ck-query** | 团队统一配置 | 密码已配置在 `ck_mcp_server.py` 中 |
| **seatalk-reader** | 无需凭证 | 需 SeaTalk 开启 `--remote-debugging-port=19222` |

---

## 项目结构

```
spx-helper/
├── manifest.json                 # Chrome 扩展配置（MV3）
├── background.js                 # Service Worker（消息中枢）
├── content.js                    # 内容脚本（API 拦截 UI）
├── injected.js                   # 注入脚本（fetch/XHR Hook）
├── popup.html / popup.js         # 扩展主界面
├── styles.css                    # 扩展样式
├── images/                       # 扩展图标
│
├── mcp-tools/                    # MCP 工具套件
│   ├── presto-query/             # Presto 查询（Python, FastMCP）
│   ├── ck-query/                 # ClickHouse 查询
│   ├── spark-query/              # Spark SQL（Livy）
│   ├── api-trace/                # API 血缘溯源
│   ├── seatalk-reader/           # SeaTalk 消息读取（CDP）
│   ├── seatalk-group/            # SeaTalk 群组管理
│   └── seatalk-agent/            # SeaTalk AI Agent（Node + TypeScript）
│       ├── src/main.ts           # 主入口（CDP + ACP 编排）
│       ├── src/acp.ts            # Cursor ACP 客户端
│       ├── src/bridge.ts         # CDP ↔ 注入脚本通信桥
│       ├── src/cdp.ts            # Chrome DevTools Protocol 客户端
│       └── src/inject/           # 注入到 SeaTalk 的 UI 脚本
│           ├── cursor-ui.js      # 基础 UI 层（面板、Markdown 渲染）
│           └── sidebar-app.js    # 聊天面板（对话、工具调用、主题）
│
├── .cursor/skills/               # Cursor Skills
│   └── spx-bug-trace/            # Bug 排查技能（API 溯源 + 数据验证流程）
│
├── scripts/                      # 构建/发布/测试脚本
├── docs/                         # 文档（安装、使用、架构、变更日志）
└── share-package/                # 可分发的 Presto 查询工具包
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

| 步骤 | 组件 | 效果 |
|------|------|------|
| 1 | Chrome 扩展 | API 溯源、快速链接、日程、工具箱 |
| 2 | presto-query MCP | Cursor 中查询 Presto 数据 |
| 3 | ck-query MCP | Cursor 中查询 ClickHouse |
| 4 | spark-query MCP | Cursor 中提交 Spark SQL |
| 5 | api-trace MCP | Cursor 中分析 API 血缘 |
| 6 | seatalk-reader MCP | Cursor 中读取 SeaTalk 消息 |
| 7 | SeaTalk Agent | 在 SeaTalk 中直接使用 AI（集成以上所有 MCP） |
| 8 | spx-bug-trace Skill | 标准化 Bug 排查流程 |

> 每个组件独立可用，按需安装即可。SeaTalk Agent 是最高级的集成形态，它会自动加载所有已配置的 MCP 工具。

---

## 开发

### 扩展开发

修改代码后在 `chrome://extensions/` 点击刷新即可热加载。

### MCP 工具开发

各 MCP 工具基于 Python FastMCP 框架，入口文件即 `*_server.py` 或 `*_mcp_server.py`。

### SeaTalk Agent 开发

```bash
cd mcp-tools/seatalk-agent
npm run dev    # tsx watch 模式，代码修改自动重启
```

---

## 更新日志

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

# SeaTalk Cursor Agent 使用指南

> 在 SeaTalk 里直接和 AI 对话、引用消息排查问题、查数据写 SQL — 不用离开聊天窗口。

---

## 这是什么？

SeaTalk Agent 是一个注入到 SeaTalk 桌面客户端的 AI 助手侧边栏。它把 Cursor IDE 的 AI 能力带进了 SeaTalk：

- 在 SeaTalk 聊天中直接提问，AI 帮你分析问题
- 选中聊天消息一键发给 AI，带上下文分析
- AI 可以调用 MCP 工具查 Presto/ClickHouse、读 SeaTalk 消息、追踪 API
- 支持多工作区切换，AI 能直接读你项目的代码

简单说：**它就是 SeaTalk 里的 Cursor**。

---

## 安装（3 分钟搞定）

### 前置条件

- macOS
- Node.js v22+（推荐用 nvm 管理）
- [Cursor IDE](https://www.cursor.com/) 已安装并登录
- **Cursor Agent CLI**（`~/.local/bin/agent`）— 见下方安装步骤
- SeaTalk 桌面客户端

### 一键安装

```bash
# 1. 安装 Cursor Agent CLI（必须！没有它 Agent 无法连接 Cursor）
curl https://cursor.com/install -fsSL | bash

# 2. 克隆项目（GitLab 为主仓库，推荐优先使用）
git clone https://git.garena.com/tianyi.liang/spx-helper.git
# 或 GitHub 镜像：git clone https://github.com/SperanzaTY/spx-helper.git
cd spx-helper/seatalk-agent

# 3. 安装 Node.js 依赖（不可跳过，否则 npm start 会报错）
npm install

# 4. 一键安装 Agent + seatalk 命令
bash install.sh
```

安装完成后，**重新打开终端**（让 shell 配置生效），输入 `seatalk` 即可启动。

> **易错提醒**：步骤 1（安装 Cursor Agent CLI）是最容易遗漏的。如果跳过，`npm start` 时会报 `spawn agent ENOENT` 错误。

安装脚本会配置：
- **Agent 自动启动**（开机自启，崩溃自动重启）：Agent 通过 SIGUSR1 + V8 Inspector 连接 SeaTalk，无需特殊启动参数
- **`seatalk` 命令**：终端一键启动 Agent

> 安装后你可以用任何方式打开 SeaTalk（双击、Dock、Spotlight 都可以），Agent 会自动检测并连接。
> SeaTalk 无需以特殊参数启动，即使 SeaTalk 自重启也不影响 Agent 连接。

### 卸载

```bash
bash install.sh uninstall
```

---

## 启动

### 方式一：使用 `seatalk` 命令（推荐）

```bash
seatalk
```

这个命令会自动：
1. 以 CDP 模式启动 SeaTalk 客户端
2. 连接 SeaTalk 页面
3. 注入 AI 侧边栏
4. 连接 Cursor Agent

看到以下日志说明启动成功：

```
[agent] SeaTalk launched with --remote-debugging-port=19222
[agent] connected: SeaTalk (https://web.haiserve.com/)
[agent] SPA ready
[agent] injection complete!
[agent] ACP agent connected
```

### 方式二：直接打开 SeaTalk（需先运行过 install.sh）

如果你已经运行过 `install.sh`，可以用任何方式打开 SeaTalk（双击图标、Dock、Spotlight）。CDP 守护进程会在后台自动将其重启为 CDP 模式（SeaTalk 会闪一下）。然后启动 Agent：

```bash
cd spx-helper/seatalk-agent
npm start
```

### 方式三：手动分步启动（未安装守护进程）

如果没有运行过 `install.sh`：

```bash
# 1. 先完全退出 SeaTalk（Cmd+Q 或 pkill SeaTalk）

# 2. 以 CDP 模式打开 SeaTalk
open -a SeaTalk --args --remote-debugging-port=19222

# 3. 等 SeaTalk 打开后，启动 Agent
cd spx-helper/seatalk-agent
npm start
```

### 验证 CDP 是否生效

如果不确定 SeaTalk 是否以 CDP 模式运行，在终端执行：

```bash
curl -s http://127.0.0.1:19222/json
```

- 返回 JSON 数据 → CDP 已启用，可以启动 Agent
- 返回"连接被拒绝" → CDP 未启用，参考上面的启动方式

---

## 更新仓库 / 升级 Cursor 后：快速恢复

你在 **拉取 spx-helper、或 Cursor 大版本升级** 后，可按下面顺序恢复 SeaTalk 侧边栏与 Cursor 里的 SeaTalk MCP，**无需在脚本里人为 `sleep` 很久**：进程启动快慢主要取决于 **CDP 是否已监听** 与 **ACP 认证/建会话**，不是「多睡几秒」能解决的。

### 1. 同步代码与 Agent 依赖

```bash
cd spx-helper   # 仓库根目录
git pull origin release   # 或你的工作流所用分支

cd seatalk-agent
npm install
# 若 install.sh / LaunchAgent / AGENT_DIR 有变更，再执行：
# bash install.sh
```

### 2. Cursor 里的 SeaTalk MCP（seatalk-reader / seatalk-group）

侧边栏发消息、读会话等能力在 Agent 注入脚本里；**在 Cursor Chat / Agent 里调 MCP 工具**则走 `~/.cursor/mcp.json` 的 **uvx** 配置。

- **必做**：Cursor → **Settings → MCP**，对 **seatalk-reader**、**seatalk-group**（以及本次有更新的其他 MCP）各 **关闭再开启** 一次，否则会沿用旧子进程。
- **推荐（已克隆本仓库时，刷新最快）**：用**本地路径**预热 uv 缓存，避免仅从 GitLab 拉取时 `uvx --reinstall` 卡住一到数分钟：

```bash
cd spx-helper/mcp-tools/seatalk-reader
uvx --reinstall --from . seatalk-reader-mcp --help >/dev/null

cd ../seatalk-group
uvx --reinstall --from . seatalk-group-mcp --help >/dev/null
```

若 `mcp.json` 里仍是 `git+https://git.garena.com/.../spx-helper@release#subdirectory=mcp-tools/...`，也可在终端对同一 URL 执行 `uvx --reinstall --from 'git+...'` **强制重装**，但依赖网络与 Git，**往往比 `--from .` 慢很多**。

更细的 MCP 说明见 **[MCP 工具使用指南](./MCP_TOOLS.md)**。

### 3. 重启 seatalk-agent（注入与 ACP）

```bash
# 结束旧实例（有则杀；无则忽略报错）
pkill -f 'launch-seatalk\.sh' 2>/dev/null || true
pkill -f 'tsx src/main\.ts' 2>/dev/null || true

seatalk
```

若希望不占终端：

```bash
nohup bash ~/.seatalk-agent/launch-seatalk.sh >> ~/.seatalk-agent/logs/launcher-nohup.log 2>&1 &
```

**刚启动后立刻执行** `curl http://127.0.0.1:19222/json` **可能仍失败**，属于 SeaTalk / CDP 尚未就绪；**几秒后再试**即可。排障看：

```bash
tail -f ~/.seatalk-agent/logs/agent.log
```

出现 **`injection complete!`** 表示页面注入完成；若 **`SPA ready` 很快但注入很晚**，多半是 **`authenticating` / 建 session / 加载 mcp.json** 阶段较慢（与网络、Cursor 服务有关）。

### 4. 运行时大概有哪些进程（便于排查）

| 角色 | 说明 |
|------|------|
| `launch-seatalk.sh`（bash） | 可选；负责在需要时以 CDP 拉起 SeaTalk 并循环启动 `tsx src/main.ts` |
| `npm exec tsx` / `node … tsx … main.ts` | seatalk-agent 主进程，连 CDP、注入脚本、管 Bridge |
| `~/.local/bin/agent` | ACP 子进程，对接 Cursor 能力与 MCP |
| SeaTalk 自身 | Electron 多进程（主进程、GPU、网络、Renderer 等），**多个属正常** |

---

## 技术架构概览

```
SeaTalk 桌面端 (Electron, CDP port 19222)
  └── 页面内注入的 JS
        ├── cursor-ui.js         UI 基础组件（面板、按钮、CSS）
        ├── sidebar-app.js       面板逻辑（对话、设置、更新）
        ├── seatalk-send.js      消息发送（__seatalkSend）
        └── seatalk-watch.js     消息监听（Remote 远程控制）

Node.js 后端 (seatalk-agent/src/main.ts)
  ├── CdpClient     连接 SeaTalk CDP，注入脚本、收发消息
  ├── Bridge        消息桥：页面 ↔ Node 双向通信
  ├── ACP Agent     主 AI Agent（Cursor Agent Protocol）
  ├── Remote Agent  独立 AI Agent，处理远程控制指令
  └── Updater       解析 Git remote（gitlab / origin 等），对 release 做 fetch & rebase

进程管理
  └── launch.sh     进程监控，exit(42) 自动重启
```

---

## 界面总览

启动后，SeaTalk 左侧栏会多出一个 **✦ 星形图标**，点击打开 AI 面板。

### 面板布局

```
┌─────────────────────────────────┐
│ Agent │ Ask │ Plan   [历史][+][☀]│  ← 顶栏：模式切换 + 操作按钮
├─────────────────────────────────┤
│ 📁 SPX_Helper              ▼   │  ← 工作区条：点击切换项目
├─────────────────────────────────┤
│                                 │
│       消息区域                   │  ← 对话内容、AI 回复、工具调用
│                                 │
├─────────────────────────────────┤
│ [Model ●]       [○ 自动发送]    │  ← 模型选择 + 发送权限开关
│ ┌───────────────────────┐ 📎 ▶  │  ← 输入框 + 图片按钮 + 发送
│ └───────────────────────┘       │
├─────────────────────────────────┤
│ ● Connected  vX.Y.Z  model  ⚙  │  ← 状态栏
└─────────────────────────────────┘
```

### 面板操作

| 操作 | 方式 |
|------|------|
| 打开/关闭 | 点击侧栏 ✦ 图标，或按 **Ctrl+Shift+A** |
| 拖动位置 | 按住顶栏空白区域拖动（位置自动保存，重启后恢复；拖拽不会超出窗口） |
| 调整大小 | 拖动面板边缘或角落（尺寸自动保存） |
| 停靠到右侧 | 点击顶栏的停靠图标（面板变成侧边栏的一部分） |
| 切换主题 | 点击顶栏的太阳/月亮图标（深色/浅色） |

---

## 三种模式

### Agent 模式（推荐日常使用）

AI 拥有完整的工具调用能力，可以：
- 读写项目文件
- 执行终端命令
- 调用 MCP 工具（查数据库、读 SeaTalk 消息等）
- 搜索代码库

**适用场景**：排查问题、查数据、写代码、分析日志

### Ask 模式

AI 只能回答问题，不能修改文件或执行命令。

**适用场景**：纯问答、解释概念、讨论方案

### Plan 模式

AI 帮你制定方案，分析利弊，但不直接执行。

**适用场景**：大型重构前的设计讨论、方案评估

---

## 核心功能

### 1. 直接对话

在输入框输入问题，按 **Enter** 发送。AI 会根据当前工作区的代码上下文回答。

**示例**：
```
> 这个 Flink 任务为什么全量重启了？
> 帮我查一下 VN 昨天的 fleet order 数据量
> spx_mart.dwd_spx_fleet_order_df_sg 这个表有哪些字段？
```

### 2. 引用 SeaTalk 消息提问（Ask Cursor）

当同事在群里发了一个问题，你想让 AI 帮忙分析：

1. **鼠标悬停**在消息气泡上，弹出快捷菜单
2. 点击菜单中的 **✦ 图标**
3. AI 面板自动打开，并附带该消息及前后 5 条上下文
4. 在输入框补充你的问题，发送即可

> AI 会看到完整的聊天上下文，理解问题的来龙去脉。

### 3. 划词提问

在聊天中看到一段内容想深入了解：

1. 用鼠标**选中文字**
2. 出现紫色的 **Ask Cursor** 浮动按钮
3. 点击按钮，AI 面板打开并带入选中内容和周围上下文

### 4. 图片分析

AI 可以看图。三种方式发送图片：

- 点击输入框旁的 **📎 图片按钮**选择文件
- 直接**粘贴**剪贴板中的截图（Cmd+V / Ctrl+V）
- **拖拽**图片文件到输入区域

最多同时发送 4 张图片，支持 PNG/JPEG/GIF/WebP。

**适用场景**：截图告警消息让 AI 分析、贴监控图表让 AI 解读

### 5. MCP 工具调用

在 Agent 模式下，AI 可以直接调用配置好的 MCP 工具：

| 工具 | 能力 |
|------|------|
| **Presto 查询** | 直接执行 SQL 查 Hive 表 |
| **ClickHouse 查询** | 查实时数据 |
| **Spark 查询** | 大数据量计算 |
| **SeaTalk 消息** | 搜索群消息、查 @我 的消息、导航到指定群聊、读取转发聊天记录 |
| **API 追踪** | 分析接口调用链路 |
| **DataStudio** | 管理 DataStudio 资产：下载/上传/更新 SQL 文件、浏览目录结构 |
| **Scheduler 查询** | 查询 DataSuite Scheduler 任务状态、运行实例、血缘依赖、性能指标、操作日志 |

**示例对话**：
```
> 帮我查一下 spx_mart.dwd_spx_fleet_order_df_sg 表里 order_type 的分布
AI: [调用 Presto 查询工具] 查询结果如下...

> 有哪些 @我 的消息还没处理的？
AI: [调用 SeaTalk 消息工具] 最近 72 小时共 50 条 @你的消息...

> 把 DataStudio 上 spx/mart/ 目录下的 SQL 同步到本地
AI: [调用 DataStudio 工具] 已下载 15 个文件到本地...

> 帮我看下刚才转发的聊天记录里说了什么
AI: [读取 SeaTalk 消息] 这是一段包含 14 条消息的转发聊天记录，内容如下...

> dwd_spx_spsso_order_spx_reliable_di_vn 这个任务昨天为什么失败了？
AI: [调用 Scheduler 查询工具] 查到最近 5 天的运行记录，失败原因是上游依赖超时...

> 帮我看下 studio_10429983 这个任务的上下游血缘
AI: [调用 Scheduler 查询工具] 上游依赖 3 个任务，下游有 5 个任务...
```

### 6. 发送消息与权限控制

AI 可以帮你发送消息、线程回复、撤回消息或添加好友，但默认需要你的确认。

**确认流程**：当 AI 调用以下操作时，消息流中会出现一张确认卡片：

- **发送消息** — 显示目标会话和消息预览
- **线程回复** — 显示目标会话、rootMid（线程 ID）和消息预览
- **撤回消息** — 红色主题卡片，显示会话和消息 ID
- **添加好友** — 显示用户名和 ID

你可以点击「确认」执行或「取消」拒绝。

**自动发送模式**：输入框上方有「自动发送」开关（与 Model 选择同行）。开启后**所有操作**（发送、回复、撤回、加好友）都自动执行，不再弹确认卡片。适合批量操作场景，用完记得关闭。

**安全机制**：
- MCP 工具无法直接执行操作，必须经过 Agent 的确认流程
- AI 只有在你**明确要求**时才会调用这些功能
- 私聊只能给好友发消息，非好友会假发送（前端成功但对方收不到）

### 7. 自动更新

Agent 会在后台自动检查新版本（拉取 **`release` 分支** 的远端引用）：
- 启动后约 3 秒首次检查，之后每 10 分钟检查一次
- 有更新时，状态栏的版本号会高亮闪烁
- 点击版本号查看更新详情，一键更新后自动重启

也可以通过 **设置菜单（⚙）→ 检查更新** 手动触发。

> **Git remote 说明（v3.4.5+）**：更新器会按顺序选用：环境变量 **`SPX_UPDATE_GIT_REMOTE`**（若设置）→ 已配置的 **`gitlab`** → **`origin`** 且 URL 含 `git.garena.com` / `garena.com` 时 → 否则仍尝试 **`origin`**。仅克隆 GitLab 且只配了 `origin` 时无需再单独添加 `gitlab`。若 `origin` 是 GitHub、仍需跟团队主仓对齐，可执行：`git remote add gitlab https://git.garena.com/tianyi.liang/spx-helper.git`，或设置 `SPX_UPDATE_GIT_REMOTE=gitlab`。

---

## 工作区管理（重要！）

### 什么是工作区？

工作区就是 AI 当前关注的项目目录。**工作区的选择直接影响 AI 回答的质量**：

- AI 只能读取和搜索**当前工作区**下的代码
- MCP 工具的配置也跟工作区关联
- 不同工作区的对话历史互相独立

### 切换工作区

点击面板中的 **📁 工作区条**（显示当前项目名），会弹出工作区选择器：

- **最近使用**：你之前切换过的工作区会自动记住，显示在列表最上方（最多记忆 10 个）
- **本机项目**：自动扫描 `~/Cursor/`、`~/Projects/`、`~/workspace/`、`~/code/` 等常见目录下的项目
- **搜索过滤**：在搜索框输入关键词快速找到项目
- **手动输入**：搜索框中输入完整路径，按 Enter 使用
- **浏览...**：弹出 macOS 文件夹选择对话框

> 切换过的工作区会永久记住，下次打开选择器时直接显示在「最近使用」分组里，不用再翻找。

### 最佳实践

#### 场景 1：排查代码问题

```
✅ 切换到对应项目的工作区
   工作区: ~/Cursor/spxmgmtappsop
   问题: "fleet_order_measurement 任务的 SQL 有什么问题？"
   → AI 能直接找到并读取对应的 SQL 文件

❌ 在 SPX_Helper 工作区问其他项目的代码
   → AI 找不到文件，只能猜测
```

#### 场景 2：查数据

```
✅ 任何工作区都可以（MCP 工具不依赖工作区文件）
   问题: "用 Presto 查一下 VN 昨天的数据"
   → AI 调用 MCP 工具，工作区无关

   但如果你想让 AI 参考项目中的 SQL 模板或文档：
   → 切换到 SpxMgmtAppSop 工作区更好
```

#### 场景 3：分析 SeaTalk 消息

```
✅ 任何工作区都可以
   问题: "看下有什么 @我 的消息还没处理"
   → 调用 SeaTalk MCP 读消息，不依赖工作区

   但如果消息涉及某个项目的 Bug：
   → 先切到对应项目工作区，AI 排查时能直接看代码
```

#### 场景 4：纯聊天问答

```
✅ 随便哪个工作区
   问题: "解释一下 Flink 的 checkpoint 机制"
   → 纯知识问答，不需要读代码
```

### 工作区选择原则

| 你想做的事 | 推荐工作区 |
|-----------|----------|
| 排查某项目的 Bug | 切到该项目 |
| 查 Hive/CK 数据 | 任意（推荐数据项目） |
| 读 SeaTalk 消息 | 任意 |
| 写/改代码 | 切到目标项目 |
| 通用技术问答 | 任意 |

> **记住**：工作区 = AI 能看到的代码范围。选错工作区，AI 就像闭着眼干活。

---

## 对话管理

### 新建对话

点击顶栏的 **+** 按钮，开始一段新对话。之前的对话会自动保存。

### 查看历史

点击顶栏的 **时钟图标**，查看最近 50 条对话记录。点击任意一条可以恢复。

> 切换到历史对话时，如果那条对话是在不同工作区下创建的，会自动切换回对应的工作区。

### 对话中的内容

AI 的回复中你会看到：

- **💭 thinking**：AI 的思考过程（可点击展开/折叠）
- **✅/⏳ 工具调用**：AI 使用的工具及输入输出（可点击展开详情）
- **最终结论**：AI 的回答文本（如果有工具调用，会用虚线分隔，确保你能看到）
- **Token 用量**：每轮对话消耗的 Token 数

---

## 模型选择

点击输入框上方的 **Model 徽章**，可以切换 AI 模型：

| 模型类型 | 特点 | 适用场景 |
|---------|------|---------|
| Claude | 代码理解强、推理能力好 | 复杂代码分析、Bug 排查 |
| GPT-5 系列 | 通用能力强 | 日常问答、写文档 |
| Gemini | 多模态能力强 | 图片分析 |

> 切换模型不会丢失对话上下文，当前会话继续保持。

---

## Remote 远程控制

通过 SeaTalk 的 Saved Messages（自己给自己发消息）远程操控 Cursor Agent——即使你不在电脑前，用手机也能给 Agent 下指令。

### 使用场景

- 出门在外，手机上想让 Agent 帮你跑个查询、改段代码
- 不想打开 Cursor IDE，直接在 SeaTalk 里对 Agent 下达指令
- 需要远程触发 Agent 执行某些自动化任务

### 启动状态

Remote 远程控制**默认自动开启**。Agent 启动后会自动 spawn 独立的 Remote Agent，无需手动操作。

点击 SeaTalk 左侧边栏的 **Remote 按钮**（Caladbolg 图标）可查看状态和日志：
- **● 等待远程指令...** → 已就绪，可以发送指令
- **○ 未启动** → 可通过 popover 中的开关手动开启，或发送 `!!remote on`

### 如何使用

1. 打开 SeaTalk 的 **Saved Messages**（点击自己头像进入和自己的对话）
2. 直接输入你想让 Agent 执行的指令，比如：
   - `帮我查一下昨天 user_login 表的数据量`
   - `看看 src/main.ts 里有没有内存泄漏的风险`
   - `帮我看看最近的 git log，总结一下改了什么`
3. Agent 收到指令后会自动执行，完成后在同一对话中回复结果

### 回复格式

Agent 的回复使用结构化 Markdown 格式，方便在手机端快速区分你的指令和 Agent 的回复：

**AI 指令回复**（经过 ACP Agent 处理）：
```
**Remote Agent** · `composer-2-fast`
━━━━━━━━━━━━━━
**指令**: `你发送的指令内容`

（Agent 的执行结果）

━━━━━━━━━━━━━━
*⏱ 12.3s · SpxMgmtAppSop*
```
标题行显示当前使用的 AI 模型，尾部显示回复时长和当前工作区名。

**系统指令回复**（`!!` 前缀，不经过 AI）：
```
**Remote Agent**
━━━━━━━━━━━━━━
（指令结果）

━━━━━━━━━━━━━━
*14:30:12*
```
仅显示时间戳（系统指令不经过 AI，无模型/工作区信息）。

### 日志面板

Remote popover 面板下方有一个实时日志区域，显示远程控制的完整生命周期：

| 日志类型 | 说明 |
|---------|------|
| 蓝色（info） | 正常状态：开启/关闭、Agent 就绪、指令接收、回复发送 |
| 黄色（warn） | 警告：Agent 进程退出、指令被忽略 |
| 红色（error） | 错误：Agent 启动失败、指令执行异常 |

日志最多保留 50 条，超出自动清理旧记录。

### 系统指令（`!!` 前缀）

以 `!!` 开头的消息会被识别为系统指令，**不经过 ACP Agent**，直接由后端处理，响应极快：

| 指令 | 说明 |
|------|------|
| `!!ping` | 存活检测，立即回复 pong |
| `!!status` | 查看运行状态（运行时长、进程、Session ID、模型、工作区） |
| `!!help` | 显示所有系统指令列表 |
| `!!use <model>` | 切换 AI 模型（立即生效） |
| `!!use` | 查看当前使用的模型 |
| `!!ls models` | 列出所有可用模型 |
| `!!reset` | 重置远程 Agent 会话 |
| `!!logs [N]` | 查看最近 N 条 Remote 日志（默认 20） |
| `!!remote on/off` | 远程开关远程控制 |
| `!!remote` | 查看远程控制状态 |

> `!!remote on/off` 即使在远程控制关闭的状态下也能生效，方便随时远程重新开启。

### 消息冻结

当你快速连发两条消息时，Remote Agent 会自动处理冲突：

1. 第一条消息正在执行中
2. 第二条消息到达 → 第一条被"冻结"
3. 第一条完成后**跳过回复**，直接执行第二条

这样你可以随时用新消息覆盖上一条，不用等待上一条执行完毕。系统指令（`!!` 前缀）不受冻结影响，始终立即响应。

### 注意事项

- Remote Agent 与主面板的 Agent 是**独立的进程**，互不影响
- Remote Agent 运行在 **Agent 模式**下，拥有完整的工具权限（读写文件、执行命令、调用 MCP 工具等）
- 仅监听 Saved Messages（自己给自己的消息），不会监听或回复其他聊天
- 如果发送指令时 Agent 正在启动中，指令会自动排队，不会丢失
- 关闭远程控制后，Remote Agent 进程会继续保留，下次开启时可以复用

---

## 设置与诊断

点击状态栏右侧的 **⚙ 齿轮图标**：

| 菜单项 | 说明 |
|--------|------|
| 重连 Agent | AI 连接断了时用，重新建立 ACP 连接 |
| 重新注入 UI | 面板显示异常时用，重新注入界面代码 |
| 重启 Agent | 彻底重启整个 Agent 进程（包括 main.ts 代码重新加载），更新代码后必须重启 |
| 查看后端日志 | 查看最近 100 条后端日志，排查连接问题 |
| 诊断信息 | 查看 CDP/ACP 连接状态、工作区、模型等信息 |
| 检查更新 | 手动检查是否有新版本 |

---

## 常见问题

### `npm start` 报错 `spawn agent ENOENT`

**原因**：缺少 Cursor Agent CLI（`~/.local/bin/agent`），这是最常见的安装遗漏。

**解决**：

```bash
curl https://cursor.com/install -fsSL | bash
```

安装完成后重新 `npm start` 即可。可通过 `~/.local/bin/agent --version` 验证是否安装成功。

### SeaTalk 打开了但看不到 Cursor 面板

1. 确认已运行过 `bash install.sh`（安装 CDP 守护进程，自动处理 CDP 模式）
2. 确认 Agent 在运行：终端执行 `seatalk` 或 `cd seatalk-agent && npm start`
3. 如果还是不行，验证 CDP 是否生效：`curl -s http://127.0.0.1:19222/json`
4. 如果 CDP 没开启且未安装守护进程，手动退出 SeaTalk 后执行：`open -a SeaTalk --args --remote-debugging-port=19222`

### SeaTalk 启动后会闪一下

这是正常现象。CDP 守护进程检测到 SeaTalk 未开启 CDP 端口时，会自动重启它。只在每次打开 SeaTalk 时发生一次，之后正常使用。

### CDP 守护进程已安装但 19222 端口不通

CDP 守护进程**不会主动启动 SeaTalk**，它只在 SeaTalk 已运行时检测并重启为 CDP 模式。请先手动打开 SeaTalk（双击/Dock/Spotlight），守护进程会在几秒内自动检测并重启它。

检查守护进程状态：

```bash
launchctl list | grep seatalk    # 应看到 com.seatalk.cdp-daemon
cat ~/.seatalk-agent/logs/cdp-daemon.log  # 查看守护进程日志
```

### 不要直接运行 SeaTalk 二进制文件带 CDP 参数

直接执行 `/Applications/SeaTalk.app/Contents/MacOS/SeaTalk --remote-debugging-port=19222` 会报 `bad option` 错误。SeaTalk 的 Electron 包装器不接受直接参数。

**正确做法**：必须通过 `open` 命令传递参数：

```bash
open -a SeaTalk --args --remote-debugging-port=19222
```

或直接使用 `bash install.sh` 安装 CDP 守护进程，它会自动处理。

### Agent 日志卡在 "authenticating..." 很久

首次启动时 ACP 认证可能需要 30-60 秒，这是正常的。只要最终出现 `ACP agent connected` 就表示成功。如果超过 2 分钟仍未完成：

1. 确认 Cursor IDE 已打开并**已登录**（Agent CLI 通过 Cursor 账号认证）
2. 检查网络连接
3. 尝试 `Ctrl+C` 终止后重新 `npm start`

### Agent 日志一直显示 "waiting for SeaTalk..."

1. 确认 SeaTalk 正在运行
2. `curl -s http://127.0.0.1:19222/json` 应返回 JSON
3. 如果已安装守护进程，检查日志：`cat ~/.seatalk-agent/logs/cdp-daemon.log`
4. 确保没有其他程序占用 19222 端口：`lsof -i :19222`

### `npm start` 报错 MODULE_NOT_FOUND

`node_modules` 目录缺失，安装时漏掉了 `npm install`。

```bash
cd spx-helper/seatalk-agent
npm install
npm start
```

### AI 没有回应

1. 检查状态栏是否显示 **● Connected**
2. 如果显示断开，点击 **重连** 按钮
3. 检查 Cursor IDE 是否已打开并登录
4. 设置菜单 → **重启 Agent**

### AI 说"找不到文件"

大概率是工作区选错了。点击工作区条，切换到正确的项目。

### MCP 工具调用失败

1. 确认 Cursor 的 MCP 配置正确（`~/.cursor/mcp.json`）
2. 确认环境变量已设置（如 `PRESTO_PERSONAL_TOKEN`）
3. 查看后端日志排查具体错误

### 更新后功能异常

设置菜单 → **重新注入 UI** 即可刷新面板代码。

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| **Ctrl+Shift+A** | 打开/关闭 AI 面板 |
| **Enter** | 发送消息 |
| **Shift+Enter** | 输入换行 |

---

## 更新日志

### v3.4.13
- **CDP 连接重构为 SIGUSR1 Inspector 方案**：彻底解决 SeaTalk 自重启（self-relaunch）导致 CDP 端口丢失的问题。Agent 不再杀/重启 SeaTalk，不再依赖 `--remote-debugging-port` 参数
- **断连自动重连**：SeaTalk 关闭再打开后，Agent 自动重连并重新注入 UI（不再 crash）。断连类错误（`Cannot find context`、`not connected` 等）触发重连而非进程退出
- **旧守护进程自动清理**：Agent 启动时检测并移除旧 `com.seatalk.cdp-daemon` LaunchAgent，避免 SeaTalk 被旧 daemon 周期性杀掉
- **删除 CDP 守护进程**：`seatalk-cdp-daemon.sh` 不再需要，`install.sh` 简化
- **发版群通知**：推送 release 时自动向 SeaTalk 问题反馈群发送更新通知

### v3.4.8
- **修复系统命令被 remote 开关拦截**：关闭远程控制后 `!!ping`/`!!help`/`!!status` 等系统命令仍可正常响应

### v3.4.7
- **修复更新弹窗按钮重复**：更新完成超时后不再出现两个"重新检查"按钮

### v3.4.6
- **更新/重启超时提示优化**：去除"更新成功"弹窗，统一引导用户在 Cursor IDE 中重启 Agent

### v3.4.4
- **更新面板 UI 优化**：SVG 图标、分步进度日志、更新成功后 NEW 标签、弹窗自动关闭

### v3.4.3
- **修复自动更新检测**：chore/docs 类型提交（不升版本号）也能正确触发更新推送
- **优化更新提示显示**：版本号相同时显示 `v3.4.2 +1` 而非 `v3.4.2 → v3.4.2`

### v3.4.2
- **Remote 回复信息增强**：标题显示当前模型名称，尾部显示回复时长和工作区名
- **重启进度日志**：点击"重启 Agent"后在消息区展示分步进度、自动计时和重连状态
- **主题适配**：重启日志颜色使用 CSS 变量，深色/浅色主题均可正常阅读

### v3.4.1
- **Remote 回复优化**：尾部显示回复时长，替代原来的时间+字数
- **`!!logs` 系统命令**：远程查看最近 N 条 Remote 日志，方便手机端排查
- **前端注入去重**：修复 re-inject 时旧 DOM 元素残留和事件监听器累积的问题

### v3.4.0
- **Updater 追踪 GitLab**：自动更新改为追踪 gitlab remote，解决部分同事无 GitHub 权限的问题
- **Agent 重启鲁棒性**：`restart_agent` 改进：支持 `launch.sh` 守护模式（exit 42）和独立模式（spawn + 日志重定向），避免重启后进程静默消失
- **前端注入去重机制**：re-inject 时通过 AbortController + `__cursorSidebarCleanup` 清理旧 DOM 元素、事件监听器和 MutationObserver，防止 UI 重复加载

### v3.3.1
- **系统指令**：`!!ping/status/help/use/ls/reset/remote` — 不经过 ACP Agent，直接响应
- **消息冻结**：连发多条消息时，旧消息自动冻结，只执行最新一条
- **Remote 默认开启**：Agent 启动后自动启动远程控制，无需手动开启

### v3.3.0
- **Remote 远程控制**：通过 SeaTalk Saved Messages 远程操控 Cursor Agent，手机也能下指令
- **Remote 日志面板**：popover 内嵌实时日志，展示远程控制完整生命周期
- **Markdown 卡片回复**：Remote Agent 回复使用结构化 Markdown 格式，手机端轻松区分指令和回复
- **UI 对齐优化**：侧边栏按钮对齐原生 SeaTalk 图标，"免确认"更名为"自动发送"
- **Agent 重启修复**：`restart_agent` 改为自启动新进程，不再依赖 launch.sh
- **ACP 增强**：`spawnAgent` 支持 `sessionMode` 参数和工具权限过滤

### v3.2.3
- **修复孤儿进程泄漏**：解决 Agent 重启/更新后残留 npm/tsx/ACP 子进程导致内存持续上涨的问题
- **进程树清理**：退出时递归杀死完整子进程树，而非仅杀单个 PID
- **误杀防护**：识别完整进程族谱（祖先+子孙），避免启动时清理逻辑误杀自身

### v3.2.2
- **更新后自动重启**：Agent 更新完成后自动重启 Node 进程并重新注入前端 UI 脚本，无需手动操作
- **修复重启/重新注入 UI**：修复设置菜单中"重启 Agent"和"重新注入 UI"不生效的 bug

### v3.2.1
- **统一文档管理**：`docs/guides/` 下各模块专属指南
- **设置菜单优化**：SVG 图标替换 emoji，移除冗余"重连 Agent"选项
- **链接处理**：Agent 消息中的链接改为系统浏览器打开

### v3.0.4
- **Scheduler 查询工具**：新增 DataSuite Scheduler MCP，支持查询任务状态、运行实例、上下游血缘、性能指标、操作日志、治理违规等，快速定位任务失败原因

### v3.0.3
- **最近使用工作区**：工作区选择器新增「最近使用」分组，切换过的工作区自动记忆，下次打开直接显示在最上方
- **工作区扫描增强**：自动扫描范围扩展到 `~/Projects/`、`~/workspace/`、`~/code/` 等常见项目目录
- **转发聊天记录解析**：AI 现在可以完整读取 SeaTalk 中转发的聊天记录内容，包括每条子消息的发送人和内容
- **DataStudio MCP 集成**：新增 DataStudio 工具，支持浏览/下载/上传/更新 DataStudio 上的 SQL 资产
- **更新流程优化**：更新完成后自动重启，新增更新进度提示

### v3.0.2
- AI 回复结论展示优化，工具调用后自动滚动到最终结论
- Thinking 消息折叠显示
- Token 用量统计

---

## 小贴士

1. **善用 Ask Cursor**：遇到不懂的消息，直接点 ✦ 让 AI 解释，省去复制粘贴
2. **先选工作区再提问**：特别是排查代码问题时，先切到对应项目
3. **图片比文字高效**：告警截图直接粘贴，比手动抄内容快得多
4. **用 Agent 模式查数据**：直接说"帮我查 XXX 表的数据"，AI 会自动写 SQL 并执行
5. **历史对话可恢复**：上次排查到一半？从历史记录里找回来继续
6. **停靠模式更方便**：聊天多的话，把面板停靠在右侧，边聊边用

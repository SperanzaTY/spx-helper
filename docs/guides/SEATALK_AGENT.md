# SeaTalk Agent 使用指南

> 在 SeaTalk 里直接和 AI 对话、引用消息排查问题、查数据写 SQL — 不用离开聊天窗口。

---

## 这是什么？

SeaTalk Agent 是一个注入到 SeaTalk 桌面客户端的 AI 助手侧边栏。它把 Cursor / Codex 的 AI 能力带进了 SeaTalk：

- 在 SeaTalk 聊天中直接提问，AI 帮你分析问题
- 选中聊天消息一键发给 AI，带上下文分析
- AI 可以调用 MCP 工具查 Presto/ClickHouse、读 SeaTalk 消息、追踪 API
- 支持多工作区切换，AI 能直接读你项目的代码

简单说：**它就是 SeaTalk 里的 AI 工作台**。

当前支持两种后端：

- `cursor-acp`：使用 Cursor `agent acp`
- `codex-app-server`：使用 Codex CLI `app-server` 的 JSON-RPC/stdio 接口

默认优先级：

- 本机可用 `codex` CLI 时，优先走 `codex-app-server`
- 若未安装 `codex` CLI，但本机已安装 Cursor `agent` CLI，则回退到 `cursor-acp`

如需手动指定，可设置：

```bash
export SPX_AGENT_BACKEND=cursor
# 或
export SPX_AGENT_BACKEND=codex
```

---

## 安装（3 分钟搞定）

### 前置条件

- macOS
- Node.js v22+（推荐用 nvm 管理）
- 已安装并登录 **Codex CLI**（`codex --version` 可用）
- SeaTalk 桌面客户端

> 新同事默认按 Codex 路径安装。`cursor-acp` 仅保留为兼容旧环境的回退后端，不再作为推荐安装方案。

### 一键安装

```bash
# 1. 安装并登录 Codex CLI
# 参考：https://developers.openai.com/codex/cli/
# 安装完成后确认：
codex --version
codex login

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
如果要确认当前会默认连到 Codex，可执行：

```bash
SPX_AGENT_BACKEND=codex seatalk
```

安装脚本会配置：

- **Agent 自动启动**（开机自启，崩溃自动重启）：Agent 通过 SIGUSR1 + V8 Inspector 连接 SeaTalk，无需特殊启动参数
- `**seatalk` 命令**：终端一键启动 Agent

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
4. 连接 AI Agent（默认优先 Codex）

看到以下日志说明启动成功：

```
[agent] connecting to SeaTalk via Inspector...
[agent] connected: SeaTalk (https://web.haiserve.com/)
[agent] [cdp-proxy] listening on 127.0.0.1:19222
[agent] SPA ready
[agent] injection complete!
[agent] AI agent connected (backend=codex-app-server, resumed=...)
```

### 方式二：直接打开 SeaTalk + npm start

用任何方式打开 SeaTalk（双击图标、Dock、Spotlight），然后启动 Agent：

```bash
cd spx-helper/seatalk-agent
npm start
```

Agent 会通过 SIGUSR1 激活 SeaTalk 的 V8 Inspector，无需 `--remote-debugging-port` 参数。

### 验证 Agent 是否正常

Agent 启动后会在 19222 端口暴露 CDP 代理。在终端执行：

```bash
curl -s http://127.0.0.1:19222/json
```

- 返回 JSON 数据（含 `web.haiserve.com` 页面）→ Agent 运行正常
- 返回"连接被拒绝" → Agent 未启动，请执行 `seatalk`

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

侧边栏发消息、读会话等能力在 Agent 注入脚本里；**在 Cursor Chat / Agent 里调 MCP 工具**则走 `~/.cursor/mcp.json` 的 MCP 配置。

- **必做**：Cursor → **Settings → MCP**，对 **seatalk-reader**、**seatalk-group**（以及本次有更新的其他 MCP）各 **关闭再开启** 一次，否则会沿用旧子进程。
- **推荐（已克隆本仓库时，刷新最快）**：先初始化仓库内架构隔离 MCP venv，避免 macOS arm64 / x86_64 Python wheel 混用：

```bash
cd spx-helper
bash scripts/setup-mcp-env.sh
```

本地 `~/.cursor/mcp.json` 可直接用仓库启动器：

```json
"seatalk-reader": {
  "command": "bash",
  "args": ["/path/to/spx-helper/scripts/codex-mcp-launch.sh", "seatalk-reader"]
},
"seatalk-group": {
  "command": "bash",
  "args": ["/path/to/spx-helper/scripts/codex-mcp-launch.sh", "seatalk-group"]
}
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

出现 `**injection complete!**` 表示页面注入完成；若 `**SPA ready` 很快但注入很晚**，多半是 `**authenticating` / 建 session / 加载 mcp.json** 阶段较慢（与网络、Cursor 服务有关）。

### 4. 运行时大概有哪些进程（便于排查）


| 角色                                      | 说明                                                |
| --------------------------------------- | ------------------------------------------------- |
| `launch-seatalk.sh`（bash）               | 可选；负责在需要时以 CDP 拉起 SeaTalk 并循环启动 `tsx src/main.ts` |
| `npm exec tsx` / `node … tsx … main.ts` | seatalk-agent 主进程，连 CDP、注入脚本、管 Bridge             |
| `~/.local/bin/agent`                    | ACP 子进程，对接 Cursor 能力与 MCP                         |
| SeaTalk 自身                              | Electron 多进程（主进程、GPU、网络、Renderer 等），**多个属正常**     |


---

## 技术架构概览

```
SeaTalk 桌面端 (Electron)
  └── 页面内注入的 JS
        ├── cursor-ui.js         UI 基础组件（面板、按钮、CSS）
        ├── sidebar-app.js       面板逻辑（对话、设置、更新；左侧栏 #spx-agent-rail 版本/齿轮）
        ├── seatalk-send.js      消息发送（__seatalkSend）
        └── seatalk-watch.js     消息监听（Remote 远程控制）

Node.js 后端 (seatalk-agent/src/main.ts)
  ├── InspectorCdpClient  SIGUSR1 激活 Inspector，debugger.attach 代理 CDP
  ├── CdpProxy     在 19222 暴露标准 CDP 协议，供 seatalk-reader 等外部工具使用
  ├── Bridge        消息桥：页面 <-> Node 双向通信
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
│ ● ACP  已连接 / 状态文案  [重连] │  ← ACP 连接状态（与主侧栏 ✦ 断线时的半透明提示一致；断开时显示「重连」）
├─────────────────────────────────┤
│                                 │
│       消息区域                   │  ← 对话内容、AI 回复、工具调用
│                                 │
├─────────────────────────────────┤
│ [Model ●]      [环形/本回合/—]   │  ← 模型与「用量」同一行（右对齐为用量）
│ ┌───────────────────────┐ 📎 ▶  │  ← 输入框 + 图片按钮 + 发送
│ └───────────────────────┘       │
└─────────────────────────────────┘
```

版本号、齿轮菜单等在 SeaTalk 左侧 **Agent rail**（与主侧栏 **✦** 同一列，在 **✦ 上方**、更靠近侧栏上端）。存在可拉取的远程更新时，版本按钮会以红色胶囊样式显示向上箭头、「NEW」与目标版本（或仅提交落后数），点击打开更新浮层；更新完成后会短暂显示绿色「已同步」样式。连接状态以 **主侧栏 ✦**（断线时图标半透明）与对话面板内 **ACP** 行为准。

### 面板操作


| 操作    | 方式                                |
| ----- | --------------------------------- |
| 打开/关闭 | 点击侧栏 ✦ 图标，或按 **Ctrl+Shift+A**     |
| 拖动位置  | 按住顶栏空白区域拖动（位置自动保存，重启后恢复；拖拽不会超出窗口） |
| 调整大小  | 拖动面板边缘或角落（尺寸自动保存）                 |
| 停靠到右侧 | 点击顶栏的停靠图标（面板变成侧边栏的一部分）            |
| 切换主题  | 点击顶栏的太阳/月亮图标（深色/浅色）               |


### 左侧 Agent rail（齿轮）

- **版本号、齿轮菜单**在 SeaTalk **最左侧竖条**（`.sidebar-sidebar` 内 `#spx-agent-rail`），位于 **侧栏偏下**（在 SeaTalk 自带 **设置/帮助图标上方**），与主侧栏 **✦** 同一列。**打开对话面板**请点击 **✦**；断线重连请用 **齿轮 → 重连 ACP** 或对话面板内 **ACP 状态条** 的「重连」。齿轮菜单支持 Enter/Space 打开、Escape 关闭（输入框聚焦时不抢 Escape）。
- **当前模型**与 **用量**在同一行：左侧为 **Model 徽章**（可点开切换），右侧为 **用量**（若 Cursor 通过 ACP 上报 `usage_update` 则显示 **环形上下文窗口占用百分比**；否则在每轮对话结束后显示 **本回合 token 合计**；尚无数据时显示 **—**，悬停可看说明）。随面板主题变化；与左侧 rail 无关。
- **自动发送**（原面板内开关）已迁至左侧栏 **齿轮 → Agent 会话设置**；开启后 AI 可直接向 SeaTalk 发消息而无需逐条确认。
- 当后端是 **`codex-app-server`** 时，`Agent 会话设置` 默认使用 **`Approval = never`**、**`Sandbox = danger-full-access`**、**`Web Search = live`**。当前前端只暴露稳定的 `Approval = never / untrusted` 两个选项，不再提供 `on-request`。
- 左侧 rail 的 **样式独立**于面板深浅色（固定中性深色：齿轮、下拉、版本号文字等不跟随对话面板的主题变量）。点 **版本号**会在侧栏旁弹出 **固定定位的小气泡**（版本检查/更新），**不再**打开或依赖对话面板里的全屏更新层。
- **重连 ACP**、重启 Agent、检查更新、**Agent 会话设置**、诊断、日志、重新注入 UI 等在齿轮菜单中（原面板底部状态栏已迁出）。
- 齿轮 **下拉菜单**挂载在 `document.body` 上并使用 **fixed** 定位（避免侧栏 `overflow` 裁剪或主内容区抢走点击）；窗口尺寸变化时会重新对齐齿轮按钮。
- **诊断信息**、**查看日志**、**重启 Agent** 时的进度条依赖 Cursor **对话面板**内的浮层；若当前未打开面板，脚本会**自动先打开面板**再显示内容（此前若未打开过面板，会表现为「点了没反应」）。

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


| 工具                | 能力                                              |
| ----------------- | ----------------------------------------------- |
| **Presto 查询**     | 直接执行 SQL 查 Hive 表                               |
| **ClickHouse 查询** | 查实时数据                                           |
| **Spark 查询**      | 大数据量计算                                          |
| **SeaTalk 消息**    | 搜索群消息、查 @我 的消息、导航到指定群聊、读取转发聊天记录                 |
| **API 追踪**        | 分析接口调用链路                                        |
| **DataStudio**    | 管理 DataStudio 资产：下载/上传/更新 SQL 文件、浏览目录结构         |
| **Scheduler 查询**  | 查询 DataSuite Scheduler 任务状态、运行实例、血缘依赖、性能指标、操作日志 |


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

### 6. Alarm Bot（告警自动排查）

侧栏左下角的腕表图标打开 Alarm Bot 面板。它可以自动监控 SeaTalk 群中的告警消息，在无人响应时让 AI 先行排查并以线程回复方式回到群里。

**核心能力**：

- 按群配置监控规则（正则匹配，支持与/或逻辑）
- 可配置处理延迟（0 分钟 = 立即响应）
- 人工回复自动取消 AI 排查（可配置）
- 仅 @我 的消息才触发（可配置）
- 每个群可独立配置工作区、模型、追加 prompt
- AI 排查结果以线程回复发送到群聊；发送前 Agent 会自动为消息加上 `[Alarm Bot] Auto-Investigation` 标题与分隔线，因此 Flink 告警等排查 prompt 应要求模型**只输出正文**（不要重复写外层标题或整行装饰分隔线），以免出现双层排版

**使用方式**：

1. 点击侧栏腕表图标，打开 Alarm Bot 面板
2. 开启总开关
3. 点击"+ 添加监控群"，搜索并勾选要监控的群
4. 展开群设置，配置匹配规则、处理延迟、工作区等
5. 编写排查 prompt 模板（全局 + 每群追加）

**配置持久化**：存储在 `~/.cursor/seatalk-alarm-config.json`，重启 Agent 自动恢复。

### 7. 发送消息与权限控制

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

**程序化发送与左侧选中会话**：SeaTalk 的 `logicSendMessage` 与当前选中会话的输入区上下文相关。`seatalk-send.js`（`__seatalkSend`）在发往指定 `group-`/`buddy-` 前会校验 Redux 的 `selectedSession` 是否与目标一致；不一致时会先切换到该会话再写入草稿并发送，避免仅返回成功而消息未出现在目标群。

### 7. 自动更新

Agent 会在后台自动检查新版本（拉取 `**release` 分支** 的远端引用）：

- 启动后约 3 秒首次检查，之后每 10 分钟检查一次
- 有更新时，状态栏的版本号会高亮闪烁
- 点击版本号查看更新详情，一键更新后自动重启

也可以通过 **设置菜单（⚙）→ 检查更新** 手动触发。

> **Git remote 说明（v3.4.5+）**：更新器会按顺序选用：环境变量 `**SPX_UPDATE_GIT_REMOTE`**（若设置）→ 已配置的 `**gitlab`** → `**origin**` 且 URL 含 `git.garena.com` / `garena.com` 时 → 否则仍尝试 `**origin**`。仅克隆 GitLab 且只配了 `origin` 时无需再单独添加 `gitlab`。若 `origin` 是 GitHub、仍需跟团队主仓对齐，可执行：`git remote add gitlab https://git.garena.com/tianyi.liang/spx-helper.git`，或设置 `SPX_UPDATE_GIT_REMOTE=gitlab`。

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
- **选中即返回对话**：无论从列表还是 `浏览...` 选择，切换成功后都会自动关闭选择器并回到聊天视图
- **删除已有条目**：`最近使用` 中可删除历史记录；`本机项目` 中可隐藏不想再显示的项目，后续重新选中时会自动恢复

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


| 你想做的事        | 推荐工作区      |
| ------------ | ---------- |
| 排查某项目的 Bug   | 切到该项目      |
| 查 Hive/CK 数据 | 任意（推荐数据项目） |
| 读 SeaTalk 消息 | 任意         |
| 写/改代码        | 切到目标项目     |
| 通用技术问答       | 任意         |


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


| 模型类型     | 特点          | 适用场景          |
| -------- | ----------- | ------------- |
| Claude   | 代码理解强、推理能力好 | 复杂代码分析、Bug 排查 |
| GPT-5 系列 | 通用能力强       | 日常问答、写文档      |
| Gemini   | 多模态能力强      | 图片分析          |


> 切换模型会**重启 ACP Agent 进程**（使用 `cursor agent --model <id>`），**当前对话会话会重置**。这是为避免 Cursor CLI 的 `session/set_model` 热切换接口返回 `Invalid params` 导致切换失败。

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


| 日志类型      | 说明                            |
| --------- | ----------------------------- |
| 蓝色（info）  | 正常状态：开启/关闭、Agent 就绪、指令接收、回复发送 |
| 黄色（warn）  | 警告：Agent 进程退出、指令被忽略           |
| 红色（error） | 错误：Agent 启动失败、指令执行异常          |


日志最多保留 50 条，超出自动清理旧记录。

### 系统指令（`!!` 前缀）

以 `!!` 开头的消息会被识别为系统指令，**不经过 ACP Agent**，直接由后端处理，响应极快：


| 指令                | 说明                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `!!ping`          | 存活检测，立即回复 pong                                                                                                 |
| `!!status`        | 查看运行状态（运行时长、进程、Session ID、模型、工作区）                                                                              |
| `!!help`          | 显示所有系统指令列表                                                                                                     |
| `!!use <关键词>`     | 切换 AI 模型（**模糊匹配** `agent models`：可用片段、别名如 `composer 2` / `composer2`，不必输入完整 ID；重启 Remote Agent，`--model`，会话重置） |
| `!!use`           | 查看当前使用的模型                                                                                                      |
| `!!ls models`     | 列出所有可用模型                                                                                                       |
| `!!reset`         | 重置远程 Agent 会话                                                                                                  |
| `!!logs [N]`      | 查看最近 N 条 Remote 日志（默认 20）                                                                                      |
| `!!remote on/off` | 远程开关远程控制                                                                                                       |
| `!!remote`        | 查看远程控制状态                                                                                                       |


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

在 SeaTalk **左侧 Agent rail** 点击 **齿轮**（不在对话面板内；面板底部旧状态栏已移除）：


| 菜单项      | 说明                                           |
| -------- | -------------------------------------------- |
| 重连 ACP   | AI 连接断了时用，重新建立 ACP 连接                        |
| 重新注入 UI  | 面板显示异常时用，重新注入界面代码                            |
| 重启 Agent | 彻底重启整个 Agent 进程（包括 main.ts 代码重新加载），更新代码后必须重启 |
| 查看后端日志   | 查看最近 100 条后端日志，排查连接问题                        |
| 诊断信息     | 查看 CDP/ACP 连接状态、工作区、模型等信息                    |
| 检查更新     | 手动检查是否有新版本                                   |


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

1. 确认已运行过 `bash install.sh`
2. 确认 Agent 在运行：终端执行 `seatalk` 或 `cd seatalk-agent && npm start`
3. 验证 Agent 是否正常：`curl -s http://127.0.0.1:19222/json`（应返回 JSON 页面列表）
4. 设置菜单 -> "重新注入 UI"

### 19222 端口不通

Agent 在 19222 端口暴露 CDP 代理服务。如果连不上：

1. 确认 Agent 进程在运行：`ps aux | grep 'tsx.*main.ts'`
2. 确认没有其他程序占用该端口：`lsof -i :19222`
3. 重新启动 Agent：`seatalk`

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

1. 主侧栏 **✦** 是否因断线而半透明变暗；对话面板打开时看 **ACP** 行状态
2. 若断开：面板内 ACP 条点 **重连**，或左侧 **齿轮 → 重连 ACP**
3. 检查 Cursor IDE 是否已打开并登录
4. **齿轮 → 重启 Agent**

### AI 说"找不到文件"

大概率是工作区选错了。点击工作区条，切换到正确的项目。

### MCP 工具调用失败

1. 确认 Cursor 的 MCP 配置正确（`~/.cursor/mcp.json`）
2. 确认环境变量已设置（如 `PRESTO_PERSONAL_TOKEN`）
3. 查看后端日志排查具体错误

### 更新后功能异常

设置菜单 → **重新注入 UI** 即可刷新面板代码。

### 消息悬停快捷条里「更多」被挤没或下拉被裁切

在快捷条插入 ✦ 后，若该行是 flex 布局，未禁止收缩时可能把末尾「更多」挤扁，或菜单区域 `overflow` 导致下拉显示不全。注入脚本会对 `.quick-operation-menu` / `.thread-quick-operation-menu` 设置 `overflow: visible`，并对 ✦ 与 `.last-icon` 设置 `flex-shrink: 0`。若仍异常，请 **重新注入 UI** 或重启 Agent；若 SeaTalk 版本把下拉挂在更外层且仍被裁切，可向维护者反馈具体会话类型（单聊/群/线程）。

### 重启 Agent 后 SeaTalk 无法点击

常见原因是 **重新注入** 时左侧 `#spx-agent-rail` 仍保留旧节点，新脚本发现 rail 已存在便跳过挂载，与 `AbortController` 清理后的状态不一致。处理方式：代码侧已在每次注入前移除并重建 rail；若你已遇到卡死，请 **完全退出 SeaTalk** 后重新打开，并确认未同时运行多个 Agent 进程（`ps aux | grep tsx`）。

---

## 快捷键


| 快捷键              | 功能          |
| ---------------- | ----------- |
| **Ctrl+Shift+A** | 打开/关闭 AI 面板 |
| **Enter**        | 发送消息        |
| **Shift+Enter**  | 输入换行        |


---

## 更新日志

### v3.6.12

- **seatalk-send**：发送前按目标会话类型和 id 校验当前选中会话，远距离私聊会优先使用 SeaTalk 内部 `actionSelectChatSession` 选择，减少虚拟列表未渲染时发不出去或选错会话的风险。

### v3.6.11

- **SeaTalk MCP 配置**：推荐先执行 `bash scripts/setup-mcp-env.sh` 初始化仓库内架构隔离 venv，再用 `scripts/codex-mcp-launch.sh` 启动 `seatalk-reader` / `seatalk-group`，避免 Cursor / Codex 沿用半初始化 Python 环境。

### v3.6.10

- **历史对话恢复**：重新打开历史对话时会恢复工具调用卡片、计划卡片和消息上下文提示，继续排查时不再只剩最终文本。
- **长内容展示**：消息、代码块、Markdown 表格、思考区和工具调用详情增加横向收口，减少长 SQL / JSON / URL 把侧栏撑出屏幕的问题。
- **上下文提示条**：恢复历史对话或清除上下文时会同步刷新提示条，避免显示旧会话残留上下文。

### v3.5.14

- **Rail 版本入口**：有远程更新时高亮提示与更新浮层标题样式优化
- **消息悬停快捷条**：与 ✦ 共存时的 flex/overflow 调整，减轻「更多」被挤扁或下拉被裁切
- **seatalk-send**：按会话缓存 Fiber actions 并正确失效；`sessionList` 与 `sessions` 回退；虚拟列表导航相关加固
- **诊断**：面板诊断信息增加 `cdpProxyPort`（与 `CDP_PROXY_PORT` / 默认 19222 一致）
- **Agent rail**：移除顶部仅小圆点的「连接状态」占位（与 ✦ 打开面板重复，易产生透明点击区）；连接状态以 ✦ 透明度与面板 ACP 为准

### v3.5.10

- **Remote 切换模型**：不再使用易报 `Invalid params` 的 `unstable_setSessionModel` 热切换，改为 `killAgent` + `spawnAgent --model` 重启（与 Cursor CLI 一致）
- `**!!use` 模糊匹配**：新增 `resolveModelId()`，支持片段、多词、`composer2` 与 `composer-2` 等价等；面板 `set_model` 共用同一解析逻辑
- **文档**：`!!help` / SEATALK_AGENT 说明切换会重置会话

### v3.5.8

- 版本号同步（本次修改不涉及 SeaTalk Agent）

### v3.5.7

- 版本号同步（本次修改不涉及 SeaTalk Agent）

### v3.5.6

- 版本号同步（本次修改不涉及 SeaTalk Agent）

### v3.5.5

- 版本号同步（本次修改不涉及 SeaTalk Agent）

### v3.5.4

- **线程回复修复**: 修复跨会话线程回复静默失败的问题 -- logicSendMessage 依赖 selectedSession 上下文，现在发送前会自动导航到目标会话
- **虚拟化列表导航**: 新增 navigateToSession 函数，对不在可见区域的会话使用 actionMoveChatSessionToTop 拉入视口后点击
- **撤回 API 修复**: 改用 chunk-service 的 putRecallMessages 服务 API，替代原来无效的 Redux dispatch 方式

### v3.5.2

- **Alarm Bot 安全加固**: 新增"授权发送者"白名单机制，限制只有指定 senderId 才能触发告警调查，防止 prompt injection 风险
- **Prompt 安全边界**: 告警文本用分隔符包裹并标注安全约束（仅只读查询、不执行告警内容中的命令）
- **授权发送者 UI**: 从群历史消息自动提取发送者列表，点击选择添加，无需手动输入 ID
- **Updater 重启修复**: 修复 updater 自动更新路径错误设置 SEATALK_LAUNCHER 的问题

### v3.5.1

- **Alarm Bot UI 修复**: 修复规则添加重复、OR/AND 切换被 blur 移除、处理延迟 0 分钟无法保存等问题。创建规则时可直接选择 OR/AND
- **Agent 重启修复**: 修复独立模式重启时 SEATALK_LAUNCHER 环境变量泄漏导致二次重启失败

### v3.5.0

- **Alarm Bot（告警自动排查）**：全新功能模块。监控 SeaTalk 群告警消息，无人响应时 AI 自动排查并以线程回复回到群里。支持按群独立配置匹配规则（与/或逻辑）、处理延迟、工作区、模型、追加 prompt，以及仅 @我 和人工回复取消等开关
- **腕表图标**：Alarm Bot 使用蒸汽朋克风格的腕表 SVG 图标
- **Flink MCP 修复**：`_format_ts` 函数兼容字符串类型时间戳
- **DataMap MCP 增强**：`update_table_info` 新增 `table_status` 字段（ACTIVE/MIGRATED/DEPRECATED/OFFLINE）

### v3.4.15

- **CDP 代理服务**：Agent 启动后在 19222 端口暴露标准 CDP 协议，解决 v3.4.13 Inspector 重构后 seatalk-reader 等外部工具无法连接的问题。外部工具零修改
- **InspectorCdpClient 事件广播**：新增 `onCdpEvent()` 方法，CDP 事件自动转发到代理客户端

### v3.4.14

- **修复 ACP 连接失败**：`loadMcpServers()` 创建 SSE/HTTP 类型 MCP server 时缺少 ACP schema 要求的 `headers` 字段，导致 agent 在 `session/new` 阶段返回 "Internal error"。仅在 `mcp.json` 配置了 URL 类型 MCP server 时触发
- **支持 streamable-http 传输类型**：自动根据 `transport` 字段区分 `http` 和 `sse` MCP 类型

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
- `**!!logs` 系统命令**：远程查看最近 N 条 Remote 日志，方便手机端排查
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

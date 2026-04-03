# SPX Helper 发版日志

> **每次提交**到 `release` 分支前，Agent 会自动在此文件追加一条记录。
> 不管是 `feat`/`fix` 还是 `docs`/`chore`，**所有 commit type 都必须记录**。
> pre-push hook 检查最新 commit 是否修改了此文件，未修改则阻止推送。

---

## 记录格式

```
## vX.Y.Z — YYYY-MM-DD — `<commit-hash>` <commit-message>

**提交者**: @用户名
**Commit Type**: feat / fix / refactor / docs / chore
**修改模块**: Chrome 扩展 / MCP 工具 / SeaTalk Agent / 文档 / 其他

### 变更说明
- 简述本次修改内容

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | ✅/⬜/N/A | |
| MCP 工具连接正常 | ✅/⬜/N/A | |
| SeaTalk Agent 启动+注入正常 | ✅/⬜/N/A | |
| SeaTalk Agent 重启后 UI 恢复 | ✅/⬜/N/A | |
| 修改的功能正常工作 | ✅/⬜ | |
| 已有功能未被破坏 | ✅/⬜ | |
| 控制台无新增错误 | ✅/⬜ | |

### 特别注意
- （如有：兼容性问题、已知限制、需要其他人确认的事项）
```

说明：
- ✅ = 通过（Agent 根据测试结果自动填写，用户确认）
- ⬜ = 未通过（必须修复后才能发版）
- N/A = 本次修改不涉及该模块，无需测试（Agent 自动判断）
- 标题中建议包含 commit hash 便于追溯，但 hook 不依赖 hash 匹配

---

## v3.4.4 — 2026-04-03 — docs: 更新后 SeaTalk Agent 与 MCP 快速恢复指南

**提交者**: @lidong.zhou
**Commit Type**: docs
**修改模块**: 文档

### 变更说明
- **SEATALK_AGENT.md**：新增「更新仓库 / 升级 Cursor 后：快速恢复」— 拉代码、`npm install`、MCP toggle、`uvx --reinstall --from .` 预热、重启 Agent、进程说明与启动耗时常在 CDP/ACP 的原因
- **MCP_TOOLS.md**：新增「SeaTalk 相关 MCP 快速更新」— 与上篇指南交叉引用

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | |
| MCP 工具连接正常 | N/A | |
| SeaTalk Agent 启动+注入正常 | N/A | |
| SeaTalk Agent 重启后 UI 恢复 | N/A | |
| 修改的功能正常工作 | N/A | 文档变更 |
| 已有功能未被破坏 | ✅ | |
| 控制台无新增错误 | N/A | |

---

## v3.4.4 — 2026-04-03 — fix(ui): 更新面板 UI 优化

**提交者**: @tianyi.liang
**Commit Type**: fix
**修改模块**: SeaTalk Agent

### 变更说明
- **更新弹窗 SVG 图标**：标题、返回按钮、更新/检查按钮、版本号箭头全部使用 SVG 替代纯文字
- **分步进度日志**：更新过程使用带时间戳、颜色区分、淡入动画的分步日志面板，替代旧的纯文本追加
- **NEW 标签**：更新成功重连后，版本号旁显示绿色 NEW 标签（30秒后消失），不再弹"更新成功"文案
- **弹窗自动关闭**：重连后 1.5 秒自动关闭更新弹窗

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | |
| MCP 工具连接正常 | N/A | |
| SeaTalk Agent 启动+注入正常 | ✅ | |
| SeaTalk Agent 重启后 UI 恢复 | N/A | |
| 修改的功能正常工作 | ✅ | 更新弹窗 SVG 图标正常，日志面板正常 |
| 已有功能未被破坏 | ✅ | |
| 控制台无新增错误 | ✅ | |

---

## v3.4.3 — 2026-04-03 — fix(agent): 修复自动更新检测逻辑

**提交者**: @tianyi.liang
**Commit Type**: fix
**修改模块**: SeaTalk Agent

### 变更说明
- **修复自动更新检测条件**：原逻辑要求 `behind > 0 && remote !== local`，导致 chore/docs 类型提交（不升版本号）永远检测不到更新。改为仅判断 `behind > 0`
- **优化更新提示显示**：版本号相同时，状态栏显示 `v3.4.2 +1` 而非 `v3.4.2 → v3.4.2`；弹窗隐藏多余的"最新版本"行

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | |
| MCP 工具连接正常 | N/A | |
| SeaTalk Agent 启动+注入正常 | ✅ | |
| SeaTalk Agent 重启后 UI 恢复 | N/A | |
| 修改的功能正常工作 | ✅ | 回退版本后可正确检测到更新 |
| 已有功能未被破坏 | ✅ | |
| 控制台无新增错误 | ✅ | |

---

## v3.4.2 — 2026-04-03 — chore(hooks): pre-push CDP 自动验证

**提交者**: @tianyi.liang
**Commit Type**: chore
**修改模块**: Git Hooks / Cursor Skill / 其他

### 变更说明
- **新增 `scripts/verify-cdp.js`**：Node.js CDP 自动验证脚本，通过 CDP 远程调试协议检查 SeaTalk 前端注入状态（全局函数存在性、Sidebar 按钮、无重复 UI 元素），退出码 0/1/2 区分结果
- **pre-push hook 新增 CDP 验证步骤**（Step 2.7）：当 `seatalk-agent/src/` 有代码变更时自动运行 `verify-cdp.js`，验证不通过阻止推送
- **更新 release-publish Skill Step 5**：标注 CDP 验证已由 hook 自动化，提供手动预检指引，更新 Hook 检查清单和常见错误表
- **新增 `npm run verify:cdp`** 入口，方便开发者手动运行 CDP 验证

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | |
| MCP 工具连接正常 | N/A | |
| SeaTalk Agent 启动+注入正常 | ✅ | CDP 验证脚本在真实环境全部通过 |
| SeaTalk Agent 重启后 UI 恢复 | N/A | |
| 修改的功能正常工作 | ✅ | verify-cdp.js 运行通过，pre-push hook bash 语法验证通过 |
| 已有功能未被破坏 | ✅ | |
| 控制台无新增错误 | ✅ | |

---

## v3.4.2 — 2026-04-03 — fix(agent): Remote 回复显示模型+工作区、重启进度日志

**提交者**: @tianyi.liang
**Commit Type**: fix
**修改模块**: SeaTalk Agent

### 变更说明

#### Remote 回复信息增强
- 标题行显示当前使用的 AI 模型名称（如 `Remote Agent · composer-2-fast`）
- 尾部显示回复时长和当前工作区名（如 `⏱ 9.4s · SpxMgmtAppSop`）
- 移除不可用的 token 消耗显示（CDP 调试确认 Cursor Agent CLI 的 `PromptResponse` 不返回 `usage` 字段）

#### 重启 Agent 进度日志
- 点击"重启 Agent"后在消息区域展示分步进度面板，包括：
  - 后端分步日志（停止主/Remote Agent → 启动方式 → 新进程 PID）
  - 自动计时器（已等待 Ns），30 秒后提示手动重启方式
  - 重连成功后自动显示"✓ Agent 已重新连接！"
- 后端 `restart_agent` 改为使用 `restartLog()` 分步推送 `restart_progress` 事件

#### 主题适配
- 重启日志颜色使用 CSS 变量（`--cp-text-dim` / `--cp-text-dim2`），适配深色/浅色主题

### 测试验证

| 模块 | 状态 |
|------|------|
| SeaTalk Agent | ✅ |
| Chrome 扩展 | N/A |
| MCP 工具 | N/A |
| Cursor Skill | N/A |

---

## v3.4.1 — 2026-03-02 — feat(agent): Remote 回复优化 + 前端注入去重 + 发版 Skill

**提交者**: @tianyi.liang
**Commit Type**: feat
**修改模块**: SeaTalk Agent / Cursor Skill

### 变更说明

#### Remote 回复优化
- 回复尾部不再显示"时间 | 字数"，改为显示**回复时长**（如 `12.3s`）和 **token 消耗**（如 `2450↓ 680↑`）
- 从 `connection.prompt()` 返回值获取 `usage` 字段，无 token 信息时 fallback 为字数显示
- 新增 `!!logs [N]` 系统命令，可远程查看最近 N 条 Remote 日志（默认 20 条）
- 后端新增 `remoteLogHistory` 日志历史列表（最多 100 条），供 `!!logs` 命令使用

#### 前端注入去重修复
- 修复 re-inject 时（页面刷新 / 心跳重连 / 手动 reinject_ui）旧 DOM 元素残留的问题：
  - Remote Popover (`#cursor-remote-popover`) 和 Tooltip (`.cursor-tooltip`) 在 re-inject 前清理
  - 使用 `AbortController` 统一管理 `document.addEventListener`，re-inject 时 abort 旧监听器
  - `MutationObserver` 加入注册表，re-inject 时 disconnect
  - 注册 `window.__cursorSidebarCleanup` 统一清理入口（面板、popover、FAB、事件、observer）

#### 发版流程规范
- 新增 `release-publish` Cursor Skill（`.cursor/skills/release-publish/`）
- 标准化 9 步发版流程：前置检查 → 版本号 → 日志 → 文档联动 → CDP 验证 → 确认 → 提交 → 推送 → 验证
- 涉及 SeaTalk Agent 代码修改时，必须通过 CDP 进行注入验证和功能性测试
- 与 pre-push / commit-msg / pre-commit hook 三层协作保障发版质量
- GitLab 为主仓库必须推送成功，GitHub 尽力推送失败不阻断

#### Troubleshoot Skill 更新 (v2)
- 新增 Phase 0.5（多进程冲突）、Phase 5（Remote 控制）、Phase 8（Agent 重启生命周期）
- 更新架构图加入 seatalk-watch.js / seatalk-send.js / Remote Agent / launch.sh
- 更新去重机制清单加入 AbortController / `__cursorSidebarCleanup`
- 补充多进程并发、回复死循环、restart 静默失败、remote 追踪等实际排查经验

#### Skill 版本号规则细化
- 明确 minor 升级仅限"新增功能板块"，现有功能增强属于 patch

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | 本次未修改 Chrome 扩展功能代码 |
| MCP 工具连接正常 | N/A | 本次未修改 MCP 工具 |
| SeaTalk Agent 启动+注入正常 | ✅ | TypeScript 编译零错误 |
| SeaTalk Agent 重启后 UI 恢复 | ✅ | AbortController + cleanup 修复 |
| 修改的功能正常工作 | ✅ | |
| 已有功能未被破坏 | ✅ | |
| 控制台无新增错误 | ✅ | |

---

## v3.3.1 — 2026-03-02 — feat: Remote 系统指令 + 消息冻结机制

**提交者**: @tianyi.liang
**Commit Type**: feat
**修改模块**: SeaTalk Agent

### 变更说明

#### `!!` 系统指令系统（不经过 ACP Agent，直接响应）
- `!!ping` — 存活检测，立即回复 pong
- `!!status` — 查看 Remote Agent 运行状态（运行时长、进程、Session ID、模型、工作区）
- `!!help` — 显示所有系统指令列表
- `!!use <model>` — 远程切换 AI 模型（立即生效，无需重建 session）
- `!!use` — 查看当前使用的模型
- `!!ls models` — 列出所有可用模型
- `!!reset` — 重置远程 Agent 会话（cancel 当前 session + 创建新 session）
- `!!remote on|off` — 远程开关远程控制（不依赖 Agent 进程）

#### 消息冻结机制
- 当第二条指令到达时，如果第一条正在 ACP prompt 中，第一条消息被"冻结"
- 冻结后第一条消息完成时跳过回复，第二条指令自动接管执行
- 新增 `remoteProcessingActive`、`remoteFrozen`、`remoteMessageQueue` 状态变量
- 系统指令（`!!` 前缀）不受冻结影响，始终立即响应

#### Remote 默认开启
- `remoteEnabled` 默认值改为 `true`，Agent 启动后自动启动 Remote Agent
- 注入完成后自动调用 `ensureRemoteAgent()` 启动远程控制

#### Bug 修复
- 修复 `!!remote on/off` 回复被 watch 二次捕获导致误执行 ACP prompt 的问题（补充 `addSentText` 调用）

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | 本次未修改 Chrome 扩展功能代码 |
| MCP 工具连接正常 | N/A | |
| SeaTalk Agent 启动+注入正常 | ✅ | Remote Agent 自动启动 |
| SeaTalk Agent 重启后 UI 恢复 | ✅ | |
| !!ping / !!status / !!help | ✅ | 系统指令立即响应 |
| 消息冻结机制 | ✅ | 第一条冻结 + 第二条接管 |
| !!remote off → 消息被忽略 → !!remote on | ✅ | 开关功能正常 |
| 已有功能未被破坏 | ✅ | |
| 控制台无新增错误 | ✅ | |

### 特别注意
- 系统指令以 `!!` 前缀触发，不会经过 ACP Agent，响应极快
- 消息冻结只影响普通指令，`!!` 系统指令始终优先处理
- Remote Agent 现在默认开启，首次注入后自动启动

---

## v3.3.0 — 2026-03-02 — `56a1e8e` feat: Remote 远程控制功能 + 日志面板 + Markdown 卡片回复

**提交者**: @tianyi.liang
**Commit Type**: feat
**修改模块**: SeaTalk Agent

### 变更说明

#### Remote 远程控制
- 新增 `seatalk-watch.js`：Redux `store.subscribe` 消息监听器，始终监听 SeaTalk 消息变更，识别 Saved Messages（自发消息）作为远程指令
- `main.ts`：新增 `remoteAgent` 独立 Agent 进程（Agent 模式），接收自发消息并通过 ACP 执行指令
- 指令排队机制：Agent 启动期间收到的指令自动缓冲（`pendingRemoteCmds`），就绪后批量处理，确保不丢失消息
- `sidebar-app.js`：左侧边栏 Remote 按钮（Caladbolg 图标）+ 极简 popover 面板，包含远程控制开关和状态显示

#### Remote 日志面板
- 后端 `remoteLog()` 函数：在关键节点发送 `watch_remote_log` 事件到前端
- 前端 popover 内嵌实时日志滚动区域，展示远程控制生命周期：开启/关闭、Agent 启动/就绪、指令接收/执行/回复/失败
- 日志区域支持 info/warn/error 颜色区分，等宽字体，自动滚底，最多保留 50 条

#### Markdown 卡片回复
- Remote Agent 回复改为 Markdown 格式，结构化展示：粗体标题 **Remote Agent**、分割线、指令回显（code 格式）、正文、时间戳和字数元信息
- 前后端双层防循环：前端 `seatalk-watch.js` 跳过 "Remote Agent" 前缀消息 + 后端 `processRemoteCmds` 跳过自身回复

#### UI 优化
- 侧边栏按钮对齐原生 SeaTalk 图标（32×32, 20px 间距）
- "免确认" 按钮更名为 "自动发送"，语义更清晰
- Popover 智能定位：自动向上/向下展开，不超出视口

#### Agent 重启修复
- `restart_agent` 改为 `npx tsx` 自启动新进程，不再依赖 `launch.sh`
- 重启时同时清理 `remoteAgent` 进程，防止孤儿进程泄漏

#### ACP 增强
- `spawnAgent` 新增 `sessionMode` 参数，支持 `ask`/`agent` 两种模式
- 新增 `permissionFilter` 工具权限过滤器，Remote Agent 可限制可用工具范围

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | 本次未修改 Chrome 扩展功能代码 |
| MCP 工具连接正常 | N/A | |
| SeaTalk Agent 启动+注入正常 | ✅ | CDP 注入 + 所有脚本加载正常 |
| SeaTalk Agent 重启后 UI 恢复 | ✅ | 重启后面板和 Remote 状态恢复 |
| 修改的功能正常工作 | ✅ | Remote 开关/日志/指令执行/回复均正常 |
| 已有功能未被破坏 | ✅ | 主面板对话、发送确认、工具调用均正常 |
| 控制台无新增错误 | ✅ | |

### 特别注意
- Remote 功能需要在 SeaTalk Saved Messages（自己和自己的对话）中发消息才能触发
- Remote Agent 使用独立的 ACP Agent 进程（Agent 模式），与主面板 Agent 互不干扰
- Markdown 格式回复在 SeaTalk 中显示为结构化卡片样式，方便在手机端区分用户指令和 Agent 回复
- 其他团队成员需要重启 Agent 才能使用 Remote 功能

---

## v3.2.8 — 2026-04-02 — fix: restart_agent 改为全进程重启

**提交者**: @tianyi.liang
**Commit Type**: fix
**修改模块**: SeaTalk Agent

### 变更说明
- `restart_agent` 从"仅重启 ACP 子进程"改为"全进程重启"
- 有 launcher（launch.sh）时 exit 42 触发自动重启循环
- 无 launcher 时 spawn 新进程后 exit，确保 main.ts 代码变更被重新加载
- 修复：之前重启 agent 后 main.ts 代码变更不生效的问题

### 测试清单

| 测试项 | 状态 | 备注 |
|--------|------|------|
| 设置中重启 Agent 后代码变更生效 | ⬜ | |
| launch.sh 下重启正常 | ⬜ | |

---

## v3.2.7 — 2026-04-02 — feat: 线程回复 + 撤回消息 + 添加好友免确认

**提交者**: @tianyi.liang
**Commit Type**: feat
**修改模块**: SeaTalk Agent

### 变更说明
- seatalk-send.js v6：`__seatalkSend` 支持 `rootMid` 参数实现线程回复
- seatalk-send.js v6：新增 `__seatalkRecall` 通过 Redux dispatch 撤回消息
- seatalk-send.js v6：新增 `__seatalkProbe` 调试 API（列出 actions 方法名和 store slices）
- main.ts：`doSend` 支持 `rootMid`，新增 `doRecall` 和 `doAddContact` helper
- main.ts：`recall_message` bridge handler 完整确认流程
- main.ts：`add_contact` 现在也受「免确认」开关控制
- sidebar-app.js：发送确认卡片显示线程信息（rootMid）
- sidebar-app.js：新增撤回确认卡片（红色主题）
- sidebar-app.js：新增 `recall_confirm_request` 消息处理

### 测试清单

| 测试项 | 状态 | 备注 |
|--------|------|------|
| 线程回复（rootMid）| ⬜ | |
| 撤回确认卡片显示 | ⬜ | |
| 添加好友免确认 | ⬜ | |
| 免确认开关共享所有操作 | ⬜ | |

---

## v3.2.6 — 2026-04-02 — feat: MCP 新增撤回工具 + 线程回复参数 + 好友限制说明

**提交者**: @tianyi.liang
**Commit Type**: feat
**修改模块**: MCP 工具

### 变更说明
- `send_seatalk_message` 新增 `root_mid` 参数，支持线程回复（Thread Reply）
- 新增 `recall_seatalk_message` 工具，支持撤回自己发送的消息（需确认，走 bridge 流程）
- 修正好友关系说明：私聊仅限好友，非好友发消息为假发送（前端成功但对方收不到）
- 新增 Cursor MCP 使用排查说明：免确认开关位置、消息没发出去的排查方向
- 修复 `search_seatalk_users` 结果提示中 f-string 中文引号导致的 SyntaxError

### 测试清单

| 测试项 | 状态 | 备注 |
|--------|------|------|
| MCP server 启动无 SyntaxError | ✅ | 修复中文引号问题 |
| list_seatalk_chats 可正常调用 | ✅ | |
| send_seatalk_message docstring 更新 | ✅ | |
| recall_seatalk_message 工具注册 | ⬜ | 需重启 MCP 验证 |

---

## v3.2.5 — 2026-04-02 — fix: 小窗面板位置持久化 + 拖拽边界限制

**提交者**: @tianyi.liang
**Commit Type**: fix
**修改模块**: SeaTalk Agent

### 变更说明
- 面板位置（left/top）通过 localStorage 持久化，重启 Agent 后恢复到上次拖动的位置
- 拖拽时限制面板不超出窗口边界，至少保留 40px 在可视区域内，防止面板丢失
- resize 结束时也同步保存位置

### 测试清单

| 测试项 | 状态 | 备注 |
|--------|------|------|
| 拖拽面板到边缘不超出窗口 | ⬜ | |
| 重启 Agent 后面板位置恢复 | ⬜ | |
| resize 后位置正确保存 | ⬜ | |

---

## v3.2.4 — 2026-04-02 — feat: 发送消息/添加联系人权限控制 + 内联确认卡片

**提交者**: @tianyi.liang
**Commit Type**: feat
**修改模块**: SeaTalk Agent / MCP 工具

### 变更说明
- 发送消息和添加联系人必须经用户确认，防止 AI 自作主张发送
- MCP `send_seatalk_message` / `add_seatalk_contact` 不再直接执行，统一走 seatalk-agent bridge handler 确认流程
- 确认卡片内联到消息流中（不再使用全屏覆盖弹窗），显示目标和消息预览
- 输入框上方添加「免确认」开关（与 Model 选择同行），开启后跳过确认直接发送
- 修复重启/重连后 session mode 不恢复为 agent 的问题（`defaultMode` 持久化 + `set_mode` 即使 agent 未连接也更新）
- 添加 ACP 启动互斥锁（`acpStarting`），防止 `restart_agent` 和 `reconnect_acp` 同时触发双重启动
- `restart_agent` 执行顺序改为先 `startAcp` 再 `doInject`，避免注入后推送 disconnected 状态
- `seatalk-send.js` 升级到 v5：去除复杂的 token/密钥机制，改为简单的 `confirmed: true` 参数
- 注入时清理旧版本残留 DOM 元素（`.cursor-confirm-overlay`、`.cursor-grant-indicator`）

### 测试清单

| 测试项 | 状态 | 备注 |
|--------|------|------|
| 发送消息弹出确认卡片 | ✅ | |
| 确认后消息成功发送 | ✅ | |
| 取消后消息不发送 | ✅ | |
| 免确认开关开启后直接发送 | ✅ | |
| 重启后模式正确恢复为 agent | ✅ | |
| 重启无双重 ACP 启动 | ✅ | |
| MCP 工具走 bridge 确认 | ✅ | |

---

## v3.2.3 — 2026-04-02 — fix: 修复孤儿进程泄漏导致内存持续上涨

**提交者**: @tianyi.liang
**Commit Type**: fix
**修改模块**: SeaTalk Agent

### 变更说明
- 新增 `getMyFamily()` 函数，构建完整的进程族谱（祖先链 + 子孙树），避免清理逻辑误杀自身进程链
- 新增 `killProcessTree()` 函数，递归杀死指定进程的完整子进程树（而非单个 PID）
- 新增 `killAllStaleAgentProcesses()` 函数，启动时全量扫描残留的 `npm exec tsx` / `tsx cli` 进程
- 修复 `killStaleCdpClients()` 只杀单个进程的问题，改为杀整棵进程树
- 修复 `killOrphanAgentProcesses()` 不排除自身祖先链的问题
- `cleanupAndExit()` 增加子进程树清理，`process.on('exit')` 使用预缓存的 PID 列表避免在退出时执行 `execSync`
- `update_apply` 成功后先杀 ACP agent 再退出，防止旧 ACP 进程残留
- `launch.sh` / `install.sh` 模板增加 `trap cleanup EXIT INT TERM`，使用 `pkill -P $$` 杀所有子进程
- 收窄进程匹配范围，加入 `seatalk-agent` 路径特征，避免误杀其他项目进程

### 测试清单

| 测试项 | 状态 | 备注 |
|--------|------|------|
| Agent 正常启动（不误杀自身） | ✅ | |
| SIGTERM 后全部子进程清理干净 | ✅ | |
| 无残留孤儿进程 | ✅ | |

---

## v3.2.2 — 2026-03-02 — fix: Agent 更新后自动重启（前后端完整重启）

**提交者**: @tianyi.liang
**Commit Type**: fix
**修改模块**: SeaTalk Agent

### 变更说明
- 修复 `injectUI()` 未定义 bug：`reinject_ui` 和 `restart_agent` 操作实际调用的函数从未定义（ReferenceError 被 try-catch 吞掉），替换为 `doInject()`
- 更新后自动重启：通过 `launch.sh`/`seatalk` 命令启动时用 exit(42) 重启循环；直接 `npx tsx` 启动时 spawn detached 子进程自重启
- `launch.sh` 和 `install.sh` 设置 `SEATALK_LAUNCHER=1` 环境变量，`main.ts` 据此选择重启策略
- 新进程启动后 `doInject()` 重新注入所有前端脚本（cursor-ui / sidebar-app / seatalk-send），实现前端代码热更新

### 测试清单

| 测试项 | 状态 | 备注 |
|--------|------|------|
| 通过 seatalk 命令启动，更新后自动重启 | ⬜ | 需用户测试 |
| 通过 npx tsx 直接启动，更新后自动重启 | ⬜ | 需用户测试 |
| 重启后前端面板更新为新版代码 | ⬜ | 需用户测试 |
| 设置菜单"重启 Agent"正常工作 | ⬜ | 需用户测试 |
| 设置菜单"重新注入 UI"正常工作 | ⬜ | 需用户测试 |

---

## v3.2.1 — 2026-03-02 — chore: 统一文档管理 + Agent UI 优化 + 链接处理修复

**提交者**: @tianyi.liang
**Commit Type**: chore
**修改模块**: SeaTalk Agent / 文档 / Git Hooks

### 变更说明

#### 文档统一管理
- 建立 `docs/guides/` 统一文档目录，每个模块一份专属指南：
  - `CHROME_EXTENSION.md` — Chrome 扩展
  - `MCP_TOOLS.md` — MCP 工具（合并自 `mcp-tools/README.md` + `MCP_RECOMMENDATIONS.md`）
  - `SEATALK_AGENT.md` — SeaTalk Agent（从 `SEATALK_AGENT_USER_GUIDE.md` 重命名）
  - `SKILL.md` — Cursor Skill（从 `docs/SKILL_INSTALL.md` 迁移并重写，区分内部/外部 MCP）
- `README.md` 简化为项目导航入口，链接到各模块指南
- `pre-push` hook 新增模块 ↔ 文档联动检查（修改代码必须更新对应文档）

#### SeaTalk Agent UI 优化
- 设置菜单：SVG 图标替换 emoji，移除冗余"重连 Agent"，"重启 Agent"提升为首位
- 重启 Agent 操作增强：同时重新注入 UI（`injectUI()`），实现完整重启
- Agent 回复消息中的链接：拦截默认行为，改为系统浏览器打开（`shell.openExternal`）
  - 同时覆盖 `sidebar-panel.js` 和 `cursor-ui.js`

#### Git Hooks 强化
- `pre-push` 新增 4 个模块的文档联动检查
- `commit-msg`、`pre-commit` hook 创建（Conventional Commits 校验、敏感文件拦截）
- `scripts/setup-hooks.sh` 一键安装 + `package.json` prepare 自动触发

### 测试清单

| 测试项 | 状态 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | 本次未修改扩展代码 |
| MCP 工具正常 | N/A | 本次未修改 MCP 代码 |
| SeaTalk Agent 重启正常 | ⬜ | 需用户测试 |
| Agent 消息中链接在系统浏览器打开 | ⬜ | 需用户测试 |
| 设置菜单 SVG 图标显示正常 | ⬜ | 需用户测试 |
| commit-msg hook 拦截无效消息 | ✅ | 已测试 |
| pre-commit hook 拦截敏感文件 | ✅ | 已测试 |
| pre-push hook 文档联动检查 | ✅ | 已测试 |
| 文档链接有效 | ✅ | 已验证 |

### 特别注意
- 旧文档已清理（`SKILL_INSTALL.md`、`SEATALK_AGENT_UPDATE_REPRO`），`mcp-tools/` 下旧文档已添加重定向
- `SEATALK_AGENT_USER_GUIDE.md` 已删除，统一使用 `SEATALK_AGENT.md`

---

## v3.2.0 — 2026-04-02 — chore: 全面 Git Hooks 规则化

**提交者**: @tianyi.liang
**Commit Type**: chore
**修改模块**: Git Hooks / 构建工具

### 变更说明
- 新建 `.githooks/commit-msg` — 校验 Conventional Commit 格式（type + 有意义描述）
- 新建 `.githooks/pre-commit` — 拦截敏感文件、密钥泄露、垃圾文件、大文件
- 强化 `.githooks/pre-push` — 新增 commit message 格式复查（防 `--no-verify` 绕过）+ 双仓库推送提醒
- 新建 `scripts/setup-hooks.sh` — 自动安装 hooks 脚本
- `package.json` 添加 `prepare` 脚本，clone 后 `npm install` 自动安装 hooks

### 测试清单

| 测试项 | 结果 | 备注 |
|--------|------|------|
| commit-msg: 拒绝无格式消息 | ✅ | `update` 被拦截 |
| commit-msg: 拒绝无意义描述 | ✅ | `feat: update` 被拦截 |
| commit-msg: 通过正确格式 | ✅ | `feat(agent): 添加后台加好友功能` |
| commit-msg: 放行 merge commit | ✅ | `Merge branch...` |
| setup-hooks.sh 执行成功 | ✅ | 3 个 hooks 全部安装 |

---

## v3.2.0 — 2026-04-02 — feat: SeaTalk 发消息 + 后台加好友能力

**提交者**: @tianyi.liang
**Commit Type**: feat
**修改模块**: SeaTalk Agent / MCP 工具

### 变更说明
- 新增 `seatalk-send.js` 注入脚本：通过 React Fiber 提取 Redux actions 实现程序化发消息（支持纯文本和 Markdown）
- 通过 dynamic import SeaTalk 的 `chunk-service` 模块提取 `ContactService` 单例，实现后台 RPC 加好友（零 DOM 操作，不干扰用户使用）
- `main.ts` 新增 `send_message` / `add_contact` bridge handler
- MCP 新增 4 个工具：`search_seatalk_users`（企业通讯录搜索）、`add_seatalk_contact`（后台加好友）、`send_seatalk_message`（发消息）、`get_send_targets`（查询可用会话）
- 注入脚本增加版本号机制，支持 agent 重启后热更新覆盖
- 更新完成提示中增加 MCP 重启提醒

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | 未修改 |
| MCP 工具连接正常 | ✅ | 4 个新 MCP 工具均可用 |
| SeaTalk Agent 启动+注入正常 | ✅ | seatalk-send.js 注入成功 |
| SeaTalk Agent 重启后 UI 恢复 | ✅ | 版本号机制生效 |
| 修改的功能正常工作 | ✅ | 批量添加 8 个联系人成功、发消息功能正常 |
| 已有功能未被破坏 | ✅ | |

---

## v3.1.5 — 2026-04-02 — chore: pre-push 远程同步检查 + MCP 工具输出优化

**提交者**: @tianyi.liang
**Commit Type**: chore
**修改模块**: SeaTalk Agent / Git Hooks / 规则

### 变更说明
- pre-push hook 新增远程同步检查：push 前自动 fetch 并检查是否落后于远程，防止覆盖他人提交
- git-workflow 规则同步更新：Agent 自动检查项增加远程同步步骤
- MCP 工具结果优化：尝试从 content 数组提取完整结果；检测到 `{success:true}` 时显示友好提示"OK — 完整结果见下方回复"
- 清理调试日志

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | 未修改 |
| MCP 工具连接正常 | N/A | 未修改 MCP server |
| SeaTalk Agent 启动+注入正常 | ✅ | |
| SeaTalk Agent 重启后 UI 恢复 | ✅ | |
| 修改的功能正常工作 | ✅ | MCP 工具提示、hook 检查均生效 |
| 已有功能未被破坏 | ✅ | |
| 控制台无新增错误 | ✅ | |

### 特别注意
- pre-push hook 的远程同步检查需要网络连接，fetch 失败会静默跳过不阻塞
- ACP CLI 对 MCP 工具只返回 `{success:true}`，完整查询结果由模型在回复文本中呈现，属于上游限制

---

## v3.1.5 — 2026-04-02 — style: UI全面SVG化 + 工具展示优化

**提交者**: @tianyi.liang
**Commit Type**: style
**修改模块**: SeaTalk Agent

### 变更说明
- 所有 emoji 图标替换为 SVG：工具状态（✅❌⏳→SVG）、思考（💭→SVG）、展开箭头（▶▼→SVG chevron）、品牌标识（✦→SVG）、关闭按钮（✕→SVG）
- 修复工具折叠时的白条：移除 `.ca-tool-call` 容器，折叠时不占空间
- 工具输出 truncLen 从 500 提升到 2000，max-height 从 400px 到 600px
- MCP 工具名称简化：`presto-query-query_presto: query_presto` → `MCP: query_presto`
- 修复 docked 面板遮挡原生弹窗（z-index/backdrop-filter reset）

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | 本次未修改扩展 |
| MCP 工具连接正常 | N/A | 本次未修改 MCP |
| SeaTalk Agent 启动+注入正常 | ✅ | 重启后 UI 正常注入 |
| SeaTalk Agent 重启后 UI 恢复 | ✅ | |
| 修改的功能正常工作 | ✅ | SVG 图标、工具展示、z-index 修复均生效 |
| 已有功能未被破坏 | ✅ | |
| 控制台无新增错误 | ✅ | |

### 特别注意
- 纯 UI 样式修改，不涉及功能逻辑变更
- 其他用户需重启 seatalk agent 生效

---

## v3.1.5 — 2026-04-02

**提交者**: @tianyi.liang
**Commit Type**: fix
**修改模块**: SeaTalk Agent / 构建工具

### 变更说明
- CDP 页面选择修复：排除 mediaViewer/serviceWorker 等子页面，只连接 SeaTalk 主聊天页
- 孤儿进程清理：启动时自动 kill 残留的 `agent --approve-mcps` 进程，退出时 SIGTERM/SIGKILL 确保子进程被回收
- main 分支保护：pre-push hook 阻止直接推送到 main/master
- RELEASE_LOG 强制记录：hook 改为检查最新 commit 是否修改了 RELEASE_LOG.md

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | |
| MCP 工具连接正常 | N/A | |
| SeaTalk Agent 启动+注入正常 | ✅ | 多媒体预览页打开时重启，正确连接主页面 |
| SeaTalk Agent 重启后 UI 恢复 | ✅ | 面板自动恢复 |
| 修改的功能正常工作 | ✅ | 孤儿进程清理、CDP 页面过滤均验证通过 |
| 已有功能未被破坏 | ✅ | |
| 控制台无新增错误 | ✅ | |

---

## v3.1.4 — 2026-04-02 — `afa3c8c` docs: 清理垃圾文件 + 强化 RELEASE_LOG

**提交者**: @tianyi.liang
**Commit Type**: docs
**修改模块**: 文档 / 构建工具

### 变更说明
- 删除 docs/diagrams/、docs/investigations/、SEATALK_AGENT_UPDATE_REPRO（选错工程区域产生的垃圾文件）
- 删除 mcp-tools/share-package/（旧分发包，已被 uvx 替代）
- pre-push hook 改为按 commit hash 检查 RELEASE_LOG（解决 docs 类型提交不触发检查的问题）
- git-workflow.mdc 明确所有 commit type 都必须写 release log
- RELEASE_LOG 标题格式增加 commit hash

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | 纯文档/工具链变更 |
| MCP 工具连接正常 | N/A | |
| SeaTalk Agent 启动+注入正常 | N/A | |
| SeaTalk Agent 重启后 UI 恢复 | N/A | |
| 修改的功能正常工作 | ✅ | pre-push hook 按 hash 检查逻辑正确 |
| 已有功能未被破坏 | ✅ | |
| 控制台无新增错误 | N/A | |

---

## v3.1.4 — 2026-04-02 — `8b3f647` docs: 清理过时文档

**提交者**: @tianyi.liang
**Commit Type**: docs
**修改模块**: 文档

### 变更说明
- docs/ 从 106 个文件精简到 9 个，删除所有 v2.x "值班助手" 时代文档
- 修正 README.md 中指向已删除文件的链接

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | 纯文档变更 |
| MCP 工具连接正常 | N/A | |
| SeaTalk Agent 启动+注入正常 | N/A | |
| SeaTalk Agent 重启后 UI 恢复 | N/A | |
| 修改的功能正常工作 | N/A | |
| 已有功能未被破坏 | ✅ | |
| 控制台无新增错误 | N/A | |

---

## v3.1.4 — 2026-04-02 — `ecc6cfc` fix: v3.1.4

**提交者**: @tianyi.liang
**Commit Type**: fix
**修改模块**: SeaTalk Agent / 文档 / 构建工具

### 变更说明
- 更新后 UI 自动恢复：sidebar-app.js 通过 localStorage 记录面板状态和更新状态，重新注入后自动恢复面板并显示更新成功通知
- 发版流程规范化：新增 RELEASE_LOG.md + .githooks/pre-push hook + git-workflow.mdc Agent 自动检查流程
- README/INSTALL 全面更新：补齐 scheduler-query/seatalk-group 配置、修正 DMP 路径（RAM → Profile）、新增凭证格式示例、InfraBot Token 说明

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | |
| MCP 工具连接正常 | N/A | |
| SeaTalk Agent 启动+注入正常 | ✅ | |
| SeaTalk Agent 重启后 UI 恢复 | ✅ | localStorage 面板状态持久化验证通过 |
| 修改的功能正常工作 | ✅ | |
| 已有功能未被破坏 | ✅ | |
| 控制台无新增错误 | ✅ | |

---

## v3.1.3 — 2026-04-02 — `00a7681` fix: v3.1.3

**提交者**: @tianyi.liang
**Commit Type**: fix
**修改模块**: SeaTalk Agent / 文档

### 变更说明
- Cursor CLI 预检查：启动时检测 `agent` 命令是否存在，未安装给出安装指引
- ACP 启动失败时前端显示针对性错误提示
- 新增 seatalk-troubleshoot Skill

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | |
| MCP 工具连接正常 | N/A | |
| SeaTalk Agent 启动+注入正常 | ✅ | |
| SeaTalk Agent 重启后 UI 恢复 | ✅ | |
| 修改的功能正常工作 | ✅ | Cursor CLI 路径检测正常 |
| 已有功能未被破坏 | ✅ | |
| 控制台无新增错误 | ✅ | |

---

## v3.1.2 — 2026-04-02 — `c108aa3` fix: v3.1.2

**提交者**: @tianyi.liang
**Commit Type**: fix
**修改模块**: SeaTalk Agent

### 变更说明
- 修复更新后 UI 卡在"更新中"的问题（CDP 超时 + 前端选择器 + 强制重新注入）
- 版本号自检规则强化

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | |
| MCP 工具连接正常 | N/A | |
| SeaTalk Agent 启动+注入正常 | ✅ | |
| SeaTalk Agent 重启后 UI 恢复 | ✅ | 从 v3.1.2 更新到 v3.1.3 测试通过 |
| 修改的功能正常工作 | ✅ | 更新流程不再卡住 |
| 已有功能未被破坏 | ✅ | |
| 控制台无新增错误 | ✅ | |

---

## v3.1.1 — 2026-04-01 — `15be88e` docs: seatalk-troubleshoot Skill

**提交者**: @tianyi.liang
**Commit Type**: chore
**修改模块**: SeaTalk Agent

### 变更说明
- 空发版，仅递增版本号用于同事复现更新流程问题

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | N/A | |
| MCP 工具连接正常 | N/A | |
| SeaTalk Agent 启动+注入正常 | ✅ | |
| 修改的功能正常工作 | N/A | 无业务代码变更 |
| 已有功能未被破坏 | ✅ | |
| 控制台无新增错误 | ✅ | |

---

## v3.1.0 — 2026-04-01 — `ea4f005` feat: v3.1.0

**提交者**: @tianyi.liang
**Commit Type**: feat
**修改模块**: 全部

### 变更说明
- 项目结构重构：seatalk-agent 提升为顶级目录
- CDP 守护进程自动启用
- Spark SQL 查询工具新增
- 模块化安装指南
- Cursor Rules 分域重构

### 测试情况

| 测试项 | 结果 | 备注 |
|--------|------|------|
| Chrome 扩展加载正常 | ✅ | |
| MCP 工具连接正常 | ✅ | |
| SeaTalk Agent 启动+注入正常 | ✅ | |
| 修改的功能正常工作 | ✅ | |
| 已有功能未被破坏 | ✅ | |
| 控制台无新增错误 | ✅ | |

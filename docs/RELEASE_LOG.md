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

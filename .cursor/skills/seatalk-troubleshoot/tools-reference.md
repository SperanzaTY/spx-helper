# SeaTalk Troubleshoot — 工具与命令参考

本文档列出排查 SeaTalk Agent 问题时使用的工具、命令和关键代码位置。

## 终端命令

### 进程管理

| 命令 | 用途 |
|------|------|
| `ps aux \| grep "tsx src/main" \| grep -v grep` | 查看 Agent 进程 |
| `pkill -f "tsx src/main"` | 杀掉所有 Agent 进程 |
| `kill -9 <pid>` | 强制杀掉指定进程 |
| `lsof -i :19222 -t` | 查看占用 CDP 端口的进程 |

### CDP 诊断

| 命令 | 用途 |
|------|------|
| `curl -s http://127.0.0.1:19222/json` | 列出 CDP 可调试页面 |
| `curl -s http://127.0.0.1:19222/json/version` | CDP 版本信息 |

### Agent 启动

| 命令 | 用途 |
|------|------|
| `seatalk` | alias 启动（已安装） |
| `npx tsx src/main.ts` | 开发模式启动（在 seatalk-agent/ 下） |
| `bash install.sh` | 安装 LaunchAgent + CDP 守护进程 |
| `bash install.sh uninstall` | 卸载 |

### Git 版本检查

| 命令 | 用途 |
|------|------|
| `grep '"version"' chrome-extension/manifest.json` | 本地版本号 |
| `git show origin/release:chrome-extension/manifest.json \| grep '"version"'` | 远程版本号 |
| `git rev-list --count HEAD..origin/release` | 落后 commit 数 |
| `git fetch origin release` | 拉取远程最新信息 |
| `git log --oneline -5` | 最近提交 |
| `git status --short` | 工作区状态 |
| `git diff --stat` | 修改文件列表 |

### 日志查看

| 命令 | 用途 |
|------|------|
| `tail -50 ~/.seatalk-agent/logs/agent.log` | Agent 主日志 |
| `tail -20 ~/.seatalk-agent/logs/cdp-daemon.log` | CDP 守护进程日志 |
| `grep "\[updater\]" ~/.seatalk-agent/logs/agent.log \| tail -10` | 更新相关日志 |
| `grep "FAILED\|timeout" ~/.seatalk-agent/logs/agent.log \| tail -10` | 错误日志 |
| `grep "inject" ~/.seatalk-agent/logs/agent.log \| tail -5` | 注入相关日志 |
| `grep "reconnect\|heartbeat" ~/.seatalk-agent/logs/agent.log \| tail -10` | 重连日志 |

## 关键代码位置

### main.ts 核心函数

| 函数 | 行号范围 | 职责 |
|------|---------|------|
| `checkUpdate()` | ~34-78 | 版本检查：fetch → 对比 manifest version → 计算 behind |
| `applyUpdate()` | ~80-125 | 应用更新：检查工作区 → rebase → npm install |
| `silentUpdateCheck()` | ~1003-1008 | 静默更新检查（30s + 10min 定时） |
| `doInject()` | ~945-968 | UI 注入：始终重新注入最新代码 |
| `setupCdpClient()` | ~983-997 | CDP 初始化：bridge + 事件监听 + 注入 + heartbeat |
| `cdpReconnectLoop()` | ~1015-1033 | CDP 断连后的自动重连循环 |
| `setupMessageHandler()` | ~556+ | 前端消息路由（update_apply, user_message 等） |

### bridge.ts

| 方法 | 说明 |
|------|------|
| `sendToPanel(data, timeoutMs?)` | Node→页面，通过 `evaluate(__agentReceive(json))` |
| `setup()` | 建立 `__agentSend` binding |
| `onMessage(handler)` | 注册消息处理器 |

### cdp.ts

| 方法 | 说明 |
|------|------|
| `evaluate(code, timeoutMs=30000)` | 在页面执行 JS，默认 30s 超时 |
| `send(method, params, timeoutMs)` | 发送 CDP 命令 |
| `connectMainPage(port)` | 连接 SeaTalk 主页面 |

### sidebar-app.js 消息处理

| 消息类型 | 方向 | 处理逻辑 |
|---------|------|---------|
| `update_available` | Node→页面 | 更新 `cachedUpdate`，渲染更新面板 |
| `update_apply` | 页面→Node | 按钮 disabled，触发 `applyUpdate` |
| `update_progress` | Node→页面 | 追加进度文本到进度区 |
| `update_done` | Node→页面 | 显示成功/失败，失败时恢复按钮 |
| `status` | Node→页面 | 连接状态更新 |
| `user_message` | 页面→Node | 用户对话消息 |
| `text_chunk` | Node→页面 | AI 回复流式文本 |

## 版本历史中的关键修复

| 版本 | 修复 | 相关代码 |
|------|------|---------|
| v3.1.1 | applyUpdate 同步化，消息 3s 短超时 | `main.ts` applyUpdate + update_apply handler |
| v3.1.1 | doInject 始终重新注入 | `main.ts` doInject 函数 |
| v3.1.1 | 修复 data-act vs data-action selector | `sidebar-app.js` update_done handler |
| v3.1.1 | sendToPanel 支持自定义超时 | `bridge.ts` sendToPanel 参数 |

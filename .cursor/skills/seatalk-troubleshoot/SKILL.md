---
name: seatalk-troubleshoot
description: SeaTalk Agent 问题定位工作流。用于排查 SeaTalk 内嵌 AI 助手的各类故障：Agent 无法启动、卡死无响应、重启失败、CDP 连接失败、UI 不显示或重复、Remote 回复异常、更新卡住、消息不通、ACP 断连等。当用户描述"Agent 不工作"、"面板打不开"、"Agent 卡死"、"重启没反应"、"UI 重复了"、"Remote 没反馈"等问题时触发。
---

<!-- 本 Skill 位于 .cursor/skills/，版本随 SPX_Helper 仓库维护。
     依赖：无外部 MCP，仅需终端访问和项目源码。 -->

# SeaTalk Agent Troubleshoot

## 架构速查

```
SeaTalk 桌面端 (Electron)
  │
  ├── CDP (Chrome DevTools Protocol, port 19222)
  │     用于 Node.js ↔ SeaTalk 页面双向通信
  │
  └── 页面内注入的 JS
        ├── cursor-ui.js        (UI 基础组件库)
        ├── sidebar-app.js      (面板逻辑：消息、更新、设置)
        ├── seatalk-send.js     (消息发送函数 __seatalkSend)
        └── seatalk-watch.js    (Redux 消息监听 __seatalkWatch)

Node.js Agent (seatalk-agent/src/main.ts)
  ├── CdpClient      → 连接 SeaTalk CDP，注入 JS、收发消息
  ├── Bridge         → 消息桥：__agentSend (页面→Node) / __agentReceive (Node→页面)
  ├── ACP Agent      → Cursor Agent Protocol，主 AI 对话
  ├── Remote Agent   → 独立 ACP 实例，处理远程控制指令
  ├── Updater        → git fetch gitlab + manifest 版本对比 + rebase 更新
  └── launch.sh      → 进程监控，exit(42) 自动重启
```

**关键文件**

| 文件 | 职责 |
|------|------|
| `seatalk-agent/src/main.ts` | 核心入口：CDP 连接、UI 注入、消息路由、更新检查、Remote 控制 |
| `seatalk-agent/src/bridge.ts` | CDP 消息桥，封装 `evaluate` 和 `addBinding` |
| `seatalk-agent/src/cdp.ts` | CDP 底层：WebSocket 连接、消息超时管理 |
| `seatalk-agent/src/acp.ts` | ACP 子进程：spawn Agent、MCP 加载 |
| `seatalk-agent/src/inject/sidebar-app.js` | 前端面板 UI 逻辑（含 `__cursorSidebarCleanup`） |
| `seatalk-agent/src/inject/cursor-ui.js` | 前端 UI 基础组件 |
| `seatalk-agent/src/inject/seatalk-watch.js` | Redux 消息监听（版本化 + `addSentText` 防回环） |
| `seatalk-agent/launch.sh` | 进程监控脚本（`while true` + exit(42) 自动重启） |

**关键常量**

| 常量 | 值 | 说明 |
|------|---|------|
| `CDP_PORT` | `19222` | SeaTalk CDP 调试端口 |
| CDP 超时 | 默认 30s，更新消息 3s | `cdp.ts` 的 `evaluate(code, timeoutMs)` |
| 更新检查 | 启动 30s 后首次，后每 10 分钟 | `silentUpdateCheck`，追踪 **gitlab** remote |
| Heartbeat | 每 5 秒 `evaluate('1', 3000)` | 失败则触发 CDP 重连 |
| `WATCH_VERSION` | `5` | seatalk-watch.js 版本号，用于旧版监听器清理 |
| `exit(42)` | 特殊退出码 | launch.sh 识别后自动重启 |

---

## 排查流程

按层次从底层向上排查。每个 Phase 开头都先确认正常条件，不满足则定位问题。

### Phase 0：环境检查 — Agent 进程是否在运行

```bash
# 检查 Agent 进程（推荐用这条，覆盖所有启动方式）
ps aux | grep -E 'tsx.*main|agent.*approve' | grep -v grep

# 检查是否有僵尸进程占用 CDP 端口
lsof -i :19222 -t
```

**判断标准**：
- 有 `tsx` + `main.ts` 进程 → Agent 在运行，进入 Phase 1
- 无进程 → 需要启动 Agent
- **有多个进程** → 这是常见问题源，见 Phase 0.5

**启动 Agent**：
```bash
# 推荐：通过 launch.sh（自带进程监控和自动重启）
cd <PROJECT_ROOT>/seatalk-agent && SEATALK_LAUNCHER=1 bash launch.sh

# 开发模式
cd <PROJECT_ROOT>/seatalk-agent && npx tsx src/main.ts
```

**常见启动失败原因**：
- `node_modules` 未安装 → `cd seatalk-agent && npm install`
- tsx 未安装 → `npm install -g tsx`
- 端口被占 → 杀掉占用进程后重试
- 上次 detached 子进程静默崩溃 → 查看 `~/.seatalk-agent/logs/restart.log`

---

### Phase 0.5：多进程冲突 — Agent 重复运行

**这是 UI 重复/行为异常的常见根因。** 多个 Agent 进程同时运行会导致：
- 重复注入 UI → 多个面板/按钮叠加
- CDP 端口竞争 → 消息路由混乱
- 多个 ACP Agent 同时活跃 → 资源浪费

**诊断**：
```bash
# 列出所有 Agent 相关进程
ps aux | grep -E 'tsx.*main|npm.*exec.*tsx|agent.*approve' | grep -v grep

# 查看占用 CDP 端口的进程
lsof -i :19222 -t | xargs -I {} ps -p {} -o pid,command
```

**修复**：
```bash
# 杀掉所有 Agent 进程
ps aux | grep -E 'tsx.*main|agent.*approve' | grep -v grep | awk '{print $2}' | xargs kill

# 通过 CDP 清理残留 UI 元素
curl -s http://127.0.0.1:19222/json | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['webSocketDebuggerUrl'])"
# 然后用 CDP evaluate 执行：
# document.querySelectorAll('.hp-panel, .cursor-sidebar-btn, .cursor-remote-popover, .cursor-tooltip').forEach(el => el.remove())

# 重新启动单个 Agent
cd <PROJECT_ROOT>/seatalk-agent && npx tsx src/main.ts
```

**根因：为什么会出现多进程？**
- `restart_agent` 在非 launch.sh 环境下会 spawn detached 子进程再 exit，如果 exit 前新进程已经启动了 `killAllStaleAgentProcesses`，可能产生竞态
- 手动启动 + LaunchAgent 自动启动并发
- detached 子进程的 stdio 未重定向，崩溃时无日志

---

### Phase 1：CDP 连接 — SeaTalk 是否以调试模式运行

```bash
# 验证 CDP 是否可用
curl -s http://127.0.0.1:19222/json | python3 -c "
import json, sys
pages = json.load(sys.stdin)
for p in pages:
    print(f'{p[\"type\"]:10s} {p[\"url\"][:80]}')
"
```

**判断标准**：
- 返回页面列表且包含 `web.haiserve.com` → CDP 正常，进入 Phase 2
- `Connection refused` → SeaTalk 未以 CDP 模式启动
- 返回页面但无 `haiserve` → SeaTalk 未打开或在其他页面

**修复**：
```bash
# 手动重启 SeaTalk 以 CDP 模式
open -a SeaTalk --args --remote-debugging-port=19222
```

---

### Phase 2：Agent 日志分析 — 启动过程是否正常

```bash
# 日志文件
tail -50 ~/.seatalk-agent/logs/agent.log

# 重启日志（detached 子进程的输出）
cat ~/.seatalk-agent/logs/restart.log
```

**正常启动流程**：

```
[agent] killed stale agent process tree (root XXX)   ← 清理旧进程
[agent] SeaTalk CDP already available
[agent] connecting to SeaTalk CDP on port 19222...
[agent] connected: SeaTalk (https://web.haiserve.com/)
[agent] waiting for SPA ready...
[agent] SPA ready
[agent] message bridge ready
[agent] starting ACP agent...
[agent] ACP agent connected
[agent] injecting cursor-ui...
[agent] injecting sidebar panel...
[agent] injecting seatalk-send...
[agent] injecting seatalk-watch...
[agent] injection complete!
[agent] watch listener started (always-on)
[agent] [remote] 正在启动远程 Agent...
[agent] [remote] 远程 Agent 就绪 ✓
```

**卡在某一步**：

| 卡在 | 可能原因 | 排查方法 |
|------|---------|---------|
| `connecting to SeaTalk CDP` | CDP 端口不通 | Phase 1 |
| `waiting for SPA ready` | SeaTalk 页面加载慢 | 等待或手动刷新 SeaTalk |
| `starting ACP agent` | `agent` CLI 未安装 | `which agent` |
| `authenticating` | ACP 认证失败 | 检查网络 |
| `正在启动远程 Agent` 后无 `就绪` | Remote Agent spawn 失败 | 检查 ACP 进程和网络 |

---

### Phase 3：UI 注入 — 面板是否显示 / 是否重复

Agent 启动后通过 CDP 注入 4 个前端脚本。注入链路有完整的去重保护：

**去重机制清单**：

| 组件 | 去重方式 |
|------|---------|
| CSS 样式 | `injectCSS()` 先 `getElementById → remove` |
| `#cursor-panel` | sidebar-app.js 开头 `oldPanel.remove()` |
| `#cursor-remote-popover` | sidebar-app.js 开头 `oldPopover.remove()` |
| `.cursor-tooltip` | sidebar-app.js 开头 `querySelectorAll → remove` |
| sidebar 按钮 | `createSidebarButton` 内部 `existing.remove()` |
| 事件监听器 | `AbortController` 统一管理，re-inject 时 `abort()` |
| `MutationObserver` | `_observers` 注册表，re-inject 时 `disconnect()` |
| `seatalk-watch.js` | `WATCH_VERSION` 版本号 + `stop()` 旧监听 |

**如果仍出现 UI 重复**：
1. 检查是否多进程（Phase 0.5）
2. 检查 `window.__cursorSidebarCleanup` 是否存在（旧版本无此函数）
3. 强制清理：
```javascript
// 在 CDP 或 DevTools Console 中执行
if (window.__cursorSidebarCleanup) window.__cursorSidebarCleanup();
document.querySelectorAll('.hp-panel, .cursor-sidebar-btn, .cursor-remote-popover, .cursor-tooltip, .cursor-sel-fab').forEach(el => el.remove());
```

---

### Phase 4：消息通信 — Bridge 是否畅通

- **页面 → Node**：`window.__agentSend(json)` → CDP `Runtime.addBinding` → Bridge handler
- **Node → 页面**：`bridge.sendToPanel(data)` → CDP `Runtime.evaluate("__agentReceive(json)")`

```bash
# 检查收发消息
grep "received (bridge" ~/.seatalk-agent/logs/agent.log | tail -10
grep "sendToPanel.*FAILED" ~/.seatalk-agent/logs/agent.log | tail -10
```

| 现象 | 原因 | 解决 |
|------|------|------|
| `FAILED type=... CDP timeout (30000ms)` | 页面无响应 | `Cmd+R` 刷新 SeaTalk |
| Agent 收不到前端消息 | Bridge binding 断开 | 重启 Agent |
| 前端无法发送 | `__agentSend` 未定义 | UI 未注入，回到 Phase 3 |

---

### Phase 5：Remote 控制 — 远程指令与回复

Remote 控制通过 Saved Messages（自己跟自己的对话）下发指令：

```
用户发消息 → seatalk-watch.js 检测到自会话新消息
  → 过滤掉 Agent 自己的回复（addSentText + 前缀检查）
  → 触发 __agentSend → main.ts processRemoteCmds
  → ACP prompt / 系统命令 → __seatalkSend 回复
```

**诊断**：
```bash
# Remote 日志
grep "\[remote\]" ~/.seatalk-agent/logs/agent.log | tail -20

# 或通过系统命令（在 Saved Messages 中发送）
!!status    # 查看 Remote Agent 状态
!!logs 20   # 查看最近 20 条日志
!!ping      # 存活检测
```

**常见问题**：

| 现象 | 原因 | 解决 |
|------|------|------|
| 发消息没反馈 | Remote Agent 未就绪，指令在 spawn 期间被丢弃 | 检查日志中是否有 `远程 Agent 就绪 ✓`；已修复为排队等待 |
| Agent 回复引发死循环 | watch 把 Agent 的回复重新捕获当新指令 | 已修复：`addSentText` + `Remote Agent` 前缀检查 + 后端 `startsWith` 过滤 |
| `!!remote on` 回复触发循环 | 系统命令的 text 回复未标记为已发送 | 已修复：系统命令回复前调用 `addSentText` |
| 消息冻结不生效 | `remoteProcessingActive` 状态异常 | 检查是否有未捕获异常跳过了 `finally` 块 |
| Remote 默认未开启 | 旧版本 `remoteEnabled` 默认 false | 升级到 v3.3.1+（默认 true） |

---

### Phase 6：更新机制 — 版本检查与更新流程

更新追踪 **gitlab** remote（非 origin），部分同事可能无 GitHub 权限。

```
silentUpdateCheck() [每 10min]
  → git fetch gitlab release
  → 读本地 manifest.json version (local)
  → 读远程 manifest.json version (remote)
  → available = behind > 0 && remote !== local
```

```bash
# 查看更新检查结果
grep "\[updater\]" ~/.seatalk-agent/logs/agent.log | tail -10

# 手动检查
grep '"version"' chrome-extension/manifest.json
git fetch gitlab release && git show gitlab/release:chrome-extension/manifest.json | grep '"version"'
git rev-list --count HEAD..gitlab/release
```

| 现象 | 原因 | 解决 |
|------|------|------|
| 没有更新提示 | `behind=0` 或 `remote=local` | 正常，本地已是最新 |
| 一直显示有更新 | `git fetch` 失败 | 检查 gitlab remote URL：`git remote get-url gitlab` |
| 工作区有修改无法更新 | `git diff --quiet` 检测到改动 | `git stash` 后再更新 |
| 版本号不变但有新 commit | 只做了 docs/chore 提交 | 正常，更新需版本号不同 |
| 追踪了错误的 remote | origin 指向 GitHub | 确认 updater 追踪 gitlab |

**手动更新**：
```bash
cd <PROJECT_ROOT>
git fetch gitlab release
git rebase gitlab/release
cd seatalk-agent && npm install
# 重启 Agent
```

---

### Phase 7：ACP 连接 — AI 对话能力

```bash
# 确认 agent CLI
ls -la ~/.local/bin/agent

# ACP 日志
grep "ACP\|acp\|agent" ~/.seatalk-agent/logs/agent.log | tail -20
```

| 现象 | 原因 | 解决 |
|------|------|------|
| `agent: command not found` | CLI 未安装 | 参照 INSTALL.md |
| `authenticating... [卡住]` | 网络或认证服务不可用 | 检查网络 |
| `loaded 0 MCP servers` | mcp.json 为空或格式错 | 检查 `~/.cursor/mcp.json` |
| 对话无响应 | ACP 进程崩溃 | 面板"重启 Agent"或杀进程重启 |

---

### Phase 8：Agent 重启 — 进程生命周期

Agent 重启有两条路径：

```
路径 A（有 launch.sh 管理）：
  restart_agent → process.exit(42) → launch.sh 检测退出码 → 自动重启

路径 B（无 launch.sh，直接运行）：
  restart_agent → spawn detached 子进程 → 新进程 stdout/stderr → ~/.seatalk-agent/logs/restart.log
                → 当前进程 exit(0)
```

**常见问题**：

| 现象 | 原因 | 解决 |
|------|------|------|
| 点"重启 Agent"后无响应 | detached 子进程启动失败 | 查看 `~/.seatalk-agent/logs/restart.log` |
| 重启后出现多个 UI | 旧进程未完全退出、新进程已注入 | Phase 0.5 |
| 重启后 Agent 再次卡死 | 新进程被 `killAllStaleAgentProcesses` 误杀 | 竞态条件，间隔几秒后再启动 |
| exit(42) 后未自动重启 | 非 launch.sh 环境，无人监控退出码 | 用 `SEATALK_LAUNCHER=1 bash launch.sh` 启动 |

---

### Phase 9：Heartbeat 与重连

Agent 每 5 秒发一次 heartbeat，失败触发 CDP 重连 → 重新注入。

```bash
grep "heartbeat\|reconnect" ~/.seatalk-agent/logs/agent.log | tail -10
```

- `heartbeat failed` → SeaTalk 页面被关闭/切换
- `CDP reconnect failed, retrying in 3s` → SeaTalk 完全退出
- 重连后 `setupCdpClient` → `doInject` → 重新注入 UI

---

## 快速诊断清单

```bash
# 1. Agent 进程（含 Remote Agent）
ps aux | grep -E 'tsx.*main|agent.*approve' | grep -v grep

# 2. CDP 端口
curl -s http://127.0.0.1:19222/json | head -5

# 3. Agent 日志最后 20 行
tail -20 ~/.seatalk-agent/logs/agent.log

# 4. 重启日志（detached 子进程）
cat ~/.seatalk-agent/logs/restart.log 2>/dev/null | tail -20

# 5. Remote 状态
grep "\[remote\]" ~/.seatalk-agent/logs/agent.log | tail -10

# 6. 更新状态
grep "\[updater\]" ~/.seatalk-agent/logs/agent.log | tail -5

# 7. 通信错误
grep "FAILED\|timeout\|error" ~/.seatalk-agent/logs/agent.log | tail -10

# 8. 版本一致性
grep '"version"' <PROJECT_ROOT>/chrome-extension/manifest.json
git show gitlab/release:chrome-extension/manifest.json 2>/dev/null | grep '"version"'
```

---

## 常见坑

| 坑 | 现象 | 解决 |
|----|------|------|
| 多进程并发 | UI 重复、行为异常、CDP 冲突 | 杀掉所有进程 → 清理 DOM → 重启单个 |
| restart_agent 静默失败 | 点重启后 Agent 消失，无日志 | 查看 `~/.seatalk-agent/logs/restart.log` |
| Remote 回复死循环 | Agent 不断回复自己 | 检查 `WATCH_VERSION`；升级到 v3.3.0+ |
| re-inject 事件累积 | 快捷键触发多次、popover 残留 | 升级到 v3.4.1+（AbortController 清理） |
| 更新追踪错误 remote | origin 指向 GitHub，同事无权限 | v3.4.0+ 已改为追踪 gitlab |
| exit(42) 无人接管 | 非 launch.sh 环境无自动重启 | 用 `SEATALK_LAUNCHER=1 bash launch.sh` |
| 旧版 doInject 跳过注入 | Agent 重启后 UI 没更新 | 升级到 v3.1.1+ |
| SeaTalk 未以 CDP 模式启动 | curl :19222 connection refused | `open -a SeaTalk --args --remote-debugging-port=19222` |
| npm 架构不匹配 | arm64 vs x86_64 | `rm -rf node_modules && npm install` |
| 工作区脏导致更新失败 | "工作区有未提交修改" | `git stash` 后再更新 |

---

## 修复操作参考

### 完全重置 Agent（核弹选项）

```bash
# 杀掉所有 Agent 进程
ps aux | grep -E 'tsx.*main|agent.*approve' | grep -v grep | awk '{print $2}' | xargs kill 2>/dev/null

# 通过 CDP 清理残留 UI
# （在 DevTools Console 或 CDP evaluate 中执行）
# if (window.__cursorSidebarCleanup) window.__cursorSidebarCleanup();
# document.querySelectorAll('.hp-panel, .cursor-sidebar-btn, .cursor-remote-popover, .cursor-tooltip').forEach(el => el.remove());

# 清理 node_modules
cd <PROJECT_ROOT>/seatalk-agent
rm -rf node_modules && npm install

# 重置到远程最新
cd <PROJECT_ROOT>
git fetch gitlab release
git reset --hard gitlab/release

# 重启 Agent（推荐通过 launch.sh）
cd seatalk-agent && SEATALK_LAUNCHER=1 bash launch.sh
```

### 强制刷新前端 UI

```bash
# 方法一：Cmd+R 刷新 SeaTalk 页面（Agent 监听 Page.loadEventFired 自动重注入）
# 方法二：重启 Agent（sidebar-app.js 有完整 cleanup + re-inject）
# 方法三：面板设置菜单 → 重新注入 UI
```

---

## Skill 更新记录

| 日期 | 更新内容 | 触发原因 |
|------|----------|----------|
| 2026-04 v2 | 新增 Phase 0.5 多进程冲突、Phase 5 Remote 控制、Phase 8 Agent 重启生命周期；更新架构图加入 seatalk-watch.js/seatalk-send.js/Remote Agent/launch.sh；更新去重机制清单加入 AbortController/cleanup；更新常见坑加入多进程、回复死循环、restart 静默失败、remote 追踪 | 实际排查 Agent 卡死、UI 重复、Remote 回复循环、重启无响应等问题的经验总结 |
| 2026-04 v1 | 初始版本：覆盖 Agent 启动、CDP 连接、UI 注入、消息通信、更新机制、ACP 连接、Heartbeat 重连 7 个排查阶段 | 实际排查更新卡住问题的经验总结 |

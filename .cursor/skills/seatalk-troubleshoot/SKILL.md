---
name: seatalk-troubleshoot
description: SeaTalk Agent 问题定位工作流。用于排查 SeaTalk 内嵌 AI 助手的各类故障：Agent 无法启动、CDP 连接失败、UI 不显示、更新卡住、消息不通、ACP 断连等。当用户描述"SeaTalk Agent 不工作"、"面板打不开"、"更新卡住"、"Agent 没反应"等问题时触发。
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
        ├── cursor-ui.js      (UI 基础组件库)
        └── sidebar-app.js    (面板逻辑：消息、更新、设置)

Node.js Agent (seatalk-agent/src/main.ts)
  ├── CdpClient    → 连接 SeaTalk CDP，注入 JS、收发消息
  ├── Bridge       → 消息桥：__agentSend (页面→Node) / __agentReceive (Node→页面)
  ├── ACP Agent    → Cursor Agent Protocol，提供 AI 对话能力
  └── Updater      → git fetch + manifest 版本对比 + rebase 更新
```

**关键文件**

| 文件 | 职责 |
|------|------|
| `seatalk-agent/src/main.ts` | 核心入口：CDP 连接、UI 注入、消息路由、更新检查 |
| `seatalk-agent/src/bridge.ts` | CDP 消息桥，封装 `evaluate` 和 `addBinding` |
| `seatalk-agent/src/cdp.ts` | CDP 底层：WebSocket 连接、消息超时管理 |
| `seatalk-agent/src/acp.ts` | ACP 子进程：spawn Agent、MCP 加载 |
| `seatalk-agent/src/inject/sidebar-app.js` | 前端面板 UI 逻辑 |
| `seatalk-agent/src/inject/cursor-ui.js` | 前端 UI 基础组件 |
| `seatalk-agent/install.sh` | 安装脚本（LaunchAgent + CDP 守护进程） |
| `seatalk-agent/seatalk-cdp-daemon.sh` | 确保 SeaTalk 以 CDP 模式启动 |

**关键常量**

| 常量 | 值 | 说明 |
|------|---|------|
| `CDP_PORT` | `19222` | SeaTalk CDP 调试端口 |
| `PROJECT_ROOT` | `path.resolve(__dirname, '../..')` | SPX_Helper 根目录 |
| CDP 超时 | 默认 30s，更新消息 3s | `cdp.ts` 的 `evaluate(code, timeoutMs)` |
| 更新检查 | 启动 30s 后首次，后每 10 分钟 | `silentUpdateCheck` |
| Heartbeat | 每 5 秒 `evaluate('1', 3000)` | 失败则触发 CDP 重连 |

---

## 排查流程

按层次从底层向上排查。每个 Phase 开头都先确认正常条件，不满足则定位问题。

### Phase 0：环境检查 — Agent 进程是否在运行

```bash
# 检查 Agent 进程
ps aux | grep "tsx src/main" | grep -v grep

# 检查是否有僵尸进程占用 CDP 端口
lsof -i :19222 -t
```

**判断标准**：
- 有 `tsx src/main.ts` 进程 → Agent 在运行，进入 Phase 1
- 无进程 → 需要启动 Agent
- 有多个进程 → 杀掉多余的，保留一个

**启动 Agent**：
```bash
# 方式一：alias（已安装的用户）
seatalk

# 方式二：开发模式
cd <PROJECT_ROOT>/seatalk-agent && npx tsx src/main.ts

# 方式三：查看 LaunchAgent 状态
launchctl list | grep seatalk
cat ~/Library/LaunchAgents/com.seatalk.agent.plist
```

**常见启动失败原因**：
- `node_modules` 未安装 → `cd seatalk-agent && npm install`
- tsx 未安装 → `npm install -g tsx`
- 端口被占 → 杀掉占用进程后重试

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

**修复 CDP 不可用**：
```bash
# 检查 CDP 守护进程
cat ~/.seatalk-agent/logs/cdp-daemon.log | tail -20

# 手动重启 SeaTalk 以 CDP 模式
# 先关闭 SeaTalk，然后：
open -a SeaTalk --args --remote-debugging-port=19222

# 或通过守护进程
bash <PROJECT_ROOT>/seatalk-agent/seatalk-cdp-daemon.sh
```

---

### Phase 2：Agent 日志分析 — 启动过程是否正常

读取 Agent 日志，确认启动流程每个关键节点的状态。

```bash
# 生产环境日志
tail -50 ~/.seatalk-agent/logs/agent.log

# 开发模式直接看终端输出
```

**正常启动流程（按时间顺序）**：

```
[agent] SeaTalk CDP already available          ← CDP 检查
[agent] connecting to SeaTalk CDP on port 19222...
[agent] connected: SeaTalk (https://web.haiserve.com/)  ← CDP 连接成功
[agent] waiting for SPA ready...               ← 等待页面加载
[agent] SPA ready                              ← 页面就绪
[agent] message bridge ready                   ← Bridge 建立
[agent] starting ACP agent...                  ← 启动 AI Agent
[agent] agent capabilities — image: true       ← ACP 能力确认
[agent] authenticating...                      ← ACP 认证
[agent] loaded N MCP servers from mcp.json     ← MCP 加载
[agent] ACP agent connected                    ← ACP 就绪
[agent] injecting cursor-ui...                 ← UI 注入开始
[agent] injecting sidebar panel...
[agent] injection complete!                    ← UI 注入完成
[agent] [updater] check: local=X, remote=Y...  ← 更新检查（30s 后）
```

**卡在某一步**：按下表逐项排查。

| 卡在 | 可能原因 | 排查方法 |
|------|---------|---------|
| `connecting to SeaTalk CDP` | CDP 端口不通 | Phase 1 |
| `waiting for SPA ready` | SeaTalk 页面加载慢 | 等待或手动刷新 SeaTalk |
| `starting ACP agent` | `agent` CLI 未安装 | `which agent` 或 `~/.local/bin/agent --version` |
| `authenticating` | ACP 认证失败 | 检查网络、ACP 服务状态 |
| `loaded 0 MCP servers` | mcp.json 不存在或格式错 | 检查 `~/.cursor/mcp.json` |
| `skipping injection` | 页面已有旧 UI | 重启 Agent（新版已改为始终重新注入） |

---

### Phase 3：UI 注入 — 面板是否显示

Agent 启动后会通过 CDP 向 SeaTalk 页面注入 `cursor-ui.js` 和 `sidebar-app.js`。

**日志正常但面板不出现**：

```bash
# 确认注入日志
grep "inject" ~/.seatalk-agent/logs/agent.log | tail -5
# 应看到: injecting cursor-ui... → injecting sidebar panel... → injection complete!

# 确认页面端 __agentReceive 是否存在（通过 Agent 日志）
# Agent 启动时会检查: "agent UI already present" 或 "SPA ready"
```

**排查方向**：
- `skipping injection (agent UI already present)` → **旧版本问题**，Agent 检测到旧 UI 不重新注入。升级到最新版本解决（新版始终重新注入）
- `injection complete!` 但面板不显示 → sidebar-app.js 内部报错，需在 SeaTalk DevTools Console 中查看

**强制重新注入**：
- 方式 1：重启 Agent
- 方式 2：在 SeaTalk 中按 `Cmd+R` 刷新页面，Agent 会在 `Page.loadEventFired` 时重新注入

---

### Phase 4：消息通信 — Bridge 是否畅通

Agent 和前端通过 CDP 消息桥通信：
- **页面 → Node**：`window.__agentSend(json)` → CDP `Runtime.addBinding` → Bridge handler
- **Node → 页面**：`bridge.sendToPanel(data)` → CDP `Runtime.evaluate("__agentReceive(json)")`

**诊断方法**：

```bash
# 检查 Agent 日志中是否有收到前端消息
grep "received (bridge" ~/.seatalk-agent/logs/agent.log | tail -10
# 正常应看到: received (bridge#N): {"type":"set_mode",...}

# 检查是否有发送失败
grep "sendToPanel.*FAILED" ~/.seatalk-agent/logs/agent.log | tail -10
```

**常见问题**：

| 现象 | 原因 | 解决 |
|------|------|------|
| `FAILED type=... CDP timeout (30000ms)` | CDP evaluate 超时，页面无响应 | SeaTalk 页面可能卡住，`Cmd+R` 刷新 |
| `FAILED type=... CDP timeout (3000ms)` | 短超时消息发送失败（更新进度等） | 非致命，不影响主流程 |
| Agent 收不到前端消息 | Bridge binding 断开 | 重启 Agent 重新建立 binding |
| 前端无法发送消息 | `__agentSend` 未定义 | UI 未正确注入，回到 Phase 3 |

---

### Phase 5：更新机制 — 版本检查与更新流程

这是最常见的问题场景。更新流程：

```
silentUpdateCheck() [每 30s/10min]
  → git fetch origin release
  → 读本地 manifest.json version (local)
  → 读远程 manifest.json version (remote)
  → rev-list --count HEAD..origin/release (behind)
  → available = behind > 0 && remote !== local
  → sendToPanel({ type: 'update_available', ... })

用户点"更新" → update_apply
  → applyUpdate()
    → git diff --quiet (检查工作区)
    → git rebase origin/release
    → npm install (如依赖有变)
  → sendToPanel({ type: 'update_done', ... })
  → process.exit(42)
```

**排查日志**：

```bash
# 看更新检查结果
grep "\[updater\]" ~/.seatalk-agent/logs/agent.log | tail -10
# 正常: [updater] check: local=3.1.1, remote=3.1.1, behind=0, available=false
```

**常见问题**：

| 现象 | 原因 | 解决 |
|------|------|------|
| 没有更新提示 | `available=false` | 检查 `behind` 值：0 表示本地已是最新 |
| 一直显示有更新 | `git fetch` 失败 | 检查网络，手动 `git fetch origin release` |
| 点更新后卡住 | CDP 超时阻塞 | **已修复（v3.1.1+）**：applyUpdate 改同步，消息 3s 短超时 |
| 工作区有修改无法更新 | `git diff --quiet` 检测到改动 | `git stash` 或 `git checkout .` 清理工作区 |
| 更新后 UI 仍显示旧版本 | 未重新注入新代码 | **已修复（v3.1.1+）**：Agent 启动始终重新注入 |
| 更新按钮一直 disabled | `update_done` 未到达或 selector 错误 | **已修复（v3.1.1+）**：修复 `data-act` vs `data-action` selector |
| 版本号不变但有新 commit | 只做了 docs/chore 提交 | 正常行为，`available` 需要版本号不同 |

**手动更新**（绕过 UI）：
```bash
cd <PROJECT_ROOT>
git fetch origin release
git rebase origin/release
cd seatalk-agent && npm install  # 如有依赖变化
# 重启 Agent
```

---

### Phase 6：ACP 连接 — AI 对话能力

ACP (Agent Cursor Protocol) 提供 AI 对话和工具调用能力。

```bash
# 确认 agent CLI 存在
ls -la ~/.local/bin/agent

# 检查 ACP 日志
grep "ACP\|acp\|agent" ~/.seatalk-agent/logs/agent.log | tail -20
```

**常见问题**：

| 现象 | 原因 | 解决 |
|------|------|------|
| `agent: command not found` | agent CLI 未安装 | 参照 INSTALL.md 安装 |
| `authenticating... [卡住]` | 网络问题或认证服务不可用 | 检查网络，重试 |
| `loaded 0 MCP servers` | mcp.json 为空或格式错误 | 检查 `~/.cursor/mcp.json` |
| 对话无响应 | ACP 进程崩溃 | 通过 SeaTalk 面板的"重启 Agent"按钮，或杀进程重启 |

---

### Phase 7：Heartbeat 与重连

Agent 每 5 秒发一次 heartbeat（`evaluate('1', 3000)`），失败则触发 CDP 重连循环。

```bash
# 检查重连日志
grep "heartbeat\|reconnect" ~/.seatalk-agent/logs/agent.log | tail -10
```

**常见问题**：
- `heartbeat failed, triggering reconnect` → SeaTalk 页面被关闭/切换了标签
- `CDP reconnect failed, retrying in 3s` → SeaTalk 完全退出了
- 重连后 UI 不显示 → `setupCdpClient` 会重新调用 `doInject`，等待重新注入完成

---

## 快速诊断清单

按此顺序执行，定位到第一个失败点即为根因：

```bash
# 1. Agent 进程
ps aux | grep "tsx src/main" | grep -v grep

# 2. CDP 端口
curl -s http://127.0.0.1:19222/json | head -5

# 3. Agent 日志最后 20 行
tail -20 ~/.seatalk-agent/logs/agent.log

# 4. 更新状态
grep "\[updater\]" ~/.seatalk-agent/logs/agent.log | tail -5

# 5. CDP 通信错误
grep "FAILED\|timeout\|error" ~/.seatalk-agent/logs/agent.log | tail -10

# 6. 版本一致性
grep '"version"' <PROJECT_ROOT>/chrome-extension/manifest.json
git show origin/release:chrome-extension/manifest.json | grep '"version"'
git rev-list --count HEAD..origin/release
```

---

## 常见坑

| 坑 | 现象 | 解决 |
|----|------|------|
| 旧版本 doInject 跳过注入 | Agent 重启后 UI 没更新 | 升级到 v3.1.1+（始终重新注入） |
| CDP 30 秒超时阻塞更新 | 点更新后卡 3+ 分钟 | 升级到 v3.1.1+（同步化 + 3s 短超时） |
| 前端 selector 不匹配 | 更新失败后按钮永远 disabled | 升级到 v3.1.1+（修复 data-act vs data-action） |
| 多个 Agent 进程 | CDP 端口冲突、行为异常 | `pkill -f "tsx src/main"` 杀掉所有再启动一个 |
| SeaTalk 未以 CDP 模式启动 | curl :19222 connection refused | 关闭 SeaTalk 后用 `--remote-debugging-port=19222` 重启 |
| git fetch 用了错误的 remote | 更新检查总是 behind=0 | 确认 `origin` 指向正确仓库：`git remote -v` |
| npm install 架构不匹配 | rpds 等依赖报 x86_64 vs arm64 | `rm -rf node_modules && npm install` 重新安装 |
| exit_code 42 | Agent 正常退出（更新后重启） | 非错误，42 是预设的更新成功退出码 |
| 工作区脏导致更新失败 | "工作区有未提交修改，请先处理" | `git stash` 暂存改动再更新 |

---

## 修复操作参考

### 完全重置 Agent（核弹选项）

```bash
# 杀掉所有 Agent 进程
pkill -f "tsx src/main"

# 清理 node_modules
cd <PROJECT_ROOT>/seatalk-agent
rm -rf node_modules
npm install

# 重置到远程最新
cd <PROJECT_ROOT>
git fetch origin release
git reset --hard origin/release

# 重启 Agent
cd seatalk-agent && npx tsx src/main.ts
```

### 强制刷新前端 UI

```bash
# 方法一：在 SeaTalk 中 Cmd+R 刷新页面
# Agent 监听 Page.loadEventFired，会自动重新注入

# 方法二：重启 Agent（新版始终重新注入）
pkill -f "tsx src/main"
cd <PROJECT_ROOT>/seatalk-agent && npx tsx src/main.ts
```

### 手动测试更新流程

```bash
cd <PROJECT_ROOT>

# 1. 查看当前版本
grep '"version"' chrome-extension/manifest.json

# 2. 查看远程版本
git fetch origin release
git show origin/release:chrome-extension/manifest.json | grep '"version"'

# 3. 查看落后的 commit 数
git rev-list --count HEAD..origin/release

# 4. 手动更新
git rebase origin/release
cd seatalk-agent && npm install  # 如需要

# 5. 重启 Agent
pkill -f "tsx src/main"
npx tsx src/main.ts
```

---

## Skill 更新记录

| 日期 | 更新内容 | 触发原因 |
|------|----------|----------|
| 2026-04 | 初始版本：覆盖 Agent 启动、CDP 连接、UI 注入、消息通信、更新机制、ACP 连接、Heartbeat 重连 7 个排查阶段 | 实际排查更新卡住问题的经验总结（CDP 超时阻塞、selector 不匹配、doInject 跳过注入三个根因） |

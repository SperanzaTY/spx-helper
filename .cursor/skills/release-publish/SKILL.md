---
name: release-publish
description: >-
  SPX Helper 发版流程规范。执行版本号同步、发版日志填写、模块文档联动更新、
  Conventional Commit 格式校验、双仓库推送等标准化步骤。当用户说"发版"、"提交
  release"、"推送到 release"、"升级版本号"、"发布新版本"时使用。
---

# SPX Helper 发版流程

## 概述

本项目使用 `release` 分支作为发版分支，维护 GitLab + GitHub 双仓库同步。
发版受三层保障：**Skill 主动规范 → commit-msg hook → pre-push hook**。

## 发版 Checklist

收到发版指令后，按以下顺序逐步执行。每一步完成后在回复中标记状态。

```
发版进度：
- [ ] 1. 前置检查
- [ ] 2. 版本号同步
- [ ] 3. 发版日志
- [ ] 4. 模块文档联动
- [ ] 5. CDP 功能验证（涉及 SeaTalk Agent 时）
- [ ] 6. 展示变更 & 等待用户确认
- [ ] 7. 提交
- [ ] 8. 推送到远程仓库
- [ ] 9. 推送后验证
```

---

## Step 1：前置检查

```bash
# 确认分支
git rev-parse --abbrev-ref HEAD   # 必须是 release

# 拉取远程最新
git fetch gitlab release && git fetch origin release

# 检查是否落后
git rev-list --count HEAD..gitlab/release
git rev-list --count HEAD..origin/release
# 若 >0，必须先 git pull --rebase <remote> release
```

**阻断条件**：不在 release 分支、本地落后于远程 → 必须先解决。

## Step 2：版本号同步

三个文件的 `version` 字段必须完全一致：

| 文件 | 路径 |
|------|------|
| 根 | `package.json` |
| Chrome 扩展 | `chrome-extension/manifest.json` |
| SeaTalk Agent | `seatalk-agent/package.json` |

### 版本号规则

- `feat` / `fix` 类型提交 → **必须**升版本号
- `docs` / `chore` / `refactor` 类型 → 可不升版本号（保持与远程一致即可）
- 语义化版本 `major.minor.patch`：
  - **major** — 不兼容的重大变更（如架构重构、API 破坏性改动）
  - **minor** — 新增功能板块（全新的功能模块、新的 UI 板块）
  - **patch** — 现有功能的优化、Bug 修复、小功能增强、文档更新
- **判断关键**：不是看 commit type 是 feat 还是 fix，而是看**是否引入了全新的功能板块**。
  对已有功能的增强（如加日志、改显示格式、加系统命令）属于 patch，不升 minor

```bash
# 读取当前版本
grep '"version"' package.json chrome-extension/manifest.json seatalk-agent/package.json
```

修改版本号时三处同时改，不要遗漏。

## Step 3：发版日志

在 `docs/RELEASE_LOG.md` 顶部（`---` 分隔线之后）追加一条记录。

### 模板

```markdown
## vX.Y.Z — YYYY-MM-DD — `<commit-type>`: <简述>

**提交者**: @<git 用户名>
**Commit Type**: feat / fix / refactor / docs / chore
**修改模块**: Chrome 扩展 / MCP 工具 / SeaTalk Agent / 文档 / 其他

### 变更说明
- 逐条列出修改内容

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
- （兼容性问题、已知限制、需其他人确认的事项，无则删除此节）
```

标记说明：`✅` 通过 / `⬜` 未通过 / `N/A` 不涉及此模块。
**所有 commit type 都必须记录**，包括 docs / chore。

## Step 4：模块文档联动

代码改了哪个模块，对应的文档必须同步更新：

| 模块 | 代码路径 | 文档路径 |
|------|----------|----------|
| Chrome 扩展 | `chrome-extension/` | `docs/guides/CHROME_EXTENSION.md` |
| MCP 工具 | `mcp-tools/*.py` | `docs/guides/MCP_TOOLS.md` |
| SeaTalk Agent | `seatalk-agent/src/` | `docs/guides/SEATALK_AGENT.md` |
| Cursor Skill | `.cursor/skills/` | `docs/guides/SKILL.md` |

至少更新文档中的版本号。如有新功能，补充功能说明和使用方法。

## Step 5：CDP 功能验证（涉及 SeaTalk Agent 时）

当本次发版修改了 `seatalk-agent/src/` 下的代码时，**必须通过 CDP 进行功能验证**。
未修改 Agent 代码则跳过此步。

### 5.1 确认 Agent 运行 & CDP 可用

```bash
# Agent 进程存在
ps aux | grep -E 'tsx.*main' | grep -v grep

# CDP 端口可达
curl -s http://127.0.0.1:19222/json | head -3
```

若 Agent 未运行，先启动：`cd seatalk-agent && npx tsx src/main.ts`

### 5.2 TypeScript 编译检查

```bash
cd seatalk-agent && npx tsc --noEmit
```

**必须零错误。** 有编译错误则修复后才能继续。

### 5.3 CDP 注入验证

通过 CDP 执行以下检查脚本，确认前端注入正常：

```javascript
// 1. UI 组件存在性
JSON.stringify({
  cursorUI: !!window.__cursorUI,
  agentReceive: !!window.__agentReceive,
  agentSend: !!window.__agentSend,
  agentToggle: !!window.__agentToggle,
  seatalkWatch: !!window.__seatalkWatch,
  seatalkSend: !!window.__seatalkSend,
  sidebarCleanup: !!window.__cursorSidebarCleanup,
})

// 2. Sidebar 按钮存在
JSON.stringify({
  cursorBtn: !!document.getElementById('cursor-sidebar-btn'),
  remoteBtn: !!document.getElementById('cursor-watch-sidebar-btn'),
})

// 3. 无重复 UI 元素
JSON.stringify({
  panelCount: document.querySelectorAll('#cursor-panel').length,
  cursorBtnCount: document.querySelectorAll('#cursor-sidebar-btn').length,
  remoteBtnCount: document.querySelectorAll('#cursor-watch-sidebar-btn').length,
  popoverCount: document.querySelectorAll('#cursor-remote-popover').length,
})
```

**验证标准**：
- 所有全局函数存在（值为 `true`）
- 两个 sidebar 按钮存在
- 所有 UI 元素 count 为 0 或 1，**不能 >1**（重复 = re-inject 去重失败）

### 5.4 功能性验证（按需）

根据本次修改内容，选择性执行：

| 修改内容 | 验证方法 |
|----------|----------|
| 面板 UI | CDP 打开面板 → 检查渲染 |
| Remote 控制 | 发送 `!!ping` / `!!status` 到 Saved Messages，确认回复 |
| 消息发送 | CDP 调用 `__seatalkSend` 测试 |
| 事件监听 | re-inject 后检查无重复监听 |

### 5.5 记录测试结果

将验证结果填入 RELEASE_LOG.md 的测试情况表。

---

## Step 6：展示变更 & 等待用户确认

**在此步骤必须停下来，等待用户明确说"可以提交"后才能继续。**

```bash
git diff                    # 查看未暂存修改
git diff --cached           # 查看已暂存修改
git status                  # 总览
```

向用户展示：
1. 修改了哪些文件
2. 版本号从 X → Y
3. 发版日志摘要
4. 影响范围

## Step 7：提交

用户确认后执行：

```bash
git add -A
git commit -m "<type>: <description>"
```

### Commit Message 规范

格式：`<type>[(scope)]: <description>`

| type | 说明 |
|------|------|
| feat | 新功能 |
| fix | 修复 Bug |
| docs | 文档更新 |
| style | 代码格式（不影响功能） |
| refactor | 重构 |
| perf | 性能优化 |
| test | 测试 |
| chore | 构建/工具/依赖 |

- description 至少 4 个字符
- 禁止无意义描述：update、fix、test、wip、tmp 等单词不能独立作为描述
- 示例：`feat(agent): 添加 Remote 系统指令和消息冻结机制`

## Step 8：推送到远程仓库

本项目维护两个远程仓库，**GitLab 是主仓库，必须推送成功**：

```bash
# 1. 主仓库（必须成功）
git push gitlab release

# 2. 备份仓库（尽力推送，失败不阻断）
git push origin release || echo "⚠️ GitHub 推送失败（可能无权限），已跳过"
```

| Remote | 地址 | 优先级 |
|--------|------|--------|
| gitlab | `https://git.garena.com/tianyi.liang/spx-helper.git` | **必须成功** — 主仓库，自动更新追踪源 |
| origin | `https://github.com/SperanzaTY/spx-helper.git` | 尽力推送 — 备份仓库，部分同事可能无权限 |

- GitLab 推送失败 → **阻断发版**，必须排查原因
- GitHub 推送失败 → 告知用户，由仓库 owner 后续手动同步即可

## Step 9：推送后验证

```bash
git log --oneline -3                    # 确认提交记录
git rev-parse HEAD                      # 本地 HEAD
git ls-remote gitlab release | head -1  # GitLab 远程 HEAD（必须一致）
git ls-remote origin release | head -1  # GitHub 远程 HEAD（可能滞后）
```

- 本地 HEAD 与 GitLab HEAD **必须一致**，不一致则立即告知用户
- GitHub HEAD 可能滞后（同事无推送权限），记录状态即可

---

## pre-push Hook 检查清单

即使遵循了上述流程，`pre-push` hook 仍会做最终校验。
若被 hook 拦截，根据错误信息回到对应步骤修复后重新提交推送。

Hook 检查项：
1. 远程无新提交（本地不落后）
2. `docs/RELEASE_LOG.md` 在最新 commit 中被修改
3. 三处版本号一致
4. 模块代码 ↔ 文档联动
5. `feat`/`fix` 类型 commit 必须升版本号
6. 所有 commit 符合 Conventional Commit 格式

---

## 常见错误与修复

| Hook 报错 | 原因 | 修复方式 |
|-----------|------|----------|
| "本地落后于 remote" | 他人先推送了 | `git pull --rebase <remote> release` |
| "发版日志未更新" | 忘记改 RELEASE_LOG | 补充日志后 `git commit --amend` |
| "版本号不一致" | 只改了部分文件 | 统一三处版本号后 amend |
| "修改了 X 但未更新文档" | 缺少联动文档 | 补充对应文档后 amend |
| "feat/fix 未升版本号" | 有功能/修复但没升版 | 升版本号后 amend |
| "commit message 格式不符" | 缺少 type 前缀 | `git commit --amend` 修改消息 |

> amend 仅限本地未推送的 commit，已推送到远程的不要 amend。

---

## 禁止事项

- **禁止跳过测试直接发版**（测试情况表不能全空）
- **禁止不推 GitLab**（GitLab 是主仓库，必须推送成功）
- **禁止在未经用户确认的情况下 git commit / git push**
- **禁止直接推送到 main 分支**（main 只通过 MR 合入）
- **禁止使用 `--no-verify` 跳过 hook**（除非用户明确指示紧急情况）

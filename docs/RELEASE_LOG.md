# SPX Helper 发版日志

> 每次提交到 `release` 分支前，**Agent 会自动生成**本版本的测试记录并追加到此文件。
> 开发者只需在 Agent 展示提交摘要时**确认记录内容正确**即可。
> Git pre-push hook 会检查本文件是否有对应版本的记录，作为兜底校验。

---

## 记录格式

```
## vX.Y.Z — YYYY-MM-DD

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

> Agent 根据 `git diff` 自动判断涉及哪些模块，未涉及的标记 N/A，已测试的标记 ✅。
> 用户审核时主要关注"变更说明"和"特别注意"是否准确。

---

## v3.1.4 — 2026-04-02

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

## v3.1.3 — 2026-04-02

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

## v3.1.2 — 2026-04-02

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

## v3.1.1 — 2026-04-01

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

## v3.1.0 — 2026-04-01

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

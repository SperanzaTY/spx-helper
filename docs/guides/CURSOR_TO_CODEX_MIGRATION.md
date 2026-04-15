# Cursor 迁移 Codex 实录

> SPX Helper 从 Cursor 迁移到 Codex 的实际操作记录与复现指南

## 目标

这份文档记录一次真实完成的迁移过程，目标不是只说明“最终长什么样”，而是让后续维护者可以按同样步骤把其他 Cursor 项目迁到 Codex。

适用场景：

- 项目原先依赖 `.cursorrules`、`.cursor/skills/`、`~/.cursor/mcp.json`
- 项目本身包含自研 MCP tools
- 团队希望在 Codex 中复用原有 Cursor 工作流与能力

## 迁移范围

这次在 SPX Helper 中迁移了三类内容：

1. 项目规则
2. MCP 配置
3. Skills

对应的新入口分别是：

- `AGENTS.md`
- `.codex/config.toml`
- `.agents/skills/`

## 一、迁移前先做什么

### 1. 先识别 Cursor 时代的能力入口

在这个仓库里，Cursor 时代的关键入口是：

- `.cursorrules`
- `.cursor/skills/`
- `~/.cursor/mcp.json`

此外还要确认项目本身有没有：

- 自研 MCP server 目录
- 现成的技能文档或工作流文档
- 依赖本机凭证、Cookie 或 service account 的工具

在 SPX Helper 中，上述能力主要集中在：

- `mcp-tools/`
- `.cursor/skills/`
- `docs/guides/MCP_TOOLS.md`
- `docs/guides/SKILL.md`

### 2. 明确仓库级配置与本机级配置的边界

迁移时最容易出错的点，是把私有凭证直接写进仓库。

本次采用的原则是：

- 仓库内只保存共享模板和通用启动方式
- 本机 `~/.codex/config.toml` 保存真实凭证、绝对路径、个人目录

建议从一开始就按这个边界设计，避免后面返工。

## 二、项目规则迁移

### 1. 从 `.cursorrules` 提取长期稳定规则

Cursor 的规则不应该原样复制，而要提炼成 Codex 项目上下文真正长期有用的部分。

SPX Helper 最后迁出的重点规则包括：

- 不允许未经用户确认就 commit / push
- `chrome-extension/manifest.json` 是版本唯一源
- 功能变更要同步文档
- push:release 和双仓库流程
- MCP / Skill 在仓库中的定位

### 2. 落地到 `AGENTS.md`

本次新增：

- [AGENTS.md](/Users/tianyi.liang/Cursor/SPX_Helper/AGENTS.md)

它负责向 Codex 提供：

- 项目结构
- 开发约束
- Git / release 约束
- MCP / skill 迁移后的目录约定

## 三、MCP 迁移

### 1. 先从 `~/.cursor/mcp.json` 读取旧配置

本次迁移不是手工回忆，而是直接读取本机已有 Cursor 配置，确认：

- 启动命令
- Python 路径
- 真实环境变量
- 外部 MCP 依赖

SPX Helper 实际从旧配置中恢复出的 MCP 包括：

- `presto-query`
- `ck-query`
- `api-trace`
- `spark-query`
- `seatalk-reader`
- `scheduler-query`
- `datamap-query`
- `flink-query`
- `datastudio-mcp`
- `mcp-atlassian`
- `drawio`
- `google-sheets`
- `seatalk-group`

### 2. 先做仓库共享模板

本次新增：

- [.codex/config.toml](/Users/tianyi.liang/Cursor/SPX_Helper/.codex/config.toml)

这个文件只保留：

- server 名称
- 通用启动命令
- 需要透传的环境变量名
- 不含真实 secret

### 3. 用统一脚本收敛本地启动逻辑

本次新增：

- [scripts/codex-mcp-launch.sh](/Users/tianyi.liang/Cursor/SPX_Helper/scripts/codex-mcp-launch.sh)

这么做的原因：

- 避免在 `config.toml` 里到处写长路径
- 自动定位仓库根目录
- 为依赖 `chrome-auth` 的 MCP 自动注入 `PYTHONPATH`
- 优先复用本机实际在用的 Python，例如 `/opt/anaconda3/bin/python3`

### 4. 再补本机真实配置

本次直接修改了本机：

- `/Users/tianyi.liang/.codex/config.toml`

其中写入了：

- 真实的 token / PAT / service account 路径
- 本机绝对路径
- DataStudio 本地目录
- 旧 Cursor 配置中已经存在的真实参数

同时保留了一份备份：

- `/Users/tianyi.liang/.codex/config.toml.bak-20260415`

### 5. MCP 迁移后的验证方法

这次验证分成三层：

1. 语法与启动脚本检查
2. `initialize -> tools/list`
3. 真实 `tools/call`

不要只做到第 1 层。

本次使用过的验证方式包括：

- `bash ./scripts/codex-mcp-launch.sh --list`
- 用 JSON-RPC / MCP 协议手工调用 `initialize`
- 对每个 MCP 至少执行一次真实工具调用

### 6. 本次真实验证通过的 MCP

下面这些都已经在 Codex 配置下完成过真实调用：

- `presto-query`
- `ck-query`
- `spark-query`
- `api-trace`
- `scheduler-query`
- `datamap-query`
- `flink-query`
- `datastudio-mcp`
- `mcp-atlassian`
- `drawio`
- `google-sheets`
- `seatalk-reader`
- `seatalk-group`

其中一些代表性验证：

- `presto-query`: `SELECT 1`
- `ck-query`: `SELECT 1`
- `spark-query`: `validate_syntax=True`
- `google-sheets`: 实际读取指定 spreadsheet
- `seatalk-reader`: 列出本机群聊
- `seatalk-group`: 用真实 token 检查指定群配置

## 四、Skill 迁移

### 1. 先识别 Cursor skill 的问题

Cursor skill 往往是：

- 一个超长 `SKILL.md`
- 夹杂了触发说明、完整工作流、例子、排版约束、背景知识

这类内容直接迁到 Codex 会有两个问题：

- 触发描述不够聚焦
- 一旦触发就加载过多上下文

### 2. Codex skill 采用“瘦入口 + 按需 references”

本次在 `.agents/skills/` 中迁移了四个高价值 skill：

- `spx-bug-trace`
- `seatalk-troubleshoot`
- `flink-alert-triage`
- `release-publish`

采用的新结构是：

```text
.agents/skills/<skill>/
├── SKILL.md
└── references/
    └── *.md
```

其中：

- `SKILL.md` 只写触发条件、核心流程、关键规则
- 具体细节放到 `references/`

### 3. 迁移时保留什么，删掉什么

建议保留：

- 触发条件
- 工具优先顺序
- 高层工作流
- 关键红线

建议拆走：

- 大量范例
- 长排版模板
- 冗长背景说明
- 过深的场景细节

### 4. 本次实际产物

迁移后目录见：

- [/Users/tianyi.liang/Cursor/SPX_Helper/.agents/skills/spx-bug-trace](/Users/tianyi.liang/Cursor/SPX_Helper/.agents/skills/spx-bug-trace)
- [/Users/tianyi.liang/Cursor/SPX_Helper/.agents/skills/seatalk-troubleshoot](/Users/tianyi.liang/Cursor/SPX_Helper/.agents/skills/seatalk-troubleshoot)
- [/Users/tianyi.liang/Cursor/SPX_Helper/.agents/skills/flink-alert-triage](/Users/tianyi.liang/Cursor/SPX_Helper/.agents/skills/flink-alert-triage)
- [/Users/tianyi.liang/Cursor/SPX_Helper/.agents/skills/release-publish](/Users/tianyi.liang/Cursor/SPX_Helper/.agents/skills/release-publish)

## 五、这次迁移的最终文件清单

### 仓库内新增 / 变更

- `AGENTS.md`
- `.codex/config.toml`
- `scripts/codex-mcp-launch.sh`
- `.agents/skills/**`
- `docs/guides/CODEX.md`
- `README.md`

### 本机私有变更

- `~/.codex/config.toml`
- `~/.codex/config.toml.bak-20260415`

## 六、推荐复现步骤

如果其他人要迁移自己的项目，建议按下面顺序执行：

1. 阅读仓库中的 `.cursorrules`、`.cursor/skills/`、`docs/guides/*`
2. 读取本人 `~/.cursor/mcp.json`
3. 先写 `AGENTS.md`
4. 先写仓库级 `.codex/config.toml`
5. 加一个统一的 MCP 启动脚本
6. 再写本机 `~/.codex/config.toml`
7. 对每个 MCP 执行真实 `tools/call`
8. 再迁 skill，而不是一开始就迁 skill
9. 把迁移结果写回仓库文档

## 七、迁移过程中的经验

### 1. 不要只验证“进程能启动”

能启动不等于能用。必须做到：

- `tools/list`
- `tools/call`

### 2. Skill 不要照搬 Cursor 的长 Prompt

Codex 更适合：

- 明确触发描述
- 更短的入口
- `references/` 按需加载

### 3. 仓库模板和本机私有配置要分开

否则很容易：

- 把 secret 提交进仓库
- 或者让团队模板绑死某个人的路径

### 4. 统一脚本能显著降低维护成本

如果项目有多个 Python MCP server，尽量用一个脚本统一管理：

- Python 路径
- `PYTHONPATH`
- 根目录定位

## 八、迁移完成后的检查清单

- [ ] `AGENTS.md` 已落地
- [ ] `.codex/config.toml` 已落地
- [ ] 本机 `~/.codex/config.toml` 已补齐私有配置
- [ ] 至少一个外部 MCP 已真实调用成功
- [ ] 至少一个项目内 MCP 已真实调用成功
- [ ] `.agents/skills/` 已建立
- [ ] 每个 Codex skill 都有 frontmatter
- [ ] 长技能材料已拆到 `references/`
- [ ] README 或使用文档已补充 Codex 入口

## 相关文档

- [Codex 使用指南](./CODEX.md)
- [MCP 工具使用指南](./MCP_TOOLS.md)
- [Cursor Skill 使用指南](./SKILL.md)

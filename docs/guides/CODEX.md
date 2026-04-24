# Codex 使用指南

> SPX Helper 在 Codex 下的项目级规则、MCP 与 Skill 配置说明

配套迁移记录见：[Cursor 迁移 Codex 实录](./CURSOR_TO_CODEX_MIGRATION.md)

## 概述

这个仓库原先以 Cursor 为主要 AI 入口，当前已补充了 Codex 的项目级配置，目标是让 Codex 在进入仓库后自动获得三类能力：

1. `AGENTS.md` 项目规则和架构上下文
2. `.codex/config.toml` 中声明的仓库内 MCP servers
3. `.agents/skills/` 中声明的 repo-scoped skills

这样做的好处是：

- 配置跟随仓库版本走，团队成员更容易保持一致
- MCP 直接指向本地仓库源码，调试 MCP 时不需要等 release
- Codex 技能和 Cursor 时代的沉淀可以并存，迁移成本较低

需要单独强调一点：

- Codex 不会因为磁盘上存在 `.cursor/skills/` 或 `~/.cursor/skills/` 就自动把它们注册成当前会话可用 skill
- 当前会话里能直接触发的 skill，以 Codex 实际暴露出来的列表为准；本仓库侧主要看 `.agents/skills/`
- `~/.cursor/skills/` / `.cursor/skills/` 更适合作为迁移来源和知识库，而不是 Codex 的自动加载入口

另外，`seatalk-agent/` 现在也支持直接对接 Codex CLI 的 `app-server` 模式，不再只能依赖 Cursor ACP。

## 当前接入内容

### 项目规则

- `AGENTS.md`

包含项目结构、版本规则、文档同步要求、Git hooks、发版约束和 MCP/Skill 迁移说明。

### MCP 配置

- `.codex/config.toml`
- `scripts/codex-mcp-launch.sh`

当前已为以下仓库内 MCP 准备 Codex 启动入口：

- `presto-query`
- `ck-query`
- `spark-query`
- `api-trace`
- `seatalk-reader`
- `scheduler-query`
- `seatalk-group`
- `flink-query`
- `datamap-query`
- `datastudio-mcp`

启动脚本会自动定位仓库根目录，并为依赖 `chrome-auth` 的 MCP 注入 `PYTHONPATH`。

此外，仓库版 `.codex/config.toml` 也补充了 Cursor 时代常用的外部 MCP 声明：

- `mcp-atlassian`
- `drawio`
- `google-sheets`

这些外部 MCP 的真实凭证和值建议放在本机 `~/.codex/config.toml` 中，而不是写入仓库。

### Skills

Codex repo-scoped skills 位于 `.agents/skills/`，当前已建立入口：

- `spx-bug-trace`
- `seatalk-troubleshoot`
- `flink-alert-triage`
- `release-publish`

这批 skill 当前采用更接近 Codex 原生的结构：

- `SKILL.md` 只保留触发条件、主流程和关键约束
- 深入材料放在各 skill 自己的 `references/` 下按需加载
- 原先 `.cursor/skills/` 中的长工作流会按需整理成更适合 Codex 上下文预算的版本

需要注意：

- “已建立 repo-scoped 入口” 不等于 “已经与 Cursor 全量 skill 完全等价”
- 目前 `spx-bug-trace` 在 `.agents/skills/` 中是可触发的 Codex 精简入口，但不应默认视为与 `~/.cursor/skills/spx-bug-trace/SKILL.md` 完全等价
- 涉及命名规范、Confluence / Google Sheets 沉淀、长流程排查约束等硬规则时，应先核对 Cursor 全量版，或先把这些规则补齐到 Codex 入口再以 Codex 版为准

关于“当前 Codex 会话能不能直接用”：

- 先看当前会话暴露出来的 skill 列表
- 在本仓库里，repo-scoped 入口应来自 `.agents/skills/`
- 仅仅存在于 `.cursor/skills/` 或 `~/.cursor/skills/` 的 skill，不代表 Codex 会自动继承
- 如果要让某个 Cursor skill 变成 Codex 可直接使用的 skill，做法是：
  1. 迁移一个精简入口到 `.agents/skills/<skill>/`
  2. 或安装到本机 `~/.codex/skills/`

### SeaTalk Agent

`seatalk-agent` 现支持两种后端：

- `cursor-acp`：沿用原先的 Cursor `agent acp` 流程
- `codex-app-server`：使用 `codex app-server` 的 JSON-RPC/stdio 接口

当实际后端是 `codex-app-server` 时，SeaTalk 侧边栏会显示 `Codex` / `JSON-RPC` 品牌，不再继续显示 `Cursor` / `ACP`。
此外，Codex backend 下的 `Plan` tab 会走独立的 plan 协作语义：前端会显示计划卡片和步骤状态，而不是只把 `plan` 当成普通文案标签。
SeaTalk 侧边栏的 `Agent 会话设置` 里还可以直接调整 Codex 线程的 `Approval`、`Sandbox` 与 `Web Search`；保存后会自动重连当前 Codex 会话。若运行时配置发生变化，Agent 会新建一个 Codex thread，确保新配置实际生效。
其中 `Approval` 在 UI 中仅暴露 `never` 和 `untrusted`。`on-request` 虽然协议层仍兼容，但在 Codex app-server 下不保证稳定触发审批回调，因此不作为前端选项保留。

默认策略：

- 若本机可用 `codex` CLI，则优先走 `codex-app-server`
- 若未安装 `codex` CLI，但本机可用 Cursor `agent` CLI，则回退到 `cursor-acp`

也可通过环境变量强制指定：

```bash
export SPX_AGENT_BACKEND=cursor
# 或
export SPX_AGENT_BACKEND=codex
```

在 `codex-app-server` 后端下，默认运行时配置是：

- `Approval = never`
- `Sandbox = danger-full-access`
- `Web Search = live`

## 使用方式

### 1. 打开仓库

在 Codex 中打开仓库根目录后，Codex 会读取：

- `AGENTS.md`
- 项目级 `.codex/config.toml`
- `.agents/skills/`

如果你还在本机 `~/.codex/config.toml` 中配置了同名 MCP server，通常以本机配置作为真实运行入口更稳妥，适合放置私有凭证、绝对路径和个人环境差异。
Codex Desktop 的 app-server 可能从 `/` 作为工作目录启动；仓库模板会优先读取 `SPX_HELPER_ROOT` 来定位本地仓库，因此本机配置建议为仓库内 MCP 补充这个环境变量。

前提是该项目被标记为 trusted。

### 2. 确认 Python 依赖

仓库内 MCP 大多是 Python 项目。为了避免 macOS 上 arm64 / x86_64 原生 wheel 混用，Codex 默认通过 `scripts/codex-mcp-launch.sh` 使用仓库内的架构隔离 venv：

```bash
bash ./scripts/setup-mcp-env.sh
```

该脚本会创建 `.mcp-venvs/<arch>-py<version>/`，例如 `.mcp-venvs/arm64-py3.12/`，并一次性安装所有仓库内 MCP。不同 CPU 架构会落到不同目录，避免出现 `rpds ... incompatible architecture` 这类错误。

要求：

- Python 3.12+（`datastudio-mcp` 需要 3.12）
- 如需指定解释器：`PYTHON_BIN=/path/to/python3.12 bash ./scripts/setup-mcp-env.sh`
- 如需重建环境：`bash ./scripts/setup-mcp-env.sh --force`

`scripts/codex-mcp-launch.sh` 默认会在 venv 缺失时自动执行初始化。若不希望启动 MCP 时自动安装依赖，可设置 `SPX_MCP_AUTO_SETUP=0`，此时会直接提示手动执行 `setup-mcp-env.sh`。

### 3. 检查启动脚本

可先确认 Codex 的 MCP 启动脚本能识别全部 server：

```bash
bash ./scripts/codex-mcp-launch.sh --list
```

### 4. 补充环境变量

部分 MCP 仍需要本机凭证，例如：

- `PRESTO_PERSONAL_TOKEN`
- `PRESTO_USERNAME`
- `LIVY_USERNAME`
- `LIVY_PASSWORD`
- `INFRABOT_TOKEN`
- `DATAMAP_OPEN_API_TOKEN`
- `DATASTUDIO_BASE_PATH`
- `DATASTUDIO_PROJECTS`

具体字段与获取方式见 [`MCP_TOOLS.md`](./MCP_TOOLS.md)。

### 5. 本机私有配置建议

建议将以下内容放入 `~/.codex/config.toml`，不要提交到仓库：

- Token、密码、PAT、Google Service Account 路径
- 本机特有的 Python 路径，例如 `/opt/anaconda3/bin/python3`
- 本机特有目录，例如 `DATASTUDIO_BASE_PATH`
- 本机仓库绝对路径：`SPX_HELPER_ROOT = "/path/to/spx-helper"`

仓库中的 `.codex/config.toml` 更适合作为团队共享模板；`~/.codex/config.toml` 负责让你自己的机器直接可用。

## 与 Cursor 配置的关系

当前仓库保留了 Cursor 时代的两类内容：

- `.cursorrules`
- `.cursor/skills/`

它们仍然是重要知识源，但 Codex 侧优先读取：

- `AGENTS.md`
- `.codex/config.toml`
- `.agents/skills/`

这意味着：

- `.cursor/skills/` 仍然应该保留，方便团队复用和继续沉淀 Cursor 时代工作流
- 但它们不会自动出现在 Codex 当前会话的 skill 列表里
- 如果某个 skill 对 Codex 很关键，应确认它已经迁到 `.agents/skills/`，而不是只存在于 `.cursor/skills/`
- 对于 `spx-bug-trace` 这类仍在补齐中的 skill，`.cursor/skills/` 仍可能保留更完整的业务规则，不能因为 `.agents/skills/` 已存在就默认认为两者完全一致

因此后续如果团队全面切换到 Codex，建议新增规则和工作流优先维护在 Codex 这三处，再视情况回写到 Cursor 目录。

## Skill 迁移原则

从 Cursor skill 迁到 Codex skill 时，建议遵循以下原则：

1. 不直接照搬超长单文件 Prompt
2. 把触发描述写得具体，让 Codex 更容易正确触发
3. 把主流程留在 `SKILL.md`，把重细节材料放到 `references/`
4. 对需要高频使用的工具，优先写清“先用哪个 MCP，再用哪个 MCP”

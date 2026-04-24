# SPX Helper

> **Shopee 大数据开发助手** — Chrome 扩展 + MCP 工具套件 + SeaTalk AI Agent

[![Version](https://img.shields.io/badge/version-3.6.11-blue.svg)](https://github.com/SperanzaTY/spx-helper/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

SPX Helper 是一套为 Shopee 大数据开发工程师打造的效率工具集，包含四个核心模块：

| 模块                    | 说明                                                                                      | 指南 |
| ----------------------- | ----------------------------------------------------------------------------------------- | ---- |
| **Chrome 扩展**   | 快速链接、API 数据溯源、日程管理、SQL/HTTP/正则/Mermaid 等实用工具                        | [CHROME_EXTENSION.md](docs/guides/CHROME_EXTENSION.md) |
| **MCP 工具套件**  | Presto/Spark/ClickHouse 查询、API 血缘分析、SeaTalk 集成 — 让 Cursor AI 直接操作数据     | [MCP_TOOLS.md](docs/guides/MCP_TOOLS.md) |
| **SeaTalk Agent** | 将 Cursor / Codex AI Agent 注入 SeaTalk 桌面客户端，在聊天中直接调用 AI 排查问题          | [SEATALK_AGENT.md](docs/guides/SEATALK_AGENT.md) |
| **Cursor Skill**  | 标准化工作流（Bug 排查、故障诊断），让 AI 按步骤高效处理问题                              | [SKILL.md](docs/guides/SKILL.md) |
| **Codex 配置**    | 项目级 `AGENTS.md`、MCP 和 repo-scoped skills，便于从 Cursor 迁移到 Codex；`.cursor/skills` 不会被自动继承 | [CODEX.md](docs/guides/CODEX.md) |
| **迁移实录**      | 记录本项目从 Cursor 迁移到 Codex 的真实操作步骤，便于团队复现                            | [CURSOR_TO_CODEX_MIGRATION.md](docs/guides/CURSOR_TO_CODEX_MIGRATION.md) |

---

## 快速开始

### 0. 安装 AI 工作环境

新同事默认使用 Codex。请先安装并登录 Codex CLI，再按模块文档继续配置：

```bash
codex --version
codex login
```

参考：
- [Codex 使用指南](docs/guides/CODEX.md)
- [SeaTalk Agent 安装指南](docs/guides/SEATALK_AGENT.md)

当前 `seatalk-agent` 在 Codex 后端下默认使用 `Approval=never`、`Sandbox=danger-full-access`、`Web Search=live`，并优先连接 `codex-app-server`。

### 1. 克隆仓库

```bash
git clone https://github.com/SperanzaTY/spx-helper.git
# 或 GitLab（内网）：
# git clone https://git.garena.com/tianyi.liang/spx-helper.git
```

### 2. 按需安装

每个模块独立可用，按需选择：

| 步骤 | 模块 | 参考 |
| ---- | ---- | ---- |
| 1 | Chrome 扩展 | [安装指南](docs/guides/CHROME_EXTENSION.md) |
| 2 | MCP 工具 | [安装指南](docs/guides/MCP_TOOLS.md) |
| 3 | SeaTalk Agent（进阶） | [安装指南](docs/guides/SEATALK_AGENT.md) |
| 4 | Cursor Skill | [安装指南](docs/guides/SKILL.md) |
| 5 | Codex 配置 | [使用指南](docs/guides/CODEX.md) |

> SeaTalk Agent 是最高级的集成形态，它会自动加载所有已配置的 MCP 工具。

---

## 凭证获取

| 工具 | 凭证来源 | 获取方式 |
| ---- | -------- | -------- |
| presto-query / api-trace | Personal Token + 用户名 | [DataSuite API 管理](https://datasuite.shopee.io/dataservice/ds_api_management) → ☰ → Personal Token |
| spark-query | BigData Account | [DataSuite RAM Profile](https://datasuite.shopee.io/ram/personal/profile) → BigData Account |
| ck-query | 团队统一配置 | 密码已配置在 `ck_mcp_server.py` 中 |
| seatalk-reader | 无需凭证 | 需 SeaTalk 开启 CDP |
| scheduler-query / datamap-query / datastudio-mcp | 无需凭证 | 通过 chrome-auth 自动从浏览器 Cookie 认证 |
| seatalk-group | InfraBot Token | 找 @tianyi.liang 获取 |

详见 [MCP 工具指南 — 凭证获取](docs/guides/MCP_TOOLS.md#三凭证获取)。

---

## 项目结构

```
spx-helper/
├── chrome-extension/        # Chrome 扩展
├── seatalk-agent/           # SeaTalk AI Agent（Node + TypeScript）
├── mcp-tools/               # MCP 工具套件
│   ├── chrome-auth/         # 共享认证库（Cookie + CDP）
│   ├── presto-query/        # Presto 查询
│   ├── ck-query/            # ClickHouse 查询
│   ├── spark-query/         # Spark SQL（Livy）
│   ├── api-trace/           # API 血缘溯源
│   ├── seatalk-reader/      # SeaTalk 消息读取/发送
│   ├── seatalk-group/       # SeaTalk 群组管理
│   ├── scheduler-query/     # Scheduler 任务查询
│   ├── datamap-query/       # DataMap 数据资产查询
│   └── datastudio-mcp/      # DataStudio Workflow/Notebook
├── .codex/                  # Codex 项目级配置（MCP）
├── .agents/skills/          # Codex repo-scoped skills（当前仓库的 Codex 会话直接可用）
├── .cursor/skills/          # Cursor Skills（迁移来源，不会被 Codex 自动加载）
├── .githooks/               # Git Hooks（commit-msg, pre-commit, pre-push）
├── scripts/                 # 构建/发布/测试脚本
└── docs/                    # 文档
    ├── guides/              # 模块使用指南
    │   ├── CHROME_EXTENSION.md
    │   ├── MCP_TOOLS.md
    │   ├── SEATALK_AGENT.md
    │   └── SKILL.md
    └── RELEASE_LOG.md       # 发版日志
```

---

## 开发

### Git Hooks

项目使用 `.githooks/` 目录管理 Git Hooks，首次克隆后自动安装（通过 `npm install` 触发 `prepare` 脚本）。

包含的 hooks：
- **commit-msg**：校验 Conventional Commits 格式
- **pre-commit**：检查敏感文件、大文件、密钥泄露
- **pre-push**：版本号一致性、文档同步、发版日志、远程同步检查

手动安装：`bash scripts/setup-hooks.sh`

### 双仓库同步

```
GitLab（主仓库）：https://git.garena.com/tianyi.liang/spx-helper
GitHub（备份）  ：https://github.com/SperanzaTY/spx-helper

推送策略：以 GitLab 为基准；**GitHub 同步与 SeaTalk 发版通知在 GitLab 推送成功之后**执行（`pre-push` 无法在传输完成后挂钩，勿依赖已移除的 EXIT trap）。

推荐一条命令：`npm run push:release` 或 `bash scripts/push-release.sh`。

若已使用 `git push gitlab release`，请在终端看到推送成功后执行：`npm run finish:release-push` 或 `bash scripts/finish-release-push.sh`。
```

---

## 更新日志

- **v3.6.11**：**MCP 启动链路**改为仓库内架构隔离 venv，并用 `.spx-mcp-ready` + 核心 import 校验避免半初始化环境；Codex Desktop 下本地 MCP 通过 `SPX_HELPER_ROOT` 定位仓库，避免 `cwd="."` 被解析到 `/` 后全量不可用。发版说明见 [docs/RELEASE_LOG.md](docs/RELEASE_LOG.md)。
- **v3.6.10**：**seatalk-agent** 历史对话恢复会保留工具调用卡片与消息上下文，并增强长文本/表格换行避免侧栏横向溢出；**presto-query** 直接查询脚本补齐可执行权限，可用 `./mcp-tools/presto-query/query_presto.py "SELECT 1"` 直接调用；**pre-push** 增加 release 通知草稿未跟踪与版本号校验。发版说明见 [docs/RELEASE_LOG.md](docs/RELEASE_LOG.md)。
- **v3.6.9**：**seatalk-agent** 修复工作区切换链路：异常退出后自动拉起，连接状态按真实后端可交互性显示；工作区选择器支持删除历史 / 隐藏本机项目，列表与“浏览...”切换成功后会自动关闭并回到对话页，当前工作区不再显示删除按钮。发版说明见 [docs/RELEASE_LOG.md](docs/RELEASE_LOG.md)。
- **v3.6.8**：**presto-query** 新增可配置超时：`query_presto` 支持 **`max_wait_seconds`** 与 **`request_timeout_seconds`**，默认总等待提升到 **600s**、单次 HTTP 读超时提升到 **60s**；`PrestoQueryTool` 同步支持环境变量 **`PRESTO_MAX_WAIT_SECONDS`**、**`PRESTO_HTTP_READ_TIMEOUT_SECONDS`**、**`PRESTO_HTTP_CONNECT_TIMEOUT_SECONDS`**。发版说明见 [docs/RELEASE_LOG.md](docs/RELEASE_LOG.md)。
- **v3.6.1**：**seatalk-agent** 默认后端优先级改为 **Codex first**：本机可用 `codex` CLI 时默认走 **`codex-app-server`**，仅在未安装 `codex` 时才回退到 `cursor-acp`。发版说明见 [docs/RELEASE_LOG.md](docs/RELEASE_LOG.md)。
- **v3.6.0**：**seatalk-agent** 新增 **`codex-app-server`** 后端，支持 Codex CLI `app-server` 接入；SeaTalk UI 按 backend 动态切换品牌；`Plan` 模式改为真实计划卡片流；新增并持久化 Codex 运行时设置（默认 **`Approval=never`**、**`Sandbox=danger-full-access`**、**`Web Search=live`**），前端 `Approval` 仅保留稳定的 **`never / untrusted`**。发版说明见 [docs/RELEASE_LOG.md](docs/RELEASE_LOG.md)。
- **v3.5.21**：**scheduler-query** Mart SLA 短链闭环：**`slaInstance/get`** + **`fetch_mart_sla_instances_from_shortlink`**；**`triage_mart_sla_alert`** 默认 **`sla_shortlink_fetch_instances`** 在无正文编码时补全 **taskInstanceCode**；脚本 **`scripts/probe-datasuite-sla-cdp.js`** 辅助 CDP/Network 对照。发版说明见 [docs/RELEASE_LOG.md](docs/RELEASE_LOG.md)。
- **v3.5.20**：**scheduler-query** Mart SLA（**`parse_mart_sla_alert`** / **`triage_mart_sla_alert`**、**`resolve_mart_sla_shortlink`** / ``shp.ee``、**`extract_task_code`** 支持 **datahub.bti**）；**Git hooks** 发版 manifest **相对主远程 `release` 最多领先一档**（**`pre-push`** + **`pre-commit`** 共用 **`.githooks/lib/version-step.sh`**）；文档与规则索引同步。发版说明见 [docs/RELEASE_LOG.md](docs/RELEASE_LOG.md)。
- **v3.5.19**：**scheduler-query** `get_presto_query_sql` 增加 **`presto_sql_kind` / `presto_sql_warning`**（`presto_history_sql_hints`）；Presto 实例 **tip** 补充多 Query 说明；**MCP_TOOLS** 与 **spx-bug-trace** 增加 Agent 侧 MCP 失败排查与结论约束；README 联动。发版说明见 [docs/RELEASE_LOG.md](docs/RELEASE_LOG.md)。
- **v3.5.18**：chrome-auth CDP SSO 续期优先 **`Target.createTarget(hidden)`**（不支持时降级）；**scheduler-query** 实例编码解析（`scheduler_task_code`、DAY/HOUR/MINUTE/MONTH/WEEK/YEAR、`etl_batch`、单测）；远程调试脚本登录提示优先 Scheduler；发版说明见 [docs/RELEASE_LOG.md](docs/RELEASE_LOG.md)。
- **v3.5.17**：chrome-auth 401 体验（`format_auth_troubleshoot`、DataSuite 多 URL 静默刷新、401 跳过刷新冷却）；scheduler / flink / datamap MCP 鉴权失败说明增强；spx-bug-trace 本地 Confluence 文稿目录；发版说明见 [docs/RELEASE_LOG.md](docs/RELEASE_LOG.md)。
- **v3.5.16**：Flink 告警与 Bug 排查 Skill 强化（L2 闭环、`query_ck_bundle`、CK 读/写集群说明等）；`presto_query_tool.py` 供平台 Agent 集成；发版说明见 [docs/RELEASE_LOG.md](docs/RELEASE_LOG.md)。
- **v3.5.15**：Flink 一键诊断 Graph Monitor、DataSuite 运营页 `url` 修正、CK `query_ck`/`query_ck_bundle`、chrome-auth Keyhole SSO 续期 URL、SeaTalk rail 精简与文档/Skill 同步（详见 [docs/RELEASE_LOG.md](docs/RELEASE_LOG.md)）。

查看 [docs/RELEASE_LOG.md](docs/RELEASE_LOG.md) 了解完整发版记录。

---

## License

[MIT](LICENSE)

**SPX Helper** — 让大数据开发更高效

Made with ❤️ for Shopee Data Engineers

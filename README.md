# SPX Helper

> **Shopee 大数据开发助手** — Chrome 扩展 + MCP 工具套件 + SeaTalk AI Agent

[![Version](https://img.shields.io/badge/version-3.4.13-blue.svg)](https://github.com/SperanzaTY/spx-helper/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

SPX Helper 是一套为 Shopee 大数据开发工程师打造的效率工具集，包含四个核心模块：

| 模块                    | 说明                                                                                      | 指南 |
| ----------------------- | ----------------------------------------------------------------------------------------- | ---- |
| **Chrome 扩展**   | 快速链接、API 数据溯源、日程管理、SQL/HTTP/正则/Mermaid 等实用工具                        | [CHROME_EXTENSION.md](docs/guides/CHROME_EXTENSION.md) |
| **MCP 工具套件**  | Presto/Spark/ClickHouse 查询、API 血缘分析、SeaTalk 集成 — 让 Cursor AI 直接操作数据     | [MCP_TOOLS.md](docs/guides/MCP_TOOLS.md) |
| **SeaTalk Agent** | 将 Cursor AI Agent 注入 SeaTalk 桌面客户端，在聊天中直接调用 AI 排查问题                  | [SEATALK_AGENT.md](docs/guides/SEATALK_AGENT.md) |
| **Cursor Skill**  | 标准化工作流（Bug 排查、故障诊断），让 AI 按步骤高效处理问题                              | [SKILL.md](docs/guides/SKILL.md) |

---

## 快速开始

### 0. 安装 Cursor IDE（必须）

MCP 工具和 SeaTalk Agent 都依赖 [Cursor](https://www.cursor.com/) IDE：

1. 打开 https://www.cursor.com/ → 点击 **Download**
2. 将下载的 `.dmg` 拖入 Applications
3. 启动 Cursor，使用 GitHub / Google 账号登录

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
├── .cursor/skills/          # Cursor Skills
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

推送策略：推送 GitLab 后自动尝试同步 GitHub（失败不阻塞）
git push gitlab release
```

---

## 更新日志

查看 [docs/RELEASE_LOG.md](docs/RELEASE_LOG.md) 了解完整发版记录。

---

## License

[MIT](LICENSE)

**SPX Helper** — 让大数据开发更高效

Made with ❤️ for Shopee Data Engineers

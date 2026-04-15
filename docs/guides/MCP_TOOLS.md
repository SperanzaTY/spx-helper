# MCP 工具使用指南

> Cursor AI 的数据查询与 SeaTalk 集成工具 — 让 AI 直接操作 Presto/ClickHouse/Spark/SeaTalk

---

## 概述

MCP（Model Context Protocol）工具让 Cursor AI 能直接查询数据库、分析 API 血缘、读取 SeaTalk 消息。

在 Cursor Agent 中用自然语言即可调用：

```
"查询 spx_mart.dim_station 表最近一天的数据量"
"帮我分析 get_vehicle_list 这个 API 的数据血缘"
"查一下 ClickHouse ck2 集群 spx_ods.ods_order_detail 最近一小时的数据"
"提交一个 Spark SQL 任务到 sg3 集群"
"打开这个 SeaTalk 链接，帮我看看他们在讨论什么问题"
"帮我诊断一下 Flink 任务 741498 为什么告警了"
"查一下 spx_mart 项目的 Flink 流任务列表"
```

---

## 一、自研 MCP


| 工具                  | 功能                                                                                  | 凭证                                              |
| ------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| **presto-query**    | 通过 DataSuite Personal SQL API 查询 Presto                                             | Personal Token + Username                       |
| **ck-query**        | 查询 ClickHouse 集群（ck2/ck6/sg3/br/mx 等）                                               | 团队统一配置                                          |
| **spark-query**     | 通过 Livy 提交 Spark SQL 任务                                                             | BigData Account（见下方获取方式）                        |
| **api-trace**       | API 接口血缘分析，查找上下游依赖                                                                  | 同 presto-query                                  |
| **seatalk-reader**  | 读取 SeaTalk 聊天消息、发送消息（需确认）、线程回复（reply_to_keyword 一步完成 或 root_mid）、撤回消息（需确认）、加好友（需确认） | 需 SeaTalk Agent 运行                              |
| **scheduler-query** | DataSuite Scheduler 任务查询 + Presto/Spark History + Spark 性能诊断                        | 浏览器 Cookie 自动认证（chrome-auth）                    |
| **datamap-query**   | DataMap 表元数据查询 + 表/字段元数据写入（更新描述、负责人、字段说明等）                                          | 查询：chrome-auth；写入：`DATAMAP_OPEN_API_TOKEN` 环境变量 |
| **flink-query**     | DataSuite Flink 流/批任务查询与诊断（状态、延迟、异常、血缘、一键诊断）+ Keyhole 运行时数据 + Grafana 指标；Grafana 与 DataSuite 一样在 401/403 时触发 chrome-auth 刷新（含 `/api/frontend/settings`） | 浏览器 Cookie 自动认证（chrome-auth）；DataSuite 与 Grafana 均需有效登录态；改代码后需重启 MCP 子进程 |
| **datastudio-mcp**  | DataStudio 资产管理：批量下载、同步、创建、更新、解锁                                                    | 浏览器 Cookie 自动认证（chrome-auth）                    |
| **seatalk-group**   | 通过 InfraBot API 批量邀请/移除 SeaTalk 群成员                                                 | InfraBot API Token                              |

**presto-query 补充**：目录内另有 **`presto_query_tool.py`**，导出 **`PrestoQueryTool`** 类，便于在非 Cursor MCP 的 Python / 平台 Agent 中直连同一 DataSuite Personal SQL API（凭证仍由调用方传入，勿入库）。说明见 `mcp-tools/presto-query/README.md`。

**scheduler-query 补充（v3.5.20）**：新增 **`parse_mart_sla_alert`**（本地解析新 Mart SLA 告警；单行告警时间字段截取）、**`triage_mart_sla_alert`**（解析后拉实例详情与日志，可选 **`deep_spark`**；默认 **`resolve_shortlinks`** 附带 **`shortlink_resolutions`**）；**`resolve_mart_sla_shortlink`**（``shp.ee`` HEAD 解析为 DataSuite ``/scheduler/sla/instance/detail/...`` 打开链接，无需 Cookie）；**`extract_task_code`** 支持 **`datahub.bti.*`**。单测：`tests/test_mart_sla_parser.py`、`tests/test_mart_sla_shortlink.py`、`tests/test_extract_task_code.py`。

**scheduler-query 补充（v3.5.19）**：`get_instance_detail`、`get_presto_query_sql`（传 `task_instance_code`）等会经 **`scheduler_task_code.extract_task_code`** 从实例编码解析 **taskCode**（覆盖 DAY/HOUR/MINUTE/MONTH/WEEK/YEAR、`etl_batch` 等形态）；`get_presto_query_sql` 另对 History 中的 SQL 做 **`presto_sql_kind` / `presto_sql_warning`** 启发式提示（单条 yarn 绑定、DDL 等）。说明与示例见 `mcp-tools/scheduler-query/README.md`；单测：`tests/test_extract_task_code.py`、`tests/test_presto_hints.py`。

### 共享认证库：chrome-auth

`scheduler-query`、`datamap-query`、`flink-query`、`datastudio-mcp` 均使用 **chrome-auth** 共享库自动从 Chrome 浏览器获取认证 Cookie，无需手动配置 Token。

v3.5.9 起，chrome-auth 具备以下认证增强能力：

- **Cookie 过期感知**：从 CDP 和磁盘读取 Cookie 的 `expires` 字段，缓存 TTL 跟随实际过期时间，不再返回已知过期的 Cookie
- **自动 SSO 刷新**：过期或 401 时自动续期。顺序为 **CDP**（优先 **hidden 目标** + `Page.navigate`，多端口依次尝试）→ **macOS `open -g` 后台打开 Chrome**（不抢前台）→ **AppleScript 可见标签**（最后手段，可用环境变量 `CHROME_AUTH_DISABLE_APPLESCRIPT=1` 关闭）。推荐 Chrome 使用 `--remote-debugging-port=9222` 并设置 `CHROME_CDP_PORT=9222`，静默程度最高
- **精准过期诊断**：401 错误时提供精确的过期时间和操作建议（如"Cookie 已于 14:30:00 过期，请刷新登录"），替代之前笼统的"可能已过期"

v3.5.17 起补充：

- **401 跳过静默刷新冷却**：调用方传入 `auth_failed=True` 时不再受每域名 60 秒冷却限制，避免「刚失败又命中冷却不重刷」
- **DataSuite 多落地页**：`datasuite.shopee.io` 静默导航按 **`/scheduler/`、`/`、`/flink/`** 依次尝试（优先 Scheduler，与 Scheduler MCP 场景一致）；CDP 续期优先 **`Target.createTarget(hidden)`**（不出现在标签栏），减少 Chrome 被置前（v3.5.18；旧版/部分嵌入 Chromium 不支持时会降级为普通新标签）
- **结构化 401 说明**：`scheduler-query` / `flink-query` / `datamap-query` 等在鉴权失败时输出 **CDP 端口是否可达、`CHROME_CDP_PORT`、本次静默导航 URL 与成败、关键 Cookie 摘要**（`format_auth_troubleshoot`），便于区分未连上调试 Chrome 与需重新登录

遇到 401/403 错误时，这些 MCP 会返回 Cookie 诊断信息并自动尝试刷新。仅当 SSO 主会话也过期（需要重新输入密码）时才需要用户手动在 Chrome 中登录 DataSuite。

详细文档：[chrome-auth README](../../mcp-tools/chrome-auth/README.md)

### 安装方式：本地仓库（开发者推荐）

已克隆 **spx-helper** 的开发者应使用**本机仓库路径**配置 `~/.cursor/mcp.json`：改 MCP 代码后**无需等 release**、也**不必**每次从 Git 拉 uv 包解析依赖。

**一次安装（对同一个 `python3`）**：先装共享库，再按需装各工具子目录。

```bash
SPX_ROOT="/path/to/spx-helper"   # 换成你的仓库根目录

python3 -m pip install -e "$SPX_ROOT/mcp-tools/chrome-auth"

# 按需执行，例如只开发 Flink / Scheduler：
python3 -m pip install -e "$SPX_ROOT/mcp-tools/flink-query"
python3 -m pip install -e "$SPX_ROOT/mcp-tools/scheduler-query"
python3 -m pip install -e "$SPX_ROOT/mcp-tools/datamap-query"
# 其它子目录：presto-query、ck-query、spark-query、api-trace、seatalk-reader、seatalk-group 等同理
```

**依赖 chrome-auth 的 MCP**（scheduler-query、datamap-query、flink-query）：在 `mcp.json` 里用 `**python3` + 入口脚本** + `**PYTHONPATH` 指向 `mcp-tools/chrome-auth`** 即可（将路径换成你的 `SPX_ROOT`）：

```json
"scheduler-query": {
  "command": "python3",
  "args": ["/path/to/spx-helper/mcp-tools/scheduler-query/scheduler_mcp_server.py"],
  "env": { "PYTHONPATH": "/path/to/spx-helper/mcp-tools/chrome-auth" }
},
"flink-query": {
  "command": "python3",
  "args": ["/path/to/spx-helper/mcp-tools/flink-query/flink_mcp_server.py"],
  "env": { "PYTHONPATH": "/path/to/spx-helper/mcp-tools/chrome-auth" }
},
"datamap-query": {
  "command": "python3",
  "args": ["/path/to/spx-helper/mcp-tools/datamap-query/datamap_mcp_server.py"],
  "env": { "PYTHONPATH": "/path/to/spx-helper/mcp-tools/chrome-auth" }
}
```

前提：已对对应子目录执行过 `python3 -m pip install -e .`，以便装上 `mcp`、`requests` 等依赖。**备选**：若 `flink-mcp`、`scheduler-mcp` 等已在 PATH 中，可改为 `"command": "flink-mcp", "args": []`（建议使用 `which flink-mcp` 的绝对路径，避免 Cursor 找不到 PATH）。

**不依赖 chrome-auth 的 MCP**（presto-query、ck-query、spark-query、api-trace、seatalk-reader、seatalk-group）：同样可用 `**python3` + 本机 `*_mcp_server.py` 绝对路径**；若已 `pip install -e`，也可用各包在 `pyproject.toml` 里声明的入口命令名。详见各工具目录下的 `README.md`。

**datastudio-mcp**：使用 `cwd` + `python -m` 等方式，见 `mcp-tools/datastudio-mcp/README.md`。

保存 `~/.cursor/mcp.json` 后，在 Cursor **Settings → MCP** 中**刷新**或**关闭再开启**对应服务。

---

### 安装方式：GitLab / GitHub release（免克隆）

未克隆仓库、只使用**已发布**版本时，用 [uv](https://docs.astral.sh/uv/) 从 Git 子目录安装运行。在 `~/.cursor/mcp.json` 中配置：

```jsonc
{
  "mcpServers": {
    // Presto 查询
    "presto-query": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/presto-query", "presto-query-mcp"],
      "env": {
        "PRESTO_PERSONAL_TOKEN": "替换为你的Token",
        "PRESTO_USERNAME": "替换为你的用户名"
      }
    },
    // ClickHouse 查询
    "ck-query": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/ck-query", "ck-query-mcp"]
    },
    // Spark SQL 查询（通过 Livy）
    "spark-query": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/spark-query", "spark-query-mcp"],
      "env": {
        "LIVY_USERNAME": "替换为 BigData Account 用户名",
        "LIVY_PASSWORD": "替换为 BigData Account 密码"
      }
    },
    // API 血缘溯源
    "api-trace": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/api-trace", "api-trace-mcp"],
      "env": {
        "PRESTO_PERSONAL_TOKEN": "替换为你的Token",
        "PRESTO_USERNAME": "替换为你的用户名"
      }
    },
    // SeaTalk 消息读取
    "seatalk-reader": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/seatalk-reader", "seatalk-reader-mcp"]
    },
    // Scheduler 任务查询
    "scheduler-query": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/scheduler-query", "scheduler-mcp"]
    },
    // SeaTalk 群组管理
    "seatalk-group": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/seatalk-group", "seatalk-group-mcp"],
      "env": {
        "INFRABOT_TOKEN": "替换为InfraBot Token"
      }
    },
    // Flink 实时任务查询与诊断
    "flink-query": {
      "command": "uvx",
      "args": [
        "--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/flink-query",
        "--with", "chrome-auth@git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/chrome-auth",
        "flink-mcp"
      ]
    },
    // DataMap 元数据查询 + 写入
    "datamap-query": {
      "command": "uvx",
      "args": ["--from", "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/datamap-query", "datamap-mcp"],
      "env": {
        "DATAMAP_OPEN_API_TOKEN": "Basic xxxxxx（可选，仅写入操作需要）"
      }
    },
    // DataStudio 资产管理（需先 pip install -e chrome-auth）
    "datastudio-mcp": {
      "command": "python3",
      "args": ["-m", "datastudio_mcp.mcp_server"],
      "cwd": "/path/to/spx-helper/mcp-tools/datastudio-mcp",
      "env": {
        "DATASTUDIO_BASE_PATH": "替换为你的本地DataStudio工作目录",
        "DATASTUDIO_PROJECTS": "项目代码,逗号分隔",
        "PYTHONPATH": "/path/to/spx-helper/mcp-tools/datastudio-mcp"
      }
    }
  }
}
```

> JSON 标准不支持注释，保存时如报错请删除 `//` 注释行。

**前置条件**：需安装 [uv](https://docs.astral.sh/uv/install/)（`curl -LsSf https://astral.sh/uv/install.sh | sh`）

**GitLab 说明**：团队推荐使用 GitLab 链接（需内网/VPN 访问 git.garena.com）。若无法访问 GitLab，可改用 GitHub：`git+https://github.com/SperanzaTY/spx-helper@release#subdirectory=mcp-tools/<tool>`

> **注意**：`flink-query` 的 uvx 配置已在 `args` 中用 `--with chrome-auth@git+...` 声明依赖。若不用 `--with`，需本机先 `pip install -e chrome-auth`。**开发者**优先用上一节「本地仓库」方式，避免与 release 不同步。`datamap-query` 的写入功能还需配置 `DATAMAP_OPEN_API_TOKEN` 环境变量（见凭证获取章节），不配置不影响查询。

---

## 二、推荐外部 MCP

### 1. MCP Atlassian（Confluence / Jira）

连接 Atlassian Confluence 和 Jira，支持搜索、读取、创建、更新页面。已在 confluence.shopee.io 验证可用。

`uvx` 拉取的依赖里若包含 **fakeredis 2.35+**，会与 FastMCP 自带的 **docket**（内存 Redis）导入不兼容，表现为启动时报 `cannot import name 'FakeConnection' from 'fakeredis.aioredis'`。请在 `args` 中用 `**--with fakeredis==2.34.0`** 固定 fakeredis 版本（或 `fakeredis<2.35`）。

```json
"mcp-atlassian": {
  "command": "/Users/你的用户名/.local/bin/uvx",
  "args": ["--with", "fakeredis==2.34.0", "mcp-atlassian"],
  "env": {
    "CONFLUENCE_URL": "https://confluence.shopee.io",
    "CONFLUENCE_PERSONAL_TOKEN": "你的Confluence_PAT",
    "CONFLUENCE_SSL_VERIFY": "false",
    "TOOLSETS": "all"
  }
}
```

**凭证获取**：个人头像 → Profile → [Personal Access Tokens](https://confluence.shopee.io/plugins/personalaccesstokens/usertokens.action)

**说明**：`TOOLSETS=all` 与 mcp-atlassian 后续默认仅开放部分工具集的行为对齐，避免静默缩小可用工具范围。

### 2. DrawIO MCP（架构图 / 流程图）

用自然语言生成 draw.io 图表，支持 mxGraphModel XML。

```json
"drawio": {
  "command": "/usr/local/bin/npx",
  "args": ["--yes", "@next-ai-drawio/mcp-server@latest"],
  "env": {
    "PATH": "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  }
}
```

若 Node 由 Homebrew 安装在 Apple Silicon 上，`command` 改为 `/opt/homebrew/bin/npx`。

### 3. Google Sheets MCP

AI 直接读写 Google Sheets，用于任务管理和数据整理。

1. 向 [tianyi.liang@shopee.com](mailto:tianyi.liang@shopee.com) 获取 `spx-helper-mcp-sheets.json`
2. 放置到 `~/.google-credentials/spx-helper-mcp-sheets.json`
3. 配置：

```json
"google-sheets": {
  "command": "uvx",
  "args": ["mcp-google-sheets"],
  "env": {
    "SERVICE_ACCOUNT_PATH": "/Users/你的用户名/.google-credentials/spx-helper-mcp-sheets.json",
    "DRIVE_FOLDER_ID": "1USyHneT0j17IMEpm0AW5LeVJ6mop511W"
  }
}
```

### 4. cursor-ide-browser（Cursor 内置）

操控浏览器：导航、截图、点击、抓取网络请求。Cursor 内置，在 MCP 设置中启用即可。

---

## 三、凭证获取


| 凭证                                | 格式                   | 获取位置                                                                                                                                                                                                                       |
| --------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRESTO_PERSONAL_TOKEN`           | `eyJhbGci...` 长字符串   | [DataSuite API 管理](https://datasuite.shopee.io/dataservice/ds_api_management) → 左侧菜单 ☰ → Personal Token → 复制 Token                                                                                                         |
| `PRESTO_USERNAME`                 | `john.doe`（**不是邮箱**） | 你的 Shopee 用户名（如 `tianyi.liang`）                                                                                                                                                                                            |
| `LIVY_USERNAME` / `LIVY_PASSWORD` | BigData Account      | [DataSuite RAM Profile](https://datasuite.shopee.io/ram/personal/profile) → **BigData Account** 区域 → Account 即用户名，Password 点 **View** 查看                                                                                   |
| `INFRABOT_TOKEN`                  | `infrabot.xxxx`      | 找 @tianyi.liang 获取，或在 [InfraBot API Playground](https://space.shopee.io/utility/seatalkbot/api-playground) 申请                                                                                                              |
| `DATAMAP_OPEN_API_TOKEN`          | `Basic xxxxxx`       | DataMap 写入操作专用（`update_table_info` / `update_column_info`）。联系 [yixin.yang@shopee.com](mailto:yixin.yang@shopee.com) 申请。不配置不影响查询功能                                                                                          |
| `CONFLUENCE_PERSONAL_TOKEN`       | 令牌字符串                | [Confluence PAT 管理页](https://confluence.shopee.io/plugins/personalaccesstokens/usertokens.action) → 创建新 Token                                                                                                              |
| **chrome-auth 认证**                | 无需配置                 | `scheduler-query`、`datamap-query`、`flink-query`、`datastudio-mcp` 自动从 Chrome Cookie 获取认证，只需在 Chrome 中登录 [DataSuite](https://datasuite.shopee.io)。Flink 全栈诊断和 Spark 诊断工具还需登录 [Keyhole](https://keyhole.data-infra.shopee.io) |


---

## 四、验证与刷新

1. 保存 `~/.cursor/mcp.json` 后，按 `Cmd + Shift + J` 打开 Cursor 设置 → 选择 **MCP**
2. 确认各 MCP 状态为绿点（已连接）
3. 如果显示红点，点击刷新按钮 ↻
4. 在 Agent 中输入测试查询，如 `查询 spx_mart.dim_station 表最近一天的数据量`

### SeaTalk 相关 MCP 快速更新（拉代码 / 升 Cursor 后）

**seatalk-reader**、**seatalk-group** 通过 **uvx + Git 子目录** 安装时，Cursor 会在子进程里解析依赖；大版本或仓库更新后应 **在 MCP 设置里对这两项关闭再开启**（与项目规则「`mcp-tools/` 有变更要 toggle MCP」一致）。

**想缩短等待**：若本机已克隆 **spx-helper**，在终端用 **本地目录** 预热/强制重装，通常比反复从 GitLab 拉同一引用快得多：

```bash
cd /path/to/spx-helper/mcp-tools/seatalk-reader
uvx --reinstall --from . seatalk-reader-mcp --help >/dev/null

cd ../seatalk-group
uvx --reinstall --from . seatalk-group-mcp --help >/dev/null
```

将 `/path/to/spx-helper` 换成你的仓库根路径。然后再到 Cursor **MCP** 页面刷新对应服务。

仅依赖 `git+https://...@release#subdirectory=...` 时，也可执行 `uvx --reinstall --from 'git+https://…'` 强制换新，但 **耗时可达到数分钟**（网络与解析依赖），属正常现象。

完整启动顺序（含侧边栏 Agent、CDP）见 **[SeaTalk Agent 使用指南](./SEATALK_AGENT.md)** 中的「更新仓库 / 升级 Cursor 后：快速恢复」。

**CDP 烟测（不经 Cursor MCP）**：`scripts/cdp_seatalk_smoke.py` 连 `127.0.0.1:19222`：`probe`、`resolve <群名关键词>`、`send group-<id> "正文"`（会真实发消息）。依赖：`pip install websockets`。

---

## 五、常见问题

### Agent triage: MCP and query failures

当 Agent 表现为「查不到」「像没查实」或工具调用失败时，建议按下面顺序自检，再下结论（避免把权限/绑定问题误判为业务或代码问题）。

1. **认证与 Cookie**：依赖 chrome-auth 的 MCP（scheduler、datamap、flink 等）在 **401/403** 时应返回诊断摘要（CDP 端口、`CHROME_CDP_PORT`、静默导航结果、关键 Cookie）。若仍失败，在 Chrome 中重新登录 DataSuite / Keyhole 对应站点后，在 Cursor **Settings → MCP** 中重载该服务。
2. **工具真实名称**：`~/.cursor/mcp.json` 里的 **server key**（如 `scheduler-query`）与对话里 Agent 看到的工具前缀（如 `user-scheduler-query-*`）可能不一致；以 **MCP 面板中实际可调用的工具名** 为准，避免写错工具名导致「未调用」。
3. **Presto 直查**：`query_presto` 的参数名为 **`sql`**（不是 `query`）。对 **`information_schema` 等无权限** 属于平台策略，应改用血缘/文档中的物理表，或对目标库表 **`DESCRIBE` / `LIMIT` 探查**。
4. **Scheduler 与 Presto History**：`get_presto_query_sql` 通过实例拿到的 **yarn_application_id 通常只绑定 Presto History 中的一条 query**；若返回 **DDL/元数据 SQL** 或明显不是主业务语句，请到 DataSuite 实例详情核对 **其它 Presto Query ID**，或直接向该工具传入 **`presto_query_id`**。工具返回中的 **`presto_sql_warning` / `presto_sql_kind`** 为启发式提示。
5. **DataMap 与列名**：以 OpenAPI 返回的字段为准；**「列不存在」与「有列但无数据」** 需区分，勿默认某张 RI 表上必有血缘里出现的列名（可能已演进或别名不同）。

uvx 命令找不到？

安装 uv 后需重启终端。手动加入 PATH：`export PATH="$HOME/.local/bin:$PATH"`，加到 `~/.zshrc` 后重启终端。

MCP 一直红点/连接失败？

1. 确认 `uv`/`uvx` 命令可用
2. 确认网络可以访问 `git.garena.com`（需 VPN）
3. 点击 MCP 名称旁的错误信息查看详细日志
4. 终端手动运行 MCP 命令验证

Python 版本不兼容？

MCP 工具需要 Python 3.10+。通过 uv 安装：`uv python install 3.12`

---

## 六、配置位置

MCP 配置在 `~/.cursor/mcp.json`，新增或修改后需在 Cursor 设置中**关闭再开启**对应 MCP 以刷新。

---

## 更新日志

### v3.5.20

- **scheduler-query**：**`parse_mart_sla_alert`**、**`triage_mart_sla_alert`**（新 Mart SLA 告警；单行时间字段截取）；**`resolve_mart_sla_shortlink`**（``shp.ee`` 还原 DataSuite SLA 详情 URL）；**`extract_task_code`** 增加 **datahub.bti** 形态。
- **Git hooks**：**`.githooks/lib/version-step.sh`**；**`pre-push`** / **`pre-commit`** 约束 manifest **version** 相对主远程 **`release`** 最多领先一档。
- **文档**：README、`MCP_TOOLS.md`、**`.cursor/rules/mcp-tools.mdc`**、**`.cursor/rules/git-workflow.mdc`**、`SKILL.md`、`mcp-tools/scheduler-query/README.md` 同步。

### v3.5.19

- **scheduler-query**：`get_presto_query_sql` 合并 **`presto_history_sql_hints`**（`scheduler_task_code`），对空 SQL、DDL/元数据类语句等返回 **`presto_sql_kind` / `presto_sql_warning`**；`get_instance_detail` 的 Presto **tip** 补充多 Query 与显式 `presto_query_id` 说明。
- **文档**：`MCP_TOOLS.md` 增加 **「Agent triage: MCP and query failures」**；`spx-bug-trace` / `docs/guides/SKILL.md` 增加 MCP 失败时的结论约束与上述章节链接；`scheduler-query` / `presto-query` README 补充排查与 **`sql` 参数名**。

### v3.5.15

- **chrome-auth**：Keyhole SSO 静默续期改为打开 **`https://keyhole.data-infra.shopee.io/`**，不再使用 `https://data-infra.shopee.io/` 根路径
- **flink-query**：`diagnose_flink_app` 聚合 **Graph Monitor**；`get_flink_app_detail` / `search_flink_apps` 的 **`url`** 与 **`/flink/operation/application?...`** 一致；Keyhole REST 前缀与 `/jobs/{jid}/...` 诊断对齐等（见模块 README）
- **ck-query**：`query_ck` 必填 `sql`/`env`；新增 **`query_ck_bundle`**（单参 JSON 字符串兜底）

### v3.5.14

- **chrome-auth**：CDP 静默刷新在多个可达端口上依次尝试；README 与行为对齐
- **flink-query**：血缘接口在 `data` 为数组时解析表列表；Grafana 相关请求在 401 时以 `auth_failed` 触发 Cookie 刷新并重试
- **seatalk-reader**：连接前提改为依赖本机 seatalk-agent 的 CDP 代理（默认 19222）；会话列表与 `navigate_to_chat` 行为增强（见模块 README）

### v3.5.8

- **Flink 日志直查**: 新增 `query_flink_logs` 工具，通过 Logify SSE API 直接查询 Flink 应用日志内容，支持 LogiQL 搜索语法和日志级别过滤，无需打开浏览器

### v3.5.7

- **Flink 日志链接**: 新增 `get_flink_log_url` 工具生成 Logify (Kibana) 日志链接；`diagnose_flink_app` 诊断结果自动附带日志链接

### v3.5.6

- **Flink 表→任务反查**: 新增 `search_flink_table_lineage` 工具，给定表名反向查找上下游 Flink 任务，支持 7 种表类型

### v3.5.5

- **Flink 一键诊断增强**: `diagnose_flink_app` 接入 Keyhole (Checkpoint 健康 + Runtime 异常) 和 Grafana (背压/Kafka Lag/CPU/Heap)，从 6 个数据源扩展到 9 个，新增自动阈值判断和优化建议

### v3.5.4

- **Flink MCP 全栈诊断**: 新增 Keyhole (Flink REST API) 数据源 -- checkpoints / job config / runtime exceptions / task managers / vertices；新增 Grafana (VictoriaMetrics) 数据源 -- 6 个预定义指标类别 + 自定义 PromQL 查询
- **Flink MCP 缓存层**: 新增 `_instance_cache` 减少 DataSuite API 重复调用

### v3.5.3

- **DataMap MCP**: 所有读取工具新增 `idc_region` 参数，支持查询 USEast 等非 SG 区域表的元数据（如 `get_table_info("xxx_br", idc_region="USEast")`）

### v3.5.2

- **DataMap MCP**: 自动解析 IDC 区域差异 -- 查询非 SG 表（如 BR 表，qualifiedName 为 `prod#USEast`）时，若默认 QN 查不到，自动搜索正确 qualifiedName 并重试，结果带缓存

### v3.5.1

- **DataMap MCP**: 合并 `update_table_info` + `update_column_info` 为统一的 `update_datamap` 工具。修复 tableStatus 更新无效（需嵌套在 status 对象中）。工具接受灵活 JSON payload，自动路由到 updateTableInfo / updateColumnInfo 端点

### v3.5.0

- **DataMap MCP**: `update_table_info` 新增 `table_status` 字段（ACTIVE/MIGRATED/DEPRECATED/OFFLINE），新增批量更新脚本
- **Flink MCP**: 修复 `_format_ts` 函数兼容字符串类型时间戳


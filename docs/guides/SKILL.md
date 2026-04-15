# Cursor Skill 使用指南

> SPX Helper 内置的 Cursor Skill 共享库 — 标准化工作流提升效率

---

## 概述

Cursor Skill 是定义在 `.cursor/skills/` 下的标准化工作流指令，让 AI 按照预设步骤处理特定类型的问题。

**关键概念**：Skill 本身是纯指令文件（Markdown），但许多 Skill 依赖外部 MCP 工具来完成实际数据查询和操作。

### 两层结构

```
Skill（指令层）     →  定义"怎么做"     → .cursor/skills/<name>/SKILL.md
  └─ 依赖 MCP（执行层） →  提供"做什么"     → ~/.cursor/mcp.json 中配置
```

---

## Skill 列表

| Skill | 用途 | 依赖 MCP |
|-------|------|----------|
| **spx-bug-trace** | Bug 排查流程（API 溯源 → 数据验证 → 报告生成 → Flink 诊断） | api-trace, ck-query, presto-query, flink-query, cursor-ide-browser, mcp-atlassian, google-sheets |
| **flink-alert-triage** | Flink 告警自动分诊（L1/L2/L3）；**一眼版式**：首行 `【一眼】` 可执行句，再「怎么改资源/调参」；RUNNING 稳定用「可先自决」勿单独「需人工」；L1≤12 行 | flink-query, ck-query, seatalk-reader |
| **seatalk-troubleshoot** | SeaTalk Agent 故障排查（10 阶段系统化排查：进程 → 多进程冲突 → CDP → 注入 → ACP → Remote → 功能 → UI → Agent 重启 → 日志） | 无外部依赖 |
| **release-publish** | 发版流程规范（含 `npm run verify:hooks` → 版本号 → 日志 → 文档联动 → CDP 验证 → 群通知 → `npm run push:release`：GitLab 成功后再同步 GitHub 并投递通知） | 无外部依赖 |

排查 ClickHouse 时若 Cursor Agent 调 `query_ck` 参数为空，可改用 MCP 工具 **`query_ck_bundle`**（单参 JSON 字符串），详见 `mcp-tools/ck-query/README.md` 与 `spx-bug-trace` 的 `tools-reference.md`。

**spx-bug-trace 内 Confluence 文稿目录**：`.cursor/skills/spx-bug-trace/confluence/`（可全文复制到 Confluence 的 Markdown，见目录内 `README.md`）。

**v3.5.16 起仓库内 Skill 要点**：`flink-alert-triage` 增补 Phase 2.0c（L2 须在对话内用 MCP 拉数闭环、禁止以「自行看面板」替代结论）、DataSuite 可调项与 MCP 字段对照、`query_ck_bundle` 与换实例指标混窗等；`spx-bug-trace` 增补 CK 读/写集群与 `UNKNOWN_TABLE` 处理、FM 表口径与常见坑表修正、过程文档与示例路径说明。

**v3.5.19**：`spx-bug-trace` 增补 **「MCP 失败时的结论约束」**（须引用工具错误、参数名 `sql`、Scheduler 单条 Presto 绑定等）；与 [MCP 工具指南 — Agent triage](MCP_TOOLS.md#agent-triage-mcp-and-query-failures) 联动。

**v3.5.20**：`scheduler-query` Mart SLA（**`parse_mart_sla_alert`** / **`triage_mart_sla_alert`**、**`resolve_mart_sla_shortlink`** / ``shp.ee``、**datahub.bti**）；仓库 **Git hooks** 约束发版 manifest 版本步长。详见 [MCP_TOOLS.md](MCP_TOOLS.md)。

**双副本同步**：`flink-alert-triage` 在仓库中为 `.cursor/skills/flink-alert-triage/SKILL.md`，与开发者本机主副本 `~/.cursor/skills/flink-alert-triage/SKILL.md` 内容应对齐；更新 skill 后请 `cp` 同步另一侧。  
Alarm Bot 用的 **`alarm-bot-prompt.md`** 同目录存放，修改后也请同步到 `~/.cursor/skills/flink-alert-triage/alarm-bot-prompt.md`，便于本机与仓库一致。

---

## 安装方式

### 按需安装（推荐）

```bash
# 安装单个 Skill
cp -r .cursor/skills/spx-bug-trace ~/.cursor/skills/
```

### 全部安装（含 Skill + 所有依赖 MCP）

**第一步：安装所有 Skill**

```bash
mkdir -p ~/.cursor/skills
for skill in .cursor/skills/*/; do
  name=$(basename "$skill")
  [ "$name" = "README.md" ] && continue
  cp -r "$skill" ~/.cursor/skills/
  echo "✅ 已安装: $name"
done
```

**第二步：安装所有依赖 MCP**

除了自研 MCP（见 [MCP 工具指南](MCP_TOOLS.md)）之外，还需安装以下推荐外部 MCP：

| MCP | 类型 | 用途 |
|-----|------|------|
| mcp-atlassian | 推荐外部 | Confluence/Jira 读写 |
| drawio | 推荐外部 | 架构图/流程图生成 |
| google-sheets | 推荐外部 | Google Sheets 读写 |
| cursor-ide-browser | Cursor 内置 | 浏览器操控 |

各 MCP 的安装配置详见 [MCP 工具指南](MCP_TOOLS.md)。

**第三步：重启 Cursor 使 Skill 生效。**

---

## 更新已安装的 Skill

```bash
# 1. 拉取最新代码（GitLab 为主仓库）
git pull gitlab release
# 或 GitHub 镜像：git pull origin release

# 2. 对比本地和仓库版本
diff -ru ~/.cursor/skills/<skill-name> .cursor/skills/<skill-name>

# 3. 更新
cp -r .cursor/skills/<skill-name> ~/.cursor/skills/
```

---

## 贡献新 Skill

1. 在 `.cursor/skills/` 下创建新目录，包含 `SKILL.md`（必须）
2. 在 `SKILL.md` 中说明用途、步骤、依赖 MCP
3. 更新本文档的 Skill 列表
4. 通过 MR 提交

---

## 维护原则

1. **手动维护**：用编辑器 diff/合并，不依赖自动化脚本
2. **确认方向**：更新前确认"谁是最新版"——本地 vs 仓库
3. **协作合并**：仓库有他人提交时，禁止整目录覆盖，须手动合并
4. **AI 辅助**：可让 Cursor AI 对比两个版本，取长补短生成最优合并

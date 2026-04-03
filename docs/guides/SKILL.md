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
| **spx-bug-trace** | Bug 排查流程（API 溯源 → 数据验证 → 报告生成） | api-trace, ck-query, presto-query, cursor-ide-browser, mcp-atlassian, google-sheets |
| **seatalk-troubleshoot** | SeaTalk Agent 故障排查（10 阶段系统化排查：进程 → 多进程冲突 → CDP → 注入 → ACP → Remote → 功能 → UI → Agent 重启 → 日志） | 无外部依赖 |
| **release-publish** | 发版流程规范（版本号 → 日志 → 文档联动 → CDP 验证 → GitLab 推送 + GitHub 自动同步） | 无外部依赖 |

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

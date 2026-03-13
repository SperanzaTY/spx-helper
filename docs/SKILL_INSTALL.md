# SPX Bug Trace Skill 安装指南

当用户说「帮我安装 skill」「安装 spx-bug-trace」「如何安装这个 skill」时，按以下步骤执行。

## 安装目标

将 `spx-bug-trace` Skill 安装到 `~/.cursor/skills/`，使其在**所有项目**中可用（不仅限 SPX_Helper）。

## 前置条件

- 已克隆 SPX_Helper 仓库
- 当前在 SPX_Helper 项目目录下

## 安装步骤

### 方式一：执行脚本（推荐）

```bash
# 在 SPX_Helper 项目根目录执行
./scripts/sync_skills.sh
```

- **首次安装**：`~/.cursor/skills/spx-bug-trace/` 不存在时，脚本会自动复制
- **已有本地版本**：不覆盖，仅提示在 Cursor 中比较合并

### 方式二：手动复制

若 `~/.cursor/skills/spx-bug-trace/` 尚不存在：

```bash
mkdir -p ~/.cursor/skills
cp -r .cursor/skills/spx-bug-trace ~/.cursor/skills/
```

## 验证安装

1. 重启 Cursor 或切换项目
2. 打开 Cursor Settings → Rules，确认 `spx-bug-trace` 已出现在 Skill 列表
3. 在其他项目（如 fm-realtime）中触发业务排查场景，验证 Skill 是否自动加载

## 依赖

Skill 需配合以下 MCP 使用：user-api-trace、user-ck-query、user-presto-query、cursor-ide-browser。详见 `mcp-tools/` 目录配置。

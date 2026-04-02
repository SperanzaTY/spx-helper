# Cursor Skills 团队共享库

本目录是团队共享的 Cursor Skill 仓库。所有 Skill 通过 Git 管理，团队成员可以贡献新 Skill 或优化已有 Skill。

## 当前 Skill 列表

| Skill | 目录 | 用途 | 依赖 MCP |
|-------|------|------|---------|
| **spx-bug-trace** | `spx-bug-trace/` | 业务数据问题定位工作流：API 溯源 → 数据管道检查 → 源表验证 → 结论输出 | api-trace, ck-query, presto-query, browser, atlassian, google-sheets |

> 欢迎团队成员贡献新的 Skill！参见下方「贡献新 Skill」章节。

## 安装 Skill 到本地

Skill 安装到 `~/.cursor/skills/` 后，在**所有项目**中可用。

### 首次安装

```bash
mkdir -p ~/.cursor/skills
cp -r .cursor/skills/<skill-name> ~/.cursor/skills/
```

### 批量安装所有 Skill

```bash
mkdir -p ~/.cursor/skills
for skill in .cursor/skills/*/; do
  name=$(basename "$skill")
  [ "$name" = "README.md" ] && continue
  cp -r "$skill" ~/.cursor/skills/
  echo "✅ 已安装: $name"
done
```

安装后重启 Cursor 生效。

## 更新 Skill

### 检查差异

```bash
diff -ru ~/.cursor/skills/<skill-name> .cursor/skills/<skill-name>
```

### 场景 A：仓库是最新版（别人提交了优化）

```bash
# 拉取最新代码
git pull origin release

# 对比本地和仓库的差异
diff -ru ~/.cursor/skills/<skill-name> .cursor/skills/<skill-name>

# 如果你本地有自己的改动，先备份
cp -r ~/.cursor/skills/<skill-name> ~/.cursor/skills/<skill-name>.bak

# 用仓库版本更新本地
cp -r .cursor/skills/<skill-name> ~/.cursor/skills/
```

### 场景 B：本地是最新版（你在排查中优化了 Skill）

```bash
# 先确认仓库里没有别人新提交的改动
git pull origin release

# 对比差异
diff -ru ~/.cursor/skills/<skill-name> .cursor/skills/<skill-name>

# 用本地版本更新仓库（如有他人改动，需手动合并）
cp -r ~/.cursor/skills/<skill-name> .cursor/skills/

# 提交分享给团队
git add .cursor/skills/<skill-name>
git commit -m "docs: 更新 <skill-name> — <简要说明>"
```

### 场景 C：AI 辅助对比优化

当本地和仓库都有改动，可以让 Cursor AI 帮忙合并：

```
帮我对比 ~/.cursor/skills/spx-bug-trace 和仓库里的 .cursor/skills/spx-bug-trace，
合并两边的优化，生成最新版本
```

AI 会自动 diff 两个版本，取长补短，生成最优的合并结果。

## 贡献新 Skill

### 1. 创建 Skill 目录

```
.cursor/skills/
└── <your-skill-name>/
    ├── SKILL.md              # 必须：Skill 定义文件（含 YAML frontmatter）
    ├── tools-reference.md    # 推荐：依赖的 MCP 工具参考
    └── *.md                  # 可选：其他辅助文档
```

### 2. SKILL.md 格式

```markdown
---
name: your-skill-name
description: 一句话描述这个 Skill 做什么、什么时候触发
---

# Skill 标题

## 工作流程
...

## 使用的工具
...
```

### 3. 命名规范

- 目录名：小写字母 + 连字符，如 `data-quality-check`
- 见名知意：名字应反映工作流目的

### 4. 提交审查

- 通过 MR 提交到 release 分支
- 在 MR 描述中说明：Skill 用途、触发场景、依赖的 MCP
- 其他团队成员 review 后合入

## Skill 开发最佳实践

1. **明确触发条件**：在 description 中清晰描述什么场景会触发这个 Skill
2. **列出依赖**：在 SKILL.md 开头注明需要哪些 MCP 工具
3. **分步骤编排**：工作流拆成清晰的步骤，每步有明确的输入输出
4. **提供回退方案**：关键步骤失败时有 fallback 策略
5. **实战打磨**：Skill 应该来源于实际工作中反复使用的流程
6. **持续优化**：在使用中发现的优化点及时更新，分享给团队

## 目录规范

```
.cursor/skills/
├── README.md                    # ← 本文件（Skill 共享库说明）
├── spx-bug-trace/               # Skill: 业务问题定位
│   ├── SKILL.md                 #   主定义文件
│   ├── tools-reference.md       #   MCP 工具参考
│   ├── table-mapping.md         #   表映射关系
│   └── investigation-template.md #  排查模板
└── <新 skill>/                  # 你的新 Skill
    ├── SKILL.md
    └── ...
```

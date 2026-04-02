# Skill 安装与维护

> 完整的 Skill 共享库说明、安装、更新、贡献流程，请参见 [.cursor/skills/README.md](../.cursor/skills/README.md)。

## 快速安装

```bash
# 安装所有 Skill 到本地（所有项目可用）
mkdir -p ~/.cursor/skills
for skill in .cursor/skills/*/; do
  name=$(basename "$skill")
  [ "$name" = "README.md" ] && continue
  cp -r "$skill" ~/.cursor/skills/
  echo "✅ 已安装: $name"
done
```

安装后重启 Cursor 生效。

## 更新已安装的 Skill

```bash
# 1. 拉取最新代码
git pull origin release

# 2. 对比本地和仓库版本
diff -ru ~/.cursor/skills/<skill-name> .cursor/skills/<skill-name>

# 3. 选择更新方向（详见 .cursor/skills/README.md）
```

## 维护原则

1. **手动维护**：用编辑器 diff/合并，不依赖自动化脚本
2. **确认方向**：更新前确认"谁是最新版"——本地 vs 仓库
3. **协作合并**：仓库有他人提交时，禁止整目录覆盖，须手动合并
4. **AI 辅助**：可让 Cursor AI 对比两个版本，取长补短生成最优合并

## 贡献新 Skill

在 `.cursor/skills/` 下创建新目录，包含 `SKILL.md`（必须）+ 辅助文档（可选），通过 MR 提交。

详见 [.cursor/skills/README.md 的「贡献新 Skill」章节](../.cursor/skills/README.md)。

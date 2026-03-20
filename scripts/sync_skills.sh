#!/bin/bash

# 【已不推荐日常使用】团队约定：Skill 一律手动编辑、手动 cp 同步，勿依赖本脚本。
# 保留本文件仅为历史兼容；新流程见 docs/SKILL_INSTALL.md「维护原则」。
#
# 原行为：首次安装时复制；已有本地版本时不覆盖，仅提示在 Cursor 中比较合并

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="${REPO_ROOT}/.cursor/skills"
DEST_DIR="${HOME}/.cursor/skills"

if [ ! -d "$SRC_DIR" ]; then
    echo "❌ 错误: .cursor/skills/ 不存在"
    exit 1
fi

for skill_dir in "$SRC_DIR"/*; do
    if [ -d "$skill_dir" ]; then
        name=$(basename "$skill_dir")
        dest_path="${DEST_DIR}/${name}"

        if [ ! -d "$dest_path" ]; then
            echo "📚 首次安装 Skill: $name"
            mkdir -p "$DEST_DIR"
            cp -R "$skill_dir" "$DEST_DIR/"
            echo "✅ 已复制到 ~/.cursor/skills/$name，重启 Cursor 或切换项目后生效"
        else
            echo ""
            echo "📚 Skill: $name 已存在于 ~/.cursor/skills/"
            echo "   不自动覆盖。若需更新，请在 Cursor 中比较："
            echo "   仓库：$SRC_DIR/$name"
            echo "   本地：$dest_path"
            echo "   详见 docs/SKILL_INSTALL.md"
        fi
    fi
done

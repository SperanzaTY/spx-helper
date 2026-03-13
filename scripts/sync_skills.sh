#!/bin/bash

# Skill 同步说明：不执行任何覆盖，仅提示用 Cursor 比较后手动合并
# 避免较早或能力较弱的版本覆盖较优版本

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="${REPO_ROOT}/.cursor/skills"
DEST_DIR="${HOME}/.cursor/skills"

if [ ! -d "$SRC_DIR" ]; then
    echo "❌ 错误: .cursor/skills/ 不存在"
    exit 1
fi

echo "📚 Skill 同步方式（仅通过 Cursor 比较合并，不自动覆盖）"
echo ""
echo "1. 在 Cursor 中打开两侧进行比较："
echo "   仓库：$SRC_DIR"
echo "   本地：$DEST_DIR"
echo ""
echo "2. 根据比较结果，在 Cursor 中手动修改更优的一方"
echo "   - 若仓库更新：复制需要的内容到 ~/.cursor/skills/ 对应文件"
echo "   - 若本地更新：复制需要的内容到 .cursor/skills/ 并提交"
echo ""
echo "3. 不做任何自动覆盖，由你决定保留哪些内容"

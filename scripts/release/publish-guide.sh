#!/bin/bash

# GitHub Release 创建指南
# SPX Helper v2.6.8

echo "📋 GitHub Release 发布步骤"
echo "======================================"
echo ""
echo "✅ 已完成的准备工作："
echo "  1. ✓ 打包完成: SPX_Helper_v2.6.8.zip (1.0M)"
echo "  2. ✓ 发布说明: release_notes_v2.6.8.md"
echo "  3. ✓ 代码已提交到本地仓库"
echo "  4. ✓ Git 标签已创建: v2.6.8"
echo ""
echo "🚀 接下来需要执行的步骤："
echo ""
echo "步骤 1: 推送代码和标签到 GitHub"
echo "================================"
echo "git push origin main"
echo "git push origin v2.6.8"
echo ""
echo "步骤 2: 在 GitHub 网站上创建 Release"
echo "===================================="
echo "方法一：使用 GitHub CLI (推荐)"
echo "-----------------------------"
echo "gh release create v2.6.8 \\"
echo "  SPX_Helper_v2.6.8.zip \\"
echo "  --title \"SPX Helper v2.6.8\" \\"
echo "  --notes-file release_notes_v2.6.8.md"
echo ""
echo "方法二：使用网页界面"
echo "------------------"
echo "1. 访问: https://github.com/SperanzaTY/spx-helper/releases/new"
echo "2. 选择标签: v2.6.8"
echo "3. Release 标题: SPX Helper v2.6.8"
echo "4. 复制 release_notes_v2.6.8.md 的内容到描述框"
echo "5. 上传文件: SPX_Helper_v2.6.8.zip"
echo "6. 点击 'Publish release'"
echo ""
echo "📦 发布包位置:"
echo "/Users/tianyi.liang/Cursor/SPX_Helper/SPX_Helper_v2.6.8.zip"
echo ""
echo "📝 发布说明文件:"
echo "/Users/tianyi.liang/Cursor/SPX_Helper/release_notes_v2.6.8.md"
echo ""











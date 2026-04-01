#!/bin/bash

# SPX Helper v2.8.0 打包脚本

set -e

VERSION="2.8.0"
PACKAGE_NAME="spx-helper-v${VERSION}"
BUILD_DIR="build/${PACKAGE_NAME}"

echo "=========================================="
echo "  SPX Helper v${VERSION} 打包"
echo "=========================================="
echo ""

# 1. 清理旧的构建
echo "🧹 清理旧构建..."
rm -rf build/
mkdir -p "${BUILD_DIR}"

EXT_DIR="chrome-extension"

# 2. 复制扩展核心文件
echo "📦 复制扩展文件..."
cp "${EXT_DIR}/manifest.json" "${BUILD_DIR}/"
cp "${EXT_DIR}/popup.html" "${BUILD_DIR}/"
cp "${EXT_DIR}/popup.js" "${BUILD_DIR}/"
cp "${EXT_DIR}/background.js" "${BUILD_DIR}/"
cp "${EXT_DIR}/styles.css" "${BUILD_DIR}/"
cp -r "${EXT_DIR}/images/" "${BUILD_DIR}/" 2>/dev/null || echo "  (images 目录不存在，跳过)"

# 3. 复制文档（可选）
echo "📚 复制文档..."
cp README.md "${BUILD_DIR}/" 2>/dev/null || echo "  (README.md 不存在，跳过)"
cp LICENSE "${BUILD_DIR}/" 2>/dev/null || echo "  (LICENSE 不存在，跳过)"
cp release_notes_v${VERSION}.md "${BUILD_DIR}/" 2>/dev/null || echo "  (Release Notes 不存在，跳过)"

# 4. 创建 ZIP 包
echo "🗜️  创建 ZIP 包..."
cd build
zip -r "${PACKAGE_NAME}.zip" "${PACKAGE_NAME}/" -q
cd ..

# 5. 计算文件大小
FILE_SIZE=$(du -h "build/${PACKAGE_NAME}.zip" | cut -f1)

echo ""
echo "=========================================="
echo "✅ 打包完成！"
echo "=========================================="
echo ""
echo "📦 文件位置: build/${PACKAGE_NAME}.zip"
echo "📊 文件大小: ${FILE_SIZE}"
echo ""
echo "📝 包含内容:"
echo "   • Chrome Extension 核心文件"
echo "   • 文档和说明"
echo ""
echo "🚀 上传到 GitHub Release:"
echo "   https://github.com/SperanzaTY/spx-helper/releases/new?tag=v${VERSION}"
echo ""

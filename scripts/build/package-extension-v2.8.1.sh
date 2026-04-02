#!/bin/bash

# SPX Helper v2.8.1 打包脚本 - 仅扩展包

VERSION="2.8.1"
BUILD_DIR="build"
PACKAGE_NAME="spx-helper-v${VERSION}"

echo "📦 开始打包 SPX Helper v${VERSION} (仅扩展)"
echo "=========================================="

# 创建构建目录
rm -rf "${BUILD_DIR}/${PACKAGE_NAME}"
mkdir -p "${BUILD_DIR}/${PACKAGE_NAME}"

EXT_DIR="chrome-extension"
echo "📋 复制扩展文件..."

# 复制核心文件
cp "${EXT_DIR}/manifest.json" "${BUILD_DIR}/${PACKAGE_NAME}/"
cp "${EXT_DIR}/popup.html" "${BUILD_DIR}/${PACKAGE_NAME}/"
cp "${EXT_DIR}/popup.js" "${BUILD_DIR}/${PACKAGE_NAME}/"
cp "${EXT_DIR}/background.js" "${BUILD_DIR}/${PACKAGE_NAME}/"
cp "${EXT_DIR}/styles.css" "${BUILD_DIR}/${PACKAGE_NAME}/"

# 复制图标目录
echo "🖼️  复制图标..."
mkdir -p "${BUILD_DIR}/${PACKAGE_NAME}/images"
cp -r "${EXT_DIR}/images"/* "${BUILD_DIR}/${PACKAGE_NAME}/images/"

# 复制库文件
echo "📚 复制库文件..."
cp "${EXT_DIR}/sql-formatter.min.js" "${BUILD_DIR}/${PACKAGE_NAME}/" 2>/dev/null || true
cp "${EXT_DIR}/cronstrue.min.js" "${BUILD_DIR}/${PACKAGE_NAME}/" 2>/dev/null || true
cp "${EXT_DIR}/mermaid.min.js" "${BUILD_DIR}/${PACKAGE_NAME}/"

# 打包成 zip
echo "📦 创建 ZIP 包..."
cd "${BUILD_DIR}"
zip -r "${PACKAGE_NAME}.zip" "${PACKAGE_NAME}" > /dev/null
cd ..

# 显示结果
echo ""
echo "✅ 打包完成！"
echo ""
echo "📦 输出文件："
echo "   - ${BUILD_DIR}/${PACKAGE_NAME}.zip"
echo ""
echo "📊 文件大小："
ls -lh "${BUILD_DIR}/${PACKAGE_NAME}.zip" | awk '{print "   " $5}'
echo ""
echo "🚀 接下来："
echo "   1. 测试扩展: 在 Chrome 中加载 ${BUILD_DIR}/${PACKAGE_NAME}/ 目录"
echo "   2. 上传到 GitHub Release"
echo ""

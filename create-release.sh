#!/bin/bash

# SPX Helper - 自动打包脚本
# Author: tianyi.liang
# Version: 2.0.0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 SPX Helper - 自动打包工具"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 版本信息
VERSION="2.0.0"
RELEASE_NAME="SPX_Helper_v${VERSION}"
RELEASE_DIR="releases"
BUILD_DIR="${RELEASE_DIR}/build"

# 清理旧文件
echo "🧹 清理旧的构建文件..."
rm -rf "${RELEASE_DIR}"
mkdir -p "${BUILD_DIR}"

# 复制必需文件
echo "📄 复制扩展文件..."
cp manifest.json "${BUILD_DIR}/"
cp popup.html "${BUILD_DIR}/"
cp popup.js "${BUILD_DIR}/"
cp background.js "${BUILD_DIR}/"
cp styles.css "${BUILD_DIR}/"

# 复制文档
echo "📚 复制文档文件..."
cp README.md "${BUILD_DIR}/"
cp INSTALL.md "${BUILD_DIR}/"

# 复制图标
echo "🎨 复制图标文件..."
mkdir -p "${BUILD_DIR}/images"
cp -r images/* "${BUILD_DIR}/images/" 2>/dev/null || echo "   ⚠️  警告: 图标文件夹为空或不存在"

# 创建zip包
echo "🗜️  创建压缩包..."
cd "${RELEASE_DIR}"
zip -r "../${RELEASE_NAME}.zip" build/* > /dev/null 2>&1

if [ $? -eq 0 ]; then
    cd ..
    
    # 显示文件大小
    SIZE=$(du -h "${RELEASE_NAME}.zip" | cut -f1)
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ 打包完成！"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📦 文件名: ${RELEASE_NAME}.zip"
    echo "📊 大小: ${SIZE}"
    echo "📍 位置: $(pwd)/${RELEASE_NAME}.zip"
    echo ""
    echo "📋 包含文件:"
    unzip -l "${RELEASE_NAME}.zip" | grep -E '\.(json|html|js|css|md|png)$' | awk '{print "   " $4}'
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🎁 分发建议"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "1️⃣  将 ${RELEASE_NAME}.zip 发送给用户"
    echo "2️⃣  用户解压后，在Chrome中:"
    echo "    - 访问 chrome://extensions/"
    echo "    - 开启'开发者模式'"
    echo "    - 点击'加载已解压的扩展程序'"
    echo "    - 选择解压后的文件夹"
    echo ""
    echo "3️⃣  详细安装说明: 查看 INSTALL.md"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
    echo ""
    echo "❌ 打包失败！"
    echo "请检查 zip 命令是否可用"
    exit 1
fi

#!/bin/bash

# SPX Helper v2.8.0 完整打包（包含站点查询工具）

set -e

VERSION="2.8.0"
FULL_PACKAGE="spx-helper-full-v${VERSION}"
BUILD_DIR="build/${FULL_PACKAGE}"

echo "=========================================="
echo "  SPX Helper v${VERSION} 完整打包"
echo "=========================================="
echo ""

# 1. 清理
echo "🧹 清理..."
rm -rf "build/${FULL_PACKAGE}"
mkdir -p "${BUILD_DIR}"

# 2. 复制扩展文件
echo "📦 复制 Chrome Extension..."
cp manifest.json "${BUILD_DIR}/"
cp popup.html "${BUILD_DIR}/"
cp popup.js "${BUILD_DIR}/"
cp background.js "${BUILD_DIR}/"
cp styles.css "${BUILD_DIR}/"
cp -r icons/ "${BUILD_DIR}/" 2>/dev/null || true
cp -r images/ "${BUILD_DIR}/" 2>/dev/null || true

# 3. 复制站点查询工具
echo "📍 复制站点查询工具..."
mkdir -p "${BUILD_DIR}/station_query"
cp -r station_query/*.py "${BUILD_DIR}/station_query/" 2>/dev/null || true
cp -r station_query/*.sh "${BUILD_DIR}/station_query/" 2>/dev/null || true
cp -r station_query/*.md "${BUILD_DIR}/station_query/" 2>/dev/null || true
cp -r station_query/requirements.txt "${BUILD_DIR}/station_query/" 2>/dev/null || true
cp -r station_query/config/ "${BUILD_DIR}/station_query/" 2>/dev/null || true

# 4. 复制文档
echo "📚 复制文档..."
cp README.md "${BUILD_DIR}/" 2>/dev/null || true
cp LICENSE "${BUILD_DIR}/" 2>/dev/null || true
cp release_notes_v${VERSION}.md "${BUILD_DIR}/" 2>/dev/null || true
mkdir -p "${BUILD_DIR}/docs"
cp -r docs/*.md "${BUILD_DIR}/docs/" 2>/dev/null || true

# 5. 创建使用说明
echo "📝 创建使用说明..."
cat > "${BUILD_DIR}/使用说明.txt" << 'USAGE'
SPX Helper v2.8.0 - 使用说明
===============================

本包包含：
1. Chrome Extension（浏览器扩展）
2. 站点查询工具（Python 后端）

安装方法：
---------

【Chrome Extension】
1. 打开 Chrome，访问 chrome://extensions
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择本文件夹（包含 manifest.json 的目录）

【站点查询工具】
1. 安装 Python 3.7+
2. 进入 station_query 目录
3. 安装依赖：pip install -r requirements.txt
4. 配置：cp config/clickhouse.yaml.example config/clickhouse.yaml
5. 编辑 config/clickhouse.yaml 填入配置
6. 启动服务：./start.sh 或 python station_api.py

文档：
-----
- station_query/README_CN.md - 站点查询完整说明
- station_query/DEMO.md - 快速入门
- release_notes_v2.8.0.md - 版本更新说明

支持：
-----
GitHub: https://github.com/SperanzaTY/spx-helper
Issues: https://github.com/SperanzaTY/spx-helper/issues
USAGE

# 6. 创建 ZIP 包
echo "🗜️  创建 ZIP 包..."
cd build
zip -r "${FULL_PACKAGE}.zip" "${FULL_PACKAGE}/" -q
cd ..

# 7. 统计
FILE_SIZE=$(du -h "build/${FULL_PACKAGE}.zip" | cut -f1)
FILE_COUNT=$(find "${BUILD_DIR}" -type f | wc -l | xargs)

echo ""
echo "=========================================="
echo "✅ 完整打包完成！"
echo "=========================================="
echo ""
echo "📦 文件位置: build/${FULL_PACKAGE}.zip"
echo "📊 文件大小: ${FILE_SIZE}"
echo "📁 文件数量: ${FILE_COUNT} 个文件"
echo ""
echo "📝 包含内容:"
echo "   • Chrome Extension"
echo "   • 站点查询工具（Python）"
echo "   • 完整文档"
echo "   • 使用说明"
echo ""

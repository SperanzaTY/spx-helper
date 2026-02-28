#!/bin/bash

# SPX Helper 打包脚本
# 版本: 2.6.7

VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
PACKAGE_NAME="SPX_Helper_v${VERSION}.zip"
TEMP_DIR=$(mktemp -d)

echo "📦 开始打包 SPX Helper v${VERSION}..."

# 创建临时目录结构
mkdir -p "${TEMP_DIR}/SPX_Helper"

# 复制必需的文件
echo "📋 复制文件..."
cp manifest.json "${TEMP_DIR}/SPX_Helper/"
cp popup.html "${TEMP_DIR}/SPX_Helper/"
cp popup.js "${TEMP_DIR}/SPX_Helper/"
cp background.js "${TEMP_DIR}/SPX_Helper/"
cp styles.css "${TEMP_DIR}/SPX_Helper/"
cp mermaid.min.js "${TEMP_DIR}/SPX_Helper/"
cp calendar-config.html "${TEMP_DIR}/SPX_Helper/"
cp calendar-config.js "${TEMP_DIR}/SPX_Helper/"

# 复制 images 目录
echo "🖼️  复制图标文件..."
cp -r images "${TEMP_DIR}/SPX_Helper/"

# 创建安装说明文件
cat > "${TEMP_DIR}/SPX_Helper/INSTALL.md" << 'EOF'
# SPX Helper 安装指南

## 安装步骤

1. 下载并解压 `SPX_Helper_v*.zip` 文件
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择解压后的 `SPX_Helper` 文件夹
6. 完成！扩展已安装

## 更新说明

如果是从旧版本更新：
1. 建议先导出数据（设置 → 导出数据）
2. 移除旧版本扩展
3. 按照上述步骤安装新版本
4. 导入之前导出的数据

## 功能说明

- 📋 快速链接管理
- 📝 笔记管理
- ✅ 待办事项
- 🛠️ 实用工具（时区转换、JSON格式化、SQL格式化、Cron表达式、正则表达式、文本对比、命名格式转换、Mermaid图表、HTTP请求测试）
- 📅 日历集成
- 🤖 AI 助手

更多信息请访问：https://github.com/SperanzaTY/spx-helper
EOF

# 创建 README
cat > "${TEMP_DIR}/SPX_Helper/README.md" << EOF
# SPX Helper v${VERSION}

Shopee 大数据开发助手 Chrome 扩展

## 安装

请查看 INSTALL.md 文件了解详细安装步骤。

## 功能

- 📋 快速链接管理
- 📝 笔记管理
- ✅ 待办事项
- 🛠️ 实用工具集合
- 📅 日历集成
- 🤖 AI 助手

## 更新日志

查看 GitHub Releases 页面了解更新内容：https://github.com/SperanzaTY/spx-helper/releases
EOF

# 打包
echo "📦 创建压缩包..."
cd "${TEMP_DIR}"
zip -r "${PACKAGE_NAME}" SPX_Helper -x "*.DS_Store" "*.git*" > /dev/null

# 移动到项目根目录
mv "${PACKAGE_NAME}" "/Users/tianyi.liang/Cursor/SPX_Helper/"

# 清理临时目录
rm -rf "${TEMP_DIR}"

# 显示结果
FILE_SIZE=$(du -h "/Users/tianyi.liang/Cursor/SPX_Helper/${PACKAGE_NAME}" | cut -f1)
echo ""
echo "✅ 打包完成！"
echo "📦 文件名: ${PACKAGE_NAME}"
echo "📊 文件大小: ${FILE_SIZE}"
echo "📍 位置: /Users/tianyi.liang/Cursor/SPX_Helper/${PACKAGE_NAME}"
echo ""
echo "🚀 可以上传到 GitHub Releases 了！"













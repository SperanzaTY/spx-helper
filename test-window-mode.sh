#!/bin/bash
# 窗口模式快速测试脚本

echo "================================"
echo "SPX Helper 窗口模式调试工具"
echo "================================"
echo ""

# 检查是否在项目根目录
if [ ! -f "manifest.json" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

echo "📋 修复内容："
echo "   1. ✅ createWindow: 添加失败重试机制"
echo "   2. ✅ openHelperWindow: 增强错误处理和日志"
echo "   3. ✅ 消息监听器: 添加详细调试信息"
echo "   4. ✅ 图标点击: 添加状态检查日志"
echo ""

echo "📝 接下来的步骤："
echo ""
echo "1️⃣  重新加载扩展"
echo "   - 打开: chrome://extensions/"
echo "   - 开启「开发者模式」"
echo "   - 点击 SPX Helper 的「重新加载」按钮"
echo ""

echo "2️⃣  打开 Service Worker 控制台"
echo "   - 在扩展卡片上点击「Service Worker」链接"
echo "   - 保持开发者工具打开"
echo ""

echo "3️⃣  测试窗口模式"
echo "   a) 点击扩展图标（应该打开弹窗）"
echo "   b) 打开设置面板"
echo "   c) 启用「窗口模式」开关"
echo "   d) 查看控制台输出（应该看到 🔵 ✅ 标记的日志）"
echo ""

echo "4️⃣  测试图标点击"
echo "   - 关闭所有 SPX Helper 窗口"
echo "   - 点击工具栏图标"
echo "   - 查看 Service Worker 控制台日志"
echo "   - 应该看到: 🔵 扩展图标被点击"
echo "   - 窗口应该成功打开"
echo ""

echo "📊 调试日志说明："
echo "   🔵 = 流程信息"
echo "   ✅ = 操作成功"
echo "   ❌ = 发生错误"
echo "   ⚠️  = 警告信息"
echo ""

echo "📖 详细说明请查看: WINDOW_MODE_DEBUG.md"
echo ""
echo "================================"

# 询问是否打开扩展管理页面
read -p "是否打开 Chrome 扩展管理页面? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    open "chrome://extensions/"
    echo "✅ 已打开扩展管理页面"
fi



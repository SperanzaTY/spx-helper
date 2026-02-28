#!/bin/bash
# Presto MCP Server 安装脚本

set -e

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║          Presto MCP Server 安装程序                              ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# 1. 检查Python
echo "1️⃣  检查Python..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3未安装"
    exit 1
fi
echo "✅ Python版本: $(python3 --version)"

# 2. 安装依赖
echo ""
echo "2️⃣  安装依赖..."
pip3 install mcp requests --quiet
echo "✅ 依赖安装完成"

# 3. 获取脚本路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_SERVER_PATH="$SCRIPT_DIR/presto_mcp_server.py"

echo ""
echo "3️⃣  MCP服务器路径:"
echo "   $MCP_SERVER_PATH"

# 4. 获取用户配置
echo ""
echo "4️⃣  配置Personal Token和用户名"
echo ""
echo "⚠️  你需要从DataSuite获取Personal Token:"
echo "   1. 访问 https://datasuite.shopee.io/dataservice/ds_api_management"
echo "   2. 点击左上角三个横线菜单（☰）→ 获取Personal Token"
echo "   3. 复制你的token"
echo ""

read -p "请输入你的Personal Token: " PERSONAL_TOKEN
read -p "请输入你的用户名: " USERNAME

if [ -z "$PERSONAL_TOKEN" ] || [ -z "$USERNAME" ]; then
    echo ""
    echo "❌ Token和用户名不能为空"
    exit 1
fi

# 5. 配置Cursor
echo ""
echo "5️⃣  配置Cursor MCP..."

MCP_CONFIG_FILE="$HOME/.cursor/mcp.json"

# 创建配置
cat > "$MCP_CONFIG_FILE" << EOF
{
  "mcpServers": {
    "presto-query": {
      "command": "python3",
      "args": [
        "$MCP_SERVER_PATH"
      ],
      "env": {
        "PRESTO_PERSONAL_TOKEN": "$PERSONAL_TOKEN",
        "PRESTO_USERNAME": "$USERNAME"
      }
    }
  }
}
EOF

echo "✅ 已创建配置文件: $MCP_CONFIG_FILE"

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                    ✅ 安装完成！                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 下一步:"
echo ""
echo "  1. 重启Cursor"
echo "  2. 在对话中测试:"
echo "     \"请查询 spx_mart.dim_spx_lm_station_user_configuration_tab_id 表的数据\""
echo ""
echo "📖 详细文档:"
echo "  • 配置说明: cat PRESTO_MCP_CONFIG_GUIDE.md"
echo "  • 使用指南: cat PRESTO_MCP_README.md"
echo ""
echo "🔐 安全提醒:"
echo "  • 不要分享你的Personal Token"
echo "  • 不要将配置文件提交到Git"
echo ""

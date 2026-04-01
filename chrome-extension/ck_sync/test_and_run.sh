#!/bin/bash

# ClickHouse DDL 同步功能测试脚本

echo "=========================================="
echo "ClickHouse DDL 同步功能测试"
echo "=========================================="
echo ""

# 检查Python环境
echo "1. 检查Python环境..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装"
    exit 1
fi
echo "✅ Python版本: $(python3 --version)"
echo ""

# 检查依赖
echo "2. 检查依赖..."
python3 -c "import requests" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  requests 未安装，正在安装..."
    pip3 install requests
fi
echo "✅ 依赖检查完成"
echo ""

# 测试DDL功能
echo "3. 测试DDL功能..."
echo "----------------------------------------"
python3 test_ddl.py
TEST_RESULT=$?
echo "----------------------------------------"
echo ""

if [ $TEST_RESULT -eq 0 ]; then
    echo "✅ DDL功能测试通过"
    echo ""
    echo "4. 可以开始使用完整DDL同步了！"
    echo ""
    echo "使用方法:"
    echo "  python3 sync_with_ddl.py"
    echo ""
    echo "详细文档:"
    echo "  cat DDL_SYNC_GUIDE.md"
    echo ""
else
    echo "❌ DDL功能测试失败"
    echo ""
    echo "请检查:"
    echo "  1. 数据库连接配置是否正确"
    echo "  2. 用户名密码是否正确"
    echo "  3. 网络连接是否正常"
    echo "  4. 表是否存在"
    echo ""
fi

echo "=========================================="
echo "测试完成"
echo "=========================================="

exit $TEST_RESULT

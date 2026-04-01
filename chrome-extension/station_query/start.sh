#!/bin/bash

# 站点查询服务快速启动脚本

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SPX 站点查询服务 - 快速启动${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ 未找到 Python3，请先安装${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Python3 已安装: $(python3 --version)${NC}"

# 检查依赖
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}📦 创建虚拟环境...${NC}"
    python3 -m venv venv
fi

echo -e "${GREEN}🔌 激活虚拟环境...${NC}"
source venv/bin/activate

echo -e "${GREEN}📦 安装依赖...${NC}"
pip install -r requirements.txt > /dev/null 2>&1

# 检查配置文件
if [ ! -f "config/clickhouse.yaml" ]; then
    echo -e "${YELLOW}⚠️  配置文件不存在，从示例复制...${NC}"
    cp config/clickhouse.yaml.example config/clickhouse.yaml
    echo -e "${RED}❗ 请先编辑 config/clickhouse.yaml 填入正确的配置${NC}"
    echo -e "${YELLOW}   然后重新运行此脚本${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 配置文件已存在${NC}"

# 测试连接
echo -e "${YELLOW}🔌 测试 ClickHouse 连接...${NC}"
python3 -c "
from station_query import StationQuery
import yaml

with open('config/clickhouse.yaml', 'r') as f:
    config = yaml.safe_load(f)

query = StationQuery(
    clickhouse_config=config['online2'],
    markets=config.get('markets'),
    max_workers=8
)

if query.test_connection():
    print('✅ ClickHouse 连接成功')
else:
    print('❌ ClickHouse 连接失败')
    exit(1)
"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 连接测试失败，请检查配置${NC}"
    exit 1
fi

# 启动服务
PORT="${1:-8888}"
HOST="${2:-0.0.0.0}"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}🚀 启动 API 服务...${NC}"
echo -e "${GREEN}   地址: http://${HOST}:${PORT}${NC}"
echo -e "${GREEN}   按 Ctrl+C 停止服务${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

python3 station_api.py --host "$HOST" --port "$PORT"

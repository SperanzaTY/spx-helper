"""
站点查询命令行工具
支持快速查询站点 ID 和名称
"""

import argparse
import yaml
import logging
import json
from tabulate import tabulate
from station_query import StationQuery


# 配置日志
logging.basicConfig(
    level=logging.WARNING,  # 命令行模式默认只显示警告和错误
    format='%(asctime)s - %(levelname)s - %(message)s'
)


def load_config(config_path: str = 'config/clickhouse.yaml'):
    """加载配置文件"""
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except Exception as e:
        print(f"❌ 加载配置文件失败: {e}")
        exit(1)


def format_table_output(results):
    """格式化表格输出"""
    if not results:
        print("❌ 未找到匹配的站点")
        return
    
    # 选择关键字段显示
    headers = [
        '市场', 'ID', '站点名称', '类型', '状态', '城市', 
        '经理', '是否活跃', '地址'
    ]
    
    rows = []
    for row in results:
        rows.append([
            row.get('market', '-'),
            row.get('station_id', '-'),
            row.get('station_name', '-'),
            row.get('bi_station_type', '-'),
            '✅' if row.get('status') == 1 else '❌',
            row.get('city_name', '-'),
            row.get('manager', '-'),
            '✅' if row.get('is_active_site_l7d') == 1 else '❌',
            (row.get('address', '-') or '-')[:30] + '...' if len(row.get('address', '') or '') > 30 else (row.get('address', '-') or '-')
        ])
    
    print(f"\n✅ 找到 {len(results)} 条记录:\n")
    print(tabulate(rows, headers=headers, tablefmt='grid'))


def format_json_output(results):
    """格式化 JSON 输出"""
    print(json.dumps(results, indent=2, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(
        description='SPX 站点快速查询工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 按站点 ID 查询
  python station_cli.py --id 123456
  
  # 按站点名称搜索
  python station_cli.py --name "Central Hub"
  
  # 指定市场查询
  python station_cli.py --id 123456 --market id
  
  # 批量查询多个 ID
  python station_cli.py --ids 123,456,789
  
  # 输出 JSON 格式
  python station_cli.py --id 123456 --json
        """
    )
    
    # 查询参数
    query_group = parser.add_mutually_exclusive_group(required=True)
    query_group.add_argument('--id', type=int, help='站点 ID')
    query_group.add_argument('--name', type=str, help='站点名称（支持模糊搜索）')
    query_group.add_argument('--ids', type=str, help='批量查询多个 ID（逗号分隔）')
    
    # 可选参数
    parser.add_argument('--market', type=str, help='指定市场（sg/id/my/th/ph/vn/tw/br）')
    parser.add_argument('--limit', type=int, default=100, help='返回结果限制（默认 100）')
    parser.add_argument('--config', default='config/clickhouse.yaml', help='配置文件路径')
    parser.add_argument('--json', action='store_true', help='输出 JSON 格式')
    parser.add_argument('--verbose', action='store_true', help='显示详细日志')
    
    args = parser.parse_args()
    
    # 调整日志级别
    if args.verbose:
        logging.getLogger().setLevel(logging.INFO)
    
    # 加载配置
    print("⏳ 正在连接 ClickHouse...")
    config = load_config(args.config)
    
    clickhouse_config = config['online2']
    markets = config.get('markets', None)
    max_workers = config.get('query', {}).get('max_workers', 8)
    
    # 初始化查询服务
    query_service = StationQuery(
        clickhouse_config=clickhouse_config,
        markets=markets,
        max_workers=max_workers
    )
    
    # 测试连接
    if not query_service.test_connection():
        print("❌ 无法连接到 ClickHouse，请检查配置")
        exit(1)
    
    print("✅ 连接成功\n")
    
    # 执行查询
    results = []
    
    if args.id:
        # 按 ID 查询
        print(f"🔍 查询站点 ID: {args.id}")
        results = query_service.query_by_id(args.id, market=args.market)
    
    elif args.name:
        # 按名称搜索
        print(f"🔍 搜索站点名称: {args.name}")
        results = query_service.query_by_name(args.name, market=args.market, limit=args.limit)
    
    elif args.ids:
        # 批量查询
        station_ids = [int(x.strip()) for x in args.ids.split(',')]
        print(f"🔍 批量查询 {len(station_ids)} 个站点")
        results = query_service.query_batch_ids(station_ids, market=args.market)
    
    # 输出结果
    if args.json:
        format_json_output(results)
    else:
        format_table_output(results)


if __name__ == '__main__':
    main()

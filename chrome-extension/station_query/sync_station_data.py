#!/usr/bin/env python3
"""
站点数据同步脚本
从 ONLINE2 生产环境同步站点表到 TEST 环境
"""

import requests
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
import warnings
warnings.filterwarnings('ignore')

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("StationSync")


class StationSync:
    """站点数据同步器"""
    
    # 市场列表
    MARKETS = ['sg', 'id', 'my', 'th', 'ph', 'vn', 'tw', 'br']
    
    def __init__(self):
        # 源环境 (ONLINE2 生产)
        self.source = {
            'host': '10.180.129.96',
            'port': 8123,
            'user': 'spx_mart',
            'password': 'RtL3jHWkDoHp',
            'database': 'spx_mart_manage_app',
            'use_https': False
        }
        
        # 目标环境 (TEST)
        self.target = {
            'host': 'clickhouse-k8s-sg-prod.data-infra.shopee.io',
            'port': 443,
            'user': 'spx_mart-cluster_szsc_data_shared_online',
            'password': 'RtL3jHWkDoHp',
            'database': 'spx_mart_pub',
            'use_https': True
        }
    
    def _get_url(self, config):
        """构建 URL"""
        protocol = 'https' if config['use_https'] else 'http'
        return f"{protocol}://{config['host']}:{config['port']}/"
    
    def _execute_query(self, config, sql, timeout=30):
        """执行查询"""
        url = self._get_url(config)
        try:
            response = requests.post(
                url,
                params={
                    'user': config['user'],
                    'password': config['password'],
                    'database': config['database']
                },
                data=sql.encode('utf-8'),
                verify=False,
                timeout=timeout
            )
            return response.status_code == 200, response.text
        except Exception as e:
            return False, str(e)
    
    def test_connections(self):
        """测试源和目标环境的连接"""
        logger.info("🔌 测试连接...")
        
        # 测试源环境
        logger.info("  测试 ONLINE2 (源)...")
        success, _ = self._execute_query(self.source, "SELECT 1", timeout=5)
        if success:
            logger.info("  ✅ ONLINE2 连接成功")
        else:
            logger.warning("  ⚠️  ONLINE2 连接失败 (可能需要内网/VPN)")
            return False
        
        # 测试目标环境
        logger.info("  测试 TEST (目标)...")
        success, _ = self._execute_query(self.target, "SELECT 1", timeout=5)
        if success:
            logger.info("  ✅ TEST 连接成功")
        else:
            logger.error("  ❌ TEST 连接失败")
            return False
        
        return True
    
    def sync_market_by_table(self, source_table: str, target_table: str):
        """按指定表名同步（适用于命名不规范的表）"""
        logger.info(f"📊 同步表: {source_table} -> {target_table}")
        try:
            sql_count = f"SELECT count() as cnt FROM {source_table}"
            success, result = self._execute_query(self.source, sql_count + " FORMAT TabSeparated")
            if not success:
                logger.error(f"  ❌ 获取源表数据量失败: {result}")
                return False, 0
            source_count = int(result.strip())
            logger.info(f"  源表记录数: {source_count}")

            logger.info(f"  清空目标表...")
            sql_truncate = f"TRUNCATE TABLE {target_table}"
            success, result = self._execute_query(self.target, sql_truncate)
            if not success:
                logger.error(f"  ❌ 清空目标表失败: {result}")
                return False, 0

            logger.info(f"  开始同步数据...")
            start_time = time.time()
            source_url = self._get_url(self.source)
            sql_sync = f"""
            INSERT INTO {target_table}
            SELECT * FROM remote(
                '{self.source['host']}:{self.source['port']}',
                '{source_table}',
                '{self.source['user']}',
                '{self.source['password']}'
            )
            """
            success, result = self._execute_query(self.target, sql_sync, timeout=300)
            elapsed = time.time() - start_time
            if not success:
                logger.error(f"  ❌ 数据同步失败: {result[:200]}")
                return False, 0

            sql_verify = f"SELECT count() as cnt FROM {target_table} FORMAT TabSeparated"
            success, result = self._execute_query(self.target, sql_verify)
            if success:
                target_count = int(result.strip())
                logger.info(f"  ✅ 同步完成: {target_count} 条记录, 耗时 {elapsed:.2f}s")
                return True, target_count
            return True, source_count
        except Exception as e:
            logger.error(f"  ❌ 同步异常: {e}")
            return False, 0

    def sync_market(self, market):
        """同步单个市场的站点数据"""
        source_table = f"{self.source['database']}.dim_spx_station_tab_{market}_all"
        target_table = f"{self.target['database']}.dim_spx_station_tab_{market}_all"
        
        logger.info(f"📊 同步 {market.upper()} 市场...")
        
        try:
            # 1. 获取源表数据量
            sql_count = f"SELECT count() as cnt FROM {source_table}"
            success, result = self._execute_query(self.source, sql_count + " FORMAT TabSeparated")
            if not success:
                logger.error(f"  ❌ 获取源表数据量失败: {result}")
                return False, 0
            
            source_count = int(result.strip())
            logger.info(f"  源表记录数: {source_count}")
            
            # 2. 清空目标表
            logger.info(f"  清空目标表...")
            sql_truncate = f"TRUNCATE TABLE {target_table}"
            success, result = self._execute_query(self.target, sql_truncate)
            if not success:
                logger.error(f"  ❌ 清空目标表失败: {result}")
                return False, 0
            
            # 3. 使用 INSERT SELECT 同步数据
            logger.info(f"  开始同步数据...")
            start_time = time.time()
            
            # 构建远程查询 SQL
            source_url = self._get_url(self.source)
            sql_sync = f"""
            INSERT INTO {target_table}
            SELECT * FROM remote(
                '{self.source['host']}:{self.source['port']}',
                '{source_table}',
                '{self.source['user']}',
                '{self.source['password']}'
            )
            """
            
            success, result = self._execute_query(self.target, sql_sync, timeout=300)
            elapsed = time.time() - start_time
            
            if not success:
                logger.error(f"  ❌ 数据同步失败: {result[:200]}")
                return False, 0
            
            # 4. 验证数据量
            sql_verify = f"SELECT count() as cnt FROM {target_table} FORMAT TabSeparated"
            success, result = self._execute_query(self.target, sql_verify)
            if success:
                target_count = int(result.strip())
                logger.info(f"  ✅ 同步完成: {target_count} 条记录, 耗时 {elapsed:.2f}s")
                return True, target_count
            else:
                logger.warning(f"  ⚠️  同步完成但验证失败")
                return True, source_count
        
        except Exception as e:
            logger.error(f"  ❌ 同步异常: {e}")
            return False, 0
    
    def sync_all(self, markets=None, max_workers=4):
        """同步所有市场"""
        markets_to_sync = markets or self.MARKETS
        
        logger.info(f"🚀 开始同步 {len(markets_to_sync)} 个市场的站点数据...")
        logger.info(f"   源: ONLINE2 (生产)")
        logger.info(f"   目标: TEST 环境")
        logger.info("")
        
        # 测试连接
        if not self.test_connections():
            logger.error("❌ 连接测试失败，无法继续同步")
            return False
        
        logger.info("")
        
        # 并行同步
        start_time = time.time()
        results = []
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(self.sync_market, market): market 
                for market in markets_to_sync
            }
            
            for future in as_completed(futures):
                market = futures[future]
                try:
                    success, count = future.result()
                    results.append((market, success, count))
                except Exception as e:
                    logger.error(f"❌ {market.upper()} 同步异常: {e}")
                    results.append((market, False, 0))
        
        # 统计结果
        elapsed = time.time() - start_time
        success_count = sum(1 for _, success, _ in results if success)
        total_records = sum(count for _, _, count in results)
        
        logger.info("")
        logger.info("=" * 50)
        logger.info(f"✅ 同步完成!")
        logger.info(f"   成功: {success_count}/{len(markets_to_sync)} 个市场")
        logger.info(f"   总记录数: {total_records:,}")
        logger.info(f"   总耗时: {elapsed:.2f}s")
        logger.info("=" * 50)
        
        return success_count == len(markets_to_sync)


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='站点数据同步工具。支持 --table 指定表名（适用于命名不规范的表）'
    )
    parser.add_argument('--markets', type=str, help='指定市场（逗号分隔），如: sg,id,my')
    parser.add_argument('--table', '-t', type=str, help='指定单个表（格式 database.table），可多次使用')
    parser.add_argument('--tables', type=str, help='指定多个表，逗号分隔（如 db.t1,db.t2）')
    parser.add_argument('--workers', type=int, default=4, help='并行线程数')
    
    args = parser.parse_args()
    
    # 指定表名模式
    if args.table or args.tables:
        tables_str = args.table or args.tables
        table_list = [t.strip() for t in tables_str.split(',') if t.strip() and '.' in t]
        if not table_list:
            logger.error('❌ 未提供有效的表名（格式: database.table）')
            exit(1)
        syncer = StationSync()
        if not syncer.test_connections():
            exit(1)
        success_count = 0
        for tbl in table_list:
            parts = tbl.split('.')
            if len(parts) != 2:
                logger.error(f'❌ 表名格式错误: {tbl}')
                continue
            db, name = parts
            source_table = tbl
            target_table = f"{syncer.target['database']}.{name}"
            ok, cnt = syncer.sync_market_by_table(source_table, target_table)
            if ok:
                success_count += 1
        exit(0 if success_count == len(table_list) else 1)
    
    # 市场模式（默认）
    markets = None
    if args.markets:
        markets = [m.strip().lower() for m in args.markets.split(',')]
    
    syncer = StationSync()
    success = syncer.sync_all(markets=markets, max_workers=args.workers)
    exit(0 if success else 1)


if __name__ == '__main__':
    main()

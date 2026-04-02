#!/usr/bin/env python3
"""
测试在内网环境直接连接LIVE获取DDL
尝试不同的端口和协议
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ck_sync.core.clickhouse_client import ClickHouseClient
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def test_live_connection():
    """测试LIVE环境连接（尝试多个端口）"""
    
    logger.info("=" * 80)
    logger.info("测试LIVE环境连接（内网）")
    logger.info("=" * 80)
    
    live_host = '10.180.129.96'  # ONLINE2
    live_user = 'spx_mart'
    live_password = 'RtL3jHWkDoHp'
    live_database = 'spx_mart_manage_app'
    
    # 要测试的表
    test_table = 'dim_spx_station_tab_br_all'
    full_table = f'{live_database}.{test_table}'
    
    # 尝试不同的端口配置
    configs = [
        {'port': 8123, 'use_https': False, 'name': 'HTTP 8123'},
        {'port': 9000, 'use_https': False, 'name': 'Native 9000'},
        {'port': 443, 'use_https': True, 'name': 'HTTPS 443'},
    ]
    
    for config in configs:
        logger.info(f"\n{'='*80}")
        logger.info(f"尝试配置: {config['name']}")
        logger.info(f"{'='*80}")
        
        try:
            client_config = {
                'host': live_host,
                'port': config['port'],
                'user': live_user,
                'password': live_password,
                'database': live_database,
                'show_sql': False,
                'use_https': config['use_https']
            }
            
            logger.info(f"创建客户端: {live_host}:{config['port']} (HTTPS={config['use_https']})")
            client = ClickHouseClient(**client_config)
            
            # 测试连接
            logger.info("测试连接...")
            if client.test_connection():
                logger.info("✅ 连接成功!")
                
                # 尝试获取表DDL
                logger.info(f"\n尝试获取表 {full_table} 的DDL...")
                ddl = client.get_create_table_ddl(full_table)
                
                if ddl:
                    logger.info("\n🎉 成功获取DDL!")
                    logger.info("-" * 80)
                    logger.info(ddl[:500] + "..." if len(ddl) > 500 else ddl)
                    logger.info("-" * 80)
                    
                    # 分析DDL
                    logger.info("\n📊 DDL分析:")
                    if 'ON CLUSTER' in ddl:
                        logger.info("  ✅ 包含 ON CLUSTER")
                    if 'ENGINE = Distributed' in ddl:
                        logger.info("  ✅ 包含 Distributed 引擎")
                    if 'ENGINE = MergeTree' in ddl:
                        logger.info("  ✅ 包含 MergeTree 引擎")
                    if 'ORDER BY' in ddl:
                        logger.info("  ✅ 包含 ORDER BY")
                    if 'PARTITION BY' in ddl:
                        logger.info("  ✅ 包含 PARTITION BY")
                    
                    logger.info(f"\n✅ 配置 {config['name']} 可用!")
                    return True, config
                else:
                    logger.warning("⚠️ 连接成功但无法获取DDL")
            else:
                logger.warning("❌ 连接失败")
                
        except Exception as e:
            logger.error(f"❌ 配置 {config['name']} 失败: {e}")
    
    logger.info("\n" + "=" * 80)
    logger.error("❌ 所有配置都失败了")
    logger.info("=" * 80)
    return False, None


def main():
    """主函数"""
    
    logger.info("\n" + "=" * 80)
    logger.info("LIVE环境连接测试")
    logger.info("=" * 80)
    
    success, config = test_live_connection()
    
    logger.info("\n" + "=" * 80)
    if success:
        logger.info(f"🎉 测试成功! 可以使用配置: {config['name']}")
        logger.info("=" * 80)
        logger.info("\n✅ 现在可以使用Python脚本直接从LIVE获取完整DDL了!")
        logger.info("\n使用方法:")
        logger.info("1. 编辑 sync_with_ddl.py 中的source_config")
        logger.info(f"2. 设置 port={config['port']}, use_https={config['use_https']}")
        logger.info("3. 运行: python3 sync_with_ddl.py")
        return 0
    else:
        logger.error("❌ 测试失败! 无法连接LIVE环境")
        logger.info("=" * 80)
        logger.info("\n请检查:")
        logger.info("1. 是否在内网环境（VPN已连接）")
        logger.info("2. LIVE服务器地址是否正确: 10.180.129.96")
        logger.info("3. 用户名密码是否正确")
        logger.info("4. 防火墙是否允许连接")
        return 1


if __name__ == '__main__':
    sys.exit(main())

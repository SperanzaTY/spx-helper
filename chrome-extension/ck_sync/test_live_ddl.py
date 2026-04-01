#!/usr/bin/env python3
"""
测试从LIVE环境获取表DDL
通过TEST环境的ClickHouse使用remote()函数查询LIVE环境的system.tables
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


def test_get_ddl_from_live():
    """测试从LIVE获取表DDL"""
    
    logger.info("=" * 80)
    logger.info("测试从LIVE环境获取表DDL")
    logger.info("=" * 80)
    
    # TEST环境配置（用于执行查询）
    test_config = {
        'host': 'clickhouse-k8s-sg-prod.data-infra.shopee.io',
        'port': 443,
        'user': 'spx_mart-cluster_szsc_data_shared_online',
        'password': 'RtL3jHWkDoHp',
        'database': 'default',  # 先用default数据库
        'show_sql': True,
        'use_https': True
    }
    
    try:
        # 创建TEST环境客户端
        logger.info("\n1️⃣ 创建TEST环境客户端...")
        test_client = ClickHouseClient(**test_config)
        
        # 测试连接
        logger.info("\n2️⃣ 测试TEST环境连接...")
        if test_client.test_connection():
            logger.info("✅ TEST环境连接成功")
        else:
            logger.error("❌ TEST环境连接失败")
            return False
        
        # 先查看有哪些数据库
        logger.info("\n2.5️⃣ 查看可用的数据库...")
        sql_show_databases = "SHOW DATABASES"
        success_db, databases = test_client.query_json(sql_show_databases)
        if success_db and databases:
            logger.info(f"✅ 找到 {len(databases)} 个数据库:")
            for db in databases[:10]:  # 只显示前10个
                logger.info(f"  - {db.get('name', '')}")
        
        # LIVE环境参数
        live_host = '10.180.129.96'  # ONLINE2
        live_user = 'spx_mart'
        live_password = 'RtL3jHWkDoHp'
        
        # 要查询的表
        test_database = 'spx_mart_manage_app'
        test_table = 'dim_spx_station_tab_br_all'
        
        logger.info(f"\n3️⃣ 从LIVE环境获取表DDL...")
        logger.info(f"   LIVE服务器: {live_host}")
        logger.info(f"   表: {test_database}.{test_table}")
        
        # 方法1: 直接连接LIVE环境获取DDL
        logger.info("\n--- 方法1: 直接连接LIVE获取DDL ---")
        live_config = {
            'host': live_host,
            'port': 443,
            'user': live_user,
            'password': live_password,
            'database': test_database,
            'show_sql': True,
            'use_https': True
        }
        
        live_client = ClickHouseClient(**live_config)
        
        # 测试LIVE连接
        if live_client.test_connection():
            logger.info("✅ LIVE环境连接成功")
            
            # 获取DDL
            ddl = live_client.get_create_table_ddl(f'{test_database}.{test_table}')
            
            if ddl:
                logger.info("\n✅ 方法1成功获取DDL:")
                logger.info("-" * 80)
                logger.info(ddl)
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
                if 'SETTINGS' in ddl:
                    logger.info("  ✅ 包含 SETTINGS")
                    
                return True
            else:
                logger.error("❌ 方法1失败: 无法获取DDL")
        else:
            logger.error("❌ LIVE环境连接失败")
        
        # 方法2: 通过remote查询system.tables
        logger.info("\n--- 方法2: 通过remote查询system.tables ---")
        sql_method1 = f"""
        SELECT create_table_query 
        FROM remote(
          '{live_host}',
          'system.tables',
          '{live_user}',
          '{live_password}'
        )
        WHERE database = '{test_database}' AND name = '{test_table}'
        LIMIT 1
        """
        
        logger.info("执行SQL:")
        logger.info(sql_method1)
        
        success, result = test_client.query_json(sql_method1)
        
        if success and result and len(result) > 0:
            ddl = result[0].get('create_table_query', '')
            logger.info("\n✅ 方法1成功获取DDL:")
            logger.info("-" * 80)
            logger.info(ddl)
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
            if 'SETTINGS' in ddl:
                logger.info("  ✅ 包含 SETTINGS")
                
            return True
        else:
            logger.error(f"❌ 方法1失败: {result}")
            
            # 尝试方法2: 通过remote直接SHOW CREATE TABLE
            logger.info("\n--- 方法2: 通过remote直接SHOW CREATE TABLE ---")
            sql_method2 = f"""
            SELECT * FROM remote(
              '{live_host}',
              'system.tables',
              '{live_user}',
              '{live_password}'
            )
            WHERE database = '{test_database}' AND name LIKE '%br%'
            LIMIT 5
            """
            
            logger.info("执行SQL（查看表列表）:")
            logger.info(sql_method2)
            
            success2, result2 = test_client.query_json(sql_method2)
            
            if success2 and result2:
                logger.info(f"\n✅ 找到 {len(result2)} 个表:")
                for row in result2:
                    logger.info(f"  - {row.get('database')}.{row.get('name')}")
            else:
                logger.error(f"❌ 方法2也失败: {result2}")
            
            return False
            
    except Exception as e:
        logger.error(f"❌ 测试失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False


def main():
    """主函数"""
    
    logger.info("\n" + "=" * 80)
    logger.info("从LIVE获取表DDL测试")
    logger.info("=" * 80)
    
    success = test_get_ddl_from_live()
    
    logger.info("\n" + "=" * 80)
    if success:
        logger.info("🎉 测试成功! 可以从LIVE获取表DDL")
    else:
        logger.error("❌ 测试失败! 无法从LIVE获取表DDL")
    logger.info("=" * 80)
    
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())

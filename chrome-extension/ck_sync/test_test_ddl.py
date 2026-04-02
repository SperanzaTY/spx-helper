#!/usr/bin/env python3
"""
测试从TEST环境获取表DDL
验证get_create_table_ddl方法是否正常工作
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


def main():
    """测试从TEST环境获取表DDL"""
    
    logger.info("=" * 80)
    logger.info("测试从TEST环境获取表DDL")
    logger.info("=" * 80)
    
    # TEST环境配置
    test_config = {
        'host': 'clickhouse-k8s-sg-prod.data-infra.shopee.io',
        'port': 443,
        'user': 'spx_mart-cluster_szsc_data_shared_online',
        'password': 'RtL3jHWkDoHp',
        'database': 'spx_mart_pub',  # 使用存在的数据库
        'show_sql': True,
        'use_https': True
    }
    
    try:
        # 创建客户端
        logger.info("\n1️⃣ 创建TEST环境客户端...")
        client = ClickHouseClient(**test_config)
        
        # 测试连接
        logger.info("\n2️⃣ 测试连接...")
        if not client.test_connection():
            logger.error("❌ 连接失败")
            return 1
        logger.info("✅ 连接成功")
        
        # 查看表列表
        logger.info("\n3️⃣ 查看表列表...")
        sql = "SHOW TABLES FROM spx_mart_pub LIMIT 5"
        success, tables = client.query_json(sql)
        
        if success and tables:
            logger.info(f"✅ 找到 {len(tables)} 个表:")
            for table in tables:
                table_name = table.get('name', '')
                logger.info(f"  - {table_name}")
            
            # 尝试获取第一个正常的表的DDL（跳过internal表）
            normal_table = None
            for table in tables:
                table_name = table.get('name', '')
                if not table_name.startswith('.inner'):
                    normal_table = table_name
                    break
            
            if normal_table:
                full_table_name = f'spx_mart_pub.{normal_table}'
                
                logger.info(f"\n4️⃣ 获取表 {full_table_name} 的DDL...")
                ddl = client.get_create_table_ddl(full_table_name)
                
                if ddl:
                    logger.info("\n✅ 成功获取DDL:")
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
                    
                    logger.info("\n✅ 测试成功！可以获取TEST环境的表DDL")
                    return 0
                else:
                    logger.error("❌ 无法获取DDL")
                    return 1
        else:
            logger.error(f"❌ 无法获取表列表: {tables}")
            return 1
            
    except Exception as e:
        logger.error(f"❌ 测试失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return 1


if __name__ == '__main__':
    sys.exit(main())

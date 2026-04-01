#!/usr/bin/env python3
"""
测试DDL获取功能
验证能否正确获取和修改表的DDL
"""

import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ck_sync.core.clickhouse_client import ClickHouseClient
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def test_get_ddl():
    """测试获取DDL"""
    
    # 配置数据库连接
    config = {
        'host': '10.180.129.96',  # ONLINE2
        'port': 443,
        'user': 'spx_mart',
        'password': 'RtL3jHWkDoHp',
        'database': 'spx_mart_manage_app',
        'show_sql': True,
        'use_https': True
    }
    
    logger.info("=" * 80)
    logger.info("测试DDL获取功能")
    logger.info("=" * 80)
    
    try:
        # 创建客户端
        client = ClickHouseClient(**config)
        
        # 测试连接
        logger.info("\n1️⃣  测试数据库连接...")
        if client.test_connection():
            logger.info("✅ 连接成功")
        else:
            logger.error("❌ 连接失败")
            return False
        
        # 测试表
        test_table = 'spx_mart_manage_app.dim_spx_station_tab_br_all'
        
        # 检查表是否存在
        logger.info(f"\n2️⃣  检查表是否存在: {test_table}")
        if client.table_exists(test_table):
            logger.info("✅ 表存在")
        else:
            logger.error("❌ 表不存在")
            return False
        
        # 获取表信息
        logger.info(f"\n3️⃣  获取表基本信息...")
        info = client.get_table_info(test_table)
        if info:
            logger.info(f"✅ 数据库: {info['database']}")
            logger.info(f"✅ 表名: {info['table']}")
            logger.info(f"✅ 列数: {info['column_count']}")
            logger.info(f"✅ 前5列: {', '.join(info['column_names'][:5])}")
        
        # 获取引擎信息
        logger.info(f"\n4️⃣  获取表引擎信息...")
        engine_info = client.get_table_engine_info(test_table)
        if engine_info:
            logger.info(f"✅ 引擎: {engine_info.get('engine')}")
            logger.info(f"✅ 引擎完整: {engine_info.get('engine_full')}")
            if engine_info.get('sorting_key'):
                logger.info(f"✅ 排序键: {engine_info['sorting_key']}")
            if engine_info.get('partition_key'):
                logger.info(f"✅ 分区键: {engine_info['partition_key']}")
        
        # 获取完整DDL
        logger.info(f"\n5️⃣  获取完整DDL...")
        ddl = client.get_create_table_ddl(test_table)
        
        if ddl:
            logger.info("✅ DDL获取成功")
            logger.info("\n" + "=" * 80)
            logger.info("完整DDL:")
            logger.info("=" * 80)
            logger.info(ddl)
            logger.info("=" * 80)
            
            # 分析DDL
            logger.info(f"\n6️⃣  分析DDL内容...")
            if 'ON CLUSTER' in ddl:
                logger.info("✅ 检测到集群配置 (ON CLUSTER)")
            if 'ENGINE = Distributed' in ddl:
                logger.info("✅ 检测到分布式引擎 (Distributed)")
            if 'ORDER BY' in ddl:
                logger.info("✅ 检测到排序键 (ORDER BY)")
            if 'PARTITION BY' in ddl:
                logger.info("✅ 检测到分区键 (PARTITION BY)")
            
            return True
        else:
            logger.error("❌ DDL获取失败")
            return False
            
    except Exception as e:
        logger.error(f"❌ 测试失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False


def test_modify_ddl():
    """测试DDL修改功能"""
    
    logger.info("\n" + "=" * 80)
    logger.info("测试DDL修改功能")
    logger.info("=" * 80)
    
    # 模拟DDL
    original_ddl = """CREATE TABLE spx_mart_manage_app.dim_spx_driver_tab_br_all ON CLUSTER cluster_szsc_spx_mart_online_2
(
    driver_id Int64,
    driver_name String,
    phone String,
    status Int32
)
ENGINE = Distributed('cluster_szsc_spx_mart_online_2', 'spx_mart_manage_app', 'dim_spx_driver_tab_br_local', xxHash64(driver_id))
"""
    
    logger.info("\n原始DDL:")
    logger.info("-" * 80)
    logger.info(original_ddl)
    logger.info("-" * 80)
    
    # 配置客户端（用于调用_modify_ddl_for_target方法）
    config = {
        'host': 'test',
        'port': 443,
        'user': 'test',
        'password': 'test',
        'database': 'test',
        'use_https': True
    }
    
    client = ClickHouseClient(**config)
    
    # 测试修改DDL
    source_table = 'spx_mart_manage_app.dim_spx_driver_tab_br_all'
    target_table = 'spx_mart_manage_app.dim_spx_driver_tab_br_all'
    
    logger.info(f"\n修改参数:")
    logger.info(f"  源表: {source_table}")
    logger.info(f"  目标表: {target_table}")
    logger.info(f"  目标集群: None (TEST环境)")
    
    modified_ddl = client._modify_ddl_for_target(
        original_ddl,
        source_table,
        target_table,
        target_cluster=None  # TEST环境不使用集群
    )
    
    if modified_ddl:
        logger.info("\n✅ DDL修改成功")
        logger.info("\n修改后的DDL:")
        logger.info("-" * 80)
        logger.info(modified_ddl)
        logger.info("-" * 80)
        
        # 验证修改
        logger.info("\n验证修改:")
        if 'ON CLUSTER' not in modified_ddl:
            logger.info("✅ 已移除 ON CLUSTER 子句")
        else:
            logger.warning("⚠️  ON CLUSTER 子句未移除")
        
        if target_table in modified_ddl:
            logger.info("✅ 表名已替换")
        else:
            logger.warning("⚠️  表名未替换")
        
        return True
    else:
        logger.error("❌ DDL修改失败")
        return False


def main():
    """主函数"""
    
    logger.info("\n" + "=" * 80)
    logger.info("ClickHouse DDL 功能测试")
    logger.info("=" * 80)
    
    # 测试1: 获取DDL
    test1_success = test_get_ddl()
    
    # 测试2: 修改DDL
    test2_success = test_modify_ddl()
    
    # 总结
    logger.info("\n" + "=" * 80)
    logger.info("测试总结")
    logger.info("=" * 80)
    logger.info(f"1. DDL获取测试: {'✅ 通过' if test1_success else '❌ 失败'}")
    logger.info(f"2. DDL修改测试: {'✅ 通过' if test2_success else '❌ 失败'}")
    
    if test1_success and test2_success:
        logger.info("\n🎉 所有测试通过!")
        return 0
    else:
        logger.error("\n❌ 部分测试失败")
        return 1


if __name__ == '__main__':
    sys.exit(main())

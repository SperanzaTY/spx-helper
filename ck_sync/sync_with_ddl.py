#!/usr/bin/env python3
"""
ClickHouse 完整DDL同步脚本
使用源表的完整DDL来重建目标表，保证性能和结构完全一致
"""

import sys
import os
import logging
from typing import Dict, Any, Optional

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ck_sync.core.clickhouse_client import ClickHouseClient


# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TableSyncWithDDL:
    """使用完整DDL的表同步工具"""
    
    def __init__(self, source_config: Dict[str, Any], target_config: Dict[str, Any]):
        """
        初始化同步工具
        
        Args:
            source_config: 源数据库配置 {host, port, user, password, database, use_https}
            target_config: 目标数据库配置
        """
        self.source_client = ClickHouseClient(**source_config)
        self.target_client = ClickHouseClient(**target_config)
        
        logger.info(f"✅ 源数据库连接初始化: {source_config['host']}:{source_config['port']}")
        logger.info(f"✅ 目标数据库连接初始化: {target_config['host']}:{target_config['port']}")
    
    def sync_table(self, source_table: str, target_table: Optional[str] = None,
                   drop_cluster: Optional[str] = None,
                   create_cluster: Optional[str] = None,
                   source_remote_ip: Optional[str] = None,
                   source_remote_user: Optional[str] = None,
                   source_remote_password: Optional[str] = None) -> bool:
        """
        同步单个表（完整DDL + 数据）
        
        Args:
            source_table: 源表名（格式：database.table）
            target_table: 目标表名（默认与源表相同）
            drop_cluster: 删除表时使用的集群名
            create_cluster: 创建表时使用的集群名
            source_remote_ip: 源数据库IP（用于remote()函数）
            source_remote_user: 源数据库用户名（用于remote()函数）
            source_remote_password: 源数据库密码（用于remote()函数）
        
        Returns:
            bool: 是否成功
        """
        target_table = target_table or source_table
        
        logger.info("=" * 80)
        logger.info(f"🚀 开始同步表:")
        logger.info(f"   源表: {source_table}")
        logger.info(f"   目标表: {target_table}")
        logger.info("=" * 80)
        
        try:
            # 步骤1: 使用完整DDL重建表结构
            logger.info("\n📋 步骤1/2: 重建表结构（使用完整DDL）")
            success, message = self.target_client.recreate_table_with_ddl(
                source_table=source_table,
                target_table=target_table,
                source_client=self.source_client,
                drop_cluster=drop_cluster,
                create_cluster=create_cluster
            )
            
            if not success:
                logger.error(f"❌ 表结构重建失败: {message}")
                return False
            
            logger.info(f"✅ 表结构重建成功")
            
            # 步骤2: 同步数据
            logger.info("\n📦 步骤2/2: 同步数据")
            
            if source_remote_ip and source_remote_user and source_remote_password:
                # 使用remote()函数直接同步数据
                success, message = self._sync_data_via_remote(
                    source_table=source_table,
                    target_table=target_table,
                    source_ip=source_remote_ip,
                    source_user=source_remote_user,
                    source_password=source_remote_password
                )
            else:
                # 跳过数据同步（只重建表结构）
                logger.warning("⚠️  未提供remote()函数参数，跳过数据同步")
                success = True
                message = "仅重建表结构，未同步数据"
            
            if not success:
                logger.error(f"❌ 数据同步失败: {message}")
                return False
            
            logger.info(f"✅ 数据同步成功")
            
            # 验证结果
            logger.info("\n🔍 验证同步结果:")
            self._validate_sync(target_table)
            
            logger.info("\n" + "=" * 80)
            logger.info("🎉 表同步完成!")
            logger.info("=" * 80)
            
            return True
            
        except Exception as e:
            logger.error(f"❌ 同步过程中发生异常: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    def _sync_data_via_remote(self, source_table: str, target_table: str,
                              source_ip: str, source_user: str, 
                              source_password: str) -> tuple:
        """
        使用remote()函数同步数据
        
        Args:
            source_table: 源表名
            target_table: 目标表名
            source_ip: 源数据库IP
            source_user: 源数据库用户名
            source_password: 源数据库密码
        
        Returns:
            Tuple[bool, str]: (是否成功, 消息)
        """
        try:
            # 构建INSERT语句
            insert_sql = f"""
            INSERT INTO {target_table}
            SELECT * FROM remote(
                '{source_ip}',
                '{source_table}',
                '{source_user}',
                '{source_password}'
            )
            """
            
            logger.info(f"📥 从 {source_ip} 同步数据...")
            success, message = self.target_client.execute(insert_sql, timeout=600)
            
            if success:
                return True, "数据同步成功"
            else:
                return False, f"数据同步失败: {message}"
                
        except Exception as e:
            return False, f"数据同步异常: {str(e)}"
    
    def _validate_sync(self, table: str):
        """
        验证同步结果
        
        Args:
            table: 表名
        """
        try:
            # 检查表是否存在
            if not self.target_client.table_exists(table):
                logger.warning(f"⚠️  表 {table} 不存在")
                return
            
            # 获取行数
            count = self.target_client.get_table_count(table)
            logger.info(f"   表 {table} 行数: {count:,}")
            
            # 获取表信息
            info = self.target_client.get_table_info(table)
            if info:
                logger.info(f"   列数: {info['column_count']}")
                logger.info(f"   列名: {', '.join(info['column_names'][:5])}...")
            
            # 获取引擎信息
            engine_info = self.target_client.get_table_engine_info(table)
            if engine_info:
                logger.info(f"   引擎: {engine_info.get('engine', 'Unknown')}")
                if engine_info.get('sorting_key'):
                    logger.info(f"   排序键: {engine_info['sorting_key']}")
                if engine_info.get('partition_key'):
                    logger.info(f"   分区键: {engine_info['partition_key']}")
            
        except Exception as e:
            logger.warning(f"⚠️  验证失败: {e}")


def main():
    """主函数 - 演示如何使用"""
    
    # ========== 配置部分 ==========
    
    # 源数据库配置（LIVE环境 - ONLINE6或ONLINE2）
    source_config = {
        'host': '10.180.129.96',  # ONLINE2
        'port': 443,
        'user': 'spx_mart',
        'password': 'RtL3jHWkDoHp',
        'database': 'spx_mart_manage_app',
        'show_sql': False,
        'use_https': True
    }
    
    # 目标数据库配置（TEST环境）
    target_config = {
        'host': 'clickhouse-k8s-sg-prod.data-infra.shopee.io',
        'port': 443,
        'user': 'spx_mart-cluster_szsc_data_shared_online',
        'password': 'RtL3jHWkDoHp',
        'database': 'spx_mart_manage_app',
        'show_sql': False,
        'use_https': True
    }
    
    # 要同步的表
    source_table = 'spx_mart_manage_app.dim_spx_station_tab_br_all'
    target_table = 'spx_mart_manage_app.dim_spx_station_tab_br_all'
    
    # 集群配置（如果是分布式表）
    # drop_cluster = 'cluster_szsc_data_shared_online'  # 删除时使用的集群
    # create_cluster = 'cluster_szsc_data_shared_online'  # 创建时使用的集群
    drop_cluster = None  # TEST环境通常不使用集群
    create_cluster = None
    
    # remote()函数的参数（用于数据同步）
    source_remote_ip = '10.180.129.96'  # 源数据库IP
    source_remote_user = 'spx_mart'
    source_remote_password = 'RtL3jHWkDoHp'
    
    # ========== 执行同步 ==========
    
    syncer = TableSyncWithDDL(source_config, target_config)
    
    success = syncer.sync_table(
        source_table=source_table,
        target_table=target_table,
        drop_cluster=drop_cluster,
        create_cluster=create_cluster,
        source_remote_ip=source_remote_ip,
        source_remote_user=source_remote_user,
        source_remote_password=source_remote_password
    )
    
    if success:
        logger.info("\n✅ 所有操作完成!")
        return 0
    else:
        logger.error("\n❌ 同步失败!")
        return 1


if __name__ == '__main__':
    sys.exit(main())

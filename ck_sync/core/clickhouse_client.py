"""
ClickHouse HTTP 客户端
支持 HTTP/HTTPS 连接，提供统一的查询和执行接口
"""

import requests
import logging
from typing import Tuple, List, Dict, Any, Optional


class ClickHouseClient:
    """ClickHouse HTTP 客户端"""
    
    def __init__(self, host: str, port: int, user: str, password: str, 
                 database: str = 'default', show_sql: bool = False, 
                 use_https: bool = False):
        """
        初始化 ClickHouse 连接
        
        Args:
            host: 服务器地址
            port: 端口号
            user: 用户名
            password: 密码
            database: 数据库名
            show_sql: 是否显示 SQL 日志
            use_https: 是否使用 HTTPS
        """
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.database = database
        self.show_sql = show_sql
        self.logger = logging.getLogger("ClickHouseClient")
        
        # 构建连接 URL
        protocol = "https" if use_https else "http"
        self.url = f"{protocol}://{host}:{port}/"
        
        self.logger.info(f"初始化 ClickHouse 连接: {protocol}://{host}:{port}/{database}")
    
    def _execute(self, sql: str, timeout: int = 30, 
                 params: Optional[Dict[str, Any]] = None) -> requests.Response:
        """
        执行 SQL 语句
        
        Args:
            sql: SQL 语句
            timeout: 超时时间（秒）
            params: 额外的查询参数
        
        Returns:
            requests.Response: HTTP 响应对象
        """
        query_params = {
            'user': self.user,
            'password': self.password,
            'database': self.database
        }
        
        if params:
            query_params.update(params)
        
        headers = {
            "Content-Type": "application/json; charset=UTF-8"
        }
        
        if self.show_sql:
            # 截断过长的 SQL
            display_sql = sql if len(sql) <= 500 else sql[:500] + "..."
            self.logger.debug(f"执行 SQL: {display_sql}")
        
        try:
            response = requests.post(
                self.url,
                params=query_params,
                headers=headers,
                data=sql.encode('utf-8'),
                timeout=timeout
            )
            
            if response.status_code != 200:
                self.logger.error(
                    f"SQL 执行失败 (状态码: {response.status_code})\n"
                    f"SQL: {sql[:200]}...\n"
                    f"响应: {response.text[:500]}"
                )
            
            return response
            
        except requests.exceptions.Timeout:
            self.logger.error(f"请求超时 (timeout={timeout}s): {self.url}")
            raise
        except requests.exceptions.ConnectionError as e:
            self.logger.error(f"连接错误: {self.url} - {e}")
            raise
        except Exception as e:
            self.logger.error(f"未知错误: {e}")
            raise
    
    def query_json(self, sql: str, timeout: int = 30) -> Tuple[bool, List[Dict[str, Any]]]:
        """
        执行查询并返回 JSON 格式结果
        
        Args:
            sql: SQL 查询语句
            timeout: 超时时间（秒）
        
        Returns:
            Tuple[bool, List[Dict]]: (是否成功, 数据列表)
        """
        # 确保 SQL 以 FORMAT JSON 结尾
        sql = sql.rstrip().rstrip(";")
        if "FORMAT" not in sql.upper():
            sql += " FORMAT JSON"
        
        try:
            response = self._execute(sql, timeout=timeout)
            
            if response.status_code == 200:
                data = response.json()
                return True, data.get('data', [])
            else:
                return False, []
                
        except Exception as e:
            self.logger.error(f"查询失败: {e}")
            return False, []
    
    def execute(self, sql: str, timeout: int = 30) -> Tuple[bool, str]:
        """
        执行 SQL 语句（INSERT, CREATE, ALTER 等）
        
        Args:
            sql: SQL 语句
            timeout: 超时时间（秒）
        
        Returns:
            Tuple[bool, str]: (是否成功, 响应消息)
        """
        try:
            response = self._execute(sql, timeout=timeout)
            
            if response.status_code == 200:
                return True, response.text
            else:
                return False, response.text
                
        except Exception as e:
            self.logger.error(f"执行失败: {e}")
            return False, str(e)
    
    def query_single_value(self, sql: str, timeout: int = 30) -> Optional[Any]:
        """
        查询单个值（例如 COUNT、MAX 等）
        
        Args:
            sql: SQL 查询语句
            timeout: 超时时间（秒）
        
        Returns:
            Any: 查询结果（单个值）
        """
        success, data = self.query_json(sql, timeout=timeout)
        
        if success and data and len(data) > 0:
            # 返回第一行的第一个字段值
            first_row = data[0]
            return list(first_row.values())[0] if first_row else None
        
        return None
    
    def test_connection(self) -> bool:
        """
        测试连接是否正常
        
        Returns:
            bool: 连接是否成功
        """
        try:
            result = self.query_single_value("SELECT 1")
            return result == 1
        except Exception as e:
            self.logger.error(f"连接测试失败: {e}")
            return False
    
    def get_table_info(self, table: str) -> Optional[Dict[str, Any]]:
        """
        获取表信息
        
        Args:
            table: 表名（格式：database.table）
        
        Returns:
            Dict: 表信息（列名、类型等）
        """
        parts = table.split('.')
        if len(parts) != 2:
            self.logger.error(f"表名格式错误，应为 database.table: {table}")
            return None
        
        database, table_name = parts
        
        sql = f"""
        SELECT 
            name,
            type,
            position
        FROM system.columns
        WHERE database = '{database}' AND table = '{table_name}'
        ORDER BY position
        """
        
        success, columns = self.query_json(sql)
        
        if success and columns:
            return {
                'database': database,
                'table': table_name,
                'columns': columns,
                'column_names': [col['name'] for col in columns],
                'column_count': len(columns)
            }
        
        return None
    
    def table_exists(self, table: str) -> bool:
        """
        检查表是否存在
        
        Args:
            table: 表名（格式：database.table）
        
        Returns:
            bool: 表是否存在
        """
        parts = table.split('.')
        if len(parts) != 2:
            return False
        
        database, table_name = parts
        
        sql = f"""
        SELECT count() 
        FROM system.tables 
        WHERE database = '{database}' AND name = '{table_name}'
        """
        
        count = self.query_single_value(sql)
        return count == 1
    
    def get_table_count(self, table: str, timeout: int = 30) -> Optional[int]:
        """
        获取表的行数
        
        Args:
            table: 表名（格式：database.table）
            timeout: 超时时间（秒）
        
        Returns:
            int: 表的行数
        """
        sql = f"SELECT count() as cnt FROM {table}"
        count = self.query_single_value(sql, timeout=timeout)
        return count if count is not None else 0
    
    def get_create_table_ddl(self, table: str) -> Optional[str]:
        """
        获取表的完整 CREATE TABLE DDL 语句
        
        Args:
            table: 表名（格式：database.table）
        
        Returns:
            str: CREATE TABLE DDL 语句
        """
        parts = table.split('.')
        if len(parts) != 2:
            self.logger.error(f"表名格式错误，应为 database.table: {table}")
            return None
        
        database, table_name = parts
        
        # 查询表的 DDL
        sql = f"SHOW CREATE TABLE {database}.{table_name}"
        
        try:
            response = self._execute(sql, timeout=10)
            
            if response.status_code == 200:
                # 响应格式: "statement\n"
                ddl = response.text.strip()
                return ddl
            else:
                self.logger.error(f"获取表 DDL 失败: {response.text}")
                return None
                
        except Exception as e:
            self.logger.error(f"获取表 DDL 失败: {e}")
            return None
    
    def get_table_engine_info(self, table: str) -> Optional[Dict[str, Any]]:
        """
        获取表的引擎信息
        
        Args:
            table: 表名（格式：database.table）
        
        Returns:
            Dict: 引擎信息（engine, order_by, partition_by等）
        """
        parts = table.split('.')
        if len(parts) != 2:
            self.logger.error(f"表名格式错误，应为 database.table: {table}")
            return None
        
        database, table_name = parts
        
        sql = f"""
        SELECT 
            engine,
            engine_full,
            create_table_query,
            partition_key,
            sorting_key,
            primary_key,
            sampling_key
        FROM system.tables
        WHERE database = '{database}' AND name = '{table_name}'
        """
        
        success, data = self.query_json(sql)
        
        if success and data and len(data) > 0:
            return data[0]
        
        return None
    
    def recreate_table_with_ddl(self, source_table: str, target_table: str, 
                                source_client: 'ClickHouseClient',
                                drop_cluster: Optional[str] = None,
                                create_cluster: Optional[str] = None) -> Tuple[bool, str]:
        """
        使用完整DDL重建表（DROP + CREATE）
        
        Args:
            source_table: 源表名（格式：database.table）
            target_table: 目标表名（格式：database.table）
            source_client: 源数据库客户端
            drop_cluster: 删除表时使用的集群名（如果是分布式表）
            create_cluster: 创建表时使用的集群名（如果是分布式表）
        
        Returns:
            Tuple[bool, str]: (是否成功, 消息)
        """
        try:
            # 1. 从源获取完整DDL
            self.logger.info(f"📥 从源获取表 {source_table} 的DDL...")
            source_ddl = source_client.get_create_table_ddl(source_table)
            
            if not source_ddl:
                return False, "无法获取源表DDL"
            
            self.logger.debug(f"原始DDL:\n{source_ddl}")
            
            # 2. 解析和修改DDL
            self.logger.info("🔧 修改DDL以适配目标环境...")
            modified_ddl = self._modify_ddl_for_target(
                source_ddl, source_table, target_table, create_cluster
            )
            
            if not modified_ddl:
                return False, "DDL修改失败"
            
            self.logger.debug(f"修改后的DDL:\n{modified_ddl}")
            
            # 3. 删除目标表（如果存在）
            parts = target_table.split('.')
            if len(parts) != 2:
                return False, f"目标表名格式错误: {target_table}"
            
            target_db, target_name = parts
            
            # 构建DROP语句
            if drop_cluster:
                drop_sql = f"DROP TABLE IF EXISTS {target_db}.{target_name} ON CLUSTER {drop_cluster}"
            else:
                drop_sql = f"DROP TABLE IF EXISTS {target_db}.{target_name}"
            
            self.logger.info(f"🗑️  删除旧表: {target_table}")
            success, message = self.execute(drop_sql, timeout=60)
            
            if not success:
                self.logger.warning(f"删除表失败（可能不存在）: {message}")
                # 继续执行，表可能本来就不存在
            
            # 4. 使用修改后的DDL创建新表
            self.logger.info(f"🏗️  使用完整DDL创建新表: {target_table}")
            success, message = self.execute(modified_ddl, timeout=120)
            
            if not success:
                return False, f"创建表失败: {message}"
            
            self.logger.info(f"✅ 表 {target_table} 重建成功")
            return True, "表重建成功"
            
        except Exception as e:
            error_msg = f"重建表失败: {str(e)}"
            self.logger.error(error_msg)
            return False, error_msg
    
    def _modify_ddl_for_target(self, ddl: str, source_table: str, 
                               target_table: str, target_cluster: Optional[str] = None) -> Optional[str]:
        """
        修改DDL以适配目标环境
        
        主要修改:
        1. 替换表名
        2. 移除或替换集群配置（ON CLUSTER）
        3. 处理分布式表引擎的集群参数
        
        Args:
            ddl: 原始DDL语句
            source_table: 源表名
            target_table: 目标表名
            target_cluster: 目标集群名（如果需要）
        
        Returns:
            str: 修改后的DDL
        """
        import re
        
        try:
            # 提取源表的database和table名称
            source_parts = source_table.split('.')
            if len(source_parts) != 2:
                self.logger.error(f"源表名格式错误: {source_table}")
                return None
            
            source_db, source_name = source_parts
            
            # 提取目标表的database和table名称
            target_parts = target_table.split('.')
            if len(target_parts) != 2:
                self.logger.error(f"目标表名格式错误: {target_table}")
                return None
            
            target_db, target_name = target_parts
            
            modified_ddl = ddl
            
            # 1. 替换表名
            # 处理 CREATE TABLE database.table
            modified_ddl = re.sub(
                rf'CREATE TABLE\s+{re.escape(source_db)}\.{re.escape(source_name)}',
                f'CREATE TABLE {target_db}.{target_name}',
                modified_ddl,
                flags=re.IGNORECASE
            )
            
            # 2. 处理 ON CLUSTER 子句
            if target_cluster:
                # 替换为目标集群
                modified_ddl = re.sub(
                    r'ON CLUSTER\s+\S+',
                    f'ON CLUSTER {target_cluster}',
                    modified_ddl,
                    flags=re.IGNORECASE
                )
            else:
                # 移除ON CLUSTER子句（测试环境通常不需要集群）
                modified_ddl = re.sub(
                    r'ON CLUSTER\s+\S+\s*',
                    '',
                    modified_ddl,
                    flags=re.IGNORECASE
                )
            
            # 3. 处理Distributed引擎中的集群名称
            # ENGINE = Distributed('cluster_name', 'database', 'table', ...)
            if target_cluster and 'ENGINE = Distributed' in modified_ddl:
                modified_ddl = re.sub(
                    r"ENGINE\s*=\s*Distributed\s*\(\s*'([^']+)'",
                    f"ENGINE = Distributed('{target_cluster}'",
                    modified_ddl,
                    flags=re.IGNORECASE
                )
            elif 'ENGINE = Distributed' in modified_ddl and not target_cluster:
                # 如果目标没有集群，可能需要转换为本地表
                self.logger.warning("检测到Distributed引擎，但未提供目标集群名，表可能无法正常工作")
            
            # 4. 处理表名的其他引用（如果引擎参数中引用了表名）
            # 例如: Distributed引擎中的表名参数
            modified_ddl = modified_ddl.replace(f"'{source_name}'", f"'{target_name}'")
            modified_ddl = modified_ddl.replace(f'"{source_name}"', f'"{target_name}"')
            
            return modified_ddl
            
        except Exception as e:
            self.logger.error(f"DDL修改失败: {e}")
            return None
    
    def __repr__(self) -> str:
        return f"ClickHouseClient(host={self.host}, port={self.port}, database={self.database})"


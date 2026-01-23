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
    
    def __repr__(self) -> str:
        return f"ClickHouseClient(host={self.host}, port={self.port}, database={self.database})"


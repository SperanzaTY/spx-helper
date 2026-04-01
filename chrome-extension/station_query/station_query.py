"""
站点查询核心模块
支持跨市场查询站点 ID 和名称
"""

import requests
import logging
import time
from typing import List, Dict, Any, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed


class ClickHouseClient:
    """ClickHouse HTTP 客户端"""
    
    def __init__(self, host: str, port: int, user: str, password: str, 
                 database: str = 'default', timeout: int = 30, 
                 use_https: bool = False, show_sql: bool = False):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.database = database
        self.timeout = timeout
        self.show_sql = show_sql
        
        protocol = "https" if use_https else "http"
        self.url = f"{protocol}://{host}:{port}/"
        self.logger = logging.getLogger("ClickHouseClient")
    
    def query(self, sql: str) -> Tuple[bool, List[Dict[str, Any]]]:
        """
        执行查询并返回结果
        
        Args:
            sql: SQL 查询语句
        
        Returns:
            Tuple[bool, List[Dict]]: (是否成功, 数据列表)
        """
        if self.show_sql:
            self.logger.debug(f"执行 SQL: {sql[:200]}...")
        
        # 确保 SQL 以 FORMAT JSON 结尾
        sql = sql.rstrip().rstrip(";")
        if "FORMAT" not in sql.upper():
            sql += " FORMAT JSON"
        
        try:
            response = requests.post(
                self.url,
                params={
                    'user': self.user,
                    'password': self.password,
                    'database': self.database
                },
                data=sql.encode('utf-8'),
                timeout=self.timeout
            )
            
            if response.status_code == 200:
                data = response.json()
                return True, data.get('data', [])
            else:
                self.logger.error(f"查询失败: {response.text[:500]}")
                return False, []
                
        except Exception as e:
            self.logger.error(f"查询异常: {e}")
            return False, []


class StationQuery:
    """站点查询器"""
    
    # 所有市场列表
    MARKETS = ['sg', 'id', 'my', 'th', 'ph', 'vn', 'tw', 'br']
    
    # 表名模板（TEST 环境使用 spx_mart_pub 数据库）
    TABLE_TEMPLATE = "spx_mart_pub.dim_spx_station_tab_{market}_all"
    
    def __init__(self, clickhouse_config: Dict[str, Any], 
                 markets: Optional[List[str]] = None,
                 max_workers: int = 8):
        """
        初始化站点查询器
        
        Args:
            clickhouse_config: ClickHouse 配置
            markets: 要查询的市场列表，None 表示所有市场
            max_workers: 并行查询线程数
        """
        self.client = ClickHouseClient(**clickhouse_config)
        self.markets = markets or self.MARKETS
        self.max_workers = max_workers
        self.logger = logging.getLogger("StationQuery")
        
        self.logger.info(f"初始化站点查询器: 市场={self.markets}, 并行度={max_workers}")
    
    def query_by_id(self, station_id: int, 
                    market: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        根据站点 ID 查询
        
        Args:
            station_id: 站点 ID
            market: 指定市场，None 表示查询所有市场
        
        Returns:
            List[Dict]: 查询结果列表
        """
        markets_to_query = [market] if market else self.markets
        
        self.logger.info(f"查询站点 ID: {station_id}, 市场: {markets_to_query}")
        
        start_time = time.time()
        results = []
        
        # 并行查询所有市场
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {
                executor.submit(self._query_single_market_by_id, station_id, m): m 
                for m in markets_to_query
            }
            
            for future in as_completed(futures):
                market = futures[future]
                try:
                    data = future.result()
                    if data:
                        # 添加市场字段
                        for row in data:
                            row['market'] = market
                        results.extend(data)
                except Exception as e:
                    self.logger.error(f"查询市场 {market} 失败: {e}")
        
        elapsed = time.time() - start_time
        self.logger.info(f"查询完成: 找到 {len(results)} 条记录, 耗时 {elapsed:.2f}s")
        
        return results
    
    def query_by_name(self, station_name: str, 
                      market: Optional[str] = None,
                      limit: int = 100) -> List[Dict[str, Any]]:
        """
        根据站点名称模糊搜索
        
        Args:
            station_name: 站点名称关键词
            market: 指定市场，None 表示查询所有市场
            limit: 每个市场的返回结果限制
        
        Returns:
            List[Dict]: 查询结果列表
        """
        markets_to_query = [market] if market else self.markets
        
        self.logger.info(f"搜索站点名称: {station_name}, 市场: {markets_to_query}")
        
        start_time = time.time()
        results = []
        
        # 并行查询所有市场
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {
                executor.submit(self._query_single_market_by_name, station_name, m, limit): m 
                for m in markets_to_query
            }
            
            for future in as_completed(futures):
                market = futures[future]
                try:
                    data = future.result()
                    if data:
                        # 添加市场字段
                        for row in data:
                            row['market'] = market
                        results.extend(data)
                except Exception as e:
                    self.logger.error(f"查询市场 {market} 失败: {e}")
        
        elapsed = time.time() - start_time
        self.logger.info(f"搜索完成: 找到 {len(results)} 条记录, 耗时 {elapsed:.2f}s")
        
        return results
    
    def query_batch_ids(self, station_ids: List[int],
                        market: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        批量查询多个站点 ID
        
        Args:
            station_ids: 站点 ID 列表
            market: 指定市场，None 表示查询所有市场
        
        Returns:
            List[Dict]: 查询结果列表
        """
        markets_to_query = [market] if market else self.markets
        
        self.logger.info(f"批量查询 {len(station_ids)} 个站点, 市场: {markets_to_query}")
        
        start_time = time.time()
        results = []
        
        # 并行查询所有市场
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {
                executor.submit(self._query_single_market_batch, station_ids, m): m 
                for m in markets_to_query
            }
            
            for future in as_completed(futures):
                market = futures[future]
                try:
                    data = future.result()
                    if data:
                        # 添加市场字段
                        for row in data:
                            row['market'] = market
                        results.extend(data)
                except Exception as e:
                    self.logger.error(f"查询市场 {market} 失败: {e}")
        
        elapsed = time.time() - start_time
        self.logger.info(f"批量查询完成: 找到 {len(results)} 条记录, 耗时 {elapsed:.2f}s")
        
        return results
    
    def _query_single_market_by_id(self, station_id: int, market: str) -> List[Dict[str, Any]]:
        """查询单个市场的站点 ID"""
        table = self.TABLE_TEMPLATE.format(market=market)
        
        sql = f"""
        SELECT 
            station_id,
            station_type,
            station_name,
            status,
            city_name,
            district_id,
            bi_station_type,
            latitude,
            longitude,
            manager,
            manager_email,
            director,
            director_email,
            is_active_site_l7d,
            station_region,
            station_area,
            station_sub_area,
            is_own_fleet,
            xpt_flag,
            address
        FROM {table}
        WHERE station_id = {station_id}
        LIMIT 1
        """
        
        success, data = self.client.query(sql)
        return data if success else []
    
    def _query_single_market_by_name(self, station_name: str, market: str, 
                                     limit: int) -> List[Dict[str, Any]]:
        """查询单个市场的站点名称"""
        table = self.TABLE_TEMPLATE.format(market=market)
        
        # 转义特殊字符
        station_name_escaped = station_name.replace("'", "\\'")
        
        sql = f"""
        SELECT 
            station_id,
            station_type,
            station_name,
            status,
            city_name,
            district_id,
            bi_station_type,
            latitude,
            longitude,
            manager,
            manager_email,
            director,
            director_email,
            is_active_site_l7d,
            station_region,
            station_area,
            station_sub_area,
            is_own_fleet,
            xpt_flag,
            address
        FROM {table}
        WHERE station_name ILIKE '%{station_name_escaped}%'
        LIMIT {limit}
        """
        
        success, data = self.client.query(sql)
        return data if success else []
    
    def _query_single_market_batch(self, station_ids: List[int], 
                                   market: str) -> List[Dict[str, Any]]:
        """批量查询单个市场的多个站点"""
        table = self.TABLE_TEMPLATE.format(market=market)
        
        ids_str = ','.join(map(str, station_ids))
        
        sql = f"""
        SELECT 
            station_id,
            station_type,
            station_name,
            status,
            city_name,
            district_id,
            bi_station_type,
            latitude,
            longitude,
            manager,
            manager_email,
            director,
            director_email,
            is_active_site_l7d,
            station_region,
            station_area,
            station_sub_area,
            is_own_fleet,
            xpt_flag,
            address
        FROM {table}
        WHERE station_id IN ({ids_str})
        """
        
        success, data = self.client.query(sql)
        return data if success else []
    
    def test_connection(self) -> bool:
        """测试连接是否正常"""
        try:
            success, data = self.client.query("SELECT 1 as test")
            return success and len(data) > 0 and data[0].get('test') == 1
        except Exception as e:
            self.logger.error(f"连接测试失败: {e}")
            return False

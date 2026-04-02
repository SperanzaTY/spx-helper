"""
SQL 解析器
从 biz_sql 中提取表依赖关系
"""

import re
import logging
from typing import List, Set
import sqlparse
from sqlparse.sql import IdentifierList, Identifier, Function
from sqlparse.tokens import Keyword, DML


class SQLParser:
    """SQL 解析器 - 提取表依赖"""
    
    def __init__(self):
        self.logger = logging.getLogger("SQLParser")
    
    def extract_tables_from_sql(self, sql: str) -> List[str]:
        """
        从 SQL 中提取所有表名
        
        Args:
            sql: SQL 语句
        
        Returns:
            List[str]: 表名列表（格式：database.table）
        """
        if not sql or not sql.strip():
            return []
        
        tables = set()
        
        # 方法 1: 使用 sqlparse 库解析
        tables.update(self._extract_with_sqlparse(sql))
        
        # 方法 2: 使用正则表达式补充（处理 sqlparse 无法识别的情况）
        tables.update(self._extract_with_regex(sql))
        
        # 过滤和清理
        cleaned_tables = self._clean_table_names(tables)
        
        self.logger.debug(f"从 SQL 中提取到 {len(cleaned_tables)} 个表: {cleaned_tables}")
        
        return sorted(cleaned_tables)
    
    def _extract_with_sqlparse(self, sql: str) -> Set[str]:
        """使用 sqlparse 库提取表名"""
        tables = set()
        
        try:
            # 解析 SQL
            parsed = sqlparse.parse(sql)
            
            for statement in parsed:
                # 递归提取表名
                tables.update(self._extract_from_token(statement))
        
        except Exception as e:
            self.logger.warning(f"sqlparse 解析失败: {e}")
        
        return tables
    
    def _extract_from_token(self, token) -> Set[str]:
        """递归提取 token 中的表名"""
        tables = set()
        
        if hasattr(token, 'tokens'):
            for item in token.tokens:
                # 跳过注释和空白
                if item.ttype in (sqlparse.tokens.Comment.Single, 
                                  sqlparse.tokens.Comment.Multiline,
                                  sqlparse.tokens.Whitespace):
                    continue
                
                # 处理 FROM 或 JOIN 后的表名
                if item.ttype is Keyword and item.value.upper() in ('FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE'):
                    # 获取下一个非空白 token
                    idx = token.tokens.index(item)
                    for next_item in token.tokens[idx + 1:]:
                        if next_item.ttype is not sqlparse.tokens.Whitespace:
                            table_name = self._extract_identifier(next_item)
                            if table_name:
                                tables.add(table_name)
                            break
                
                # 递归处理子 token
                if hasattr(item, 'tokens'):
                    tables.update(self._extract_from_token(item))
        
        return tables
    
    def _extract_identifier(self, token) -> str:
        """提取标识符（表名）"""
        if isinstance(token, Identifier):
            return token.get_real_name()
        elif isinstance(token, IdentifierList):
            # 处理多个表名
            return token.tokens[0].get_real_name() if token.tokens else None
        else:
            # 直接返回值（去除引号）
            value = str(token).strip().strip('`').strip('"').strip("'")
            return value if value and not value.upper() in ('SELECT', 'WHERE', 'GROUP', 'ORDER', 'LIMIT') else None
    
    def _extract_with_regex(self, sql: str) -> Set[str]:
        """使用正则表达式提取表名（作为 sqlparse 的补充）"""
        tables = set()
        
        # 移除注释
        sql_no_comments = re.sub(r'--.*$', '', sql, flags=re.MULTILINE)
        sql_no_comments = re.sub(r'/\*.*?\*/', '', sql_no_comments, flags=re.DOTALL)
        
        # 模式 1: FROM|JOIN database.table
        pattern1 = r'(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*)'
        matches1 = re.findall(pattern1, sql_no_comments, re.IGNORECASE)
        tables.update(matches1)
        
        # 模式 2: INTO database.table
        pattern2 = r'(?:INTO|TABLE)\s+([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*)'
        matches2 = re.findall(pattern2, sql_no_comments, re.IGNORECASE)
        tables.update(matches2)
        
        # 模式 3: remote() 函数中的表
        pattern3 = r"remote\s*\([^,]+,\s*['\"]([a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*)['\"]"
        matches3 = re.findall(pattern3, sql_no_comments, re.IGNORECASE)
        tables.update(matches3)
        
        return tables
    
    def _clean_table_names(self, tables: Set[str]) -> List[str]:
        """
        清理和过滤表名
        
        Args:
            tables: 原始表名集合
        
        Returns:
            List[str]: 清理后的表名列表
        """
        cleaned = []
        
        for table in tables:
            if not table:
                continue
            
            # 移除引号和反引号
            table = table.strip().strip('`').strip('"').strip("'")
            
            # 必须包含 database.table 格式
            if '.' not in table:
                continue
            
            # 移除 AS 别名
            if ' ' in table:
                table = table.split()[0]
            
            # 验证格式
            parts = table.split('.')
            if len(parts) == 2 and parts[0] and parts[1]:
                # 移除可能的括号
                table = table.replace('(', '').replace(')', '')
                cleaned.append(table)
        
        return cleaned
    
    def has_market_variable(self, table: str) -> bool:
        """
        检查表名是否包含市场变量
        
        Args:
            table: 表名
        
        Returns:
            bool: 是否包含变量
        """
        market_patterns = [
            r'\{market\}',
            r'\{region\}',
            r'\{country\}',
            r'\$\{market\}',
            r'\$\{region\}',
            r'\$\{country\}'
        ]
        
        for pattern in market_patterns:
            if re.search(pattern, table, re.IGNORECASE):
                return True
        
        return False
    
    def expand_market_tables(self, table_template: str, markets: List[str]) -> List[str]:
        """
        展开市场变量，生成实际表名列表
        
        Args:
            table_template: 表名模板（如 "db.table_{market}_all"）
            markets: 市场列表（如 ['sg', 'id', 'my']）
        
        Returns:
            List[str]: 展开后的表名列表
        """
        if not self.has_market_variable(table_template):
            return [table_template]
        
        expanded = []
        
        for market in markets:
            # 替换各种可能的变量格式
            table = table_template
            table = re.sub(r'\{market\}', market, table, flags=re.IGNORECASE)
            table = re.sub(r'\{region\}', market, table, flags=re.IGNORECASE)
            table = re.sub(r'\{country\}', market, table, flags=re.IGNORECASE)
            table = re.sub(r'\$\{market\}', market, table, flags=re.IGNORECASE)
            table = re.sub(r'\$\{region\}', market, table, flags=re.IGNORECASE)
            table = re.sub(r'\$\{country\}', market, table, flags=re.IGNORECASE)
            
            expanded.append(table)
        
        self.logger.debug(f"展开模板 '{table_template}' 为 {len(expanded)} 个表")
        
        return expanded


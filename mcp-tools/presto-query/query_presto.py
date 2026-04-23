#!/usr/bin/env python3
"""
Presto查询工具 - 使用Personal SQL API

使用方法:
    python query_presto.py "SELECT * FROM table LIMIT 10"
    python query_presto.py "SHOW CATALOGS" --queue szsc-adhoc --region SG
"""

import requests
import time
import json
import sys
import argparse
from typing import Dict, List, Any, Optional


class PrestoQueryClient:
    """Presto查询客户端 - 使用Personal SQL API"""
    
    def __init__(self, personal_token: str, username: str):
        """
        初始化客户端
        
        Args:
            personal_token: Personal Token (从DataSuite获取)
            username: 用户名 (会自动转为邮箱格式)
        """
        self.personal_token = personal_token
        self.username = username if '@' in username else f"{username}@shopee.com"
        self.base_url = "https://open-api.datasuite.shopee.io/dataservice/personal"
        
    def _get_headers(self) -> Dict[str, str]:
        """获取请求头"""
        return {
            'Authorization': self.personal_token,
            'X-End-User': self.username,
            'Content-Type': 'application/json'
        }
    
    def submit_query(self, sql: str, queue: str = 'szsc-adhoc', 
                     region: str = 'SG', priority: str = '3',
                     catalog: str = 'hive', schema: str = 'shopee') -> str:
        """
        提交查询
        
        Args:
            sql: SQL查询语句
            queue: Presto队列 (默认: szsc-adhoc)
            region: IDC区域 (默认: SG)
            priority: 优先级 1-5 (默认: 3)
            catalog: Catalog名称 (默认: hive)
            schema: Schema名称 (默认: shopee)
            
        Returns:
            jobId: 查询任务ID
        """
        url = f"{self.base_url}/query/presto"
        
        payload = {
            'sql': sql,
            'prestoQueue': queue,
            'idcRegion': region,
            'priority': priority
        }
        
        # 如果指定了catalog和schema，添加到payload
        if catalog and catalog != 'hive':
            payload['catalog'] = catalog
        if schema and schema != 'shopee':
            payload['schema'] = schema
        
        print(f"📤 提交查询...")
        print(f"   Queue: {queue}")
        print(f"   Region: {region}")
        print(f"   SQL: {sql[:100]}{'...' if len(sql) > 100 else ''}")
        
        try:
            response = requests.post(url, headers=self._get_headers(), json=payload)
            response.raise_for_status()
            
            data = response.json()
            job_id = data.get('jobId')
            if job_id:
                print(f"✅ 查询已提交! jobId: {job_id}")
                return job_id
            else:
                error_msg = data.get('errorMsg', data.get('message', str(data)))
                raise Exception(f"提交查询失败: {error_msg}")
                
        except requests.exceptions.RequestException as e:
            raise Exception(f"请求失败: {str(e)}")
    
    def check_status(self, job_id: str) -> Dict[str, Any]:
        """
        检查查询状态
        
        Args:
            job_id: 查询任务ID
            
        Returns:
            状态信息字典
        """
        url = f"{self.base_url}/status/{job_id}"
        
        try:
            response = requests.get(url, headers=self._get_headers())
            response.raise_for_status()
            
            data = response.json()
            # 直接返回完整响应（jobId、status、errorMessage 等都在顶层）
            return data
                
        except requests.exceptions.RequestException as e:
            raise Exception(f"请求失败: {str(e)}")
    
    def get_result(self, job_id: str) -> Dict[str, Any]:
        """
        获取查询结果
        
        Args:
            job_id: 查询任务ID
            
        Returns:
            查询结果字典
        """
        url = f"{self.base_url}/result/{job_id}"
        
        try:
            response = requests.get(url, headers=self._get_headers())
            response.raise_for_status()
            
            data = response.json()
            if 'resultSchema' in data:
                return data
            else:
                error_msg = data.get('errorMsg', data.get('message', str(data)))
                raise Exception(f"获取结果失败: {error_msg}")
                
        except requests.exceptions.RequestException as e:
            raise Exception(f"请求失败: {str(e)}")
    
    def query(self, sql: str, queue: str = 'szsc-adhoc', 
              region: str = 'SG', priority: str = '3',
              catalog: str = 'hive', schema: str = 'shopee',
              max_wait_seconds: int = 300) -> Dict[str, Any]:
        """
        执行完整的查询流程
        
        Args:
            sql: SQL查询语句
            queue: Presto队列
            region: IDC区域
            priority: 优先级
            catalog: Catalog名称
            schema: Schema名称
            max_wait_seconds: 最大等待时间（秒）
            
        Returns:
            查询结果字典，包含columns和rows
        """
        # 1. 提交查询
        job_id = self.submit_query(sql, queue, region, priority, catalog, schema)
        
        # 2. 轮询状态
        print(f"⏳ 等待查询完成...")
        start_time = time.time()
        poll_count = 0
        
        while True:
            poll_count += 1
            status_data = self.check_status(job_id)
            status = status_data.get('status')
            
            if status == 'FINISH':
                print(f"✅ 查询完成！(轮询 {poll_count} 次)")
                break
            elif status == 'FAILED':
                error_msg = (
                    status_data.get('errorMessage')
                    or status_data.get('errorMsg')
                    or status_data.get('error')
                    or status_data.get('message')
                    or status_data.get('msg')
                    or str(status_data)
                )
                raise Exception(f"查询失败: {error_msg}")
            elif status in ['RUNNING', 'PENDING', 'QUEUED']:
                elapsed = time.time() - start_time
                if elapsed > max_wait_seconds:
                    raise Exception(f"查询超时 (>{max_wait_seconds}秒)")
                print(f"🔄 状态 ({poll_count}): {status}")
                time.sleep(2)  # 每2秒轮询一次
            else:
                raise Exception(f"未知状态: {status}")
        
        # 3. 获取结果
        print(f"📥 获取结果...")
        result = self.get_result(job_id)
        
        # 解析结果
        columns = [col.get('columnName', col.get('name', '')) for col in result.get('resultSchema', [])]
        rows = []
        
        for row_data in result.get('rows', []):
            row_values = row_data.get('values', {})
            rows.append(row_values)
        
        print(f"📊 查询结果: {len(columns)} 列, {len(rows)} 行")
        
        return {
            'columns': columns,
            'rows': rows,
            'jobId': job_id,
            'engine': result.get('engine', 'PRESTO')
        }


def print_table(columns: List[str], rows: List[Dict[str, Any]], max_rows: int = 20):
    """
    以表格形式打印结果
    
    Args:
        columns: 列名列表
        rows: 数据行列表
        max_rows: 最多显示行数
    """
    if not rows:
        print("(0 rows)")
        return
    
    # 计算每列的最大宽度
    col_widths = {}
    for col in columns:
        col_widths[col] = len(col)
    
    for row in rows[:max_rows]:
        for col in columns:
            value = str(row.get(col, ''))
            col_widths[col] = max(col_widths[col], len(value))
    
    # 打印表头
    header = " | ".join(col.ljust(col_widths[col]) for col in columns)
    print("\n" + header)
    print("-" * len(header))
    
    # 打印数据行
    for i, row in enumerate(rows[:max_rows]):
        row_str = " | ".join(str(row.get(col, '')).ljust(col_widths[col]) for col in columns)
        print(row_str)
    
    # 显示行数信息
    total_rows = len(rows)
    if total_rows > max_rows:
        print(f"\n... 还有 {total_rows - max_rows} 行 (总共 {total_rows} 行)")
    else:
        print(f"\n({total_rows} rows)")


def save_to_json(result: Dict[str, Any], filename: str):
    """保存结果到JSON文件"""
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"💾 结果已保存到: {filename}")


def save_to_csv(columns: List[str], rows: List[Dict[str, Any]], filename: str):
    """保存结果到CSV文件"""
    import csv
    
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    
    print(f"💾 结果已保存到: {filename}")


def main():
    parser = argparse.ArgumentParser(
        description='Presto查询工具 - 使用Personal SQL API',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 基本查询
  python query_presto.py "SELECT * FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id LIMIT 10"
  
  # 查询并保存到JSON
  python query_presto.py "SELECT * FROM table LIMIT 100" --output result.json
  
  # 查询并保存到CSV
  python query_presto.py "SELECT * FROM table LIMIT 100" --output result.csv
  
  # 指定队列和区域
  python query_presto.py "SELECT * FROM table" --queue szsc-adhoc --region SG
        """
    )
    
    parser.add_argument('sql', help='SQL查询语句')
    parser.add_argument('--username', '-u', default='tianyi.liang', 
                        help='用户名 (默认: tianyi.liang)')
    parser.add_argument('--token', '-t', default='l7Vx4TGfwhmA1gtPn+JmUQ==',
                        help='Personal Token')
    parser.add_argument('--queue', '-q', default='szsc-adhoc',
                        help='Presto队列 (默认: szsc-adhoc)')
    parser.add_argument('--region', '-r', default='SG',
                        help='IDC区域 (默认: SG)')
    parser.add_argument('--priority', '-p', default='3',
                        help='优先级 1-5 (默认: 3)')
    parser.add_argument('--catalog', '-c', default='hive',
                        help='Catalog名称 (默认: hive)')
    parser.add_argument('--schema', '-s', default='shopee',
                        help='Schema名称 (默认: shopee)')
    parser.add_argument('--output', '-o', help='输出文件 (.json 或 .csv)')
    parser.add_argument('--max-rows', '-m', type=int, default=20,
                        help='最多显示行数 (默认: 20)')
    parser.add_argument('--timeout', type=int, default=300,
                        help='最大等待时间(秒) (默认: 300)')
    
    args = parser.parse_args()
    
    try:
        # 创建客户端
        client = PrestoQueryClient(args.token, args.username)
        
        print("=" * 60)
        print("🚀 Presto查询工具 (Personal SQL API)")
        print("=" * 60)
        
        # 执行查询
        result = client.query(
            sql=args.sql,
            queue=args.queue,
            region=args.region,
            priority=args.priority,
            catalog=args.catalog,
            schema=args.schema,
            max_wait_seconds=args.timeout
        )
        
        # 显示结果
        print_table(result['columns'], result['rows'], args.max_rows)
        
        # 保存到文件
        if args.output:
            if args.output.endswith('.json'):
                save_to_json(result, args.output)
            elif args.output.endswith('.csv'):
                save_to_csv(result['columns'], result['rows'], args.output)
            else:
                print("⚠️  不支持的文件格式，仅支持 .json 和 .csv")
        
        print(f"\n✅ 查询成功! jobId: {result['jobId']}")
        
    except KeyboardInterrupt:
        print("\n\n⚠️  用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 错误: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()

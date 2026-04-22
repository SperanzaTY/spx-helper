#!/usr/bin/env python3
"""
Presto查询工具 - 平台Agent集成版本
用于构建平台agent的tool
"""

import requests
import time
import os
from typing import Dict, List, Any, Optional, Tuple


DEFAULT_HTTP_CONNECT_TIMEOUT_SECONDS = float(
    os.environ.get('PRESTO_HTTP_CONNECT_TIMEOUT_SECONDS', '10')
)
DEFAULT_HTTP_READ_TIMEOUT_SECONDS = float(
    os.environ.get('PRESTO_HTTP_READ_TIMEOUT_SECONDS', '60')
)
DEFAULT_MAX_WAIT_SECONDS = int(os.environ.get('PRESTO_MAX_WAIT_SECONDS', '600'))


class PrestoQueryTool:
    """Presto查询工具 - 适用于平台Agent集成"""
    
    def __init__(self, personal_token: str, username: str, 
                 base_url: str = "https://open-api.datasuite.shopee.io/dataservice/personal"):
        """
        初始化Presto查询工具
        
        Args:
            personal_token: DataSuite Personal Token
            username: 用户名（会自动转为邮箱格式）
            base_url: API基础URL
        """
        self.personal_token = personal_token
        self.username = username if '@' in username else f"{username}@shopee.com"
        self.base_url = base_url
    
    def _get_headers(self) -> Dict[str, str]:
        """获取请求头"""
        return {
            'Authorization': self.personal_token,
            'X-End-User': self.username,
            'Content-Type': 'application/json'
        }

    def _build_timeout(self, read_timeout_seconds: float) -> Tuple[float, float]:
        """requests 超时使用 (connect_timeout, read_timeout) 元组。"""
        return (DEFAULT_HTTP_CONNECT_TIMEOUT_SECONDS, read_timeout_seconds)
    
    def execute(self, sql: str, 
                queue: str = 'szsc-adhoc',
                region: str = 'SG',
                priority: str = '3',
                max_wait_seconds: int = DEFAULT_MAX_WAIT_SECONDS,
                request_timeout_seconds: int = int(DEFAULT_HTTP_READ_TIMEOUT_SECONDS),
                max_rows: Optional[int] = None) -> Dict[str, Any]:
        """
        执行Presto SQL查询（同步方法）
        
        Args:
            sql: SQL查询语句（只支持SELECT）
            queue: Presto队列 (szsc-adhoc | szsc-scheduled)
            region: IDC集群 (SG | US)
            priority: 优先级 1-5
            max_wait_seconds: 最大等待时间（秒）
            request_timeout_seconds: 单次 HTTP 请求的读超时（秒）
            max_rows: 限制返回行数（None表示全部）
            
        Returns:
            {
                'success': bool,
                'job_id': str,
                'columns': List[str],
                'rows': List[Dict],
                'total_rows': int,
                'elapsed_seconds': int,
                'error': Optional[str]
            }
        """
        start_time = time.time()
        if max_wait_seconds <= 0:
            raise ValueError("max_wait_seconds 必须大于 0")
        if request_timeout_seconds <= 0:
            raise ValueError("request_timeout_seconds 必须大于 0")
        request_timeout = self._build_timeout(float(request_timeout_seconds))
        
        try:
            # 1. 提交查询
            job_id = self._submit_query(sql, queue, region, priority, request_timeout)
            
            # 2. 等待完成
            self._wait_for_completion(job_id, max_wait_seconds, start_time, request_timeout)
            
            # 3. 获取结果
            result = self._fetch_result(job_id, request_timeout)
            
            # 4. 格式化返回
            columns = result['columns']
            rows = result['rows']
            
            if max_rows is not None and max_rows > 0:
                rows = rows[:max_rows]
            
            elapsed = int(time.time() - start_time)
            
            return {
                'success': True,
                'job_id': job_id,
                'columns': columns,
                'rows': rows,
                'total_rows': len(result['rows']),
                'displayed_rows': len(rows),
                'elapsed_seconds': elapsed,
                'error': None
            }
            
        except Exception as e:
            elapsed = int(time.time() - start_time)
            return {
                'success': False,
                'job_id': None,
                'columns': [],
                'rows': [],
                'total_rows': 0,
                'displayed_rows': 0,
                'elapsed_seconds': elapsed,
                'error': str(e)
            }
    
    def _submit_query(
        self,
        sql: str,
        queue: str,
        region: str,
        priority: str,
        request_timeout: Tuple[float, float],
    ) -> str:
        """提交查询并返回job_id"""
        url = f"{self.base_url}/query/presto"
        payload = {
            'sql': sql.strip(),
            'prestoQueue': queue,
            'idcRegion': region,
            'priority': priority
        }
        
        response = requests.post(url, headers=self._get_headers(), json=payload, timeout=request_timeout)
        response.raise_for_status()
        
        data = response.json()
        job_id = data.get('jobId')
        
        if not job_id:
            error_msg = data.get('errorMsg', data.get('message', 'Unknown error'))
            raise Exception(f"提交查询失败: {error_msg}")
        
        return job_id
    
    def _wait_for_completion(
        self,
        job_id: str,
        max_wait_seconds: int,
        start_time: float,
        request_timeout: Tuple[float, float],
    ):
        """等待查询完成"""
        status_url = f"{self.base_url}/status/{job_id}"
        
        while True:
            elapsed = time.time() - start_time
            if elapsed > max_wait_seconds:
                raise Exception(f"查询超时 (>{max_wait_seconds}秒)")
            
            response = requests.get(status_url, headers=self._get_headers(), timeout=request_timeout)
            response.raise_for_status()
            
            status_data = response.json()
            status = status_data.get('status')
            
            if status == 'FINISH':
                return
            elif status == 'FAILED':
                error_msg = (
                    status_data.get('errorMessage') or 
                    status_data.get('errorMsg') or 
                    str(status_data)
                )
                raise Exception(f"查询失败: {error_msg}")
            elif status in ['RUNNING', 'PENDING', 'QUEUED']:
                time.sleep(2)  # 每2秒轮询一次
            else:
                raise Exception(f"未知状态: {status}")
    
    def _fetch_result(self, job_id: str, request_timeout: Tuple[float, float]) -> Dict[str, Any]:
        """获取查询结果"""
        url = f"{self.base_url}/result/{job_id}"
        
        response = requests.get(url, headers=self._get_headers(), timeout=request_timeout)
        response.raise_for_status()
        
        data = response.json()
        
        if 'resultSchema' not in data:
            error_msg = data.get('errorMsg', data.get('message', 'Unknown error'))
            raise Exception(f"获取结果失败: {error_msg}")
        
        columns = [col['columnName'] for col in data.get('resultSchema', [])]
        rows = [row.get('values', {}) for row in data.get('rows', [])]
        
        return {
            'columns': columns,
            'rows': rows
        }


# ============================================================
# 使用示例和测试
# ============================================================

if __name__ == '__main__':
    import sys
    
    # 从环境变量获取凭证
    PERSONAL_TOKEN = os.environ.get('PRESTO_PERSONAL_TOKEN')
    USERNAME = os.environ.get('PRESTO_USERNAME')
    
    if not PERSONAL_TOKEN or not USERNAME:
        print("错误: 请设置环境变量 PRESTO_PERSONAL_TOKEN 和 PRESTO_USERNAME")
        sys.exit(1)
    
    # 创建查询工具实例
    presto = PrestoQueryTool(PERSONAL_TOKEN, USERNAME)
    
    print("=" * 80)
    print("Presto查询工具 - 测试")
    print("=" * 80)
    
    # 测试查询
    sql = """
    SELECT * 
    FROM spx_mart.shopee_spx_driver_mgt_id_db__driver_tab__reg_continuous_s0_live 
    LIMIT 5
    """
    
    print(f"\n执行SQL:")
    print(sql.strip())
    print("\n" + "-" * 80)
    
    result = presto.execute(sql, max_rows=5)
    
    if result['success']:
        print(f"\n[OK] 查询成功!")
        print(f"  Job ID: {result['job_id']}")
        print(f"  列数: {len(result['columns'])}")
        print(f"  总行数: {result['total_rows']}")
        print(f"  显示行数: {result['displayed_rows']}")
        print(f"  耗时: {result['elapsed_seconds']}秒")
        
        print(f"\n列名 ({len(result['columns'])} 个):")
        print(", ".join(result['columns'][:10]) + ("..." if len(result['columns']) > 10 else ""))
        
        print(f"\n前 {min(3, len(result['rows']))} 行数据:")
        for i, row in enumerate(result['rows'][:3], 1):
            print(f"\n第 {i} 行:")
            # 只显示前几个字段
            for j, (col, value) in enumerate(row.items()):
                if j >= 5:
                    print(f"  ... (还有 {len(row) - 5} 个字段)")
                    break
                value_str = str(value)
                if len(value_str) > 50:
                    value_str = value_str[:47] + "..."
                print(f"  {col}: {value_str}")
    else:
        print(f"\n[FAIL] 查询失败: {result['error']}")
        sys.exit(1)
    
    print("\n" + "=" * 80)
    print("[OK] 脚本测试通过!")
    print("=" * 80)

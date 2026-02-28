#!/usr/bin/env python3
"""
Presto查询工具 - 简化版

使用方法:
1. 修改下面的配置参数
2. 运行: python3 simple_query.py
3. 查看结果
"""

import requests
import time
import json

# ============================================================
# 配置参数 - 在这里修改你的查询设置
# ============================================================

# 用户信息
USERNAME = 'tianyi.liang'  # 你的用户名
PERSONAL_TOKEN = 'l7Vx4TGfwhmA1gtPn+JmUQ=='  # 你的Personal Token

# SQL查询
SQL = """
SELECT * 
FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id 
LIMIT 10
"""

# 查询参数
QUEUE = 'szsc-adhoc'  # Presto队列: szsc-adhoc 或 szsc-scheduled
REGION = 'SG'  # IDC集群: 'SG' (新加坡) 或 'US' (美国)
PRIORITY = '3'  # 优先级: 1-5 (数字越小优先级越高)

# 输出设置
OUTPUT_FORMAT = 'table'  # 输出格式: 'table' 表格, 'json' JSON, 'csv' CSV, 'simple' 简单列表
OUTPUT_FILE = None  # 输出文件: None 不保存, 或指定文件名如 'result.json' 或 'result.csv'
MAX_DISPLAY_ROWS = 20  # 最多显示多少行

# 超时设置
TIMEOUT = 300  # 查询超时时间(秒)

# ============================================================
# 以下是程序代码，一般不需要修改
# ============================================================

def query_presto(username, token, sql, queue='szsc-adhoc', region='SG', priority='3', timeout=300):
    """执行Presto查询"""
    
    # 确保用户名是邮箱格式
    end_user = username if '@' in username else f"{username}@shopee.com"
    base_url = "https://open-api.datasuite.shopee.io/dataservice/personal"
    
    headers = {
        'Authorization': token,
        'X-End-User': end_user,
        'Content-Type': 'application/json'
    }
    
    # 1. 提交查询
    print("📤 提交查询...")
    print(f"   Queue: {queue}")
    print(f"   Region: {region}")
    print(f"   SQL: {sql.strip()[:100]}{'...' if len(sql.strip()) > 100 else ''}")
    
    submit_url = f"{base_url}/query/presto"
    payload = {
        'sql': sql.strip(),
        'prestoQueue': queue,
        'idcRegion': region,
        'priority': priority
    }
    
    response = requests.post(submit_url, headers=headers, json=payload)
    response.raise_for_status()
    data = response.json()
    
    # API直接返回jobId，不是嵌套在data中
    job_id = data.get('jobId')
    if not job_id:
        raise Exception(f"提交失败: {data.get('errorMsg', data.get('message', 'Unknown error'))}")
    
    print(f"✅ 查询已提交! jobId: {job_id}")
    
    # 2. 轮询状态
    print("⏳ 等待查询完成...")
    start_time = time.time()
    poll_count = 0
    status_url = f"{base_url}/status/{job_id}"
    
    while True:
        poll_count += 1
        response = requests.get(status_url, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        # API直接返回状态
        status = data.get('status')
        if not status:
            raise Exception(f"检查状态失败: {data.get('errorMsg', 'Unknown error')}")
        
        if status == 'FINISH':
            print(f"✅ 查询完成！(轮询 {poll_count} 次)")
            break
        elif status == 'FAILED':
            error_msg = data.get('errorMessage', 'Unknown error')
            raise Exception(f"查询失败: {error_msg}")
        elif status in ['RUNNING', 'PENDING', 'QUEUED']:
            elapsed = time.time() - start_time
            if elapsed > timeout:
                raise Exception(f"查询超时 (>{timeout}秒)")
            print(f"🔄 状态 ({poll_count}): {status}")
            time.sleep(2)
        else:
            raise Exception(f"未知状态: {status}")
    
    # 3. 获取结果
    print("📥 获取结果...")
    result_url = f"{base_url}/result/{job_id}"
    response = requests.get(result_url, headers=headers)
    response.raise_for_status()
    data = response.json()
    
    # API直接返回结果数据
    if 'resultSchema' not in data:
        raise Exception(f"获取结果失败: {data.get('errorMsg', data.get('message', 'Unknown error'))}")
    
    columns = [col['columnName'] for col in data.get('resultSchema', [])]
    rows = []
    
    for row_data in data.get('rows', []):
        rows.append(row_data.get('values', {}))
    
    print(f"📊 查询结果: {len(columns)} 列, {len(rows)} 行")
    
    return {
        'columns': columns,
        'rows': rows,
        'jobId': job_id
    }


def print_as_table(columns, rows, max_rows=20):
    """以表格形式输出"""
    if not rows:
        print("\n(0 rows)")
        return
    
    # 计算列宽
    col_widths = {}
    for col in columns:
        col_widths[col] = len(col)
    
    for row in rows[:max_rows]:
        for col in columns:
            value = str(row.get(col, ''))
            col_widths[col] = max(col_widths[col], min(len(value), 50))  # 最大50字符
    
    # 打印表头
    header = " | ".join(col.ljust(col_widths[col]) for col in columns)
    print("\n" + header)
    print("-" * len(header))
    
    # 打印数据
    for row in rows[:max_rows]:
        values = []
        for col in columns:
            value = str(row.get(col, ''))
            # 如果太长，截断并加省略号
            if len(value) > 50:
                value = value[:47] + '...'
            values.append(value.ljust(col_widths[col]))
        print(" | ".join(values))
    
    # 显示行数
    total = len(rows)
    if total > max_rows:
        print(f"\n... 还有 {total - max_rows} 行 (总共 {total} 行)")
    else:
        print(f"\n({total} rows)")


def print_as_json(result):
    """以JSON格式输出"""
    print("\n" + json.dumps(result, indent=2, ensure_ascii=False))


def print_as_csv(columns, rows):
    """以CSV格式输出"""
    import csv
    import io
    
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns)
    writer.writeheader()
    writer.writerows(rows)
    
    print("\n" + output.getvalue())


def print_as_simple(columns, rows, max_rows=20):
    """简单列表格式输出"""
    for i, row in enumerate(rows[:max_rows], 1):
        print(f"\n第 {i} 行:")
        for col in columns:
            print(f"  {col}: {row.get(col, '')}")
    
    total = len(rows)
    if total > max_rows:
        print(f"\n... 还有 {total - max_rows} 行 (总共 {total} 行)")


def save_to_file(result, filename):
    """保存到文件"""
    if filename.endswith('.json'):
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"\n💾 已保存到: {filename}")
    
    elif filename.endswith('.csv'):
        import csv
        with open(filename, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=result['columns'])
            writer.writeheader()
            writer.writerows(result['rows'])
        print(f"\n💾 已保存到: {filename}")
    
    else:
        print(f"\n⚠️  不支持的文件格式: {filename}")
        print("    支持的格式: .json, .csv")


def main():
    """主函数"""
    print("=" * 70)
    print(" " * 20 + "🚀 Presto查询工具")
    print("=" * 70)
    
    try:
        # 执行查询
        result = query_presto(
            username=USERNAME,
            token=PERSONAL_TOKEN,
            sql=SQL,
            queue=QUEUE,
            region=REGION,
            priority=PRIORITY,
            timeout=TIMEOUT
        )
        
        # 显示结果
        print("\n" + "=" * 70)
        print(" " * 25 + "📊 查询结果")
        print("=" * 70)
        
        output_format = OUTPUT_FORMAT.lower()
        
        if output_format == 'table':
            print_as_table(result['columns'], result['rows'], MAX_DISPLAY_ROWS)
        
        elif output_format == 'json':
            print_as_json(result)
        
        elif output_format == 'csv':
            print_as_csv(result['columns'], result['rows'])
        
        elif output_format == 'simple':
            print_as_simple(result['columns'], result['rows'], MAX_DISPLAY_ROWS)
        
        else:
            print(f"\n⚠️  未知的输出格式: {OUTPUT_FORMAT}")
            print("支持的格式: table, json, csv, simple")
            print("\n使用默认表格格式:")
            print_as_table(result['columns'], result['rows'], MAX_DISPLAY_ROWS)
        
        # 保存到文件
        if OUTPUT_FILE:
            save_to_file(result, OUTPUT_FILE)
        
        # 显示总结
        print("\n" + "=" * 70)
        print(f"✅ 查询成功!")
        print(f"   JobId: {result['jobId']}")
        print(f"   列数: {len(result['columns'])}")
        print(f"   行数: {len(result['rows'])}")
        if OUTPUT_FILE:
            print(f"   输出文件: {OUTPUT_FILE}")
        print("=" * 70)
        
    except Exception as e:
        print("\n" + "=" * 70)
        print(f"❌ 错误: {str(e)}")
        print("=" * 70)
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == '__main__':
    exit(main())

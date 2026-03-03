#!/usr/bin/env python3
"""
示例1: 在代码中使用query_presto

这个例子展示如何把query_presto.py当作一个库来使用，
在你自己的Python脚本中调用Presto查询功能。
"""

from query_presto import PrestoQueryClient

def example_1_basic_query():
    """例子1: 基本查询"""
    print("=" * 60)
    print("例子1: 基本查询")
    print("=" * 60)
    
    # 创建客户端
    client = PrestoQueryClient(
        personal_token='l7Vx4TGfwhmA1gtPn+JmUQ==',
        username='tianyi.liang'
    )
    
    # 执行查询
    result = client.query(
        sql='SELECT * FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id LIMIT 5',
        queue='szsc-adhoc',
        region='SG'
    )
    
    # 处理结果
    print(f"\n✅ 查询成功!")
    print(f"列数: {len(result['columns'])}")
    print(f"行数: {len(result['rows'])}")
    print(f"JobId: {result['jobId']}")
    
    # 遍历数据
    print("\n数据:")
    for i, row in enumerate(result['rows'], 1):
        print(f"第{i}行: {row}")


def example_2_check_table_exists():
    """例子2: 检查表是否存在"""
    print("\n" + "=" * 60)
    print("例子2: 检查表是否存在")
    print("=" * 60)
    
    client = PrestoQueryClient(
        personal_token='l7Vx4TGfwhmA1gtPn+JmUQ==',
        username='tianyi.liang'
    )
    
    # 要检查的表
    tables_to_check = [
        'spx_mart.dim_spx_lm_station_user_configuration_tab_id',
        'spx_mart.some_fake_table_that_does_not_exist'
    ]
    
    for table in tables_to_check:
        try:
            result = client.query(f"SELECT 1 FROM {table} LIMIT 1")
            print(f"✅ 表 {table} 存在")
        except Exception as e:
            print(f"❌ 表 {table} 不存在或查询失败: {e}")


def example_3_get_row_count():
    """例子3: 获取多个表的行数"""
    print("\n" + "=" * 60)
    print("例子3: 获取表的行数")
    print("=" * 60)
    
    client = PrestoQueryClient(
        personal_token='l7Vx4TGfwhmA1gtPn+JmUQ==',
        username='tianyi.liang'
    )
    
    table = 'spx_mart.dim_spx_lm_station_user_configuration_tab_id'
    
    try:
        result = client.query(f"SELECT COUNT(*) as total FROM {table}")
        row_count = result['rows'][0]['total']
        print(f"📊 表 {table} 共有 {row_count} 行")
    except Exception as e:
        print(f"❌ 查询失败: {e}")


def example_4_get_table_schema():
    """例子4: 获取表结构"""
    print("\n" + "=" * 60)
    print("例子4: 获取表结构")
    print("=" * 60)
    
    client = PrestoQueryClient(
        personal_token='l7Vx4TGfwhmA1gtPn+JmUQ==',
        username='tianyi.liang'
    )
    
    table = 'spx_mart.dim_spx_lm_station_user_configuration_tab_id'
    
    try:
        result = client.query(f"DESCRIBE {table}")
        
        print(f"\n表 {table} 的列信息:")
        print("-" * 80)
        print(f"{'列名':<40} {'类型':<30}")
        print("-" * 80)
        
        for row in result['rows']:
            col_name = row.get('Column', row.get('column', ''))
            col_type = row.get('Type', row.get('type', ''))
            print(f"{col_name:<40} {col_type:<30}")
            
    except Exception as e:
        print(f"❌ 查询失败: {e}")


def example_5_data_validation():
    """例子5: 数据验证 - 检查某个配置是否存在"""
    print("\n" + "=" * 60)
    print("例子5: 数据验证")
    print("=" * 60)
    
    client = PrestoQueryClient(
        personal_token='l7Vx4TGfwhmA1gtPn+JmUQ==',
        username='tianyi.liang'
    )
    
    # 假设我们要检查某个配置ID是否存在
    # 这里只是演示，实际列名可能不同
    sql = """
        SELECT * 
        FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id 
        LIMIT 3
    """
    
    try:
        result = client.query(sql)
        
        print(f"\n找到 {len(result['rows'])} 条记录:")
        for row in result['rows']:
            # 处理每一行数据
            print(f"  - {row}")
            
    except Exception as e:
        print(f"❌ 查询失败: {e}")


def example_6_batch_query():
    """例子6: 批量查询多个SQL"""
    print("\n" + "=" * 60)
    print("例子6: 批量查询")
    print("=" * 60)
    
    client = PrestoQueryClient(
        personal_token='l7Vx4TGfwhmA1gtPn+JmUQ==',
        username='tianyi.liang'
    )
    
    # 多个SQL查询
    queries = {
        'Catalogs': 'SHOW CATALOGS',
        'Schemas': 'SHOW SCHEMAS FROM hive',
        'Tables': 'SHOW TABLES IN spx_mart LIKE "dim%"'
    }
    
    results = {}
    
    for name, sql in queries.items():
        try:
            print(f"\n执行查询: {name}")
            result = client.query(sql)
            results[name] = result
            print(f"  ✅ 返回 {len(result['rows'])} 行")
        except Exception as e:
            print(f"  ❌ 失败: {e}")
    
    return results


if __name__ == '__main__':
    """
    运行所有例子
    
    使用方法:
        python3 example_use_in_code.py
    """
    
    print("\n")
    print("╔" + "=" * 58 + "╗")
    print("║" + " " * 10 + "Presto查询工具 - 在代码中使用示例" + " " * 10 + "║")
    print("╚" + "=" * 58 + "╝")
    print("\n这个脚本展示了如何在你自己的Python代码中使用query_presto")
    print("而不是在命令行直接运行。\n")
    
    try:
        # 运行所有例子
        example_1_basic_query()
        example_2_check_table_exists()
        example_3_get_row_count()
        example_4_get_table_schema()
        example_5_data_validation()
        example_6_batch_query()
        
        print("\n" + "=" * 60)
        print("✅ 所有例子运行完成!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ 运行出错: {e}")
        import traceback
        traceback.print_exc()

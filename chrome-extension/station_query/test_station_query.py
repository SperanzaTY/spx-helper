#!/usr/bin/env python3
"""
站点查询功能测试脚本
"""

import sys
import yaml
import time
from station_query import StationQuery


def test_connection(query_service):
    """测试连接"""
    print("🔌 测试 ClickHouse 连接...")
    if query_service.test_connection():
        print("✅ 连接成功\n")
        return True
    else:
        print("❌ 连接失败\n")
        return False


def test_query_by_id(query_service):
    """测试按 ID 查询"""
    print("🔍 测试按 ID 查询（示例 ID: 123456）...")
    
    start = time.time()
    results = query_service.query_by_id(123456, market='id')
    elapsed = time.time() - start
    
    if results:
        print(f"✅ 查询成功，找到 {len(results)} 条记录，耗时 {elapsed:.2f}s")
        print(f"   站点名称: {results[0].get('station_name', '-')}")
        print(f"   市场: {results[0].get('market', '-')}")
        print()
        return True
    else:
        print(f"⚠️  未找到结果（可能站点 ID 不存在）\n")
        return True  # 查询正常，只是没结果


def test_query_by_name(query_service):
    """测试按名称查询"""
    print("🔍 测试按名称查询（关键词: Hub）...")
    
    start = time.time()
    results = query_service.query_by_name('Hub', limit=5)
    elapsed = time.time() - start
    
    if results:
        print(f"✅ 查询成功，找到 {len(results)} 条记录，耗时 {elapsed:.2f}s")
        for i, station in enumerate(results[:3], 1):
            print(f"   {i}. [{station.get('market', '-').upper()}] {station.get('station_name', '-')}")
        print()
        return True
    else:
        print("⚠️  未找到结果\n")
        return True


def test_batch_query(query_service):
    """测试批量查询"""
    print("🔍 测试批量查询（ID: 123, 456, 789）...")
    
    start = time.time()
    results = query_service.query_batch_ids([123, 456, 789])
    elapsed = time.time() - start
    
    print(f"✅ 查询完成，找到 {len(results)} 条记录，耗时 {elapsed:.2f}s\n")
    return True


def main():
    print("=" * 50)
    print("   SPX 站点查询功能测试")
    print("=" * 50)
    print()
    
    # 加载配置
    try:
        with open('config/clickhouse.yaml', 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
    except FileNotFoundError:
        print("❌ 配置文件不存在: config/clickhouse.yaml")
        print("   请先复制 config/clickhouse.yaml.example 并填入配置\n")
        sys.exit(1)
    except Exception as e:
        print(f"❌ 加载配置失败: {e}\n")
        sys.exit(1)
    
    # 初始化查询服务
    try:
        query_service = StationQuery(
            clickhouse_config=config['online2'],
            markets=config.get('markets'),
            max_workers=8
        )
    except Exception as e:
        print(f"❌ 初始化失败: {e}\n")
        sys.exit(1)
    
    # 运行测试
    tests = [
        ("连接测试", test_connection),
        ("ID 查询", test_query_by_id),
        ("名称搜索", test_query_by_name),
        ("批量查询", test_batch_query),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_func in tests:
        try:
            if test_func(query_service):
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ {name} 异常: {e}\n")
            failed += 1
    
    # 汇总
    print("=" * 50)
    print(f"测试完成: ✅ {passed} 通过, ❌ {failed} 失败")
    print("=" * 50)
    
    sys.exit(0 if failed == 0 else 1)


if __name__ == '__main__':
    main()

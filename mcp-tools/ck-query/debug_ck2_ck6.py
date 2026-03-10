#!/usr/bin/env python3
"""
调试脚本：对比各集群对同一 SQL 的响应
用法: python3 debug_ck2_ck6.py "SELECT * FROM spx_mart_manage_app.dwd_spx_order_tracking_ri_id_all LIMIT 5"
"""
import sys
sys.path.insert(0, '.')

from ck_mcp_server import execute_direct

def main():
    sql = sys.argv[1] if len(sys.argv) > 1 else (
        "SELECT * FROM spx_mart_manage_app.dwd_spx_order_tracking_ri_id_all LIMIT 5"
    )

    clusters = ['test', 'ck2', 'ck6', 'online_2', 'online_5', 'online_6', 'online_7']
    for c in clusters:
        print(f"\n--- {c} ---")
        r = execute_direct(sql, c, None, 5)
        if r['success']:
            print(f"✓ {r['total_rows']} 行")
            if r.get('rows'):
                print("列:", list(r['rows'][0].keys())[:6], "...")
        else:
            print(f"✗ {r['error'][:300]}...")

if __name__ == "__main__":
    main()

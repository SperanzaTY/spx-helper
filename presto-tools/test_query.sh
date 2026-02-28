#!/bin/bash
# 快速测试脚本

echo "================================"
echo "测试 1: SHOW CATALOGS"
echo "================================"
python3 query_presto.py "SHOW CATALOGS" --max-rows 5

echo ""
echo ""
echo "================================"
echo "测试 2: 查询配置表"
echo "================================"
python3 query_presto.py "SELECT * FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id LIMIT 5"

echo ""
echo "✅ 所有测试完成！"

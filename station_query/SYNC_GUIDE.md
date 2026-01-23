# 站点数据同步使用指南

## 🔄 功能说明

将 ONLINE2 生产环境的最新站点数据同步到 TEST 环境，确保查询到的是最新数据。

## ⚙️ 同步原理

```
ONLINE2 (生产)                    TEST (测试)
10.180.129.96:8123         →      clickhouse-k8s-sg-prod:443
spx_mart_manage_app               spx_mart_pub
dim_spx_station_tab_*_all         dim_spx_station_tab_*_all
```

**同步流程**:
1. 连接源环境和目标环境
2. 清空目标表 (TRUNCATE)
3. 使用 `remote()` 函数从源表查询数据
4. 插入到目标表 (INSERT SELECT)
5. 验证数据量

## 🚀 快速使用

### 同步所有市场（8个）

```bash
cd /Users/tianyi.liang/Cursor/SPX_Helper/station_query
python3 sync_station_data.py
```

**预期输出**:
```
🚀 开始同步 8 个市场的站点数据...
   源: ONLINE2 (生产)
   目标: TEST 环境

🔌 测试连接...
  测试 ONLINE2 (源)...
  ✅ ONLINE2 连接成功
  测试 TEST (目标)...
  ✅ TEST 连接成功

📊 同步 SG 市场...
  源表记录数: 1234
  清空目标表...
  开始同步数据...
  ✅ 同步完成: 1234 条记录, 耗时 3.5s

📊 同步 ID 市场...
  ...

==================================================
✅ 同步完成!
   成功: 8/8 个市场
   总记录数: 12,345
   总耗时: 15.2s
==================================================
```

### 同步指定市场

```bash
# 只同步 SG 和 ID
python3 sync_station_data.py --markets sg,id

# 只同步 MY
python3 sync_station_data.py --markets my
```

### 调整并行度

```bash
# 使用 8 个线程并行同步
python3 sync_station_data.py --workers 8
```

## 📋 使用场景

### 场景 1: 定期同步（推荐每天执行一次）

```bash
# 添加到 crontab，每天凌晨 2 点同步
0 2 * * * cd /path/to/station_query && python3 sync_station_data.py >> logs/sync.log 2>&1
```

### 场景 2: 查询前手动同步

```bash
# 在查询前执行同步，确保数据最新
python3 sync_station_data.py

# 然后开始查询
curl "http://localhost:8888/station/name/Hub"
```

### 场景 3: 出现数据不一致时

```bash
# 发现 TEST 环境数据不对，手动同步
python3 sync_station_data.py --markets sg  # 只同步有问题的市场
```

## ⚠️ 注意事项

### 1. 网络要求

**必须满足以下条件才能同步**:
- ✅ 能够访问 ONLINE2 (10.180.129.96:8123)
- ✅ 能够访问 TEST 环境 (clickhouse-k8s-sg-prod:443)

如果无法访问 ONLINE2，会看到：
```
⚠️  ONLINE2 连接失败 (可能需要内网/VPN)
```

**解决方案**:
- 连接公司 VPN
- 在公司内网环境执行
- 使用跳板机

### 2. 数据会被清空

同步过程会 **TRUNCATE 目标表**，删除 TEST 环境的所有旧数据。

### 3. 同步时间

- 单个市场: ~3-10s
- 所有 8 个市场: ~15-30s
- 取决于数据量和网络速度

### 4. 权限要求

- 源环境: 需要 SELECT 权限
- 目标环境: 需要 INSERT 和 TRUNCATE 权限

## 🔍 故障排查

### 问题 1: ONLINE2 连接超时

**错误**:
```
⚠️  ONLINE2 连接失败 (可能需要内网/VPN)
```

**解决**:
1. 检查是否在公司网络
2. 确认 VPN 已连接
3. 测试连通性: `ping 10.180.129.96`

### 问题 2: 目标表不存在

**错误**:
```
❌ 清空目标表失败: Table doesn't exist
```

**解决**:
1. 确认 TEST 环境有对应的表
2. 检查表名是否正确

### 问题 3: 权限不足

**错误**:
```
❌ 数据同步失败: Access denied
```

**解决**:
1. 确认用户有足够权限
2. 检查密码是否正确

### 问题 4: 数据量不一致

**表现**: 源表有 1000 条，目标表只有 900 条

**排查**:
1. 查看日志中的错误信息
2. 手动验证数据量:
```bash
# 源表
curl "http://10.180.129.96:8123/?user=spx_mart&password=xxx" \
  -d "SELECT count() FROM spx_mart_manage_app.dim_spx_station_tab_sg_all"

# 目标表
curl "https://clickhouse-k8s-sg-prod:443/?user=xxx&password=xxx" \
  -d "SELECT count() FROM spx_mart_pub.dim_spx_station_tab_sg_all"
```

## 📊 同步监控

### 查看同步日志

```bash
# 实时查看
tail -f logs/sync.log

# 查看最近的同步
tail -100 logs/sync.log
```

### 验证同步结果

```bash
# 检查每个市场的数据量
python3 -c "
from station_query import StationQuery
import yaml

with open('config/clickhouse.yaml', 'r') as f:
    config = yaml.safe_load(f)

query = StationQuery(
    clickhouse_config=config['online2'],
    markets=['sg', 'id', 'my', 'th', 'ph', 'vn', 'tw', 'br'],
    max_workers=8
)

for market in ['sg', 'id', 'my']:
    count = query.client.get_table_count(f'spx_mart_pub.dim_spx_station_tab_{market}_all')
    print(f'{market.upper()}: {count:,} 条记录')
"
```

## 💡 最佳实践

1. **定期同步**: 建议每天同步一次，保持数据新鲜度
2. **查询前同步**: 重要查询前手动同步一次
3. **监控日志**: 定期检查同步日志，发现问题及时处理
4. **验证数据**: 同步后验证数据量是否符合预期
5. **备份配置**: 记录同步时间和结果

## 🔗 相关命令

```bash
# 同步前测试连接
python3 sync_station_data.py --markets sg --workers 1

# 后台运行同步
nohup python3 sync_station_data.py > logs/sync_$(date +%Y%m%d_%H%M%S).log 2>&1 &

# 同步后重启 API 服务
pkill -f station_api && nohup python3 station_api.py > logs/api.log 2>&1 &
```

---

**创建时间**: 2026-01-22  
**版本**: v1.0.0  
**状态**: ✅ 可用（需要访问内网）

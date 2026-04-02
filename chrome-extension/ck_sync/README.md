# ClickHouse 智能同步工具

> 基于元数据驱动的 ClickHouse 表同步系统

## 功能特点

- ✅ **智能依赖分析**：输入 API ID，自动解析依赖的所有表
- ✅ **多市场支持**：自动展开 {region}/{market} 变量
- ✅ **集群自动映射**：根据 ds_id 自动定位源集群
- ✅ **并行同步**：多表并行处理，提高效率
- ✅ **灵活调用**：支持命令行 + HTTP API 两种方式
- ✅ **完整DDL同步**：⭐ **新增** - 使用源表完整DDL重建目标表，保证性能和结构一致

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置数据源

编辑 `config/datasource.yaml`，配置集群映射关系：

```yaml
datasources:
  1:  # ds_id
    name: "online6"
    host: "xxx.xxx.xxx.xxx"
    port: 8123
    user: "username"
    password: "password"
  2:
    name: "online2"
    host: "xxx.xxx.xxx.xxx"
    port: 8123
    user: "username"
    password: "password"

target:  # Test 集群
  host: "test-cluster.xxx.xxx"
  port: 8123
  user: "username"
  password: "password"
  database: "test_database"
```

### 3. 使用方式

#### ⭐ **新增：完整DDL同步（推荐）**

使用源表的完整DDL重建目标表，保证性能和结构完全一致：

```bash
# 使用Python脚本
python sync_with_ddl.py

# 或直接在Python中调用
from ck_sync.sync_with_ddl import TableSyncWithDDL

syncer = TableSyncWithDDL(source_config, target_config)
syncer.sync_table(
    source_table='spx_mart_manage_app.dim_spx_driver_tab_br_all',
    target_table='spx_mart_manage_app.dim_spx_driver_tab_br_all',
    source_remote_ip='10.180.129.96',
    source_remote_user='spx_mart',
    source_remote_password='RtL3jHWkDoHp'
)
```

**为什么使用完整DDL？**
- ❌ 简化方案会导致性能崩溃、接口调用失败、数据查询错误
- ✅ 完整DDL保证排序键、分区键、引擎参数等完全一致
- ✅ 详细文档: [DDL_SYNC_GUIDE.md](./DDL_SYNC_GUIDE.md)

#### 方式一：通过 API ID 同步

```bash
# 同步单个 API 依赖的所有表
python ck_sync.py --api-id "your_api_id"

# 指定环境和市场
python ck_sync.py --api-id "your_api_id" --env live --markets sg,id,my
```

#### 方式二：直接指定表名

```bash
# 同步单张表
python ck_sync.py --table spx_mart.dws_order_sg_all

# 同步多市场表（自动展开）
python ck_sync.py --table "spx_mart.dws_order_{market}_all" --markets sg,id,my,th,ph,vn

# 批量同步多张表
python ck_sync.py --tables table1,table2,table3
```

#### 方式三：HTTP API 模式

```bash
# 启动 HTTP 服务
python ck_sync_server.py --port 8080

# 调用接口同步
curl -X POST http://localhost:8080/sync \
  -H "Content-Type: application/json" \
  -d '{
    "api_id": "your_api_id",
    "markets": ["sg", "id", "my"],
    "clear_target": true
  }'

# 直接同步表
curl -X POST http://localhost:8080/sync-table \
  -H "Content-Type: application/json" \
  -d '{
    "table": "spx_mart.dws_order_sg_all",
    "ds_id": 1
  }'
```

## 项目结构

```
ck_sync/
├── README.md                   # 本文件
├── DDL_SYNC_GUIDE.md           # ⭐ 完整DDL同步指南
├── requirements.txt            # Python 依赖
├── config/
│   ├── datasource.yaml         # 数据源配置
│   └── markets.yaml            # 市场配置
├── core/
│   ├── __init__.py
│   ├── clickhouse_client.py    # ClickHouse 客户端（支持DDL获取和修改）
│   ├── metadata_parser.py      # 元数据解析器
│   ├── sql_parser.py           # SQL 解析器（提取表依赖）
│   ├── sync_engine.py          # 同步引擎
│   └── logger.py               # 日志管理
├── sync_with_ddl.py            # ⭐ 完整DDL同步脚本
├── test_ddl.py                 # ⭐ DDL功能测试脚本
├── ck_sync.py                  # 命令行工具
├── ck_sync_server.py           # HTTP API 服务
├── tests/
│   ├── test_parser.py
│   └── test_sync.py
└── logs/
    └── sync.log                # 同步日志
```

## 高级用法

### 自定义同步选项

```bash
# 指定并行线程数
python ck_sync.py --api-id "xxx" --workers 20

# 同步前清空目标表
python ck_sync.py --table "xxx" --clear-target

# 只查看依赖，不执行同步
python ck_sync.py --api-id "xxx" --dry-run

# 增量同步（基于时间戳）
python ck_sync.py --table "xxx" --incremental --timestamp-column update_time
```

### 配置文件批量同步

创建 `sync_tasks.yaml`：

```yaml
tasks:
  - api_id: "api_001"
    markets: ["sg", "id"]
    clear_target: true
  
  - api_id: "api_002"
    markets: ["my", "th"]
    clear_target: false
  
  - table: "spx_mart.dim_product_all"
    ds_id: 1
```

执行：

```bash
python ck_sync.py --config sync_tasks.yaml
```

## 常见问题

### Q1: 如何添加新的数据源？

编辑 `config/datasource.yaml`，添加新的 ds_id 映射。

### Q2: 如何处理表结构不一致？

⭐ **推荐使用完整DDL同步方案**：
- 自动使用源表的完整DDL重建目标表
- 保证表结构、引擎参数、排序键、分区键等完全一致
- 详见：[DDL_SYNC_GUIDE.md](./DDL_SYNC_GUIDE.md)

### Q3: 同步失败如何重试？

脚本内置重试机制（默认3次），也可以查看日志后手动重新执行。

### Q4: 为什么必须使用完整DDL？

简化方案的问题：
- ❌ 使用默认引擎会导致性能崩溃
- ❌ 缺少排序键和分区键会导致查询变慢
- ❌ 下游接口可能调用失败

完整DDL方案：
- ✅ 完全复制LIVE环境的表结构
- ✅ 保证查询性能和接口兼容性
- ✅ 自动处理集群配置差异

### Q5: 如何测试DDL功能？

```bash
# 运行测试脚本
python test_ddl.py

# 查看测试结果
# - DDL获取测试
# - DDL修改测试
# - 表结构验证
```

## 监控和日志

- **实时日志**：`tail -f logs/sync.log`
- **详细报告**：同步完成后自动生成 `reports/sync_report_YYYYMMDD_HHMMSS.html`

## 性能优化建议

1. 合理设置并行度（--workers），推荐 10-20
2. 对于大表，使用增量同步（--incremental）
3. 定期清理日志文件
4. 使用 HTTP API 时，建议使用异步调用

## 安全注意事项

1. ⚠️ 配置文件包含密码，不要提交到 Git
2. ⚠️ 生产环境建议使用只读账号作为源
3. ⚠️ 建议在低峰期执行大量同步任务

## 更新日志

### v2.0.0 (2026-01-30) - ⭐ 重大更新
- ✅ **新增完整DDL同步功能**
  - 从LIVE环境获取完整的CREATE TABLE DDL
  - 自动修改DDL以适配TEST环境（处理集群配置）
  - 保证表结构、引擎参数、排序键、分区键完全一致
- ✅ 新增 `sync_with_ddl.py` - 完整DDL同步脚本
- ✅ 新增 `test_ddl.py` - DDL功能测试脚本
- ✅ 新增 `DDL_SYNC_GUIDE.md` - 完整使用文档
- ✅ 增强 `ClickHouseClient` 类
  - `get_create_table_ddl()` - 获取表DDL
  - `get_table_engine_info()` - 获取引擎信息
  - `recreate_table_with_ddl()` - 使用DDL重建表
  - `_modify_ddl_for_target()` - 修改DDL适配目标环境

### v1.0.0 (2026-01-19)
- ✅ 初始版本
- ✅ 支持 API ID 驱动同步
- ✅ 支持多市场自动展开
- ✅ 支持 HTTP API 接口


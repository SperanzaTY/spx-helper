# SPX Helper - 站点查询功能

> 快速查询 SPX 站点信息的工具，支持跨市场查询

## 📦 项目结构

```
station_query/
├── README.md                   # 功能说明和使用文档
├── USAGE.md                    # 详细使用指南
├── TECHNICAL.md                # 技术文档
├── requirements.txt            # Python 依赖
├── start.sh                    # 快速启动脚本
├── test_station_query.py       # 测试脚本
├── config/
│   ├── clickhouse.yaml.example # 配置示例
│   ├── clickhouse.yaml         # 实际配置（需自行创建）
│   └── markets.yaml            # 市场配置
├── station_query.py            # 核心查询模块
├── station_api.py              # HTTP API 服务
└── station_cli.py              # 命令行工具
```

## 🚀 快速开始（3 步）

### 1. 配置

```bash
cd station_query
cp config/clickhouse.yaml.example config/clickhouse.yaml
# 编辑 clickhouse.yaml，填入你的 ClickHouse 配置
```

### 2. 启动

```bash
./start.sh
# 或者手动启动：
# python station_api.py --port 8888
```

### 3. 使用

打开 SPX Helper Extension → 实用工具 → 站点查询

## 📖 详细文档

| 文档 | 说明 |
|------|------|
| [README.md](README.md) | 功能介绍、API 文档 |
| [USAGE.md](USAGE.md) | 使用指南、常见问题 |
| [TECHNICAL.md](TECHNICAL.md) | 技术架构、开发文档 |

## 💡 使用场景

### 场景 1: 快速查找站点

**需求**: 我知道站点 ID，想查看详细信息

**操作**:
1. 打开扩展 → 实用工具 → 站点查询
2. 输入站点 ID
3. 选择市场（可选）
4. 点击查询

**结果**: 显示站点名称、类型、状态、经理等信息

### 场景 2: 搜索站点

**需求**: 我只知道站点名称的一部分，想找到完整信息

**操作**:
1. 切换到"站点名称"标签
2. 输入关键词（如 "Central"）
3. 点击搜索

**结果**: 显示所有匹配的站点列表

### 场景 3: 批量查询

**需求**: 我有多个站点 ID，想一次性查询

**操作**:
```bash
python station_cli.py --ids 123,456,789,1011
```

**结果**: 显示所有站点的信息表格

## 🌐 支持的市场

- 🇸🇬 Singapore (SG)
- 🇮🇩 Indonesia (ID)
- 🇲🇾 Malaysia (MY)
- 🇹🇭 Thailand (TH)
- 🇵🇭 Philippines (PH)
- 🇻🇳 Vietnam (VN)
- 🇹🇼 Taiwan (TW)
- 🇧🇷 Brazil (BR)

## 🔧 功能特点

- ✅ **跨市场查询**: 一次查询，自动搜索所有市场
- ✅ **并行处理**: 多线程并行查询，速度快
- ✅ **多种方式**: Extension、命令行、API 三种使用方式
- ✅ **实时数据**: 直接连接 ClickHouse，数据最新
- ✅ **详细信息**: 站点类型、状态、经理、坐标等完整信息

## 🎯 API 端点

| 端点 | 方法 | 说明 | 示例 |
|------|------|------|------|
| `/health` | GET | 健康检查 | `curl http://localhost:8888/health` |
| `/station/id/:id` | GET | 按 ID 查询 | `curl http://localhost:8888/station/id/123456` |
| `/station/name/:name` | GET | 按名称搜索 | `curl http://localhost:8888/station/name/Central` |
| `/station/batch` | POST | 批量查询 | `curl -X POST ... -d '{"ids":[123,456]}'` |

## 📊 数据字段

| 字段 | 说明 |
|------|------|
| market | 市场代码 (sg/id/my...) |
| station_id | 站点 ID |
| station_name | 站点名称 |
| bi_station_type | 站点类型 (HUB/STATION...) |
| status | 状态 (1=正常, 0=停用) |
| city_name | 城市名称 |
| manager | 站点经理 |
| manager_email | 经理邮箱 |
| is_active_site_l7d | 近7天是否活跃 |
| latitude, longitude | 坐标 |
| address | 地址 |

## 🛠️ 命令行工具

```bash
# 查询站点 ID
python station_cli.py --id 123456

# 搜索站点名称
python station_cli.py --name "Central Hub"

# 指定市场
python station_cli.py --id 123456 --market id

# 批量查询
python station_cli.py --ids 123,456,789

# 输出 JSON
python station_cli.py --id 123456 --json
```

## 🧪 测试

运行测试脚本验证功能：

```bash
python test_station_query.py
```

输出示例：
```
==================================================
   SPX 站点查询功能测试
==================================================

🔌 测试 ClickHouse 连接...
✅ 连接成功

🔍 测试按 ID 查询（示例 ID: 123456）...
✅ 查询成功，找到 1 条记录，耗时 0.35s
   站点名称: Jakarta Central Hub
   市场: id

🔍 测试按名称查询（关键词: Hub）...
✅ 查询成功，找到 15 条记录，耗时 0.52s
   1. [ID] Jakarta Central Hub
   2. [SG] Singapore Hub
   3. [MY] Kuala Lumpur Hub

==================================================
测试完成: ✅ 4 通过, ❌ 0 失败
==================================================
```

## 🔒 安全建议

1. **配置文件**: 不要将包含密码的 `clickhouse.yaml` 提交到 Git
2. **只读账号**: 建议使用只读数据库账号
3. **API 认证**: 生产环境建议添加 API Key 认证
4. **CORS 限制**: 生产环境配置 CORS 白名单

## 📝 更新日志

### v1.0.0 (2026-01-22)
- ✅ 初始版本发布
- ✅ 支持站点 ID 和名称查询
- ✅ 跨市场自动查询功能
- ✅ Chrome Extension 集成
- ✅ HTTP API 服务
- ✅ 命令行工具
- ✅ 完整文档

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

**作者**: tianyi.liang  
**项目**: SPX Helper  
**版本**: 1.0.0  
**更新**: 2026-01-22

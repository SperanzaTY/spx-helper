# 📍 SPX 站点查询功能

> 一个完整的站点信息查询系统，支持跨市场快速查询 SPX 站点详细信息

## 🎯 功能概述

这是一个为 SPX Helper Chrome Extension 开发的站点查询工具，可以：

- ✅ 根据**站点 ID** 快速查询站点信息
- ✅ 根据**站点名称**模糊搜索站点
- ✅ **跨市场查询**（自动搜索所有8个市场）
- ✅ **批量查询**多个站点 ID
- ✅ 提供**三种使用方式**：Chrome Extension、命令行、HTTP API

## 🌍 支持的市场

🇸🇬 Singapore | 🇮🇩 Indonesia | 🇲🇾 Malaysia | 🇹🇭 Thailand  
🇵🇭 Philippines | 🇻🇳 Vietnam | 🇹🇼 Taiwan | 🇧🇷 Brazil

## 📚 快速导航

| 文档 | 说明 | 适用人群 |
|------|------|----------|
| **[📖 DEMO.md](DEMO.md)** | **快速演示和入门指南** | 🔰 新用户必看 |
| [📘 README.md](README.md) | 功能介绍、API 文档 | 想了解功能 |
| [📗 USAGE.md](USAGE.md) | 详细使用指南、常见问题 | 日常使用参考 |
| [📕 TECHNICAL.md](TECHNICAL.md) | 技术架构、开发文档 | 开发者参考 |
| [📙 INDEX.md](INDEX.md) | 项目总览 | 全面了解 |
| [📔 IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) | 实现总结 | 了解实现细节 |

## ⚡ 快速开始（3步）

```bash
# 1. 配置
cp config/clickhouse.yaml.example config/clickhouse.yaml
# 编辑 clickhouse.yaml 填入你的配置

# 2. 启动
./start.sh

# 3. 使用
# 打开 SPX Helper Extension → 实用工具 → 站点查询
```

详细步骤请查看 **[DEMO.md](DEMO.md)**

## 🎬 使用演示

### 在 Chrome Extension 中查询

<img src="screenshots/station-query-ui.png" alt="站点查询界面" width="600">

1. 打开扩展 → 实用工具 → 点击"📍 站点查询"
2. 输入站点 ID 或名称
3. 选择市场（可选）
4. 点击查询

### 命令行查询

```bash
$ python station_cli.py --id 123456

⏳ 正在连接 ClickHouse...
✅ 连接成功

🔍 查询站点 ID: 123456

✅ 找到 1 条记录:

+--------+--------+---------------------+------+--------+----------+
| 市场   | ID     | 站点名称             | 类型 | 状态   | 城市     |
+========+========+=====================+======+========+==========+
| id     | 123456 | Jakarta Central Hub | HUB  | ✅     | Jakarta  |
+--------+--------+---------------------+------+--------+----------+
```

### API 调用

```bash
$ curl "http://localhost:8888/station/id/123456" | jq

{
  "success": true,
  "data": [
    {
      "market": "id",
      "station_id": 123456,
      "station_name": "Jakarta Central Hub",
      "bi_station_type": "HUB",
      ...
    }
  ],
  "count": 1,
  "query_time": "0.35s"
}
```

## 📦 项目结构

```
station_query/
├── 📄 文档
│   ├── README.md                   # 功能说明
│   ├── DEMO.md                     # 快速演示 ⭐
│   ├── USAGE.md                    # 使用指南
│   ├── TECHNICAL.md                # 技术文档
│   ├── INDEX.md                    # 项目总览
│   └── IMPLEMENTATION_SUMMARY.md   # 实现总结
│
├── 🐍 Python 代码
│   ├── station_query.py            # 核心查询模块
│   ├── station_api.py              # HTTP API 服务
│   ├── station_cli.py              # 命令行工具
│   └── test_station_query.py       # 测试脚本
│
├── ⚙️ 配置
│   ├── config/
│   │   ├── clickhouse.yaml.example # 配置示例
│   │   └── markets.yaml            # 市场配置
│   └── requirements.txt            # Python 依赖
│
└── 🚀 脚本
    └── start.sh                    # 快速启动
```

## 🛠️ 技术栈

- **后端**: Python 3.7+, Flask
- **数据库**: ClickHouse (HTTP 接口)
- **前端**: HTML, CSS, JavaScript (Chrome Extension)
- **并发**: ThreadPoolExecutor (并行查询)
- **配置**: YAML
- **命令行**: argparse, tabulate

## 📊 性能特点

- ⚡ **并行查询**: 同时查询 8 个市场，速度提升 8 倍
- 🚀 **快速响应**: 平均查询时间 < 0.5s
- 💾 **轻量级**: 无需额外数据库，直连 ClickHouse
- 🔄 **实时数据**: 直接查询生产数据，无缓存延迟

## 🎓 适用场景

### 场景 1: 运营人员查询站点信息
"我需要快速查看某个站点的经理是谁、状态如何"

→ 使用 Extension 查询，秒级获取结果

### 场景 2: 开发人员调试
"我需要批量查询多个站点的信息用于调试"

→ 使用命令行工具或 API 调用

### 场景 3: 数据分析
"我需要导出所有某类型站点的信息"

→ 使用 API + Python 脚本批量处理

## 🔐 安全建议

- ✅ 配置文件不要提交到 Git
- ✅ 使用只读数据库账号
- ✅ 生产环境添加 API 认证
- ✅ 配置 CORS 白名单

## 📈 未来规划

- [ ] 结果缓存（Redis）
- [ ] 查询历史记录
- [ ] 批量导出为 Excel/CSV
- [ ] 地图展示站点位置
- [ ] WebSocket 实时更新
- [ ] 高级筛选和排序

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📝 更新日志

### v1.0.0 (2026-01-22)
- ✅ 初始版本发布
- ✅ 支持站点 ID 和名称查询
- ✅ 跨市场自动查询
- ✅ Chrome Extension 集成
- ✅ HTTP API 服务
- ✅ 命令行工具
- ✅ 完整文档体系

## 📞 联系方式

**项目**: SPX Helper  
**作者**: tianyi.liang  
**版本**: v1.0.0  
**创建时间**: 2026-01-22

---

## 🎯 立即开始

👉 **[查看快速演示 (DEMO.md)](DEMO.md)**

新用户请从这里开始，5分钟即可上手！

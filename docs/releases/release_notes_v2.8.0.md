# SPX Helper v2.8.0 Release Notes

## 🎉 重大更新 - 站点查询和数据同步系统

### ✨ 新增功能

#### 1. 站点快速查询系统 🔍

**功能亮点**:
- 📍 支持按站点 ID 快速查询
- 🔎 支持按站点名称模糊搜索
- 🌍 跨 8 个市场自动搜索（SG, ID, MY, TH, PH, VN, TW, BR）
- ⚡ 并行查询，秒级响应
- 📊 完整的站点维度信息

**使用方式**:
- Chrome Extension UI：实用工具 → 📍 站点查询
- HTTP API：`http://localhost:8888/station/id/:id`
- 命令行工具：`python station_cli.py --id 123456`

**技术特性**:
- Python Flask RESTful API
- ClickHouse HTTP 接口
- ThreadPoolExecutor 并行查询
- 支持演示模式（无需后端）

#### 2. 数据同步工具 🔄

**功能说明**:
- 从 ONLINE2 生产环境同步最新站点数据到 TEST 环境
- 支持全量同步或指定市场同步
- 并行同步 8 个市场
- 自动验证数据完整性

**使用方式**:
```bash
# 同步所有市场
python sync_station_data.py

# 同步指定市场
python sync_station_data.py --markets sg,id,my
```

**技术实现**:
- ClickHouse `remote()` 函数
- TRUNCATE + INSERT SELECT 模式
- 完整的错误处理和日志

#### 3. Chrome Extension 集成 🎨

**UI 改进**:
- 新增"站点查询"工具按钮
- 查询类型切换（ID / 名称）
- 市场选择下拉框
- 结果卡片展示
- 复制功能（ID / 详情）
- 连接测试功能

**交互优化**:
- 回车键快速查询
- Loading 动画
- 空状态提示
- 错误友好提示

### 📦 项目结构

新增完整的 `station_query/` 模块：
```
station_query/
├── station_query.py          # 核心查询引擎
├── station_api.py             # HTTP API 服务
├── station_cli.py             # 命令行工具
├── sync_station_data.py       # 数据同步脚本
├── config/                    # 配置文件
├── logs/                      # 日志目录
└── 文档 (8 个 MD 文件)
```

### 📚 文档体系

提供完整的文档：
- **README_CN.md** - 项目概览
- **DEMO.md** - 快速演示和入门
- **USAGE.md** - 详细使用指南
- **TECHNICAL.md** - 技术架构文档
- **SYNC_GUIDE.md** - 数据同步指南
- **WORKFLOW.md** - 完整工作流程
- **DEPLOYMENT_SUCCESS.md** - 部署总结
- **SYNC_TEST_REPORT.md** - 测试报告

### 🔧 技术栈

- **后端**: Python 3.7+, Flask, ThreadPoolExecutor
- **数据库**: ClickHouse (HTTP 接口)
- **前端**: HTML5, CSS3, JavaScript ES6
- **配置**: YAML
- **命令行**: argparse, tabulate

### 📊 性能数据

- 单个市场查询：< 0.5s
- 跨 8 个市场：~0.2-0.5s
- 并行度：8 线程
- 数据同步：15-30s (全量)

### 🌟 亮点特性

1. **演示模式**: 无需后端即可体验 UI
2. **并行查询**: ThreadPoolExecutor 多线程处理
3. **跨市场搜索**: 一次查询，遍历所有市场
4. **完整文档**: 8 个 Markdown 文档，覆盖所有场景
5. **灵活部署**: Extension / CLI / API 三种方式

### 🔐 配置要求

**站点查询**:
- TEST 环境访问（外网可达）
- API 服务运行在 localhost:8888

**数据同步**（可选）:
- ONLINE2 内网访问（需要 VPN）
- 用于同步最新数据

### 📝 使用场景

#### 场景 1: 日常查询
```
打开 Extension → 实用工具 → 站点查询
输入站点 ID 或名称 → 查看结果
```

#### 场景 2: 批量查询
```bash
python station_cli.py --ids 123,456,789
```

#### 场景 3: API 集成
```bash
curl "http://localhost:8888/station/name/Hub"
```

#### 场景 4: 数据同步
```bash
# 在公司网络下
python sync_station_data.py
```

### 🐛 Bug 修复

- 修复窗口模式多次打开的问题
- 优化时区转换输入框
- 改进错误提示信息

### 📈 统计数据

- **新增代码**: ~8,376 行
- **新增文件**: 54 个
- **文档**: ~2,900 行
- **Python 代码**: ~1,500 行

### 🚀 快速开始

#### 1. 启动 API 服务
```bash
cd station_query
pip install -r requirements.txt
./start.sh
```

#### 2. 使用 Extension
```
1. 重新加载扩展
2. 打开 实用工具 → 📍 站点查询
3. 输入查询并查看结果
```

#### 3. 数据同步（可选）
```bash
# 在公司网络下
python sync_station_data.py
```

### 🔗 相关链接

- GitHub: https://github.com/SperanzaTY/spx-helper
- 文档: `/station_query/README_CN.md`
- API 文档: `/station_query/TECHNICAL.md`

### ⚠️ 注意事项

1. 数据同步需要访问公司内网
2. 首次使用需要安装 Python 依赖
3. API 服务需要保持运行

### 🙏 致谢

感谢所有用户的反馈和支持！

---

**发布日期**: 2026-01-23  
**版本**: v2.8.0  
**类型**: Feature Release  
**重要性**: 🌟🌟🌟🌟🌟 重大功能更新

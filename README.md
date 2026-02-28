# ⚡ SPX Helper

> **Shopee 大数据开发助手** - 专为 Shopee 大数据开发工程师设计的 Chrome 扩展

[![Version](https://img.shields.io/badge/version-2.8.0-blue.svg)](https://github.com/SperanzaTY/spx-helper/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-orange.svg)]()

专为 Shopee 大数据开发工程师设计的全能工具集，集成 Chrome 扩展和数据查询工具，全方位提升开发效率！

## 🌟 核心特性

### 🎯 Chrome 扩展
- **日程管理** - Google Calendar 集成，待办事项看板
- **快速链接** - 一键访问常用大数据平台
- **AI 助手** - Smart Agent API 集成
- **实用工具** - HTTP 测试、SQL 格式化、正则测试等
- **数据溯源** - API 血缘分析，表依赖关系可视化

### 🔍 Presto 查询工具
- **Python 脚本** - 简单配置即可查询 Presto 数据库
- **Cursor MCP 集成** - 让 AI 在 Cursor 中直接查询和分析数据
- **Personal SQL API** - 基于 DataSuite 的安全认证机制

---

## ✨ Chrome 扩展功能

### 📅 今日日程
- 集成 Google Calendar，显示今日会议和待办事项
- 支持待办事项看板（待办/进行中/已完成）
- 快速添加和编辑待办事项

### 🔗 快速链接
一键访问常用的大数据平台管理界面：
- **实时框架**: Flink Dashboard, ClickHouse Web UI, Kafka Manager
- **离线框架**: Spark History Server, Hive Web UI, YARN ResourceManager, HDFS NameNode
- **Shopee 平台**: DataSuite 主页, DataSuite 文档, Grafana 监控
- **自定义链接**: 添加你自己的常用链接，支持分类管理

### 🔍 API 数据血缘分析
- **表依赖关系可视化** - 自动分析 SQL 中的表依赖
- **Mermaid 流程图** - 生成清晰的数据流向图
- **多版本对比** - 支持查看历史版本差异
- **一键溯源** - 在 DataSuite API 列表页快速触发分析
- **AI 增强分析** - 智能解读数据流向和业务逻辑

### 📝 记事本
- 支持 Markdown 渲染
- 笔记关联待办事项
- 支持分类和搜索
- 单独导出为 MD/TXT 格式

### 🛠️ 实用工具集

#### Mermaid 图表渲染
- 支持流程图、时序图、类图、ER图、甘特图、饼图等多种图表
- 高分辨率图片导出（PNG/SVG）
- 可调节清晰度（1x-32x）
- 一键复制到剪贴板

#### HTTP 请求测试
- 支持 GET/POST/PUT/DELETE/PATCH 请求方式
- 自定义 Headers 和 Body
- 多种认证方式（Bearer Token / Basic Auth / API Key / Digest / OAuth / AWS）
- JWT Token 解析和生成（支持 ApiMart）
- 请求历史记录保存

#### SQL 格式化工具
- SQL 代码格式化
- SQL 代码压缩
- 关键字大小写转换

#### Cron 表达式工具
- Cron 表达式解析
- 预览执行时间
- 常用模板快速插入

#### 正则表达式测试器
- 实时匹配测试
- 高亮显示匹配结果
- 常用正则模板

#### 文本差异对比
- 实时字符级差异对比
- 行级对齐算法
- VS Code 风格的并排显示
- 新增/删除/未变更高亮

#### 命名转换工具
- 驼峰命名 ↔ 下划线命名 ↔ 短横线命名
- 一键转换

### 💬 AI 助手
- 集成 Smart Agent API
- 支持 SQL 查询、代码生成、文档处理等多种任务
- 上下文记忆功能

### 🕐 时区转换器
支持 Shopee 各个地区的时区快速转换：
- 🇸🇬 Singapore (UTC+8)
- 🇻🇳 Vietnam (UTC+7)
- 🇹🇼 Taiwan (UTC+8)
- 🇮🇩 Indonesia (UTC+7)
- 🇲🇾 Malaysia (UTC+8)
- 🇵🇭 Philippines (UTC+8)
- 🇹🇭 Thailand (UTC+7)
- 🇨🇳 China (UTC+8)

功能：
- 时间戳 → 多时区时间转换
- 指定时区时间 → 时间戳转换
- 一键复制结果

### 🪟 独立窗口模式
- 支持常驻桌面的独立窗口
- 窗口位置和大小自动保存
- 可在弹窗和窗口模式间切换

---

## 🔍 Presto 查询工具

### 📦 工具集概述

独立的 Presto 数据查询工具集，支持两种使用方式：
1. **Python 脚本** - 配置式快速查询
2. **Cursor MCP 工具** - AI 辅助的智能查询和分析

详细文档：[presto-tools/README.md](presto-tools/README.md)

### 🚀 快速开始

#### 方式1: Python 脚本查询

```bash
cd presto-tools

# 1. 编辑配置
vi simple_query.py
# 修改: USERNAME, PERSONAL_TOKEN, SQL

# 2. 安装依赖
pip3 install requests

# 3. 运行查询
python3 simple_query.py
```

#### 方式2: Cursor MCP 工具（推荐）

```bash
cd presto-tools

# 1. 运行安装脚本
./install_mcp.sh

# 2. 按提示输入 Personal Token 和用户名

# 3. 重启 Cursor

# 4. 在 Cursor 中使用
"查询 spx_mart.dim_station 表的数据"
```

### ✨ 主要特性

- ✅ **Personal SQL API** - 基于 DataSuite 的安全认证
- ✅ **环境变量配置** - 安全管理个人凭证
- ✅ **多种输出格式** - 支持表格、JSON、CSV
- ✅ **AI 集成** - 在 Cursor 中让 AI 帮你查询和分析
- ✅ **团队共享** - 每人使用自己的 token，安全便捷

### 📖 详细文档

- [Presto 工具完整指南](presto-tools/README.md)
- [5分钟快速上手](presto-tools/QUICK_START.md)
- [Python 脚本使用指南](presto-tools/SIMPLE_QUERY_GUIDE.md)
- [MCP 工具完整手册](presto-tools/PRESTO_MCP_README.md)
- [团队分享指南](presto-tools/PRESTO_MCP_SHARING_GUIDE.md)

---

## 🚀 快速开始

### Chrome 扩展安装

#### 方式一：从源码安装（推荐）

1. 克隆或下载此仓库
```bash
git clone https://github.com/SperanzaTY/spx-helper.git
cd spx-helper
```

2. 打开 Chrome，访问 `chrome://extensions/`

3. 开启右上角的 **"开发者模式"**

4. 点击 **"加载已解压的扩展程序"**

5. 选择项目根目录 `spx-helper`

6. 完成！点击工具栏的扩展图标开始使用

#### 方式二：从 Releases 安装

1. 访问 [Releases 页面](https://github.com/SperanzaTY/spx-helper/releases)
2. 下载最新版本的 `SPX_Helper_v*.zip` 文件
3. 解压到本地目录
4. 按照方式一的步骤 2-6 操作

### 配置说明

#### Google Calendar 集成（可选）

如需使用今日日程功能，需要配置 Google Calendar API：

1. 参考 [docs/guides/GOOGLE_CALENDAR_SETUP.md](docs/guides/GOOGLE_CALENDAR_SETUP.md) 完成 OAuth 配置
2. 在扩展中点击"配置日历"完成授权

#### Smart Agent API（可选）

如需使用 AI 助手功能，需要配置 Smart Agent：

1. 参考 [docs/guides/SMART_AGENT_SETUP.md](docs/guides/SMART_AGENT_SETUP.md) 完成配置
2. 在扩展中启用 AI 助手功能

#### Presto 查询工具（可选）

如需使用 Presto 查询功能：

1. 获取 Personal Token：访问 [DataSuite API 管理](https://datasuite.shopee.io/dataservice/ds_api_management)，点击左上角三个横线菜单（☰）→ 获取Personal Token
2. 选择使用方式：
   - **Python 脚本**：编辑 `presto-tools/simple_query.py` 配置
   - **Cursor MCP**：运行 `presto-tools/install_mcp.sh` 安装

---

## 📖 文档

### Chrome 扩展文档
- [安装指南](docs/INSTALL.md)
- [用户指南](docs/USER_GUIDE.md)
- [快速开始](docs/QUICKSTART.md)
- [使用说明](docs/USAGE.md)
- [更新日志](docs/CHANGELOG.md)
- [API 集成指南](docs/api/API_INTEGRATION_GUIDE.md)

### Presto 工具文档
- [主README](presto-tools/README.md)
- [快速上手](presto-tools/QUICK_START.md)
- [Python 脚本指南](presto-tools/SIMPLE_QUERY_GUIDE.md)
- [MCP 工具手册](presto-tools/PRESTO_MCP_README.md)
- [配置指南](presto-tools/PRESTO_MCP_CONFIG_GUIDE.md)
- [团队分享指南](presto-tools/PRESTO_MCP_SHARING_GUIDE.md)

---

## 🛠️ 技术栈

### Chrome 扩展
- **Manifest V3**: Chrome 扩展最新标准
- **原生 JavaScript**: 无依赖，轻量快速
- **Chrome Storage API**: 本地数据持久化
- **Mermaid.js**: 图表渲染
- **现代化 UI**: Tab 布局，响应式设计

### Presto 查询工具
- **Python 3.6+**: 核心运行环境
- **MCP (Model Context Protocol)**: Cursor AI 集成
- **Personal SQL API**: DataSuite 数据服务
- **Requests**: HTTP 请求库

---

## 📦 项目结构

```
spx-helper/
├── manifest.json              # 扩展配置文件
├── popup.html                 # 主界面 HTML
├── popup.js                   # 核心逻辑
├── styles.css                 # 样式文件
├── background.js              # 后台服务 Worker (含Presto查询逻辑)
├── content.js                 # 内容脚本 (API溯源功能)
├── injected.js                # 注入脚本 (页面交互)
├── calendar-config.html       # 日历配置页面
├── calendar-config.js         # 日历配置逻辑
├── mermaid.min.js             # Mermaid 图表库
├── images/                    # 图标资源
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   └── icon.svg
├── docs/                      # 扩展文档目录
│   ├── guides/               # 配置指南
│   ├── api/                  # API 文档
│   └── images/               # 文档图片
├── presto-tools/             # Presto 查询工具集 🆕
│   ├── README.md             # 工具集主文档
│   ├── simple_query.py       # 简化版查询脚本
│   ├── query_presto.py       # 命令行查询工具
│   ├── presto_mcp_server.py  # Cursor MCP 服务器
│   ├── install_mcp.sh        # MCP 自动安装脚本
│   ├── example_use_in_code.py # 代码集成示例
│   └── *.md                  # 详细使用文档
├── scripts/                  # 辅助脚本 🆕
│   ├── build/               # 构建和打包脚本
│   ├── release/             # 发布相关脚本
│   └── test/                # 测试脚本
└── README.md                 # 项目主说明
```

---

## 🔧 开发

### 本地开发

1. 克隆仓库
2. 按照"安装方法"加载扩展
3. 修改代码后，在 `chrome://extensions/` 页面点击"重新加载"

### 打包发布

```bash
# 使用打包脚本
cd scripts/build
./package-release.sh

# 或手动打包
zip -r SPX_Helper_v2.8.0.zip . \
  -x "*.git*" -x "*.DS_Store" -x "node_modules/*" \
  -x "*.zip" -x "*.html.backup" -x "archives/*" \
  -x "test/*" -x "share-package/*"
```

### 开发 Presto 工具

```bash
cd presto-tools

# 测试 Python 脚本
python3 simple_query.py

# 测试 MCP 服务器
python3 presto_mcp_server.py
```

---

## 📝 更新日志

### v2.8.0 (2026-02-28) 🆕
- ✨ **新增**: Presto 查询工具集
  - Python 脚本查询工具
  - Cursor MCP AI 集成
  - Personal SQL API 支持
- ✨ **新增**: API 数据血缘分析功能
  - 自动解析 SQL 表依赖
  - Mermaid 流程图可视化
  - AI 增强分析
- 🔧 **改进**: 整理项目目录结构
  - 新增 `presto-tools/` 工具目录
  - 新增 `scripts/` 脚本目录
  - 优化文档组织

### v2.7.x
- 🐛 修复窗口模式相关问题
- 🔧 改进 Service Worker 稳定性

### v2.6.x
- ✨ 新增文本差异对比工具
- ✨ 新增命名转换工具
- 🔧 优化 UI 交互体验

查看 [CHANGELOG.md](docs/CHANGELOG.md) 了解详细更新内容。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 许可证。

---

## 👤 作者

**tianyi.liang**

- GitHub: [@SperanzaTY](https://github.com/SperanzaTY)
- Email: tianyi.liang@shopee.com

---

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者！

特别感谢：
- Shopee Data Engineering Team
- 所有使用和反馈的同事们

---

## 🔗 相关链接

- [DataSuite](https://datasuite.shopee.io)
- [DataSuite API 管理](https://datasuite.shopee.io/dataservice/ds_api_management)
- [Chrome Extensions 文档](https://developer.chrome.com/docs/extensions/)
- [Cursor MCP 文档](https://docs.cursor.com)

---

**SPX Helper** - 让大数据开发更高效！⚡

Made with ❤️ for Shopee Data Engineers

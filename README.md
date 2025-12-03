# ⚡ SPX Helper

> **Shopee 大数据开发助手** - 专为 Shopee 大数据开发工程师设计的 Chrome 扩展

[![Version](https://img.shields.io/badge/version-2.6.6-blue.svg)](https://github.com/SperanzaTY/spx-helper/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-orange.svg)]()

专为 Shopee 大数据开发工程师设计的 Chrome 扩展，提升日常工作效率！

## ✨ 核心功能

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

## 🚀 快速开始

### 安装方法

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

## 📖 文档

- [安装指南](docs/INSTALL.md)
- [用户指南](docs/USER_GUIDE.md)
- [快速开始](docs/QUICKSTART.md)
- [使用说明](docs/USAGE.md)
- [更新日志](docs/CHANGELOG.md)
- [API 集成指南](docs/api/API_INTEGRATION_GUIDE.md)

## 🛠️ 技术栈

- **Manifest V3**: Chrome 扩展最新标准
- **原生 JavaScript**: 无依赖，轻量快速
- **Chrome Storage API**: 本地数据持久化
- **Mermaid.js**: 图表渲染
- **现代化 UI**: Tab 布局，响应式设计

## 📦 项目结构

```
spx-helper/
├── manifest.json              # 扩展配置文件
├── popup.html                 # 主界面 HTML
├── popup.js                   # 核心逻辑
├── styles.css                 # 样式文件
├── background.js              # 后台服务 Worker
├── calendar-config.html       # 日历配置页面
├── calendar-config.js         # 日历配置逻辑
├── mermaid.min.js             # Mermaid 图表库
├── images/                    # 图标资源
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   └── icon.svg
├── docs/                      # 文档目录
│   ├── guides/               # 配置指南
│   ├── api/                  # API 文档
│   └── images/               # 文档图片
└── README.md                  # 项目说明
```

## 🔧 开发

### 本地开发

1. 克隆仓库
2. 按照"安装方法"加载扩展
3. 修改代码后，在 `chrome://extensions/` 页面点击"重新加载"

### 打包发布

```bash
# 创建发布包
zip -r SPX_Helper_v2.6.6.zip . -x "*.git*" -x "*.DS_Store" -x "node_modules/*" -x "*.zip" -x "*.html.backup" -x "image/*" -x "releases/*" -x "test.html"
```

## 📝 更新日志

查看 [CHANGELOG.md](docs/CHANGELOG.md) 了解详细更新内容。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 [MIT License](LICENSE) 许可证。

## 👤 作者

**tianyi.liang**

- GitHub: [@SperanzaTY](https://github.com/SperanzaTY)

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者！

---

**SPX Helper** - 让大数据开发更高效！⚡

Made with ❤️ for Shopee Data Engineers

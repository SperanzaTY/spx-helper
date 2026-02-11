# 项目结构整理说明

## ✅ 已完成的工作

### 1. 文件结构整理
- ✅ 创建 `docs/` 目录，整理所有文档文件
- ✅ 创建 `docs/guides/` 目录，存放配置指南
- ✅ 创建 `docs/api/` 目录，存放 API 文档
- ✅ 创建 `docs/images/` 目录，用于存放文档图片

### 2. 配置文件更新
- ✅ 更新 `.gitignore`，忽略构建产物和临时文件
- ✅ 创建 `LICENSE` 文件（MIT License）
- ✅ 更新 `README.md`，添加 GitHub 相关信息

### 3. 文档分类

#### 用户文档（docs/）
- `INSTALL.md` - 安装指南
- `USER_GUIDE.md` / `USER_GUIDE.html` - 用户指南
- `QUICKSTART.md` - 快速开始
- `USAGE.md` - 使用说明
- `CHANGELOG.md` - 更新日志
- `快速安装指南.md` - 快速安装指南（中文）
- `发布说明.md` - 发布说明（中文）

#### 配置指南（docs/guides/）
- `GOOGLE_CALENDAR_SETUP.md` - Google Calendar 配置
- `OAUTH_SETUP_QUICK.md` - OAuth 快速配置
- `SMART_AGENT_SETUP.md` - Smart Agent 配置
- `MAC_NOTIFICATION_GUIDE.md` - Mac 通知配置

#### API 文档（docs/api/）
- `API_INTEGRATION_GUIDE.md` - API 集成指南
- `AGENT_SYSTEM_PROMPT.md` - Agent 系统提示词

#### 项目文档（docs/）
- `DISTRIBUTION.md` - 分发指南
- `CATEGORY_MANAGEMENT.md` - 分类管理
- `CONFLUENCE_DOC.md` - Confluence 文档
- `PROJECT_OVERVIEW.md` - 项目概览
- `PROJECT_SUMMARY.txt` - 项目总结
- `INDEX.md` - 索引

## 📋 推送前检查清单

### ⚠️ 重要：检查敏感信息

在推送代码前，请检查以下文件是否包含敏感信息：

1. **manifest.json**
   - [ ] `oauth2.client_id` - 如果这是公开仓库，考虑使用环境变量
   - [ ] `key` - 扩展密钥，建议移除或使用环境变量

2. **popup.js / background.js**
   - [ ] 检查是否有硬编码的 API keys
   - [ ] 检查是否有内部服务地址

3. **calendar-config.js**
   - [ ] 检查是否有敏感配置

### 📝 需要更新的内容

1. **README.md**
   - [x] 更新 GitHub 用户名和仓库名：SperanzaTY/spx-helper
   - [ ] 更新 GitHub 链接
   - [ ] 更新 Chrome Web Store 链接（如果有）

2. **popup.js**
   - [ ] 更新更新检查功能中的 GitHub 仓库地址（如果使用）

## 🚀 推送到 GitHub 的步骤

### 1. 初始化 Git 仓库

```bash
cd /Users/tianyi.liang/Cursor/SPX_Helper
git init
git add .
git commit -m "Initial commit: SPX Helper v2.6.6"
```

### 2. 在 GitHub 创建仓库

1. 访问 https://github.com/new
2. 仓库名：`spx-helper`（或你喜欢的名字）
3. 描述：`Shopee 大数据开发助手 Chrome 扩展`
4. 选择 Public 或 Private
5. **不要**勾选 "Initialize this repository with a README"（我们已经有了）
6. 点击 "Create repository"

### 3. 推送代码

```bash
git branch -M main
git remote add origin https://github.com/SperanzaTY/spx-helper.git
git push -u origin main
```

### 4. 创建第一个 Release

1. 访问仓库的 Releases 页面
2. 点击 "Create a new release"
3. Tag: `v2.6.6`
4. Title: `SPX Helper v2.6.6`
5. Description: 从 `docs/CHANGELOG.md` 复制最新版本的内容
6. 上传 `SPX_Helper_v2.6.6.zip` 文件
7. 点击 "Publish release"

### 5. 配置更新检查（可选）

如果希望用户能够自动检查更新：

1. 在设置面板中配置 GitHub 仓库地址
2. 格式：`SperanzaTY/spx-helper`
3. 确保 Releases 页面有版本标签（格式：`v2.6.6`）

## 📁 最终项目结构

```
spx-helper/
├── .gitignore
├── .github/
│   └── README.md
├── LICENSE
├── README.md
├── PROJECT_STRUCTURE.md
├── manifest.json
├── popup.html
├── popup.js
├── styles.css
├── background.js
├── calendar-config.html
├── calendar-config.js
├── mermaid.min.js
├── package.json
├── create-release.sh
├── images/
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   ├── icon.svg
│   └── README.md
└── docs/
    ├── guides/
    ├── api/
    ├── images/
    └── [各种文档文件]
```

## 🎯 下一步建议

1. **添加 GitHub Actions**（可选）
   - 自动打包发布
   - 自动创建 Release

2. **添加 Issue 模板**（可选）
   - Bug 报告模板
   - 功能请求模板

3. **添加 Pull Request 模板**（可选）

4. **添加贡献指南**（可选）
   - `CONTRIBUTING.md`

5. **添加代码规范**（可选）
   - ESLint 配置
   - Prettier 配置

---

**项目已整理完成，可以推送到 GitHub！** 🎉


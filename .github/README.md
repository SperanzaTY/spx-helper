# GitHub 仓库说明

本项目已整理好，可以直接推送到 GitHub。

## 项目结构

```
spx-helper/
├── manifest.json              # Chrome 扩展配置文件
├── popup.html                 # 主界面 HTML
├── popup.js                   # 核心逻辑（约 5700 行）
├── styles.css                 # 样式文件（约 4600 行）
├── background.js              # 后台服务 Worker
├── calendar-config.html       # 日历配置页面
├── calendar-config.js         # 日历配置逻辑
├── mermaid.min.js             # Mermaid 图表库（第三方）
│
├── images/                    # 图标资源
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   └── icon.svg
│
├── docs/                      # 文档目录
│   ├── guides/               # 配置指南
│   │   ├── GOOGLE_CALENDAR_SETUP.md
│   │   ├── OAUTH_SETUP_QUICK.md
│   │   ├── SMART_AGENT_SETUP.md
│   │   └── MAC_NOTIFICATION_GUIDE.md
│   ├── api/                  # API 文档
│   │   ├── API_INTEGRATION_GUIDE.md
│   │   └── AGENT_SYSTEM_PROMPT.md
│   ├── images/               # 文档图片（空目录）
│   ├── INSTALL.md            # 安装指南
│   ├── USER_GUIDE.md         # 用户指南
│   ├── USER_GUIDE.html       # 用户指南（HTML 版本）
│   ├── QUICKSTART.md         # 快速开始
│   ├── USAGE.md              # 使用说明
│   ├── CHANGELOG.md          # 更新日志
│   ├── DISTRIBUTION.md       # 分发指南
│   ├── CATEGORY_MANAGEMENT.md
│   ├── CONFLUENCE_DOC.md
│   ├── PROJECT_OVERVIEW.md
│   ├── PROJECT_SUMMARY.txt
│   ├── INDEX.md
│   ├── 发布说明.md
│   └── 快速安装指南.md
│
├── .gitignore                # Git 忽略文件配置
├── README.md                 # 项目主文档
├── LICENSE                   # MIT 许可证
└── package.json              # Node.js 项目配置（可选）
```

## 已忽略的文件

以下文件/目录已被 `.gitignore` 忽略，不会提交到 GitHub：

- `*.zip` - 所有压缩包文件
- `releases/` - 构建输出目录
- `image/` - 临时截图目录
- `test.html` - 测试文件
- `*.html.backup` - 备份文件
- `node_modules/` - 依赖包（如果有）
- `.DS_Store` - macOS 系统文件
- `key.pem` - 密钥文件

## 推送前检查清单

- [x] 更新 `.gitignore`
- [x] 整理文档到 `docs/` 目录
- [x] 更新 `README.md`
- [x] 创建 `LICENSE` 文件
- [ ] 检查敏感信息（API keys, tokens 等）
- [x] 更新 README.md 中的 GitHub 用户名和仓库名：SperanzaTY/spx-helper

## 下一步

1. 在 GitHub 创建新仓库
2. 更新 `README.md` 中的 GitHub 链接
3. 初始化 Git 并推送：

```bash
git init
git add .
git commit -m "Initial commit: SPX Helper v2.6.6"
git branch -M main
git remote add origin https://github.com/SperanzaTY/spx-helper.git
git push -u origin main
```

4. 创建第一个 Release：
   - Tag: `v2.6.6`
   - Title: `SPX Helper v2.6.6`
   - Description: 从 `docs/CHANGELOG.md` 复制内容


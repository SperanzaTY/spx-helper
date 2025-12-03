# SPX Helper - 分发指南

## 📦 打包方式

Chrome扩展有两种分发方式：

### 方式一：开发者模式安装（推荐）

**优点**：
- 简单快速
- 无需Chrome Web Store审核
- 适合内部团队使用

**步骤**：
1. 将整个项目文件夹打包成 `.zip` 文件
2. 用户解压后，在Chrome中加载

### 方式二：Chrome Web Store发布

**优点**：
- 自动更新
- 用户信任度高
- 一键安装

**缺点**：
- 需要付费开发者账号（$5一次性）
- 需要审核（1-3天）

---

## 📋 打包清单

### 必需文件：
- ✅ manifest.json
- ✅ popup.html
- ✅ popup.js
- ✅ background.js
- ✅ styles.css
- ✅ images/（图标文件夹）
  - icon16.png
  - icon48.png
  - icon128.png

### 文档文件（可选）：
- README.md
- INSTALL.md
- CATEGORY_MANAGEMENT.md
- DISTRIBUTION.md（本文件）

### 开发文件（不需要打包）：
- ❌ package.json
- ❌ node_modules/
- ❌ .git/
- ❌ *.md（除了README.md）
- ❌ AGENT_SYSTEM_PROMPT.md
- ❌ API_INTEGRATION_GUIDE.md
- ❌ MAC_NOTIFICATION_GUIDE.md
- ❌ SMART_AGENT_SETUP.md

---

## 🎁 创建分发包

### 自动打包（推荐）

运行打包脚本：
```bash
./create-release.sh
```

这将创建：
- `SPX_Helper_v2.0.0.zip` - 完整扩展包
- `releases/` 文件夹

### 手动打包

1. 创建新文件夹 `SPX_Helper_Release`
2. 复制以下文件到该文件夹：
   ```
   SPX_Helper_Release/
   ├── manifest.json
   ├── popup.html
   ├── popup.js
   ├── background.js
   ├── styles.css
   ├── README.md
   ├── INSTALL.md
   └── images/
       ├── icon16.png
       ├── icon48.png
       └── icon128.png
   ```
3. 压缩为 `.zip` 文件

---

## 📖 用户安装指南

### 步骤1：下载扩展包
获取 `SPX_Helper_v2.0.0.zip` 文件

### 步骤2：解压文件
解压到任意位置，记住文件夹路径

### 步骤3：加载扩展
1. 打开Chrome浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择解压后的文件夹
6. 完成！扩展图标会出现在工具栏

### 步骤4：固定图标（可选）
- 点击工具栏拼图图标
- 找到"SPX Helper"
- 点击📌固定到工具栏

---

## 🔄 更新扩展

### 用户端更新：
1. 下载新版本zip
2. 解压到新位置
3. 在 `chrome://extensions/` 中：
   - 删除旧版本
   - 加载新版本

### 自动更新（需Chrome Web Store）：
- 发布到商店后自动推送更新

---

## ⚠️ 注意事项

### 安全提示：
1. 仅从可信来源获取扩展
2. 检查 `manifest.json` 中的权限
3. 定期更新到最新版本

### 权限说明：
- `storage` - 保存配置和数据
- `alarms` - 定时提醒（未来功能）
- `notifications` - 桌面通知
- `activeTab` - 访问当前标签页
- `https://smart.shopee.io/*` - 访问Smart平台API

### 兼容性：
- Chrome 88+
- Edge 88+
- Opera 74+
- Brave 1.20+

---

## 📝 版本历史

### v2.0.0 (2024-11-14)
- ✨ 全新架构
- 🔗 快速链接管理（可编辑分类）
- 📋 代码片段管理（ClickHouse、Presto、Spark）
- 🛠️ 实用工具（时区转换、JSON工具、命名转换）
- 💬 Code Helper（SQL助手）
- ✅ TODO列表管理

---

## 🆘 常见问题

**Q: 扩展图标不显示？**
A: 点击工具栏的拼图图标，将SPX Helper固定

**Q: 提示"开发者模式扩展"？**
A: 这是正常的，因为不是从商店安装

**Q: 数据会丢失吗？**
A: 所有数据保存在本地，不会上传

**Q: 如何卸载？**
A: chrome://extensions/ → 找到SPX Helper → 删除

**Q: 支持Firefox吗？**
A: 目前仅支持Chrome内核浏览器

---

## 📧 反馈与支持

- 作者：tianyi.liang
- 版本：v2.0.0
- 问题反馈：联系开发者


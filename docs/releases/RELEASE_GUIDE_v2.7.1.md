# 发布 v2.7.1 Release 指南

## ✅ 已完成的步骤

1. ✅ 更新 manifest.json 版本号到 2.7.1
2. ✅ 创建 release notes (release_notes_v2.7.1.md)
3. ✅ 打包生成 SPX_Helper_v2.7.1.zip
4. ✅ 提交代码到 GitHub
5. ✅ 创建并推送 git tag v2.7.1

## 📦 手动创建 GitHub Release

### 步骤 1: 访问 Releases 页面

打开浏览器访问：
```
https://github.com/SperanzaTY/spx-helper/releases/new?tag=v2.7.1
```

### 步骤 2: 填写 Release 信息

**Tag:** `v2.7.1` (已自动选择)

**Release title:** 
```
v2.7.1 - FMS快速入口功能
```

**Description:** 复制以下内容

```markdown
## 🎉 新功能

### FMS SPX Admin 快速入口
- ✨ 新增FMS快速入口功能，支持快速访问不同环境的FMS系统
- 🏷️ 支持5种环境：LIVE、UAT、TEST、TEST-STABLE、STAGING
- 🌍 覆盖8个市场：ID、MY、TH、PH、VN、SG、TW、BR
- 📑 标签页切换设计，一键切换不同环境

## 🎨 UI优化

### 统一快速入口卡片
- 🔄 将DataSuite和FMS快速入口合并到一个卡片中
- 💎 统一使用紫色渐变背景，视觉更协调
- 📏 优化布局，节省约30%的垂直空间
- ✨ 通过分隔线清晰区分功能区域

### 视觉优化
- 🎯 简化市场按钮，移除国旗emoji
- 🧹 移除废弃的XX和MX市场
- 🎨 悬停效果更流畅，交互体验更好

## 💡 使用方式

1. 打开扩展，切换到 **🔗 快速链接** Tab
2. 在快速入口卡片中可以看到：
   - 上半部分：DataSuite快速入口（DataMap、DataHub等）
   - 下半部分：FMS快速入口
3. 点击环境标签（如LIVE、UAT等）切换环境
4. 点击市场按钮快速跳转到对应的FMS系统

## 📦 安装更新

### Chrome 网上应用店（推荐）
自动更新，无需手动操作

### 手动安装
1. 下载 `SPX_Helper_v2.7.1.zip`
2. 解压文件
3. 打开 Chrome 扩展管理页面
4. 开启"开发者模式"
5. 点击"加载已解压的扩展程序"
6. 选择解压后的文件夹

## 📝 更新日志

### v2.7.1 (2024-12-18)
- feat: 添加FMS SPX Admin快速入口功能
- feat: 合并DataSuite和FMS快速入口到统一卡片
- style: 优化快速入口UI，统一视觉风格
- refactor: 移除废弃的XX和MX市场
- docs: 添加FMS功能详细说明文档

---

**Full Changelog**: https://github.com/SperanzaTY/spx-helper/compare/v2.7.0...v2.7.1
```

### 步骤 3: 上传文件

点击 "Attach binaries by dropping them here or selecting them" 区域，上传文件：

📦 **SPX_Helper_v2.7.1.zip** (位置: `/Users/tianyi.liang/Cursor/SPX_Helper/SPX_Helper_v2.7.1.zip`)

### 步骤 4: 发布

- ✅ 勾选 "Set as the latest release"
- 点击 "Publish release" 按钮

## 🎉 完成！

发布后，用户可以通过以下链接访问：
- Release 页面: https://github.com/SperanzaTY/spx-helper/releases/tag/v2.7.1
- 下载链接: https://github.com/SperanzaTY/spx-helper/releases/download/v2.7.1/SPX_Helper_v2.7.1.zip

---

## 📋 快速链接

- **创建 Release**: https://github.com/SperanzaTY/spx-helper/releases/new?tag=v2.7.1
- **所有 Releases**: https://github.com/SperanzaTY/spx-helper/releases
- **项目主页**: https://github.com/SperanzaTY/spx-helper






# 发布 v2.7.2 Release 快速指南

## ✅ 已完成的步骤

1. ✅ 更新 manifest.json 版本号到 2.7.2
2. ✅ 创建 release notes (release_notes_v2.7.2.md)
3. ✅ 打包生成 SPX_Helper_v2.7.2.zip
4. ✅ 提交代码到 GitHub
5. ✅ 创建并推送 git tag v2.7.2

## 📦 创建 GitHub Release

### 步骤 1: 填写 Release 信息

**Tag:** `v2.7.2` (已自动选择)

**Release title:** 
```
v2.7.2 - 时区转换工具修复
```

**Description:** 复制以下内容

```markdown
## 🐛 Bug修复

### 时区转换工具优化
- ✅ 修复反向转换（时间 → 时间戳）中缺少BR（巴西）时区选项的问题
- ✅ 优化时间输入框，移除默认时间示例，改为格式说明提示
- ✅ 改进用户体验，时间输入框现在显示格式提示而非具体日期

## 📝 更新详情

### 修复内容
1. **添加BR时区选项**
   - 在"反向转换（时间 → 时间戳）"的下拉菜单中添加了Brazil (BR)选项
   - 使用时区：America/Sao_Paulo
   - 现在所有8个时区（SG/VN/ID/MY/PH/TH/CN/BR）都支持双向转换

2. **优化时间输入框**
   - 移除了具体的默认时间示例（2025-11-14 16:30:00）
   - 改为格式说明提示：`输入日期时间 (格式: YYYY-MM-DD HH:mm:ss)`
   - 避免用户误以为需要输入特定日期

## 💡 使用说明

### 时区转换工具
1. **时间戳 → 时间**：输入时间戳，自动显示所有8个时区的对应时间
2. **时间 → 时间戳**：
   - 输入日期时间（格式：YYYY-MM-DD HH:mm:ss）
   - 选择源时区（现在包含BR选项）
   - 点击"转换为时间戳"获取结果

## 📦 安装更新

### Chrome 网上应用店（推荐）
自动更新，无需手动操作

### 手动安装
1. 下载 `SPX_Helper_v2.7.2.zip`
2. 解压文件
3. 打开 Chrome 扩展管理页面
4. 开启"开发者模式"
5. 点击"加载已解压的扩展程序"
6. 选择解压后的文件夹

## 📝 更新日志

### v2.7.2 (2024-12-18)
- fix: 添加BR时区到反向转换下拉菜单
- fix: 优化时间输入框placeholder，移除默认时间示例
- style: 改进时区转换工具的用户体验

---

**Full Changelog**: https://github.com/SperanzaTY/spx-helper/compare/v2.7.1...v2.7.2
```

### 步骤 2: 上传文件

点击 "Attach binaries by dropping them here or selecting them" 区域，上传文件：

📦 **SPX_Helper_v2.7.2.zip** 
位置: `/Users/tianyi.liang/Cursor/SPX_Helper/SPX_Helper_v2.7.2.zip`

### 步骤 3: 发布

- ✅ 勾选 "Set as the latest release"
- 点击 "Publish release" 按钮

## 🎉 完成！

发布后，用户可以通过以下链接访问：
- Release 页面: https://github.com/SperanzaTY/spx-helper/releases/tag/v2.7.2
- 下载链接: https://github.com/SperanzaTY/spx-helper/releases/download/v2.7.2/SPX_Helper_v2.7.2.zip

---

## 📋 快速链接

- **创建 Release**: https://github.com/SperanzaTY/spx-helper/releases/new?tag=v2.7.2
- **所有 Releases**: https://github.com/SperanzaTY/spx-helper/releases
- **项目主页**: https://github.com/SperanzaTY/spx-helper





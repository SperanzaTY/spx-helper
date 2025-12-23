# SPX Helper v2.7.2 Release Notes

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

## 🔗 相关链接

- [GitHub Repository](https://github.com/SperanzaTY/spx-helper)
- [问题反馈](https://github.com/SperanzaTY/spx-helper/issues)

## 📝 更新日志

### v2.7.2 (2024-12-18)
- fix: 添加BR时区到反向转换下拉菜单
- fix: 优化时间输入框placeholder，移除默认时间示例
- style: 改进时区转换工具的用户体验

---

**Full Changelog**: https://github.com/SperanzaTY/spx-helper/compare/v2.7.1...v2.7.2

感谢使用 SPX Helper！如有问题或建议，欢迎提交 Issue。


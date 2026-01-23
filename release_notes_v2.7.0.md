# SPX Helper v2.7.0 - Gmail 邮件集成

## 🎉 重大更新

### ✨ 新功能：Gmail 邮件模块

全新的 Gmail 邮件集成功能，让你在扩展中直接管理邮件！

#### 📬 主要功能

1. **邮件统计面板**
   - 📊 实时显示未读邮件数量
   - 📈 总邮件数统计
   - ⭐ 星标邮件计数

2. **智能筛选**
   - 🔍 按状态筛选：全部/未读/星标/重要
   - 🔎 关键词搜索：快速查找邮件

3. **邮件列表**
   - 📧 显示最近 20 封邮件
   - 👤 发件人信息
   - 📝 邮件主题和摘要
   - ⏰ 智能时间显示（刚刚/分钟前/小时前/天前）
   - 🏷️ 标签显示（星标/重要）

4. **快捷操作**
   - 📖 直接在 Gmail 网页中打开邮件
   - ✅ 一键标记为已读
   - 🔄 刷新邮件列表

5. **OAuth 2.0 安全授权**
   - 🔐 使用 Google 官方授权流程
   - 🛡️ 仅请求必要的只读权限
   - 🔄 自动处理 Token 过期

## 🔧 配置说明

### 首次使用需要授权

1. 点击 "📬 邮件" 标签
2. 点击 "🔑 授权 Gmail 访问" 按钮
3. 在弹出的 Google 授权窗口中选择账号并同意授权
4. 授权成功后即可查看邮件

### 权限说明

扩展请求的 Gmail 权限：
- `gmail.readonly` - 只读访问邮件
- `gmail.labels` - 读取邮件标签（用于筛选）

**注意**：扩展无法删除或修改邮件内容，仅能查看和标记已读。

## 📋 其他改进

- ✅ 更新到 v2.7.0
- ✅ 优化界面布局
- ✅ 改进错误处理

## 📦 安装方法

1. 下载 `SPX_Helper_v2.7.0.zip` 文件
2. 解压到本地目录
3. 打开 Chrome，访问 `chrome://extensions/`
4. 开启"开发者模式"
5. 点击"加载已解压的扩展程序"
6. 选择解压后的 `SPX_Helper` 文件夹

## 🔄 从旧版本升级

如果你是从旧版本更新：
1. **重要**：先导出数据（设置 → 导出数据）
2. 移除旧版本扩展
3. 安装新版本
4. 导入之前导出的数据
5. 重新授权 Google Calendar 和 Gmail（如果使用）

## ⚠️ Google Cloud Console 配置

如果你想使用 Gmail 功能，需要在 Google Cloud Console 中：

1. 启用 **Gmail API**
2. 在 OAuth 同意屏幕中添加作用域：
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.labels`

详细配置步骤参考：`docs/guides/GOOGLE_CALENDAR_SETUP.md`（Gmail 配置类似）

## 📚 完整功能列表

- 📅 Google Calendar 日历集成
- 📬 Gmail 邮件集成 **[新增]**
- 📋 快速链接管理
- 📝 笔记管理
- ✅ 待办事项（看板视图）
- 🛠️ 实用工具集合
  - ⏰ 时区转换
  - 📋 JSON 格式化
  - 🗃️ SQL 格式化
  - ⏱️ Cron 表达式
  - 🔍 正则表达式测试
  - 📝 文本对比
  - 🔤 命名格式转换
  - 📊 Mermaid 图表
  - 🌐 HTTP 请求测试
- 🤖 AI 智能助手

## 🙏 反馈与支持

如有问题或建议，欢迎在 [GitHub Issues](https://github.com/SperanzaTY/spx-helper/issues) 提出。

---

**Enjoy! 🎉**









# Google Calendar 集成设置指南

## ⚠️ 重要说明

要使用"今日日程"功能，需要配置 Google OAuth 2.0 客户端 ID。这是一次性设置，之后所有用户都可以直接使用。

## 🔧 设置步骤

### 1. 创建 Google Cloud 项目

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 点击"创建项目"或选择现有项目
3. 项目名称：`SPX Helper` (或自定义)

### 2. 启用 Google Calendar API

1. 在左侧菜单中选择"API和服务" → "库"
2. 搜索 "Google Calendar API"
3. 点击"启用"

### 3. 配置 OAuth 同意屏幕

1. 在左侧菜单选择"API和服务" → "OAuth 同意屏幕"
2. 用户类型选择"外部"
3. 填写应用信息：
   - 应用名称：`SPX Helper`
   - 用户支持电子邮件：你的邮箱
   - 开发者联系信息：你的邮箱
4. 点击"保存并继续"
5. 在"作用域"页面，点击"添加或移除作用域"
   - 搜索并添加：`https://www.googleapis.com/auth/calendar.readonly`
6. 点击"保存并继续"
7. 添加测试用户（如果是外部应用）
   - 添加需要使用的 Google 账号邮箱

### 4. 创建 OAuth 2.0 客户端 ID

1. 在左侧菜单选择"API和服务" → "凭据"
2. 点击"创建凭据" → "OAuth 客户端 ID"
3. 应用类型选择："Chrome 应用"
4. 名称：`SPX Helper Chrome Extension`
5. 应用 ID：
   - 在 Chrome 地址栏输入：`chrome://extensions/`
   - 找到 SPX Helper，复制其扩展 ID（类似：`abcdefghijklmnopqrstuvwxyz123456`）
   - 粘贴到"应用 ID"字段
6. 点击"创建"
7. 记录下生成的**客户端 ID**（格式类似：`123456789-abcdefg.apps.googleusercontent.com`）

### 5. 更新 manifest.json

将 `manifest.json` 中的 `YOUR_CLIENT_ID` 替换为你的实际客户端 ID：

```json
"oauth2": {
  "client_id": "123456789-abcdefg.apps.googleusercontent.com",
  "scopes": [
    "https://www.googleapis.com/auth/calendar.readonly"
  ]
}
```

### 6. 重新加载扩展

1. 打开 `chrome://extensions/`
2. 找到 SPX Helper
3. 点击"重新加载"按钮

## ✅ 使用流程

配置完成后，用户使用流程：

1. 打开 SPX Helper 扩展
2. 切换到"今日日程"标签
3. 首次使用时，点击"🔑 授权访问"按钮
4. 在弹出的 Google 登录窗口中：
   - 选择 Google 账号
   - 点击"允许"授权读取日历
5. 授权成功后，自动加载并显示今天的日程
6. 之后每次打开扩展都会自动加载日程，无需重新授权

## 🎯 功能特点

- ✅ 自动加载今天的所有日程
- ✅ 显示时间、标题、描述、地点
- ✅ 支持全天事件
- ✅ 支持 Google Meet 会议链接
- ✅ 点击刷新按钮可手动更新
- ✅ Token 自动管理，过期自动重新授权

## 🔒 隐私说明

- 扩展只请求**只读**权限（`calendar.readonly`）
- 无法修改、删除或创建日程
- 所有数据直接从 Google Calendar API 获取
- 不会上传或存储任何日历数据

## 📝 注意事项

1. **客户端 ID 必须正确**：确保与扩展 ID 匹配
2. **测试用户**：如果 OAuth 应用未发布，需要将使用者添加为测试用户
3. **重新打包**：修改 `manifest.json` 后需要重新打包和分发扩展
4. **扩展 ID 变化**：如果扩展 ID 变化（如重新安装），需要更新 OAuth 客户端配置

## 🐛 常见问题

### 问题：点击授权后提示"Error: OAuth2 not granted or revoked"

**解决方案：**
- 检查 `manifest.json` 中的 `client_id` 是否正确
- 确保扩展 ID 与 OAuth 客户端配置中的应用 ID 一致
- 尝试删除并重新创建 OAuth 客户端

### 问题：授权成功但无法加载日程

**解决方案：**
- 打开开发者工具（右键扩展图标 → 审查弹出内容）
- 查看 Console 中的错误信息
- 确认 Google Calendar API 已启用
- 检查作用域是否正确添加

### 问题：Token 过期

**解决方案：**
- 扩展会自动检测 token 过期并提示重新授权
- 用户只需重新点击授权按钮即可

## 📚 参考文档

- [Chrome Extension Identity API](https://developer.chrome.com/docs/extensions/reference/identity/)
- [Google Calendar API](https://developers.google.com/calendar/api/v3/reference)
- [OAuth 2.0 for Chrome Extensions](https://developer.chrome.com/docs/extensions/mv3/tut_oauth/)

---

**作者**: tianyi.liang  
**版本**: 2.0.0


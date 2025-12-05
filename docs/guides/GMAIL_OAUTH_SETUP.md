# 在 Google Cloud Console 添加 Gmail API 作用域 - 详细步骤

## 📋 前提条件

1. 已有 Google Cloud 项目（例如：SPX Helper）
2. 已启用 Gmail API
3. 已配置 OAuth 同意屏幕

## 🔧 详细操作步骤

### 步骤 1：访问 Google Cloud Console

打开浏览器，访问：
```
https://console.cloud.google.com/
```

### 步骤 2：选择项目

1. 点击顶部导航栏的项目选择器（显示当前项目名称的地方）
2. 在弹出的对话框中找到你的 **SPX Helper** 项目
3. 点击选择该项目

### 步骤 3：进入 OAuth 同意屏幕

有两种方式进入：

**方式一：通过左侧菜单**
1. 点击左上角 ☰ 菜单图标
2. 滚动到 **"API 和服务"**
3. 点击 **"OAuth 同意屏幕"**

**方式二：直接访问链接**
```
https://console.cloud.google.com/apis/credentials/consent
```

### 步骤 4：编辑 OAuth 同意屏幕

1. 在 OAuth 同意屏幕页面，你会看到已配置的应用信息
2. 找到并点击底部的 **"编辑应用"** 按钮（或右上角的编辑图标 ✏️）

### 步骤 5：导航到作用域配置

1. 在编辑页面，会看到多个步骤（通常是 4 步）：
   - 第 1 步：OAuth 同意屏幕
   - 第 2 步：作用域 ⬅️ **我们要修改这一步**
   - 第 3 步：测试用户（可选）
   - 第 4 步：摘要

2. 点击 **"保存并继续"** 到达 **"作用域"** 步骤

### 步骤 6：添加 Gmail 作用域

在 "作用域" 页面：

#### 方法一：手动添加作用域（推荐）⭐

1. 向下滚动页面，找到 **"手动添加作用域"** 区域
2. 在输入框中粘贴第一个作用域：
   ```
   https://www.googleapis.com/auth/gmail.readonly
   ```
3. 点击 **"添加到表格"** 按钮
4. 继续在输入框中粘贴第二个作用域：
   ```
   https://www.googleapis.com/auth/gmail.labels
   ```
5. 点击 **"添加到表格"** 按钮

#### 方法二：通过 "添加或移除作用域" 按钮

1. 点击页面上的 **"添加或移除作用域"** 按钮
2. 在弹出的对话框中：
   - 使用搜索框搜索 "Gmail API"
   - 或者滚动找到 **Gmail API** 相关的作用域
3. 勾选以下两个作用域：
   - ☑️ `.../auth/gmail.readonly` - 查看您的电子邮件
   - ☑️ `.../auth/gmail.labels` - 管理邮箱标签
4. 点击对话框底部的 **"更新"** 按钮

### 步骤 7：验证作用域已添加

在作用域列表中，你应该能看到：

| API | 作用域 | 说明 |
|-----|--------|------|
| Gmail API | `.../auth/gmail.readonly` | 查看您的电子邮件信息和设置 |
| Gmail API | `.../auth/gmail.labels` | 管理邮箱标签 |
| Google Calendar API | `.../auth/calendar.readonly` | 查看您的日历活动 |

### 步骤 8：保存配置

1. 检查作用域列表是否正确
2. 点击页面底部的 **"保存并继续"** 按钮
3. 继续完成后续步骤（测试用户、摘要）
4. 最后点击 **"返回信息中心"**

### 步骤 9：启用 Gmail API（如果还没有）

1. 返回到 **"API 和服务"** > **"库"**
   ```
   https://console.cloud.google.com/apis/library
   ```
2. 搜索 **"Gmail API"**
3. 点击 **Gmail API** 卡片
4. 如果显示 **"启用"** 按钮，点击启用
5. 如果显示 **"管理"** 按钮，说明已经启用

## ✅ 完成验证

配置完成后，在你的扩展中：

1. 点击 "📬 邮件" 标签
2. 点击 "🔑 授权 Gmail 访问"
3. 在弹出的 Google 授权窗口中，应该能看到：
   - ✅ 查看您的邮件
   - ✅ 管理邮件标签
   - ✅ 查看日历（之前已有）

## 🎯 完整的作用域列表

你的 SPX Helper 项目应该包含以下作用域：

```
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.labels
```

## ⚠️ 常见问题

### Q1: 找不到 "手动添加作用域" 输入框？
**A**: 向下滚动页面到底部，通常在 "您的非敏感作用域" 区域下方。

### Q2: "添加或移除作用域" 按钮是灰色的？
**A**: 可能需要先完成第一步（OAuth 同意屏幕基本信息）。确保已填写：
- 应用名称
- 用户支持电子邮件
- 开发者联系信息

### Q3: 添加作用域后显示需要验证？
**A**: 如果应用类型是 "外部"，Gmail 等敏感作用域在生产环境需要 Google 审核。但在测试阶段（添加测试用户）可以正常使用。

### Q4: 授权时提示 "此应用未经验证"？
**A**: 这是正常的，因为是个人开发的扩展。点击 "高级" → "转至 SPX Helper（不安全）" 继续授权。

## 📸 关键截图说明

关键位置：
1. **OAuth 同意屏幕** 在左侧菜单 "API 和服务" 下
2. **编辑应用** 按钮在页面中部
3. **作用域** 是配置向导的第 2 步
4. **手动添加作用域** 在作用域页面底部

## 🔗 快速链接

- OAuth 同意屏幕：https://console.cloud.google.com/apis/credentials/consent
- API 库：https://console.cloud.google.com/apis/library
- 凭据：https://console.cloud.google.com/apis/credentials

---

如有问题，请参考 Google 官方文档：
https://developers.google.com/gmail/api/auth/scopes


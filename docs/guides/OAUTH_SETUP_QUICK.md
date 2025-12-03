# Google Calendar OAuth 快速配置指南

## 📋 配置步骤（5-10分钟）

### 步骤 1️⃣：获取扩展 ID

1. 打开 Chrome 浏览器
2. 在地址栏输入：`chrome://extensions/`
3. 找到 **SPX Helper** 扩展
4. 复制扩展 ID（类似：`abcdefghijklmnopqrstuvwxyz123456`）
5. **保存这个 ID**，后面会用到

---

### 步骤 2️⃣：创建 Google Cloud 项目

1. 访问：https://console.cloud.google.com/
2. 点击左上角项目下拉菜单 → **新建项目**
3. 项目名称输入：`SPX Helper`
4. 点击**创建**
5. 等待项目创建完成（约10秒）

---

### 步骤 3️⃣：启用 Google Calendar API

1. 确保你在刚创建的 `SPX Helper` 项目中
2. 左侧菜单：**API和服务** → **库**
3. 搜索框输入：`Google Calendar API`
4. 点击搜索结果中的 **Google Calendar API**
5. 点击**启用**按钮
6. 等待启用完成

---

### 步骤 4️⃣：配置 OAuth 同意屏幕

1. 左侧菜单：**API和服务** → **OAuth 同意屏幕**
2. 用户类型选择：**外部**
3. 点击**创建**

#### 第一步：应用信息
- **应用名称**：`SPX Helper`
- **用户支持电子邮件**：选择你的邮箱
- **应用徽标**：留空（可选）
- **应用首页**：留空（可选）
- **应用隐私权政策链接**：留空（可选）
- **应用服务条款链接**：留空（可选）
- **授权网域**：留空
- **开发者联系信息**：输入你的邮箱

点击**保存并继续**

---

#### 第二步：作用域配置（重要！）

**如果你看不到"添加或移除作用域"按钮，请按以下步骤操作：**

1. 在"作用域"页面，向下滚动
2. 找到**"您的非敏感作用域"**或**"添加或移除作用域"**按钮
3. 点击该按钮

**在弹出的窗口中：**

**方法一：手动输入作用域（推荐）**
1. 在弹出窗口的**底部**找到"手动添加作用域"输入框
2. 输入以下作用域（完整复制）：
   ```
   https://www.googleapis.com/auth/calendar.readonly
   ```
3. 点击**"添加到表格"**按钮
4. 确认作用域已添加到列表中
5. 点击**更新**

**方法二：从 Google API 列表选择**
1. 在弹出窗口的搜索框中输入：`calendar`
2. 在搜索结果中找到 **Google Calendar API v3**
3. 展开该 API
4. 勾选：`https://www.googleapis.com/auth/calendar.readonly`
   - 这个作用域的描述是："View your calendars"（查看您的日历）
5. 点击底部的**更新**按钮

**验证作用域已添加：**
- 返回"作用域"页面后，你应该能看到：
  - `.../auth/calendar.readonly`
  - 或完整的 `https://www.googleapis.com/auth/calendar.readonly`

点击**保存并继续**

---

#### 第三步：测试用户
- 点击**+ 添加用户**
- 输入你的 Google 账号邮箱（需要查看日历的账号）
- 点击**添加**
- 点击**保存并继续**

#### 完成
点击**返回信息中心**

---

### 步骤 5️⃣：创建 OAuth 客户端 ID

1. 左侧菜单：**API和服务** → **凭据**
2. 点击顶部 **+ 创建凭据** → **OAuth 客户端 ID**
3. 应用类型：选择 **Chrome 应用**
4. 名称：输入 `SPX Helper Extension`
5. **应用 ID**：粘贴你在步骤1复制的扩展 ID
6. 点击**创建**

**记录客户端 ID：**
- 弹出窗口会显示客户端 ID（格式：`123456789-abcdefg.apps.googleusercontent.com`）
- **复制并保存这个客户端 ID**

---

### 步骤 6️⃣：生成扩展 Key（重要！）

为了让扩展 ID 固定不变，需要添加 `key` 字段。

**生成方法：**

1. 打开终端（Terminal）
2. 进入扩展目录：
```bash
cd /Users/tianyi.liang/Cursor/SPX_Helper
```

3. 运行以下命令生成私钥：
```bash
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out key.pem
```

4. 查看公钥（用于 manifest.json）：
```bash
openssl rsa -in key.pem -pubout -outform DER | openssl base64 -A
```

5. 复制输出的 base64 字符串（很长的一串）

---

### 步骤 7️⃣：更新 manifest.json

打开 `manifest.json`，替换以下内容：

```json
"oauth2": {
  "client_id": "粘贴你的客户端ID.apps.googleusercontent.com",
  "scopes": [
    "https://www.googleapis.com/auth/calendar.readonly"
  ]
},
"key": "粘贴你生成的base64公钥"
```

**示例：**
```json
"oauth2": {
  "client_id": "123456789-abc123.apps.googleusercontent.com",
  "scopes": [
    "https://www.googleapis.com/auth/calendar.readonly"
  ]
},
"key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."
```

---

### 步骤 8️⃣：重新加载扩展

1. 打开 `chrome://extensions/`
2. 找到 SPX Helper
3. 点击**重新加载**按钮（刷新图标）
4. 确认扩展 ID **没有变化**（如果变了，说明 key 配置有问题）

---

### 步骤 9️⃣：测试授权

1. 点击扩展图标打开 SPX Helper
2. 切换到 **📅 今日日程** 标签
3. 点击 **🔑 授权访问** 按钮
4. 在弹出的窗口中：
   - 选择你的 Google 账号
   - 点击**继续**（可能会提示"此应用未经验证"，点击"继续"）
   - 点击**允许**授权读取日历

5. 授权成功后，自动加载今天的日程！

---

## ✅ 完成！

现在每次打开扩展，都会自动显示今天的 Google Calendar 日程安排！

---

## 🐛 常见问题

### Q1: "此应用未经验证" 警告
**A**: 这是正常的，因为应用还在测试阶段。点击左下角"继续"即可。

### Q2: 扩展 ID 变了
**A**: 说明 `key` 字段配置不正确。重新生成 key 并更新 manifest.json。

### Q3: OAuth2 not granted
**A**: 
- 检查 `client_id` 是否正确
- 检查扩展 ID 是否与 OAuth 客户端配置中的应用 ID 一致
- 在 Google Cloud Console 中检查 OAuth 客户端的应用 ID

### Q4: API 错误 403
**A**: 
- 确认 Google Calendar API 已启用
- 确认你的 Google 账号已添加为测试用户

---

## 📞 需要帮助？

如果遇到问题，请提供：
1. 错误截图
2. 浏览器控制台的错误信息
3. 你的扩展 ID

---

**作者**: tianyi.liang  
**版本**: 2.0.0


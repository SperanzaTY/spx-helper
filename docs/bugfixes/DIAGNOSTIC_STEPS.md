# 🔍 API 溯源工具 - 详细诊断步骤

## 🚨 "无法启动检查器" 问题诊断

按照以下步骤逐一检查，找出问题所在：

---

## 第 1 步：检查扩展是否正确加载 ⭐

### 1.1 打开扩展管理页面
```
1. 在浏览器打开新标签页
2. 输入: chrome://extensions/
3. 找到 SPX Helper
```

### 1.2 检查扩展状态
- [ ] 扩展右下角的开关是 **蓝色**（已启用）
- [ ] 没有红色错误提示
- [ ] 版本显示为 **2.9.0**

### 1.3 点击"详细信息"
- [ ] 检查权限列表中是否包含：
  - ✅ "scripting"
  - ✅ "tabs"  
  - ✅ "读取和更改您在所有网站上的所有数据"

### 1.4 如果有问题
```
解决方案：
1. 点击"重新加载"按钮 🔄
2. 如果还有错误，点击"移除"
3. 重新添加扩展
```

---

## 第 2 步：检查 content.js 是否注入 ⭐⭐⭐

### 2.1 打开测试页面
```
1. 打开新标签页
2. 访问任意普通网页（不要用 chrome:// 页面）
   推荐: https://www.google.com
```

### 2.2 打开开发者工具
```
1. 按 F12 (Windows) 或 Cmd+Option+I (Mac)
2. 切换到 "Console" 标签
```

### 2.3 刷新页面
```
1. 按 F5 或 Cmd+R
2. 等待页面完全加载
```

### 2.4 查看 Console 输出
**必须看到以下日志**：
```
✅ [SPX Helper] API 数据溯源工具已加载
✅ [SPX Helper] 开始拦截 API 请求
✅ [SPX Helper] Content Script 已就绪
```

### 2.5 如果没有看到这些日志
**说明 content.js 没有注入！**

**解决方案 A - 检查文件**：
```
1. 回到 chrome://extensions/
2. 点击 SPX Helper 的"详细信息"
3. 找到"扩展程序根目录"，点击链接
4. 确认 content.js 文件存在
```

**解决方案 B - 重新加载扩展**：
```
1. chrome://extensions/
2. 关闭 SPX Helper（右下角开关）
3. 重新启用
4. 点击"重新加载"
5. 刷新测试页面
6. 再次检查 Console
```

**解决方案 C - 完全重装**：
```
1. chrome://extensions/
2. 点击 SPX Helper 的"移除"
3. 在 Finder 中找到扩展文件夹
4. 再次"加载已解压的扩展程序"
5. 刷新测试页面
```

---

## 第 3 步：手动测试 content.js ⭐⭐

### 3.1 在 Console 中运行
```javascript
// 检查 content.js 是否加载
window.spxAPITracker
```

**期望输出**：
```
APIDataTracker {apiRecords: Map(0), inspectorMode: false, ...}
```

**如果显示 undefined**：
```
❌ content.js 没有加载！
→ 返回第 2 步重新检查
```

### 3.2 检查 API 拦截
```javascript
// 查看是否启用拦截
window.spxAPITracker?.isEnabled
```

**期望输出**：
```
true
```

### 3.3 手动启动检查器
```javascript
// 手动启动检查器
window.spxAPITracker?.enableInspectorMode()
```

**期望效果**：
- 页面顶部应该出现紫色提示条
- Console 显示: `🎯 [SPX Helper] 检查器模式已启用`

**如果成功**：
```
✅ content.js 工作正常！
问题在于扩展 popup 与 content script 的通信
→ 继续第 4 步
```

**如果失败**：
```
❌ content.js 有问题
→ 查看 Console 的错误信息
```

---

## 第 4 步：测试消息通信 ⭐⭐

### 4.1 打开扩展 Popup
```
1. 点击浏览器右上角的 SPX Helper 图标
2. 切换到"实用工具"标签
3. 点击"API溯源"
```

### 4.2 检查 API 数量
**如果显示 0**：
```
可能原因：
1. 页面还没有 API 调用（正常）
2. content.js 未加载（问题）

验证方法：
在页面 Console 运行:
  window.spxAPITracker?.apiRecords.size
  
如果返回 0 → 页面确实没有 API
如果返回 undefined → content.js 未加载
```

### 4.3 打开 Popup 的 Console
```
1. 右键点击 SPX Helper 图标
2. 选择"检查弹出式窗口"
3. 会打开 Popup 的独立 Console
```

### 4.4 点击"启动检查器"按钮
**在 Popup Console 中查看输出**：

**成功的输出**：
```
(没有错误信息)
```

**失败的输出**：
```
ℹ️ Content script 未就绪: Could not establish connection...
💡 提示: 刷新页面让 content.js 重新加载
```

**如果看到失败输出**：
```
→ 说明 content.js 确实没有加载
→ 返回第 2 步
```

---

## 第 5 步：检查权限问题 ⭐

### 5.1 确认页面 URL
```
1. 查看当前测试页面的 URL
2. 确保不是以下页面：
   ❌ chrome://
   ❌ edge://
   ❌ about:
   ❌ chrome.google.com/webstore
   ❌ file://
```

### 5.2 测试普通网页
```
推荐测试页面：
✅ https://www.google.com
✅ https://www.baidu.com
✅ https://github.com
✅ 你的业务系统页面（DataSuite、FMS等）
```

---

## 第 6 步：查看详细错误 ⭐

### 6.1 在 Popup Console 中运行
```javascript
// 获取当前标签页信息
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  console.log('当前标签页:', tabs[0]);
  console.log('URL:', tabs[0]?.url);
  console.log('ID:', tabs[0]?.id);
});

// 尝试发送消息
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_API_RECORDS' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('❌ 错误:', chrome.runtime.lastError.message);
    } else {
      console.log('✅ 响应:', response);
    }
  });
});
```

**根据错误信息判断**：

**错误: "Could not establish connection. Receiving end does not exist."**
```
原因: content.js 没有加载到页面
解决: 刷新页面，重新加载扩展
```

**错误: "Cannot access contents of url..."**
```
原因: 权限不足或特殊页面
解决: 换一个普通网页测试
```

**无错误，有响应**
```
说明: content.js 已加载且通信正常
问题可能在 popup.js 的逻辑
```

---

## 🆘 常见问题解决方案

### 问题 1: content.js 始终不加载
```
解决方案：
1. 确认 manifest.json 中有 content_scripts 配置
2. 确认 content.js 文件存在于扩展根目录
3. 重新加载扩展
4. 完全卸载重装扩展
```

### 问题 2: 只在某些页面不工作
```
原因: 页面的 CSP (Content Security Policy) 限制
解决: 这是正常现象，尝试其他页面
```

### 问题 3: 重新加载后仍不工作
```
解决方案：
1. 关闭所有使用扩展的标签页
2. 重新加载扩展
3. 打开新标签页
4. 访问测试页面
```

---

## 📝 诊断结果报告

完成上述步骤后，请提供以下信息：

### 扩展状态
- [ ] 扩展已启用
- [ ] 版本是 2.9.0
- [ ] 有 scripting 和 tabs 权限

### content.js 状态
- [ ] Console 有"已加载"日志
- [ ] window.spxAPITracker 存在
- [ ] 手动启动检查器成功

### 通信测试
- [ ] 能获取标签页信息
- [ ] sendMessage 没有错误
- [ ] 能收到响应

### 测试页面
- [ ] 不是特殊页面（chrome://）
- [ ] URL: _______________
- [ ] 已刷新页面

### 错误信息
```
(如果有错误，请粘贴完整错误信息)
```

---

## 🔧 临时解决方案

如果上述方法都不行，可以临时使用手动方式：

```javascript
// 在页面 Console 中直接运行
window.spxAPITracker?.enableInspectorMode()

// 这样可以绕过 popup 通信，直接启动检查器
```

---

**请按照这些步骤逐一检查，并告诉我在哪一步遇到了问题！** 🔍

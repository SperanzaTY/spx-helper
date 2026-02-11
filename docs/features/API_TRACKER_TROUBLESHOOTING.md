# 🔧 API 溯源工具 - 问题排查指南

## ❌ 常见错误

### 错误 1: "Error loading API records"
**症状**: Console 显示 `Error loading API records: [object Object]`

**原因**: Content script 还未加载到当前页面

**解决方案**:
```
✅ 刷新当前页面 (F5 或 Cmd+R)
✅ 重新打开扩展查看
✅ 确认"已捕获 API"变为 > 0
```

---

### 错误 2: "无法启动检查器，请刷新页面后重试"
**症状**: 点击"启动检查器"按钮后显示此提示

**原因**: Content script 未注入到页面

**解决方案**:
```
方案 1: 刷新页面
1. 按 F5 或 Cmd+R 刷新页面
2. 等待页面完全加载
3. 重新打开扩展
4. 再次点击"启动检查器"

方案 2: 重新加载扩展
1. 打开 chrome://extensions/
2. 找到 SPX Helper
3. 点击"重新加载"按钮
4. 刷新测试页面
5. 重试
```

---

### 错误 3: "已捕获 API" 显示 0
**症状**: API 数量始终为 0

**原因**: 
- 页面没有 API 调用
- Content script 未生效
- 页面还在加载中

**解决方案**:
```
检查清单:
□ 刷新页面让 content.js 重新注入
□ 打开 Console (F12) 查看是否有拦截日志
□ 确认页面确实有 API 调用
□ 等待页面完全加载后再查看

验证 content.js 是否加载:
1. 打开页面
2. 打开 Console (F12)
3. 查找日志:
   ✅ [SPX Helper] API 数据溯源工具已加载
   ✅ [SPX Helper] 开始拦截 API 请求
   📡 [SPX Helper] Fetch: https://...
```

---

### 错误 4: 点击元素没有反应
**症状**: 启动检查器后点击元素无响应

**可能原因**:
1. 元素内容是硬编码的（不是来自 API）
2. 检查器未真正启动
3. 元素被其他层覆盖

**解决方案**:
```
检查步骤:
1. 确认顶部有紫色提示条
   "🎯 API 溯源模式 - 点击元素查看数据来源"

2. 测试元素高亮
   移动鼠标到元素上 → 应该有紫色边框

3. 尝试不同元素
   ✅ 表格行、卡片、列表项
   ✅ 显示数据的文本
   ❌ 按钮、图标、标题

4. 查看 Console
   点击元素后应该有处理日志
```

---

### 错误 5: 无法在某些页面使用
**症状**: 提示"无法在浏览器内部页面使用此功能"

**原因**: Chrome 扩展无法在浏览器内部页面运行

**限制页面**:
```
❌ chrome://extensions/
❌ chrome://settings/
❌ edge://...
❌ about:...
❌ chrome Web Store 页面
```

**解决方案**:
```
✅ 使用普通网页测试（http:// 或 https://）
✅ 推荐测试页面：
   - DataSuite
   - FMS SPX Admin
   - 任意业务系统页面
```

---

## 🔍 调试技巧

### 技巧 1: 检查 content.js 状态
在页面 Console 中运行：
```javascript
// 检查是否加载
console.log('Content Script:', window.spxAPITracker ? '✅ 已加载' : '❌ 未加载');

// 查看 API 数量
console.log('已捕获 API:', window.spxAPITracker?.apiRecords?.size || 0);

// 查看检查器状态
console.log('检查器状态:', window.spxAPITracker?.inspectorMode ? '🟢 运行中' : '⚪ 未启动');

// 查看所有 API
if (window.spxAPITracker) {
  window.spxAPITracker.apiRecords.forEach((record, id) => {
    console.log(`📡 ${record.method} ${record.url}`);
  });
}
```

### 技巧 2: 手动启动检查器
```javascript
// 手动启动
window.spxAPITracker?.enableInspectorMode();

// 手动停止
window.spxAPITracker?.disableInspectorMode();
```

### 技巧 3: 查看拦截日志
打开 Console，筛选日志：
```
🔍 搜索: [SPX Helper]
```

应该看到：
```
✅ [SPX Helper] API 数据溯源工具已加载
✅ [SPX Helper] 开始拦截 API 请求
🎯 [SPX Helper] 检查器模式已启用
📡 [SPX Helper] Fetch: https://api.example.com/data
📡 [SPX Helper] XHR: https://api.example.com/users
```

---

## 🔄 完整重置流程

如果所有方法都不行，尝试完整重置：

### 步骤 1: 重新加载扩展
```
1. chrome://extensions/
2. 找到 SPX Helper
3. 点击"重新加载"按钮 🔄
```

### 步骤 2: 关闭所有标签页
```
关闭所有测试页面的标签页
（让 content.js 完全卸载）
```

### 步骤 3: 打开新页面
```
1. 打开新标签页
2. 访问测试页面（如 DataSuite）
3. 等待页面完全加载
```

### 步骤 4: 验证加载
```
1. 打开 Console (F12)
2. 查找日志:
   ✅ [SPX Helper] API 数据溯源工具已加载
3. 如果没有 → 再次刷新页面
```

### 步骤 5: 重新测试
```
1. 打开 SPX Helper 扩展
2. 切换到"实用工具" → "API溯源"
3. 确认"已捕获 API" > 0
4. 点击"启动检查器"
5. 测试功能
```

---

## 📋 诊断检查清单

遇到问题时，按此清单逐项检查：

### 扩展状态
- [ ] 扩展已安装并启用
- [ ] 扩展版本是 v2.9.0
- [ ] manifest.json 包含 content_scripts
- [ ] content.js 文件存在

### 页面状态
- [ ] 不是 chrome:// 等特殊页面
- [ ] 页面完全加载完成
- [ ] 页面有 API 调用（查看 Network 面板）

### Content Script
- [ ] Console 有 "[SPX Helper] 已加载" 日志
- [ ] Console 有 API 拦截日志
- [ ] window.spxAPITracker 对象存在

### Popup 状态
- [ ] 扩展图标可点击
- [ ] "API溯源"按钮可见
- [ ] "已捕获 API" 显示数字
- [ ] "启动检查器"按钮可点击

### 检查器状态
- [ ] 顶部提示条显示
- [ ] 鼠标悬停元素高亮
- [ ] 点击元素有反应

---

## 🆘 仍然无法解决？

### 提供以下信息寻求帮助：

1. **浏览器信息**
   - Chrome/Edge 版本
   - 操作系统

2. **扩展信息**
   - SPX Helper 版本
   - manifest.json 配置

3. **Console 输出**
   - 所有 [SPX Helper] 日志
   - 任何错误信息

4. **测试页面**
   - 页面 URL（如可公开）
   - 页面是否有 API 调用

5. **复现步骤**
   - 详细的操作步骤
   - 预期结果 vs 实际结果

---

## ✅ 问题解决后

确认以下都正常：
- [x] Console 有拦截日志
- [x] "已捕获 API" > 0
- [x] 启动检查器成功
- [x] 元素高亮正常
- [x] 点击元素弹出面板
- [x] 数据匹配正确

---

**记住**：大多数问题通过"刷新页面"就能解决！🔄

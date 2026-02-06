# 🐛 API 溯源工具 - 快速调试指南

## 问题：0 已捕获 API & 没有提示

### 原因分析

**为什么 API 数量是 0？**
- content.js 在页面加载后才注入
- 页面的 API 请求已经发送完毕
- content.js 错过了这些请求

**解决方案：刷新页面**

---

## 🔧 完整调试步骤

### 第 1 步：重新加载扩展
```
chrome://extensions/ → SPX Helper → 🔄 重新加载
```

### 第 2 步：打开目标页面
```
打开 FMS、DataSuite 等页面
```

### 第 3 步：打开 Console
```
F12 → Console 标签
清空 Console
```

### 第 4 步：**刷新页面（重要！）**
```
F5 刷新页面
```

**预期输出**：
```
✅ [SPX Helper] API 数据溯源工具已加载
✅ [SPX Helper] 开始拦截 API 请求
📡 [SPX Helper] Fetch: https://api.example.com/stations
📡 [SPX Helper] Fetch: https://api.example.com/user
📡 [SPX Helper] XHR: https://api.example.com/dashboard
✅ [SPX Helper] Content Script 已就绪
```

### 第 5 步：打开扩展窗口
```
点击扩展图标（窗口模式）
实用工具 → API溯源
```

**应该看到**：
```
已捕获 API: X 个  （X > 0）
```

如果还是 0，说明页面没有 API 请求，或者：
- 页面还没加载完
- 请求是 WebSocket/SSE
- 请求被其他方式拦截

### 第 6 步：启动检查器
```
点击 "🎯 启动检查器"
```

**预期 Console 输出**：
```
🎯 [SPX Helper] 检查器模式已启用
📊 [SPX Helper] 当前已捕获 API 数量: 5
✅ [SPX Helper] 事件监听器已注册 (capture 模式)
```

**页面应该显示**：
- 顶部紫色提示条："移动鼠标查看元素数据来源（点击查看详情）"

### 第 7 步：移动鼠标测试

移动鼠标到页面上的**任意元素**（文字、图片、按钮等）

**预期 Console 输出**（每次移动都会输出）：
```
🔍 [SPX Helper] 鼠标悬停: DIV Station 201...
📊 [SPX Helper] 当前 API 数量: 5
📝 [SPX Helper] 提取文本: ["Station 201", "Jakarta Hub"]
📡 [SPX Helper] 找到数据来源: 2
✅ [SPX Helper] 已调用 showDataSourceTooltip
🎨 [SPX Helper] showDataSourceTooltip 被调用
   元素: DIV station-card
   数据来源数量: 2
   元素位置: 100 50 150
   创建"已找到"提示框，位置: 160 50
   ✅ [SPX Helper] 显示：找到 2 个数据来源
   ✅ [SPX Helper] 提示框已添加到 DOM, id: spx-api-tracker-tooltip
   ✅ 确认：提示框在 DOM 中
```

**页面应该显示**：
1. 元素高亮（紫色边框）
2. 元素信息框（元素上方）
3. **数据来源提示框（元素下方）**
   - 找到数据：蓝色框 "📡 找到 X 个数据来源"
   - 未找到：橙色框 "⚠️ 未找到数据来源"

---

## 🚨 如果还是没有提示框

### 检查 1：Console 输出
```javascript
// 应该看到完整的日志链
🔍 → 📊 → 📝 → 📡 → ✅ → 🎨 → ✅
```

**如果没有任何输出**：
- 事件监听器没有注册
- 检查器模式没有启用
- 返回第 1 步重新开始

**如果只有部分输出**：
- 在哪一步停止了？
- 查看是否有红色错误信息

### 检查 2：手动测试事件监听器
```javascript
// 在 Console 中运行
document.addEventListener('mouseover', (e) => {
  console.log('TEST 鼠标悬停:', e.target.tagName);
}, true);

// 然后移动鼠标，应该看到大量输出
```

如果有输出 = 事件监听器工作正常
如果没有 = 浏览器问题，重启浏览器

### 检查 3：手动测试提示框
```javascript
// 在 Console 中运行
const tooltip = document.createElement('div');
tooltip.id = 'test-tooltip';
tooltip.style.cssText = `
  position: fixed;
  top: 100px;
  left: 100px;
  background: rgba(255, 152, 0, 0.95);
  color: white;
  padding: 10px;
  border-radius: 8px;
  z-index: 9999999;
  font-size: 14px;
`;
tooltip.textContent = '⚠️ 测试提示框';
document.body.appendChild(tooltip);

// 应该在页面左上角看到橙色提示框
```

如果看到 = DOM 操作正常
如果看不到 = 页面样式问题，检查是否有 CSP 限制

### 检查 4：检查器状态
```javascript
// 在 Console 中运行
console.log('检查器模式:', window.spxAPITracker?.inspectorMode);
console.log('API 数量:', window.spxAPITracker?.apiRecords.size);

// 应该输出
检查器模式: true
API 数量: 5 (或其他 > 0 的数字)
```

---

## 📋 完整的成功示例

```
# 1. 刷新页面
✅ [SPX Helper] API 数据溯源工具已加载
✅ [SPX Helper] 开始拦截 API 请求
📡 [SPX Helper] Fetch: https://api.example.com/data
✅ [SPX Helper] Content Script 已就绪

# 2. 启动检查器
🎯 [SPX Helper] 检查器模式已启用
📊 [SPX Helper] 当前已捕获 API 数量: 3
✅ [SPX Helper] 事件监听器已注册 (capture 模式)

# 3. 移动鼠标（有数据）
🔍 [SPX Helper] 鼠标悬停: DIV Station 201
📊 [SPX Helper] 当前 API 数量: 3
📝 [SPX Helper] 提取文本: ["Station 201"]
📡 [SPX Helper] 找到数据来源: 1
✅ [SPX Helper] 已调用 showDataSourceTooltip
🎨 [SPX Helper] showDataSourceTooltip 被调用
   元素: DIV
   数据来源数量: 1
   ✅ 确认：提示框在 DOM 中

# 4. 移动鼠标（无数据）
🔍 [SPX Helper] 鼠标悬停: H1 Dashboard
📊 [SPX Helper] 当前 API 数量: 3
📝 [SPX Helper] 提取文本: ["Dashboard"]
📡 [SPX Helper] 找到数据来源: 0
✅ [SPX Helper] 已调用 showDataSourceTooltip
🎨 [SPX Helper] showDataSourceTooltip 被调用
   元素: H1
   数据来源数量: 0
   ⚠️ [SPX Helper] 显示：未找到数据来源
   ✅ 确认：提示框在 DOM 中
```

---

## 🎯 关键点总结

1. **必须刷新页面** - 才能捕获 API
2. **查看 Console** - 所有步骤都有详细日志
3. **无论是否找到数据，都会显示提示框**
   - 找到 → 蓝色 "📡 找到 X 个数据来源"
   - 未找到 → 橙色 "⚠️ 未找到数据来源"
4. **如果没有提示框，但有日志输出**
   - 说明逻辑正确，但显示有问题
   - 运行手动测试提示框代码
5. **如果完全没有日志输出**
   - 检查器模式没有启用
   - 或者鼠标移动到了工具自己的元素上

---

**现在测试并告诉我 Console 输出！** 🔍

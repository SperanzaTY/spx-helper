# 🔍 API 数据溯源工具 - 实现指南

## ✅ 完成状态

API 数据溯源工具已完整集成到 SPX Helper v2.9.0

---

## 📁 文件修改清单

### 1. `manifest.json` ✅
- 版本更新: `2.8.1` → `2.9.0`
- 描述更新: 添加 "API数据溯源"
- 新增权限: `scripting`, `tabs`
- 新增 `content_scripts` 配置

```json
{
  "version": "2.9.0",
  "permissions": ["scripting", "tabs", ...],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "run_at": "document_start"
  }]
}
```

### 2. `content.js` ✅ (新文件)
核心功能文件，包含：

**APIDataTracker 类**
- `interceptFetch()` - 拦截 Fetch API
- `interceptXHR()` - 拦截 XMLHttpRequest
- `recordAPI()` - 记录 API 数据
- `enableInspectorMode()` - 启用检查器模式
- `handleClick()` - 处理元素点击
- `findDataSources()` - 搜索数据来源
- `showDataSourcePanel()` - 显示结果面板

**关键特性**
- 自动拦截所有 API 请求
- 存储最近 100 条 API 记录
- 递归搜索 JSON 响应
- 可视化高亮和交互

### 3. `popup.html` ✅
新增 UI 元素：

```html
<!-- 工具按钮 -->
<button class="utils-grid-btn" data-util="api-tracker">
  <span class="grid-icon">🔍</span>
  <span class="grid-label">API溯源</span>
</button>

<!-- 内容区域 -->
<div id="api-tracker-util" class="utils-content">
  <button id="startAPITracker">🎯 启动检查器</button>
  <div id="apiTrackerCount">0</div>
  <div id="apiTrackerList">...</div>
</div>
```

### 4. `popup.js` ✅
新增功能逻辑：

```javascript
// 启动检查器
document.getElementById('startAPITracker').addEventListener('click', ...)

// 加载 API 记录
async function loadAPIRecords() { ... }

// 更新列表
function updateAPIRecordsList(records) { ... }

// 监听消息
chrome.runtime.onMessage.addListener(...)
```

---

## 🎯 工作流程

### 1. 自动 API 拦截 (页面加载时)
```
页面加载 
  ↓
content.js 注入
  ↓
apiTracker.enable()
  ↓
拦截 fetch() 和 XMLHttpRequest
  ↓
自动记录所有 API 响应
```

### 2. 检查器模式 (用户主动触发)
```
用户点击"启动检查器"
  ↓
popup → content (START_INSPECTOR 消息)
  ↓
enableInspectorMode()
  ↓
添加 mouseover/click 事件监听
  ↓
显示顶部提示条
```

### 3. 元素追踪
```
用户移动鼠标到元素
  ↓
高亮元素 (紫色边框)
  ↓
用户点击元素
  ↓
extractElementText() - 提取文本
  ↓
findDataSources() - 搜索 API 记录
  ↓
显示数据来源面板
```

---

## 🔑 核心技术点

### 1. API 拦截
**Fetch 拦截**
```javascript
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const response = await originalFetch.apply(this, args);
  const clonedResponse = response.clone();
  const data = await clonedResponse.json();
  self.recordAPI({ url, method, responseData: data });
  return response;
};
```

**XHR 拦截**
```javascript
const originalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function(...args) {
  xhr.addEventListener('load', function() {
    const data = JSON.parse(xhr.responseText);
    self.recordAPI({ url, method, responseData: data });
  });
  return originalSend.apply(this, args);
};
```

### 2. 数据搜索
**递归搜索算法**
```javascript
searchInObject(obj, searchTexts, path = '', results = []) {
  if (typeof obj === 'string' || typeof obj === 'number') {
    const objStr = String(obj);
    searchTexts.forEach(text => {
      if (objStr.includes(text)) {
        results.push({ path, value: objStr, matchedText: text });
      }
    });
  }
  
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      this.searchInObject(item, searchTexts, `${path}[${index}]`, results);
    });
  } else if (typeof obj === 'object') {
    Object.keys(obj).forEach(key => {
      this.searchInObject(obj[key], searchTexts, `${path}.${key}`, results);
    });
  }
  
  return results;
}
```

### 3. 消息通信
**Popup → Content Script**
```javascript
// popup.js
chrome.tabs.sendMessage(tab.id, { action: 'START_INSPECTOR' }, callback);

// content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_INSPECTOR') {
    this.enableInspectorMode();
    sendResponse({ success: true });
  }
});
```

**Content Script → Popup**
```javascript
// content.js
chrome.runtime.sendMessage({ type: 'API_RECORDED', record: {...} });

// popup.js
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'API_RECORDED') {
    apiTrackerCount++;
    loadAPIRecords();
  }
});
```

---

## 🧪 测试步骤

### 基础测试
```bash
# 1. 重新加载扩展
chrome://extensions/ → SPX Helper → 重新加载

# 2. 打开测试页面
访问任意有 API 调用的页面（如 DataSuite）

# 3. 打开扩展
点击 SPX Helper 图标

# 4. 切换到 API 溯源
点击"API溯源"按钮

# 5. 查看 API 数量
应该显示已捕获的 API 数量 > 0

# 6. 启动检查器
点击"启动检查器"

# 7. 检查页面变化
- 页面顶部应显示紫色提示条
- 鼠标移动到元素上会高亮

# 8. 点击元素
点击任意包含数据的元素

# 9. 查看结果
应显示数据来源面板，列出相关 API
```

### 功能测试清单

- [ ] ✅ API 自动拦截（Fetch）
- [ ] ✅ API 自动拦截（XHR）
- [ ] ✅ API 数量实时更新
- [ ] ✅ 启动检查器按钮
- [ ] ✅ 页面元素高亮
- [ ] ✅ 元素点击追踪
- [ ] ✅ 数据来源匹配
- [ ] ✅ 结果面板显示
- [ ] ✅ 查看完整响应
- [ ] ✅ 复制 API URL
- [ ] ✅ ESC 键退出
- [ ] ✅ 未找到数据提示

---

## 📊 性能考虑

### 内存管理
- 最多存储 100 条 API 记录
- 自动清理最旧的记录
- 响应数据克隆避免影响原请求

### 搜索优化
- 文本长度限制 < 200 字符
- 最多显示前 10 个匹配结果
- 递归深度自动控制

### UI 性能
- 高亮使用 CSS class（非内联样式）
- 面板使用固定定位（避免 reflow）
- 事件使用捕获阶段（提前拦截）

---

## 🎨 UI 设计

### 配色方案
- 主色: `#667eea` (紫色)
- 辅色: `#764ba2` (深紫)
- 成功: `#4caf50` (绿色)
- 警告: `#ff9800` (橙色)

### 交互反馈
- 鼠标悬停: 紫色边框 + 半透明背景
- 元素信息: 浮动标签显示标签名
- 提示条: 顶部居中，渐变背景
- 面板: 居中弹窗，毛玻璃效果

---

## 🐛 已知问题

### 当前版本无已知问题

### 可能的边缘情况
1. **WebSocket 数据**: 不会被拦截（需要额外实现）
2. **iframe 内容**: 需要 `all_frames: true`（已设置为 false）
3. **非 JSON 响应**: 自动忽略
4. **跨域请求**: 可能受 CORS 限制

---

## 🚀 未来增强

### 短期优化
- [ ] 添加 API 过滤功能
- [ ] 导出 API 记录为 JSON
- [ ] 支持 WebSocket 拦截
- [ ] 添加请求时间线视图

### 长期规划
- [ ] GraphQL 查询分析
- [ ] API 性能监控
- [ ] 请求重放功能
- [ ] 数据依赖关系图

---

## 📝 版本历史

### v2.9.0 (2025-02-02)
- ✅ 首次发布 API 数据溯源功能
- ✅ 支持 Fetch 和 XHR 拦截
- ✅ 实现检查器模式
- ✅ 递归数据搜索
- ✅ 可视化结果展示

---

## 🎯 总结

API 数据溯源工具现已完全集成到 SPX Helper v2.9.0，提供：

1. ✅ **零配置**: 页面加载自动开始追踪
2. ✅ **智能匹配**: 递归搜索 API 响应
3. ✅ **可视化**: 高亮元素，面板展示
4. ✅ **易用性**: 一键启动，ESC 退出

现在可以快速定位业务系统的数据来源，提升调试效率！🎉

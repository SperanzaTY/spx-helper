# API 溯源工具功能增强

## 📋 新增功能概览

基于前端代码追溯最佳实践，我们对 API 溯源工具进行了以下增强：

### 1️⃣ **请求参数记录** ✅
- 自动捕获 `fetch` 和 `XMLHttpRequest` 的请求体（Request Payload）
- 记录请求头（Request Headers）
- 支持 JSON 和普通文本格式

**数据结构：**
```javascript
{
  requestPayload: {...},  // 请求参数
  requestHeaders: {...}   // 请求头
}
```

### 2️⃣ **调用栈追踪** ✅
- 自动记录 API 调用的前 5 层调用栈
- 帮助快速定位 API 调用的发起位置
- 类似 Chrome DevTools 的 Initiator 功能

**数据结构：**
```javascript
{
  callStack: [
    "at fetchDriverList (DriverList.js:123)",
    "at loadData (DriverList.js:89)",
    ...
  ]
}
```

### 3️⃣ **React Table 组件拦截** ✅
- 自动 Hook `React.createElement`
- 捕获所有带有 `columns` 属性的 Table 组件
- 提取 UI 列配置（title、dataIndex、key 等）

**捕获的配置：**
```javascript
{
  timestamp: 1234567890,
  componentType: "Table",
  columns: [
    {
      title: "Driver Name",
      dataIndex: "driver_name",
      key: "driver_name",
      hasRender: false,
      hasCustomRender: false
    },
    ...
  ]
}
```

### 4️⃣ **UI → API 字段映射分析** ✅
- 自动匹配 UI 列字段与 API 响应字段
- 识别三类字段：
  - ✅ **匹配字段**：UI 和 API 都有
  - 🟡 **API 独有字段**：API 返回但未在 UI 显示
  - 🔴 **UI 独有字段**：UI 显示但 API 未返回（通常是计算字段）
- 计算匹配率

**映射结果：**
```javascript
{
  apiUrl: "https://xxx.com/api/driver/list",
  apiMethod: "POST",
  matched: ["driver_id", "driver_name", "phone"],
  apiOnly: ["internal_id", "created_at"],
  uiOnly: ["blocklist"],  // 计算字段
  matchRate: "75.0%"
}
```

### 5️⃣ **映射结果导出** ✅
支持两种导出格式：

#### CSV 导出
```csv
UI列名,dataIndex,API URL,API Method,匹配状态,数据类型
Driver ID,driver_id,https://xxx.com/api,POST,✅ 匹配,string
Driver Name,driver_name,https://xxx.com/api,POST,✅ 匹配,string
Blocklist,blocklist,https://xxx.com/api,POST,❌ 未匹配,computed
```

#### JSON 导出
```json
{
  "timestamp": "2025-02-09T12:00:00.000Z",
  "tableConfig": {...},
  "fieldMappings": [...]
}
```

---

## 🎯 使用场景

### 场景 1：调试 UI 数据显示问题
**问题**：页面上某个字段显示不正确  
**解决**：
1. 启动 API 溯源检查器
2. 点击"分析映射"查看该字段是否在 API 响应中
3. 查看是否是计算字段（UI 独有字段）
4. 检查 API 响应的原始值

### 场景 2：前端代码重构
**问题**：需要了解哪些 API 字段被使用，哪些未被使用  
**解决**：
1. 打开目标页面
2. 等待 Table 加载
3. 点击"分析映射"
4. 查看"API 独有字段" - 这些可能是冗余字段
5. 导出 CSV 供团队讨论

### 场景 3：新接口开发
**问题**：后端需要知道前端需要哪些字段  
**解决**：
1. 在现有页面上分析映射
2. 查看"匹配字段"列表
3. 导出 JSON 作为接口文档参考

### 场景 4：性能优化
**问题**：API 返回了太多前端不需要的字段  
**解决**：
1. 分析字段映射
2. 查看"API 独有字段"数量
3. 如果比例过高（>50%），考虑优化 API 返回数据

---

## 🔧 技术实现

### 架构图
```
┌─────────────┐
│  injected.js │  (MAIN World)
│  - Hook Fetch/XHR
│  - Hook React.createElement
│  - 记录 API + Table 配置
└──────┬──────┘
       │ postMessage
       ↓
┌─────────────┐
│  content.js  │  (ISOLATED World)
│  - 接收消息
│  - 分析字段映射
│  - 通知 popup
└──────┬──────┘
       │ chrome.runtime.sendMessage
       ↓
┌─────────────┐
│   popup.js   │
│  - 显示映射结果
│  - 导出功能
└─────────────┘
```

### 核心代码位置

| 功能 | 文件 | 关键函数 |
|------|------|---------|
| API 拦截 | `injected.js` | `window.fetch`, `XMLHttpRequest.prototype.send` |
| React Hook | `injected.js` | `hookReact()` |
| 字段映射分析 | `content.js` | `analyzeFieldMappings()` |
| 映射结果展示 | `popup.js` | `displayFieldMappings()` |
| CSV 导出 | `popup.js` | `exportMappingsCSV` |
| JSON 导出 | `popup.js` | `exportMappingsJSON` |

---

## 📊 数据流程

### 1. API 请求拦截
```javascript
// injected.js
window.fetch = async function(...args) {
  // 1. 提取请求参数
  const requestPayload = JSON.parse(options?.body);
  
  // 2. 获取调用栈
  const callStack = new Error().stack.split('\n').slice(2, 7);
  
  // 3. 发送到 content.js
  window.postMessage({
    type: 'SPX_API_RECORDED',
    record: { url, method, requestPayload, callStack, ... }
  }, '*');
}
```

### 2. Table 配置捕获
```javascript
// injected.js
React.createElement = function(type, props, ...children) {
  if (props?.columns) {
    // 提取 columns 配置
    const tableConfig = {
      columns: props.columns.map(col => ({
        title: col.title,
        dataIndex: col.dataIndex
      }))
    };
    
    // 发送到 content.js
    window.postMessage({
      type: 'SPX_TABLE_CONFIG_CAPTURED',
      config: tableConfig
    }, '*');
  }
  
  return originalCreateElement.apply(this, [type, props, ...children]);
}
```

### 3. 字段映射分析
```javascript
// content.js
analyzeFieldMappings() {
  // 1. 提取 UI 字段
  const uiFields = tableConfig.columns.map(col => col.dataIndex);
  
  // 2. 提取 API 字段
  const apiFields = Object.keys(apiResponse.data.list[0]);
  
  // 3. 计算匹配
  const matched = uiFields.filter(f => apiFields.includes(f));
  const apiOnly = apiFields.filter(f => !uiFields.includes(f));
  const uiOnly = uiFields.filter(f => !apiFields.includes(f));
  
  // 4. 发送到 popup
  chrome.runtime.sendMessage({
    action: 'FIELD_MAPPINGS_ANALYZED',
    mappings: [{ matched, apiOnly, uiOnly }]
  });
}
```

---

## 🚀 测试步骤

### 1. 加载扩展
```bash
cd /Users/tianyi.liang/Cursor/SPX_Helper
# 在 Chrome 中加载解压的扩展
```

### 2. 打开测试页面
- 打开任意包含 React Table 的页面（如 Driver Profile）
- 页面必须使用 `api_mart` 接口

### 3. 启动 API 溯源
1. 点击扩展图标
2. 切换到"🔍 API溯源"工具
3. 点击"🔄 刷新页面"（让 Hook 生效）
4. 等待页面加载

### 4. 查看 API 记录
- "已捕获 API"数量应该 > 0
- 下方列表显示捕获的 API 请求
- 点击查看详情，应该能看到：
  - ✅ `requestPayload`（请求参数）
  - ✅ `callStack`（调用栈）

### 5. 分析字段映射
1. 点击"🔍 分析映射"按钮
2. 查看"🔗 UI → API 字段映射"区域
3. 应该显示：
   - 匹配率（如 75%）
   - 匹配字段列表（绿色标签）
   - 点击"查看详情 ▼"展开：
     - API 独有字段（黄色标签）
     - UI 独有字段（红色标签）

### 6. 导出数据
- 点击"📥 导出 CSV"
- 点击"📥 导出 JSON"
- 检查下载的文件内容

---

## 🐛 调试技巧

### Chrome Console 日志
打开目标页面的 Console，查看：

```javascript
// 检查 API 记录
console.log(window.__spxAPIRecords.size);  // 应该 > 0
Array.from(window.__spxAPIRecords.values()).forEach(r => {
  console.log('API:', r.url);
  console.log('  Request:', r.requestPayload);
  console.log('  CallStack:', r.callStack);
});

// 检查 Table 配置
console.log(window.__spxTableConfigs.length);  // 应该 > 0
window.__spxTableConfigs.forEach(config => {
  console.log('Table Columns:', config.columns.map(c => c.dataIndex));
});
```

### Content Script 日志
```javascript
// content.js 会打印：
// 📊 [SPX Helper] Content Script 收到 Table 配置: {...}
// 🔗 [SPX Helper] 开始分析字段映射
//    UI 字段: ["driver_id", "driver_name", ...]
//    📡 API 字段: ["driver_id", "driver_name", "internal_id", ...]
//    ✅ 匹配成功: 10 / 15 字段
```

### Popup 日志
```javascript
// popup.js 会打印：
// 📊 [Popup] 收到字段映射分析结果: [...]
```

---

## 🎉 总结

通过这次增强，API 溯源工具现在能够：

1. ✅ **记录更完整的信息**：请求参数、调用栈
2. ✅ **自动发现前端配置**：React Table columns
3. ✅ **智能分析映射关系**：UI ↔ API 字段匹配
4. ✅ **导出结构化数据**：CSV/JSON 供团队协作

这些功能基于真实的前端代码追溯场景，无需 LLM 辅助，完全基于工程化的静态分析和运行时拦截技术。

---

## 📚 参考文档

- [Chrome Extension Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [React DevTools Protocol](https://github.com/facebook/react/tree/main/packages/react-devtools)
- [前端代码追溯最佳实践](参见提供的 QA 文档)

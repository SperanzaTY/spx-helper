# API 溯源工具增强功能 - 快速测试指南

## 🚀 快速开始（3分钟）

### 第 1 步：加载扩展（10秒）
1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `/Users/tianyi.liang/Cursor/SPX_Helper` 文件夹

### 第 2 步：打开测试页面（20秒）
**推荐测试页面**：任何包含 React Table 的 SPX 后台页面

例如：
- Driver Profile 页面
- Station Dashboard
- Order Tracking 页面

**要求**：
- ✅ 页面使用 React 框架
- ✅ 页面有表格（Table 组件）
- ✅ 表格数据通过 API 获取（URL 包含 `api_mart`）

### 第 3 步：启动 API 溯源（30秒）
1. 点击扩展图标 ![icon](images/icon48.png)
2. 切换到 "🛠️ 实用工具" 标签
3. 点击 "🔍 API溯源" 按钮
4. 点击 "🔄 刷新页面"（**重要**：让 Hook 生效）
5. 等待页面加载完成

### 第 4 步：查看 API 记录（30秒）
查看扩展中的统计：
- ✅ "已捕获 API" 数量应该 > 0
- ✅ "检查器状态" 显示 "待命"

下方列表应该显示捕获的 API 请求：
```
POST 200 52ms
https://xxx.com/api_mart/driver/list
```

### 第 5 步：分析字段映射（30秒）
1. 滚动到 "🔗 UI → API 字段映射" 区域
2. 点击 "🔍 分析映射" 按钮
3. 等待 2-3 秒

**预期结果**：
```
✅ POST  匹配率: 75.0%
https://xxx.com/api_mart/driver/list

匹配字段 (15):
[driver_id] [driver_name] [phone] [station_id] ...

[查看详情 ▼]
```

### 第 6 步：查看详细映射（30秒）
1. 点击 "查看详情 ▼"
2. 查看三类字段：
   - 🟢 **匹配字段**：UI 和 API 都有
   - 🟡 **API 独有字段**：API 返回但未显示（可能冗余）
   - 🔴 **UI 独有字段**：计算字段（如 `blocklist`）

### 第 7 步：导出数据（30秒）
1. 点击 "📥 导出 CSV"
2. 打开下载的 CSV 文件
3. 验证格式：

```csv
UI列名,dataIndex,API URL,API Method,匹配状态,数据类型
Driver ID,driver_id,https://xxx.com/api,POST,✅ 匹配,unknown
Driver Name,driver_name,https://xxx.com/api,POST,✅ 匹配,unknown
Blocklist,blocklist,https://xxx.com/api,POST,❌ 未匹配,unknown
```

---

## 🐛 调试清单

### 问题 1："已捕获 API" 为 0
**原因**：Hook 未生效或页面未使用 `api_mart` 接口

**解决**：
1. 确保点击了 "🔄 刷新页面"
2. 打开页面的 Console，查看：
   ```javascript
   console.log(window.__spxAPIRecords.size);  // 应该 > 0
   ```
3. 如果为 0，检查页面是否真的调用了包含 `api_mart` 的接口

### 问题 2："分析映射" 后显示 "未找到匹配"
**原因**：页面没有 React Table 或 Table 配置未被捕获

**解决**：
1. 打开 Console，查看：
   ```javascript
   console.log(window.__spxTableConfigs.length);  // 应该 > 0
   ```
2. 如果为 0，说明：
   - 页面不是 React 项目，或
   - Table 组件不是标准的 Ant Design Table（没有 `columns` prop）
3. 检查 Console 是否有日志：
   ```
   📊 [SPX Helper] 捕获 Table 配置: {...}
   ```

### 问题 3：映射结果不完整
**原因**：Table 渲染早于 API 请求返回

**解决**：
1. 刷新页面，让 API 先返回
2. 或者等待 Table 加载后，再点击 "🔍 分析映射"

### 问题 4：导出的 CSV 为空
**原因**：未先执行 "分析映射"

**解决**：
1. 必须先点击 "🔍 分析映射"
2. 等待分析完成（看到映射结果）
3. 再点击导出按钮

---

## 🔍 手动验证数据

### 验证 API 拦截
打开页面 Console：
```javascript
// 1. 检查 API 数量
window.__spxAPIRecords.size
// 预期: > 0

// 2. 查看第一条记录
const firstRecord = Array.from(window.__spxAPIRecords.values())[0];
console.log('URL:', firstRecord.url);
console.log('Method:', firstRecord.method);
console.log('Request Payload:', firstRecord.requestPayload);  // 🆕 新增
console.log('Call Stack:', firstRecord.callStack);            // 🆕 新增
console.log('Response Data:', firstRecord.responseData);
```

### 验证 Table 配置
```javascript
// 1. 检查 Table 数量
window.__spxTableConfigs.length
// 预期: > 0

// 2. 查看第一个 Table
const firstTable = window.__spxTableConfigs[0];
console.log('Columns:', firstTable.columns.map(c => c.dataIndex));
// 预期: ["driver_id", "driver_name", "phone", ...]
```

### 验证 React Hook
```javascript
// 检查 React.createElement 是否被 Hook
console.log(React.createElement.toString().includes('spx'));
// 预期: true（函数体包含 'spx' 关键字）
```

---

## 📊 预期输出示例

### 1. API 记录列表
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POST 200 52ms
https://example.com/api_mart/driver/list
Request: {"page":1,"page_size":20}     🆕
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GET 200 28ms
https://example.com/api_mart/station/info
Request: null
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 2. 字段映射分析
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[POST] 匹配率: 75.0%
https://example.com/api_mart/driver/list

匹配字段 (15):
[driver_id] [driver_name] [phone] [national_id]
[station_id] [hub_id] [vehicle_type] [status]
...

[查看详情 ▼]
  🟡 API 独有字段 (5):
  [internal_id] [created_at] [updated_at] [deleted_at] [version]
  
  🔴 UI 独有字段 (3):
  [blocklist] [full_name] [actions]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 3. 导出的 CSV
```csv
UI列名,dataIndex,API URL,API Method,匹配状态,数据类型
Driver ID,driver_id,https://example.com/api_mart/driver/list,POST,✅ 匹配,unknown
Driver Name,driver_name,https://example.com/api_mart/driver/list,POST,✅ 匹配,unknown
Phone,phone,https://example.com/api_mart/driver/list,POST,✅ 匹配,unknown
Blocklist,blocklist,https://example.com/api_mart/driver/list,POST,❌ 未匹配,unknown
```

### 4. 导出的 JSON
```json
{
  "timestamp": "2025-02-09T12:00:00.000Z",
  "tableConfig": {
    "timestamp": 1234567890,
    "componentType": "Table",
    "columns": [
      {
        "title": "Driver ID",
        "dataIndex": "driver_id",
        "key": "driver_id",
        "hasRender": false,
        "hasCustomRender": false
      }
    ]
  },
  "fieldMappings": [
    {
      "apiUrl": "https://example.com/api_mart/driver/list",
      "apiMethod": "POST",
      "matched": ["driver_id", "driver_name"],
      "apiOnly": ["internal_id"],
      "uiOnly": ["blocklist"],
      "matchRate": "75.0%"
    }
  ]
}
```

---

## ✅ 测试完成确认

在完成所有测试步骤后，确认以下功能都正常：

- [ ] API 拦截器正常工作（已捕获 API > 0）
- [ ] 请求参数被记录（`requestPayload` 存在）
- [ ] 调用栈被记录（`callStack` 存在）
- [ ] React Table 配置被捕获（`__spxTableConfigs.length > 0`）
- [ ] 字段映射分析成功（显示匹配率和字段列表）
- [ ] 详情展开正常（API独有/UI独有字段）
- [ ] CSV 导出成功（文件格式正确）
- [ ] JSON 导出成功（包含完整数据）

---

## 🎉 测试成功！

如果所有确认项都勾选了，说明功能正常工作！

**下一步**：
1. 在实际项目中使用（调试页面数据问题）
2. 导出映射文档供团队使用
3. 发现并优化冗余的 API 字段

**问题反馈**：
如有任何问题，请检查：
1. Chrome Console 的错误日志
2. 扩展的 background.js 日志
3. `/Users/tianyi.liang/Cursor/SPX_Helper/API_TRACKER_ENHANCEMENT.md` 文档

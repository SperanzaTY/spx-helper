# ✨ 功能优化：动态 API 过滤

## 📋 功能描述

**版本**: v2.14.2
**类型**: 功能优化

### 改进前的问题

1. **数据丢失**: `injected.js` 在拦截时就过滤掉不符合条件的 API，这些数据永远不会被记录
2. **无法回溯**: 用户修改过滤条件后，之前过滤掉的 API 数据无法恢复
3. **不灵活**: 用户必须提前知道需要什么数据，无法事后调整

### 改进后的优势

1. **记录所有 API**: `injected.js` 拦截并记录所有 API 请求
2. **动态过滤**: 在 `content.js` 和 `popup.js` 中根据用户设置动态过滤显示
3. **实时生效**: 修改过滤条件后立即生效，无需刷新页面
4. **支持不过滤**: 留空过滤条件 = 显示所有 API

---

## 🔧 技术实现

### 架构变更

**旧架构**:
```
用户访问页面
    ↓
injected.js 拦截 API
    ↓
检查是否匹配过滤条件
    ↓
[匹配] → 记录数据 → 发送到 content.js
[不匹配] → 丢弃 ❌
```

**新架构**:
```
用户访问页面
    ↓
injected.js 拦截 API
    ↓
记录所有 API 数据 ✅
    ↓
发送到 content.js
    ↓
content.js 根据过滤条件动态显示/隐藏 ✅
    ↓
用户修改过滤条件 → 立即重新过滤 ✅
```

### 代码变更

#### 1. `injected.js` - 移除过滤逻辑

**移除内容**:
- ❌ `apiFilterKeywords` 配置
- ❌ `shouldInterceptAPI()` 函数
- ❌ `window.addEventListener('message', ...)` 监听器
- ❌ 所有 `if (!shouldInterceptAPI(url))` 检查

**保留内容**:
- ✅ 拦截所有 `fetch` 和 `XMLHttpRequest`
- ✅ 记录所有 API 数据到 `window.__spxAPIRecords`
- ✅ 通过 `postMessage` 发送到 `content.js`

#### 2. `content.js` - 添加过滤逻辑

**新增属性**:
```javascript
this.apiFilterKeywords = ['api_mart']; // 默认过滤条件
```

**新增方法**:
```javascript
shouldShowAPI(url) {
  // 如果没有设置过滤条件（空数组），显示所有接口
  if (this.apiFilterKeywords.length === 0) {
    return true;
  }
  
  // 检查 URL 是否包含任一关键词
  return this.apiFilterKeywords.some(keyword => url.includes(keyword));
}
```

**修改方法**:
- `loadSettings()`: 加载并解析过滤条件
  - 空字符串 → `apiFilterKeywords = []` （显示全部）
  - 有内容 → 按逗号分隔解析
  
- `findDataSources()`: 在遍历 API 记录时应用过滤
  ```javascript
  this.apiRecords.forEach((record, id) => {
    // 应用过滤条件
    if (!this.shouldShowAPI(record.url)) {
      console.log(`⏭️ 跳过 API（不符合过滤条件）: ${record.url}`);
      return; // 跳过不符合过滤条件的接口
    }
    // ... 继续匹配逻辑
  });
  ```

**新增消息处理**:
```javascript
if (request.action === 'UPDATE_API_FILTER') {
  const keywords = request.keywords || '';
  
  if (keywords.trim() === '') {
    this.apiFilterKeywords = [];
    console.log('🔄 API 过滤条件已更新: 显示所有接口');
  } else {
    this.apiFilterKeywords = keywords.split(',').map(k => k.trim()).filter(k => k);
    console.log('🔄 API 过滤条件已更新:', this.apiFilterKeywords);
  }
  
  sendResponse({ success: true });
}
```

#### 3. `popup.js` - 实时通知标签页

**修改**: `saveApiFilter` 按钮点击事件

```javascript
document.getElementById('saveApiFilter')?.addEventListener('click', async function() {
  const keywords = apiFilterInput.value.trim();
  console.log('💾 [Popup] 保存 API 过滤条件:', keywords);
  
  await chrome.storage.local.set({ apiFilterKeywords: keywords });
  
  // 通知所有标签页更新过滤条件
  const tabs = await chrome.tabs.query({});
  let successCount = 0;
  let failCount = 0;
  
  for (const tab of tabs) {
    if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'UPDATE_API_FILTER',
          keywords: keywords
        });
        successCount++;
      } catch (err) {
        failCount++;
      }
    }
  }
  
  console.log(`📊 [Popup] 通知完成: ${successCount} 成功, ${failCount} 失败`);
  
  if (successCount > 0) {
    showToast(keywords === '' ? '✅ 过滤条件已清空（显示所有API）' : '✅ 过滤条件已保存并生效');
  } else if (failCount > 0) {
    showToast('⚠️ 过滤条件已保存，请刷新页面让设置生效');
  }
});
```

**改进**:
- ✅ 详细记录通知结果
- ✅ 根据结果给出精确反馈
- ✅ 区分"清空过滤"和"设置过滤"的提示

#### 4. `popup.html` - 更新说明文本

**旧文本**:
```
只拦截包含以下关键词的接口（逗号分隔，留空则拦截所有）
```

**新文本**:
```
过滤哪些接口会显示在查找结果中（逗号分隔）
留空 = 显示所有API
```

**占位符**:
```
例如: api_mart, /api/, graphql （留空显示全部）
```

---

## 🧪 测试指南

### 测试场景 1：记录所有 API

**步骤**:
1. 打开扩展 Popup，将过滤条件**清空**（删除 `api_mart`）
2. 点击"💾 保存过滤条件"
3. 打开任意网页（例如 SPX 页面）
4. 观察控制台日志，应该看到**所有** API 都被记录

**预期结果**:
```
🚀 [SPX Helper] 拦截到 Fetch: /api/bff/apollo/get_config/...
📡 [SPX Helper] Fetch 记录成功
🚀 [SPX Helper] 拦截到 XHR: GET https://autobahn.ssc.shopeemobile.com/...
📡 [SPX Helper] XHR 记录成功
⚙️ [SPX Helper] API 过滤条件: 显示所有接口
```

### 测试场景 2：动态过滤显示

**步骤**:
1. 过滤条件设置为 `api_mart`
2. 选择页面上的文字，点击"🔍 查找来源"
3. 应该只显示包含 `api_mart` 的接口
4. 控制台显示：
   ```
   🔎 [SPX Helper] 开始查找数据来源
      当前过滤条件: ['api_mart']
   ⏭️ 跳过 API（不符合过滤条件）: /api/bff/apollo/...
   🔍 检查 API: /api_mart/order/get
   ```

**预期结果**:
- ✅ 只显示符合条件的 API
- ✅ 其他 API 被跳过但仍然记录在 `apiRecords` 中

### 测试场景 3：实时切换过滤条件

**步骤**:
1. 初始过滤条件: `api_mart`
2. 选择文字查找 → 只显示 `api_mart` 接口
3. 打开 Popup，修改过滤条件为空（清空输入框）
4. 点击"💾 保存过滤条件"
5. **不刷新页面**，再次选择相同文字查找
6. 应该显示**所有**匹配的 API

**预期结果**:
- ✅ 过滤条件立即生效，无需刷新
- ✅ 控制台显示：
  ```
  🔄 [SPX Helper] API 过滤条件已更新: 显示所有接口
  ```

### 测试场景 4：多个关键词

**步骤**:
1. 设置过滤条件: `api_mart, /bff/, graphql`
2. 保存
3. 选择文字查找
4. 应该显示包含任意一个关键词的 API

**预期结果**:
```
⚙️ [SPX Helper] API 过滤条件: ['api_mart', '/bff/', 'graphql']
🔍 检查 API: /api_mart/order/get ✅
🔍 检查 API: /api/bff/apollo/get_config ✅
⏭️ 跳过 API: /ticketcenter-api/escalation_ticket ❌
```

---

## 📊 性能影响

### 优点
- **数据完整性**: 所有 API 数据都被保留，用户可以随时调整过滤条件
- **灵活性**: 无需提前确定需要哪些数据

### 潜在问题
- **内存占用**: 记录所有 API 会占用更多内存
- **建议**: 在页面停留很长时间时，可能需要定期清理旧数据

### 优化建议（未来）
1. 添加"清空 API 记录"按钮
2. 自动清理超过 N 分钟的旧记录
3. 限制最大记录数量（例如 1000 条）

---

## 📝 用户指南

### 如何使用

1. **默认行为**: 只显示包含 `api_mart` 的接口
2. **显示所有 API**: 将过滤条件输入框**清空**，点击保存
3. **自定义过滤**: 输入关键词（逗号分隔），例如 `api_mart, /bff/`
4. **实时生效**: 修改过滤条件后立即生效，无需刷新页面

### 使用建议

- **日常使用**: 保持默认 `api_mart`，减少干扰
- **排查问题**: 清空过滤条件，查看所有 API
- **特定场景**: 根据需求自定义关键词

---

## 🔄 向后兼容性

- ✅ 完全兼容现有功能
- ✅ 默认值保持为 `api_mart`
- ✅ 用户无需修改配置

---

## ✅ 验收标准

- [x] `injected.js` 记录所有 API
- [x] `content.js` 根据过滤条件动态显示
- [x] 修改过滤条件立即生效
- [x] 支持"留空=显示全部"
- [x] 控制台日志清晰易读
- [x] 用户反馈准确

---

**修复版本**: v2.14.2
**修复日期**: 2025-02-10

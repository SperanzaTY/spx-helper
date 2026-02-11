# 实用工具分类状态记忆功能

## 问题描述
每次打开扩展，实用工具的分类（"通用工具" 和 "App 工具"）都会重置为默认状态：
- 通用工具：展开
- App 工具：收起

用户需要每次手动点击展开 "App 工具"，体验不佳。

## 解决方案

### 功能实现
1. **状态持久化**：使用 `chrome.storage.local` 存储分类展开状态
2. **初始化读取**：扩展启动时读取之前保存的状态并应用
3. **自动保存**：用户点击展开/收起时自动保存新状态

### 数据结构
```javascript
// chrome.storage.local
{
  "utilsCategoryExpanded": {
    "general": true,   // 通用工具：展开
    "app": false       // App 工具：收起
  }
}
```

### 代码逻辑

#### 1. 初始化时读取状态
```javascript
chrome.storage.local.get(['utilsCategoryExpanded'], function(result) {
  const utilsCategoryExpanded = result.utilsCategoryExpanded || {};
  
  categoryHeaders.forEach(header => {
    const categoryId = header.dataset.category; // 'general' or 'app'
    
    // 读取保存的状态，如果没有则使用默认值
    const defaultExpanded = categoryId === 'general';
    const isExpanded = utilsCategoryExpanded[categoryId] !== undefined 
      ? utilsCategoryExpanded[categoryId] 
      : defaultExpanded;
    
    // 应用状态到 UI
    if (isExpanded) {
      header.classList.add('active');
      content.classList.add('active');
      toggle.textContent = '▼';
    } else {
      header.classList.remove('active');
      content.classList.remove('active');
      toggle.textContent = '▶';
    }
  });
});
```

#### 2. 点击时保存状态
```javascript
header.addEventListener('click', function() {
  // 切换 UI 状态
  const newExpanded = !this.classList.contains('active');
  
  // 保存到 storage
  const categoryId = this.dataset.category;
  chrome.storage.local.get(['utilsCategoryExpanded'], function(result) {
    const utilsCategoryExpanded = result.utilsCategoryExpanded || {};
    utilsCategoryExpanded[categoryId] = newExpanded;
    chrome.storage.local.set({ utilsCategoryExpanded: utilsCategoryExpanded });
  });
});
```

## 使用示例

### 场景 1：首次使用
```
用户打开扩展
→ 通用工具：展开 ▼（默认）
→ App 工具：收起 ▶（默认）
```

### 场景 2：展开 App 工具
```
用户点击 "App 工具"
→ App 工具：展开 ▼
→ 状态保存到 storage: { "app": true }
```

### 场景 3：下次打开扩展
```
用户再次打开扩展
→ 从 storage 读取状态
→ 通用工具：展开 ▼（之前的状态）
→ App 工具：展开 ▼（保持展开！✅）
```

### 场景 4：折叠通用工具
```
用户点击 "通用工具"
→ 通用工具：收起 ▶
→ 状态保存: { "general": false, "app": true }
```

### 场景 5：下次打开
```
用户再次打开扩展
→ 通用工具：收起 ▶（保持收起！✅）
→ App 工具：展开 ▼（保持展开！✅）
```

## 技术细节

### 1. 选择器优化
```javascript
// 旧代码：会选中所有 .category-header（包括快速链接的分类）
document.querySelectorAll('.category-header')

// 新代码：只选中实用工具的分类
document.querySelectorAll('.utils-categories .category-header')
```

### 2. 唯一标识符
使用 `data-category` 属性而不是文本内容：
```html
<!-- 通用工具 -->
<button class="category-header" data-category="general">
  <span class="category-title">通用工具</span>
</button>

<!-- App 工具 -->
<button class="category-header" data-category="app">
  <span class="category-title">App 工具</span>
</button>
```

优势：
- ✅ 不受文本变化影响（如多语言支持）
- ✅ 不受 emoji 或格式符号影响
- ✅ 更可靠和可维护

### 3. 与快速链接分类隔离
两个功能使用不同的 storage key：
- 实用工具分类：`utilsCategoryExpanded`
- 快速链接分类：`categoryExpanded`

避免相互冲突。

### 4. 默认状态
```javascript
const defaultExpanded = categoryId === 'general';
// general → true（展开）
// app → false（收起）
```

这样符合大多数用户的使用习惯：常用的通用工具默认展开。

## 验证方法

### 手动测试
1. 打开扩展，点击展开 "App 工具"
2. 关闭扩展
3. 再次打开扩展
4. 验证 "App 工具" 仍然是展开状态 ✅

### 查看 Storage
打开 Chrome DevTools：
```javascript
// Console 中执行
chrome.storage.local.get(['utilsCategoryExpanded'], console.log);

// 预期输出
{
  utilsCategoryExpanded: {
    general: true,
    app: true
  }
}
```

### 清除状态（测试用）
```javascript
chrome.storage.local.remove('utilsCategoryExpanded', () => {
  console.log('已清除工具分类状态');
});
```

## 后续优化建议

### 1. 添加导入/导出设置
用户可以备份和恢复所有扩展设置：
```javascript
// 导出
chrome.storage.local.get(null, (data) => {
  const json = JSON.stringify(data, null, 2);
  // 下载为 JSON 文件
});

// 导入
chrome.storage.local.set(importedData);
```

### 2. 重置为默认设置
```javascript
document.getElementById('resetSettings').addEventListener('click', () => {
  chrome.storage.local.remove('utilsCategoryExpanded', () => {
    location.reload(); // 重新加载以应用默认状态
  });
});
```

### 3. 记忆最后使用的工具
不仅记忆分类展开状态，还记忆最后打开的工具：
```javascript
chrome.storage.local.set({ 
  lastUtilTool: 'api-tracker' 
});
```

下次打开扩展时自动切换到上次使用的工具。

## 总结

✅ **问题解决**：用户不再需要每次手动展开 "App 工具"  
✅ **用户体验提升**：状态在会话间持久化  
✅ **代码质量**：使用可靠的唯一标识符，避免命名冲突  
✅ **可维护性**：清晰的代码结构，易于扩展

这个功能虽然小，但显著提升了用户体验！

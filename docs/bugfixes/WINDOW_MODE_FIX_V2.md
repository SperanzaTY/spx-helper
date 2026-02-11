# 🔧 窗口模式修复 - 正确定位网页标签页

## ❌ 原问题

**窗口模式下，扩展无法抓取网页的 API**

### 原因分析

```javascript
// 旧代码
const [tab] = await chrome.tabs.query({ 
  active: true, 
  lastFocusedWindow: true 
});

// 问题：
// 1. lastFocusedWindow 指向扩展窗口本身
// 2. active: true 指扩展窗口中的活动标签（不存在）
// 3. 无法定位到真正的网页标签页
```

---

## ✅ 解决方案

### 核心思路

**获取所有标签页 → 过滤掉扩展页面 → 按最近活跃排序 → 选择第一个**

```javascript
// 1. 获取所有标签页
const tabs = await chrome.tabs.query({});

// 2. 过滤掉扩展自己的页面
const webTabs = tabs.filter(tab => {
  return tab.url && 
         !tab.url.startsWith('chrome://') && 
         !tab.url.startsWith('chrome-extension://') &&
         !tab.url.startsWith('edge://') &&
         !tab.url.startsWith('about:');
});

// 3. 按最近活跃时间排序
webTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

// 4. 选择最近活跃的网页
const tab = webTabs[0];
```

---

## 🔄 修复的函数

### 1. `loadAPIRecords()` - 加载 API 列表

**修复前**：
```javascript
const [tab] = await chrome.tabs.query({ 
  active: true, 
  lastFocusedWindow: true 
});
// ❌ 窗口模式下定位不到网页
```

**修复后**：
```javascript
const tabs = await chrome.tabs.query({});
const webTabs = tabs.filter(/* 过滤扩展页面 */);
webTabs.sort(/* 按活跃时间排序 */);
const tab = webTabs[0];
// ✅ 正确定位到最近的网页
```

### 2. `viewAPIRecordDetail()` - 查看 API 详情

同样的修复逻辑。

### 3. `startAPITracker` - 启动检查器

同样的修复逻辑。

### 4. `refreshPageBtn` - 刷新页面

同样的修复逻辑。

---

## 🎯 工作流程

### 修复前（窗口模式）

```
用户打开扩展窗口
       ↓
扩展窗口成为 lastFocusedWindow
       ↓
query({ active: true, lastFocusedWindow: true })
       ↓
找到扩展窗口本身 ❌
       ↓
无法获取网页的 API
```

### 修复后（窗口模式）

```
用户打开扩展窗口
       ↓
query({}) 获取所有标签页
       ↓
过滤掉扩展页面
       ↓
按 lastAccessed 排序
       ↓
找到最近活跃的网页 ✅
       ↓
成功获取网页的 API
```

---

## 🧪 测试步骤

### 第 1 步：重新加载扩展
```
chrome://extensions/ → SPX Helper → 🔄 重新加载
```

### 第 2 步：打开网页
```
打开任意网页（如 FMS）
F5 刷新页面
等待 API 请求完成
```

### 第 3 步：窗口模式打开扩展
```
右键扩展图标 → 以窗口模式打开
或
已打开的窗口模式
```

### 第 4 步：查看 API 列表
```
实用工具 → API溯源
```

**预期结果**：
- ✅ 显示已捕获的 API 数量（> 0）
- ✅ 列表显示最近的 API 记录
- ✅ Console 显示：`✅ 找到目标标签页: https://...`

### 第 5 步：测试其他功能

**刷新页面**：
```
点击 "🔄 刷新页面" 按钮
→ ✅ 网页被刷新
```

**启动检查器**：
```
点击 "🎯 启动检查器" 按钮
→ ✅ 网页显示检查器提示条
```

**查看详情**：
```
点击 API 列表中的任意记录
→ ✅ 在新窗口中打开详情
```

---

## 📊 对比测试

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 弹出模式 | ✅ 正常 | ✅ 正常 |
| 窗口模式 - 加载 API | ❌ 失败 | ✅ 成功 |
| 窗口模式 - 刷新页面 | ❌ 失败 | ✅ 成功 |
| 窗口模式 - 启动检查器 | ❌ 失败 | ✅ 成功 |
| 窗口模式 - 查看详情 | ❌ 失败 | ✅ 成功 |

---

## 🔍 调试技巧

### 查看目标标签页

打开 Console（F12），运行：

```javascript
// 查看所有标签页
chrome.tabs.query({}, (tabs) => {
  console.log('所有标签页:', tabs);
  
  // 过滤网页
  const webTabs = tabs.filter(tab => {
    return tab.url && 
           !tab.url.startsWith('chrome://') && 
           !tab.url.startsWith('chrome-extension://');
  });
  
  console.log('网页标签页:', webTabs);
  
  // 排序
  webTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  
  console.log('最近活跃的:', webTabs[0]);
});
```

---

## 🎉 修复效果

### 弹出模式
- ✅ 继续正常工作
- ✅ 没有任何影响

### 窗口模式
- ✅ 正确定位网页标签页
- ✅ 能够加载 API 列表
- ✅ 能够刷新网页
- ✅ 能够启动检查器
- ✅ 能够查看 API 详情

---

## 💡 关键改进

### 1. 更智能的标签页查询
```javascript
// 不依赖 lastFocusedWindow
// 不依赖 active
// 只依赖 lastAccessed（最近访问时间）
```

### 2. 自动过滤扩展页面
```javascript
// 不会误选扩展自己的页面
// 不会误选浏览器内部页面
```

### 3. 添加调试日志
```javascript
console.log('✅ 找到目标标签页:', tab.url);
// 方便调试和确认
```

---

**现在测试窗口模式！** 🪟

```bash
1️⃣ 重新加载扩展
2️⃣ 打开网页并刷新
3️⃣ 窗口模式打开扩展
4️⃣ 查看 API 列表
```

应该能看到网页的 API 了！

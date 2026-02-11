# 窗口模式测试场景

## 修复内容
✅ **问题**: 每次点击扩展图标都创建新窗口，而不是聚焦已存在的窗口
✅ **修复**: 优化窗口查找和聚焦逻辑

## 核心改进

### 1. 双层查找策略
- **第一层**: 优先使用记录的 `currentWindowId` 快速聚焦
- **第二层**: 如果记录失效，遍历所有窗口精确匹配

### 2. 精确 URL 匹配
- **旧方法**: `url.includes(chrome.runtime.id)` - 不够精确
- **新方法**: `url.startsWith(chrome.runtime.getURL('popup.html'))` - 精确匹配

### 3. 完善的状态管理
- 窗口创建时保存 ID
- 窗口关闭时清除 ID
- 聚焦失败时重新查找

## 测试步骤

### 准备工作
1. 打开 `chrome://extensions/`
2. 点击 SPX Helper 的「重新加载」
3. 点击「Service Worker」打开控制台

### 测试场景 1: 基本窗口聚焦
```
1. 点击扩展图标 → 应该打开新窗口
   日志: "🔵 当前记录的 currentWindowId: null"
        "🔵 开始查找现有窗口..."
        "🔵 未找到现有窗口，创建新窗口"
        "窗口创建成功，ID: xxx"

2. 最小化或切换到其他窗口

3. 再次点击扩展图标 → 应该聚焦已存在的窗口（不创建新窗口）
   日志: "🔵 当前记录的 currentWindowId: xxx"
        "🔵 尝试聚焦已记录的窗口ID: xxx"
        "✅ 成功聚焦已存在的窗口: xxx"

4. 重复步骤 2-3 多次，每次都应该聚焦同一个窗口
```

### 测试场景 2: 窗口关闭后重新打开
```
1. 打开窗口（如场景1）
2. 关闭窗口
   日志: "🔵 窗口关闭，ID: xxx"
        "✅ 清除记录的窗口ID"

3. 再次点击扩展图标 → 应该创建新窗口
   日志: "🔵 当前记录的 currentWindowId: null"
        "🔵 开始查找现有窗口..."
        "🔵 未找到现有窗口，创建新窗口"
```

### 测试场景 3: 手动打开多个窗口（极端情况）
```
1. 在地址栏输入: chrome-extension://[扩展ID]/popup.html?mode=window
2. 手动打开 2-3 个窗口
3. 点击扩展图标 → 应该聚焦第一个找到的窗口
   日志: "✅ 找到匹配的窗口！ID: xxx"
```

## 预期结果

✅ **正常情况**: 只保持一个窗口，多次点击图标只会聚焦该窗口
✅ **窗口关闭后**: 会创建新窗口
✅ **Service Worker 重启后**: 失去 currentWindowId 记录，但仍能通过遍历找到窗口

## 如果仍有问题

### 1. 检查日志
- 是否看到 "🔵 当前记录的 currentWindowId: xxx"
- 是否看到 "✅ 成功聚焦已存在的窗口"
- 是否有错误日志

### 2. 手动清除状态
在控制台运行：
```javascript
currentWindowId = null;
console.log('已清除 currentWindowId');
```

### 3. 检查扩展 ID
在控制台运行：
```javascript
console.log('Popup URL:', chrome.runtime.getURL('popup.html'));
```

确保 URL 格式正确（应该类似 `chrome-extension://xxxxx/popup.html`）

## 成功标志

当你看到以下日志序列时，说明修复成功：

```
首次点击:
  🔵 当前记录的 currentWindowId: null
  🔵 开始查找现有窗口...
  🔵 未找到现有窗口，创建新窗口
  窗口创建成功，ID: 123

第二次点击:
  🔵 当前记录的 currentWindowId: 123
  🔵 尝试聚焦已记录的窗口ID: 123
  ✅ 成功聚焦已存在的窗口: 123

第三次点击:
  🔵 当前记录的 currentWindowId: 123
  🔵 尝试聚焦已记录的窗口ID: 123
  ✅ 成功聚焦已存在的窗口: 123
```

关闭窗口后:
```
  🔵 窗口关闭，ID: 123
  ✅ 清除记录的窗口ID
```

再次点击:
```
  🔵 当前记录的 currentWindowId: null
  🔵 开始查找现有窗口...
  🔵 未找到现有窗口，创建新窗口
  窗口创建成功，ID: 456
```


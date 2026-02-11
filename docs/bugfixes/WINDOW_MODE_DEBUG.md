# 窗口模式调试说明

## 问题历史

### 问题 1: 启用窗口模式后无法打开窗口 ✅ 已修复
**症状**: 启用窗口模式后，点击扩展图标无反应

### 问题 2: 每次点击都创建新窗口 ✅ 已修复
**症状**: 点击扩展图标时，不会回到已存在的窗口，而是创建新窗口
**原因**: 
1. URL 匹配逻辑不够精确（`includes` 方法可能匹配失败）
2. 没有优先使用记录的 `currentWindowId`

## 最新修复（v2）

### 1. 优化窗口查找策略
- ✅ 优先使用记录的 `currentWindowId` 快速聚焦
- ✅ 如果记录的窗口不存在，再遍历所有窗口查找
- ✅ 使用 `startsWith()` 替代 `includes()` 精确匹配 URL
- ✅ 使用 `chrome.runtime.getURL('popup.html')` 获取完整 URL 进行匹配

### 2. 改进的窗口管理流程

```
点击图标
  ↓
检查 currentWindowId
  ↓
有记录? 
  是 → 尝试聚焦 → 成功? 是 → 完成
                    ↓ 否
  否 → 查找所有窗口 → 找到? 是 → 聚焦 → 完成
                              ↓ 否
                         创建新窗口
```

### 3. 核心代码改进

#### `openHelperWindow` 函数
- 首先检查 `currentWindowId` 是否有效
- 如果有效，直接聚焦，避免遍历所有窗口
- 如果无效或聚焦失败，调用 `findOrCreateWindow`

#### 新增 `findOrCreateWindow` 函数
- 获取完整的 popup URL
- 遍历所有 popup 类型窗口
- 使用 `url.startsWith(popupUrl)` 精确匹配
- 找到后更新 `currentWindowId` 并聚焦
- 未找到则创建新窗口

#### `onRemoved` 监听器
- 窗口关闭时清除 `currentWindowId`
- 添加调试日志

## 已做的改进

### 1. `createWindow` 函数
- 添加了更完善的参数处理
- 添加了失败重试机制
- 添加了详细的调试日志

### 2. `openHelperWindow` 函数
- 添加了详细的调试日志
- 改进了错误处理
- 添加了窗口聚焦的错误回调

### 3. 消息监听器
- 为所有窗口相关操作添加了详细日志
- 添加了 `setPopup` 操作的错误回调

### 4. 图标点击监听器
- 添加了详细的状态日志
- 添加了配置异常的提示

## 调试步骤

1. **重新加载扩展**
   - 打开 Chrome: `chrome://extensions/`
   - 开启"开发者模式"
   - 点击 SPX Helper 的"重新加载"按钮

2. **查看 Service Worker 日志**
   - 在扩展卡片上点击"Service Worker"链接
   - 打开开发者工具

3. **测试流程**
   - 点击扩展图标打开弹窗（popup 模式）
   - 打开设置面板
   - 启用"窗口模式"
   - 查看控制台输出，应该看到：
     ```
     🔵 收到切换窗口模式请求，enabled: true
     ✅ 已切换到窗口模式（移除 popup）
     🔵 收到打开窗口请求
     🔵 获取到的窗口位置: {...}
     🔵 openHelperWindow 被调用，参数: {...}
     ...
     ```

4. **点击图标测试**
   - 关闭当前弹窗/窗口
   - 点击工具栏的 SPX Helper 图标
   - 查看 Service Worker 控制台，应该看到：
     ```
     🔵 扩展图标被点击
     🔵 当前设置 - windowMode: true, windowPosition: {...}
     🔵 窗口模式已启用，调用 openHelperWindow
     ...
     ```

## 常见问题

### 问题1: 图标点击无反应
**可能原因**: popup 没有被正确清除
**解决方法**: 
- 查看控制台是否有"扩展图标被点击"日志
- 如果没有，说明 `setPopup({ popup: '' })` 没有生效
- 尝试重新加载扩展

### 问题2: 创建窗口失败
**可能原因**: 窗口参数不合法
**解决方法**:
- 查看"创建窗口，配置:"日志
- 检查 width、height、left、top 值是否合理
- 系统会自动重试使用默认配置

### 问题3: 窗口位置异常
**可能原因**: 保存的位置超出屏幕范围
**解决方法**:
- 手动清除存储的位置：
  ```javascript
  chrome.storage.local.set({ 
    windowPosition: { left: 100, top: 50, width: 780, height: 760 } 
  });
  ```

## 日志符号说明
- 🔵 = 流程节点/信息
- ✅ = 成功
- ❌ = 错误
- ⚠️ = 警告



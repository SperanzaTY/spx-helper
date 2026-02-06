# 🧪 API 溯源工具 - 调试测试指南

## ✅ 已完成的清理

### 删除的代码
- ❌ `showNoSourcePanel()` - 不再需要的弹窗面板
- ❌ 相关的事件监听器和阻止逻辑

### 保留的代码
- ✅ `showDataSourceTooltip()` - 悬停提示框（新）
- ✅ `hideDataSourceTooltip()` - 隐藏提示框（新）
- ✅ `showDataSourcePanel()` - 完整数据面板（点击时使用）
- ✅ `handleMouseOver()` - 悬停处理（已更新）
- ✅ `handleClick()` - 点击处理（已更新）

---

## 🔍 调试步骤

### 第 1 步：重新加载扩展（必须！）

```bash
1. 打开 chrome://extensions/
2. 找到 SPX Helper
3. 点击 🔄 "重新加载"按钮
4. 看到扩展图标闪烁一下
```

### 第 2 步：打开测试页面

```bash
1. 打开任意网页（如 FMS、DataSuite）
2. 按 F5 刷新页面
3. 等待页面完全加载
```

### 第 3 步：打开 Console

```bash
1. 按 F12 打开开发者工具
2. 切换到 "Console" 标签
3. 清空 Console（右键 → Clear console）
```

### 第 4 步：验证 content.js 加载

在 Console 中应该看到：
```
✅ [SPX Helper] API 数据溯源工具已加载
✅ [SPX Helper] 开始拦截 API 请求
✅ [SPX Helper] Content Script 已就绪
```

**如果没有看到这些日志**：
- content.js 没有加载
- 返回第 1 步重新加载扩展
- 或者第 2 步刷新页面

### 第 5 步：启动检查器

```bash
1. 打开扩展窗口（窗口模式）
2. 实用工具 → API溯源
3. 点击 "🎯 启动检查器"
```

**预期结果**：
- Toast 提示："✅ 检查器已启动"
- 页面顶部出现紫色提示条
- Console 显示："🎯 [SPX Helper] 检查器模式已启用"

### 第 6 步：测试鼠标悬停

```bash
1. 移动鼠标到页面上的任意元素
2. 观察 Console 输出
```

**预期 Console 输出**：
```
🔍 [SPX Helper] 鼠标悬停: DIV Station 201...
📝 [SPX Helper] 提取文本: ["Station 201", "Jakarta Hub"]
📡 [SPX Helper] 找到数据来源: 2
💬 [SPX Helper] 显示提示框, 数据来源数量: 2
✅ [SPX Helper] 显示：找到 2 个数据来源
✅ [SPX Helper] 提示框已添加到 DOM
```

**如果没有任何输出**：
- 检查器没有启动成功
- 重新点击"启动检查器"

### 第 7 步：观察页面

移动鼠标到元素上时，应该看到：

1. **元素高亮**
   - 紫色边框
   - 半透明背景

2. **元素信息框**（元素上方）
   - 显示标签名和 class
   - 例如："div.station-card"

3. **数据来源提示框**（元素下方）
   - 如果找到数据：蓝色框 "📡 找到 X 个数据来源"
   - 如果未找到：橙色框 "⚠️ 未找到数据来源"

---

## 🐛 故障排查

### 问题 1: 没有任何反应

**检查清单**：
- [ ] 扩展已重新加载
- [ ] 页面已刷新
- [ ] Console 有 content.js 加载日志
- [ ] 检查器已启动（顶部有提示条）
- [ ] 移动鼠标到页面元素（不是空白处）

**解决方案**：
```bash
1. 完全关闭并重新打开浏览器
2. 重新加载扩展
3. 重新打开页面
4. 启动检查器
```

### 问题 2: 有高亮但没有提示框

**可能原因**：
- `showDataSourceTooltip()` 函数有错误
- 提示框被其他元素遮挡

**调试方法**：
```javascript
// 在 Console 中手动检查
const tooltip = document.getElementById('spx-api-tracker-tooltip');
console.log('提示框元素:', tooltip);

// 如果是 null，说明没有创建成功
// 查看 Console 是否有错误信息
```

### 问题 3: Console 有日志但页面无变化

**可能原因**：
- z-index 太低，被其他元素遮挡
- 位置计算错误，在屏幕外

**解决方案**：
```javascript
// 在 Console 中运行
const tooltip = document.getElementById('spx-api-tracker-tooltip');
if (tooltip) {
  tooltip.style.top = '100px';
  tooltip.style.left = '100px';
  tooltip.style.zIndex = '9999999';
}
```

### 问题 4: 提示框位置不对

**调整位置**：
修改 `showDataSourceTooltip` 中的位置计算：
```javascript
// 改为固定位置测试
top: ${100}px;  // 固定在 100px
left: ${100}px;  // 固定在 100px
```

---

## 📊 完整测试流程

### 成功的完整输出示例

```
# 页面加载
✅ [SPX Helper] API 数据溯源工具已加载
✅ [SPX Helper] 开始拦截 API 请求
📡 [SPX Helper] Fetch: https://api.example.com/stations
📡 [SPX Helper] Fetch: https://api.example.com/user
✅ [SPX Helper] Content Script 已就绪

# 启动检查器
🎯 [SPX Helper] 检查器模式已启用

# 移动鼠标
🔍 [SPX Helper] 鼠标悬停: DIV Station 201...
📝 [SPX Helper] 提取文本: ["Station 201", "Jakarta Hub"]
📡 [SPX Helper] 找到数据来源: 2
💬 [SPX Helper] 显示提示框, 数据来源数量: 2
✅ [SPX Helper] 显示：找到 2 个数据来源
✅ [SPX Helper] 提示框已添加到 DOM

# 移开鼠标
（提示框消失）

# 再移动到另一个元素
🔍 [SPX Helper] 鼠标悬停: H1 Dashboard
📝 [SPX Helper] 提取文本: ["Dashboard"]
📡 [SPX Helper] 找到数据来源: 0
💬 [SPX Helper] 显示提示框, 数据来源数量: 0
⚠️ [SPX Helper] 显示：未找到数据来源
✅ [SPX Helper] 提示框已添加到 DOM
```

---

## 🎯 验证成功的标准

所有以下条件都满足 = 功能正常：

- [x] Console 有完整的日志输出
- [x] 移动鼠标时元素高亮
- [x] 元素上方显示标签信息
- [x] 元素下方显示数据来源提示框
- [x] 找到数据时显示蓝色框
- [x] 未找到数据时显示橙色框
- [x] 移开鼠标时提示框消失
- [x] 点击元素时显示完整面板

---

## 🚀 快速测试命令

在 Console 中运行以下命令进行快速测试：

```javascript
// 1. 检查 content.js 是否加载
window.spxAPITracker ? '✅ 已加载' : '❌ 未加载'

// 2. 查看 API 数量
window.spxAPITracker?.apiRecords.size

// 3. 检查检查器状态
window.spxAPITracker?.inspectorMode ? '✅ 运行中' : '⚪ 未启动'

// 4. 手动启动检查器
window.spxAPITracker?.enableInspectorMode()

// 5. 手动测试提示框
const testElement = document.body.firstElementChild;
const rect = testElement.getBoundingClientRect();
const tooltip = document.createElement('div');
tooltip.style.cssText = `
  position: fixed;
  top: ${rect.bottom + 10}px;
  left: ${rect.left}px;
  background: rgba(102, 126, 234, 0.95);
  color: white;
  padding: 10px;
  border-radius: 8px;
  z-index: 9999999;
`;
tooltip.textContent = '测试提示框';
document.body.appendChild(tooltip);
// 应该能在页面上看到蓝色提示框
```

---

## 📝 请报告以下信息

如果还是不工作，请提供：

1. **Console 日志**
   - 完整的 Console 输出
   - 是否有错误信息（红色）

2. **步骤确认**
   - 是否重新加载了扩展？
   - 是否刷新了页面？
   - 是否看到了顶部提示条？

3. **手动测试结果**
   ```javascript
   // 运行这些命令并告诉我结果
   window.spxAPITracker
   window.spxAPITracker?.inspectorMode
   document.getElementById('spx-api-tracker-tip')
   ```

---

**按照这个指南测试，应该能找到问题所在！** 🔍

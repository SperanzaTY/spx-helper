# 🎉 SPX Helper v2.9.0 - API 数据溯源功能测试指南

## ✅ 集成完成

API 数据溯源工具已成功集成到 SPX Helper！

---

## 📦 新增文件

1. **content.js** - Content Script，负责拦截 API 和页面交互
2. **manifest.json** - 更新到 v2.9.0，添加了 content_scripts 配置
3. **popup.html** - 新增"API溯源"工具入口
4. **popup.js** - 新增 API 溯源控制逻辑

---

## 🧪 测试步骤

### 1. 重新加载扩展

```
1. 打开 chrome://extensions/
2. 找到 SPX Helper
3. 点击"重新加载"按钮
```

### 2. 访问测试网站

推荐测试网站（有大量 API 请求）：
- ✅ 淘宝商品页：https://item.taobao.com/
- ✅ 京东商品页：https://item.jd.com/
- ✅ DataSuite：https://datasuite.shopee.io/
- ✅ 任何你的业务系统页面

### 3. 打开扩展

点击 SPX Helper 图标

### 4. 进入 API 溯源工具

```
实用工具 → API溯源
```

### 5. 查看捕获的 API

你应该能看到：
- **已捕获 API 数量**（自动更新）
- **最近 10 条 API 请求列表**
  - 显示 Method（GET/POST）
  - 显示 Status（200/404）
  - 显示耗时（ms）
  - 显示时间戳

### 6. 启动检查器

点击 **"🎯 启动检查器"** 按钮

### 7. 点击页面元素

- Popup 会自动关闭
- 页面顶部会显示提示：**"API 溯源模式 - 点击元素查看数据来源"**
- 鼠标悬停在元素上会高亮显示
- 点击任意元素

### 8. 查看结果

**情况 A - 找到数据来源：**
```
会弹出数据来源面板，显示：
✅ 来源 1: GET 200
   https://api.example.com/product/detail
   ⏱️ 150ms | 🕐 10:30:15
   
   📋 匹配详情：
   - data.product.title
   - 匹配文本: "iPhone 15 Pro Max"
   
   [📄 查看完整响应] [📋 复制 URL]
```

**情况 B - 未找到数据来源：**
```
会显示提示面板：
🤷 未找到数据来源

该元素的内容可能是：
• 硬编码在页面中
• 来自尚未捕获的 API
• 通过 WebSocket 获取
```

### 9. 退出检查器

按 **ESC 键** 或点击提示框中的 **"ESC 退出"** 按钮

---

## 🎯 实际应用场景

### 场景 1：定位业务问题

```
问题：DataSuite 页面某个数据显示异常

步骤：
1. 打开 DataSuite 页面
2. 启动 SPX Helper API 溯源
3. 点击异常数据元素
4. 查看数据来自哪个 API
5. 复制 API URL，用 HTTP 工具测试
6. 快速定位是前端问题还是后端数据问题
```

### 场景 2：学习系统架构

```
目标：了解某个页面的数据流

步骤：
1. 打开目标页面
2. 查看 SPX Helper 捕获的所有 API
3. 点击不同区块的元素
4. 梳理出完整的数据依赖关系
```

### 场景 3：调试前端

```
问题：不确定某个字段来自哪个接口

步骤：
1. 启动检查器
2. 直接点击显示该字段的元素
3. 立即看到数据路径（如 data.result.userName）
4. 查看完整 API 响应，确认数据结构
```

---

## 🔧 功能特点

✅ **自动拦截** - 页面加载时自动拦截所有 Fetch 和 XHR 请求  
✅ **智能匹配** - 递归搜索 API 响应，找到匹配的数据  
✅ **可视化展示** - 清晰显示数据路径和 API 详情  
✅ **实时监控** - 在 Popup 中实时显示捕获的 API  
✅ **完整响应** - 可在新窗口查看完整 JSON  
✅ **一键复制** - 复制 API URL 快速测试  

---

## 🐛 已知限制

1. **WebSocket** - 目前不支持 WebSocket 数据追踪
2. **SSE** - Server-Sent Events 暂不支持
3. **跨域限制** - 某些跨域请求可能无法拦截
4. **响应格式** - 仅支持 JSON 格式的响应

---

## 💡 调试技巧

### 查看 Console 日志

```
F12 → Console

应该能看到：
✅ [SPX Helper] Content Script 已就绪
✅ [SPX Helper] 开始拦截 API 请求
📡 [SPX Helper] Fetch: https://api.example.com/...
```

### 检查 Content Script 是否加载

```javascript
// 在页面 Console 中运行
console.log(window.spxAPITracker);

// 应该返回：
APIDataTracker {apiRecords: Map(5), ...}
```

### 手动启动检查器

```javascript
// 在页面 Console 中运行
window.spxAPITracker.enableInspectorMode();
```

---

## 🎨 样式优化建议

如果你想自定义检查器的样式，可以修改 `content.js` 中的这些部分：

```javascript
// 高亮颜色（第 235 行附近）
outline: 3px solid #667eea !important;  // 改成你喜欢的颜色

// 提示框颜色（第 400 行附近）
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

---

## 📊 版本信息

- **版本**: v2.9.0
- **新增功能**: API 数据溯源工具
- **兼容性**: Chrome 88+
- **发布日期**: 2026-01-30

---

## 🚀 下一步

1. ✅ 测试功能是否正常
2. ⏳ 根据需要调整样式和交互
3. ⏳ 添加更多高级功能（如 WebSocket 支持）
4. ⏳ 发布 v2.9.0 版本

---

**祝测试顺利！有任何问题随时反馈！** 🎉

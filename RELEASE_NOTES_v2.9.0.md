# 🎉 SPX Helper v2.9.0 发布说明

## 📦 版本信息
- **版本号**: v2.9.0
- **发布日期**: 2025-02-02
- **基于版本**: v2.8.1 (站点查询稳定版)

---

## ✨ 新增功能

### 🔍 API 数据溯源工具
一个强大的调试工具，帮助你快速定位页面元素的数据来源。

#### 主要特性
1. **自动 API 拦截**
   - 自动拦截所有 Fetch 和 XMLHttpRequest 请求
   - 记录 API 的 URL、方法、状态码、响应时间
   - 存储最近 100 条 API 记录

2. **检查器模式**
   - 一键启动检查器
   - 鼠标悬停高亮页面元素
   - 点击元素查看数据来源
   - 按 ESC 退出检查器

3. **智能数据匹配**
   - 递归搜索 API 响应 JSON
   - 自动提取元素文本内容
   - 匹配精度高，支持复杂嵌套数据
   - 显示完整的数据路径

4. **可视化展示**
   - 美观的数据来源面板
   - 高亮匹配的字段路径
   - 查看完整的 API 响应
   - 一键复制 API URL

#### 使用场景
- 🐛 **调试业务系统**: 快速找到数据来源 API
- 📊 **分析数据流**: 理解页面数据从哪里来
- 🔧 **API 定位**: 不用翻代码就能找到接口
- 🚀 **提升效率**: 节省大量调试时间

---

## 📝 完整更新日志

### 新增 (Added)
- ✅ API 数据溯源工具完整功能
- ✅ Content Script 自动注入机制
- ✅ API 拦截和记录系统
- ✅ 检查器模式交互界面
- ✅ 数据来源智能匹配算法
- ✅ 实时 API 统计面板

### 修改 (Changed)
- 📦 版本号从 2.8.1 升级到 2.9.0
- 📄 扩展描述新增 "API数据溯源"
- 🎨 实用工具网格新增 "API溯源" 按钮

### 权限 (Permissions)
- 新增 `scripting` 权限（用于脚本注入）
- 新增 `tabs` 权限（用于标签页通信）

---

## 📁 文件变更

### 新增文件
- `content.js` - API 拦截和检查器核心逻辑 (21KB)
- `API_TRACKER_IMPLEMENTATION_GUIDE.md` - 实现指南
- `API_TRACKER_QUICK_TEST.md` - 快速测试指南
- `API_DATA_TRACKER.md` - 功能文档
- `CONTENT_SCRIPT_TUTORIAL.md` - Content Script 教程

### 修改文件
- `manifest.json` - 版本、权限、content_scripts 配置
- `popup.html` - 新增 API 溯源 UI (新增 ~60 行)
- `popup.js` - 新增 API 溯源逻辑 (新增 ~130 行)

---

## 🎯 技术亮点

### 1. 零配置自动拦截
```javascript
// 页面加载时自动启用
document.addEventListener('DOMContentLoaded', () => {
  apiTracker.enable();
});
```

### 2. 非侵入式拦截
```javascript
// 保存原始方法
const originalFetch = window.fetch;

// 拦截但不影响原功能
window.fetch = async function(...args) {
  const response = await originalFetch.apply(this, args);
  // ... 记录数据 ...
  return response; // 原样返回
};
```

### 3. 递归数据搜索
```javascript
searchInObject(obj, searchTexts, path = '', results = []) {
  // 递归搜索所有层级
  // 支持对象、数组、基本类型
  // 记录完整路径
}
```

### 4. Chrome Extension 消息通信
```javascript
// Popup ↔ Content Script
chrome.tabs.sendMessage(tab.id, { action: 'START_INSPECTOR' });
chrome.runtime.onMessage.addListener((message) => { ... });
```

---

## 🧪 测试建议

### 快速测试
```bash
1. 重新加载扩展 (chrome://extensions/)
2. 打开测试页面（如 DataSuite）
3. 打开扩展 → 实用工具 → API溯源
4. 点击"启动检查器"
5. 点击页面元素查看数据来源
```

### 推荐测试页面
- DataSuite (表格数据丰富)
- FMS SPX Admin (站点信息)
- 任意有 API 调用的业务系统

详细测试步骤见 `API_TRACKER_QUICK_TEST.md`

---

## 🎨 界面预览

### 扩展 Popup
```
┌─────────────────────────────────┐
│ 实用工具                         │
├─────────────────────────────────┤
│ ⏰        🔍        📋           │
│ 时区转换  API溯源  JSON格式化    │
└─────────────────────────────────┘

API 溯源面板:
┌─────────────────────────────────┐
│ 🔍 API 数据溯源                  │
├─────────────────────────────────┤
│ [🎯 启动检查器]                  │
│                                  │
│ 已捕获 API: 15    检查器: 待命   │
│                                  │
│ 📋 最近的 API 调用               │
│ GET 200 /api/stations (125ms)   │
│ POST 200 /api/query (234ms)     │
└─────────────────────────────────┘
```

### 检查器模式
```
页面顶部提示条:
┌─────────────────────────────────────┐
│ 🎯 API 溯源模式 - 点击元素查看数据来源  │
│                            [ESC 退出] │
└─────────────────────────────────────┘

元素高亮:
    ┌───────────────────┐
    │ div.station-card  │ ← 浮动标签
    └───────────────────┘
    ┌───────────────────┐
    │ 🚉 Station 201    │ ← 紫色边框高亮
    │ Jakarta Hub       │
    └───────────────────┘
```

### 数据来源面板
```
┌─────────────────────────────────────────┐
│ 🔍 API 数据溯源               [✕]       │
│ 找到 2 个数据来源                        │
├─────────────────────────────────────────┤
│ 来源 1: GET 200                [3 个匹配]│
│ /api/stations/id/201                    │
│ ⏱️ 125ms | 🕐 14:23:45                  │
│                                          │
│ 📋 查看匹配详情 (3) ▼                   │
│   data.station_name: "Jakarta Hub"      │
│   data.station_id: 201                  │
│                                          │
│ [📄 查看完整响应] [📋 复制 URL]         │
└─────────────────────────────────────────┘
```

---

## 📚 文档

### 用户文档
- `API_TRACKER_QUICK_TEST.md` - 5分钟快速上手
- `API_DATA_TRACKER.md` - 完整功能说明

### 开发文档
- `API_TRACKER_IMPLEMENTATION_GUIDE.md` - 技术实现细节
- `CONTENT_SCRIPT_TUTORIAL.md` - Content Script 教程

---

## 🐛 已知问题

### 当前版本
- ✅ 无已知问题

### 限制
- WebSocket 数据不会被拦截（需要额外实现）
- iframe 内容默认不追踪（`all_frames: false`）
- 非 JSON 响应会被忽略

---

## 🔄 升级指南

### 从 v2.8.1 升级
1. **自动升级**: Chrome 会自动更新扩展
2. **手动升级**: 
   - 下载 `spx-helper-v2.9.0.zip`
   - 解压到本地
   - chrome://extensions/ → 加载已解压的扩展

### 数据迁移
- 无需迁移，所有配置保留
- 新功能独立运行，不影响现有功能

---

## 🚀 未来规划

### v2.9.x 小版本更新
- [ ] API 过滤和搜索功能
- [ ] 导出 API 记录为 JSON
- [ ] 支持 WebSocket 拦截

### v2.10.0 大版本更新
- [ ] GraphQL 查询分析
- [ ] API 性能监控
- [ ] 请求时间线视图
- [ ] 数据依赖关系图

---

## 📞 反馈与支持

### 问题反馈
- GitHub Issues: https://github.com/[your-repo]/issues
- 邮件: tianyi.liang@shopee.com

### 贡献代码
- Fork → 修改 → Pull Request
- 代码规范: ESLint + Prettier
- 提交规范: Conventional Commits

---

## 👥 贡献者

- [@tianyi.liang](mailto:tianyi.liang@shopee.com) - 主要开发

---

## 📄 许可证

MIT License - 自由使用和修改

---

## 🎉 致谢

感谢所有测试和反馈的同事！

---

**Enjoy debugging with SPX Helper v2.9.0! 🚀**

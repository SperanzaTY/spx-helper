# 🛡️ 值班助手 Chrome 扩展 - 项目概览

## 项目简介

**值班助手**是一个功能完善的Chrome扩展插件，专为日常值班工作设计。它提供快速笔记、定时提醒、常用链接管理和值班统计等核心功能，帮助值班人员更高效地管理工作。

## 核心功能

### 1. 📝 快速笔记
- 快速记录值班事项
- 自动时间戳
- 持久化存储
- 一键删除

### 2. ⏰ 智能提醒
- 自定义提醒内容和时间
- 系统级通知
- 倒计时显示
- 支持取消

### 3. 🔗 链接管理
- 保存常用工作链接
- 快速访问
- 自定义命名
- 简单管理

### 4. 📊 值班统计
- 实时计时
- 笔记统计
- 历史记录
- 数据分析

## 技术架构

### 前端技术栈
```
📦 Chrome Extension (Manifest V3)
├── 原生 JavaScript (ES6+)
├── 原生 CSS3 (渐变、动画、flexbox)
└── 原生 HTML5
```

### Chrome APIs
```
🔌 使用的Chrome扩展API
├── chrome.storage.local    # 本地数据存储
├── chrome.alarms           # 定时任务管理
├── chrome.notifications    # 系统通知
├── chrome.tabs             # 标签页管理
└── chrome.action           # 扩展图标和弹窗
```

### 项目结构
```
SPX_Helper/
│
├── 📄 manifest.json        # 扩展配置文件
│   ├── manifest_version: 3
│   ├── permissions: storage, alarms, notifications, activeTab
│   └── icons: 16px, 48px, 128px
│
├── 🎨 前端界面
│   ├── popup.html          # 弹窗页面结构
│   ├── popup.js            # 交互逻辑 (500+ 行)
│   └── styles.css          # 现代化样式 (400+ 行)
│
├── ⚙️ 后台服务
│   └── background.js       # Service Worker (提醒和通知)
│
├── 🖼️ 资源文件
│   └── images/
│       ├── icon16.png      # 小图标
│       ├── icon48.png      # 中图标
│       ├── icon128.png     # 大图标
│       └── icon.svg        # 矢量源文件
│
└── 📚 文档
    ├── README.md           # 项目介绍
    ├── INSTALL.md          # 安装指南
    ├── USAGE.md            # 使用说明和开发指南
    ├── test.html           # 测试清单
    └── package.json        # 项目配置
```

## 数据模型

### 笔记数据结构
```javascript
{
  notes: [
    {
      id: 1234567890,           // 时间戳ID
      content: "笔记内容",       // 笔记文本
      timestamp: "2025-11-14T..." // ISO时间格式
    }
  ]
}
```

### 提醒数据结构
```javascript
{
  reminders: [
    {
      id: 1234567890,           // 唯一ID
      text: "提醒内容",          // 提醒文本
      triggerTime: 1234567890,  // 触发时间戳
      minutes: 30               // 分钟数
    }
  ]
}
```

### 链接数据结构
```javascript
{
  links: [
    {
      id: 1234567890,           // 唯一ID
      name: "链接名称",          // 显示名称
      url: "https://..."        // URL地址
    }
  ]
}
```

### 值班数据结构
```javascript
{
  onDuty: true,                 // 是否在值班
  dutyStartTime: 1234567890,    // 开始时间戳
  dutyHistory: [
    {
      startTime: 1234567890,    // 开始时间
      endTime: 1234567890,      // 结束时间
      duration: 7200000         // 时长（毫秒）
    }
  ]
}
```

## 核心功能实现

### 1. 数据持久化
```javascript
// 保存数据
chrome.storage.local.set({ key: value }, callback);

// 读取数据
chrome.storage.local.get(['key'], callback);

// 清除数据
chrome.storage.local.clear();
```

### 2. 定时提醒
```javascript
// 创建闹钟
chrome.alarms.create('reminder_id', { when: timestamp });

// 监听闹钟
chrome.alarms.onAlarm.addListener(callback);

// 取消闹钟
chrome.alarms.clear('reminder_id');
```

### 3. 系统通知
```javascript
chrome.notifications.create({
  type: 'basic',
  iconUrl: 'images/icon128.png',
  title: '标题',
  message: '内容',
  priority: 2
});
```

### 4. 打开新标签
```javascript
chrome.tabs.create({ url: 'https://...' });
```

## 安全特性

### XSS防护
```javascript
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

### URL验证
```javascript
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}
```

### 权限最小化
- 仅申请必需的4个权限
- 不访问敏感用户数据
- 不进行网络请求（除用户主动打开链接）

## 用户体验设计

### 视觉设计
- 🎨 现代渐变色背景（紫色系）
- 🎯 清晰的信息层级
- ✨ 流畅的过渡动画
- 📱 响应式布局

### 交互设计
- ⚡ 即时反馈
- 🎯 一键操作
- 📋 列表展示
- 🔄 实时更新

### 数据可视化
- 📊 值班时长显示（小时+分钟）
- 📝 笔记数量统计
- ⏳ 提醒倒计时
- 🕐 时间戳格式化

## 性能优化

### 存储优化
- 使用本地存储（比同步存储快）
- 数据结构扁平化
- 按需加载数据

### 渲染优化
- 避免频繁DOM操作
- 使用事件委托
- CSS动画（GPU加速）

### 内存优化
- 及时清理过期数据
- 避免内存泄漏
- 合理使用闭包

## 浏览器兼容性

### 完全支持
- ✅ Chrome 88+
- ✅ Edge 88+
- ✅ Brave (最新版)

### 理论支持（未测试）
- ⚠️ Opera (Chromium内核)
- ⚠️ Vivaldi (Chromium内核)

### 不支持
- ❌ Firefox (不同的扩展API)
- ❌ Safari (不同的扩展API)

## 快速开始

### 安装步骤
```bash
1. 克隆或下载项目
2. 打开 chrome://extensions/
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 SPX_Helper 文件夹
```

### 使用步骤
```bash
1. 点击工具栏的扩展图标
2. 开始值班（可选）
3. 记录笔记
4. 设置提醒
5. 添加常用链接
```

## 未来规划

### v1.1 计划
- [ ] 笔记搜索功能
- [ ] 笔记分类标签
- [ ] 数据导出导入
- [ ] 深色主题

### v1.2 计划
- [ ] 值班报告生成
- [ ] 数据统计图表
- [ ] 重复提醒
- [ ] 快捷键支持

### v2.0 展望
- [ ] 云端同步
- [ ] 团队协作
- [ ] 移动端支持
- [ ] API集成

## 开发者资源

### 调试技巧
```javascript
// 查看扩展控制台
右键扩展图标 -> 检查

// 查看存储数据
chrome.storage.local.get(null, console.log);

// 清除测试数据
chrome.storage.local.clear();
```

### 常用命令
```bash
# 重新加载扩展
访问 chrome://extensions/ -> 点击刷新按钮

# 打包扩展
访问 chrome://extensions/ -> 打包扩展程序

# 查看日志
F12 -> Console 标签
```

## 贡献指南

### 报告问题
1. 描述问题现象
2. 提供复现步骤
3. 附上错误截图
4. 说明浏览器版本

### 提交代码
1. Fork 项目
2. 创建功能分支
3. 编写规范代码
4. 提交 Pull Request

## 许可证

MIT License - 自由使用和修改

## 联系方式

- 📧 Email: your-email@example.com
- 🐛 Issues: [GitHub Issues](https://github.com/your-repo/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/your-repo/discussions)

## 致谢

感谢所有为这个项目做出贡献的开发者！

---

**最后更新**: 2025-11-14  
**版本**: v1.0.0  
**状态**: ✅ 稳定版

**开始使用值班助手，让值班工作更轻松！** 🚀


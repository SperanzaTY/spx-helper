# 🔥 API 拦截增强 - 测试指南

## ✅ 完成的修改

### 1. 增强 Fetch 拦截
- 使用 `Object.defineProperty` 防止被页面覆盖
- 添加详细的调试日志
- 每个请求都会输出：
  - 🚀 拦截到请求
  - 📡 记录成功 + 总数
  - ⚠️ 非 JSON 跳过

### 2. 增强 XHR 拦截
- 添加详细的调试日志
- 每个请求都会输出：
  - 🚀 拦截到请求
  - 📡 记录成功 + 总数
  - ⚠️ 非 JSON 跳过

### 3. 增强启用日志
- 显示 window.fetch 类型
- 显示 XMLHttpRequest 类型
- 确认拦截器安装完成
- 显示当前 API 数量

---

## 🧪 测试步骤

### 第 1 步：重新加载扩展（必须！）
```
chrome://extensions/ → SPX Helper → 🔄 重新加载
```

### 第 2 步：打开 Console
```
F12 → Console 标签
清空 Console（重要！）
```

### 第 3 步：刷新页面
```
F5 刷新页面
```

### 预期输出（详细版）：

```
🔍 [SPX Helper] API 数据溯源工具已加载
✅ [SPX Helper] 开始安装 API 拦截器
   当前 window.fetch 类型: function
   当前 XMLHttpRequest 类型: function
✅ [SPX Helper] Fetch 拦截器已安装
✅ [SPX Helper] XHR 拦截器已安装
✅ [SPX Helper] 所有拦截器安装完成
   API 记录数量: 0
✅ [SPX Helper] Content Script 已就绪

（页面开始加载，发送请求）

🚀 [SPX Helper] 拦截到 Fetch 请求: https://api.example.com/stations
📡 [SPX Helper] Fetch 记录成功: https://api.example.com/stations 总数: 1

🚀 [SPX Helper] 拦截到 XHR 请求: POST https://api.example.com/user
📡 [SPX Helper] XHR 记录成功: https://api.example.com/user 总数: 2

🚀 [SPX Helper] 拦截到 Fetch 请求: https://api.example.com/dashboard
📡 [SPX Helper] Fetch 记录成功: https://api.example.com/dashboard 总数: 3
```

---

## 📊 检查 API 数量

### 打开扩展窗口
```
点击扩展图标
实用工具 → API溯源
```

**应该看到**：
```
已捕获 API: X 个  （X > 0）
```

---

## 🐛 如果还是 0

### 在 Console 中运行：

```javascript
// 1. 检查拦截器状态
console.log('=== 拦截器状态 ===');
console.log('Tracker 存在:', !!window.spxAPITracker);
console.log('Tracker 已启用:', window.spxAPITracker?.isEnabled);
console.log('API 数量:', window.spxAPITracker?.apiRecords.size);

// 2. 手动测试 Fetch
console.log('\n=== 测试 Fetch ===');
fetch('https://httpbin.org/get')
  .then(r => r.json())
  .then(data => {
    console.log('✅ 测试请求成功');
    console.log('📊 当前 API 数量:', window.spxAPITracker?.apiRecords.size);
  })
  .catch(e => console.error('❌ 测试失败:', e));

// 3. 检查 fetch 是否被拦截
console.log('\n=== Fetch 函数检查 ===');
console.log(window.fetch.toString().substring(0, 200));
// 应该看到我们的拦截代码

// 4. 查看所有 API
setTimeout(() => {
  console.log('\n=== 所有捕获的 API ===');
  if (window.spxAPITracker) {
    window.spxAPITracker.apiRecords.forEach((record, id) => {
      console.log(`${record.method} ${record.status}`, record.url);
    });
  }
}, 2000);
```

---

## 📋 预期结果

如果拦截工作，应该看到：

```
=== 拦截器状态 ===
Tracker 存在: true
Tracker 已启用: true
API 数量: 3

=== 测试 Fetch ===
🚀 [SPX Helper] 拦截到 Fetch 请求: https://httpbin.org/get
📡 [SPX Helper] Fetch 记录成功: https://httpbin.org/get 总数: 4
✅ 测试请求成功
📊 当前 API 数量: 4

=== Fetch 函数检查 ===
async function(...args) {
  const [url, options] = args;
  const requestId = self.generateRequestId();
  const startTime = Date.now();
  
  console.log('🚀 [SPX Helper] 拦截到 Fetch 请求:', ...

=== 所有捕获的 API ===
GET 200 https://api.example.com/stations
POST 200 https://api.example.com/user
GET 200 https://api.example.com/dashboard
GET 200 https://httpbin.org/get
```

---

## 🚨 关键点

1. **必须看到 "🚀 拦截到" 日志**
   - 如果看到 = 拦截器工作
   - 如果看不到 = 拦截器被绕过

2. **必须看到 "📡 记录成功" 日志**
   - 如果看到 = 记录功能正常
   - 如果只有 "🚀" 没有 "📡" = 记录失败

3. **必须看到 "总数: X"**
   - X 应该递增
   - 如果一直是 0 = recordAPI 函数有问题

---

**现在测试并告诉我完整的 Console 输出！** 🔍

特别关注：
1. 是否看到 "🚀 拦截到" 日志？
2. 是否看到 "📡 记录成功" 日志？
3. "总数" 是否递增？

# 🚀 Presto查询快速测试指南

## ⚠️ 关键要点

**必须在扩展Popup的Console中运行，不能在普通网页的Console中运行！**

## 📝 测试步骤（3分钟）

### 1️⃣ 重新加载扩展
```
chrome://extensions/ → SPX Helper → 🔄 刷新
```

### 2️⃣ 打开Popup并检查
- 点击浏览器工具栏的 **SPX Helper 图标**
- 在弹出的Popup窗口上 **右键** → 选择 **"检查"**
- 会打开Popup专用的DevTools

### 3️⃣ 在Console中运行测试代码

复制并粘贴以下代码到Console：

```javascript
(async function() {
  console.log('🔍 开始查询表...');
  
  const result = await chrome.runtime.sendMessage({
    action: 'QUERY_PRESTO',
    username: 'tianyi.liang',
    password: 'Qej9jw6r8HJc',
    sql: 'SELECT * FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id LIMIT 10',
    queue: 'spx-adhoc',
    region: 'SG',
    catalog: 'hive',
    schema: 'shopee'
  });
  
  if (result.success) {
    console.log('%c✅ 查询成功！', 'color: green; font-size: 16px; font-weight: bold');
    console.log('📊 结果统计:');
    console.log('   列数:', result.data.columns.length);
    console.log('   行数:', result.data.rows.length);
    console.log('\n📋 列名:');
    console.log(result.data.columns);
    console.log('\n📊 前3行数据:');
    console.table(result.data.rows.slice(0, 3));
  } else {
    console.error('❌ 查询失败:', result.error);
  }
})();
```

## ✅ 预期结果

成功时会显示：
```
🔍 开始查询表...
✅ 查询成功！
📊 结果统计:
   列数: X
   行数: 10
📋 列名:
   [列名数组]
📊 前3行数据:
   [表格显示]
```

## ❌ 常见错误

### 错误1: "chrome.runtime.sendMessage is not a function"
**原因**: 在普通网页的Console中运行了  
**解决**: 必须在Popup的Console中运行（步骤2）

### 错误2: "401 Unauthorized"
**原因**: 密码错误或过期  
**解决**: 从 https://datasuite.shopee.io/ram/ 重新获取密码

### 错误3: "Table not found"
**原因**: 表名错误或表不存在  
**解决**: 检查表名是否正确

### 错误4: "Network error"
**原因**: 无法连接Presto服务器  
**解决**: 确保在公司网络环境下

## 📚 其他测试

### 测试1: 查看所有Catalogs
```javascript
chrome.runtime.sendMessage({
  action: 'QUERY_PRESTO',
  username: 'tianyi.liang',
  password: 'Qej9jw6r8HJc',
  sql: 'SHOW CATALOGS',
  queue: 'spx-adhoc',
  region: 'SG'
}, r => console.log(r));
```

### 测试2: 查看表结构
```javascript
chrome.runtime.sendMessage({
  action: 'QUERY_PRESTO',
  username: 'tianyi.liang',
  password: 'Qej9jw6r8HJc',
  sql: 'DESCRIBE spx_mart.dim_spx_lm_station_user_configuration_tab_id',
  queue: 'spx-adhoc',
  region: 'SG'
}, r => console.log(r));
```

### 测试3: 统计行数
```javascript
chrome.runtime.sendMessage({
  action: 'QUERY_PRESTO',
  username: 'tianyi.liang',
  password: 'Qej9jw6r8HJc',
  sql: 'SELECT COUNT(*) FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id',
  queue: 'spx-adhoc',
  region: 'SG'
}, r => console.log(r));
```

## 🎯 测试成功后

如果测试成功，说明Presto查询功能已经可用！

你现在可以：
- ✅ 在任何扩展代码中调用Presto查询
- ✅ 验证API血缘表是否存在
- ✅ 查询表结构和数据
- ✅ 集成到AI分析中


# ❌ 错误修复：chrome.runtime 未定义

## 问题原因

直接用浏览器打开HTML文件（`file://` 协议）时，无法访问Chrome扩展API。

## ✅ 解决方案

### 步骤1：重新加载扩展

1. 打开 `chrome://extensions/`
2. 找到 "SPX Helper"
3. 点击刷新按钮 🔄

### 步骤2：通过扩展URL访问

不要直接双击打开HTML文件，而是：

**方式A：通过扩展URL（推荐）**

在Chrome地址栏输入并访问：
```
chrome-extension://YOUR_EXTENSION_ID/test_table_query.html
```

如何找到 YOUR_EXTENSION_ID：
1. 打开 `chrome://extensions/`
2. 找到 "SPX Helper"
3. 看到类似 `ID: abcdefghijklmnopqrstuvwxyz` 的字符串
4. 复制这个ID替换上面的 YOUR_EXTENSION_ID

**方式B：从popup打开（更简单）**

在浏览器Console中执行：
```javascript
// 查询表数据
chrome.runtime.sendMessage({
  action: 'QUERY_PRESTO',
  username: 'tianyi.liang',
  password: 'Qej9jw6r8HJc',
  sql: 'SELECT * FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id LIMIT 10',
  queue: 'spx-adhoc',
  region: 'SG'
}, (response) => {
  if (response.success) {
    console.table(response.data.rows);
    console.log('列名:', response.data.columns);
  } else {
    console.error('错误:', response.error);
  }
});
```

## 快速测试脚本

创建一个简单的书签（Bookmark）来测试：

1. 随便打开一个网页（比如 google.com）
2. 按 F12 打开开发者工具
3. 在 Console 中粘贴并执行：

```javascript
(async function() {
  const result = await chrome.runtime.sendMessage({
    action: 'QUERY_PRESTO',
    username: 'tianyi.liang',
    password: 'Qej9jw6r8HJc',
    sql: 'SELECT * FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id LIMIT 10',
    queue: 'spx-adhoc',
    region: 'SG'
  });
  
  if (result.success) {
    console.log('✅ 查询成功！');
    console.log('列数:', result.data.columns.length);
    console.log('行数:', result.data.rows.length);
    console.log('\n列名:');
    console.log(result.data.columns);
    console.log('\n前3行数据:');
    console.table(result.data.rows.slice(0, 3));
  } else {
    console.error('❌ 查询失败:', result.error);
  }
})();
```


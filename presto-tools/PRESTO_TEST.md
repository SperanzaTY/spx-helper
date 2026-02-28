# Presto查询功能 - 测试说明

## 已实现

✅ **background.js** - 添加了 `queryPrestoSQL()` 函数和 `QUERY_PRESTO` 消息处理器

## 快速测试

### 步骤1：重新加载扩展

1. 打开Chrome扩展管理页面：`chrome://extensions/`
2. 找到"SPX Helper"
3. 点击刷新按钮🔄

### 步骤2：测试查询

**方式A：使用测试页面（推荐）**

1. 在浏览器中打开：`/Users/tianyi.liang/Cursor/SPX_Helper/test_presto.html`
2. 输入密码：`Qej9jw6r8HJc`
3. 点击"🧪 快速测试"按钮
4. 应该能看到Presto的catalog列表

**方式B：在Console中测试**

1. 打开任何网页
2. 按F12打开开发者工具
3. 在Console中执行：

```javascript
chrome.runtime.sendMessage({
  action: 'QUERY_PRESTO',
  username: 'tianyi.liang',
  password: 'Qej9jw6r8HJc',
  sql: 'SHOW CATALOGS;',
  queue: 'spx-adhoc',
  region: 'SG'
}, (response) => {
  console.log('查询结果:', response);
});
```

## 预期结果

成功响应示例：
```javascript
{
  success: true,
  data: {
    columns: ['Catalog'],
    rows: [
      ['hive'],
      ['hive_uat'],
      ['hudi'],
      ['hudi_test'],
      ...
    ],
    stats: { ... }
  }
}
```

## 如果测试失败

### 错误1: 401 Unauthorized
- 密码可能过期，重新从 https://datasuite.shopee.io/ram/ 获取

### 错误2: 网络错误
- 检查是否能访问 `https://presto-secure.data-infra.shopee.io:443`
- 可能需要在公司网络环境下测试

### 错误3: 队列权限
- 尝试其他队列名称
- 确认你有 `spx-adhoc` 队列的访问权限

## 下一步

测试成功后，这个Presto查询能力可以用于：

1. **自动验证API血缘表** - 检查API依赖的表是否存在
2. **查询表结构** - 获取表的列信息
3. **数据采样** - 快速预览表数据
4. **AI增强** - 让AI助手能查询真实数据


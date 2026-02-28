# Presto查询功能使用指南

## 概述

SPX Helper扩展现在内置了Presto/Hive查询能力，可以通过`background.js`的`QUERY_PRESTO`接口直接查询Presto数据。

这是一个底层工具函数，可以被其他功能调用，实现如数据验证、表结构查询等高级功能。

## 功能特性

- ✅ 支持通过HTTPS REST API查询Presto
- ✅ 支持Basic Auth认证
- ✅ 支持自定义Queue、Region、Catalog、Schema
- ✅ 自动轮询查询状态
- ✅ 返回标准化的结果（列名 + 行数据）
- ✅ 无需额外部署proxy服务

## API接口

### 请求格式

```javascript
chrome.runtime.sendMessage({
  action: 'QUERY_PRESTO',
  username: 'tianyi.liang',      // 大数据账号
  password: 'your_password',      // 从 https://datasuite.shopee.io/ram/ 获取
  sql: 'SELECT * FROM table LIMIT 10',  // SQL查询语句
  queue: 'spx-adhoc',             // Presto队列名称
  region: 'SG',                   // 区域: SG/US/ID
  catalog: 'hive',                // 可选，默认 'hive'
  schema: 'shopee'                // 可选，默认 'shopee'
}, (response) => {
  if (response.success) {
    console.log('查询结果:', response.data);
    // response.data = { columns: [...], rows: [[...]], stats: {...} }
  } else {
    console.error('查询失败:', response.error);
  }
});
```

### 响应格式

成功响应：
```javascript
{
  success: true,
  data: {
    columns: ['catalog', 'schema', 'table'],  // 列名数组
    rows: [                                     // 行数据（二维数组）
      ['hive', 'shopee', 'dwd_table1'],
      ['hive', 'shopee', 'dwd_table2']
    ],
    stats: {                                    // 查询统计信息
      state: 'FINISHED',
      queued: false,
      scheduled: true,
      ...
    }
  }
}
```

失败响应：
```javascript
{
  success: false,
  error: '查询提交失败: 401 Unauthorized'
}
```

## 快速测试

### 方式1：使用测试页面

1. 在Chrome中打开 `test_presto.html`
2. 输入你的密码（用户名已预填：tianyi.liang）
3. 点击"🧪 快速测试"按钮（执行 `SHOW CATALOGS;`）
4. 查看查询结果

### 方式2：在Console中测试

打开扩展的popup，按F12打开开发者工具，在Console中执行：

```javascript
chrome.runtime.sendMessage({
  action: 'QUERY_PRESTO',
  username: 'tianyi.liang',
  password: 'Qej9jw6r8HJc',
  sql: 'SHOW CATALOGS;',
  queue: 'spx-adhoc',
  region: 'SG'
}, (response) => {
  console.log(response);
});
```

## 使用场景示例

### 1. 验证表是否存在

```javascript
async function checkTableExists(tableName) {
  const sql = `SHOW TABLES IN shopee LIKE '${tableName}'`;
  
  const response = await chrome.runtime.sendMessage({
    action: 'QUERY_PRESTO',
    username: 'tianyi.liang',
    password: 'your_password',
    sql: sql,
    queue: 'spx-adhoc',
    region: 'SG'
  });
  
  return response.success && response.data.rows.length > 0;
}
```

### 2. 查询表结构

```javascript
async function getTableSchema(tableName) {
  const sql = `DESCRIBE ${tableName}`;
  
  const response = await chrome.runtime.sendMessage({
    action: 'QUERY_PRESTO',
    username: 'tianyi.liang',
    password: 'your_password',
    sql: sql,
    queue: 'spx-adhoc',
    region: 'SG'
  });
  
  if (response.success) {
    // columns: ['Column', 'Type', 'Comment']
    return response.data.rows.map(row => ({
      name: row[0],
      type: row[1],
      comment: row[2]
    }));
  }
  return [];
}
```

### 3. 快速数据预览

```javascript
async function previewTableData(tableName, limit = 10) {
  const sql = `SELECT * FROM ${tableName} LIMIT ${limit}`;
  
  const response = await chrome.runtime.sendMessage({
    action: 'QUERY_PRESTO',
    username: 'tianyi.liang',
    password: 'your_password',
    sql: sql,
    queue: 'spx-adhoc',
    region: 'SG'
  });
  
  return response.success ? response.data : null;
}
```

## 配置说明

### Queue选择
- `spx-adhoc`: 临时查询队列
- `spx-dev`: 开发测试队列
- 其他：根据你的权限选择

查看你有权限的队列：https://datasuite.shopee.io/ram/

### Region选择
- `SG`: 新加坡（主要环境）
- `US`: 美国
- `ID`: 印尼

### Catalog & Schema
- 默认：`catalog=hive`, `schema=shopee`
- 可以根据需要查询其他catalog（如`hive_uat`）

## 技术实现

- **底层协议**: Presto REST API (非JDBC)
- **认证方式**: HTTP Basic Authentication
- **查询流程**: 提交 → 轮询状态 → 获取结果
- **超时设置**: 60秒（可在`background.js`中调整`maxAttempts`）
- **连接地址**: `presto-secure.data-infra.shopee.io:443`

## 注意事项

1. **密码安全**: 测试完成后及时清除密码，不要将密码硬编码到代码中
2. **查询限制**: 避免执行耗时过长的查询（建议加`LIMIT`）
3. **队列权限**: 确保你有对应队列的访问权限
4. **网络连接**: 需要能访问 `presto-secure.data-infra.shopee.io`

## 故障排查

### 问题1: 401 Unauthorized
- 检查用户名密码是否正确
- 从 https://datasuite.shopee.io/ram/ 重新获取密码

### 问题2: 查询超时
- 检查SQL语句是否过于复杂
- 增加`LIMIT`限制返回行数
- 检查网络连接

### 问题3: 队列权限错误
- 确认你有对应队列的访问权限
- 尝试使用其他队列（如`spx-adhoc`）

## 后续扩展

基于这个Presto查询能力，我们可以实现：

- ✨ 自动验证API血缘中的表是否真实存在
- ✨ 一键查询表最新数据
- ✨ 对比不同环境的表结构差异
- ✨ 自动生成数据质量报告
- ✨ 集成到AI分析中，让AI能查询真实数据


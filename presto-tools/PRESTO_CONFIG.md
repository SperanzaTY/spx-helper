# Presto查询正确配置指南

## ⚠️ 重要配置说明

根据实际测试和DataSuite平台日志，以下是**正确的配置参数**：

## 📋 默认配置

```javascript
{
  username: 'tianyi.liang',        // 你的大数据账号
  password: 'your_password',       // 从 RAM 获取
  queue: 'szsc-adhoc',             // ✅ 正确的队列名
  region: 'SG',                    // 区域
  catalog: 'hive',                 // Catalog
  schema: 'dev_spx_mart'           // ✅ 正确的 Schema
}
```

## ❌ 常见错误配置

```javascript
// 错误示例 - 不要使用这些
{
  queue: 'spx-adhoc',     // ❌ 错误！应该是 szsc-adhoc
  schema: 'shopee'        // ❌ 错误！应该是 dev_spx_mart
}
```

## 🔍 配置来源

这些配置是从DataSuite平台的实际执行日志中提取的：

```
2026-02-28 10:14:45 (UTC+8) INFO - Presto executor, use schema:dev_spx_mart
2026-02-28 10:14:45 (UTC+8) INFO - Presto executor, set client info property:
{
  ApplicationName=(25)-(szsc-adhoc)-(tianyi.liang)-(adhoc-DataStudio)-(tianyi.liang)-(SG),
  ...
}
```

关键信息：
- **Queue**: `szsc-adhoc` (不是 spx-adhoc)
- **Schema**: `dev_spx_mart` (不是 shopee)
- **Priority**: `25` (不是 30)

## ✅ 正确的测试代码

```javascript
// 在Popup的Console中运行
(async function() {
  const result = await chrome.runtime.sendMessage({
    action: 'QUERY_PRESTO',
    username: 'tianyi.liang',
    password: 'Qej9jw6r8HJc',
    sql: 'SELECT * FROM spx_mart.dim_spx_lm_station_user_configuration_tab_id LIMIT 10',
    queue: 'szsc-adhoc',        // ✅ 正确
    region: 'SG',
    catalog: 'hive',
    schema: 'dev_spx_mart'       // ✅ 正确
  });
  
  if (result.success) {
    console.log('✅ 成功！');
    console.log('列数:', result.data.columns.length);
    console.log('行数:', result.data.rows.length);
    console.table(result.data.rows.slice(0, 3));
  } else {
    console.error('❌ 失败:', result.error);
  }
})();
```

## 🎯 不同环境的配置

### Dev环境（开发测试）
```javascript
{
  queue: 'szsc-adhoc',
  schema: 'dev_spx_mart',
  catalog: 'hive'
}
```

### Live环境（生产）
```javascript
{
  queue: 'szsc-scheduled',  // 或其他生产队列
  schema: 'spx_mart',        // 注意：生产环境不带 dev_ 前缀
  catalog: 'hive'
}
```

## 📚 队列说明

常见队列：
- `szsc-adhoc`: 临时查询（Dev）
- `szsc-scheduled`: 定时任务（Live）
- 其他：根据项目和权限配置

查看你有权限的队列：https://datasuite.shopee.io/ram/

## 💡 配置优先级

1. **Schema最重要**：
   - Dev环境: `dev_spx_mart`
   - Live环境: `spx_mart`
   
2. **Queue其次**：
   - 确保你有该队列的访问权限
   - Dev通常用 `szsc-adhoc`

3. **Region**：
   - SG: 新加坡（主要）
   - US: 美国
   - ID: 印尼

## 🔧 如何验证配置

### 方法1：在DataSuite查看日志
1. 在DataSuite执行一次查询
2. 查看执行日志
3. 找到 `Presto executor, use schema:` 和队列信息

### 方法2：查询系统表
```sql
SELECT current_schema();  -- 查看当前schema
SELECT current_user();     -- 查看当前用户
```

## ⚠️ 注意事项

1. **不要硬编码密码**：从 `chrome.storage.local` 读取
2. **Schema要匹配环境**：Dev用 `dev_*`，Live不带前缀
3. **Queue要有权限**：没权限会返回错误
4. **表名要包含schema**：如 `spx_mart.table_name`


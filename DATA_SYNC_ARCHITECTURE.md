# 🎯 数据同步方案 - 直连 TEST ClickHouse

## 📊 架构说明

### 两种不同的场景

```
┌─────────────────────────────────────────────────────────────────┐
│                    场景 1: 站点查询（查询 LIVE 数据）               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  浏览器扩展                                                        │
│      ↓                                                            │
│  调用 internal_search API (JWT Token)                             │
│      ↓                                                            │
│  API 后端连接 LIVE ClickHouse                                      │
│      ↓                                                            │
│  返回 LIVE 环境的数据                                              │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                 场景 2: 数据同步（LIVE → TEST）                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  浏览器扩展                                                        │
│      ↓                                                            │
│  直连 TEST ClickHouse HTTP 接口 (Basic Auth)                      │
│      ↓                                                            │
│  TEST ClickHouse 执行:                                            │
│    INSERT INTO test_table                                        │
│    SELECT * FROM remote('LIVE_IP', 'live_table', ...)            │
│      ↓                                                            │
│  数据从 LIVE 同步到 TEST                                           │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 实现

### 函数 1: `executeTestClickHouseSQL()` - 直连 TEST

**用途**：数据同步（LIVE → TEST）

```javascript
/**
 * 直接连接 TEST 环境 ClickHouse 执行 SQL
 * 
 * 特点：
 * - 直连 TEST ClickHouse (clickhouse-k8s-sg-prod)
 * - 使用 Basic Auth 认证
 * - 支持 INSERT ... SELECT FROM remote()
 * - 用于数据同步
 */
async function executeTestClickHouseSQL(sql) {
  const config = {
    host: 'clickhouse-k8s-sg-prod.data-infra.shopee.io',
    port: '443',
    user: 'spx_mart-cluster_szsc_data_shared_online',
    password: 'RtL3jHWkDoHp',
    database: 'spx_mart_pub'
  };
  
  const url = `https://${config.host}:${config.port}/`;
  const basicAuth = btoa(`${config.user}:${config.password}`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'text/plain'
    },
    body: sql
  });
  
  const responseText = await response.text();
  
  if (!response.ok) {
    return {
      success: false,
      error: `HTTP ${response.status}: ${responseText}`
    };
  }
  
  return {
    success: true,
    data: responseText
  };
}
```

### 函数 2: `executeClickHouseSQL()` - 通过 API

**用途**：站点查询等（查询 LIVE 数据）

```javascript
/**
 * 通过 API 执行 ClickHouse SQL（查询 LIVE 环境数据）
 * 
 * 特点：
 * - 调用 internal_search API
 * - 使用 JWT Token 认证
 * - 后端连接 LIVE ClickHouse
 * - 返回格式化的 JSON 数据
 */
async function executeClickHouseSQL(sql) {
  const jwtToken = await generateApiMartJwtToken();
  
  const response = await fetch(STATION_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'jwt-token': jwtToken
    },
    body: JSON.stringify({ sql })
  });
  
  const result = await response.json();
  
  if (result.retcode !== 0) {
    return {
      success: false,
      error: result.message
    };
  }
  
  return {
    success: true,
    data: result.data  // { list: [...] }
  };
}
```

---

## 📋 使用示例

### 示例 1：数据同步（LIVE → TEST）

使用 `executeTestClickHouseSQL()` 直连 TEST：

```javascript
async function syncDriverTable() {
  // 同步 BR 市场的 driver 表
  const sql = `
    INSERT INTO spx_mart_manage_app.dim_spx_driver_tab_br_all
    SELECT * FROM remote(
      '10.180.129.96',
      'spx_mart_manage_app.dim_spx_driver_tab_br_all',
      'spx_mart',
      'RtL3jHWkDoHp'
    )
  `;
  
  console.log('🚀 开始同步数据...');
  const result = await executeTestClickHouseSQL(sql);
  
  if (result.success) {
    console.log('✅ 同步完成');
    console.log('响应:', result.data);
  } else {
    console.error('❌ 同步失败:', result.error);
  }
}
```

**响应示例（成功）**：
```
HTTP 200
响应文本: "" (空字符串) 或插入的行数
```

**响应示例（失败）**：
```
HTTP 500
响应文本: "Code: 60. DB::Exception: Table does not exist"
```

---

### 示例 2：验证同步结果

同样使用 `executeTestClickHouseSQL()`：

```javascript
async function verifySync() {
  // 查询 TEST 环境的表数据
  const sql = `
    SELECT count() as row_count
    FROM spx_mart_manage_app.dim_spx_driver_tab_br_all
    FORMAT JSON
  `;
  
  const result = await executeTestClickHouseSQL(sql);
  
  if (result.success) {
    // 解析 JSON 响应
    const data = JSON.parse(result.data);
    console.log('✅ TEST 环境行数:', data.data[0].row_count);
  } else {
    console.error('❌ 查询失败:', result.error);
  }
}
```

**响应示例**：
```json
{
  "meta": [...],
  "data": [
    {"row_count": 12345}
  ],
  "rows": 1
}
```

---

### 示例 3：查询站点（查询 LIVE 数据）

使用 `executeClickHouseSQL()` 通过 API：

```javascript
async function queryStationFromLive(stationId) {
  // 查询 LIVE 环境的站点数据
  const sql = `
    SELECT station_id, station_name, 1 as flag
    FROM spx_mart_manage_app.dim_spx_station_tab_sg_all
    WHERE station_id = ${stationId}
  `;
  
  const result = await executeClickHouseSQL(sql);
  
  if (result.success) {
    console.log('✅ 站点信息:', result.data.list);
    // result.data.list[0].flag === 1 ✅
  } else {
    console.error('❌ 查询失败:', result.error);
  }
}
```

**响应示例**：
```json
{
  "retcode": 0,
  "data": {
    "list": [
      {
        "station_id": 123,
        "station_name": "Test Station",
        "flag": 1
      }
    ]
  }
}
```

---

## 🎯 完整的数据同步工作流

```javascript
async function fullSyncWorkflow(tableName, market) {
  try {
    const sourceHost = '10.180.129.96';  // LIVE ONLINE2
    const sourceTable = `spx_mart_manage_app.${tableName}_${market}_all`;
    const targetTable = `spx_mart_manage_app.${tableName}_${market}_all`;
    
    // 步骤 1: 验证源表（可选，直接在 LIVE 查询会比较慢）
    console.log('📊 步骤 1: 准备同步...');
    console.log(`   源: ${sourceHost} / ${sourceTable}`);
    console.log(`   目标: TEST / ${targetTable}`);
    
    // 步骤 2: 执行同步（直连 TEST ClickHouse）
    console.log('🚀 步骤 2: 执行同步...');
    
    const syncSQL = `
      INSERT INTO ${targetTable}
      SELECT * FROM remote(
        '${sourceHost}',
        '${sourceTable}',
        'spx_mart',
        'RtL3jHWkDoHp'
      )
    `;
    
    const syncResult = await executeTestClickHouseSQL(syncSQL);
    
    if (!syncResult.success) {
      throw new Error(`同步失败: ${syncResult.error}`);
    }
    
    console.log('✅ 同步完成');
    
    // 步骤 3: 验证结果（直连 TEST ClickHouse）
    console.log('✅ 步骤 3: 验证结果...');
    
    const verifySQL = `
      SELECT count() as row_count
      FROM ${targetTable}
      FORMAT JSON
    `;
    
    const verifyResult = await executeTestClickHouseSQL(verifySQL);
    
    if (verifyResult.success) {
      const data = JSON.parse(verifyResult.data);
      const rowCount = data.data[0].row_count;
      console.log(`✅ TEST 环境行数: ${rowCount}`);
      
      return {
        success: true,
        message: `成功同步 ${rowCount} 行数据`
      };
    }
    
  } catch (error) {
    console.error('❌ 同步失败:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

// 使用示例
fullSyncWorkflow('dim_spx_driver_tab', 'br');
```

---

## 📊 两种函数的对比

| 特性 | `executeTestClickHouseSQL()` | `executeClickHouseSQL()` |
|------|------------------------------|--------------------------|
| **用途** | 数据同步（LIVE → TEST） | 查询 LIVE 数据 |
| **连接方式** | 直连 TEST ClickHouse | 通过 API |
| **认证方式** | Basic Auth | JWT Token |
| **返回格式** | 文本 / JSON 字符串 | 格式化 JSON `{ list: [...] }` |
| **支持 SQL** | 任何 SQL | 必须有 `1 as flag` |
| **网络要求** | TEST ClickHouse 无墙 | API 可访问 |

---

## 🚨 重要说明

### 1. remote() 函数的密码

在 `remote()` 函数中，**必须使用 LIVE 环境的密码**：

```sql
SELECT * FROM remote(
  '10.180.129.96',          -- LIVE IP
  'spx_mart_manage_app.table_name',
  'spx_mart',               -- LIVE 用户名
  'RtL3jHWkDoHp'           -- LIVE 密码 ⚠️
)
```

虽然这个 SQL 在 TEST ClickHouse 执行，但 `remote()` 连接的是 LIVE，所以用 LIVE 的凭证。

### 2. FORMAT JSON

如果需要 JSON 格式的返回（用于 SELECT），在 SQL 末尾加上：

```sql
SELECT count() as cnt FROM table FORMAT JSON
```

### 3. TRUNCATE 先清空表

如果需要完全替换数据，先清空：

```javascript
// 先清空
await executeTestClickHouseSQL(`TRUNCATE TABLE ${targetTable}`);

// 再插入
await executeTestClickHouseSQL(`
  INSERT INTO ${targetTable}
  SELECT * FROM remote(...)
`);
```

---

## 🎨 UI 实现示例

```html
<div class="data-sync-tool">
  <h3>📦 数据同步工具 (LIVE → TEST)</h3>
  
  <div class="sync-form">
    <label>表名:</label>
    <input type="text" id="syncTableName" 
           placeholder="dim_spx_driver_tab">
    
    <label>市场:</label>
    <select id="syncMarket">
      <option value="sg">SG</option>
      <option value="id">ID</option>
      <option value="my">MY</option>
      <option value="th">TH</option>
      <option value="ph">PH</option>
      <option value="vn">VN</option>
      <option value="tw">TW</option>
      <option value="br">BR</option>
    </select>
    
    <button id="executeSyncBtn">🚀 开始同步</button>
  </div>
  
  <div id="syncStatus"></div>
</div>
```

```javascript
document.getElementById('executeSyncBtn').addEventListener('click', async () => {
  const tableName = document.getElementById('syncTableName').value;
  const market = document.getElementById('syncMarket').value;
  const statusDiv = document.getElementById('syncStatus');
  
  if (!tableName) {
    alert('请输入表名');
    return;
  }
  
  statusDiv.innerHTML = '<div class="loading">🚀 同步中...</div>';
  
  const result = await fullSyncWorkflow(tableName, market);
  
  if (result.success) {
    statusDiv.innerHTML = `<div class="success">✅ ${result.message}</div>`;
  } else {
    statusDiv.innerHTML = `<div class="error">❌ ${result.message}</div>`;
  }
});
```

---

## 🎉 总结

✅ **两种场景，两个函数**：

1. **数据同步** → `executeTestClickHouseSQL()` - 直连 TEST
2. **查询 LIVE** → `executeClickHouseSQL()` - 通过 API

✅ **关键区别**：
- 数据同步：浏览器 → TEST ClickHouse → LIVE ClickHouse (via remote())
- 查询数据：浏览器 → API → LIVE ClickHouse

✅ **无需修改后端**：
- TEST ClickHouse 无墙，直接访问
- 使用 Basic Auth 认证

---

**现在可以直接使用 `executeTestClickHouseSQL()` 进行数据同步了！** 🚀

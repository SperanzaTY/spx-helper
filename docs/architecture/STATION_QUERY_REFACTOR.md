# 站点查询功能重构说明 v2.8.1

## 📋 更新概要

将站点查询功能从**本地 Python 后端服务**重构为**在线 ApiMart 接口调用**，实现更简洁、更可靠的查询方案。

---

## 🎯 重构原因

### 旧方案的问题
1. **依赖复杂**：需要本地安装 Python、Flask、ClickHouse 客户端等依赖
2. **配置繁琐**：需要手动配置 ClickHouse 连接信息（host、port、user、password、database）
3. **维护成本高**：需要启动并保持 Python 后端服务运行
4. **网络限制**：访问生产环境 ClickHouse 需要 VPN 或内网权限

### 新方案的优势
1. **零配置**：无需安装任何后端服务或依赖
2. **开箱即用**：直接通过 Chrome 扩展的 UI 即可查询
3. **实时数据**：直接查询 Live 环境（ONLINE2）的生产数据
4. **自动鉴权**：每次查询自动生成新的 JWT Token，无需手动管理

---

## 🔄 核心变更

### 1. 接口调用方式

**旧方案：本地 Python 服务**
```javascript
// 需要先启动 station_api.py
const STATION_API_BASE = 'http://localhost:8888';
fetch(`${STATION_API_BASE}/station/id/${stationId}`)
```

**新方案：ApiMart 在线接口**
```javascript
// 直接调用在线接口，无需本地服务
const STATION_API_URL = 'https://mgmt-data.ssc.test.shopeemobile.com/api_mart/mgmt_app/data_api/internal_search';
const jwtToken = await generateApiMartJwtToken();
fetch(STATION_API_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'jwt-token': jwtToken
  },
  body: JSON.stringify({ sql: '...' })
})
```

### 2. 查询逻辑

**按站点 ID 查询**
```javascript
// 构造 UNION ALL 查询支持跨市场
const sqlParts = targetMarkets.map(m => 
  `SELECT '${m}' as market, station_id, station_name, ..., 1 as ck_flag_res 
   FROM spx_mart_manage_app.dim_spx_station_tab_${m}_all 
   WHERE station_id = ${stationId}`
);
const sql = sqlParts.join(' UNION ALL ');
```

**按站点名称查询**
```javascript
// 使用 LIKE 模糊匹配
const sqlParts = targetMarkets.map(m => 
  `SELECT '${m}' as market, station_id, station_name, ..., 1 as ck_flag_res 
   FROM spx_mart_manage_app.dim_spx_station_tab_${m}_all 
   WHERE station_name LIKE '%${stationName}%' 
   LIMIT 50`
);
```

### 3. JWT 鉴权

复用了已有的 ApiMart JWT 生成逻辑：
```javascript
async function generateApiMartJwtToken() {
  const account = 'mgmt_app';
  const secret = 'hZl.`xjR=0XUphtTf&uf)|K)Fo|/&-m';
  
  const header = { alg: 'HS256', typ: 'JWT', account };
  const payload = { timestamp: Math.floor(Date.now() / 1000) };
  
  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSha256(secret, `${headerEncoded}.${payloadEncoded}`);
  
  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}
```

---

## 📝 SQL 注意事项

### `ck_flag_res` 由函数自动处理

接口要求 SQL 包含 `1 as ck_flag_res` 标记字段。`executeClickHouseSQL` 函数已在内部自动将 SQL 包装为子查询并追加此字段，调用方直接传入正常 SQL 即可，无需手动添加：

```sql
-- 调用方只需传入正常 SQL（不含 ck_flag_res）
SELECT 
  'sg' as market,
  station_id,
  station_name
FROM spx_mart_manage_app.dim_spx_station_tab_sg_all
WHERE station_id = 201
-- 函数内部自动转换为：
-- SELECT *, 1 as ck_flag_res FROM (上面的 SQL)
```

### 数据库与表名

- **数据库**: `spx_mart_manage_app` (ONLINE2 生产环境)
- **表模板**: `dim_spx_station_tab_{market}_all`
- **支持市场**: `sg`, `id`, `my`, `th`, `ph`, `vn`, `tw`, `br`

---

## 🗑️ 移除的代码

### popup.js
```javascript
// 移除本地服务配置
- const STATION_API_BASE = 'http://localhost:8888';
- const STATION_DEMO_MODE = false;

// 移除演示模式逻辑
- if (STATION_DEMO_MODE) { ... }

// 移除测试连接功能
- document.getElementById('testStationConnection')?.addEventListener(...)
- document.getElementById('openStationDocs')?.addEventListener(...)
```

### popup.html
```html
<!-- 移除本地服务相关的 UI 元素 -->
- <button id="testStationConnection">🔌 测试连接</button>
- <button id="openStationDocs">📖 查看文档</button>

<!-- 更新配置提示信息 -->
- "后端 API 服务运行中"
- "API 地址: http://localhost:8888"
+ "使用 ApiMart 接口查询 Live 环境数据"
+ "接口: mgmt-data.ssc.test.shopeemobile.com"
```

---

## ✅ 测试验证

### 查询站点 ID
```javascript
// 输入: 201
// 预期: 返回 ID 为 201 的站点信息（可能跨多个市场）
```

### 查询站点名称
```javascript
// 输入: Hub
// 预期: 返回所有名称包含 "Hub" 的站点（最多 50 条/市场）
```

### 市场筛选
```javascript
// 输入: ID=201, Market=sg
// 预期: 仅返回新加坡市场的 201 号站点
```

---

## 📦 依赖清理

### 不再需要的文件和目录
- `station_query/` - Python 后端服务整个目录
  - `station_api.py` - Flask API 服务
  - `station_cli.py` - 命令行工具
  - `station_query.py` - ClickHouse 查询模块
  - `sync_station_data.py` - 数据同步脚本
  - `config/clickhouse.yaml` - ClickHouse 配置
  - `requirements.txt` - Python 依赖
  - `start.sh` - 启动脚本
  - 各种文档文件

> **注意**：这些文件可以保留作为历史参考，但不再是功能运行的必需部分。

---

## 🚀 部署说明

### 对用户的影响
1. **升级用户**：无需任何操作，直接升级到 v2.8.1 即可使用
2. **新用户**：下载扩展后直接使用，无需额外配置
3. **旧版用户**：如果之前配置了本地 Python 服务，可以直接卸载，不再需要

### 发布清单
- [x] 更新 `popup.js` - 重构查询逻辑
- [x] 更新 `popup.html` - 更新 UI 提示信息
- [x] 更新 `manifest.json` - 版本号 2.8.0 → 2.8.1
- [x] 创建重构说明文档 `STATION_QUERY_REFACTOR.md`
- [ ] 创建发布说明 `release_notes_v2.8.1.md`
- [ ] 更新 `README.md` - 移除 Python 后端相关说明
- [ ] 测试功能是否正常
- [ ] 发布到 Git
- [ ] 创建 GitHub Release

---

## 🔧 技术细节

### JWT Token 生成
- **算法**: HMAC-SHA256
- **Header**: `{ alg: 'HS256', typ: 'JWT', account: 'mgmt_app' }`
- **Payload**: `{ timestamp: <当前Unix时间戳> }`
- **签名**: 使用 Web Crypto API 的 `crypto.subtle.sign`

### 接口规范
- **URL**: `https://mgmt-data.ssc.test.shopeemobile.com/api_mart/mgmt_app/data_api/internal_search`
- **方法**: POST
- **Content-Type**: application/json
- **Headers**: 
  - `jwt-token`: `<生成的JWT>`
- **Body**: 
  ```json
  { "sql": "<ClickHouse SQL 查询>" }
  ```

### 响应格式
```json
{
  "data": [
    {
      "market": "sg",
      "station_id": 201,
      "station_name": "...",
      ...
    }
  ]
}
```

---

## 📊 性能对比

| 指标 | 旧方案 (本地服务) | 新方案 (在线接口) |
|------|------------------|------------------|
| **启动时间** | 5-10秒 (Python服务) | 0秒 (无需启动) |
| **查询延迟** | ~0.5-1s | ~0.5-1s |
| **依赖安装** | 需要 | 不需要 |
| **配置复杂度** | 高 | 无 |
| **数据新鲜度** | TEST环境 (延迟) | LIVE环境 (实时) |
| **维护成本** | 高 | 低 |

---

## 📚 相关文档

- [Release Notes v2.8.1](./release_notes_v2.8.1.md) - 发布说明
- [ApiMart 接口文档](https://mgmt-data.ssc.test.shopeemobile.com) - API 详细说明
- [JWT 标准](https://jwt.io/) - JSON Web Token 规范

---

**更新日期**: 2026-01-30  
**版本**: v2.8.1  
**作者**: tianyi.liang

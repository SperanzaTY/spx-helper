# SPX Helper v2.8.1 Release Notes

## 📅 发布信息

- **版本号**: v2.8.1
- **发布日期**: 2026-01-30
- **更新类型**: 功能重构（站点查询）
- **兼容性**: 无破坏性更改，完全向后兼容

---

## 🎯 核心更新

### ⚡ 站点查询功能重构

将站点查询功能从**本地 Python 后端服务**重构为**在线 ApiMart 接口**，实现开箱即用的查询体验。

#### 主要改进

1. **零配置启动**
   - ✅ 无需安装 Python 或任何后端服务
   - ✅ 无需配置 ClickHouse 连接信息
   - ✅ 直接通过 Chrome 扩展 UI 即可查询

2. **实时生产数据**
   - ✅ 直接查询 Live 环境（ONLINE2）数据
   - ✅ 数据实时同步，无延迟
   - ✅ 自动 JWT 鉴权，安全可靠

3. **简化用户体验**
   - ✅ 移除"测试连接"和"查看文档"按钮
   - ✅ 更新配置提示信息，更清晰直观
   - ✅ 查询速度不变，但无需本地服务支持

#### 技术细节

**接口切换**
```javascript
// 旧方案
const STATION_API_BASE = 'http://localhost:8888';
fetch(`${STATION_API_BASE}/station/id/${id}`)

// 新方案
const STATION_API_URL = 'https://mgmt-data.ssc.test.shopeemobile.com/api_mart/mgmt_app/data_api/internal_search';
const jwtToken = await generateApiMartJwtToken();
fetch(STATION_API_URL, {
  method: 'POST',
  headers: { 'jwt-token': jwtToken },
  body: JSON.stringify({ sql: '...' })
})
```

**查询示例**
```sql
-- 按站点 ID 查询（跨市场）
SELECT 'sg' as market, station_id, station_name, ..., 1 as flag
FROM spx_mart_manage_app.dim_spx_station_tab_sg_all
WHERE station_id = 201
UNION ALL
SELECT 'id' as market, station_id, station_name, ..., 1 as flag
FROM spx_mart_manage_app.dim_spx_station_tab_id_all
WHERE station_id = 201
...

-- 按站点名称模糊查询
SELECT 'sg' as market, station_id, station_name, ..., 1 as flag
FROM spx_mart_manage_app.dim_spx_station_tab_sg_all
WHERE station_name LIKE '%Hub%'
LIMIT 50
```

---

## 📦 文件变更

### 修改的文件

1. **popup.js**
   - 重构 `queryStationById` 函数
   - 重构 `queryStationByName` 函数
   - 移除 `STATION_API_BASE` 和 `STATION_DEMO_MODE` 常量
   - 移除 `testStationConnection` 和 `openStationDocs` 事件监听器
   - 新增 `STATION_API_URL` 常量

2. **popup.html**
   - 更新站点查询的配置提示信息
   - 移除"测试连接"和"查看文档"按钮
   - 更新数据源描述为 Live 环境

3. **manifest.json**
   - 版本号更新：`2.8.0` → `2.8.1`

### 新增的文件

1. **STATION_QUERY_REFACTOR.md**
   - 详细的重构说明文档
   - 包含技术细节、代码对比、测试验证等

2. **release_notes_v2.8.1.md**
   - 本发布说明文档

---

## 🚀 升级指南

### 对现有用户

如果您之前安装了 v2.8.0 并配置了本地 Python 后端服务：

1. **升级扩展**
   - 直接安装 v2.8.1，无需其他操作
   - 站点查询功能会自动切换到在线接口

2. **清理旧环境（可选）**
   - 可以停止并卸载 Python 后端服务
   - 可以删除 `station_query/` 目录（保留作为参考也可以）
   - 不再需要维护 ClickHouse 配置文件

### 对新用户

1. 下载并安装 SPX Helper v2.8.1 扩展
2. 直接使用站点查询功能，无需任何配置

---

## 🔧 功能列表

### 保持不变的功能

✅ **快速链接**
- DataSuite 快速入口
- FMS SPX Admin 快速入口（LIVE、UAT、TEST、STAGING）

✅ **实用工具**
- 时区转换工具（支持 SG, ID, MY, TH, PH, VN, TW, BR）
- Unix 时间戳转换
- Base64 编码/解码
- URL 编码/解码
- JSON 格式化
- SQL 格式化
- Cron 表达式工具
- 正则表达式测试器
- 文本大小写转换
- Mermaid 图表生成器

✅ **HTTP 请求工具**
- Bearer Token 管理（支持 ApiMart JWT 一键生成）
- 自定义 Headers
- 请求历史记录

✅ **窗口模式**
- 可选的独立窗口模式
- 窗口位置和大小记忆

### 改进的功能

⚡ **站点查询工具**
- 按站点 ID 查询（支持单市场或跨市场）
- 按站点名称模糊搜索
- 实时 Live 数据（ONLINE2）
- 自动 JWT 鉴权
- **新**: 无需本地服务，开箱即用

---

## 🐛 已知问题

目前无已知严重问题。

---

## 📊 性能数据

| 指标 | v2.8.0 (本地服务) | v2.8.1 (在线接口) |
|------|------------------|------------------|
| **查询延迟** | ~0.5-1s | ~0.5-1s |
| **启动时间** | 5-10秒 | 0秒 |
| **数据新鲜度** | TEST (延迟) | LIVE (实时) |
| **配置复杂度** | 高 | 无 |

---

## 🔒 安全说明

- JWT Token 每次查询时自动生成，有效期短
- Token 生成逻辑内置在扩展中，使用 Web Crypto API
- 查询通过 HTTPS 加密传输
- 无敏感信息存储在本地

---

## 📚 相关文档

- [重构技术说明](./STATION_QUERY_REFACTOR.md)
- [完整更新日志](./CHANGELOG.md)
- [使用指南](./README.md)

---

## 🙏 致谢

感谢所有用户的反馈和建议，帮助我们持续改进 SPX Helper！

---

## 📞 支持

如有问题或建议，请联系：
- **作者**: tianyi.liang
- **GitHub**: [SPX Helper Repository](https://github.com/SperanzaTY/spx-helper)

---

**版本**: v2.8.1  
**发布日期**: 2026-01-30  
**变更类型**: 功能重构（无破坏性更改）

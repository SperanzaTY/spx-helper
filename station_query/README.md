# SPX 站点快速查询工具

> 跨市场快速查询站点 ID 和站点信息

## 功能特点

- ✅ **站点 ID 查询**：输入站点 ID，返回完整站点信息
- ✅ **站点名称搜索**：支持模糊搜索站点名称
- ✅ **跨市场查询**：自动遍历所有 8 个市场（sg, id, my, th, ph, vn, tw, br）
- ✅ **多种使用方式**：命令行 + HTTP API + Chrome Extension
- ✅ **快速响应**：并行查询所有市场，秒级响应

## 快速开始

### 1. 安装依赖

```bash
cd station_query
pip install -r requirements.txt
```

### 2. 配置数据源

编辑 `config/clickhouse.yaml`：

```yaml
online2:
  host: "your-clickhouse-host"
  port: 8123
  user: "your-username"
  password: "your-password"
  database: "spx_mart_manage_app"
```

### 3. 使用方式

#### 方式一：命令行查询

```bash
# 按站点 ID 查询
python station_cli.py --id 123456

# 按站点名称搜索
python station_cli.py --name "Central Hub"

# 指定市场查询
python station_cli.py --id 123456 --market sg

# 批量查询多个 ID
python station_cli.py --ids 123,456,789
```

#### 方式二：HTTP API

```bash
# 启动 API 服务
python station_api.py --port 8888

# 查询站点 ID
curl "http://localhost:8888/station/id/123456"

# 搜索站点名称
curl "http://localhost:8888/station/name/Central%20Hub"

# 批量查询
curl -X POST "http://localhost:8888/station/batch" \
  -H "Content-Type: application/json" \
  -d '{"ids": [123, 456, 789]}'
```

#### 方式三：Chrome Extension

在 SPX Helper Extension 中添加"站点查询"功能：

1. 打开扩展
2. 点击"站点查询"标签
3. 输入站点 ID 或名称
4. 查看结果

## API 文档

### GET /station/id/:station_id

查询指定站点 ID

**参数：**
- `station_id` (必填): 站点 ID
- `market` (可选): 指定市场，不填则查询所有市场

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "market": "id",
      "station_id": 123456,
      "station_name": "Jakarta Central Hub",
      "station_type": 1,
      "bi_station_type": "HUB",
      "status": 1,
      "city_name": "Jakarta",
      "latitude": -6.123456,
      "longitude": 106.789012,
      "manager": "John Doe",
      "manager_email": "john@example.com",
      "is_active_site_l7d": 1
    }
  ],
  "count": 1,
  "query_time": "0.35s"
}
```

### GET /station/name/:station_name

按名称模糊搜索站点

**参数：**
- `station_name` (必填): 站点名称关键词
- `limit` (可选): 返回结果数量限制，默认 100

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "market": "id",
      "station_id": 123456,
      "station_name": "Jakarta Central Hub",
      ...
    },
    {
      "market": "my",
      "station_id": 789012,
      "station_name": "KL Central Hub",
      ...
    }
  ],
  "count": 2,
  "query_time": "0.52s"
}
```

### POST /station/batch

批量查询多个站点

**请求体：**
```json
{
  "ids": [123, 456, 789],
  "market": "id"  // 可选
}
```

**响应：**
```json
{
  "success": true,
  "data": [...],
  "count": 3,
  "query_time": "0.41s"
}
```

## 数据字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| market | String | 市场代码 (sg/id/my/th/ph/vn/tw/br) |
| station_id | Int64 | 站点 ID |
| station_name | String | 站点名称 |
| station_type | Int32 | 站点类型 |
| bi_station_type | String | BI 站点类型 |
| status | Int32 | 状态 |
| city_name | String | 城市名称 |
| latitude | Decimal | 纬度 |
| longitude | Decimal | 经度 |
| manager | String | 站点经理 |
| manager_email | String | 经理邮箱 |
| is_active_site_l7d | Int32 | 近7天是否活跃 |

更多字段详见 API 响应。

## 性能优化

- 使用线程池并行查询所有市场
- 结果缓存（可选）
- 连接池复用

## 常见问题

**Q: 查询速度慢怎么办？**
A: 检查网络连接，或指定具体市场减少查询范围。

**Q: 找不到站点怎么办？**
A: 确认站点 ID 是否正确，或者该站点可能在其他环境（UAT/TEST）。

**Q: 如何查询历史数据？**
A: 当前查询的是最新快照，历史数据需查询对应的历史表。

## 更新日志

### v1.0.0 (2026-01-22)
- ✅ 初始版本
- ✅ 支持站点 ID 查询
- ✅ 支持站点名称搜索
- ✅ 支持跨市场查询
- ✅ HTTP API 接口
- ✅ 命令行工具

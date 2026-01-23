# 站点查询工具 - 技术说明

## 系统架构

```
┌─────────────────┐
│ Chrome Extension│  (前端：popup.html/popup.js)
└────────┬────────┘
         │ HTTP Request
         ↓
┌─────────────────┐
│  Flask API      │  (station_api.py)
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ StationQuery    │  (station_query.py)
└────────┬────────┘
         │ SQL Query
         ↓
┌─────────────────┐
│  ClickHouse     │  (online2 cluster)
│  dim_spx_station│
│  _tab_*_all     │
└─────────────────┘
```

## 核心组件

### 1. ClickHouseClient

**位置**: `station_query.py`

**职责**: 封装 ClickHouse HTTP 接口

**关键方法**:
- `query(sql)`: 执行查询，返回 JSON 格式结果
- `test_connection()`: 测试连接是否正常

**示例**:
```python
client = ClickHouseClient(
    host='10.0.0.1',
    port=8123,
    user='readonly',
    password='password',
    database='spx_mart_manage_app'
)

success, data = client.query("SELECT * FROM dim_spx_station_tab_id_all LIMIT 10")
```

### 2. StationQuery

**位置**: `station_query.py`

**职责**: 业务逻辑，处理跨市场并行查询

**关键特性**:
- 使用 `ThreadPoolExecutor` 并行查询所有市场
- 自动添加 `market` 字段到结果中
- 统一异常处理

**流程**:
```python
def query_by_id(station_id, market=None):
    1. 确定要查询的市场列表
    2. 使用线程池并行查询所有市场
    3. 收集所有结果
    4. 添加 market 字段
    5. 返回合并后的结果
```

**表名模板**:
```python
TABLE_TEMPLATE = "spx_mart_manage_app.dim_spx_station_tab_{market}_all"
# 例如：
# - dim_spx_station_tab_sg_all
# - dim_spx_station_tab_id_all
# - dim_spx_station_tab_my_all
```

### 3. Flask API

**位置**: `station_api.py`

**端点**:

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/station/id/:id` | GET | 按 ID 查询 |
| `/station/name/:name` | GET | 按名称搜索 |
| `/station/batch` | POST | 批量查询 |
| `/markets` | GET | 获取支持的市场列表 |

**查询参数**:
- `market`: 指定市场（可选）
- `limit`: 返回结果限制（可选，默认 100）

**响应格式**:
```json
{
  "success": true,
  "data": [
    {
      "market": "id",
      "station_id": 123456,
      "station_name": "Jakarta Central Hub",
      "bi_station_type": "HUB",
      ...
    }
  ],
  "count": 1,
  "query_time": "0.35s"
}
```

### 4. Chrome Extension

**位置**: `popup.html`, `popup.js`, `styles.css`

**UI 组件**:
- 查询类型切换（ID / 名称）
- 市场选择下拉框
- 查询按钮
- 结果展示卡片

**JavaScript 逻辑**:
```javascript
// API 地址（可配置）
const STATION_API_BASE = 'http://localhost:8888';

// 查询流程
1. 获取用户输入
2. 显示 loading 动画
3. 调用 API
4. 渲染结果或显示错误
```

**样式特点**:
- 响应式卡片布局
- 渐变色主题（#667eea → #764ba2）
- 加载动画
- 空状态和错误状态提示

## 性能优化

### 1. 并行查询

使用 `ThreadPoolExecutor` 并行查询所有市场：

```python
with ThreadPoolExecutor(max_workers=8) as executor:
    futures = {
        executor.submit(query_single_market, market): market 
        for market in markets
    }
    
    for future in as_completed(futures):
        results.extend(future.result())
```

**效果**:
- 串行查询 8 个市场：~8 × 0.5s = 4s
- 并行查询 8 个市场：~0.5s（理想情况）

### 2. 连接复用

ClickHouseClient 使用 `requests` 库，自动复用连接。

### 3. 超时设置

```python
query_timeout = 30  # 单次查询超时
sync_timeout = 1800  # 整体同步超时
```

## 安全注意事项

### 1. SQL 注入防护

**不安全的写法**（已避免）:
```python
sql = f"SELECT * FROM table WHERE name = '{user_input}'"
```

**安全的写法**:
```python
# 转义特殊字符
station_name_escaped = station_name.replace("'", "\\'")
sql = f"SELECT * FROM table WHERE name ILIKE '%{station_name_escaped}%'"
```

### 2. API 访问控制

生产环境建议：
- 添加认证机制（API Key / JWT）
- 限流（Rate Limiting）
- CORS 白名单

### 3. 敏感信息保护

配置文件不应提交到 Git：

```bash
# .gitignore
config/clickhouse.yaml
*.log
```

## 扩展性

### 添加新市场

只需在配置中添加：

```yaml
markets:
  - sg
  - id
  - my
  - th
  - ph
  - vn
  - tw
  - br
  - new_market  # 新市场
```

### 添加新查询字段

修改 `station_query.py` 中的 SQL 查询：

```python
sql = f"""
SELECT 
    station_id,
    station_name,
    new_field,  -- 添加新字段
    ...
FROM {table}
WHERE ...
"""
```

### 添加新 API 端点

在 `station_api.py` 中添加路由：

```python
@app.route('/station/custom', methods=['POST'])
def custom_query():
    # 自定义查询逻辑
    pass
```

## 测试

### 单元测试

```python
# tests/test_station_query.py
import pytest
from station_query import StationQuery

def test_query_by_id():
    query = StationQuery(config)
    results = query.query_by_id(123456)
    assert len(results) > 0
    assert results[0]['station_id'] == 123456
```

### 集成测试

```bash
# 测试 API 健康检查
curl http://localhost:8888/health

# 测试查询功能
curl "http://localhost:8888/station/id/123456"
```

## 故障排查

### 问题 1: 连接超时

**症状**: `requests.exceptions.Timeout`

**排查**:
1. 检查网络连接
2. 检查 ClickHouse 服务状态
3. 增加超时时间

### 问题 2: 查询无结果

**症状**: `data` 为空数组

**排查**:
1. 确认站点 ID 是否正确
2. 确认市场选择
3. 检查表是否存在数据

### 问题 3: API 服务启动失败

**症状**: `Address already in use`

**解决**:
```bash
# 查找占用端口的进程
lsof -i :8888

# 杀死进程
kill -9 <PID>

# 或使用其他端口
python station_api.py --port 9999
```

## 部署建议

### 开发环境

```bash
python station_api.py --debug
```

### 生产环境

使用 Gunicorn:

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:8888 station_api:app
```

使用 Docker:

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
EXPOSE 8888

CMD ["python", "station_api.py", "--host", "0.0.0.0", "--port", "8888"]
```

## 未来改进

1. **结果缓存**: 使用 Redis 缓存常见查询
2. **查询历史**: 记录用户查询历史
3. **批量导出**: 支持导出为 Excel/CSV
4. **高级搜索**: 支持更多过滤条件
5. **监控告警**: 集成 Prometheus + Grafana

## 参考资料

- [ClickHouse HTTP Interface](https://clickhouse.com/docs/en/interfaces/http/)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/)

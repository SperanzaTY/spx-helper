# 🎬 站点查询功能 - 快速演示

## 第一步：配置

```bash
# 1. 进入项目目录
cd /Users/tianyi.liang/Cursor/SPX_Helper/station_query

# 2. 复制配置文件
cp config/clickhouse.yaml.example config/clickhouse.yaml

# 3. 编辑配置（填入你的 ClickHouse 信息）
# 使用 vim、nano 或任何编辑器打开：
# vim config/clickhouse.yaml
```

**配置示例**:
```yaml
online2:
  host: "10.0.0.1"           # 替换为实际 IP
  port: 8123
  user: "readonly_user"      # 替换为实际用户
  password: "your_password"  # 替换为实际密码
  database: "spx_mart_manage_app"
  use_https: false
  timeout: 30

markets:
  - sg
  - id
  - my
  - th
  - ph
  - vn
  - tw
  - br

query:
  max_workers: 8
  timeout: 30
  default_limit: 100
  show_sql: false
```

## 第二步：安装依赖

```bash
# 创建虚拟环境（推荐）
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

**预期输出**:
```
Collecting requests>=2.25.0
  Downloading requests-2.31.0-py3-none-any.whl
Collecting PyYAML>=5.4.0
  Downloading PyYAML-6.0.1-cp39-cp39-macosx_11_0_arm64.whl
...
Successfully installed Flask-2.0.3 PyYAML-6.0.1 requests-2.31.0 ...
```

## 第三步：测试连接

```bash
# 运行测试脚本
python test_station_query.py
```

**预期输出**:
```
==================================================
   SPX 站点查询功能测试
==================================================

🔌 测试 ClickHouse 连接...
✅ 连接成功

🔍 测试按 ID 查询（示例 ID: 123456）...
✅ 查询成功，找到 1 条记录，耗时 0.35s
   站点名称: Jakarta Central Hub
   市场: id

🔍 测试按名称查询（关键词: Hub）...
✅ 查询成功，找到 15 条记录，耗时 0.52s
   1. [ID] Jakarta Central Hub
   2. [SG] Singapore Hub
   3. [MY] Kuala Lumpur Hub

🔍 测试批量查询（ID: 123, 456, 789）...
✅ 查询完成，找到 2 条记录，耗时 0.41s

==================================================
测试完成: ✅ 4 通过, ❌ 0 失败
==================================================
```

## 第四步：启动 API 服务

### 方式一：使用快速启动脚本（推荐）

```bash
./start.sh
```

**预期输出**:
```
========================================
  SPX 站点查询服务 - 快速启动
========================================

✅ Python3 已安装: Python 3.9.6
🔌 激活虚拟环境...
📦 安装依赖...
✅ 配置文件已存在
🔌 测试 ClickHouse 连接...
✅ ClickHouse 连接成功

========================================
🚀 启动 API 服务...
   地址: http://0.0.0.0:8888
   按 Ctrl+C 停止服务
========================================

正在初始化站点查询服务...
✅ ClickHouse 连接测试成功
🚀 服务启动: http://0.0.0.0:8888
📖 API 文档: http://0.0.0.0:8888/health
 * Running on http://0.0.0.0:8888
```

### 方式二：手动启动

```bash
python station_api.py --port 8888
```

## 第五步：使用扩展查询

1. **打开 SPX Helper Extension**
   - 点击浏览器工具栏的扩展图标

2. **切换到实用工具**
   - 点击顶部导航的"🛠️ 实用工具"标签

3. **点击站点查询**
   - 在工具网格中点击"📍 站点查询"按钮

4. **执行查询**

   **场景 1: 查询站点 ID**
   ```
   1. 确保"站点 ID"标签是活跃状态
   2. 输入站点 ID：123456
   3. 选择市场（可选）：Indonesia (ID)
   4. 点击"🔍 查询"按钮
   ```

   **场景 2: 搜索站点名称**
   ```
   1. 点击"站点名称"标签切换
   2. 输入关键词：Central Hub
   3. 选择市场（可选）：所有市场
   4. 点击"🔍 搜索"按钮
   ```

5. **查看结果**
   - 结果会以卡片形式展示
   - 每张卡片显示完整的站点信息
   - 可以复制站点 ID 或完整详情

## 第六步：命令行使用（可选）

```bash
# 查询站点 ID
python station_cli.py --id 123456

# 搜索站点名称
python station_cli.py --name "Central Hub"

# 指定市场查询
python station_cli.py --id 123456 --market id

# 批量查询
python station_cli.py --ids 123,456,789

# 输出 JSON 格式
python station_cli.py --id 123456 --json
```

**命令行输出示例**:
```
⏳ 正在连接 ClickHouse...
✅ 连接成功

🔍 查询站点 ID: 123456

✅ 找到 1 条记录:

+--------+--------+---------------------+------+--------+----------+-------------+----------+------------------------+
| 市场   | ID     | 站点名称             | 类型 | 状态   | 城市     | 经理        | 是否活跃 | 地址                   |
+========+========+=====================+======+========+==========+=============+==========+========================+
| id     | 123456 | Jakarta Central Hub | HUB  | ✅     | Jakarta  | John Doe    | ✅       | Jl. Sudirman No. 123...| 
+--------+--------+---------------------+------+--------+----------+-------------+----------+------------------------+
```

## 第七步：API 调用（可选）

### 使用 cURL

```bash
# 1. 健康检查
curl http://localhost:8888/health

# 2. 查询站点 ID
curl "http://localhost:8888/station/id/123456"

# 3. 搜索站点名称
curl "http://localhost:8888/station/name/Central%20Hub"

# 4. 指定市场查询
curl "http://localhost:8888/station/id/123456?market=id"

# 5. 批量查询
curl -X POST "http://localhost:8888/station/batch" \
  -H "Content-Type: application/json" \
  -d '{"ids": [123, 456, 789], "market": "id"}'
```

### 使用 Python

```python
import requests

# 查询站点 ID
response = requests.get('http://localhost:8888/station/id/123456')
data = response.json()

if data['success']:
    print(f"找到 {data['count']} 个站点")
    for station in data['data']:
        print(f"  市场: {station['market']}")
        print(f"  站点名称: {station['station_name']}")
        print(f"  城市: {station['city_name']}")
        print()
else:
    print("查询失败")
```

### API 响应示例

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
      "district_id": 789,
      "latitude": -6.123456,
      "longitude": 106.789012,
      "manager": "John Doe",
      "manager_email": "john.doe@example.com",
      "director": "Jane Smith",
      "director_email": "jane.smith@example.com",
      "is_active_site_l7d": 1,
      "station_region": "Jakarta Region",
      "station_area": "Central Area",
      "station_sub_area": "Downtown",
      "is_own_fleet": 1,
      "xpt_flag": 0,
      "address": "Jl. Sudirman No. 123, Jakarta Pusat"
    }
  ],
  "count": 1,
  "query_time": "0.35s"
}
```

## 常见问题排查

### ❌ 问题 1: 连接测试失败

**错误信息**: `❌ ClickHouse 连接失败`

**解决方案**:
1. 检查配置文件路径和内容
2. 确认 ClickHouse 服务是否运行
3. 检查网络连接
4. 验证用户名和密码

```bash
# 测试网络连接
ping your-clickhouse-host

# 测试端口是否开放
nc -zv your-clickhouse-host 8123
```

### ❌ 问题 2: Extension 提示连接失败

**错误信息**: `❌ 连接失败：无法访问服务`

**解决方案**:
1. 确认 API 服务已启动
2. 检查端口是否正确（默认 8888）
3. 查看浏览器控制台错误

```bash
# 检查服务是否运行
lsof -i :8888

# 测试 API 是否响应
curl http://localhost:8888/health
```

### ❌ 问题 3: 查询无结果

**错误信息**: `未找到站点 ID: xxx`

**解决方案**:
1. 确认站点 ID 是否正确
2. 尝试在不同市场查询
3. 检查数据库中是否存在该站点

```bash
# 使用命令行工具查询多个市场
python station_cli.py --id 123456
```

## 🎉 完成！

现在你已经成功配置并运行了站点查询功能！

**接下来可以**:
- 📖 阅读 [USAGE.md](USAGE.md) 了解更多用法
- 🔧 阅读 [TECHNICAL.md](TECHNICAL.md) 了解技术细节
- 🚀 在生产环境部署（参考 USAGE.md 的部署章节）

**需要帮助？**
- 查看文档：[INDEX.md](INDEX.md)
- 查看实现总结：[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)

---

**演示创建时间**: 2026-01-22  
**项目**: SPX Helper  
**功能**: 站点查询 v1.0.0

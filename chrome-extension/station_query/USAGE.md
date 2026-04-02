# 站点查询使用指南

## 快速开始

### 1. 环境准备

确保已安装 Python 3.7+：

```bash
python3 --version
```

### 2. 安装依赖

```bash
cd station_query
pip install -r requirements.txt
```

### 3. 配置数据源

复制配置示例文件：

```bash
cp config/clickhouse.yaml.example config/clickhouse.yaml
```

编辑 `config/clickhouse.yaml`，填入你的 ClickHouse 配置：

```yaml
online2:
  host: "your-clickhouse-host"
  port: 8123
  user: "your-username"
  password: "your-password"
  database: "spx_mart_manage_app"
  use_https: false
  timeout: 30
```

### 4. 启动 API 服务

```bash
python station_api.py --port 8888
```

看到以下输出表示启动成功：

```
✅ ClickHouse 连接测试成功
🚀 服务启动: http://0.0.0.0:8888
📖 API 文档: http://0.0.0.0:8888/health
```

### 5. 使用扩展查询

1. 打开 SPX Helper 扩展
2. 切换到"实用工具"标签
3. 点击"站点查询"图标
4. 输入站点 ID 或名称进行查询

## 命令行使用

除了通过扩展查询，你也可以使用命令行工具：

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

## API 调用示例

### Python

```python
import requests

# 查询站点 ID
response = requests.get('http://localhost:8888/station/id/123456')
data = response.json()

if data['success']:
    for station in data['data']:
        print(f"市场: {station['market']}, 站点: {station['station_name']}")
```

### cURL

```bash
# 查询站点 ID
curl "http://localhost:8888/station/id/123456"

# 搜索站点名称
curl "http://localhost:8888/station/name/Central"

# 批量查询
curl -X POST "http://localhost:8888/station/batch" \
  -H "Content-Type: application/json" \
  -d '{"ids": [123, 456, 789]}'
```

## 常见问题

### Q: 提示连接失败怎么办？

A: 请检查：
1. API 服务是否已启动 (`python station_api.py`)
2. 端口是否正确（默认 8888）
3. ClickHouse 配置是否正确

### Q: 查询速度慢怎么办？

A: 可以在配置中调整并行度：

```yaml
query:
  max_workers: 16  # 增加并行线程数
```

### Q: 如何修改 API 端口？

A: 启动时指定端口：

```bash
python station_api.py --port 9999
```

同时需要修改 `popup.js` 中的 `STATION_API_BASE`：

```javascript
const STATION_API_BASE = 'http://localhost:9999';
```

### Q: 支持远程访问吗？

A: 支持。启动时指定 host：

```bash
python station_api.py --host 0.0.0.0 --port 8888
```

然后在扩展中修改 API 地址为你的服务器 IP。

## 高级配置

### 启用 HTTPS

```yaml
online2:
  host: "your-host"
  port: 8443
  use_https: true
  # ... other config
```

### 调整查询限制

```yaml
query:
  default_limit: 100  # 默认返回结果数
  timeout: 30         # 查询超时（秒）
```

### 显示 SQL 日志（调试用）

```yaml
online2:
  show_sql: true  # 启用后会在日志中显示执行的 SQL
```

## 后台运行服务

### 使用 nohup

```bash
nohup python station_api.py --port 8888 > logs/api.log 2>&1 &
```

### 使用 screen

```bash
screen -S station-api
python station_api.py --port 8888
# Ctrl+A+D 退出 screen
```

### 使用 systemd（推荐）

创建 `/etc/systemd/system/station-api.service`：

```ini
[Unit]
Description=Station Query API Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/station_query
ExecStart=/usr/bin/python3 station_api.py --port 8888
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl start station-api
sudo systemctl enable station-api  # 开机自启
```

## 更新日志

### v1.0.0 (2026-01-22)
- ✅ 初始版本
- ✅ 支持站点 ID 和名称查询
- ✅ 跨市场查询功能
- ✅ Chrome Extension 集成
- ✅ HTTP API 和命令行工具

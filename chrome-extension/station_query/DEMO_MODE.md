# 站点查询 - 演示模式说明

## ℹ️ 当前状态

**当前为演示模式 (Demo Mode)**，使用模拟数据展示 UI 功能。

在 `popup.js` 中设置了：
```javascript
const STATION_DEMO_MODE = true;  // 演示模式开启
```

## 🎬 演示模式功能

在演示模式下，你可以：

✅ **测试 UI 界面** - 查看站点查询的界面设计  
✅ **查看结果展示** - 了解查询结果的呈现方式  
✅ **测试交互功能** - 体验按钮、复制等功能  

### 模拟数据示例

**按 ID 查询**: 输入任意 ID，会返回一个模拟的 Jakarta Central Hub 站点

**按名称搜索**: 输入 "Hub"、"Central" 等关键词，会返回 3 个模拟站点：
- Jakarta Central Hub (ID)
- Singapore Hub (SG)  
- KL Central Hub (MY)

## 🔧 切换到真实数据

### 步骤 1: 配置 ClickHouse 连接

编辑配置文件：
```bash
cd /Users/tianyi.liang/Cursor/SPX_Helper/station_query
vim config/clickhouse.yaml
```

填入真实的配置：
```yaml
online2:
  host: "your-clickhouse-ip"     # 实际的 ClickHouse 地址
  port: 8123
  user: "your-username"           # 实际的用户名
  password: "your-password"       # 实际的密码
  database: "spx_mart_manage_app"
  use_https: false
  timeout: 30
```

### 步骤 2: 启动后端服务

```bash
cd /Users/tianyi.liang/Cursor/SPX_Helper/station_query

# 方式一：使用快速启动脚本
./start.sh

# 方式二：手动启动
python3 station_api.py --port 8888
```

看到以下输出表示启动成功：
```
✅ ClickHouse 连接测试成功
🚀 服务启动: http://0.0.0.0:8888
```

### 步骤 3: 关闭演示模式

编辑 `popup.js`：
```javascript
const STATION_DEMO_MODE = false;  // 改为 false
```

### 步骤 4: 重新加载扩展

1. 打开 Chrome 扩展管理页面：`chrome://extensions`
2. 找到 "SPX Helper"
3. 点击刷新图标 🔄

## ✅ 验证

1. 打开扩展 → 实用工具 → 站点查询
2. 点击"🔌 测试连接"按钮
3. 如果显示"✅ 连接成功"，说明配置正确
4. 现在可以查询真实的站点数据了

## 📊 对比

| 功能 | 演示模式 | 真实模式 |
|------|---------|---------|
| UI 展示 | ✅ | ✅ |
| 查询速度 | 瞬时 | 0.3-0.5s |
| 数据来源 | 硬编码 | ClickHouse |
| 跨市场查询 | ❌ | ✅ |
| 实时数据 | ❌ | ✅ |
| 需要后端 | ❌ | ✅ |

## 🤔 为什么要演示模式？

1. **快速体验**: 无需配置即可查看功能
2. **UI 测试**: 开发时测试界面设计
3. **离线使用**: 不依赖后端服务
4. **演示展示**: 向他人展示功能

## 💡 小贴士

- 演示模式的数据标记了"(演示数据)"字样
- 模拟数据包含常见的站点类型和状态
- 可以测试复制、搜索等所有 UI 功能
- 切换模式后记得重新加载扩展

---

**当前位置**: `/Users/tianyi.liang/Cursor/SPX_Helper/station_query/`  
**配置文件**: `config/clickhouse.yaml`  
**主控文件**: `../popup.js` (第 2788 行)

有问题随时查看：[DEMO.md](DEMO.md) 📖

# Flink Query MCP

DataSuite Flink 平台查询与诊断 MCP 工具，支持流/批任务状态查询、延迟监控、异常诊断、血缘查询等。

## 功能概览

### Phase 1: 核心查询

| 工具 | 说明 |
|------|------|
| `search_flink_apps` | 搜索流/批任务列表，支持关键词、项目名过滤 |
| `get_flink_app_detail` | 获取应用详情（配置、状态、资源、调度信息） |
| `get_flink_instance` | 获取当前/历史实例信息（集群、资源、监控链接） |
| `get_flink_exceptions` | 查看应用异常列表（异常消息、堆栈、次数） |
| `get_flink_alarm_log` | 查看告警日志（告警内容、接收者、通知状态） |

### Phase 2: 诊断分析

| 工具 | 说明 |
|------|------|
| `get_flink_latency` | 获取延迟趋势（Kafka Source、算子、Producer 延迟拆解） |
| `get_flink_latency_analysis` | 延迟根因分析（异常诊断、系统指标、热力图） |
| `get_flink_graph_metrics` | 算子级指标（Graph Monitor），定位瓶颈算子 |
| `get_flink_resource_estimation` | 资源调优建议（并行度估算、CPU/内存使用） |
| `diagnose_flink_app` | 一键诊断：聚合延迟+异常+告警+资源，输出优化建议 |

### Phase 3: 扩展

| 工具 | 说明 |
|------|------|
| `get_flink_lineage` | 数据血缘关系（Source / Lookup / Sink 表） |
| `get_flink_operation_log` | 操作日志（启动、停止、重启记录） |
| `get_flink_sla_dr` | SLA 等级与容灾信息 |

## 安装

### 开发者：本机仓库（推荐）

克隆 **spx-helper** 后，对同一个 `python3` 安装依赖：

```bash
cd /path/to/spx-helper/mcp-tools/chrome-auth && python3 -m pip install -e .
cd ../flink-query && python3 -m pip install -e .
```

在 `~/.cursor/mcp.json` 的 `mcpServers` 中增加（把路径换成你的仓库根目录）：

```json
"flink-query": {
  "command": "python3",
  "args": ["/path/to/spx-helper/mcp-tools/flink-query/flink_mcp_server.py"],
  "env": {
    "PYTHONPATH": "/path/to/spx-helper/mcp-tools/chrome-auth"
  }
}
```

保存后在 Cursor **Settings → MCP** 中刷新。若已把 `flink-mcp` 装到 PATH，也可改用 `"command": "flink-mcp", "args": []`。

### 仅使用 release：GitLab uvx（免克隆）

未克隆仓库时可用 uv 从 Git 子目录运行，详见顶层 [MCP_TOOLS.md](../../docs/guides/MCP_TOOLS.md) 中「GitLab / GitHub release」一节。

### 本地命令行调试

```bash
cd mcp-tools/flink-query
python3 -m pip install -e ../chrome-auth -e .
flink-mcp
```

## 认证

复用 chrome-auth 库，自动从 Chrome 浏览器读取 `datasuite.shopee.io` 的 Cookie。

前置条件：在 Chrome 中登录 DataSuite Flink 平台 (`https://datasuite.shopee.io/flink/`)。

关键 Cookie：`CSRF-TOKEN`、`JSESSIONID`、`DATA-SUITE-AUTH-userToken-v4`。

## API 参考

所有 API 基于 DataSuite Flink 平台 REST API（`/flink/api/v2/`）。

响应信封格式：
```json
{
  "requestId": "...",
  "code": 200,
  "message": "ok",
  "data": ...,
  "pagination": { "pageStart": 1, "pageSize": 20, "elementTotal": 100 }
}
```

## 使用示例

### 查询流任务

```
搜索 spx_mart 项目下的流任务
```

### 告警排查

```
帮我看一下 Flink 任务 741498 为什么告警了，诊断一下
```

### 延迟分析

```
查看 Flink 任务 741498 最近 2 小时的延迟趋势
```

### 血缘查询

```
查一下 Flink 任务 741498 的上下游数据血缘
```

## Changelog

### v0.1.0

- 初始版本
- 实现 13 个 MCP 工具，覆盖核心查询、诊断分析、扩展三个阶段

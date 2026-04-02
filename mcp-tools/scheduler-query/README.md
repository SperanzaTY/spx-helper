# DataSuite Scheduler 查询工具 (scheduler-query)

查询 DataSuite Scheduler 平台的任务状态、实例列表、运行日志、血缘关系和 Presto SQL。

## 认证

自动从 Chrome 浏览器读取 `datasuite.shopee.io` 的 Cookie，需要：
1. 先在 Chrome 中登录 https://datasuite.shopee.io
2. 安装依赖：`pip3 install mcp requests browser-cookie3`

## 配置

在 `~/.cursor/mcp.json` 中添加：

```json
{
  "scheduler-query": {
    "command": "python3",
    "args": [
      "/你的路径/spx-helper/mcp-tools/scheduler-query/scheduler_mcp_server.py"
    ]
  }
}
```

> 替换 `/你的路径/spx-helper` 为实际的项目路径。

## 工具列表

### `search_tasks`
搜索 Scheduler 任务。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `keyword` | string | 是 | 搜索关键词（任务名） |
| `project_code` | string | 否 | 项目代码，默认 `spx_mart` |
| `page_size` | int | 否 | 返回条数，默认 20 |
| `env` | string | 否 | 环境：`prod`/`dev`/`staging`，默认 `prod` |

### `get_task_info`
获取任务详情。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task_code` | string | 是 | 任务代码 |
| `env` | string | 否 | 环境，默认 `prod` |

### `get_task_instances`
查询任务的运行实例列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task_code` | string | 是 | 任务代码 |
| `env` | string | 否 | 环境，默认 `prod` |
| `date` | string | 否 | 日期，格式 `YYYY-MM-DD` |
| `page_size` | int | 否 | 返回条数，默认 10 |

### `get_instance_detail`
查询实例详情，包含 Presto Query ID（可用于获取执行的 SQL）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task_instance_code` | string | 是 | 实例代码 |
| `env` | string | 否 | 环境，默认 `prod` |

### `get_instance_log`
查询实例运行日志。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task_instance_code` | string | 是 | 实例代码 |
| `env` | string | 否 | 环境，默认 `prod` |

### `get_presto_query_sql`
通过 Presto Query ID 或实例代码获取执行的 SQL。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `presto_query_id` | string | 否 | Presto Query ID（直接查询） |
| `task_instance_code` | string | 否 | 实例代码（自动提取 Query ID） |
| `env` | string | 否 | 环境，默认 `prod` |

> 两个参数至少提供一个。提供 `task_instance_code` 时会自动从实例详情中提取 Query ID。

### `get_task_lineage`
查询任务的上下游血缘关系。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task_code` | string | 是 | 任务代码 |
| `env` | string | 否 | 环境，默认 `prod` |

### `get_task_metric_summary`
查询任务的运行指标汇总。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task_code` | string | 是 | 任务代码 |
| `env` | string | 否 | 环境，默认 `prod` |

### `get_task_operation_log`
查询任务的操作日志（谁改了什么）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task_code` | string | 是 | 任务代码 |
| `days` | int | 否 | 查询最近多少天，默认 30 |
| `env` | string | 否 | 环境，默认 `prod` |

### `get_task_violations`
查询任务的 SLA 违规记录。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task_code` | string | 是 | 任务代码 |
| `project_code` | string | 否 | 项目代码，默认 `spx_mart` |
| `env` | string | 否 | 环境，默认 `prod` |

## 使用示例

在 Cursor Agent 中：

```
搜索 scheduler 里包含 dim_station 的任务
```

```
查看 thopsbi_spxa.studio_11116186 最近的运行实例
```

```
查下这个 scheduler dev 环境任务跑的 SQL 是什么：
https://datasuite.shopee.io/scheduler/dev/task/thopsbi_spxa.studio_11116186
```

## 注意事项

- `env` 参数区分环境，从 Scheduler URL 中可判断：`/scheduler/dev/` → `dev`，`/scheduler/task/` → `prod`
- Cookie 有效期约 30 分钟，过期后会自动重新读取
- 如果报 Cookie 失败，确认已在 Chrome 中登录 DataSuite

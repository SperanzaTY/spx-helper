# SeaTalk 消息读取工具 (seatalk-reader)

通过 CDP（Chrome DevTools Protocol）直接读取 SeaTalk 桌面客户端的消息数据。

## 前提条件

- SeaTalk 桌面客户端以 CDP 模式运行（安装 SeaTalk Agent 后自动满足）
- CDP 端口默认 `19222`

## 认证

无需凭证，通过 CDP 本地连接读取 SeaTalk 的 Redux store。

## 配置

在 `~/.cursor/mcp.json` 中添加：

```json
{
  "seatalk-reader": {
    "command": "uvx",
    "args": [
      "--from",
      "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/seatalk-reader",
      "seatalk-reader-mcp"
    ]
  }
}
```

## 工具列表

### `list_seatalk_chats`
列出 SeaTalk 中的聊天会话。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `chat_type` | string | 否 | `all`/`group`/`single`，默认 `all` |

### `read_seatalk_messages`
读取指定群聊或私聊的消息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `session_type` | string | 否 | `group`/`single`，默认 `group` |
| `session_name` | string | 是 | 群名或联系人名 |
| `limit` | int | 否 | 消息条数 |

### `search_seatalk_messages`
跨群搜索消息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `keyword` | string | 是 | 搜索关键词 |

### `navigate_to_chat`
在 SeaTalk 中导航到指定聊天。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `session_name` | string | 是 | 群名或联系人名 |

### `read_current_chat`
读取当前打开的聊天窗口的消息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `limit` | int | 否 | 消息条数，默认 50 |

### `seatalk_eval`
在 SeaTalk 页面中执行 JavaScript 代码。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `code` | string | 是 | 要执行的 JS 代码 |

### `seatalk_screenshot`
截取 SeaTalk 当前界面的截图。无参数。

### `open_seatalk_link`
在 SeaTalk 中打开链接。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | string | 是 | 要打开的 URL |

### `query_messages_sqlite`
从 SeaTalk 本地 SQLite 数据库查询历史消息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `session_type` | string | 否 | `group`/`single`，默认 `group` |
| `session_name` | string | 是 | 群名或联系人名 |
| `limit` | int | 否 | 消息条数 |

### `query_mentions`
查询最近被 @ 的消息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `hours` | int | 否 | 查询最近多少小时，默认 72 |

### `download_seatalk_image`
下载 SeaTalk 消息中的图片。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `image_url` | string | 是 | 图片 URL |

## 使用示例

在 Cursor Agent 中：

```
读取"SPX数据组"群最近 20 条消息
```

```
搜索 SeaTalk 中包含"数据异常"的消息
```

```
查看最近 24 小时谁 @ 了我
```

## 注意事项

- 需要 SeaTalk 桌面客户端保持运行状态
- CDP 守护进程会自动确保 SeaTalk 以 CDP 模式运行
- `query_messages_sqlite` 从本地数据库读取，可查到更早的历史消息

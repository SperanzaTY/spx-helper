# SeaTalk 批量拉群工具 (seatalk-group)

通过 InfraBot API 批量邀请/移除 SeaTalk 群成员。

## 前提条件

1. 目标群中已添加 `infra-seatalk-bot@shopee.com` 并设为**管理员**
2. 在群中 @InfraBot 获取 Group ID（数字格式，如 `4348248`）
3. 获取 API Token

## 认证

环境变量 `INFRABOT_TOKEN`。

获取方式：https://space.shopee.io/utility/seatalkbot/api-playground → Get API Token

## 配置

在 `~/.cursor/mcp.json` 中添加：

```json
{
  "seatalk-group": {
    "command": "uvx",
    "args": [
      "--from",
      "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/seatalk-group",
      "seatalk-group-mcp"
    ],
    "env": {
      "INFRABOT_TOKEN": "你的Token"
    }
  }
}
```

## 工具列表

### `invite_to_group`
批量邀请成员加入群聊。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `group_id` | int | 是 | SeaTalk 群 ID |
| `emails` | string | 是 | 邮箱列表（支持逗号/分号/换行/空格分隔） |
| `token` | string | 否 | API Token（未设环境变量时传入） |

### `check_group_setup`
检查群是否已正确配置 InfraBot。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `group_id` | int | 是 | SeaTalk 群 ID |
| `token` | string | 否 | API Token |

## 使用示例

在 Cursor Agent 中：

```
帮我把以下同事加入 SeaTalk 群 4348248：
john.doe@shopee.com
jane.smith@shopee.com
```

```
检查群 4348248 是否已配置好 InfraBot
```

## 注意事项

- 每批最多 50 人，超过自动分批，批间间隔 1 秒
- 邮箱格式灵活：支持逗号、分号、换行、空格分隔，自动去重
- `#` 开头的行会被跳过（可作注释）

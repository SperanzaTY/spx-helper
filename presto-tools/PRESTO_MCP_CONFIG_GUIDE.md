# Presto MCP 服务器配置示例

## 快速配置

### 1. 获取你的Personal Token

1. 登录 [DataSuite](https://datasuite.shopee.io)
2. 点击右上角头像 → **Personal Token**
3. 复制你的token

### 2. 在Cursor中配置MCP

打开 `~/.cursor/mcp.json`（如果不存在则创建），添加以下配置：

```json
{
  "mcpServers": {
    "presto-query": {
      "command": "python3",
      "args": [
        "/path/to/presto_mcp_server.py"
      ],
      "env": {
        "PRESTO_PERSONAL_TOKEN": "你的Personal Token",
        "PRESTO_USERNAME": "你的用户名"
      }
    }
  }
}
```

### 3. 配置说明

**必需参数:**
- `PRESTO_PERSONAL_TOKEN`: 你的Personal Token（从DataSuite获取）
- `PRESTO_USERNAME`: 你的用户名（会自动转为邮箱格式）

**可选参数:**
- `PRESTO_QUEUE`: Presto队列，默认 `szsc-adhoc`
  - `szsc-adhoc`: Ad-hoc查询（默认）
  - `szsc-scheduled`: 定时任务
- `PRESTO_REGION`: IDC集群，默认 `SG`
  - `SG`: 新加坡（默认）
  - `US`: 美国

### 4. 完整配置示例

```json
{
  "mcpServers": {
    "presto-query": {
      "command": "python3",
      "args": [
        "/Users/your_username/.cursor/worktrees/SPX_Helper/sri/presto_mcp_server.py"
      ],
      "env": {
        "PRESTO_PERSONAL_TOKEN": "abc123xyz==",
        "PRESTO_USERNAME": "your.name",
        "PRESTO_QUEUE": "szsc-adhoc",
        "PRESTO_REGION": "SG"
      }
    }
  }
}
```

## 方法2: 使用环境变量（不推荐）

如果不想在配置文件中暴露token，可以设置系统环境变量：

```bash
# 在 ~/.zshrc 或 ~/.bash_profile 中添加
export PRESTO_PERSONAL_TOKEN="your_token"
export PRESTO_USERNAME="your_username"
export PRESTO_QUEUE="szsc-adhoc"
export PRESTO_REGION="SG"
```

然后在 `mcp.json` 中只需：

```json
{
  "mcpServers": {
    "presto-query": {
      "command": "python3",
      "args": ["/path/to/presto_mcp_server.py"]
    }
  }
}
```

**注意**: Cursor需要重启才能读取新的环境变量。

## 验证配置

1. **重启Cursor**
2. 打开 **Settings > Tools & MCP**
3. 检查 `presto-query` 是否出现且已启用
4. 在对话中测试：
   ```
   请查询 spx_mart.dim_spx_lm_station_user_configuration_tab_id 表的数据
   ```

## 故障排除

### Token无效

**错误**: `401 Unauthorized`

**解决**:
1. 检查token是否正确复制
2. 确认token没有过期
3. 重新从DataSuite获取token

### 用户名错误

**错误**: `Invalid End-User provided`

**解决**:
1. 确认用户名正确（不需要加@shopee.com后缀）
2. 脚本会自动添加邮箱后缀

### MCP服务器未启动

**检查**:
1. 查看Cursor的MCP日志
2. 确认Python路径正确: `which python3`
3. 确认脚本路径正确
4. 确认已安装依赖: `pip3 install mcp requests`

### 配置文件路径

不同系统的配置文件位置：
- **macOS**: `~/.cursor/mcp.json`
- **Linux**: `~/.cursor/mcp.json`
- **Windows**: `%USERPROFILE%\.cursor\mcp.json`

## 安全建议

1. **不要分享你的Personal Token** - 这是你的个人凭证
2. **定期更换Token** - 在DataSuite中可以重新生成
3. **不要将配置文件提交到Git** - 添加到 `.gitignore`
4. **使用团队账号** - 如果是团队使用，考虑创建专门的服务账号

## 更新Token

如果需要更新token：

1. 在DataSuite中生成新token
2. 更新 `mcp.json` 中的 `PRESTO_PERSONAL_TOKEN`
3. 重启Cursor

## 共享给团队

如果要分享给团队成员：

1. **分享脚本文件**: `presto_mcp_server.py`
2. **分享配置模板**: 本文档的配置示例
3. **让每个人配置自己的token和用户名**
4. **不要共享配置文件** - 每个人有不同的token

---

**🔐 记住：永远不要在代码或配置文件中硬编码token！**

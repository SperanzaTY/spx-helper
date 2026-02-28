# 🤝 如何分享Presto MCP工具给团队

## 分享内容清单

### ✅ 需要分享的文件

1. **MCP服务器**: `presto_mcp_server.py`
2. **配置模板**: `mcp_config_template.json`
3. **配置指南**: `PRESTO_MCP_CONFIG_GUIDE.md`
4. **使用文档**: `PRESTO_MCP_README.md`
5. **安装脚本** (可选): `install_mcp.sh`

### ❌ 不要分享的文件

1. **你的mcp.json配置** - 包含你的personal token
2. **任何包含token的文件**

## 方式1: 通过Git分享（推荐）

### 1. 将文件提交到仓库

```bash
cd /path/to/SPX_Helper/sri

# 只添加工具相关文件
git add presto_mcp_server.py
git add mcp_config_template.json
git add PRESTO_MCP_*.md
git add install_mcp.sh

git commit -m "feat: 添加Presto MCP工具"
git push
```

### 2. 团队成员获取

```bash
git pull origin main

# 进入目录
cd sri

# 运行安装脚本（会要求输入token和用户名）
./install_mcp.sh
```

## 方式2: 直接分享文件

### 1. 创建分享包

```bash
cd /path/to/SPX_Helper/sri

# 创建分享目录
mkdir presto-mcp-share
cp presto_mcp_server.py presto-mcp-share/
cp mcp_config_template.json presto-mcp-share/
cp PRESTO_MCP_*.md presto-mcp-share/
cp install_mcp.sh presto-mcp-share/

# 打包
tar -czf presto-mcp-tool.tar.gz presto-mcp-share/
```

### 2. 分享说明

发送 `presto-mcp-tool.tar.gz` 给团队成员，并附带说明：

```
嘿，这是Presto MCP查询工具！

安装步骤:
1. 解压文件: tar -xzf presto-mcp-tool.tar.gz
2. 进入目录: cd presto-mcp-share
3. 安装依赖: pip3 install mcp requests
4. 配置你的token（详见 PRESTO_MCP_CONFIG_GUIDE.md）
5. 重启Cursor

使用方法:
直接在Cursor对话中说 "查询xxx表的数据" 即可！
```

## 方式3: 通过内部文档平台

### 1. 创建文档页面

在公司文档平台（如Confluence）创建页面，包含：

1. **工具介绍**
2. **安装步骤**
   - 从Git仓库获取代码
   - 安装依赖
   - 获取Personal Token的步骤（带截图）
   - 配置Cursor
3. **使用示例**
4. **常见问题**

### 2. 附件

- 上传 `presto_mcp_server.py`
- 上传配置模板
- 上传文档

## 给团队成员的配置指南

### 快速开始（3步）

**第1步: 获取代码**

```bash
# 从Git仓库获取
git clone <repo_url>
cd SPX_Helper/sri

# 或直接下载文件到任意目录
```

**第2步: 获取你的Personal Token**

1. 访问 https://datasuite.shopee.io/dataservice/ds_api_management
2. 点击页面左上角的三个横线菜单（☰） → Personal Token
3. 复制token

**第3步: 配置Cursor**

编辑 `~/.cursor/mcp.json`，添加：

```json
{
  "mcpServers": {
    "presto-query": {
      "command": "python3",
      "args": [
        "/你的路径/presto_mcp_server.py"
      ],
      "env": {
        "PRESTO_PERSONAL_TOKEN": "你的token",
        "PRESTO_USERNAME": "你的用户名"
      }
    }
  }
}
```

重启Cursor，完成！

## 常见问题 (FAQ)

### Q: Token从哪里获取？

A: DataSuite → 左上角三个横线菜单（☰）→ 获取Personal Token

### Q: Token会过期吗？

A: Token长期有效，但建议定期更换

### Q: 多人可以用同一个token吗？

A: **不建议**。每个人应该用自己的token，这样：
- 更安全
- 便于审计
- 避免配额冲突

### Q: 如何更新工具版本？

A: 
```bash
git pull  # 获取最新代码
# 重启Cursor
```

### Q: 支持哪些查询？

A: 只支持只读SELECT查询，不支持SHOW/INSERT/UPDATE等

### Q: 查询失败怎么办？

A: 
1. 检查token是否有效
2. 检查SQL语法
3. 查看Cursor的MCP日志
4. 使用 `simple_query.py` 单独测试

## 安全提醒

### 对团队成员说明

1. **保护Token**
   - Token是你的个人凭证
   - 不要分享给他人
   - 不要提交到Git

2. **配置文件**
   - `~/.cursor/mcp.json` 是本地配置
   - 不要分享这个文件
   - 不要截图包含token的配置

3. **定期更换**
   - 建议每季度更换token
   - 如果泄露立即重新生成

## 团队维护

### 工具更新流程

1. **改进工具**
   ```bash
   # 修改 presto_mcp_server.py
   git commit -m "feat: 改进xxx功能"
   git push
   ```

2. **通知团队**
   ```
   @all Presto MCP工具已更新！
   新功能: xxx
   请运行: git pull && 重启Cursor
   ```

3. **收集反馈**
   - 创建反馈渠道（如Slack频道）
   - 记录常见问题
   - 持续改进

### 技术支持

建议创建：
- 专门的Slack/Teams频道
- FAQ文档
- 问题反馈表单

## 示例分享消息

```
📢 新工具发布：Presto MCP查询工具

🎯 功能:
在Cursor中直接让AI查询Presto数据库！

📦 安装:
1. git pull
2. cd SPX_Helper/sri
3. 阅读 PRESTO_MCP_CONFIG_GUIDE.md
4. 配置你的token
5. 重启Cursor

💡 使用:
直接对AI说："查询xxx表的数据"

📖 文档:
- 配置指南: PRESTO_MCP_CONFIG_GUIDE.md
- 使用手册: PRESTO_MCP_README.md

🤝 问题反馈:
#presto-mcp-tool 频道
```

---

**记住：永远不要分享包含token的配置文件！**

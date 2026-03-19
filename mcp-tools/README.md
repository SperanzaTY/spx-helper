# MCP 工具集

SPX Helper 配套的 Cursor MCP 工具，用于 API 溯源、Presto/Spark/CK 查询等。

📋 **推荐与安装**：参见 [MCP_RECOMMENDATIONS.md](MCP_RECOMMENDATIONS.md) — 含自研 MCP、推荐外部 MCP（如 MCP Atlassian）及完整安装示例。

## 安装方式

### 方式一：GitLab 链接安装（推荐，免克隆）

使用 [uv](https://docs.astral.sh/uv/) 通过 GitLab 链接直接运行，无需 `git clone`。在 `~/.cursor/mcp.json` 中配置：

```json
{
  "mcpServers": {
    "ck-query": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/ck-query",
        "ck-query-mcp"
      ]
    },
    "presto-query": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/presto-query",
        "presto-query-mcp"
      ],
      "env": {
        "PRESTO_PERSONAL_TOKEN": "你的Token",
        "PRESTO_USERNAME": "你的用户名"
      }
    },
    "api-trace": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/api-trace",
        "api-trace-mcp"
      ],
      "env": {
        "PRESTO_PERSONAL_TOKEN": "你的Token",
        "PRESTO_USERNAME": "你的用户名"
      }
    },
    "spark-query": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://git.garena.com/tianyi.liang/spx-helper@release#subdirectory=mcp-tools/spark-query",
        "spark-query-mcp"
      ],
      "env": {
        "LIVY_USERNAME": "DMP用户名",
        "LIVY_PASSWORD": "DMP密码"
      }
    }
  }
}
```

**前置条件**：需安装 [uv](https://docs.astral.sh/uv/install/)（`curl -LsSf https://astral.sh/uv/install.sh | sh`）

**版本说明**：示例中已固定使用 `@release` 分支，确保团队统一使用稳定版。若需开发版可去掉 `@release` 使用默认分支。

**GitLab 说明**：团队推荐使用 GitLab 链接（需内网/VPN 访问 git.garena.com）。若无法访问 GitLab，可改用 GitHub：`git+https://github.com/SperanzaTY/spx-helper@release#subdirectory=mcp-tools/ck-query`

### 方式二：本地路径安装（克隆后）

克隆仓库后，在 `mcp.json` 中配置本地脚本路径，见各 MCP 目录下的 `mcp_config_template.json`。

## 凭证获取指引

| MCP | 凭证来源 | 获取路径 |
|-----|----------|----------|
| **presto-query** | Data Suite API 管理 | 访问 [DataSuite API 管理](https://datasuite.shopee.io/dataservice/ds_api_management) → 左上角 ☰ → 获取 Personal Token |
| **spark-query** | Data Suite 个人中心 | 访问 [Data Suite](https://datasuite.shopee.io) → **个人中心** → **Profile** → BigData Account / BigData Account Password（点击 View 显示） |
| **api-trace** | 同 presto-query | 使用与 Presto 相同的 `PRESTO_PERSONAL_TOKEN`、`PRESTO_USERNAME` |
| **ck-query** | 团队配置 | 密码由团队统一管理，配置在 `ck_mcp_server.py` 中 |

## 工具列表

| 目录 | 说明 | 文档 |
|------|------|------|
| presto-query | Presto 查询 | [README](presto-query/README.md) |
| spark-query | Spark SQL 查询（Livy） | [README](spark-query/README.md) |
| ck-query | ClickHouse 查询 | 见 `ck_mcp_server.py` 注释 |
| api-trace | API 血缘溯源 | 见 `api_trace_server.py` 注释 |

## 配置位置

MCP 配置在 `~/.cursor/mcp.json`，新增或修改后需在 Cursor 设置中**关闭再开启**对应 MCP 以刷新。

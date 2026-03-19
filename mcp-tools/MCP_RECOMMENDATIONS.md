# MCP 推荐与安装指南

本文档汇总 SPX Helper 项目相关及推荐的外部 MCP，供团队参考和安装。

## 配置位置

MCP 配置在 `~/.cursor/mcp.json`，新增或修改后需在 Cursor 设置中**关闭再开启**对应 MCP 以刷新。

---

## 一、SPX Helper 自研 MCP

项目内置，用于 API 溯源、数据查询等。详见 [README.md](README.md)。

| MCP | 用途 | 安装方式 |
|-----|------|----------|
| **ck-query** | ClickHouse 查询 | [GitLab 链接](README.md#方式一gitlab-链接安装推荐免克隆) / 本地路径 |
| **presto-query** | Presto 查询 | 同上 |
| **api-trace** | API 血缘溯源 | 同上 |
| **spark-query** | Spark SQL（Livy）查询 | 同上 |
| **worklens** (im-context) | 问题上下文采集 | 本地路径（无 uvx 版本） |

### 凭证获取

| MCP | 凭证 | 获取路径 |
|-----|------|----------|
| presto-query / api-trace | PRESTO_PERSONAL_TOKEN, PRESTO_USERNAME | [DataSuite API 管理](https://datasuite.shopee.io/dataservice/ds_api_management) → ☰ → 获取 Personal Token |
| spark-query | LIVY_USERNAME, LIVY_PASSWORD | [Data Suite](https://datasuite.shopee.io) → 个人中心 → Profile → BigData Account |
| ck-query | 团队统一配置 | 见 `ck_mcp_server.py` |

---

## 二、推荐外部 MCP

### 1. MCP Atlassian（Confluence / Jira）

连接 Atlassian Confluence 和 Jira，支持**搜索、读取链接、创建、更新**页面。已在 confluence.shopee.io 验证可用。

**能力**：
- **搜索**：`confluence_search` — 按关键词或 CQL 搜索
- **读取**：`confluence_get_page` — 从 URL（提取 pageId）或 title+space_key 读取
- **创建**：`confluence_create_page` — 新建页面（支持 Markdown）
- **更新**：`confluence_update_page` — 修改已有页面

**安装方式**：`uvx`（需先安装 [uv](https://docs.astral.sh/uv/install/)）

```json
"mcp-atlassian": {
  "command": "/Users/你的用户名/.local/bin/uvx",
  "args": ["mcp-atlassian"],
  "env": {
    "CONFLUENCE_URL": "https://confluence.shopee.io",
    "CONFLUENCE_PERSONAL_TOKEN": "你的Confluence_PAT",
    "CONFLUENCE_SSL_VERIFY": "false"
  }
}
```

**配置说明**：
- `command`：若 Cursor 找不到 `uvx`，改用绝对路径（如 `~/.local/bin/uvx` 的展开）
- `CONFLUENCE_SSL_VERIFY`：自建 Confluence 证书不被信任时设为 `"false"`
- 若同时使用 Jira，补充 `JIRA_URL`、`JIRA_PERSONAL_TOKEN`、`JIRA_SSL_VERIFY`

**凭证获取**：
- Confluence PAT：个人头像 → Profile → [Personal Access Tokens](https://confluence.shopee.io/plugins/personalaccesstokens/usertokens.action)

**文档**：https://mcp-atlassian.soomiles.com/docs/installation

---

### 2. DrawIO MCP（架构图 / 流程图 / 时序图）

用自然语言生成 draw.io 图表（架构图、流程图、时序图），支持 mxGraphModel XML，可在浏览器中实时预览、继续编辑、导出 PNG/SVG。

**能力**：`start_session` 开启会话并打开浏览器 → `create_new_diagram` 从 XML 创建图表 → `edit_diagram` 修改 → `export_diagram` 导出。

**安装方式**：需 Node.js（`brew install node`），npx 自动拉取。

**注意**：Cursor 作为 GUI 启动时 PATH 不含 `/usr/local/bin`，直接用 `"command": "npx"` 会报 `spawn npx ENOENT` 或 `env: node: No such file or directory`。需使用 **npx 绝对路径 + env.PATH**：

```json
"drawio": {
  "command": "/usr/local/bin/npx",
  "args": ["--yes", "@next-ai-drawio/mcp-server@latest"],
  "env": {
    "PATH": "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  }
}
```

若 Node 由 Homebrew 安装在 Apple Silicon 上，`command` 改为 `/opt/homebrew/bin/npx`。

**使用示例**：「画一个订单处理流程图」「生成 XXX 系统的架构图」

**文档**：https://github.com/DayuanJiang/next-ai-draw-io

---

### 3. Google Sheets MCP（表格读写）

AI 直接读写 Google Sheets：读取单元格/公式、更新内容、批量操作、创建工作表、新建表格。

**注意**：仅支持 Google Sheets，不支持 Google Docs。

**安装方式**：`uvx` + Google Cloud 服务账号

1. [Google Cloud Console](https://console.cloud.google.com/) 创建项目（Organization 选 `shopeemobile.com`）
2. 启用 **Google Sheets API**、**Google Drive API**
3. 创建服务账号 → 生成 JSON 密钥并下载
4. 将目标 Drive 文件夹或 Sheet 共享给服务账号邮箱
5. 获取文件夹 ID（URL 中 `folders/<FOLDER_ID>`）

```json
"google-sheets": {
  "command": "uvx",
  "args": ["mcp-google-sheets"],
  "env": {
    "SERVICE_ACCOUNT_PATH": "/path/to/your-service-account.json",
    "DRIVE_FOLDER_ID": "你的Google Drive文件夹ID"
  }
}
```

**使用示例**：「读取项目进度表」「把 A1 更新为已完成」「在表里添加一行任务」

**文档**：https://github.com/xing5/mcp-google-sheets

---

### 4. cursor-ide-browser（Cursor 内置）

操控浏览器：导航、截图、点击、抓取网络请求等。适用于前端调试、自动化测试。

**安装方式**：Cursor 内置，在 MCP 设置中启用即可。

```json
"cursor-ide-browser": {
  "enabled": true
}
```

---

## 三、完整 mcp.json 示例

以下为合并后的配置示例（**请将占位符替换为实际凭证；`mcp-atlassian` 的 command 需改为本机 uvx 路径；`drawio` 的 command 需改为本机 npx 路径，Apple Silicon 用 `/opt/homebrew/bin/npx`**）：

```json
{
  "mcpServers": {
    "cursor-ide-browser": {
      "enabled": true
    },
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
    },
    "im-context": {
      "command": "python3",
      "args": ["项目路径/mcp-tools/worklens/worklens_mcp_server.py"]
    },
    "mcp-atlassian": {
      "command": "/Users/你的用户名/.local/bin/uvx",
      "args": ["mcp-atlassian"],
      "env": {
        "CONFLUENCE_URL": "https://confluence.shopee.io",
        "CONFLUENCE_PERSONAL_TOKEN": "你的Confluence_PAT",
        "CONFLUENCE_SSL_VERIFY": "false",
        "JIRA_URL": "https://jira.shopee.io",
        "JIRA_PERSONAL_TOKEN": "你的Jira_PAT（可选）"
      }
    },
    "drawio": {
      "command": "/usr/local/bin/npx",
      "args": ["--yes", "@next-ai-drawio/mcp-server@latest"],
      "env": {
        "PATH": "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
      }
    },
    "google-sheets": {
      "command": "uvx",
      "args": ["mcp-google-sheets"],
      "env": {
        "SERVICE_ACCOUNT_PATH": "/path/to/service-account.json",
        "DRIVE_FOLDER_ID": "你的Google Drive文件夹ID"
      }
    }
  }
}
```

---

## 四、其他可探索的 MCP

| 名称 | 用途 | 说明 |
|------|------|------|
| Claude-Mem | 跨会话持久记忆 | https://docs.claude-mem.ai/cursor |
| DataForge Confluence | 内部 Confluence 读/写 | 若 mcp-atlassian 无法满足，可考虑内部 DataForge MCP（见内部文档） |
| MCP Registry | 官方 MCP 列表 | 在 Cursor 中搜索 "MCP" 或浏览社区推荐 |

---

## 五、更新记录

| 日期 | 变更 |
|------|------|
| 2026-03 | DrawIO MCP 安装说明：修正 npx ENOENT / node 找不到问题，改用绝对路径 + env.PATH；更正能力描述为 start_session/create_new_diagram 等 |
| 2026-03 | 更新 mcp-atlassian：加入 confluence.shopee.io 实测可用配置（uvx 绝对路径、CONFLUENCE_SSL_VERIFY），补充能力说明 |
| 2026-03 | 移除 DataForge 主推描述，改列入「其他可探索」 |
| 2026-03 | 新增 MCP Atlassian 推荐及安装说明 |
| 2026-03 | 整理自研 MCP 与推荐外部 MCP 文档 |

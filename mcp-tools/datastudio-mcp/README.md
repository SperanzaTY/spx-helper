# DataStudio MCP 服务器

一个用于 Cursor 编辑器的 MCP 服务器，可以在 Cursor 中直接管理 DataStudio 资产。

## 功能

- 📥 **批量下载资产到本地**：从 DataStudio 批量复制资产到本地文件系统（自动保存配置文件到 conf 目录）
- 📄 **同步单个文件**：同步指定文件从 DataStudio 到本地（包括内容和配置）
- 📤 **创建文件**：将本地文件上传到 DataStudio 创建新资产
- 🔄 **更新文件**：更新 DataStudio 中已存在的资产
- 🔓 **解锁文件**：解锁被锁定的 DataStudio 文件
- 📋 **列出资产**：列出指定路径下的所有资产
- 🍪 **刷新 Cookie**：自动从浏览器刷新认证 Cookie
- 🌍 **多环境支持**：自动支持 Shopee DataSuite 和 Lenteradana DataSuite（根据project_code自动判断环境）

支持路径类型：`//Workflows/`、`//Scheduled Tasks/`、`//Manual Tasks/`、`//Templates/`、`//Resources/`

---

## 环境要求

- **Python:** 3.9 或更高版本
- **操作系统:** macOS
- **浏览器:** Chrome（需登录 DataStudio）
- **认证:** 自动通过 [chrome-auth](../chrome-auth/README.md) 获取 Chrome Cookie，无需手动配置 Token

---

## 安装和配置

### 1. 安装 chrome-auth 共享库

```bash
cd /path/to/spx-helper/mcp-tools/chrome-auth
pip install -e .
```

### 2. 安装 datastudio-mcp 依赖

```bash
cd /path/to/spx-helper/mcp-tools/datastudio-mcp
pip install fastmcp PyJWT cryptography python-dateutil requests browser-cookie3
```

### 3. 配置 Cursor

编辑 `~/.cursor/mcp.json`，添加以下内容：

```json
{
  "mcpServers": {
    "datastudio-mcp": {
      "command": "python3",
      "args": ["-m", "datastudio_mcp.mcp_server"],
      "cwd": "/path/to/spx-helper/mcp-tools/datastudio-mcp",
      "env": {
        "DATASTUDIO_BASE_PATH": "/path/to/your/datastudio_code",
        "DATASTUDIO_PROJECTS": "project1,project2",
        "PYTHONPATH": "/path/to/spx-helper/mcp-tools/datastudio-mcp"
      }
    }
  }
}
```

**环境变量说明：**

1. **DATASTUDIO_BASE_PATH**（必需）：本地 DataStudio 资产的根路径
   - 示例：`/Users/myname/datastudio_code`

2. **DATASTUDIO_PROJECTS**（必需）：要管理的项目列表（逗号分隔）
   - 示例：`spx_mart,credit_mart,credit_fund`
   - `ldn` 项目自动使用 Lenteradana 环境，其他使用 Shopee 环境

3. **目录结构示例**：
   ```
   /Users/myname/datastudio_code/
   ├── spx_mart/
   │   ├── Templates/
   │   ├── Workflows/
   │   └── ScheduledTasks/
   └── credit_fund/
       ├── Templates/
       └── ...
   ```

### 4. 重启 Cursor

完全退出 Cursor（macOS: `Cmd + Q`），然后重新打开。

---

## 使用示例

在 Cursor 中输入以下指令：

### 1. 复制资产到本地
```
复制datastudio内容到本地，项目 credit_promotion, 目录：//Templates/credit_promotion_dwd/
```

**说明：**
- 本地文件会保存到：`{DATASTUDIO_BASE_PATH}/{project_code}/{任务类型目录}/{子路径}`
- 对于上面的示例：`{DATASTUDIO_BASE_PATH}/credit_promotion/Templates/credit_promotion_dwd/`
- 其中 `DATASTUDIO_BASE_PATH` 是在 `mcp.json` 中配置的基础路径
- 系统会自动保持 DataStudio 的目录结构
- datastudio配置信息会保存在同级的 `conf/` 子目录中

### 2. 同步单个文件到本地
```
同步文件到本地，文件路径：//Templates/test/test_spark1.sql，项目：credit_fund
```

**说明：**
- 自动根据 PATH_MAPPING 配置确定本地保存路径
- 同时同步文件内容和配置
- 会覆盖本地已存在的文件

### 3. 创建新文件到 DataStudio
```
创建新文件到datastudio，文件路径：/Users/jialiang.nie/CurosrProject/credit_fund/Templates/test/test.sql，项目：credit_fund
```

**说明：**
- 文件必须在 `DATASTUDIO_BASE_PATH` 配置的目录中
- 成功后会在同级目录创建 `conf/` 目录并保存datastudio配置信息

### 4. 更新已存在的文件
```
更新datastudio文件，文件路径：/Users/jialiang.nie/CurosrProject/credit_fund/Templates/test/test.sql，项目：credit_fund
```

### 5. 解锁文件
```
解锁datastudio文件，asset_id：10416385，项目：credit_fund
```

**说明：**
- Asset ID 可从本地 `conf/` 目录的 JSON 配置文件中的 `assetId` 字段获取
- 用于解锁被其他用户或会话锁定的文件
- 解锁后可能会丢失其他用户未保存的修改，请谨慎使用


---

## 注意事项

### ⚠️ 资产类型限制

复制资产到本地的功能支持根据不同资产类型自动添加扩展名（如 `.sql`、`.py`、`.ipynb` 等），但**仅支持有文本内容的资产**。

### 📁 文件上传要求

**创建新文件（create_file）：**
- 文件必须在 `DATASTUDIO_BASE_PATH` 配置的目录中
- 需要指定正确的 `asset_type`（如 41=Template Spark SQL）
- 如果文件已存在于 DataStudio，会报错并提示使用 `update_file`
- 成功后会在同级目录创建 `conf/` 目录并保存配置文件

**更新文件（update_file）：**
- 文件必须已存在于 DataStudio
- 需要本地存在对应的 `conf/` 配置文件（通过 `copy_assets_to_local` 获取）
- 如果文件不存在，会报错并提示使用 `create_file`
- ⚠️ **重要限制**：
  - **Template 绑定检查**：非 Template 任务（如 Workflow、Scheduled Task）且被 Template 绑定时无法更新
    - 系统检测 `assetRoot` 和 `templateId` 字段
    - 如果检测到 Template 绑定，会报错并提示解除绑定或直接修改 Template 资产
    - Template 资产本身（assetRoot=6）不受此限制
  - **版本一致性检查**：本地配置的 `currentVersion` 必须与 DataStudio 一致
    - 如果版本不一致，会报错并提示先同步最新配置
    - 防止覆盖其他人的修改
- ✅ **自动同步**：更新成功后会自动同步最新配置到本地 `conf/` 文件

### 🔐 Cookie 过期处理

**问题：** 复制资产时失败或提示权限错误

**解决方法：**
1. **Shopee 环境项目**：在浏览器中打开 `https://datasuite.shopee.io`，访问你要操作的项目和资产目录
2. **LDN 环境项目**：在浏览器中打开 `https://datasuite.di.lenteradana.co.id`，访问你要操作的项目和资产目录
3. 确保在浏览器中刷新页面，让浏览器更新 Cookie
4. MCP 会自动从浏览器获取最新的 Cookie，无需手动操作

这样可以刷新你的认证 token，解决权限过期的问题。

---

## 联系方式

- GitLab: https://git.garena.com/shopee/seamoney-data/data-mart/datastudio_mcp
- Issues: https://git.garena.com/shopee/seamoney-data/data-mart/datastudio_mcp/-/issues


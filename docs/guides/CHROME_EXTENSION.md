# Chrome 扩展使用指南

> SPX Helper Chrome 扩展 — Shopee 大数据开发日常工具箱（当前版本 v3.6.8）

---

## 功能一览

| 功能                    | 说明                                                   |
| ----------------------- | ------------------------------------------------------ |
| **API 数据溯源**  | 自动拦截页面 API 请求，记录参数/响应，支持 AI 血缘分析 |
| **快速链接**      | 一键访问 Flink/Spark/HDFS/Kafka/DataSuite 等平台       |
| **日程管理**      | Google Calendar 集成 + 待办事项看板                    |
| **Mermaid 图表**  | 流程图/时序图/ER图渲染，支持高清导出                   |
| **HTTP 请求测试** | 支持多种请求方式和认证方式                             |
| **SQL 格式化**    | SQL 格式化/压缩/关键字转换                             |
| **时区转换**      | 支持 Shopee 各区域时区快速转换                         |
| **文本差异对比**  | VS Code 风格的字符级差异对比                           |
| **正则测试**      | 实时匹配、高亮结果                                     |
| **独立窗口模式**  | 常驻桌面，窗口位置自动保存                             |

---

## 安装

```bash
# GitLab（主仓库，推荐）：
git clone https://git.garena.com/tianyi.liang/spx-helper.git
# 或 GitHub 镜像：
# git clone https://github.com/SperanzaTY/spx-helper.git
```

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角 **"开发者模式"**
3. 点击 **"加载已解压的扩展程序"**
4. 选择仓库中的 `spx-helper/chrome-extension/` 目录
5. 点击工具栏图标即可使用

---

## 更新

```bash
cd spx-helper
git pull gitlab release
# 如果使用 GitHub 镜像：git pull origin release
```

然后到 `chrome://extensions/` 点击扩展卡片上的 **刷新** 按钮即可。

---

## 开发

修改 `chrome-extension/` 下的代码后，到 `chrome://extensions/` 点击刷新即可热加载。

### 目录结构

```
chrome-extension/
├── manifest.json        # Chrome MV3 扩展配置
├── background.js        # Service Worker（消息中枢）
├── content.js           # 内容脚本（API 拦截 UI）
├── injected.js          # 注入脚本（fetch/XHR Hook）
├── popup.html / popup.js  # 扩展主界面
├── styles.css           # 扩展样式
├── images/              # 扩展图标
├── station_query/       # 站点查询工具（Python 后端）
└── ck_sync/             # ClickHouse DDL 同步工具
```

---

## 版本

当前版本：v3.6.8（与 `chrome-extension/manifest.json` 及项目整体版本号同步）

**v3.6.8**：manifest 与根目录发版号 PATCH 同步；扩展功能代码无变更，拉取后仅需在 `chrome://extensions/` 刷新扩展以同步版本显示。

**v3.6.6**：manifest 与根目录发版号 PATCH 同步；扩展功能代码无变更，拉取后仅需在 `chrome://extensions/` 刷新扩展以同步版本显示。

**v3.6.5**：manifest 与根目录发版号 PATCH 同步；扩展功能代码无变更，拉取后仅需在 `chrome://extensions/` 刷新扩展以同步版本显示。

**v3.6.4**：manifest 与根目录发版号 PATCH 同步；扩展功能代码无变更，拉取后仅需在 `chrome://extensions/` 刷新扩展以同步版本显示。

**v3.6.3**：manifest 与根目录发版号 PATCH 同步；扩展功能代码无变更，拉取后仅需在 `chrome://extensions/` 刷新扩展以同步版本显示。

**v3.6.2**：manifest 与根目录发版号 PATCH 同步；扩展功能代码无变更，拉取后仅需在 `chrome://extensions/` 刷新扩展以同步版本显示。

**v3.5.21**：manifest 与根目录发版号 PATCH 同步；扩展功能代码无变更，拉取后仅需在 `chrome://extensions/` 刷新扩展以同步版本显示。

**v3.5.20**：manifest 与根目录发版号 PATCH 同步；扩展功能代码无变更，拉取后仅需在 `chrome://extensions/` 刷新扩展以同步版本显示。

**v3.5.19**：manifest 与根目录发版号 PATCH 同步；扩展功能代码无变更，拉取后仅需在 `chrome://extensions/` 刷新扩展以同步版本显示。

**v3.5.18**：manifest 与根目录发版号 PATCH 同步；扩展功能代码无变更，拉取后仅需在 `chrome://extensions/` 刷新扩展以同步版本显示。

**v3.5.15**：manifest 与根目录发版号 PATCH 同步；扩展功能代码无变更，拉取后仅需在 `chrome://extensions/` 刷新扩展以同步版本显示。

---

## 常见问题

**扩展图标灰色/不工作？**
- 确认已开启"开发者模式"
- 确认加载的是 `chrome-extension/` 目录而非项目根目录
- 检查 Chrome 控制台（F12）是否有报错

**API 拦截不生效？**
- 刷新目标页面（扩展加载后需刷新才能注入 content script）
- 检查 `manifest.json` 中的 `content_scripts.matches` 是否覆盖目标域名

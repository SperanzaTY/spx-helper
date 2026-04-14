# spx-bug-trace / confluence

本目录存放 **可直接复制到 Confluence 正文** 的 Markdown 文稿（长模板、清单、修复方案），与仓库 `docs/investigations/` 下的单次排查过程文档分工如下：

| 路径 | 用途 |
|------|------|
| `docs/investigations/*.md` | 单次案例：现象、SQL、证据链、结论 |
| `confluence/*.md` | 可复用清单：跨表、跨环境、给多方执行的修复方案 |

当前文件：

| 文件 | 说明 |
|------|------|
| [TEST_CK_LIVE_TO_TEST_SYNC_TABLE_FIX_PLAN.md](./TEST_CK_LIVE_TO_TEST_SYNC_TABLE_FIX_PLAN.md) | Live `spx_mart_manage_app` → Test `spx_mart_pub` CK 同步失败逐表修复与验收 |

**已发布 Confluence 页（与上文 Markdown 对齐）**  
https://confluence.shopee.io/pages/viewpage.action?pageId=3160657626  

父目录（历史问题排查）：https://confluence.shopee.io/pages/viewpage.action?pageId=3105880558  

后续修订：在 Confluence 内直接编辑，或使用 `confluence_update_page(page_id=3160657626, ...)` 与本地 Markdown 对齐。

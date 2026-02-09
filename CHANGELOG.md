# SPX Helper - Changelog

## v2.11.0 (2025-02-09)

### 🎉 API 溯源工具重大增强

基于前端代码追溯最佳实践，新增以下功能：

#### 新增功能
1. **请求参数记录** 🆕
   - 自动捕获 API 请求体（Request Payload）
   - 记录请求头（Request Headers）
   - 支持 JSON 和文本格式

2. **调用栈追踪** 🆕
   - 记录 API 调用的前 5 层调用栈
   - 快速定位 API 调用发起位置
   - 类似 Chrome DevTools 的 Initiator 功能

3. **React Table 组件拦截** 🆕
   - 自动 Hook `React.createElement`
   - 捕获所有带有 `columns` 的 Table 组件
   - 提取 UI 列配置（title, dataIndex, key 等）

4. **UI → API 字段映射分析** 🆕
   - 自动匹配 UI 字段与 API 字段
   - 识别三类字段：
     - ✅ 匹配字段（UI 和 API 都有）
     - 🟡 API 独有字段（未在 UI 显示）
     - 🔴 UI 独有字段（计算字段）
   - 计算匹配率

5. **映射结果导出** 🆕
   - 支持 CSV 格式导出
   - 支持 JSON 格式导出
   - 包含完整的映射关系和统计信息

#### 使用场景
- 🐛 调试 UI 数据显示问题
- ♻️ 前端代码重构（发现冗余字段）
- 📝 新接口开发（生成字段文档）
- ⚡ 性能优化（减少不必要的 API 字段）

#### 技术细节
- **运行时拦截**：通过 Hook `fetch`、`XMLHttpRequest` 和 `React.createElement` 实现
- **静态分析**：自动提取 Table columns 配置
- **智能匹配**：基于字段名自动关联 UI 和 API
- **无需 LLM**：完全基于工程化的静态分析技术

#### 文件变更
- `injected.js`: 新增 React Hook 和请求参数/调用栈记录
- `content.js`: 新增字段映射分析逻辑
- `popup.js`: 新增映射结果展示和导出功能
- `popup.html`: 新增字段映射查看器 UI
- `API_TRACKER_ENHANCEMENT.md`: 详细功能文档

---

## v2.10.0 (2025-01-XX)

### FMS 快速入口
- 新增 FMS 快速入口（10 市场 × 5 环境）

### API 血缘查询工具
- 支持 API → 表、表 → API 双向查询
- 模糊搜索
- 多环境筛选
- 详情下钻
- Dynamic Where 条件可视化
- 5分钟结果缓存
- DS ID 映射显示

### 工具分类管理
- 折叠式分类菜单
- 通用工具 vs App 工具

### 独立窗口模式
- 可拖动、可调整大小
- 点击网页不自动关闭

---

## v2.9.1 及更早版本

详见 Git 历史记录。

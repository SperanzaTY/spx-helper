# SeaTalk Agent 内置更新体验问题 — 复现说明（v3.1.1 空发版）

## 本版性质

- **基线**：与 **v3.1.0** 功能一致（发版时自 `release` 分支仅抬版本号）。
- **v3.1.1**：仅为版本号 + 本文档 + README 条目，**不包含** `seatalk-agent/src`、`inject/` 等任何业务代码修改。
- **目的**：同事在 MR 合并后可在统一版本号下复现与优化「检查更新慢、体感卡顿、更新后状态提示」等体验。

## 建议复现场景

1. **检查更新耗时**：面板内「检查更新」从点击到结果展示的时间；底层含 `git fetch origin release` 等。
2. **与远端关系**：记录本地 `release` 相对 `origin/release` 的领先/落后提交数，区分网络慢与逻辑阻塞。
3. **完整更新流程**（安全分支）：进度日志、进程重启、是否通过 `npm start` / `seatalk` 启动。

## 接手时可改动方向（不在本空发版中）

更新检查异步与超时提示、`git` 策略、加载态与错误展示、用户指南中的推荐启动方式说明。

## 版本号文件

| 文件 | 说明 |
|------|------|
| `chrome-extension/manifest.json` | 内置更新对比的权威版本 |
| `seatalk-agent/package.json` | 与 manifest 对齐 |
| 根目录 `package.json` | 与 manifest 对齐 |

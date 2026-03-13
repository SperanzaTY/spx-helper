# 分支策略

## 分支说明

| 分支 | 用途 |
|------|------|
| **developer** | 开发者分支，日常开发、小步提交 |
| **release** | 最新版本，从 developer 合并，测试通过后发布 |
| **main** | 稳定版本，从 release 合并，生产环境 |

## 流程

```
developer → release → main
```

1. **日常开发**：在 `developer` 分支修改、提交、推送
2. **发布**：合并 `developer` → `release`，推送 release
3. **稳定版**：合并 `release` → `main`，推送 main

## 常用命令

```bash
# 日常开发（在 developer）
git checkout developer
git add ...
git commit -m "..."
git push gitlab developer && git push origin developer

# 发布到 release
git checkout release
git merge developer -m "Merge developer into release"
git push gitlab release && git push origin release

# 稳定版更新 main
git checkout main
git merge release -m "Merge release into main"
git push gitlab main && git push origin main
```

# Git 工作流规范

# Git 工作流规范

## 🌳 分支策略（修正版）

### 主要分支

#### `main` 分支 🔒
- **作用**: 稳定的生产版本分支
- **稳定性**: 高度稳定，随时可以打包发布
- **保护**: 🔒 严格保护，只接受来自 release 的合并
- **标签**: 每次合并后打 tag（如 v2.14.0）
- **特点**: 始终保持可发布状态

#### `release` 分支 🚀
- **作用**: 开发主分支，包含每次的变更
- **稳定性**: 相对稳定，包含最新开发功能
- **保护**: ⚠️ 不要直接提交，使用 feature/bugfix 分支
- **合并**: 接受来自 feature/bugfix 分支的合并
- **特点**: 经过测试后合并到 main

### 开发分支

#### `feature/*` - 新功能开发
```bash
# 从 release 创建功能分支
git checkout release
git checkout -b feature/api-response-highlight

# 开发完成后合并到 release
git checkout release
git merge feature/api-response-highlight
git branch -d feature/api-response-highlight
```

#### `bugfix/*` - Bug 修复
```bash
# 从 release 创建 bugfix 分支
git checkout release
git checkout -b bugfix/text-selection-disable

# 修复完成后合并到 release
git checkout release
git merge bugfix/text-selection-disable
git branch -d bugfix/text-selection-disable
```

#### `hotfix/*` - 紧急修复
```bash
# 从 main 分支创建（紧急修复生产环境）
git checkout main
git checkout -b hotfix/critical-bug

# 修复完成后合并到 main 和 release
git checkout main
git merge hotfix/critical-bug
git tag -a v2.14.1 -m "Hotfix v2.14.1"

git checkout release
git merge hotfix/critical-bug

git branch -d hotfix/critical-bug
```

---

## 📋 工作流程

### 1. 开发新功能

```bash
# Step 1: 从 release 创建功能分支
git checkout release
git pull origin release
git checkout -b feature/new-feature-name

# Step 2: 开发和提交
# ... 进行开发 ...
git add .
git commit -m "feat: 添加新功能描述"

# Step 3: 本地测试
# - 重新加载扩展
# - 测试新功能
# - 确认无问题

# Step 4: 推送分支并创建 MR 合并到 release（推荐）
git push gitlab feature/new-feature-name && git push origin feature/new-feature-name
# 打开 https://git.garena.com/tianyi.liang/spx-helper/-/merge_requests/new
# 选择 source: feature/new-feature-name, target: release，创建 MR 并合并

# 备选：本地合并（MR 不可用时）
# git checkout release && git merge feature/new-feature-name
# git push gitlab release && git push origin release

# Step 5: 删除功能分支
git branch -d feature/new-feature-name
```

### 2. 修复 Bug

```bash
# Step 1: 从 release 创建 bugfix 分支
git checkout release
git checkout -b bugfix/bug-description

# Step 2: 修复和提交
git add .
git commit -m "fix: 修复XX问题"

# Step 3: 测试验证
# - 验证 bug 已修复
# - 确认没有引入新问题

# Step 4: 推送分支并创建 MR 合并到 release（推荐）
git push gitlab bugfix/bug-description && git push origin bugfix/bug-description
# 打开 GitLab 创建 MR：source: bugfix/xxx, target: release
```

### 3. 发布到 Main（正式发布）

```bash
# Step 1: 确保 release 分支稳定
git checkout release
git pull origin release

# Step 2: 运行完整测试（必须！）
# - 功能测试
# - 兼容性测试
# - 性能测试
# 使用 API_TRACKER_SETTINGS_TEST.md 测试清单

# Step 3: 更新版本号
# 编辑 manifest.json，更新 version
git add manifest.json
git commit -m "chore: 升级版本到 v2.14.1"
git push origin release

# Step 4: 合并到 main（发布）
git checkout main
git merge release

# Step 5: 打标签
git tag -a v2.14.1 -m "Release v2.14.1

新增功能：
- 响应字段高亮显示
- 文本选取功能开关

Bug 修复：
- 修复关闭功能后仍弹窗的问题"

git push origin main --tags

# Step 6: 打包发布
# - 使用 build 脚本打包
# - 上传到 Chrome Web Store
```

---

## 🚫 禁止操作

### ❌ 直接提交到 main
```bash
# 错误做法
git checkout main
git add .
git commit -m "fix something"  # ❌ 绝对不要直接提交到 main！
```

### ❌ 直接提交到 release
```bash
# 错误做法
git checkout release
git add .
git commit -m "add feature"  # ❌ 不要直接提交，使用 feature 分支！
```

### ❌ 未经测试就合并到 main
```bash
# 错误做法
git checkout main
git merge release  # ❌ 必须先充分测试 release！
```

---

## ✅ 正确做法

### 日常开发流程

```bash
# 1. 创建功能分支（从 release）
git checkout release
git checkout -b feature/my-feature

# 2. 开发
# ... 编码 ...
git commit -m "feat: 实现XX功能"

# 3. 测试
# ... 本地测试 ...

# 4. 合并到 release
git checkout release
git merge feature/my-feature

# 5. release 测试通过后，准备发布
git checkout main
git merge release
git tag -a v2.14.1 -m "Release v2.14.1"
git push origin main --tags
```

### 紧急修复已发布版本

```bash
# 1. 从 main 创建 hotfix（修复生产环境）
git checkout main
git checkout -b hotfix/critical-issue

# 2. 修复问题
git add .
git commit -m "hotfix: 修复紧急问题"

# 3. 合并回 main（优先）
git checkout main
git merge hotfix/critical-issue
git tag -a v2.14.1 -m "Hotfix v2.14.1"
git push origin main --tags

# 4. 同步到 release
git checkout release
git merge hotfix/critical-issue
git push origin release

git branch -d hotfix/critical-issue
```

---

## 📊 分支关系图（修正版）

```
release (开发分支)
  ├── feature/new-feature-1  → merge to release
  ├── feature/new-feature-2  → merge to release
  ├── bugfix/fix-issue       → merge to release
  └── → 测试通过 → merge to main
  
main (稳定生产版本)
  ├── v2.13.0 (tag) ← 稳定发布
  ├── v2.13.1 (tag) ← 稳定发布
  ├── v2.14.0 (tag) ← 稳定发布
  └── hotfix/critical → merge to main & release
```

**关键点：**
- 📝 日常开发：在 release 分支
- ✅ 测试通过：release → main
- 🏷️ 打标签：在 main 分支
- 🚨 紧急修复：从 main 创建 hotfix

---

## 🔍 当前建议

### 立即行动

1. **调整当前分支策略**
```bash
# 当前 bugfix 分支是从 main 创建的（错误）
# 应该从 release 创建

# 解决方案：将 bugfix 合并到 release
git checkout release
git merge bugfix/text-selection-disable

# 测试通过后，再合并到 main
git checkout main
git merge release
git tag -a v2.14.1 -m "Stable release"
```

2. **当前状态整理**
```
release (开发分支) ← 应该包含最新开发代码
  └── bugfix/text-selection-disable (待合并)
  
main (稳定版本) ← 应该只包含经过测试的稳定版本
  └── 当前包含未测试代码（需要清理）
```

3. **建议的修复流程**
```bash
# Step 1: 测试 bugfix 分支
# 重新加载扩展，确认 bug 已修复

# Step 2: 合并 bugfix 到 release
git checkout release
git merge bugfix/text-selection-disable
git branch -d bugfix/text-selection-disable

# Step 3: 完整测试 release 分支
# 使用测试清单测试所有功能

# Step 4: release 稳定后合并到 main
git checkout main
git merge release
git tag -a v2.14.1 -m "Stable release v2.14.1"
git push origin main --tags
```

---

## 📚 参考资料

- [Git Flow 工作流](https://nvie.com/posts/a-successful-git-branching-model/)
- [语义化版本](https://semver.org/lang/zh-CN/)
- [约定式提交](https://www.conventionalcommits.org/zh-hans/)

---

**记住：release 用于开发，main 是稳定版本！**

# Git 工作流规范

## 🌳 分支策略

### 主要分支

#### `main` 分支
- **作用**: 开发主分支，包含最新的开发代码
- **稳定性**: 相对稳定，但可能包含未充分测试的功能
- **保护**: ⚠️ 不要直接提交，使用 feature/bugfix 分支
- **合并**: 只接受来自 feature/bugfix 分支的 PR 或合并

#### `release` 分支
- **作用**: 生产发布分支，仅包含经过测试的稳定版本
- **稳定性**: 高度稳定，可直接打包发布
- **保护**: 🔒 严格保护，只接受来自 main 的合并
- **标签**: 每次合并后打 tag（如 v2.14.0）

### 开发分支

#### `feature/*` - 新功能开发
```bash
# 创建功能分支
git checkout main
git checkout -b feature/api-response-highlight

# 开发完成后合并到 main
git checkout main
git merge feature/api-response-highlight
git branch -d feature/api-response-highlight
```

#### `bugfix/*` - Bug 修复
```bash
# 创建 bugfix 分支
git checkout main
git checkout -b bugfix/text-selection-disable

# 修复完成后合并到 main
git checkout main
git merge bugfix/text-selection-disable
git branch -d bugfix/text-selection-disable
```

#### `hotfix/*` - 紧急修复
```bash
# 从 release 分支创建
git checkout release
git checkout -b hotfix/critical-bug

# 修复完成后合并到 release 和 main
git checkout release
git merge hotfix/critical-bug

git checkout main
git merge hotfix/critical-bug

git branch -d hotfix/critical-bug
```

---

## 📋 工作流程

### 1. 开发新功能

```bash
# Step 1: 创建功能分支
git checkout main
git pull origin main
git checkout -b feature/new-feature-name

# Step 2: 开发和提交
# ... 进行开发 ...
git add .
git commit -m "feat: 添加新功能描述"

# Step 3: 本地测试
# - 重新加载扩展
# - 测试所有功能
# - 确认无问题

# Step 4: 合并到 main（本地测试通过）
git checkout main
git merge feature/new-feature-name
git push origin main

# Step 5: 删除功能分支
git branch -d feature/new-feature-name
```

### 2. 修复 Bug

```bash
# Step 1: 创建 bugfix 分支
git checkout main
git checkout -b bugfix/bug-description

# Step 2: 修复和提交
git add .
git commit -m "fix: 修复XX问题"

# Step 3: 测试验证
# - 验证 bug 已修复
# - 确认没有引入新问题

# Step 4: 合并到 main
git checkout main
git merge bugfix/bug-description
git push origin main
git branch -d bugfix/bug-description
```

### 3. 发布到 Release

```bash
# Step 1: 确保 main 分支稳定
git checkout main
git pull origin main

# Step 2: 运行完整测试（建议使用测试清单）
# - 功能测试
# - 兼容性测试
# - 性能测试

# Step 3: 更新版本号
# 编辑 manifest.json，更新 version

git add manifest.json
git commit -m "chore: 升级版本到 v2.14.1"

# Step 4: 合并到 release
git checkout release
git merge main

# Step 5: 打标签
git tag -a v2.14.1 -m "Release v2.14.1"
git push origin release --tags

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
git commit -m "fix something"  # ❌ 不要这样做！
```

### ❌ 直接提交到 release
```bash
# 错误做法
git checkout release
git add .
git commit -m "hotfix"  # ❌ 绝对不要这样做！
```

### ❌ 未经测试就合并
```bash
# 错误做法
git merge feature/untested-feature  # ❌ 先测试！
```

---

## ✅ 正确做法

### 当前情况修复（main 分支已有未测试代码）

```bash
# Step 1: 查看当前状态
git log --oneline -10

# Step 2: 如果需要回滚到稳定版本
git checkout main
git reset --hard <last-stable-commit-hash>
git push origin main --force  # ⚠️ 慎用 force push

# Step 3: 重新开始，使用 feature 分支
git checkout -b feature/text-selection-fix
# ... 开发和测试 ...
git checkout main
git merge feature/text-selection-fix
```

### 紧急修复已发布版本

```bash
# Step 1: 从 release 创建 hotfix
git checkout release
git checkout -b hotfix/critical-issue

# Step 2: 修复问题
git add .
git commit -m "hotfix: 修复关键问题"

# Step 3: 合并回 release 和 main
git checkout release
git merge hotfix/critical-issue
git tag -a v2.14.1 -m "Hotfix v2.14.1"

git checkout main
git merge hotfix/critical-issue

git push origin main release --tags
git branch -d hotfix/critical-issue
```

---

## 📝 提交信息规范

### 格式
```
<type>: <subject>

<body>

<footer>
```

### Type 类型

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响代码运行）
- `refactor`: 重构（既不是新增功能，也不是修复 bug）
- `perf`: 性能优化
- `test`: 增加测试
- `chore`: 构建过程或辅助工具的变动

### 示例

```bash
# 好的提交信息
git commit -m "feat: 添加文本选取功能开关

新增功能：
- 用户可以在设置中开启/关闭文本选取
- 状态实时同步到所有标签页
- 默认开启

技术实现：
- popup.js: 添加 toggle switch
- content.js: 监听状态变化"

# 不好的提交信息
git commit -m "update"  # ❌ 太简略
git commit -m "fix bug"  # ❌ 没说明什么 bug
```

---

## 🏷️ 版本管理

### 版本号规则（语义化版本）

```
主版本号.次版本号.修订号

例如: v2.14.1
- 2: 主版本号（重大重构或不兼容更新）
- 14: 次版本号（新增功能，向下兼容）
- 1: 修订号（bug 修复）
```

### 何时升级版本号

- **主版本号**: 重大架构变更、不兼容更新
- **次版本号**: 新增功能、功能改进
- **修订号**: Bug 修复、文档更新

### 打标签

```bash
# 轻量标签
git tag v2.14.1

# 附注标签（推荐）
git tag -a v2.14.1 -m "Release v2.14.1

新增功能：
- 响应字段高亮显示
- 文本选取功能开关

Bug 修复：
- 修复关闭功能后仍弹窗的问题"

# 推送标签
git push origin v2.14.1
```

---

## 📊 分支关系图

```
main (开发分支)
  ├── feature/new-feature-1  → merge to main
  ├── feature/new-feature-2  → merge to main
  ├── bugfix/fix-issue       → merge to main
  └── → merge to release (经过测试)
  
release (发布分支)
  ├── v2.13.0 (tag)
  ├── v2.13.1 (tag)
  ├── v2.14.0 (tag)
  └── hotfix/critical → merge to release & main
```

---

## 🔍 当前建议

### 立即行动

1. **创建 release 分支**（如果还没有）
```bash
# 找到最后一个稳定的 commit
git log --oneline

# 从稳定 commit 创建 release
git checkout <stable-commit-hash>
git checkout -b release
git push origin release
```

2. **修复当前 bug**
```bash
# 已经在 bugfix 分支了
git checkout bugfix/text-selection-disable

# 测试修复
# ... 重新加载扩展并测试 ...

# 合并到 main（测试通过）
git checkout main
git merge bugfix/text-selection-disable
```

3. **测试 main 分支**
```bash
# 运行完整测试
# 使用 API_TRACKER_SETTINGS_TEST.md 测试清单

# 确认稳定后合并到 release
git checkout release
git merge main
git tag -a v2.14.1 -m "Stable release"
git push origin release --tags
```

---

## 📚 参考资料

- [Git Flow 工作流](https://nvie.com/posts/a-successful-git-branching-model/)
- [语义化版本](https://semver.org/lang/zh-CN/)
- [约定式提交](https://www.conventionalcommits.org/zh-hans/)

---

**记住：main 用于开发，release 用于发布！**

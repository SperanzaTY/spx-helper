# SPX Bug Trace Skill 安装与维护

当用户说「帮我安装 skill」「安装 spx-bug-trace」「如何安装这个 skill」时，按本文执行。

---

## 维护原则（团队约定）

1. **全部用手动方式维护 Skill**：在 Cursor 中直接编辑 `SKILL.md` 等文件，或在工程路径与 `~/.cursor/skills/spx-bug-trace` 之间**手动 `cp` / 对比合并**。**不要使用** `scripts/sync_skills.sh` 或其它自动化脚本作为常规同步手段（脚本仅作历史参考，见脚本文件头注释）。
2. **版本演进靠理解与合并**：不同版本（全局 vs 工程、或 Git 历史）之间的差异，由人在编辑器里 **diff、取舍、补全**，Agent 协助时也应以**语义合并与结构优化**为目标，而不是一键覆盖。
3. **复制方向**：仍须先确认「最新版在全局还是工程」，再决定 **全局→工程** 或 **工程→全局**，避免再次搞反；详见下文「与全局 Skill 同步」。
4. **协作**：走 **全局最新 → 工程** 时，若仓库里 `.cursor/skills/` **已有他人提交**，**禁止**用全局整目录直接覆盖工程。须先 **`git pull`** 拉齐远程，再对 **全局 vs 工程**（或 **全局 vs `git show HEAD:.cursor/skills/...`**）做 **手动 diff / 逐段合并**，把他人改动与你的全局改动**择优合入**后再 `git commit`。

---

## 安装目标

将 `spx-bug-trace` Skill 安装到 `~/.cursor/skills/`，使其在**所有项目**中可用（不仅限 SPX_Helper）。

## 前置条件

- 已克隆 SPX_Helper 仓库
- 当前在 SPX_Helper 项目目录下

## 安装步骤（手动）

**首次**：若本机尚无 `~/.cursor/skills/spx-bug-trace`：

```bash
mkdir -p ~/.cursor/skills
cp -r /path/to/SPX_Helper/.cursor/skills/spx-bug-trace ~/.cursor/skills/
```

重启 Cursor 或切换项目后生效。

**不推荐**依赖 `./scripts/sync_skills.sh` 完成日常安装或更新；若曾用过脚本，之后仍以**手动复制或编辑器合并**为准。

## 验证安装

1. 重启 Cursor 或切换项目
2. 打开 Cursor Settings → Rules，确认 `spx-bug-trace` 已出现在 Skill 列表
3. 在其他项目（如 fm-realtime）中触发业务排查场景，验证 Skill 是否自动加载

## 与全局 Skill 同步（两种场景）

**方向极易搞反，复制前务必确认谁是「最新」**：

| 你的真实情况 | 复制方向 | 说明 |
|-------------|----------|------|
| **每次排查都在改 `~/.cursor/skills/spx-bug-trace`（全局最新）** | **全局 → 工程** | `cp -r ~/.cursor/skills/spx-bug-trace .cursor/skills/`（可先备份工程再删目录） |
| **只在仓库 `.cursor/skills/` 里改（工程最新）** | **工程 → 全局** | `cp -r .cursor/skills/spx-bug-trace ~/.cursor/skills/` |

**禁止**：在未确认的情况下把**工程覆盖到全局**——若全局才是你持续更新的版本，会**冲掉**全局里尚未拷进仓库的内容。

**Agent 行为**：**不要自动执行** `cp` 或脚本；说明方向后由用户执行，或仅在用户明确授权后执行。

### 协作补充：全局 → 工程，但工程里已有「别人提交的 Skill」

典型顺序：

1. **`git pull origin <分支>`**（或你们主开发分支），确认 `.cursor/skills/spx-bug-trace/` 是否出现**他人新提交**。
2. 若有他人改动：**不要** `rm -rf` 工程目录后用全局一把覆盖。应：
   - 用 `diff` / Cursor **Compare** 对比 **`~/.cursor/skills/spx-bug-trace`** 与 **工程内 `.cursor/skills/spx-bug-trace`**；
   - 或对比 **全局** 与 **`git show HEAD:.cursor/skills/spx-bug-trace/SKILL.md`** 等，看清「远程已合入」与「你本机全局」的差异；
   - **手动**把需要的内容合并进工程（保留他人有效段落 + 你的排查沉淀），必要时在 `SKILL.md` 的「Skill 更新记录」里写一句合并说明。
3. 再在工程内 **`git add` / `git commit`**（或先本地分支、再 MR）。

单人、远程长期无他人动 Skill 时，才可简化为下面「场景 A」的整目录覆盖流程。

### 场景 A：排查时改全局，工程里的是旧版 — **全局覆盖工程，再提交 Git**

适用：你主要在 **`~/.cursor/skills/spx-bug-trace`** 里更新 Skill，需要把**当前全局**同步进 SPX_Helper 落盘；且**已确认**工程侧无待合并的他人提交（或已按上文「协作补充」处理完毕）。

1. **（推荐）备份工程内旧版**：
   ```bash
   cd /path/to/SPX_Helper
   cp -r .cursor/skills/spx-bug-trace .cursor/skills/spx-bug-trace.bak
   ```
2. **用全局覆盖工程**（**仅此方向**）：
   ```bash
   rm -rf .cursor/skills/spx-bug-trace
   cp -r ~/.cursor/skills/spx-bug-trace .cursor/skills/
   ```
3. **对比**：
   - 确认复制成功：`diff -ru ~/.cursor/skills/spx-bug-trace .cursor/skills/spx-bug-trace`（应无差异）
   - 看相对 Git 的改动：`git diff .cursor/skills/spx-bug-trace`
   - 与备份对比：`diff -ru .cursor/skills/spx-bug-trace.bak .cursor/skills/spx-bug-trace`
4. 审阅后 **`git add` / `git commit`**。其他项目若也要用**已提交的这一版**，再 **工程 → 全局**（手动 `cp`，此时工程已与全局一致）。

### 场景 B：以仓库为真相源（协作 / 只在工程里改）

1. **对比差异**（在 SPX_Helper 根目录）：
   ```bash
   diff -ru ~/.cursor/skills/spx-bug-trace .cursor/skills/spx-bug-trace | less
   ```
2. **合并策略**：在 Cursor 中打开两侧文件，**手动**把需要的内容合并进目标侧后提交。
3. **同步到全局**：手动 `cp -r .cursor/skills/spx-bug-trace ~/.cursor/skills/`（覆盖前可自行备份 `~/.cursor/skills/spx-bug-trace`）。

**注意**：仅个人路径、本机账号等不要写进仓库；留在本机 Rules 或个人笔记即可。

### 误用工程覆盖全局后如何补救

若错误执行了 **工程 → 全局** 且全局里曾有**未备份**的更新：尝试 **Cursor 本地历史 / Time Machine** 恢复 `~/.cursor/skills/spx-bug-trace/` 下文件；无法恢复则需凭记忆或 Confluence/排查记录补回。

## 依赖

Skill 需配合以下 MCP 使用：**user-api-trace**、**user-ck-query**、**user-presto-query**、**cursor-ide-browser**、**user-mcp-atlassian**（Confluence）、**user-google-sheets**（GSheet，可选）。详见 `mcp-tools/` 与 `.cursor/skills/spx-bug-trace/SKILL.md` 工具清单。

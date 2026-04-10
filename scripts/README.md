# Scripts 脚本目录

本目录包含SPX Helper项目的各类辅助脚本。

## 📁 目录结构

```
scripts/
├── build/          # 构建和打包脚本
├── release/        # 发布相关脚本
└── test/           # 测试脚本
```

## 🔨 构建脚本 (build/)

打包和构建相关的脚本：

- `package-extension-v2.8.0.sh` - v2.8.0版本打包脚本
- `package-extension-v2.8.1.sh` - v2.8.1版本打包脚本
- `package-full-v2.8.0.sh` - v2.8.0完整打包脚本
- `package-release.sh` - 通用发布打包脚本

**使用方式:**
```bash
cd scripts/build
./package-release.sh
```

## 🚀 发布脚本 (release/)

版本发布相关的脚本：

- `create-release.sh` - 创建新版本发布
- `publish-release.sh` - 发布到GitHub Release
- `publish-guide.sh` - 发布指南和步骤

**使用方式:**
```bash
cd scripts/release
./create-release.sh
```

## 🧪 测试脚本 (test/)

开发测试相关的脚本：

- `test-window-mode.sh` - 窗口模式测试
- `verify-window-fix.sh` - 窗口修复验证

**使用方式:**
```bash
cd scripts/test
./test-window-mode.sh
```

## 📝 注意事项

1. 所有脚本应在项目根目录或对应脚本目录中执行
2. 执行前确保脚本有执行权限：`chmod +x script-name.sh`
3. 某些脚本可能需要配置环境变量或参数

## SeaTalk CDP 一键探测

本机已启动 SeaTalk 且开启 CDP（默认端口 `19222`）时，可快速确认能否通过 CDP 读页面，无需跑完整 `verify-cdp.js` 注入检查。

```bash
# 摘要：目标数量、当前页标题、innerText 长度
node scripts/probe-seatalk-cdp.js

# 打印 /json 原始列表（调试用）
node scripts/probe-seatalk-cdp.js --json

# 打印正文前约 4000 字（评 Alarm Bot、看列表摘要时可用，输出较长）
node scripts/probe-seatalk-cdp.js --snippet
```

依赖：需在 `seatalk-agent/` 执行过 `npm install`（使用其中的 `ws` 包）。端口可通过环境变量 `SEATALK_CDP_PORT` 或 `CDP_PORT` 覆盖。

详见 `.cursor/rules/seatalk-cdp-debug.mdc`。

## 🔗 相关文档

- 主README: `/README.md`
- Presto工具: `/presto-tools/README.md`

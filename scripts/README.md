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

## 🔗 相关文档

- 主README: `/README.md`
- Presto工具: `/presto-tools/README.md`

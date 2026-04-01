# 分享给同事的说明 📧

嗨！我给你分享了一套Presto数据查询工具。

## 📦 压缩包内容

`presto-query-tools.zip` 包含：
- ✅ Python查询脚本
- ✅ Cursor MCP集成工具
- ✅ 完整使用文档

## 🚀 快速开始

### 第1步: 解压
```bash
unzip presto-query-tools.zip
cd presto-query-tools
```

### 第2步: 选择使用方式

#### 方式A: Python脚本（简单快速）
```bash
# 1. 从 https://datasuite.shopee.io/dataservice/ds_api_management 获取Personal Token（点击左上角三个横线菜单）
# 2. 编辑 simple_query.py，填入你的配置
# 3. 运行
pip3 install requests
python3 simple_query.py
```

#### 方式B: MCP工具（AI辅助，推荐）
```bash
# 1. 运行安装脚本
./install_mcp.sh

# 2. 按提示输入你的token和用户名

# 3. 重启Cursor

# 4. 在Cursor中直接问AI：
#    "查询 spx_mart.xxx 表的数据"
```

## 📖 详细文档

打开 `QUICK_START.md` 查看5分钟快速上手指南。

## ⚠️ 重要提示

1. **Personal Token是个人凭证** - 从 https://datasuite.shopee.io/dataservice/ds_api_management 获取你自己的token
2. **不要分享token** - 每个人使用自己的token
3. **只支持SELECT查询** - Personal SQL API只支持读操作

## 🐛 遇到问题？

查看 `README.md` 的常见问题章节，或直接联系我。

---

Happy Querying! 🎉

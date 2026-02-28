# 🧪 Presto MCP 测试指南

## 重启Cursor后测试

安装完成后，重启Cursor，然后尝试以下测试：

## 基础测试

### 测试1: 查询表数据

**在Cursor对话中输入:**
```
请查询 spx_mart.dim_spx_lm_station_user_configuration_tab_id 表的前5行数据
```

**预期结果:**
- AI调用 `query_presto` 工具
- 返回表格格式的结果
- 显示5行数据和11列

### 测试2: 统计查询

**在Cursor对话中输入:**
```
帮我统计一下 spx_mart.dim_spx_lm_station_user_configuration_tab_id 表有多少行
```

**预期结果:**
- AI自动构造 `SELECT COUNT(*) FROM ...` 查询
- 返回总行数

### 测试3: 条件查询

**在Cursor对话中输入:**
```
查询 spx_mart.dim_spx_lm_station_user_configuration_tab_id 表中 station_id = '24621' 的数据
```

**预期结果:**
- AI构造带WHERE条件的查询
- 返回符合条件的数据

## 高级测试

### 测试4: 数据分析

**在Cursor对话中输入:**
```
帮我分析一下配置表中的数据分布，特别是 dedicated_two_wheel_target 字段
```

**预期结果:**
- AI可能执行多次查询
- 给出统计分析和建议

### 测试5: 问题排查

**在Cursor对话中输入:**
```
帮我查一下为什么 station_id=24621 的配置看起来有问题
```

**预期结果:**
- AI查询该station的数据
- 分析可能的问题原因

## 验证MCP工具是否可用

### 方法1: 查看工具列表

在Cursor中，检查是否有 `query_presto` 工具可用。

### 方法2: 直接测试

直接向AI发送查询请求，看是否能正常调用工具。

### 方法3: 检查日志

如果工具没有出现，检查Cursor的MCP日志：
- macOS: `~/Library/Logs/Cursor/`
- 查看是否有MCP相关的错误信息

## 常见问题

### Q1: 工具没有出现

**解决方法:**
1. 确认已重启Cursor
2. 检查配置文件路径: `~/.cursor/mcp_config.json`
3. 检查Python脚本路径是否正确
4. 查看Cursor日志

### Q2: 查询失败

**可能原因:**
1. SQL语法错误
2. 表名不存在
3. Personal Token过期

**解决方法:**
- 查看错误信息中的详细描述
- 使用 `simple_query.py` 单独测试相同的SQL

### Q3: 超时

**解决方法:**
- 简化查询（减少数据量）
- 使用LIMIT限制返回行数
- 检查查询是否有性能问题

## 手动测试MCP服务器

可以直接运行MCP服务器来测试：

```bash
cd /Users/tianyi.liang/.cursor/worktrees/SPX_Helper/sri

# 测试服务器是否能启动
python3 presto_mcp_server.py
# (Ctrl+C 退出)
```

## 实际使用场景

### 场景1: 快速数据验证

```
帮我验证一下最近添加的配置是否已经生效了
```

### 场景2: 数据探索

```
探索一下这个表的结构和数据特征
```

### 场景3: 问题定位

```
为什么这个API没有返回预期的数据？帮我查一下数据库
```

### 场景4: 数据对比

```
对比一下 station_id 24621 和 17616 的配置有什么区别
```

## 成功标志

当你看到以下内容时，说明MCP工具工作正常：

✅ AI能够识别查询请求
✅ AI调用 `query_presto` 工具
✅ 返回表格格式的查询结果
✅ AI能够分析和解释结果
✅ 支持多轮对话和追问

---

**🎉 享受在Cursor中直接查询和分析Presto数据的便利吧！**

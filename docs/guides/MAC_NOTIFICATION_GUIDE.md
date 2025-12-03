# 🍎 Mac系统 - 通知功能完整配置指南

## Mac系统通知问题解决方案

### ⚠️ Mac系统常见通知问题

Mac系统的通知比Windows更严格，需要同时配置**系统级**和**Chrome级**的通知权限。

---

## 📋 完整配置步骤（必须按顺序执行）

### 第1步：配置Mac系统通知

#### 方法A：通过系统偏好设置（推荐）

```
1. 点击屏幕左上角  → 系统偏好设置（或系统设置）
2. 点击"通知与专注模式"（或"通知"）
3. 在左侧列表中找到"Google Chrome"
   （如果找不到，可能需要先让Chrome发送一次通知）
4. 点击进入Chrome的通知设置
5. 确保以下选项已开启：
   ✓ 允许来自"Google Chrome"的通知
   ✓ 在通知中心显示
   ✓ 在锁屏上显示（可选）
   ✓ 播放提示音（推荐）
   ✓ 显示横幅
6. 横幅样式选择：临时（推荐）或持续
```

#### 方法B：通过终端快速检查

```bash
# 检查Chrome的通知权限状态
defaults read com.apple.ncprefs.plist | grep -A 5 "Chrome"
```

### 第2步：关闭专注模式

Mac的专注模式（Focus Mode）会阻止所有通知！

```
方式1：菜单栏
- 点击右上角控制中心图标
- 找到"专注模式"
- 点击关闭（确保没有显示月亮图标🌙）

方式2：系统偏好设置
- 系统偏好设置 → 专注模式
- 关闭所有专注模式选项
- 或者设置"允许来自这些App的通知" → 添加Chrome

方式3：快捷键
- 按住 Option 键
- 点击菜单栏右上角的通知图标
- 快速切换勿扰模式
```

### 第3步：配置Chrome通知

```
1. 在Chrome地址栏输入：chrome://settings/content/notifications
2. 确保"网站可以请求发送通知"已开启
3. 向下滚动检查：
   - "允许"列表中应该包含扩展
   - "阻止"列表中不应该有chrome-extension://开头的项
```

### 第4步：重启Chrome浏览器

```
⚠️ 重要：完全退出Chrome后重新打开

1. Command + Q 完全退出Chrome
   （不是点击红色关闭按钮）
2. 重新打开Chrome
3. 重新加载扩展：chrome://extensions/ → 刷新
```

---

## 🧪 Mac专用测试步骤

### 测试1：系统通知测试

打开终端，执行：

```bash
osascript -e 'display notification "这是测试通知" with title "测试"'
```

如果能看到通知 → 系统通知正常
如果看不到 → 系统通知被禁用

### 测试2：Chrome通知测试

1. 打开扩展
2. 点击"测试通知"按钮
3. 应该看到弹窗和通知

---

## 🔍 Mac通知位置

在Mac上，Chrome通知会出现在：

```
位置：屏幕右上角
样式：横幅（从顶部滑下）
持续时间：约5-10秒
通知中心：可以在通知中心查看历史
```

如果选择了"持续"样式，通知会一直显示直到手动关闭。

---

## 🐛 Mac常见问题排查

### 问题1：通知一闪而过

**原因：** 横幅设置为"临时"
**解决：** 系统偏好设置 → 通知 → Chrome → 选择"持续"

### 问题2：没有声音

**解决：**
```
系统偏好设置 → 通知 → Chrome → 勾选"播放提示音"
系统偏好设置 → 声音 → 确保"警告音量"不是静音
```

### 问题3：专注模式自动开启

**解决：**
```
系统偏好设置 → 专注模式 → 关闭所有自动开启选项
- 时间
- 位置
- App使用
```

### 问题4：Chrome在后台时通知不显示

**原因：** 这是正常的，Mac系统级权限需要

**解决：**
```
系统偏好设置 → 通知 → Chrome
确保勾选：
✓ 在通知中心显示
✓ 横幅
✓ 允许通知
```

---

## 📝 Mac系统要求

### 支持的macOS版本

- ✅ macOS Monterey (12.x) 及以上
- ✅ macOS Big Sur (11.x)
- ✅ macOS Catalina (10.15)
- ⚠️ 更早版本可能有兼容性问题

### Chrome版本要求

- ✅ Chrome 88 及以上
- 推荐使用最新稳定版

---

## 🚀 一键配置脚本（可选）

保存为 `setup_notifications.sh`：

```bash
#!/bin/bash

echo "🍎 Mac通知配置助手"
echo "===================="

# 检查Chrome是否在运行
if pgrep -x "Google Chrome" > /dev/null; then
    echo "✅ Chrome正在运行"
else
    echo "⚠️  Chrome未运行，请先启动Chrome"
    exit 1
fi

# 提示用户检查系统通知
echo ""
echo "📋 请手动检查以下设置："
echo ""
echo "1. 系统偏好设置 → 通知"
echo "   找到 Google Chrome"
echo "   确保通知已开启"
echo ""
echo "2. 关闭专注模式"
echo "   控制中心 → 专注模式 → 关闭"
echo ""

# 测试系统通知
echo "🧪 发送测试通知..."
osascript -e 'display notification "如果你看到这条通知，系统通知已配置正确" with title "✅ 测试成功"'

echo ""
echo "如果看到通知弹出，说明系统通知正常！"
echo ""
echo "下一步："
echo "1. 打开Chrome: chrome://extensions/"
echo "2. 刷新"值班助手"扩展"
echo "3. 点击扩展图标 → 测试通知"
```

使用方法：

```bash
chmod +x setup_notifications.sh
./setup_notifications.sh
```

---

## ✅ 配置验证清单

完成所有配置后，按顺序验证：

### 系统级验证
- [ ] 系统偏好设置 → 通知 → Chrome → 已开启
- [ ] 专注模式已关闭（右上角没有🌙图标）
- [ ] 系统声音未静音
- [ ] 终端测试通知能看到（osascript命令）

### Chrome级验证
- [ ] chrome://settings/content/notifications → 已允许
- [ ] chrome://extensions/ → 扩展已启用
- [ ] Service Worker 显示 "active"

### 扩展级验证
- [ ] 点击扩展图标能打开
- [ ] 点击"测试通知"有弹窗提示
- [ ] 屏幕右上角出现通知横幅

---

## 💡 给用户的使用建议

### 首次使用提示

建议在用户首次安装扩展时，显示Mac配置指南：

```javascript
// 可以在扩展中添加
if (navigator.platform.includes('Mac')) {
  // 首次安装时显示Mac配置指南
  chrome.notifications.create({
    type: 'basic',
    title: '🍎 Mac用户注意',
    message: '请确保在系统偏好设置中允许Chrome发送通知'
  });
}
```

### 用户文档

为Mac用户提供简单的配置文档：

```
🍎 Mac用户快速配置

1.  → 系统偏好设置 → 通知 → Chrome → 开启
2. 关闭专注模式（控制中心）
3. 重启Chrome
4. 完成！
```

---

## 📞 故障排除

如果完成所有步骤后仍然不工作：

### 最后手段：重置Chrome

```bash
# 备份重要数据后执行
# 1. 完全退出Chrome (Command + Q)
# 2. 删除通知数据库
rm -rf ~/Library/Application\ Support/Google/Chrome/Default/Platform\ Notifications

# 3. 重启Chrome
# 4. 重新配置通知权限
```

### 检查控制台错误

```
1. 打开扩展弹窗
2. 右键 → 检查
3. 在控制台查看是否有错误
4. 特别注意 "Notification" 相关的错误
```

---

## 📊 已知Mac问题

### macOS Ventura (13.x) 及以上

- 新的通知系统可能需要额外配置
- 某些情况下需要授予"完全磁盘访问权限"

### M1/M2芯片

- 应该与Intel Mac一样工作
- 如有问题，尝试使用Rosetta运行Chrome

---

## 🎯 总结

Mac系统通知配置关键点：

1. **系统偏好设置** - 必须允许Chrome通知
2. **专注模式** - 必须关闭
3. **Chrome设置** - 必须允许通知
4. **重启Chrome** - 配置后必须完全重启

只要这4点都做到了，通知功能就能正常工作！


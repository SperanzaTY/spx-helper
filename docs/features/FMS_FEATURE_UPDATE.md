# FMS 快速入口功能更新说明（紧凑版）

## 更新内容

在快速链接（🔗 快速链接）Tab页面中，新增了 **FMS SPX Admin 快速入口** 功能区域，采用紧凑的标签页设计。

## 功能特性

### 1. 标签页设计
采用横向标签页布局，更加紧凑和直观：

```
[ LIVE ] [ UAT ] [ TEST ] [ TEST-STABLE ] [ STAGING ]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🇮🇩 ID   🇲🇾 MY   🇹🇭 TH   🇵🇭 PH   🇻🇳 VN   ...
```

- **点击标签**：切换不同环境
- **市场按钮**：自动切换到对应环境的市场列表
- **默认显示**：LIVE环境

### 2. 环境分类
- **LIVE** - 生产环境（默认显示）
- **UAT** - UAT测试环境
- **TEST** - 测试环境
- **TEST-STABLE** - 稳定测试环境（仅TH市场）
- **STAGING** - 预发布环境

### 3. 市场覆盖
支持以下市场快速访问：

- 🇮🇩 **ID** (Indonesia)
- 🇲🇾 **MY** (Malaysia)
- 🇹🇭 **TH** (Thailand)
- 🇵🇭 **PH** (Philippines)
- 🇻🇳 **VN** (Vietnam)
- 🇸🇬 **SG** (Singapore)
- 🇹🇼 **TW** (Taiwan)
- 🌐 **XX** (Global)
- 🇧🇷 **BR** (Brazil)
- 🇲🇽 **MX** (Mexico)

### 4. 交互设计优势
- ✅ **更紧凑**：占用空间大幅减少
- ✅ **更直观**：标签页形式，一目了然
- ✅ **切换快速**：点击标签即时切换
- ✅ **视觉清晰**：活动标签有明显高亮
- ✅ **动画流畅**：切换时有淡入动画效果

## 样式设计

### 标签页样式
- **默认状态**：半透明白色背景，白色文字
- **悬停状态**：稍微加深背景，向上浮动
- **激活状态**：纯白背景，粉红色文字，带阴影

### 市场按钮样式
- **默认状态**：浅灰色背景，带边框
- **悬停状态**：渐变色背景（粉红），白色文字，向上浮动
- **自适应布局**：自动换行，适应不同宽度

## 技术实现

### HTML结构
```html
<div class="fms-quick-section">
  <h3>FMS SPX Admin 快速入口</h3>
  
  <!-- 环境标签页 -->
  <div class="fms-env-tabs">
    <button class="fms-env-tab active" data-env="live">LIVE</button>
    <button class="fms-env-tab" data-env="uat">UAT</button>
    <!-- ... 更多标签 ... -->
  </div>
  
  <!-- 市场链接区域 -->
  <div class="fms-markets-container">
    <div class="fms-markets active" data-env="live">
      <a href="..." class="fms-market-btn">🇮🇩 ID</a>
      <!-- ... 更多市场 ... -->
    </div>
    <!-- ... 更多环境 ... -->
  </div>
</div>
```

### CSS关键样式
```css
/* 标签页 */
.fms-env-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.fms-env-tab {
  flex: 1;
  min-width: 90px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.3);
  color: white;
}

.fms-env-tab.active {
  background: white;
  color: #f5576c;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* 市场按钮 */
.fms-market-btn {
  padding: 8px 12px;
  background: #f8f9fa;
  border: 2px solid #e9ecef;
  border-radius: 8px;
}

.fms-market-btn:hover {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
  transform: translateY(-2px);
}
```

### JavaScript逻辑
```javascript
function initFmsLinks() {
  const envTabs = document.querySelectorAll('.fms-env-tab');
  const marketsContainers = document.querySelectorAll('.fms-markets');
  
  envTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const env = this.dataset.env;
      
      // 移除所有active状态
      envTabs.forEach(t => t.classList.remove('active'));
      marketsContainers.forEach(m => m.classList.remove('active'));
      
      // 添加当前active状态
      this.classList.add('active');
      document.querySelector(`.fms-markets[data-env="${env}"]`)
        .classList.add('active');
    });
  });
}
```

## 使用说明

1. 打开Chrome扩展的弹窗
2. 切换到 **🔗 快速链接** Tab
3. 在DataSuite快速入口下方即可看到FMS快速入口
4. 点击顶部环境标签（如"UAT"）切换环境
5. 下方会立即显示该环境的所有市场
6. 点击具体市场按钮即可跳转到对应的FMS系统

## 对比旧版设计

| 特性 | 旧版（折叠式） | 新版（标签页） |
|------|--------------|--------------|
| 占用空间 | 较大 | 紧凑 |
| 切换方式 | 展开/折叠 | 标签切换 |
| 视觉层级 | 多层 | 扁平 |
| 操作步骤 | 2步（展开+点击） | 1步（直接点击） |
| 信息密度 | 低 | 高 |

## 注意事项

- Test-stable环境目前仅包含TH市场
- 所有链接都会在新标签页中打开
- 默认显示LIVE环境的市场
- 确保有对应系统的访问权限

## 版本信息

- 更新日期: 2024-12-18
- 设计版本: v2.0 (紧凑标签页版)
- 功能状态: ✅ 已完成

## 测试文件

可以打开 `fms-test.html` 文件在浏览器中独立测试该功能。

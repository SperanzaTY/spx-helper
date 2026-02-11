# Chrome 扩展 Content Scripts 实战教程

## 📚 什么是 Content Scripts

Content Scripts 是注入到网页中运行的 JavaScript，可以直接访问和修改页面 DOM。

---

## 🎯 实现原理

### 1. 基本配置

在 `manifest.json` 中声明：

```json
{
  "manifest_version": 3,
  "name": "页面交互示例",
  "version": "1.0",
  "content_scripts": [
    {
      "matches": ["https://www.example.com/*"],  // 匹配哪些网站
      "js": ["content.js"],                       // 注入的脚本
      "css": ["content.css"],                     // 注入的样式
      "run_at": "document_end"                    // 何时运行
    }
  ],
  "permissions": ["activeTab", "scripting"]
}
```

### 2. Content Script 示例

**content.js** - 抓取页面元素并交互：

```javascript
// ========================================
// 示例 1: 高亮所有链接
// ========================================
function highlightAllLinks() {
  const links = document.querySelectorAll('a');
  links.forEach(link => {
    link.style.backgroundColor = 'yellow';
    link.style.border = '2px solid red';
  });
  console.log(`高亮了 ${links.length} 个链接`);
}

// ========================================
// 示例 2: 在页面上添加浮动按钮
// ========================================
function addFloatingButton() {
  // 创建按钮
  const button = document.createElement('div');
  button.id = 'my-extension-button';
  button.innerHTML = '🔍 提取数据';
  button.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    padding: 10px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    transition: transform 0.2s;
  `;
  
  // 添加悬停效果
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.05)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
  });
  
  // 点击事件
  button.addEventListener('click', () => {
    extractPageData();
  });
  
  // 添加到页面
  document.body.appendChild(button);
}

// ========================================
// 示例 3: 提取页面数据
// ========================================
function extractPageData() {
  const data = {
    title: document.title,
    url: window.location.href,
    links: [],
    images: [],
    headings: []
  };
  
  // 提取所有链接
  document.querySelectorAll('a').forEach(link => {
    data.links.push({
      text: link.innerText.trim(),
      href: link.href
    });
  });
  
  // 提取所有图片
  document.querySelectorAll('img').forEach(img => {
    data.images.push({
      src: img.src,
      alt: img.alt
    });
  });
  
  // 提取所有标题
  document.querySelectorAll('h1, h2, h3').forEach(heading => {
    data.headings.push({
      level: heading.tagName,
      text: heading.innerText.trim()
    });
  });
  
  // 显示结果
  showDataPanel(data);
  
  // 发送给 background 或 popup
  chrome.runtime.sendMessage({
    type: 'PAGE_DATA',
    data: data
  });
}

// ========================================
// 示例 4: 显示数据面板
// ========================================
function showDataPanel(data) {
  // 创建面板
  const panel = document.createElement('div');
  panel.id = 'data-panel';
  panel.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    width: 400px;
    max-height: 600px;
    overflow-y: auto;
    background: white;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.3);
    z-index: 999999;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;
  
  panel.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
      <h3 style="margin: 0; color: #333;">📊 页面数据</h3>
      <button id="close-panel" style="border: none; background: #f0f0f0; padding: 5px 10px; border-radius: 4px; cursor: pointer;">✕</button>
    </div>
    
    <div style="margin-bottom: 15px;">
      <h4 style="color: #667eea; margin-bottom: 5px;">标题</h4>
      <p style="color: #666;">${data.title}</p>
    </div>
    
    <div style="margin-bottom: 15px;">
      <h4 style="color: #667eea; margin-bottom: 5px;">链接数量</h4>
      <p style="color: #666;">${data.links.length} 个</p>
    </div>
    
    <div style="margin-bottom: 15px;">
      <h4 style="color: #667eea; margin-bottom: 5px;">图片数量</h4>
      <p style="color: #666;">${data.images.length} 个</p>
    </div>
    
    <div style="margin-bottom: 15px;">
      <h4 style="color: #667eea; margin-bottom: 5px;">标题列表</h4>
      ${data.headings.slice(0, 5).map(h => 
        `<p style="color: #666; margin: 5px 0;">
          <span style="background: #667eea; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px; margin-right: 5px;">${h.level}</span>
          ${h.text.substring(0, 50)}${h.text.length > 50 ? '...' : ''}
        </p>`
      ).join('')}
    </div>
  `;
  
  document.body.appendChild(panel);
  
  // 关闭按钮
  document.getElementById('close-panel').addEventListener('click', () => {
    panel.remove();
  });
}

// ========================================
// 示例 5: 监听页面变化 (MutationObserver)
// ========================================
function watchPageChanges() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        console.log('页面添加了新元素:', mutation.addedNodes);
      }
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// ========================================
// 示例 6: 修改页面元素
// ========================================
function modifyPageElements() {
  // 查找特定元素
  const prices = document.querySelectorAll('.price');
  
  prices.forEach(priceElement => {
    const originalPrice = priceElement.innerText;
    const price = parseFloat(originalPrice.replace(/[^\d.]/g, ''));
    
    if (price) {
      // 添加人民币转换
      const cnyPrice = (price * 7.2).toFixed(2);
      priceElement.innerHTML = `
        ${originalPrice}
        <span style="color: #999; font-size: 12px; margin-left: 5px;">
          (约 ¥${cnyPrice})
        </span>
      `;
    }
  });
}

// ========================================
// 示例 7: 与 Popup/Background 通信
// ========================================

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_PAGE_INFO') {
    sendResponse({
      title: document.title,
      url: window.location.href,
      linkCount: document.querySelectorAll('a').length
    });
  }
  
  if (request.action === 'HIGHLIGHT_TEXT') {
    highlightText(request.text);
    sendResponse({ success: true });
  }
  
  return true; // 保持消息通道开放
});

// 发送消息给 background
function sendToBackground(data) {
  chrome.runtime.sendMessage({
    type: 'CONTENT_DATA',
    data: data
  });
}

// ========================================
// 示例 8: 高亮文本
// ========================================
function highlightText(searchText) {
  // 移除之前的高亮
  document.querySelectorAll('.extension-highlight').forEach(el => {
    el.classList.remove('extension-highlight');
  });
  
  // 查找并高亮新文本
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  const nodes = [];
  while (walker.nextNode()) {
    if (walker.currentNode.textContent.includes(searchText)) {
      nodes.push(walker.currentNode);
    }
  }
  
  nodes.forEach(node => {
    const parent = node.parentNode;
    const text = node.textContent;
    const parts = text.split(searchText);
    
    const fragment = document.createDocumentFragment();
    parts.forEach((part, i) => {
      fragment.appendChild(document.createTextNode(part));
      if (i < parts.length - 1) {
        const highlight = document.createElement('span');
        highlight.className = 'extension-highlight';
        highlight.style.cssText = 'background: yellow; color: black; padding: 2px;';
        highlight.textContent = searchText;
        fragment.appendChild(highlight);
      }
    });
    
    parent.replaceChild(fragment, node);
  });
}

// ========================================
// 示例 9: 等待元素加载
// ========================================
function waitForElement(selector, callback, timeout = 5000) {
  const startTime = Date.now();
  
  const checkExist = setInterval(() => {
    const element = document.querySelector(selector);
    
    if (element) {
      clearInterval(checkExist);
      callback(element);
    } else if (Date.now() - startTime > timeout) {
      clearInterval(checkExist);
      console.log('元素未找到:', selector);
    }
  }, 100);
}

// 使用示例
waitForElement('.product-list', (element) => {
  console.log('产品列表加载完成:', element);
  // 在这里操作元素
});

// ========================================
// 初始化
// ========================================
console.log('🚀 Content Script 已加载');

// 页面加载完成后执行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  console.log('✅ 页面已加载，开始初始化');
  
  // 添加浮动按钮
  addFloatingButton();
  
  // 监听页面变化
  watchPageChanges();
}
```

---

## 🔧 Popup 与 Content Script 通信

**popup.js**:
```javascript
// 向当前标签页的 content script 发送消息
document.getElementById('extractBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.tabs.sendMessage(tab.id, {
    action: 'GET_PAGE_INFO'
  }, (response) => {
    console.log('收到页面信息:', response);
    document.getElementById('result').innerText = JSON.stringify(response, null, 2);
  });
});
```

**popup.html**:
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { width: 300px; padding: 20px; font-family: sans-serif; }
    button { padding: 10px 20px; cursor: pointer; }
    #result { margin-top: 10px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h3>页面数据提取器</h3>
  <button id="extractBtn">📊 提取页面信息</button>
  <div id="result"></div>
  <script src="popup.js"></script>
</body>
</html>
```

---

## 🎨 实际应用案例

### 1. 价格监控扩展
```javascript
// 监控电商网站价格变化
function monitorPriceChanges() {
  const priceElement = document.querySelector('.product-price');
  
  const observer = new MutationObserver(() => {
    const newPrice = priceElement.innerText;
    chrome.runtime.sendMessage({
      type: 'PRICE_CHANGED',
      price: newPrice
    });
  });
  
  observer.observe(priceElement, {
    childList: true,
    characterData: true,
    subtree: true
  });
}
```

### 2. 广告屏蔽扩展
```javascript
// 移除页面广告
function removeAds() {
  const adSelectors = [
    '.advertisement',
    '[class*="ad-"]',
    '[id*="ad-"]',
    'iframe[src*="ads"]'
  ];
  
  adSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(ad => {
      ad.remove();
    });
  });
}

// 持续监控新出现的广告
setInterval(removeAds, 1000);
```

### 3. 页面翻译扩展
```javascript
// 翻译选中的文本
document.addEventListener('mouseup', async () => {
  const selectedText = window.getSelection().toString().trim();
  
  if (selectedText) {
    // 调用翻译 API
    const translation = await translateText(selectedText);
    
    // 显示翻译结果
    showTranslationTooltip(translation);
  }
});
```

---

## 🚨 注意事项

### 1. 权限和安全
```json
{
  "permissions": [
    "activeTab",      // 访问当前标签页
    "scripting",      // 动态注入脚本
    "storage"         // 存储数据
  ],
  "host_permissions": [
    "https://*/*"     // 访问哪些网站
  ]
}
```

### 2. 隔离性
- Content Script 与页面 JavaScript 是**隔离**的
- 不能直接访问页面的全局变量
- 需要通过 `window.postMessage` 与页面通信

### 3. 性能优化
```javascript
// ❌ 不好：每次都查询
setInterval(() => {
  document.querySelectorAll('.item').forEach(item => {
    // 处理...
  });
}, 100);

// ✅ 好：使用 MutationObserver
const observer = new MutationObserver((mutations) => {
  // 只在真正变化时处理
});
```

---

## 📚 完整示例项目结构

```
my-extension/
├── manifest.json
├── popup.html
├── popup.js
├── content.js          ← Content Script
├── content.css         ← 注入的样式
├── background.js
└── images/
    └── icon.png
```

---

## 🎯 常见应用场景

1. **数据提取工具**：抓取电商数据、新闻内容
2. **页面增强**：添加额外功能、快捷按钮
3. **自动化操作**：自动填表、批量操作
4. **内容过滤**：广告屏蔽、内容净化
5. **页面美化**：更换主题、调整布局
6. **翻译工具**：实时翻译网页内容
7. **价格监控**：跟踪商品价格变化

---

**总结**：Content Scripts 是 Chrome 扩展最强大的功能，可以完全控制网页的 DOM，实现各种神奇的功能！

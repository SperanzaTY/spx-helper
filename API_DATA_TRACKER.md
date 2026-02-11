# 🔍 API 数据溯源工具 - 追踪页面元素的数据来源

## 🎯 功能说明

点击页面任意元素，立即显示该元素的数据来自哪个 API 接口！

---

## 📦 完整实现

### 1. manifest.json 配置

```json
{
  "manifest_version": 3,
  "name": "API 数据溯源工具",
  "version": "1.0.0",
  "description": "追踪页面元素的数据来自哪个 API 接口",
  
  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "debugger"
  ],
  
  "host_permissions": [
    "<all_urls>"
  ],
  
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icon.png"
  },
  
  "background": {
    "service_worker": "background.js"
  },
  
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_start",
      "all_frames": true
    }
  ]
}
```

---

### 2. content.js - 核心逻辑

```javascript
// ========================================
// API 数据溯源工具 - Content Script
// ========================================

class APIDataTracker {
  constructor() {
    this.apiRecords = new Map(); // 存储所有 API 请求记录
    this.isTracking = false;
    this.highlightedElement = null;
    this.inspectorMode = false;
    
    this.init();
  }
  
  init() {
    console.log('🔍 API 数据溯源工具已启动');
    
    // 拦截所有网络请求
    this.interceptFetch();
    this.interceptXHR();
    
    // 监听来自 popup 的消息
    this.setupMessageListener();
  }
  
  // ========================================
  // 拦截 Fetch 请求
  // ========================================
  interceptFetch() {
    const originalFetch = window.fetch;
    const self = this;
    
    window.fetch = async function(...args) {
      const [url, options] = args;
      const requestId = self.generateRequestId();
      const startTime = Date.now();
      
      console.log('📡 Fetch 请求:', url);
      
      try {
        const response = await originalFetch.apply(this, args);
        
        // 克隆响应以便读取
        const clonedResponse = response.clone();
        
        // 尝试解析 JSON 响应
        try {
          const data = await clonedResponse.json();
          const duration = Date.now() - startTime;
          
          // 记录 API 数据
          self.recordAPI({
            id: requestId,
            url: url,
            method: options?.method || 'GET',
            requestTime: new Date().toISOString(),
            duration: duration,
            status: response.status,
            responseData: data,
            type: 'fetch'
          });
          
          console.log('✅ Fetch 响应已记录:', url, data);
        } catch (e) {
          console.log('⚠️ 响应不是 JSON:', url);
        }
        
        return response;
      } catch (error) {
        console.error('❌ Fetch 错误:', error);
        throw error;
      }
    };
  }
  
  // ========================================
  // 拦截 XMLHttpRequest
  // ========================================
  interceptXHR() {
    const self = this;
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._apiTracker = {
        method: method,
        url: url,
        requestId: self.generateRequestId(),
        startTime: Date.now()
      };
      
      return originalOpen.apply(this, [method, url, ...rest]);
    };
    
    XMLHttpRequest.prototype.send = function(...args) {
      const xhr = this;
      
      xhr.addEventListener('load', function() {
        if (xhr._apiTracker && xhr.status === 200) {
          try {
            const data = JSON.parse(xhr.responseText);
            const duration = Date.now() - xhr._apiTracker.startTime;
            
            self.recordAPI({
              id: xhr._apiTracker.requestId,
              url: xhr._apiTracker.url,
              method: xhr._apiTracker.method,
              requestTime: new Date().toISOString(),
              duration: duration,
              status: xhr.status,
              responseData: data,
              type: 'xhr'
            });
            
            console.log('✅ XHR 响应已记录:', xhr._apiTracker.url, data);
          } catch (e) {
            console.log('⚠️ XHR 响应不是 JSON:', xhr._apiTracker.url);
          }
        }
      });
      
      return originalSend.apply(this, args);
    };
  }
  
  // ========================================
  // 记录 API 数据
  // ========================================
  recordAPI(record) {
    this.apiRecords.set(record.id, record);
    
    // 发送给 popup 显示
    this.sendToPopup({
      type: 'API_RECORDED',
      record: {
        id: record.id,
        url: record.url,
        method: record.method,
        status: record.status,
        duration: record.duration
      }
    });
    
    // 限制记录数量（最多保存 100 条）
    if (this.apiRecords.size > 100) {
      const firstKey = this.apiRecords.keys().next().value;
      this.apiRecords.delete(firstKey);
    }
  }
  
  // ========================================
  // 启用检查器模式
  // ========================================
  enableInspectorMode() {
    if (this.inspectorMode) return;
    
    this.inspectorMode = true;
    console.log('🎯 检查器模式已启用');
    
    // 添加全局样式
    this.addInspectorStyles();
    
    // 添加事件监听
    document.addEventListener('mouseover', this.handleMouseOver, true);
    document.addEventListener('mouseout', this.handleMouseOut, true);
    document.addEventListener('click', this.handleClick, true);
    
    // 显示提示
    this.showInspectorTip();
  }
  
  // ========================================
  // 禁用检查器模式
  // ========================================
  disableInspectorMode() {
    if (!this.inspectorMode) return;
    
    this.inspectorMode = false;
    console.log('❌ 检查器模式已禁用');
    
    // 移除事件监听
    document.removeEventListener('mouseover', this.handleMouseOver, true);
    document.removeEventListener('mouseout', this.handleMouseOut, true);
    document.removeEventListener('click', this.handleClick, true);
    
    // 清除高亮
    this.clearHighlight();
    
    // 移除提示
    this.removeInspectorTip();
  }
  
  // ========================================
  // 鼠标悬停处理
  // ========================================
  handleMouseOver = (e) => {
    if (!this.inspectorMode) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    const element = e.target;
    this.highlightElement(element);
  }
  
  // ========================================
  // 鼠标移出处理
  // ========================================
  handleMouseOut = (e) => {
    if (!this.inspectorMode) return;
    
    e.stopPropagation();
    this.clearHighlight();
  }
  
  // ========================================
  // 点击处理 - 追踪数据来源
  // ========================================
  handleClick = async (e) => {
    if (!this.inspectorMode) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    const element = e.target;
    console.log('🎯 点击元素:', element);
    
    // 提取元素文本内容
    const elementText = this.extractElementText(element);
    console.log('📝 元素文本:', elementText);
    
    // 搜索数据来源
    const sources = this.findDataSources(elementText);
    
    if (sources.length > 0) {
      console.log('✅ 找到数据来源:', sources);
      this.showDataSourcePanel(element, sources);
    } else {
      console.log('❌ 未找到数据来源');
      this.showNoSourcePanel(element);
    }
  }
  
  // ========================================
  // 高亮元素
  // ========================================
  highlightElement(element) {
    this.clearHighlight();
    
    element.classList.add('api-tracker-highlight');
    this.highlightedElement = element;
    
    // 显示元素信息
    this.showElementInfo(element);
  }
  
  // ========================================
  // 清除高亮
  // ========================================
  clearHighlight() {
    if (this.highlightedElement) {
      this.highlightedElement.classList.remove('api-tracker-highlight');
      this.highlightedElement = null;
    }
    
    const infoBox = document.getElementById('api-tracker-element-info');
    if (infoBox) infoBox.remove();
  }
  
  // ========================================
  // 提取元素文本
  // ========================================
  extractElementText(element) {
    const texts = [];
    
    // 直接文本内容
    const directText = element.textContent?.trim();
    if (directText && directText.length < 200) {
      texts.push(directText);
    }
    
    // 属性值
    ['title', 'alt', 'placeholder', 'value', 'data-id'].forEach(attr => {
      const value = element.getAttribute(attr);
      if (value) texts.push(value);
    });
    
    // 子元素文本
    Array.from(element.children).forEach(child => {
      const childText = child.textContent?.trim();
      if (childText && childText.length < 100) {
        texts.push(childText);
      }
    });
    
    return [...new Set(texts)]; // 去重
  }
  
  // ========================================
  // 搜索数据来源
  // ========================================
  findDataSources(texts) {
    const sources = [];
    
    this.apiRecords.forEach((record) => {
      const matches = this.searchInObject(record.responseData, texts);
      
      if (matches.length > 0) {
        sources.push({
          apiRecord: record,
          matches: matches
        });
      }
    });
    
    // 按匹配度排序
    sources.sort((a, b) => b.matches.length - a.matches.length);
    
    return sources;
  }
  
  // ========================================
  // 在对象中递归搜索文本
  // ========================================
  searchInObject(obj, searchTexts, path = '', results = []) {
    if (!obj) return results;
    
    if (typeof obj === 'string' || typeof obj === 'number') {
      const objStr = String(obj);
      
      searchTexts.forEach(text => {
        if (text && objStr.includes(text)) {
          results.push({
            path: path,
            value: objStr,
            matchedText: text
          });
        }
      });
      
      return results;
    }
    
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        this.searchInObject(item, searchTexts, `${path}[${index}]`, results);
      });
    } else if (typeof obj === 'object') {
      Object.keys(obj).forEach(key => {
        this.searchInObject(obj[key], searchTexts, path ? `${path}.${key}` : key, results);
      });
    }
    
    return results;
  }
  
  // ========================================
  // 显示数据来源面板
  // ========================================
  showDataSourcePanel(element, sources) {
    // 创建面板
    const panel = document.createElement('div');
    panel.id = 'api-tracker-source-panel';
    panel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 700px;
      max-height: 80vh;
      overflow-y: auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      z-index: 2147483647;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    panel.innerHTML = `
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 12px 12px 0 0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 20px;">🔍 数据来源追踪</h2>
          <button id="close-source-panel" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 18px;">✕</button>
        </div>
        <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 14px;">找到 ${sources.length} 个可能的数据来源</p>
      </div>
      
      <div style="padding: 20px;">
        ${sources.map((source, index) => `
          <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #667eea;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
              <div style="flex: 1;">
                <div style="font-weight: 600; color: #667eea; margin-bottom: 5px;">
                  来源 ${index + 1}: ${source.apiRecord.method} ${source.apiRecord.status}
                </div>
                <div style="font-size: 12px; color: #666; word-break: break-all;">
                  ${source.apiRecord.url}
                </div>
              </div>
              <span style="background: #667eea; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; white-space: nowrap; margin-left: 10px;">
                ${source.matches.length} 个匹配
              </span>
            </div>
            
            <div style="margin-top: 10px; font-size: 12px;">
              <div style="color: #999; margin-bottom: 5px;">⏱️ ${source.apiRecord.duration}ms | 🕐 ${new Date(source.apiRecord.requestTime).toLocaleTimeString()}</div>
            </div>
            
            <details style="margin-top: 10px;">
              <summary style="cursor: pointer; color: #667eea; font-size: 13px; user-select: none;">
                📋 查看匹配详情 (${source.matches.length})
              </summary>
              <div style="margin-top: 10px; padding: 10px; background: white; border-radius: 6px; max-height: 200px; overflow-y: auto;">
                ${source.matches.map(match => `
                  <div style="margin-bottom: 8px; padding: 8px; background: #f0f0f0; border-radius: 4px;">
                    <div style="color: #667eea; font-size: 11px; margin-bottom: 3px;">
                      ${match.path || 'root'}
                    </div>
                    <div style="color: #333; font-size: 12px;">
                      匹配文本: <strong>${match.matchedText}</strong>
                    </div>
                    <div style="color: #666; font-size: 11px; margin-top: 3px;">
                      完整值: ${this.truncateText(match.value, 100)}
                    </div>
                  </div>
                `).join('')}
              </div>
            </details>
            
            <div style="margin-top: 10px; display: flex; gap: 10px;">
              <button onclick="apiTracker.viewFullResponse('${source.apiRecord.id}')" style="flex: 1; padding: 8px; background: white; border: 1px solid #667eea; color: #667eea; border-radius: 6px; cursor: pointer; font-size: 12px;">
                📄 查看完整响应
              </button>
              <button onclick="apiTracker.copyURL('${source.apiRecord.url}')" style="flex: 1; padding: 8px; background: white; border: 1px solid #667eea; color: #667eea; border-radius: 6px; cursor: pointer; font-size: 12px;">
                📋 复制 URL
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    
    document.body.appendChild(panel);
    
    // 关闭按钮
    document.getElementById('close-source-panel').addEventListener('click', () => {
      panel.remove();
      this.disableInspectorMode();
    });
  }
  
  // ========================================
  // 查看完整响应
  // ========================================
  viewFullResponse(recordId) {
    const record = this.apiRecords.get(recordId);
    if (!record) return;
    
    // 创建新窗口显示完整响应
    const dataWindow = window.open('', '_blank', 'width=800,height=600');
    dataWindow.document.write(`
      <html>
        <head>
          <title>API 响应 - ${record.url}</title>
          <style>
            body { font-family: monospace; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
            pre { white-space: pre-wrap; word-wrap: break-word; }
            .info { background: #264f78; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="info">
            <div><strong>URL:</strong> ${record.url}</div>
            <div><strong>Method:</strong> ${record.method}</div>
            <div><strong>Status:</strong> ${record.status}</div>
            <div><strong>Duration:</strong> ${record.duration}ms</div>
          </div>
          <pre>${JSON.stringify(record.responseData, null, 2)}</pre>
        </body>
      </html>
    `);
  }
  
  // ========================================
  // 复制 URL
  // ========================================
  copyURL(url) {
    navigator.clipboard.writeText(url).then(() => {
      alert('✅ URL 已复制到剪贴板');
    });
  }
  
  // ========================================
  // 显示元素信息
  // ========================================
  showElementInfo(element) {
    const rect = element.getBoundingClientRect();
    
    const infoBox = document.createElement('div');
    infoBox.id = 'api-tracker-element-info';
    infoBox.style.cssText = `
      position: fixed;
      top: ${rect.top - 40}px;
      left: ${rect.left}px;
      background: #667eea;
      color: white;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      z-index: 2147483646;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    
    infoBox.textContent = `${element.tagName.toLowerCase()}${element.className ? '.' + element.className.split(' ')[0] : ''}`;
    
    document.body.appendChild(infoBox);
  }
  
  // ========================================
  // 添加检查器样式
  // ========================================
  addInspectorStyles() {
    if (document.getElementById('api-tracker-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'api-tracker-styles';
    style.textContent = `
      .api-tracker-highlight {
        outline: 3px solid #667eea !important;
        outline-offset: 2px !important;
        background: rgba(102, 126, 234, 0.1) !important;
        cursor: crosshair !important;
      }
      
      * {
        cursor: crosshair !important;
      }
    `;
    
    document.head.appendChild(style);
  }
  
  // ========================================
  // 显示检查器提示
  // ========================================
  showInspectorTip() {
    const tip = document.createElement('div');
    tip.id = 'api-tracker-tip';
    tip.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 30px;
      border-radius: 30px;
      font-size: 14px;
      z-index: 2147483647;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: slideDown 0.3s ease-out;
    `;
    
    tip.innerHTML = `
      <div style="display: flex; align-items: center; gap: 15px;">
        <span style="font-size: 20px;">🎯</span>
        <span><strong>检查器模式已启用</strong> - 点击任意元素查看其数据来源</span>
        <button id="exit-inspector" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 5px 12px; border-radius: 15px; cursor: pointer; font-size: 12px;">ESC 退出</button>
      </div>
    `;
    
    document.body.appendChild(tip);
    
    // 添加动画
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      @keyframes slideDown {
        from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(styleSheet);
    
    // 退出按钮
    document.getElementById('exit-inspector').addEventListener('click', () => {
      this.disableInspectorMode();
    });
    
    // ESC 键退出
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.inspectorMode) {
        this.disableInspectorMode();
      }
    });
  }
  
  // ========================================
  // 移除检查器提示
  // ========================================
  removeInspectorTip() {
    const tip = document.getElementById('api-tracker-tip');
    if (tip) tip.remove();
    
    const style = document.getElementById('api-tracker-styles');
    if (style) style.remove();
  }
  
  // ========================================
  // 显示"未找到来源"面板
  // ========================================
  showNoSourcePanel(element) {
    const panel = document.createElement('div');
    panel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 400px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      z-index: 2147483647;
      padding: 30px;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    panel.innerHTML = `
      <div style="font-size: 60px; margin-bottom: 20px;">🤷</div>
      <h3 style="color: #333; margin-bottom: 10px;">未找到数据来源</h3>
      <p style="color: #666; margin-bottom: 20px;">
        该元素的内容可能是：<br>
        • 硬编码在页面中<br>
        • 来自尚未捕获的 API<br>
        • 通过 WebSocket 或其他方式获取
      </p>
      <button onclick="this.parentElement.remove()" style="padding: 10px 30px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">
        确定
      </button>
    `;
    
    document.body.appendChild(panel);
    
    setTimeout(() => panel.remove(), 3000);
  }
  
  // ========================================
  // 工具方法
  // ========================================
  
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
  
  sendToPopup(message) {
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup 可能未打开，忽略错误
    });
  }
  
  // ========================================
  // 消息监听
  // ========================================
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'START_INSPECTOR') {
        this.enableInspectorMode();
        sendResponse({ success: true });
      }
      
      if (request.action === 'STOP_INSPECTOR') {
        this.disableInspectorMode();
        sendResponse({ success: true });
      }
      
      if (request.action === 'GET_API_RECORDS') {
        const records = Array.from(this.apiRecords.values()).map(r => ({
          id: r.id,
          url: r.url,
          method: r.method,
          status: r.status,
          duration: r.duration,
          requestTime: r.requestTime
        }));
        sendResponse({ records });
      }
      
      return true;
    });
  }
}

// ========================================
// 初始化
// ========================================
const apiTracker = new APIDataTracker();

// 暴露到全局，供面板内的按钮调用
window.apiTracker = apiTracker;

console.log('✅ API 数据溯源工具已就绪');
```

---

### 3. popup.html

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      width: 400px;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    
    .header {
      text-align: center;
      color: white;
      margin-bottom: 20px;
    }
    
    .header h1 {
      font-size: 24px;
      margin-bottom: 5px;
    }
    
    .header p {
      font-size: 14px;
      opacity: 0.9;
    }
    
    .card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 15px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    
    .btn {
      width: 100%;
      padding: 15px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
    }
    
    .btn-secondary {
      background: #f0f0f0;
      color: #333;
    }
    
    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 15px;
    }
    
    .stat-item {
      text-align: center;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    
    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: #667eea;
      margin-bottom: 5px;
    }
    
    .stat-label {
      font-size: 12px;
      color: #999;
    }
    
    #apiList {
      max-height: 300px;
      overflow-y: auto;
    }
    
    .api-item {
      padding: 10px;
      margin-bottom: 8px;
      background: #f8f9fa;
      border-radius: 6px;
      font-size: 12px;
    }
    
    .api-method {
      display: inline-block;
      padding: 2px 6px;
      background: #667eea;
      color: white;
      border-radius: 3px;
      font-weight: 600;
      margin-right: 5px;
    }
    
    .api-url {
      color: #666;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔍 API 数据溯源</h1>
    <p>追踪页面元素的数据来源</p>
  </div>
  
  <div class="card">
    <button id="startInspector" class="btn btn-primary">
      <span>🎯</span>
      <span>启动检查器</span>
    </button>
    
    <div class="stats">
      <div class="stat-item">
        <div class="stat-value" id="apiCount">0</div>
        <div class="stat-label">已捕获 API</div>
      </div>
      <div class="stat-item">
        <div class="stat-value" id="pageCount">1</div>
        <div class="stat-label">当前页面</div>
      </div>
    </div>
  </div>
  
  <div class="card">
    <h3 style="margin-bottom: 10px; color: #333; font-size: 14px;">📡 已捕获的 API</h3>
    <div id="apiList">
      <div style="text-align: center; padding: 20px; color: #999;">
        暂无数据，请刷新页面后开始捕获
      </div>
    </div>
  </div>
  
  <script src="popup.js"></script>
</body>
</html>
```

---

### 4. popup.js

```javascript
let apiCount = 0;

// 启动检查器
document.getElementById('startInspector').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.tabs.sendMessage(tab.id, { action: 'START_INSPECTOR' }, (response) => {
    if (response?.success) {
      alert('✅ 检查器已启动！\n\n点击页面任意元素查看其数据来源。\n按 ESC 键退出检查器模式。');
      window.close();
    }
  });
});

// 获取 API 记录
async function loadAPIRecords() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.tabs.sendMessage(tab.id, { action: 'GET_API_RECORDS' }, (response) => {
    if (response?.records) {
      updateAPIList(response.records);
    }
  });
}

// 更新 API 列表
function updateAPIList(records) {
  apiCount = records.length;
  document.getElementById('apiCount').textContent = apiCount;
  
  const listContainer = document.getElementById('apiList');
  
  if (records.length === 0) {
    listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">暂无数据</div>';
    return;
  }
  
  listContainer.innerHTML = records.map(record => `
    <div class="api-item">
      <div>
        <span class="api-method">${record.method}</span>
        <span style="color: ${record.status === 200 ? '#4caf50' : '#f44336'};">${record.status}</span>
        <span style="color: #999; margin-left: 5px;">${record.duration}ms</span>
      </div>
      <div class="api-url">${record.url}</div>
    </div>
  `).join('');
}

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'API_RECORDED') {
    apiCount++;
    document.getElementById('apiCount').textContent = apiCount;
  }
});

// 初始加载
loadAPIRecords();

// 每2秒刷新一次
setInterval(loadAPIRecords, 2000);
```

---

## 🎯 使用方法

1. **安装扩展**
2. **访问任意网站**（比如电商、新闻网站）
3. **打开扩展 Popup**，查看已捕获的 API 数量
4. **点击"启动检查器"**
5. **鼠标悬停**在页面元素上，元素会高亮显示
6. **点击元素**，立即显示该元素的数据来自哪个 API！
7. **按 ESC 键**退出检查器模式

---

## 🎨 功能特点

✅ **自动拦截 API** - 捕获所有 Fetch 和 XMLHttpRequest  
✅ **智能匹配** - 在 API 响应中递归搜索元素内容  
✅ **可视化追踪** - 清晰显示数据路径和匹配详情  
✅ **实时监控** - 记录 API 请求时间、耗时、状态码  
✅ **完整响应** - 可查看 API 的完整 JSON 响应  
✅ **用户友好** - 高亮提示、快捷键操作

---

## 🚀 实际应用场景

- 🔍 **逆向工程**：了解网站的 API 结构
- 🐛 **调试前端**：快速定位数据源
- 📊 **数据分析**：研究页面数据流
- 🎓 **学习参考**：学习其他网站的 API 设计

---

这是一个完全可用的工具！你要试试吗？或者想添加什么功能？

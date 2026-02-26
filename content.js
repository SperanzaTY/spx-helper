// ========================================
// SPX Helper - API 数据溯源工具
// Content Script - UI 管理器
// ========================================

console.log('🚀 [SPX Helper] Content Script 开始加载...');

// 注意：API 拦截由 injected.js 完成（运行在 MAIN world）
// 这个脚本负责 UI 交互（运行在 ISOLATED world）

// ========================================
// 扩展上下文检查（防止reload后报错）
// ========================================
function isExtensionContextValid() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

function safeRuntimeCall(fn) {
  if (!isExtensionContextValid()) {
    console.warn('⚠️ [SPX Helper] 扩展上下文已失效，跳过调用');
    return Promise.resolve(null);
  }
  return fn();
}

class APIDataTracker {
  constructor() {
    this.apiRecords = new Map();
    this.inspectorMode = false;
    this.highlightedElement = null;
    this.selectedText = ''; // 新增：存储用户选取的文本
    this.selectionFloatingBtn = null; // 新增：文本选取浮动按钮
    this.textSelectionEnabled = true; // 新增：文本选取功能开关，默认开启
    this.textSelectionListenerAdded = false; // 新增：标记监听器是否已添加
    this.apiFilterKeywords = ['api_mart']; // 新增：API 过滤关键词（默认值）
    
    console.log('🔍 [SPX Helper] Content Script 已加载');
    
    // 从 storage 读取设置
    this.loadSettings().then(() => {
      // 监听文本选取（如果开启）
      if (this.textSelectionEnabled) {
        try {
          this.initTextSelectionListener();
        } catch (err) {
          console.error('❌ [SPX Helper] 初始化文本选取监听器失败:', err);
        }
      } else {
        console.log('⏸️ [SPX Helper] 文本选取功能已禁用');
      }
    });
    
    // 监听来自页面的消息
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      
      if (event.data.type === 'SPX_API_RECORDED') {
        const record = event.data.record;
        this.apiRecords.set(record.id, record);
        
        // 通知 popup（安全调用）
        safeRuntimeCall(() => {
          return chrome.runtime.sendMessage({
            action: 'API_RECORDED',
            record: record
          }).catch(() => {});
        });
      }
    });
  }
  
  // ========================================
  // 加载设置
  // ========================================
  async loadSettings() {
    try {
      const settings = await chrome.storage.local.get({
        textSelectionEnabled: true,
        apiFilterKeywords: 'api_mart'
      });
      
      this.textSelectionEnabled = settings.textSelectionEnabled;
      
      // 解析 API 过滤关键词
      const keywords = settings.apiFilterKeywords || '';
      if (keywords.trim() === '') {
        // 空字符串表示不过滤任何接口
        this.apiFilterKeywords = [];
        console.log('⚙️ [SPX Helper] API 过滤条件: 显示所有接口');
      } else {
        this.apiFilterKeywords = keywords.split(',').map(k => k.trim()).filter(k => k);
        console.log('⚙️ [SPX Helper] API 过滤条件:', this.apiFilterKeywords);
      }
      
      console.log('⚙️ [SPX Helper] 设置已加载:', {
        textSelectionEnabled: this.textSelectionEnabled,
        apiFilterKeywords: this.apiFilterKeywords
      });
    } catch (err) {
      console.error('❌ [SPX Helper] 加载设置失败:', err);
      this.textSelectionEnabled = true; // 默认开启
      this.apiFilterKeywords = ['api_mart']; // 默认过滤条件
    }
  }
  
  // ========================================
  // API 过滤方法
  // ========================================
  shouldShowAPI(url) {
    // 如果没有设置过滤条件，显示所有接口
    if (this.apiFilterKeywords.length === 0) {
      return true;
    }
    
    // 检查 URL 是否包含任一关键词
    return this.apiFilterKeywords.some(keyword => url.includes(keyword));
  }
  
  // ========================================
  // 文本选取监听器
  // ========================================
  initTextSelectionListener() {
    // 防止重复添加监听器
    if (this.textSelectionListenerAdded) {
      console.log('⏭️ [SPX Helper] 文本选取监听器已存在，跳过');
      return;
    }
    
    console.log('✅ [SPX Helper] 初始化文本选取监听器');
    this.textSelectionListenerAdded = true;
    
    document.addEventListener('mouseup', (e) => {
      console.log('🖱️ [SPX Helper] mouseup 事件触发');
      
      // 检查功能是否开启
      if (!this.textSelectionEnabled) {
        console.log('⏸️ [SPX Helper] 文本选取功能已禁用');
        return;
      }
      
      // 如果点击的是浮动按钮，不处理
      if (e.target.closest('#spx-selection-floating-btn')) {
        console.log('⏭️ [SPX Helper] 点击的是浮动按钮，跳过');
        return;
      }
      
      // 如果检查器模式开启，不处理文本选取（避免冲突）
      if (this.inspectorMode) {
        console.log('⏭️ [SPX Helper] 检查器模式开启，跳过文本选取');
        return;
      }
      
      // 获取选中的文本
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();
      
      console.log('📝 [SPX Helper] 选中的文本:', selectedText, '长度:', selectedText.length);
      
      // 如果没有选中文本或文本太短，隐藏按钮
      if (!selectedText || selectedText.length < 1) {
        this.hideSelectionFloatingBtn();
        return;
      }
      
      // 如果是在我们自己的 UI 元素上选择，忽略
      try {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const element = container.nodeType === Node.TEXT_NODE 
          ? container.parentElement 
          : container;
        
        if (this.isOurElement(element)) {
          console.log('⏭️ [SPX Helper] 在扩展自身元素上选择，忽略');
          return;
        }
      } catch (err) {
        console.error('❌ [SPX Helper] 获取选区失败:', err);
        return;
      }
      
      this.selectedText = selectedText;
      console.log('✅ [SPX Helper] 用户选取文本:', selectedText);
      
      // 显示浮动按钮
      this.showSelectionFloatingBtn(e.clientX, e.clientY);
    });
    
    // 点击页面其他地方时隐藏按钮
    document.addEventListener('mousedown', (e) => {
      if (this.selectionFloatingBtn && !this.selectionFloatingBtn.contains(e.target)) {
        // 延迟隐藏，避免点击按钮时被隐藏
        setTimeout(() => {
          const selection = window.getSelection();
          if (!selection.toString().trim()) {
            this.hideSelectionFloatingBtn();
          }
        }, 100);
      }
    });
  }
  
  // ========================================
  // 显示文本选取浮动按钮
  // ========================================
  showSelectionFloatingBtn(x, y) {
    // 移除旧按钮
    this.hideSelectionFloatingBtn();
    
    const btn = document.createElement('div');
    btn.id = 'spx-selection-floating-btn';
    btn.className = 'spx-selection-floating-btn';
    btn.style.cssText = `
      position: fixed;
      top: ${y + 10}px;
      left: ${x + 10}px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 8px 15px;
      border-radius: 20px;
      font-size: 12px;
      cursor: pointer;
      z-index: 2147483647;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.2s;
      user-select: none;
    `;
    btn.innerHTML = `
      <span style="font-size: 14px;">🔍</span>
      <span>查找来源</span>
    `;
    
    // 悬停效果
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });
    
    // 点击按钮搜索数据来源
    btn.addEventListener('click', (e) => {
      console.log('🖱️ [SPX Helper] 浮动按钮被点击');
      e.stopPropagation();
      e.preventDefault();
      this.searchSelectedText();
    });
    
    document.body.appendChild(btn);
    this.selectionFloatingBtn = btn;
    
    console.log('✅ [SPX Helper] 显示文本选取浮动按钮');
  }
  
  // ========================================
  // 隐藏文本选取浮动按钮
  // ========================================
  hideSelectionFloatingBtn() {
    if (this.selectionFloatingBtn) {
      this.selectionFloatingBtn.remove();
      this.selectionFloatingBtn = null;
    }
  }
  
  // ========================================
  // 搜索选中的文本
  // ========================================
  searchSelectedText() {
    console.log('🎯 [SPX Helper] searchSelectedText 方法被调用');
    
    // 检查功能是否开启
    if (!this.textSelectionEnabled) {
      console.log('⏸️ [SPX Helper] 文本选取功能已禁用，取消搜索');
      this.hideSelectionFloatingBtn();
      return;
    }
    
    console.log('   当前 selectedText:', this.selectedText);
    console.log('   API 记录数量:', this.apiRecords.size);
    
    if (!this.selectedText) {
      console.warn('⚠️ [SPX Helper] 没有选中的文本');
      return;
    }
    
    console.log('🔎 [SPX Helper] 开始搜索选中文本:', this.selectedText);
    
    // 格式化文本（去除千分位、货币符号等）
    const normalizedTexts = this.normalizeSelectedText(this.selectedText);
    console.log('📝 [SPX Helper] 格式化后的文本:', normalizedTexts);
    
    // 在 API 记录中搜索
    const sources = this.findDataSources(normalizedTexts);
    
    if (sources.length === 0) {
      this.showNoSourcePanel();
    } else {
      // 显示搜索结果面板（使用 showDataSourcePanel）
      this.showDataSourcePanel(null, sources);
    }
    
    // 隐藏浮动按钮
    this.hideSelectionFloatingBtn();
  }
  
  // ========================================
  // 格式化选中的文本（去除千分位、符号等）
  // ========================================
  normalizeSelectedText(text) {
    const normalized = [];
    
    // 1. 原始文本
    normalized.push(text);
    
    // 2. 去除千分位逗号（1,234,567 → 1234567）
    const withoutComma = text.replace(/,/g, '');
    if (withoutComma !== text) {
      normalized.push(withoutComma);
    }
    
    // 3. 去除货币符号和空格（$1,234.56 → 1234.56）
    const withoutCurrency = text.replace(/[$€¥₹£\s,]/g, '');
    if (withoutCurrency !== text && withoutCurrency !== withoutComma) {
      normalized.push(withoutCurrency);
    }
    
    // 4. 只保留数字和小数点（1,234.56% → 1234.56）
    const digitsOnly = text.replace(/[^0-9.]/g, '');
    if (digitsOnly && digitsOnly !== withoutCurrency) {
      normalized.push(digitsOnly);
    }
    
    // 5. 只保留数字（1234.56 → 123456）
    const pureDigits = text.replace(/[^0-9]/g, '');
    if (pureDigits && pureDigits.length >= 2) {
      normalized.push(pureDigits);
    }
    
    // 去重
    return [...new Set(normalized)].filter(t => t && t.length > 0);
  }
  
  // ========================================
  // 显示"未找到来源"面板
  // ========================================
  showNoSourcePanel() {
    // 移除旧面板
    const oldPanel = document.getElementById('spx-api-no-source-panel');
    if (oldPanel) oldPanel.remove();
    
    const panel = document.createElement('div');
    panel.id = 'spx-api-no-source-panel';
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
      <div style="font-size: 48px; margin-bottom: 15px;">🔍</div>
      <h3 style="margin: 0 0 10px 0; color: #333;">未找到数据来源</h3>
      <p style="color: #666; margin: 0 0 15px 0; font-size: 14px;">
        选中的文本: <strong style="color: #667eea;">${this.selectedText}</strong>
      </p>
      <p style="color: #999; font-size: 12px; margin: 0 0 20px 0;">
        可能原因：<br>
        1. API 响应中不包含此数据<br>
        2. 数据格式不匹配<br>
        3. 页面加载时未捕获到 API 请求
      </p>
      <button id="spx-no-source-close-btn" style="
        background: #667eea;
        color: white;
        border: none;
        border-radius: 8px;
        padding: 10px 20px;
        cursor: pointer;
        font-size: 14px;
      ">知道了</button>
    `;
    
    document.body.appendChild(panel);
    
    // 关闭按钮
    document.getElementById('spx-no-source-close-btn').addEventListener('click', () => {
      panel.remove();
    });
    
    console.log('⚠️ [SPX Helper] 显示"未找到来源"面板');
  }
  
  // ========================================
  // 自动分析 UI → API 字段映射
  // ========================================
  
  // ========================================
  // 启用检查器模式
  // ========================================
  enableInspectorMode() {
    if (this.inspectorMode) {
      console.log('⚠️ [SPX Helper] 检查器模式已经启用');
      return;
    }
    
    this.inspectorMode = true;
    console.log('🎯 [SPX Helper] 检查器模式已启用');
    console.log('📊 [SPX Helper] 当前已捕获 API 数量:', this.apiRecords.size);
    
    this.addInspectorStyles();
    
    document.addEventListener('mouseover', this.handleMouseOver, true);
    document.addEventListener('mouseout', this.handleMouseOut, true);
    document.addEventListener('click', this.handleClick, true);
    
    console.log('✅ [SPX Helper] 事件监听器已注册 (capture 模式)');
    
    this.showInspectorTip();
  }
  
  // ========================================
  // 禁用检查器模式
  // ========================================
  disableInspectorMode() {
    if (!this.inspectorMode) return;
    
    this.inspectorMode = false;
    console.log('❌ [SPX Helper] 检查器模式已禁用');
    
    document.removeEventListener('mouseover', this.handleMouseOver, true);
    document.removeEventListener('mouseout', this.handleMouseOut, true);
    document.removeEventListener('click', this.handleClick, true);
    
    this.clearHighlight();
    this.removeInspectorTip();
  }
  
  // ========================================
  // 事件处理
  // ========================================
  handleMouseOver = async (e) => {
    if (!this.inspectorMode) {
      console.log('⚠️ [SPX Helper] 检查器模式未启用');
      return;
    }
    
    // 忽略我们自己创建的元素
    const element = e.target;
    if (this.isOurElement(element)) {
      console.log('🚫 [SPX Helper] 跳过自己的元素');
      return;
    }
    
    e.stopPropagation();
    this.highlightElement(element);
    
    console.log('🔍 [SPX Helper] 鼠标悬停:', element.tagName, element.textContent?.substring(0, 30));
    console.log('📊 [SPX Helper] 当前 API 数量:', this.apiRecords.size);
    
    // 立即查找数据来源并显示
    const elementText = this.extractElementText(element);
    console.log('📝 [SPX Helper] 提取文本:', elementText);
    
    const sources = this.findDataSources(elementText);
    console.log('📡 [SPX Helper] 找到数据来源:', sources.length);
    
    // 在元素旁边显示数据来源信息（无论是否找到都显示）
    this.showDataSourceTooltip(element, sources);
    console.log('✅ [SPX Helper] 已调用 showDataSourceTooltip');
  }
  
  handleMouseOut = (e) => {
    if (!this.inspectorMode) return;
    e.stopPropagation();
    this.clearHighlight();
    this.hideDataSourceTooltip();
  }
  
  handleClick = async (e) => {
    if (!this.inspectorMode || this.isOurElement(e.target)) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    // 点击时显示完整的数据面板（可选）
    const elementText = this.extractElementText(e.target);
    const sources = this.findDataSources(elementText);
    
    if (sources.length > 0) {
      this.showDataSourcePanel(e.target, sources);
    }
  }
  
  // ========================================
  // 显示/隐藏数据来源提示框
  // ========================================
  showDataSourceTooltip(element, sources) {
    console.log('🎨 [SPX Helper] showDataSourceTooltip 被调用');
    console.log('   元素:', element.tagName, element.className);
    console.log('   数据来源数量:', sources.length);
    
    // 移除旧的提示框
    this.hideDataSourceTooltip();
    
    const rect = element.getBoundingClientRect();
    console.log('   元素位置:', rect.top, rect.left, rect.bottom);
    
    const tooltip = document.createElement('div');
    tooltip.id = 'spx-api-tracker-tooltip';
    tooltip.className = 'spx-api-tracker-tooltip';
    
    if (sources.length === 0) {
      // 未找到数据来源
      const topPos = Math.max(10, rect.bottom + 10);
      console.log('   创建"未找到"提示框，位置:', topPos, rect.left);
      
      tooltip.style.cssText = `
        position: fixed;
        top: ${topPos}px;
        left: ${rect.left}px;
        background: rgba(255, 152, 0, 0.95);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        z-index: 2147483646;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        max-width: 300px;
      `;
      tooltip.innerHTML = `⚠️ 未找到数据来源`;
      console.log('   ⚠️ [SPX Helper] 显示：未找到数据来源');
    } else {
      // 找到数据来源
      const topPos = Math.max(10, rect.bottom + 10);
      console.log('   创建"已找到"提示框，位置:', topPos, rect.left);
      
      tooltip.style.cssText = `
        position: fixed;
        top: ${topPos}px;
        left: ${rect.left}px;
        background: rgba(102, 126, 234, 0.95);
        color: white;
        padding: 10px 15px;
        border-radius: 8px;
        font-size: 12px;
        z-index: 2147483646;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        max-width: 400px;
      `;
      
      const apiList = sources.slice(0, 3).map(source => {
        const url = source.apiRecord.url.length > 50 
          ? source.apiRecord.url.substring(0, 47) + '...' 
          : source.apiRecord.url;
        return `<div style="margin: 3px 0;">
          <strong>${source.apiRecord.method}</strong> ${source.apiRecord.status} 
          <span style="opacity: 0.8; font-size: 10px;">(${source.matches.length} 匹配)</span>
          <div style="font-size: 10px; opacity: 0.7; margin-top: 2px;">${url}</div>
        </div>`;
      }).join('');
      
      tooltip.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">📡 找到 ${sources.length} 个数据来源</div>
        ${apiList}
        ${sources.length > 3 ? `<div style="margin-top: 5px; font-size: 10px; opacity: 0.7;">点击查看全部...</div>` : ''}
      `;
      
      console.log('   ✅ [SPX Helper] 显示：找到', sources.length, '个数据来源');
    }
    
    document.body.appendChild(tooltip);
    console.log('   ✅ [SPX Helper] 提示框已添加到 DOM, id:', tooltip.id);
    
    // 立即检查是否真的在 DOM 中
    setTimeout(() => {
      const check = document.getElementById('spx-api-tracker-tooltip');
      if (check) {
        console.log('   ✅ 确认：提示框在 DOM 中');
        console.log('   样式:', check.style.cssText.substring(0, 100));
      } else {
        console.error('   ❌ 错误：提示框不在 DOM 中！');
      }
    }, 10);
  }
  
  hideDataSourceTooltip() {
    const tooltip = document.getElementById('spx-api-tracker-tooltip');
    if (tooltip) tooltip.remove();
  }
  
  // ========================================
  // 提取元素文本
  // ========================================
  extractElementText(element) {
    const texts = [];
    
    // 直接文本内容
    if (element.textContent) {
      const text = element.textContent.trim();
      if (text && text.length > 0 && text.length < 1000) {
        texts.push(text);
      }
    }
    
    // value 属性（输入框等）
    if (element.value) {
      texts.push(element.value);
    }
    
    // alt, title 属性
    ['alt', 'title', 'placeholder'].forEach(attr => {
      const val = element.getAttribute(attr);
      if (val) texts.push(val);
    });
    
    // 子元素文本（递归深度限制为 2）
    const children = Array.from(element.children).slice(0, 5);
    children.forEach(child => {
      if (child.textContent) {
        const text = child.textContent.trim();
        if (text && text.length > 0 && text.length < 500) {
          texts.push(text);
        }
      }
    });
    
    // 去重
    return [...new Set(texts)];
  }
  
  // ========================================
  // 查找数据来源
  // ========================================
  findDataSources(elementTexts) {
    const sources = [];
    
    console.log('🔎 [SPX Helper] 开始查找数据来源');
    console.log('   Content Script 中的 API 数量:', this.apiRecords.size);
    console.log('   当前过滤条件:', this.apiFilterKeywords.length === 0 ? '不过滤（显示全部）' : this.apiFilterKeywords);
    console.log('   要匹配的文本:', elementTexts);
    
    // 使用 Content Script 中已同步的 API 记录
    this.apiRecords.forEach((record, id) => {
      // 应用过滤条件
      if (!this.shouldShowAPI(record.url)) {
        console.log(`   ⏭️ 跳过 API（不符合过滤条件）: ${record.url}`);
        return; // 跳过不符合过滤条件的接口
      }
      
      const matches = [];
      const matchPaths = [];  // 新增：存储匹配的路径
      
      console.log(`   🔍 检查 API: ${record.url}`);
      console.log(`      响应数据类型: ${typeof record.responseData}`);
      console.log(`      响应数据预览:`, JSON.stringify(record.responseData).substring(0, 200));
      
      elementTexts.forEach(text => {
        console.log(`      → 尝试匹配文本: "${text}"`);
        const matchResult = this.searchInObjectWithPath(record.responseData, text, '', 0, true);
        console.log(`         匹配结果:`, matchResult);
        
        if (matchResult) {
          matches.push(text);
          matchPaths.push(...matchResult.paths);  // 收集所有匹配路径
        }
      });
      
      if (matches.length > 0) {
        console.log('   ✅ 找到匹配:', record.url, '匹配文本:', matches, '路径:', matchPaths);
        sources.push({
          apiRecord: record,
          matches: matches,
          matchPaths: matchPaths  // 新增：传递匹配路径
        });
      }
    });
    
    console.log('   📊 总共找到', sources.length, '个数据来源');
    
    return sources;
  }
  
  // 新增：带路径追踪的搜索函数
  searchInObjectWithPath(obj, searchText, currentPath = '', depth = 0, debug = false) {
    if (depth > 5) {
      return null;
    }
    
    if (!searchText || searchText.length < 1) {
      return null;
    }
    
    const result = { found: false, paths: [] };
    const searchLower = searchText.toLowerCase();
    
    // 检查当前值是否匹配
    const checkMatch = (value) => {
      if (typeof value === 'string') {
        const valueLower = value.toLowerCase();
        if (valueLower.includes(searchLower)) return true;
        
        const searchNormalized = this.normalizeNumber(searchText);
        const valueNormalized = this.normalizeNumber(value);
        if (searchNormalized && valueNormalized && searchNormalized === valueNormalized) {
          return true;
        }
        
        const searchDigitsOnly = this.extractDigitsOnly(searchText);
        const valueDigitsOnly = this.extractDigitsOnly(value);
        if (searchDigitsOnly && valueDigitsOnly && searchDigitsOnly === valueDigitsOnly) {
          return true;
        }
      }
      
      if (typeof value === 'number') {
        const valueStr = value.toString();
        if (valueStr === searchText) return true;
        
        const searchNormalized = this.normalizeNumber(searchText);
        const valueNormalized = this.normalizeNumber(valueStr);
        if (searchNormalized && valueNormalized && searchNormalized === valueNormalized) {
          return true;
        }
      }
      
      return false;
    };
    
    if (checkMatch(obj)) {
      result.found = true;
      result.paths.push({ path: currentPath, value: obj });
      if (debug) console.log(`         ✅ 匹配路径: ${currentPath} = ${obj}`);
    }
    
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        const newPath = currentPath ? `${currentPath}[${index}]` : `[${index}]`;
        const subResult = this.searchInObjectWithPath(item, searchText, newPath, depth + 1, debug);
        if (subResult && subResult.found) {
          result.found = true;
          result.paths.push(...subResult.paths);
        }
      });
    } else if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(key => {
        const newPath = currentPath ? `${currentPath}.${key}` : key;
        const subResult = this.searchInObjectWithPath(obj[key], searchText, newPath, depth + 1, debug);
        if (subResult && subResult.found) {
          result.found = true;
          result.paths.push(...subResult.paths);
        }
      });
    }
    
    return result.found ? result : null;
  }
  
  searchInObject(obj, searchText, depth = 0, debug = false) {
    if (depth > 3) {
      if (debug) console.log(`         [深度限制] 深度 ${depth} 超过 3，停止搜索`);
      return false;
    }
    
    if (!searchText || searchText.length < 1) {
      if (debug) console.log(`         [文本无效] 文本为空或太短: "${searchText}"`);
      return false;
    }
    
    const searchLower = searchText.toLowerCase();
    
    if (typeof obj === 'string') {
      if (debug) console.log(`         [字符串] 比较 "${obj}" vs "${searchText}"`);
      const objLower = obj.toLowerCase();
      
      // 策略 1: 精确文本匹配
      if (objLower.includes(searchLower)) {
        if (debug) console.log(`         ✅ [策略1-文本] 精确匹配成功`);
        return true;
      }
      
      // 策略 2: 标准化数字匹配（保留小数点）
      const searchNormalized = this.normalizeNumber(searchText);
      const objNormalized = this.normalizeNumber(obj);
      if (searchNormalized && objNormalized) {
        if (debug) console.log(`         [策略2-标准化] "${searchNormalized}" vs "${objNormalized}"`);
        if (searchNormalized === objNormalized) {
          if (debug) console.log(`         ✅ [策略2-标准化] 匹配成功`);
          return true;
        }
      }
      
      // 策略 3: 纯数字模糊匹配（去掉所有符号，包括小数点）
      const searchDigitsOnly = this.extractDigitsOnly(searchText);
      const objDigitsOnly = this.extractDigitsOnly(obj);
      if (searchDigitsOnly && objDigitsOnly) {
        if (debug) console.log(`         [策略3-纯数字] "${searchDigitsOnly}" vs "${objDigitsOnly}"`);
        if (searchDigitsOnly === objDigitsOnly) {
          if (debug) console.log(`         ✅ [策略3-纯数字] 匹配成功`);
          return true;
        }
      }
      
      // 策略 4: 字符串模糊匹配（去掉空格、连字符、下划线等）
      const searchAlphanumeric = this.normalizeString(searchText);
      const objAlphanumeric = this.normalizeString(obj);
      if (searchAlphanumeric && objAlphanumeric) {
        if (debug) console.log(`         [策略4-字符串] "${searchAlphanumeric}" vs "${objAlphanumeric}"`);
        // 包含匹配（而不是完全相等）
        if (objAlphanumeric.includes(searchAlphanumeric) || 
            searchAlphanumeric.includes(objAlphanumeric)) {
          if (debug) console.log(`         ✅ [策略4-字符串] 匹配成功`);
          return true;
        }
      }
      
      return false;
    }
    
    if (typeof obj === 'number') {
      const objStr = obj.toString();
      if (debug) console.log(`         [数字] 比较 ${obj} (${objStr}) vs "${searchText}"`);
      
      // 策略 1: 精确匹配
      if (objStr === searchText) {
        if (debug) console.log(`         ✅ [策略1-精确] 匹配成功`);
        return true;
      }
      
      // 策略 2: 标准化数字匹配
      const searchNormalized = this.normalizeNumber(searchText);
      const objNormalized = this.normalizeNumber(objStr);
      if (searchNormalized && objNormalized) {
        if (debug) console.log(`         [策略2-标准化] "${searchNormalized}" vs "${objNormalized}"`);
        if (searchNormalized === objNormalized) {
          if (debug) console.log(`         ✅ [策略2-标准化] 匹配成功`);
          return true;
        }
      }
      
      // 策略 3: 纯数字模糊匹配
      const searchDigitsOnly = this.extractDigitsOnly(searchText);
      const objDigitsOnly = this.extractDigitsOnly(objStr);
      if (searchDigitsOnly && objDigitsOnly) {
        if (debug) console.log(`         [策略3-纯数字] "${searchDigitsOnly}" vs "${objDigitsOnly}"`);
        if (searchDigitsOnly === objDigitsOnly) {
          if (debug) console.log(`         ✅ [策略3-纯数字] 匹配成功`);
          return true;
        }
      }
      
      return false;
    }
    
    if (Array.isArray(obj)) {
      if (debug && depth === 0) console.log(`         [数组] 长度: ${obj.length}`);
      return obj.some(item => this.searchInObject(item, searchText, depth + 1, debug));
    }
    
    if (obj && typeof obj === 'object') {
      if (debug && depth === 0) console.log(`         [对象] 键数量: ${Object.keys(obj).length}`);
      return Object.values(obj).some(value => 
        this.searchInObject(value, searchText, depth + 1, debug)
      );
    }
    
    return false;
  }
  
  // 标准化字符串（去掉空格、连字符、下划线、特殊字符，转小写）
  normalizeString(text) {
    if (typeof text !== 'string') return null;
    
    // 转小写，去掉空格、连字符、下划线、点号等特殊字符
    const normalized = text
      .toLowerCase()
      .replace(/[\s\-_\.\/\\#@!$%^&*()\[\]{}|;:'"<>?,]/g, '');
    
    // 至少要有 2 个字符
    return normalized.length >= 2 ? normalized : null;
  }
  
  // 标准化数字（去掉千分位，保留小数点）
  normalizeNumber(text) {
    if (typeof text === 'number') {
      text = text.toString();
    }
    
    if (typeof text !== 'string') return null;
    
    // 去掉货币符号、空格、百分号
    let cleaned = text.replace(/[$€¥\s%]/g, '');
    
    // 判断小数点符号（. 或 ,）
    // 如果有多个 . 或 ,，那前面的是千分位
    const dotCount = (cleaned.match(/\./g) || []).length;
    const commaCount = (cleaned.match(/,/g) || []).length;
    
    if (dotCount > 1) {
      // 多个点，点是千分位，逗号是小数点
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (commaCount > 1) {
      // 多个逗号，逗号是千分位，点是小数点
      cleaned = cleaned.replace(/,/g, '');
    } else if (dotCount === 1 && commaCount === 1) {
      // 既有点又有逗号，看谁在后面
      const dotIndex = cleaned.lastIndexOf('.');
      const commaIndex = cleaned.lastIndexOf(',');
      if (commaIndex > dotIndex) {
        // 逗号在后，逗号是小数点
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        // 点在后，点是小数点
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (commaCount === 1) {
      // 只有一个逗号，可能是小数点（欧洲格式）
      // 判断：如果逗号后面是 2 位数字，很可能是小数点
      if (/,\d{2}$/.test(cleaned)) {
        cleaned = cleaned.replace(',', '.');
      } else {
        // 否则去掉逗号（当作千分位）
        cleaned = cleaned.replace(',', '');
      }
    }
    // dotCount === 1 时不处理，保持原样
    
    // 解析为数字并转回字符串（标准化格式）
    const num = parseFloat(cleaned);
    
    if (isNaN(num)) return null;
    
    // 返回标准格式的数字字符串
    return num.toString();
  }
  
  // 提取纯数字（去掉所有非数字字符，包括小数点）
  extractDigitsOnly(text) {
    if (typeof text === 'number') {
      text = text.toString();
    }
    
    if (typeof text !== 'string') return null;
    
    // 只保留数字
    const digitsOnly = text.replace(/[^0-9]/g, '');
    
    // 至少要有 2 位数字才算有效
    return digitsOnly.length >= 2 ? digitsOnly : null;
  }
  
  // ========================================
  // 显示数据来源面板
  // ========================================
  showDataSourcePanel(element, sources) {
    // 移除旧面板
    const oldPanel = document.getElementById('spx-api-source-panel');
    if (oldPanel) oldPanel.remove();
    
    const panel = document.createElement('div');
    panel.id = 'spx-api-source-panel';
    panel.className = 'spx-api-tracker-panel';
    panel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 600px;
      max-height: 80vh;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      z-index: 2147483647;
      padding: 20px;
      overflow-y: auto;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0; color: #333;">📡 数据来源</h3>
        <button id="spx-close-panel" style="background: #f5f5f5; border: none; border-radius: 6px; padding: 8px 15px; cursor: pointer; font-size: 14px;">关闭</button>
      </div>
    `;
    
    sources.forEach((source, index) => {
      html += `
        <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
            <span><strong style="color: #667eea;">${source.apiRecord.method}</strong> <span style="color: ${source.apiRecord.status === 200 ? '#10b981' : '#ef4444'};">${source.apiRecord.status}</span></span>
            <span style="color: #666; font-size: 12px;">${source.apiRecord.duration}ms</span>
          </div>
          <div style="word-break: break-all; font-size: 12px; color: #333; margin-bottom: 10px;">${source.apiRecord.url}</div>
          <div style="font-size: 12px; color: #666;">
            匹配文本: ${source.matches.map(m => `<span style="background: #fef3c7; padding: 2px 6px; border-radius: 3px; margin-right: 5px;">${m.substring(0, 30)}</span>`).join('')}
          </div>
          <div style="margin-top: 10px;">
            <button class="spx-view-response" data-id="${source.apiRecord.id}" style="background: #667eea; color: white; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12px; margin-right: 5px;">查看响应</button>
            <button class="spx-copy-url" data-url="${source.apiRecord.url}" style="background: #10b981; color: white; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12px; margin-right: 5px;">复制URL</button>
            <button class="spx-ask-ai" data-id="${source.apiRecord.id}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12px;">🤖 让AI分析</button>
          </div>
        </div>
      `;
    });
    
    panel.innerHTML = html;
    document.body.appendChild(panel);
    
    // 关闭按钮
    document.getElementById('spx-close-panel').addEventListener('click', () => panel.remove());
    
    // 查看响应按钮
    panel.querySelectorAll('.spx-view-response').forEach((btn, index) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.dataset.id;
        const source = sources.find(s => s.apiRecord.id === id);
        this.viewFullResponse(id, source?.matchPaths || []);
      });
    });
    
    // 复制 URL 按钮
    panel.querySelectorAll('.spx-copy-url').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const url = e.target.dataset.url;
        this.copyURL(url);
      });
    });
    
    // "让AI分析"按钮
    panel.querySelectorAll('.spx-ask-ai').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.dataset.id;
        const source = sources.find(s => s.apiRecord.id === id);
        if (source) {
          this.askAIAboutAPI(source);
        }
      });
    });
  }
  
  // ========================================
  // 查看完整响应
  // ========================================
  viewFullResponse(recordId, matchPaths = []) {
    const record = this.apiRecords.get(recordId);
    
    if (!record) {
      alert('未找到记录');
      return;
    }
    
    // 生成带高亮的 JSON
    const highlightedJson = this.highlightJsonPaths(record.responseData, matchPaths);
    
    const newWindow = window.open('', '_blank', 'width=900,height=700');
    newWindow.document.write(`
      <html>
      <head>
        <title>API 响应详情</title>
        <style>
          body { 
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace; 
            padding: 20px; 
            background: #1e1e1e; 
            color: #d4d4d4;
            line-height: 1.6;
          }
          .header {
            background: #252526;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .header p {
            margin: 5px 0;
          }
          .header strong {
            color: #4ec9b0;
          }
          .json-container {
            background: #1e1e1e;
            border: 1px solid #3c3c3c;
            border-radius: 8px;
            padding: 15px;
            overflow-x: auto;
          }
          pre { 
            white-space: pre-wrap; 
            word-wrap: break-word;
            margin: 0;
            font-size: 13px;
          }
          .highlight {
            background: #ffd700 !important;
            color: #000 !important;
            padding: 2px 4px;
            border-radius: 3px;
            font-weight: bold;
            box-shadow: 0 0 0 2px rgba(255, 215, 0, 0.3);
          }
          .highlight-key {
            background: #4ec9b0 !important;
            color: #1e1e1e !important;
            padding: 2px 4px;
            border-radius: 3px;
            font-weight: bold;
          }
          .string { color: #ce9178; }
          .number { color: #b5cea8; }
          .boolean { color: #569cd6; }
          .null { color: #569cd6; }
          .key { color: #9cdcfe; }
          .match-info {
            background: #264f78;
            padding: 10px 15px;
            border-radius: 6px;
            margin-bottom: 15px;
            border-left: 4px solid #ffd700;
          }
          .match-path {
            font-family: monospace;
            background: #3c3c3c;
            padding: 4px 8px;
            border-radius: 4px;
            margin: 5px 0;
            display: inline-block;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h2 style="margin-top: 0;">📡 API 响应详情</h2>
          <p><strong>URL:</strong> ${this.escapeHtml(record.url)}</p>
          <p><strong>Method:</strong> ${record.method} | <strong>Status:</strong> ${record.status} | <strong>Duration:</strong> ${record.duration}ms</p>
          <p><strong>Time:</strong> ${record.requestTime}</p>
        </div>
        
        ${matchPaths.length > 0 ? `
          <div class="match-info">
            <strong>🎯 匹配字段（${matchPaths.length}）：</strong><br>
            ${matchPaths.map(m => `<div class="match-path">📍 ${this.escapeHtml(m.path)} = <span class="highlight">${this.escapeHtml(String(m.value))}</span></div>`).join('')}
          </div>
        ` : ''}
        
        <div class="json-container">
          <pre>${highlightedJson}</pre>
        </div>
      </body>
      </html>
    `);
  }
  
  // 新增：高亮 JSON 中的匹配路径
  highlightJsonPaths(data, matchPaths) {
    const pathSet = new Set(matchPaths.map(m => m.path));
    
    const syntaxHighlight = (obj, currentPath = '', depth = 0) => {
      if (depth > 10) return '...';
      
      const indent = '  '.repeat(depth);
      
      if (obj === null) {
        return '<span class="null">null</span>';
      }
      
      if (typeof obj === 'undefined') {
        return '<span class="null">undefined</span>';
      }
      
      if (typeof obj === 'boolean') {
        return `<span class="boolean">${obj}</span>`;
      }
      
      if (typeof obj === 'number') {
        const isMatch = pathSet.has(currentPath);
        return isMatch 
          ? `<span class="highlight">${obj}</span>`
          : `<span class="number">${obj}</span>`;
      }
      
      if (typeof obj === 'string') {
        const isMatch = pathSet.has(currentPath);
        const escaped = this.escapeHtml(obj);
        return isMatch
          ? `<span class="string">"</span><span class="highlight">${escaped}</span><span class="string">"</span>`
          : `<span class="string">"${escaped}"</span>`;
      }
      
      if (Array.isArray(obj)) {
        if (obj.length === 0) return '[]';
        
        const items = obj.map((item, index) => {
          const itemPath = currentPath ? `${currentPath}[${index}]` : `[${index}]`;
          return `${indent}  ${syntaxHighlight(item, itemPath, depth + 1)}`;
        }).join(',\n');
        
        return `[\n${items}\n${indent}]`;
      }
      
      if (typeof obj === 'object') {
        const keys = Object.keys(obj);
        if (keys.length === 0) return '{}';
        
        const items = keys.map(key => {
          const keyPath = currentPath ? `${currentPath}.${key}` : key;
          const isKeyMatch = pathSet.has(keyPath);
          const keyHtml = isKeyMatch 
            ? `<span class="highlight-key">"${this.escapeHtml(key)}"</span>`
            : `<span class="key">"${this.escapeHtml(key)}"</span>`;
          
          return `${indent}  ${keyHtml}: ${syntaxHighlight(obj[key], keyPath, depth + 1)}`;
        }).join(',\n');
        
        return `{\n${items}\n${indent}}`;
      }
      
      return String(obj);
    };
    
    return syntaxHighlight(data);
  }
  
  // 新增：HTML 转义
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  copyURL(url) {
    navigator.clipboard.writeText(url).then(() => {
      alert('✅ URL 已复制到剪贴板');
    }).catch(err => {
      console.error('复制失败:', err);
      alert('❌ 复制失败');
    });
  }
  
  // ========================================
  // AI 分析 API
  // ========================================
  async askAIAboutAPI(source) {
    try {
      console.log('🤖 [SPX Helper] 准备让AI分析API:', source.apiRecord.url);
      
      // 步骤1: 显示加载面板
      this.showAIAnalysisPanel('loading', source, null, '正在准备分析...');
      
      // 步骤2: 尝试提取API ID
      const apiId = this.extractAPIId(source.apiRecord.url);
      
      // 步骤3: 查询API血缘信息（如果能提取到API ID）
      let lineageInfo = null;
      if (apiId) {
        console.log('🔍 [SPX Helper] 提取到API ID:', apiId);
        this.updateAIAnalysisPanelStatus('步骤 1/2：正在查询接口代码逻辑...');
        
        try {
          lineageInfo = await this.queryAPILineage(apiId);
          console.log('✅ [SPX Helper] API血缘查询成功:', lineageInfo);
          
          // 显示缓存命中状态
          const cacheStatus = lineageInfo.fromCache ? '（📦 缓存命中）' : '（🌐 实时查询）';
          this.updateAIAnalysisPanelStatus(`步骤 1/2：已获取接口代码${cacheStatus}`);
        } catch (err) {
          console.warn('⚠️ [SPX Helper] API血缘查询失败:', err.message);
          this.updateAIAnalysisPanelStatus(`步骤 1/2：接口代码查询失败 - ${err.message}`);
          // 等待1秒让用户看到状态
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        this.updateAIAnalysisPanelStatus('步骤 1/2：跳过（非api_mart接口）');
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      
      // 步骤4: 构建分析提示词
      this.updateAIAnalysisPanelStatus('步骤 2/2：正在让AI分析...');
      const prompt = this.buildAPIAnalysisPrompt(source, lineageInfo);
      
      // 调试：输出prompt信息
      console.log('📝 [SPX Helper] 传给AI的prompt长度:', prompt.length);
      console.log('📝 [SPX Helper] API版本:', lineageInfo?.apiVersion || '未知');
      console.log('📝 [SPX Helper] SQL长度:', lineageInfo?.bizSql?.length || 0);
      if (lineageInfo?.bizSql) {
        console.log('📝 [SPX Helper] SQL内容（前200字符）:', lineageInfo.bizSql.substring(0, 200));
        console.log('📝 [SPX Helper] SQL内容（后200字符）:', lineageInfo.bizSql.substring(lineageInfo.bizSql.length - 200));
      }
      console.log('📝 [SPX Helper] 完整prompt:', prompt);
      
      // 步骤5: 调用AI API
      const analysis = await this.callAIAPI(prompt);
      
      // 步骤6: 显示分析结果
      this.showAIAnalysisPanel('result', source, analysis);
      
    } catch (err) {
      console.error('❌ [SPX Helper] 调用AI失败:', err);
      this.showAIAnalysisPanel('error', source, err.message);
    }
  }
  
  extractAPIId(url) {
    // 尝试从URL中提取API ID
    // 支持多种格式：
    // 1. 标准格式: /api_mart/order/get_detail -> order/get_detail
    // 2. 带查询参数: /api_mart/order/get_detail?v=1 -> order/get_detail
    // 3. FMS格式: /mgmt/api/pc/forward/data/api_mart/mgmt_app/data_api/operation__xxx -> operation__xxx
    //    这种格式取最后一个路径段作为API ID
    
    // 先尝试匹配 api_mart 之后的内容
    const match = url.match(/\/api_mart\/([^?#]+)/);
    if (match) {
      const fullPath = match[1].replace(/\/$/, ''); // 移除末尾的斜杠
      
      // 如果路径很长，可能是 FMS 格式（如 mgmt_app/data_api/operation__xxx）
      // 取最后一个路径段
      const segments = fullPath.split('/');
      const lastSegment = segments[segments.length - 1];
      
      console.log('🔍 [SPX Helper] 提取API ID:');
      console.log('   原始URL:', url);
      console.log('   api_mart后的路径:', fullPath);
      console.log('   最后一段:', lastSegment);
      
      // 如果最后一段看起来像是API ID（包含__或者比较长），就用最后一段
      // 否则用完整路径
      if (lastSegment.includes('__') || segments.length > 2) {
        console.log('   ✅ 使用最后一段作为API ID:', lastSegment);
        return lastSegment;
      } else {
        console.log('   ✅ 使用完整路径作为API ID:', fullPath);
        return fullPath;
      }
    }
    
    console.log('⚠️ [SPX Helper] 无法提取API ID，URL不包含/api_mart/:', url);
    return null;
  }
  
  async queryAPILineage(apiId) {
    // 检查扩展上下文
    if (!isExtensionContextValid()) {
      throw new Error('Extension context invalidated');
    }
    // 调用API血缘查询
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'QUERY_API_LINEAGE',
        apiId: apiId
      }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (!response || !response.success) {
          reject(new Error(response?.error || 'API血缘查询失败'));
          return;
        }
        
        resolve(response.lineageInfo);
      });
    });
  }
  
  async callAIAPI(prompt) {
    console.log('📤 [SPX Helper] 发送AI请求...');
    // 检查扩展上下文
    if (!isExtensionContextValid()) {
      throw new Error('Extension context invalidated');
    }
    
    // 通过background script代理请求（避免CORS问题）
    const response = await chrome.runtime.sendMessage({
      action: 'CALL_AI_API',
      prompt: prompt
    });
    
    if (!response.success) {
      throw new Error(response.error || 'AI请求失败');
    }
    
    console.log('📥 [SPX Helper] AI响应成功');
    return response.result;
  }
  
  showAIAnalysisPanel(state, source, content = '', statusText = '') {
    // 移除旧面板
    const oldPanel = document.getElementById('spx-ai-analysis-panel');
    if (oldPanel) oldPanel.remove();
    
    const panel = document.createElement('div');
    panel.id = 'spx-ai-analysis-panel';
    panel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 700px;
      max-height: 85vh;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      z-index: 2147483647;
      padding: 0;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    let html = '';
    
    if (state === 'loading') {
      // 加载状态 - 显示步骤进度
      html = `
        <div style="padding: 30px; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 20px;">🤖</div>
          <h3 style="margin: 0 0 15px 0; color: #333;">AI正在分析...</h3>
          <div style="color: #666; font-size: 14px; margin-bottom: 8px;">
            分析接口: <strong>${this.truncateText(source.apiRecord.url, 60)}</strong>
          </div>
          <div id="spx-ai-status-text" style="color: #667eea; font-size: 13px; margin-bottom: 20px; font-weight: 500; min-height: 20px;">
            ${statusText || '正在准备分析...'}
          </div>
          <div class="typing-indicator" style="display: inline-flex; gap: 6px;">
            <span style="width: 10px; height: 10px; background: #667eea; border-radius: 50%; animation: bounce 1.4s infinite ease-in-out both;"></span>
            <span style="width: 10px; height: 10px; background: #667eea; border-radius: 50%; animation: bounce 1.4s infinite ease-in-out both; animation-delay: 0.16s;"></span>
            <span style="width: 10px; height: 10px; background: #667eea; border-radius: 50%; animation: bounce 1.4s infinite ease-in-out both; animation-delay: 0.32s;"></span>
          </div>
        </div>
        <style>
          @keyframes bounce {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
          }
        </style>
      `;
    } else if (state === 'error') {
      // 错误状态
      html = `
        <div style="padding: 30px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3 style="margin: 0; color: #ef4444;">❌ AI分析失败</h3>
            <button id="spx-close-ai-panel" style="background: #f5f5f5; border: none; border-radius: 6px; padding: 8px 15px; cursor: pointer;">关闭</button>
          </div>
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 15px; color: #991b1b;">
            <strong>错误信息:</strong> ${this.escapeHtml(content)}
          </div>
          <div style="margin-top: 15px; color: #666; font-size: 13px;">
            可能的原因：<br>
            • 网络连接问题<br>
            • AI服务暂时不可用<br>
            • 请求参数格式错误
          </div>
        </div>
      `;
    } else {
      // 结果状态
      html = `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; color: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h3 style="margin: 0; font-size: 20px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                🤖 AI 接口分析
              </h3>
              <div style="font-size: 13px; margin-top: 6px; opacity: 0.95; font-family: monospace;">
                ${this.truncateText(source.apiRecord.url, 70)}
              </div>
            </div>
            <button id="spx-close-ai-panel" style="background: rgba(255,255,255,0.2); border: none; border-radius: 8px; padding: 10px 18px; cursor: pointer; color: white; font-weight: 500; font-size: 14px; transition: background 0.2s; backdrop-filter: blur(10px);" onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">✕ 关闭</button>
          </div>
        </div>
        <div style="padding: 24px; max-height: calc(85vh - 120px); overflow-y: auto; background: #fafbfc;">
          <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 22px; line-height: 1.7; color: #1f2937; font-size: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            ${this.formatAIResponse(content)}
          </div>
          <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #f3f4f6; display: flex; gap: 10px;">
            <button class="spx-copy-analysis" style="flex: 1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; padding: 11px; cursor: pointer; font-size: 13px; font-weight: 500; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 2px 8px rgba(102,126,234,0.3);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(102,126,234,0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(102,126,234,0.3)'">📋 复制分析结果</button>
            <button class="spx-view-api-detail" style="flex: 1; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 8px; padding: 11px; cursor: pointer; font-size: 13px; font-weight: 500; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 2px 8px rgba(16,185,129,0.3);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(16,185,129,0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(16,185,129,0.3)'">📄 查看API详情</button>
          </div>
        </div>
      `;
    }
    
    panel.innerHTML = html;
    document.body.appendChild(panel);
    
    // 绑定事件
    const closeBtn = document.getElementById('spx-close-ai-panel');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => panel.remove());
    }
    
    if (state === 'result') {
      // 复制分析结果
      const copyBtn = panel.querySelector('.spx-copy-analysis');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(content).then(() => {
            this.showToast('✅ 分析结果已复制到剪贴板');
          });
        });
      }
      
      // 查看API详情
      const viewBtn = panel.querySelector('.spx-view-api-detail');
      if (viewBtn) {
        viewBtn.addEventListener('click', () => {
          panel.remove();
          this.viewFullResponse(source.apiRecord.id, source.matchPaths || []);
        });
      }
    }
  }
  
  // 新增：更新AI分析面板的状态文本
  updateAIAnalysisPanelStatus(statusText) {
    const statusElement = document.getElementById('spx-ai-status-text');
    if (statusElement) {
      statusElement.textContent = statusText;
    }
  }
  
  formatAIResponse(text) {
    // 先处理代码块（保护它们不被其他规则影响）
    const codeBlocks = [];
    text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push(`<pre style="background: #f8f9fa; color: #212529; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 14px 0; font-size: 13px; line-height: 1.5; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; border: 1px solid #dee2e6;">${this.escapeHtml(code.trim())}</pre>`);
      return placeholder;
    });
    
    // 处理行内代码（在处理其他markdown之前）
    const inlineCodes = [];
    text = text.replace(/`([^`]+)`/g, (match, code) => {
      const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
      inlineCodes.push(`<code style="background: #f1f3f5; padding: 2px 6px; border-radius: 3px; font-family: 'Consolas', 'Monaco', monospace; color: #c7254e; font-size: 0.92em; border: 1px solid #e9ecef;">${this.escapeHtml(code)}</code>`);
      return placeholder;
    });
    
    // 处理Markdown表格
    const tables = [];
    text = text.replace(/(\|.+\|[\r\n]+)+/gm, (match) => {
      const lines = match.trim().split('\n').filter(line => line.trim());
      if (lines.length < 2) return match;
      
      // 检查是否有分隔行（第二行通常是 |---|---|）
      const hasHeaderSeparator = lines[1].match(/^\|[\s\-:|]+\|$/);
      if (!hasHeaderSeparator && lines.length < 3) return match;
      
      const startIndex = hasHeaderSeparator ? 0 : 1;
      const headerLine = lines[startIndex];
      const dataLines = hasHeaderSeparator ? lines.slice(2) : lines.slice(1);
      
      // 解析表头
      const headers = headerLine.split('|').map(h => h.trim()).filter(h => h);
      
      // 解析数据行
      const rows = dataLines.map(line => {
        return line.split('|').map(cell => cell.trim()).filter(cell => cell !== '');
      });
      
      // 生成HTML表格
      let tableHtml = '<table style="border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 13px; border: 1px solid #dee2e6;">';
      
      // 表头
      tableHtml += '<thead><tr style="background: #f8f9fa;">';
      headers.forEach(header => {
        tableHtml += `<th style="border: 1px solid #dee2e6; padding: 10px 12px; text-align: left; font-weight: 600; color: #495057;">${this.escapeHtml(header)}</th>`;
      });
      tableHtml += '</tr></thead>';
      
      // 表体
      tableHtml += '<tbody>';
      rows.forEach((row, index) => {
        const bgColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
        tableHtml += `<tr style="background: ${bgColor};">`;
        row.forEach(cell => {
          tableHtml += `<td style="border: 1px solid #dee2e6; padding: 10px 12px; color: #212529;">${this.escapeHtml(cell)}</td>`;
        });
        tableHtml += '</tr>';
      });
      tableHtml += '</tbody></table>';
      
      const placeholder = `__TABLE_${tables.length}__`;
      tables.push(tableHtml);
      return placeholder;
    });
    
    // 处理标题（注意顺序：先处理一级，再二级，再三级）
    text = text.replace(/^#\s+(.+)$/gm, '<h1 style="font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 16px 0; padding-bottom: 10px; border-bottom: 3px solid #667eea; display: flex; align-items: center; gap: 8px;">$1</h1>');
    text = text.replace(/^##\s+(.+)$/gm, '<h2 style="font-size: 17px; font-weight: 600; color: #111827; margin: 22px 0 10px 0; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; display: flex; align-items: center; gap: 8px;">$1</h2>');
    text = text.replace(/^###\s+(.+)$/gm, '<h3 style="font-size: 15px; font-weight: 600; color: #374151; margin: 16px 0 8px 0;">$1</h3>');
    
    // 处理加粗
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong style="color: #667eea; font-weight: 600;">$1</strong>');
    
    // 处理无序列表（支持多种格式）
    text = text.replace(/^[\-•]\s+(.+)$/gm, '<li style="margin-left: 0; margin-bottom: 6px; padding-left: 8px; color: #374151; line-height: 1.6;">$1</li>');
    
    // 处理有序列表
    text = text.replace(/^(\d+)\.\s+(.+)$/gm, '<li style="margin-left: 0; margin-bottom: 6px; padding-left: 8px; color: #374151; line-height: 1.6;"><strong style="color: #667eea; margin-right: 4px;">$1.</strong>$2</li>');
    
    // 包装连续的列表项
    text = text.replace(/(<li.*?<\/li>\n?)+/g, (match) => {
      return `<ul style="margin: 10px 0; padding-left: 24px; list-style-type: none; border-left: 3px solid #e5e7eb;">${match}</ul>`;
    });
    
    // 处理引用
    text = text.replace(/^>\s+(.+)$/gm, '<blockquote style="margin: 10px 0; padding: 10px 14px; background: #f9fafb; border-left: 4px solid #667eea; color: #6b7280; font-style: italic; border-radius: 4px;">$1</blockquote>');
    
    // 处理水平线
    text = text.replace(/^---+$/gm, '<hr style="margin: 18px 0; border: none; border-top: 1px solid #e5e7eb;">');
    
    // 恢复表格
    tables.forEach((table, i) => {
      text = text.replace(`__TABLE_${i}__`, table);
    });
    
    // 恢复代码块
    codeBlocks.forEach((code, i) => {
      text = text.replace(`__CODE_BLOCK_${i}__`, code);
    });
    
    // 恢复行内代码
    inlineCodes.forEach((code, i) => {
      text = text.replace(`__INLINE_CODE_${i}__`, code);
    });
    
    // 处理段落（连续的非HTML行合并为段落）
    text = text.split('\n').map(line => {
      line = line.trim();
      if (!line) return '<br>';
      if (line.startsWith('<')) return line; // 已经是HTML标签
      return `<p style="margin: 8px 0; line-height: 1.7; color: #374151;">${line}</p>`;
    }).join('\n');
    
    // 清理多余的<br>
    text = text.replace(/(<br>\s*){3,}/g, '<br><br>');
    
    return text;
  }
  
  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // DS ID 到集群的映射表
  getDsClusterName(dsId) {
    const DS_MAPPING = {
      110: 'spx_mart-cluster_szsc_spx_mart_online_5',
      109: 'spx_mart',
      108: 'spx_mart-cluster_szsc_spx_mart_online_3',
      107: 'spx_mart-cluster_szsc_spx_mart_online_2',
      106: 'staging_spx_mart-cluster_mpp_poc01_2replicas_online',
      105: 'staging_spx_mart-cluster_mpp_poc01_2replicas_online',
      104: 'spx_mart-cluster_szsc_data_shared_online',
      86: 'spx_mart-cluster_szsc_spx_mart_online',
      87: 'spx_mart-cluster_szsc_spx_mart_online',
      88: 'spx_mart-cluster_szsc_spx_smartsort_online',
      90: 'spx_mart-cluster_szsc_data_shared_online',
      91: 'spx_mart-cluster_szsc_spx_smartsort_online',
      113: 'spx_mart-cluster_szsc_spx_mart_online_4',
      114: 'spx_mart-cluster_szsc_spx_mart_online_6',
      115: 'spx_mart-cluster_szsc_spx_mart_online_7',
      116: 'spx_mart-cluster_szsc_spx_mart_online_8',
      119: 'spx_mart-cluster_szsc_spx_mart_online_5',
      122: 'spx_mart-cluster_szsc_spx_mart_online_7'
    };
    return DS_MAPPING[dsId] || `DS_${dsId}`;
  }
  
  buildAPIAnalysisPrompt(source, lineageInfo = null) {
    const record = source.apiRecord;
    
    // 提取匹配的字段路径（如果有的话）
    let selectedFieldsInfo = '';
    if (source.matchPaths && source.matchPaths.length > 0) {
      // 使用字段路径
      const fieldPaths = source.matchPaths.map(p => p.path).filter(p => p);
      selectedFieldsInfo = fieldPaths.length > 0 
        ? `字段路径: ${fieldPaths.join(', ')}\n匹配的值: ${source.matches.join(', ')}`
        : `选中的值: ${source.matches.join(', ')}`;
    } else {
      // 降级：只显示匹配的值
      selectedFieldsInfo = `选中的值: ${source.matches.join(', ')}`;
    }
    
    // 构建业务SQL部分
    let bizSqlSection = '';
    let deploymentInfo = '';
    let sqlPreview = ''; // 提前定义，供后面prompt使用
    
    if (lineageInfo && lineageInfo.bizSql) {
      // 直接使用完整SQL，不截断
      sqlPreview = lineageInfo.bizSql;
      
      bizSqlSection = `

**业务SQL逻辑**
\`\`\`sql
${sqlPreview}
\`\`\``;

      deploymentInfo = `
- 发布环境: ${lineageInfo.publishEnv || '未知'}
- API版本: ${lineageInfo.apiVersion || '未知'}
- 数据源ID: DS_${lineageInfo.dsId || '?'}
- ClickHouse集群: ${this.getDsClusterName(lineageInfo.dsId)}`;
    }
    
    // 构建精简的分析提示 - 实战运维视角
    const prompt = `你是后端开发工程师，正在排查线上问题。

**接口信息**
- URL: \`${record.url}\`${lineageInfo && lineageInfo.apiId ? `
- API ID: ${lineageInfo.apiId}` : ''}${deploymentInfo}
${bizSqlSection}

**用户选中的字段**:
${selectedFieldsInfo}

---

请按以下格式分析：

## 🎯 这个页面/接口的功能是什么？

用1-2句话说明这个接口对应的页面整体功能和业务场景。

${lineageInfo ? `
## 📝 完整SQL逻辑

\`\`\`sql
${sqlPreview}
\`\`\`

**SQL逻辑分析**：
- **主要指标**: 列出SELECT中的关键业务字段（5-8个主要指标即可）
- **数据源**: FROM哪个表，JOIN了什么表（如果有）
- **过滤条件**: WHERE的主要条件和业务含义
- **计算逻辑**: 关键的聚合函数（SUM/COUNT/IF等）和计算方式

` : `## 📊 页面上的指标都是什么？

从响应数据中说明主要返回了哪些业务指标。`}

## 🔍 用户选中的这个指标：${selectedFieldsInfo}

${lineageInfo ? '从上面的SQL找到这个字段：' : '从响应数据分析：'}
- **业务含义**: 这个指标代表什么业务含义
- **计算逻辑**: 具体的计算公式和数据来源
- **数值含义**: 这个数值的单位和业务解释

## 🛠️ 如果这个指标有问题，怎么排查？

- **环境定位**: ${lineageInfo && lineageInfo.publishEnv ? lineageInfo.publishEnv : '对应环境'}环境，${lineageInfo && lineageInfo.dsId ? `ClickHouse集群: ${this.getDsClusterName(lineageInfo.dsId)}` : '对应数据源'}
- **数据源检查**: 查哪个表和字段，检查原始数据是否正常
- **逻辑验证**: 检查什么计算逻辑（JOIN、WHERE、聚合等）

---

**要求**: 简洁、直接、实用。使用Markdown格式。`;

    return prompt;
  }
  
  showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
  
  // ========================================
  // UI 辅助函数
  // ========================================
  highlightElement(element) {
    this.clearHighlight();
    
    this.highlightedElement = element;
    element.style.outline = '2px solid #667eea';
    element.style.outlineOffset = '2px';
    element.style.backgroundColor = 'rgba(102, 126, 234, 0.1)';
    
    this.showElementInfo(element);
  }
  
  clearHighlight() {
    if (this.highlightedElement) {
      this.highlightedElement.style.outline = '';
      this.highlightedElement.style.outlineOffset = '';
      this.highlightedElement.style.backgroundColor = '';
      this.highlightedElement = null;
    }
    
    const infoBox = document.getElementById('spx-api-tracker-element-info');
    if (infoBox) infoBox.remove();
  }
  
  showElementInfo(element) {
    const existingInfo = document.getElementById('spx-api-tracker-element-info');
    if (existingInfo) existingInfo.remove();
    
    const rect = element.getBoundingClientRect();
    const infoBox = document.createElement('div');
    infoBox.id = 'spx-api-tracker-element-info';
    infoBox.style.cssText = `
      position: fixed;
      top: ${Math.max(5, rect.top - 25)}px;
      left: ${rect.left}px;
      background: rgba(102, 126, 234, 0.95);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      z-index: 2147483645;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    let className = '';
    if (element.className) {
      if (typeof element.className === 'string') {
        className = element.className.split(' ')[0];
      } else if (element.className.baseVal) {
        className = element.className.baseVal.split(' ')[0];
      }
    }
    
    infoBox.textContent = `${element.tagName.toLowerCase()}${className ? '.' + className : ''}`;
    document.body.appendChild(infoBox);
  }
  
  isOurElement(element) {
    let current = element;
    while (current) {
      if (current.id && (
        current.id.startsWith('spx-') ||
        current.id === 'spx-api-source-panel' || current.id === 'spx-api-no-source-panel' ||
        current.id === 'spx-api-tracker-tooltip' || current.id === 'spx-api-tracker-element-info' ||
        current.id === 'spx-close-panel' || current.id === 'spx-no-source-close-btn' ||
        current.id === 'spx-exit-inspector' || current.id === 'spx-selection-floating-btn'
      )) {
        return true;
      }
      
      if (current.className) {
        let classNames = (typeof current.className === 'string') 
          ? current.className 
          : (current.className.baseVal || '');
        if (classNames && (classNames.includes('spx-') || classNames.includes('spx-api-tracker') || classNames.includes('spx-selection-floating'))) {
          return true;
        }
      }
      
      current = current.parentElement;
    }
    return false;
  }
  
  addInspectorStyles() {
    if (document.getElementById('spx-inspector-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'spx-inspector-styles';
    style.textContent = `
      * {
        cursor: crosshair !important;
      }
    `;
    document.head.appendChild(style);
  }
  
  showInspectorTip() {
    const tip = document.createElement('div');
    tip.id = 'spx-api-tracker-tip';
    tip.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 20px;
      text-align: center;
      z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    tip.innerHTML = `
      <span>🎯 API 数据溯源检查器已启动</span>
      <span style="margin: 0 20px;">|</span>
      <span>移动鼠标查看元素数据来源（点击查看详情）</span>
      <button id="spx-exit-inspector" style="margin-left: 20px; padding: 6px 15px; background: rgba(255,255,255,0.2); border: 1px solid white; border-radius: 6px; color: white; cursor: pointer; font-size: 12px;">退出</button>
    `;
    document.body.appendChild(tip);
    
    document.getElementById('spx-exit-inspector').addEventListener('click', () => {
      this.disableInspectorMode();
    });
  }
  
  removeInspectorTip() {
    const tip = document.getElementById('spx-api-tracker-tip');
    if (tip) tip.remove();
    
    const styles = document.getElementById('spx-inspector-styles');
    if (styles) styles.remove();
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
      
      // 新增：更新文本选取状态
      if (request.action === 'UPDATE_TEXT_SELECTION_STATE') {
        const wasEnabled = this.textSelectionEnabled;
        this.textSelectionEnabled = request.enabled;
        console.log('🔄 [SPX Helper] 文本选取功能状态已更新:', request.enabled ? '开启' : '关闭');
        
        if (!request.enabled) {
          // 如果禁用，隐藏当前的浮动按钮
          this.hideSelectionFloatingBtn();
          console.log('✅ [SPX Helper] 文本选取功能已禁用');
        } else if (!wasEnabled && request.enabled) {
          // 如果从禁用切换到启用，确保监听器存在
          console.log('🔄 [SPX Helper] 重新启用文本选取功能');
          if (!this.textSelectionListenerAdded) {
            try {
              this.initTextSelectionListener();
            } catch (err) {
              console.error('❌ [SPX Helper] 重新初始化监听器失败:', err);
            }
          } else {
            console.log('✅ [SPX Helper] 监听器已存在，功能已激活');
          }
        }
        
        sendResponse({ success: true });
      }
      
      // 新增：更新 API 过滤条件
      if (request.action === 'UPDATE_API_FILTER') {
        const keywords = request.keywords || '';
        
        if (keywords.trim() === '') {
          // 空字符串表示不过滤
          this.apiFilterKeywords = [];
          console.log('🔄 [SPX Helper] API 过滤条件已更新: 显示所有接口');
        } else {
          this.apiFilterKeywords = keywords.split(',').map(k => k.trim()).filter(k => k);
          console.log('🔄 [SPX Helper] API 过滤条件已更新:', this.apiFilterKeywords);
        }
        
        sendResponse({ success: true });
      }
      
      if (request.action === 'GET_API_RECORDS') {
        const records = Array.from(this.apiRecords.values());
        sendResponse({ records });
      }
      
      if (request.action === 'GET_API_RECORD_DETAIL') {
        const record = this.apiRecords.get(request.recordId);
        if (record) {
          sendResponse({ record });
        } else {
          sendResponse({ record: null });
        }
      }
      
      return true;
    });
  }
}

// ========================================
// 初始化
// ========================================
const apiTracker = new APIDataTracker();
apiTracker.setupMessageListener();

// 暴露到 window 对象以便调试
window.__spxApiTracker = apiTracker;
window.APIDataTracker = APIDataTracker;

console.log('✅ [SPX Helper] Content Script 已就绪');
console.log('🔧 [SPX Helper] 调试: window.__spxApiTracker 可用');

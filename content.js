// ========================================
// SPX Helper - API 数据溯源工具
// Content Script - UI 管理器
// ========================================

// 注意：API 拦截由 injected.js 完成（运行在 MAIN world）
// 这个脚本负责 UI 交互（运行在 ISOLATED world）

class APIDataTracker {
  constructor() {
    this.apiRecords = new Map();
    this.tableConfigs = []; // 新增：存储 Table 配置
    this.inspectorMode = false;
    this.highlightedElement = null;
    this.selectedText = ''; // 新增：存储用户选取的文本
    this.selectionFloatingBtn = null; // 新增：文本选取浮动按钮
    
    console.log('🔍 [SPX Helper] Content Script 已加载');
    
    // 监听文本选取
    this.initTextSelectionListener();
    
    // 监听来自页面的消息
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      
      if (event.data.type === 'SPX_API_RECORDED') {
        const record = event.data.record;
        this.apiRecords.set(record.id, record);
        
        // 通知 popup
        chrome.runtime.sendMessage({
          action: 'API_RECORDED',
          record: record
        }).catch(() => {});
      }
      
      // 新增：接收 Table 配置
      if (event.data.type === 'SPX_TABLE_CONFIG_CAPTURED') {
        const config = event.data.config;
        this.tableConfigs.push(config);
        
        console.log('📊 [SPX Helper] Content Script 收到 Table 配置:', config);
        
        // 通知 popup
        chrome.runtime.sendMessage({
          action: 'TABLE_CONFIG_CAPTURED',
          config: config
        }).catch(() => {});
        
        // 自动分析 UI → API 映射
        this.analyzeFieldMappings();
      }
    });
  }
  
  // ========================================
  // 文本选取监听器
  // ========================================
  initTextSelectionListener() {
    console.log('✅ [SPX Helper] 初始化文本选取监听器');
    
    document.addEventListener('mouseup', (e) => {
      console.log('🖱️ [SPX Helper] mouseup 事件触发');
      
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
    btn.addEventListener('click', () => {
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
  analyzeFieldMappings() {
    if (this.tableConfigs.length === 0 || this.apiRecords.size === 0) {
      console.log('⏳ [SPX Helper] 等待更多数据进行映射分析');
      return;
    }
    
    const latestTableConfig = this.tableConfigs[this.tableConfigs.length - 1];
    const uiFields = latestTableConfig.columns.map(col => col.dataIndex).filter(Boolean);
    
    console.log('🔗 [SPX Helper] 开始分析字段映射');
    console.log('   UI 字段:', uiFields);
    
    const mappings = [];
    
    // 遍历所有 API 记录
    this.apiRecords.forEach((record) => {
      const apiResponse = record.responseData;
      
      // 提取 API 响应中的字段（通常在 data.list[0] 或 data 中）
      let apiFields = [];
      
      if (apiResponse?.data?.list && apiResponse.data.list.length > 0) {
        apiFields = Object.keys(apiResponse.data.list[0]);
      } else if (apiResponse?.data && typeof apiResponse.data === 'object') {
        apiFields = Object.keys(apiResponse.data);
      } else if (Array.isArray(apiResponse) && apiResponse.length > 0) {
        apiFields = Object.keys(apiResponse[0]);
      }
      
      if (apiFields.length === 0) {
        console.log('   ⏭️ 跳过（无法提取字段）:', record.url);
        return;
      }
      
      console.log('   📡 API 字段:', apiFields.slice(0, 10), '...');
      
      // 匹配分析
      const matched = uiFields.filter(f => apiFields.includes(f));
      const apiOnly = apiFields.filter(f => !uiFields.includes(f));
      const uiOnly = uiFields.filter(f => !apiFields.includes(f));
      
      if (matched.length > 0) {
        mappings.push({
          apiUrl: record.url,
          apiMethod: record.method,
          timestamp: record.requestTime,
          matched: matched,
          apiOnly: apiOnly.slice(0, 10),
          uiOnly: uiOnly,
          matchRate: (matched.length / uiFields.length * 100).toFixed(1) + '%'
        });
        
        console.log('   ✅ 匹配成功:', matched.length, '/', uiFields.length, '字段');
        console.log('      匹配字段:', matched.slice(0, 5));
      }
    });
    
    if (mappings.length > 0) {
      console.log('🎯 [SPX Helper] 字段映射分析完成:', mappings.length, '个 API');
      
      // 通知 popup
      chrome.runtime.sendMessage({
        action: 'FIELD_MAPPINGS_ANALYZED',
        mappings: mappings,
        tableConfig: latestTableConfig
      }).catch(() => {});
    } else {
      console.log('⚠️ [SPX Helper] 未找到匹配的字段映射');
    }
  }
  
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
    console.log('   要匹配的文本:', elementTexts);
    
    // 使用 Content Script 中已同步的 API 记录
    this.apiRecords.forEach((record, id) => {
      const matches = [];
      
      console.log(`   🔍 检查 API: ${record.url}`);
      console.log(`      响应数据类型: ${typeof record.responseData}`);
      console.log(`      响应数据预览:`, JSON.stringify(record.responseData).substring(0, 200));
      
      elementTexts.forEach(text => {
        console.log(`      → 尝试匹配文本: "${text}"`);
        const matchResult = this.searchInObject(record.responseData, text, 0, true);
        console.log(`         匹配结果: ${matchResult}`);
        
        if (matchResult) {
          matches.push(text);
        }
      });
      
      if (matches.length > 0) {
        console.log('   ✅ 找到匹配:', record.url, '匹配文本:', matches);
        sources.push({
          apiRecord: record,
          matches: matches
        });
      }
    });
    
    console.log('   📊 总共找到', sources.length, '个数据来源');
    
    return sources;
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
            <button class="spx-copy-url" data-url="${source.apiRecord.url}" style="background: #10b981; color: white; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12px;">复制URL</button>
          </div>
        </div>
      `;
    });
    
    panel.innerHTML = html;
    document.body.appendChild(panel);
    
    // 关闭按钮
    document.getElementById('spx-close-panel').addEventListener('click', () => panel.remove());
    
    // 查看响应按钮
    panel.querySelectorAll('.spx-view-response').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.dataset.id;
        this.viewFullResponse(id);
      });
    });
    
    // 复制 URL 按钮
    panel.querySelectorAll('.spx-copy-url').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const url = e.target.dataset.url;
        this.copyURL(url);
      });
    });
  }
  
  // ========================================
  // 查看完整响应
  // ========================================
  viewFullResponse(recordId) {
    const record = this.apiRecords.get(recordId);
    
    if (!record) {
      alert('未找到记录');
      return;
    }
    
    const newWindow = window.open('', '_blank', 'width=800,height=600');
    newWindow.document.write(`
      <html>
      <head>
        <title>API 响应详情</title>
        <style>
          body { font-family: monospace; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
          pre { white-space: pre-wrap; word-wrap: break-word; }
        </style>
      </head>
      <body>
        <h2>API 响应详情</h2>
        <p><strong>URL:</strong> ${record.url}</p>
        <p><strong>Method:</strong> ${record.method}</p>
        <p><strong>Status:</strong> ${record.status}</p>
        <p><strong>Duration:</strong> ${record.duration}ms</p>
        <p><strong>Time:</strong> ${record.requestTime}</p>
        <hr>
        <pre>${JSON.stringify(record.responseData, null, 2)}</pre>
      </body>
      </html>
    `);
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
      
      // 新增：获取 Table 配置
      if (request.action === 'GET_TABLE_CONFIGS') {
        sendResponse({ configs: this.tableConfigs });
      }
      
      // 新增：手动触发字段映射分析
      if (request.action === 'ANALYZE_FIELD_MAPPINGS') {
        this.analyzeFieldMappings();
        sendResponse({ success: true });
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

console.log('✅ [SPX Helper] Content Script 已就绪');

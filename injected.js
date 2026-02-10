// ========================================
// SPX Helper - API 拦截器（页面上下文）
// 这个脚本运行在页面的主世界（MAIN world）
// ========================================

(function() {
  console.log('🔍 [SPX Helper] 拦截器脚本已加载（页面上下文）');
  
  // 创建全局 API 记录器
  window.__spxAPIRecords = new Map();
  
  // API 过滤配置（默认值）
  let apiFilterKeywords = ['api_mart'];  // 默认只拦截包含 api_mart 的接口
  
  // 监听来自 content.js 的配置更新
  window.addEventListener('message', (event) => {
    if (event.data.type === 'SPX_UPDATE_API_FILTER') {
      const keywords = event.data.keywords || '';
      
      // 解析关键词（逗号分隔）
      if (keywords.trim() === '') {
        // 空字符串表示拦截所有接口
        apiFilterKeywords = [];
        console.log('⚙️ [SPX Helper] API 过滤条件已更新: 拦截所有接口');
      } else {
        apiFilterKeywords = keywords.split(',').map(k => k.trim()).filter(k => k);
        console.log('⚙️ [SPX Helper] API 过滤条件已更新:', apiFilterKeywords);
      }
    }
  });
  
  // 检查 URL 是否匹配过滤条件
  function shouldInterceptAPI(url) {
    // 如果没有设置过滤条件，拦截所有接口
    if (apiFilterKeywords.length === 0) {
      return true;
    }
    
    // 检查 URL 是否包含任一关键词
    return apiFilterKeywords.some(keyword => url.includes(keyword));
  }
  
  
  // 保存原始 fetch
  const originalFetch = window.fetch;
  
  // 拦截 Fetch
  window.fetch = async function(...args) {
    const [url, options] = args;
    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const startTime = Date.now();
    
    console.log('🚀 [SPX Helper] 拦截到 Fetch:', typeof url === 'string' ? url : url.url);
    
    try {
      const response = await originalFetch.apply(this, args);
      const clonedResponse = response.clone();
      
      try {
        const data = await clonedResponse.json();
        const duration = Date.now() - startTime;
        
        // 使用动态过滤条件
        const urlString = typeof url === 'string' ? url : url.url;
        if (!shouldInterceptAPI(urlString)) {
          console.log('⏭️ [SPX Helper] 跳过接口（不匹配过滤条件）:', urlString);
          return response;
        }
        
        // 提取请求参数
        let requestPayload = null;
        try {
          if (options?.body) {
            if (typeof options.body === 'string') {
              requestPayload = JSON.parse(options.body);
            } else {
              requestPayload = options.body;
            }
          }
        } catch (e) {
          requestPayload = options?.body; // 保留原始字符串
        }
        
        // 获取调用栈（前5层）
        const callStack = new Error().stack
          .split('\n')
          .slice(2, 7)
          .map(line => line.trim());
        
        const record = {
          id: requestId,
          url: typeof url === 'string' ? url : url.url,
          method: options?.method || 'GET',
          requestTime: new Date().toISOString(),
          duration: duration,
          status: response.status,
          responseData: data,
          requestPayload: requestPayload,
          requestHeaders: options?.headers || {},
          callStack: callStack,
          type: 'fetch'
        };
        
        window.__spxAPIRecords.set(requestId, record);
        
        console.log('📡 [SPX Helper] Fetch 记录成功:', record.url, '总数:', window.__spxAPIRecords.size);
        
        // 通知 content script（发送完整数据）
        window.postMessage({
          type: 'SPX_API_RECORDED',
          record: record  // 发送完整记录，包括 responseData
        }, '*');
      } catch (e) {
        console.log('⚠️ [SPX Helper] 非 JSON 响应，跳过');
      }
      
      return response;
    } catch (error) {
      console.error('❌ [SPX Helper] Fetch 错误:', error);
      throw error;
    }
  };
  
  // 拦截 XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    console.log('🚀 [SPX Helper] 拦截到 XHR:', method, url);
    
    this.__spxTracker = {
      method: method,
      url: url,
      requestId: 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      startTime: Date.now()
    };
    
    return originalOpen.apply(this, [method, url, ...rest]);
  };
  
  XMLHttpRequest.prototype.send = function(...args) {
    const xhr = this;
    
    // 记录请求体
    let requestPayload = null;
    try {
      if (args[0] && typeof args[0] === 'string') {
        requestPayload = JSON.parse(args[0]);
      } else if (args[0]) {
        requestPayload = args[0];
      }
    } catch (e) {
      requestPayload = args[0];
    }
    
    // 获取调用栈
    const callStack = new Error().stack
      .split('\n')
      .slice(2, 7)
      .map(line => line.trim());
    
    xhr.__spxTracker.requestPayload = requestPayload;
    xhr.__spxTracker.callStack = callStack;
    
    xhr.addEventListener('load', function() {
      if (xhr.__spxTracker && xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          const duration = Date.now() - xhr.__spxTracker.startTime;
          
          // 使用动态过滤条件
          if (!shouldInterceptAPI(xhr.__spxTracker.url)) {
            console.log('⏭️ [SPX Helper] 跳过接口（不匹配过滤条件）:', xhr.__spxTracker.url);
            return;
          }
          
          const record = {
            id: xhr.__spxTracker.requestId,
            url: xhr.__spxTracker.url,
            method: xhr.__spxTracker.method,
            requestTime: new Date().toISOString(),
            duration: duration,
            status: xhr.status,
            responseData: data,
            requestPayload: xhr.__spxTracker.requestPayload,
            callStack: xhr.__spxTracker.callStack,
            type: 'xhr'
          };
          
          window.__spxAPIRecords.set(record.id, record);
          
          console.log('📡 [SPX Helper] XHR 记录成功:', record.url, '总数:', window.__spxAPIRecords.size);
          
          // 通知 content script（发送完整数据）
          window.postMessage({
            type: 'SPX_API_RECORDED',
            record: record  // 发送完整记录，包括 responseData
          }, '*');
        } catch (e) {
          console.log('⚠️ [SPX Helper] 非 JSON 响应，跳过');
        }
      }
    });
    
    return originalSend.apply(this, args);
  };
  
  console.log('✅ [SPX Helper] API 拦截器已安装在页面上下文');
})();

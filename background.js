// SPX Helper - Background Service Worker
// Author: tianyi.liang
// v2.6.0

console.log('SPX Helper Service Worker 已启动');

// 存储当前打开的窗口ID
let currentWindowId = null;

// 检查并应用窗口模式设置
function checkWindowModeSetting() {
  chrome.storage.local.get(['windowMode'], function(result) {
    if (result.windowMode) {
      // 启用窗口模式：移除 popup，让点击触发 onClicked
      chrome.action.setPopup({ popup: '' });
      console.log('窗口模式已启用');
    } else {
      // 禁用窗口模式：恢复 popup
      chrome.action.setPopup({ popup: 'popup.html' });
      console.log('弹窗模式已启用');
    }
  });
}

// 打开独立窗口
function openHelperWindow(position) {
  console.log('🔵 openHelperWindow 被调用，参数:', position);
  console.log('🔵 当前记录的 currentWindowId:', currentWindowId);
  
  // 默认窗口大小与 popup 一致：宽 750px，高 700px + 顶部提示栏
  const pos = position || { left: 100, top: 50, width: 780, height: 760 };
  console.log('🔵 使用的窗口位置:', pos);
  
  // 如果有记录的窗口ID，先尝试聚焦它
  if (currentWindowId !== null) {
    console.log('🔵 尝试聚焦已记录的窗口ID:', currentWindowId);
    chrome.windows.update(currentWindowId, { focused: true }, function(win) {
      if (chrome.runtime.lastError) {
        console.log('⚠️ 聚焦记录的窗口失败（可能已关闭）:', chrome.runtime.lastError.message);
        currentWindowId = null;
        // 继续查找或创建新窗口
        findOrCreateWindow(pos);
      } else {
        console.log('✅ 成功聚焦已存在的窗口:', currentWindowId);
      }
    });
  } else {
    // 没有记录的窗口ID，查找或创建
    findOrCreateWindow(pos);
  }
}

// 查找或创建窗口
function findOrCreateWindow(pos) {
  console.log('🔵 开始查找现有窗口...');
  
  // 获取扩展的 popup.html 完整 URL
  const popupUrl = chrome.runtime.getURL('popup.html');
  console.log('🔵 扩展 popup URL:', popupUrl);
  
  // 检查所有窗口，找到已存在的 Helper 窗口
  chrome.windows.getAll({ populate: true }, function(windows) {
    if (chrome.runtime.lastError) {
      console.error('❌ 获取窗口列表失败:', chrome.runtime.lastError);
      createWindow(pos);
      return;
    }
    
    console.log('🔵 当前所有窗口数量:', windows.length);
    let foundWindow = null;
    
    for (const win of windows) {
      console.log('🔵 检查窗口 ID:', win.id, 'type:', win.type, 'tabs:', win.tabs?.length);
      
      // 只检查 popup 类型的窗口
      if (win.type === 'popup' && win.tabs && win.tabs.length > 0) {
        const tab = win.tabs[0];
        console.log('🔵   - Tab URL:', tab.url);
        
        // 检查 URL 是否匹配（使用 startsWith 更精确）
        if (tab.url && tab.url.startsWith(popupUrl)) {
          foundWindow = win;
          console.log('✅ 找到匹配的窗口！ID:', win.id);
          break;
        }
      }
    }
    
    if (foundWindow) {
      // 找到已存在的窗口，聚焦它
      console.log('✅ 聚焦已找到的窗口:', foundWindow.id);
      currentWindowId = foundWindow.id;
      chrome.windows.update(foundWindow.id, { focused: true }, function() {
        if (chrome.runtime.lastError) {
          console.error('❌ 聚焦窗口失败:', chrome.runtime.lastError);
          // 聚焦失败，清除记录并创建新窗口
          currentWindowId = null;
          createWindow(pos);
        } else {
          console.log('✅ 窗口聚焦成功');
        }
      });
    } else {
      // 没有找到，创建新窗口
      console.log('🔵 未找到现有窗口，创建新窗口');
      createWindow(pos);
    }
  });
}

// 创建窗口
function createWindow(pos) {
  // 确保 pos 对象存在，并设置默认值
  const position = pos || {};
  const windowConfig = {
    url: chrome.runtime.getURL('popup.html?mode=window'),
    type: 'popup',
    width: Math.max(position.width || 780, 780),
    height: Math.max(position.height || 760, 760),
    left: Math.max(position.left || 100, 0),
    top: Math.max(position.top || 50, 0),
    focused: true
  };
  
  console.log('创建窗口，配置:', windowConfig);
  
  chrome.windows.create(windowConfig, function(win) {
    if (chrome.runtime.lastError) {
      console.error('创建窗口失败:', chrome.runtime.lastError);
      // 如果创建失败，尝试使用最小配置重新创建
      chrome.windows.create({
        url: chrome.runtime.getURL('popup.html?mode=window'),
        type: 'popup',
        width: 780,
        height: 760,
        focused: true
      }, function(retryWin) {
        if (chrome.runtime.lastError) {
          console.error('重试创建窗口也失败:', chrome.runtime.lastError);
        } else {
          console.log('重试创建窗口成功，ID:', retryWin.id);
          currentWindowId = retryWin.id;
        }
      });
    } else {
      console.log('窗口创建成功，ID:', win.id);
      currentWindowId = win.id;
    }
  });
}

// 扩展安装或更新时初始化
chrome.runtime.onInstalled.addListener(function(details) {
  console.log('扩展状态变化:', details.reason);
  
  if (details.reason === 'install') {
    console.log('首次安装 SPX Helper');
    
    // 初始化存储（空数组，实际数据在popup.js初始化）
    chrome.storage.local.set({
      allLinks: [],
      linkCategories: [],
      allSnippets: [],
      snippetCategories: [],
      todos: [],
      windowMode: false, // 默认使用 popup 模式
      windowPosition: { left: 100, top: 50, width: 780, height: 760 }
    }, function() {
      console.log('初始化完成');
      
      // 显示欢迎通知
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images/icon128.png',
        title: '⚡ 欢迎使用 SPX Helper',
        message: 'Shopee 大数据开发助手已安装！点击工具栏图标开始使用。',
        priority: 2
      });
      
      // 初始化完成后检查设置
      checkWindowModeSetting();
    });
  } else if (details.reason === 'update') {
    console.log('扩展已更新到 v2.3.0');
    // 更新时检查窗口模式设置
    checkWindowModeSetting();
  }
});

// 监听扩展图标点击（仅在窗口模式下触发，因为 popup 模式下有 default_popup）
chrome.action.onClicked.addListener(function(tab) {
  console.log('🔵 扩展图标被点击');
  chrome.storage.local.get(['windowMode', 'windowPosition'], function(result) {
    console.log('🔵 当前设置 - windowMode:', result.windowMode, 'windowPosition:', result.windowPosition);
    if (result.windowMode) {
      // 窗口模式：打开独立窗口
      console.log('🔵 窗口模式已启用，调用 openHelperWindow');
      openHelperWindow(result.windowPosition);
    } else {
      console.log('⚠️ 窗口模式未启用，但图标被点击了（可能配置有问题）');
    }
  });
});

// 监听窗口关闭
chrome.windows.onRemoved.addListener(function(windowId) {
  console.log('🔵 窗口关闭，ID:', windowId);
  if (windowId === currentWindowId) {
    console.log('✅ 清除记录的窗口ID');
    currentWindowId = null;
  }
});

// Chrome启动时，检查窗口模式设置
chrome.runtime.onStartup.addListener(function() {
  console.log('Chrome启动，SPX Helper Service Worker激活');
  checkWindowModeSetting();
});

// Service Worker 激活时也检查设置（确保每次激活都正确设置）
checkWindowModeSetting();

// 监听来自popup的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('收到消息:', request);
  
  // 测试DataSuite配置
  if (request.action === 'TEST_DATASUITE_CONFIG') {
    (async () => {
      try {
        const { token, username } = request.config;
        const endUser = username.includes('@') ? username : `${username}@shopee.com`;
        
        // 测试一个简单的查询
        const testUrl = 'https://open-api.datasuite.shopee.io/dataservice/spx_mart.api_lineage_search/hg3ggpdp2lkgqlmc';
        
        const response = await fetch(testUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token,
            'X-End-User': endUser
          },
          body: JSON.stringify({
            olapPayload: {
              expressions: [{ parameterName: 'api_id', value: 'test%' }],
              prestoQueueName: 'szsc-scheduled'
            }
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.jobId) {
            sendResponse({ success: true, message: '配置验证成功' });
          } else {
            sendResponse({ success: false, error: '响应格式不正确' });
          }
        } else {
          sendResponse({ success: false, error: `HTTP ${response.status}: ${response.statusText}` });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // 保持消息通道开启
  }
  
  // HTTP 请求代理（解决 CORS 问题）
  if (request.action === 'httpRequest') {
    const { method, url, headers, body } = request;
    
    console.log('🔵 Background: 收到 HTTP 请求代理请求');
    console.log('🔵 Method:', method);
    console.log('🔵 URL:', url);
    console.log('🔵 Headers:', headers);
    
    // 构建 fetch 选项
    // Service Worker 中的 fetch 不受 CORS 限制
    const fetchOptions = {
      method: method,
      headers: {}
    };
    
    // 合并请求头（如果提供了的话）
    if (headers) {
      Object.assign(fetchOptions.headers, headers);
    }
    
    // 对于 GitHub API，确保有必要的请求头
    if (url.includes('api.github.com')) {
      fetchOptions.headers['Accept'] = 'application/vnd.github+json';
      fetchOptions.headers['User-Agent'] = 'SPX-Helper-Extension/1.0';
      // 移除可能导致问题的 User-Agent（如果存在）
      delete fetchOptions.headers['user-agent'];
    }
    
    // 处理 body
    if (body && !['GET', 'HEAD'].includes(method)) {
      fetchOptions.body = body;
    }
    
    console.log('🔵 Background: Fetch 选项:', fetchOptions);
    
    // 使用 fetch 发送请求（Service Worker 中可以绕过 CORS）
    fetch(url, fetchOptions)
      .then(async response => {
        const responseText = await response.text();
        console.log('✅ Background: 请求成功', response.status, response.statusText);
        sendResponse({
          success: true,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseText
        });
      })
      .catch(error => {
        console.error('❌ Background: HTTP 请求失败');
        console.error('错误类型:', error.name);
        console.error('错误消息:', error.message);
        console.error('错误堆栈:', error.stack);
        sendResponse({
          success: false,
          error: error.message || '请求失败',
          errorType: error.name,
          details: error.toString()
        });
      });
    
    // 返回 true 保持消息通道开放，等待异步响应
    return true;
  }
  
  if (request.action === 'notification') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'images/icon128.png',
      title: request.title || 'SPX Helper',
      message: request.message,
      priority: 2
    });
    sendResponse({ success: true });
  }
  
  // 切换窗口模式
  if (request.action === 'toggleWindowMode') {
    const enabled = request.enabled;
    console.log('🔵 收到切换窗口模式请求，enabled:', enabled);
    
    if (enabled) {
      // 启用窗口模式：移除 popup，让点击触发 onClicked
      chrome.action.setPopup({ popup: '' }, function() {
        if (chrome.runtime.lastError) {
          console.error('❌ 设置空 popup 失败:', chrome.runtime.lastError);
        } else {
          console.log('✅ 已切换到窗口模式（移除 popup）');
        }
      });
    } else {
      // 禁用窗口模式：恢复 popup
      chrome.action.setPopup({ popup: 'popup.html' }, function() {
        if (chrome.runtime.lastError) {
          console.error('❌ 恢复 popup 失败:', chrome.runtime.lastError);
        } else {
          console.log('✅ 已切换到弹窗模式（恢复 popup）');
        }
      });
    }
    
    sendResponse({ success: true });
  }
  
  // 保存窗口位置
  if (request.action === 'saveWindowPosition') {
    console.log('🔵 保存窗口位置:', request.position);
    chrome.storage.local.set({ windowPosition: request.position });
    sendResponse({ success: true });
  }
  
  // 打开窗口模式
  if (request.action === 'openWindow') {
    console.log('🔵 收到打开窗口请求');
    chrome.storage.local.get(['windowPosition'], function(result) {
      console.log('🔵 获取到的窗口位置:', result.windowPosition);
      openHelperWindow(result.windowPosition);
    });
    sendResponse({ success: true });
  }
  
  // 查询API血缘
  if (request.action === 'QUERY_API_LINEAGE') {
    console.log('🔍 Background: 收到API血缘查询请求, API ID:', request.apiId);
    
    const apiId = request.apiId;
    
    // 先尝试从缓存读取
    chrome.storage.local.get(['apiLineageCache'], async function(result) {
      try {
        const cache = result.apiLineageCache || {};
        const cacheKeys = Object.keys(cache);
        
        console.log('📦 Background: 缓存中共有', cacheKeys.length, '个API');
        console.log('🔍 Background: 查询API ID:', apiId);
        
        // 在缓存中查找匹配的API（精确匹配或模糊匹配）
        let lineageInfo = null;
        
        // 优先精确匹配
        if (cache[apiId]) {
          lineageInfo = cache[apiId];
          console.log('✅ Background: 缓存精确命中!', apiId);
        } else {
          // 模糊匹配
          for (const [cachedApiId, data] of Object.entries(cache)) {
            if (cachedApiId.includes(apiId) || apiId.includes(cachedApiId)) {
              lineageInfo = data;
              console.log('✅ Background: 缓存模糊命中!');
              console.log('   查询ID:', apiId);
              console.log('   匹配key:', cachedApiId);
              break;
            }
          }
        }
        
        if (lineageInfo) {
          // 缓存命中，直接返回（<100ms）
          sendResponse({
            success: true,
            lineageInfo: { ...lineageInfo, fromCache: true }
          });
          return;
        }
        
        // 缓存未命中，输出调试信息
        console.log('⚠️ Background: 缓存未命中');
        console.log('   查询ID:', apiId);
        if (cacheKeys.length > 0) {
          console.log('   缓存key样本（前10个）:', cacheKeys.slice(0, 10));
        } else {
          console.log('   缓存为空，可能预加载尚未完成');
        }
        console.log('   执行实时查询...');
        
        // 缓存未命中，执行实时查询
        const apiName = 'spx_mart.api_lineage_search';
        const version = 'hg3ggpdp2lkgqlmc';
        const prestoQueueName = 'szsc-scheduled';
        
        // 从存储读取配置（使用默认值以保持向后兼容）
        const configResult = await new Promise(resolve => {
          chrome.storage.local.get(['datasuiteConfig'], resolve);
        });
        
        const personalToken = configResult.datasuiteConfig?.token || 'l7Vx4TGfwhmA1gtPn+JmUQ==';
        const username = configResult.datasuiteConfig?.username || 'tianyi.liang';
        const endUser = username.includes('@') ? username : `${username}@shopee.com`;
        
        const submitUrl = `https://open-api.datasuite.shopee.io/dataservice/${apiName}/${version}`;
        
        const submitBody = {
          olapPayload: {
            expressions: [
              {
                parameterName: 'api_id',
                value: `%${apiId}%`
              }
            ],
            prestoQueueName: prestoQueueName
          }
        };
        
        console.log('📤 Background: 提交实时查询');
        
        const submitResponse = await fetch(submitUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': personalToken,
            'X-End-User': endUser
          },
          body: JSON.stringify(submitBody)
        });
        
        if (!submitResponse.ok) {
          throw new Error(`提交查询失败: ${submitResponse.status}`);
        }
        
        const submitResult = await submitResponse.json();
        console.log('✅ Background: 查询已提交, jobId:', submitResult.jobId);
        
        if (!submitResult.jobId) {
          throw new Error('未返回jobId');
        }
        
        const jobId = submitResult.jobId;
        
        // 轮询结果（最多60次）
        const maxAttempts = 60;
        let pollInterval = 500;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          
          // 动态调整间隔
          if (attempt > 20) pollInterval = 2000;
          else if (attempt > 5) pollInterval = 1000;
          
          const metaUrl = `https://open-api.datasuite.shopee.io/dataservice/result/${jobId}`;
          
          const metaResponse = await fetch(metaUrl, {
            headers: {
              'Authorization': personalToken,
              'X-End-User': endUser
            }
          });
          
          const metaResult = await metaResponse.json();
          
          if (attempt % 5 === 0 || metaResult.status === 'FINISH' || metaResult.status === 'FAILED') {
            console.log(`🔄 Background: 轮询 ${attempt}/${maxAttempts}, 状态:`, metaResult.status);
          }
          
          if (metaResult.status === 'FINISH') {
            // 获取数据
            const dataUrl = `https://open-api.datasuite.shopee.io/dataservice/result/${jobId}/0`;
            
            const dataResponse = await fetch(dataUrl, {
              headers: {
                'Authorization': personalToken,
                'X-End-User': endUser
              }
            });
            
            const data = await dataResponse.json();
            console.log('📥 Background: API血缘数据:', data);
            
            if (data.contentType === 'ERROR_MESSAGE') {
              throw new Error(data.message || '查询出错');
            }
            
            if (!data.rows || data.rows.length === 0) {
              sendResponse({
                success: false,
                error: '未找到API血缘信息'
              });
              return;
            }
            
            // 筛选live环境的记录，按api_id分组，每组取最新版本
            const liveRecordsMap = {};
            data.rows.forEach(row => {
              if (row.values.publish_env === 'live') {
                const record = row.values;
                const apiId = record.api_id;
                const version = parseInt(record.api_version) || 0;
                
                // 如果该api_id还没有记录，或者当前版本更新，则更新
                if (!liveRecordsMap[apiId] || version > (parseInt(liveRecordsMap[apiId].api_version) || 0)) {
                  liveRecordsMap[apiId] = record;
                }
              }
            });
            
            const liveRecords = Object.values(liveRecordsMap);
            
            // 调试：打印所有API及其版本
            console.log(`🔍 Background: 找到 ${liveRecords.length} 个不同的API (live环境):`);
            liveRecords.forEach((rec, idx) => {
              console.log(`   ${idx + 1}. API: ${rec.api_id}, 版本: ${rec.api_version}, SQL长度: ${(rec.biz_sql || '').length}字符`);
            });
            
            if (liveRecords.length === 0) {
              sendResponse({
                success: false,
                error: '该API未发布到live环境'
              });
              return;
            }
            
            // 精确匹配或模糊匹配apiId
            let liveRecord = liveRecords.find(rec => rec.api_id === apiId);
            if (!liveRecord && liveRecords.length === 1) {
              // 如果只有一个结果，直接使用
              liveRecord = liveRecords[0];
            } else if (!liveRecord) {
              // 多个结果，尝试模糊匹配
              liveRecord = liveRecords.find(rec => rec.api_id.includes(apiId) || apiId.includes(rec.api_id));
            }
            
            console.log(`✅ Background: 最终选择 API=${liveRecord?.api_id}, 版本=${liveRecord?.api_version}`);
            
            if (!liveRecord) {
              sendResponse({
                success: false,
                error: '该API未发布到live环境'
              });
              return;
            }
            
            // 精确的表名提取（支持占位符，只显示表名）
            const bizSql = liveRecord.biz_sql || '';
            const tables = new Set();
            let match;
            
            // 方式1: 提取 {mgmt_db2}.table 格式（变量，支持占位符）
            const varTableRegex = /\{mgmt_db2\}\.([a-zA-Z0-9_\{\}\-]+)/g;
            while ((match = varTableRegex.exec(bizSql)) !== null) {
              tables.add(match[1]);
            }
            
            // 方式2: 提取 database.table 格式（FROM/JOIN后，支持占位符）
            const dbTableRegex = /\b(?:from|join)\s+[a-zA-Z0-9_]+\.([a-zA-Z0-9_\{\}\-]+)(?:\s+(?:as\s+)?[a-zA-Z0-9_]+)?/gi;
            while ((match = dbTableRegex.exec(bizSql)) !== null) {
              const tableName = match[1];
              // 只添加表名，不添加 database.table 完整引用
              tables.add(tableName);
            }
            
            const resultInfo = {
              apiId: liveRecord.api_id,
              apiVersion: liveRecord.api_version,
              bizSql: bizSql,
              dsId: liveRecord.ds_id,
              tables: Array.from(tables),
              publishEnv: liveRecord.publish_env,
              fromCache: false
            };



            
            // 更新缓存（下次查询更快）
            chrome.storage.local.get(['apiLineageCache'], function(cacheResult) {
              const updatedCache = { ...(cacheResult.apiLineageCache || {}), [liveRecord.api_id]: resultInfo };
              chrome.storage.local.set({ apiLineageCache: updatedCache });
              console.log('💾 Background: 已更新缓存');
            });
            
            console.log('✅ Background: API血缘解析成功');
            
            sendResponse({
              success: true,
              lineageInfo: resultInfo
            });
            
            return;
          } else if (metaResult.status === 'FAILED') {
            throw new Error(metaResult.message || '查询失败');
          }
        }
        
        throw new Error('查询超时（60秒）');
        
      } catch (error) {
        console.error('❌ Background: API血缘查询失败:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    });
    
    return true; // 保持异步消息通道
  }
  
  // 调用AI API（代理请求，避免CORS）
  if (request.action === 'CALL_AI_API') {
    console.log('🤖 Background: 收到AI API调用请求');
    
    // Smart Agent配置
    const SMART_CONFIG = {
      endpointHashId: 'oxff0svf5ht51i507t6k68d8',
      endpointKey: 'k160r2z9t0y0s573kt51o8vb',
      userId: 'spx_helper_api_analysis'
    };
    
    // 准备请求数据
    const requestData = {
      endpoint_deployment_hash_id: SMART_CONFIG.endpointHashId,
      endpoint_deployment_key: SMART_CONFIG.endpointKey,
      user_id: SMART_CONFIG.userId,
      message: {
        input_str: request.prompt
      }
    };
    
    console.log('📤 Background: 发送AI请求');
    
    // 调用Smart Agent API
    fetch('https://smart.shopee.io/apis/smart/v1/orchestrator/deployments/invoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    })
      .then(async response => {
        console.log('📥 Background: 收到响应，状态码:', response.status);
        
        if (!response.ok) {
          throw new Error(`AI API请求失败: ${response.status} ${response.statusText}`);
        }
        
        // 先获取响应文本
        const responseText = await response.text();
        console.log('📄 Background: 响应文本（前200字符）:', responseText.substring(0, 200));
        
        let data;
        try {
          // 尝试解析为JSON
          data = JSON.parse(responseText);
          console.log('✅ Background: JSON解析成功');
        } catch (parseError) {
          console.error('❌ Background: JSON解析失败，可能是纯文本响应');
          // 如果解析失败，直接返回文本
          sendResponse({
            success: true,
            result: responseText
          });
          return;
        }
        
        console.log('📥 Background: AI响应结构:', {
          status: data.status,
          hasData: !!data.data,
          hasOutput: !!data.output,
          keys: Object.keys(data)
        });
        
        // 检查API是否返回成功
        if (data.status !== 'success') {
          throw new Error(data.error_message || data.error || 'AI返回错误');
        }
        
        // 提取AI的响应内容 - 尝试多种可能的格式
        let assistantMessage = '';
        
        if (data.data && data.data.response && data.data.response.response_str) {
          // 格式1: data.data.response.response_str
          assistantMessage = data.data.response.response_str;
          console.log('✅ 使用格式1: data.data.response.response_str');
        } else if (data.data && data.data.output_str) {
          // 格式2: data.data.output_str
          assistantMessage = data.data.output_str;
          console.log('✅ 使用格式2: data.data.output_str');
        } else if (data.output && data.output.output_str) {
          // 格式3: data.output.output_str
          assistantMessage = data.output.output_str;
          console.log('✅ 使用格式3: data.output.output_str');
        } else if (data.output && typeof data.output === 'string') {
          // 格式4: data.output (直接是字符串)
          assistantMessage = data.output;
          console.log('✅ 使用格式4: data.output');
        } else if (data.result && typeof data.result === 'string') {
          // 格式5: data.result
          assistantMessage = data.result;
          console.log('✅ 使用格式5: data.result');
        } else if (typeof data === 'string') {
          // 格式6: 整个响应就是字符串
          assistantMessage = data;
          console.log('✅ 使用格式6: 整个响应');
        } else {
          console.error('❌ 无法识别的响应格式:', JSON.stringify(data, null, 2));
          throw new Error('无法解析AI响应格式，请查看控制台日志');
        }
        
        if (!assistantMessage || assistantMessage.trim() === '') {
          throw new Error('AI返回了空响应');
        }
        
        console.log('✅ Background: AI分析成功，结果长度:', assistantMessage.length);
        sendResponse({
          success: true,
          result: assistantMessage
        });
      })
      .catch(error => {
        console.error('❌ Background: AI请求失败:', error);
        console.error('错误堆栈:', error.stack);
        sendResponse({
          success: false,
          error: error.message || 'AI请求失败'
        });
      });
    
    // 返回 true 保持消息通道开放
    return true;
  }
  

  // === Presto查询处理 ===
  if (request.action === 'QUERY_PRESTO') {
    console.log('📊 Background: 收到Presto查询请求');
    
    const { username, password, sql, queue, region, catalog, schema } = request;
    
    // 提交查询到Presto
    queryPrestoSQL(username, password, sql, queue, region, catalog, schema)
      .then(result => {
        console.log('✅ Background: Presto查询成功');
        sendResponse({
          success: true,
          data: result
        });
      })
      .catch(error => {
        console.error('❌ Background: Presto查询失败:', error);
        sendResponse({
          success: false,
          error: error.message || 'Presto查询失败'
        });
      });
    
    return true;
  }
  
  return true;
});

// 监听通知点击事件
chrome.notifications.onClicked.addListener(function(notificationId) {
  console.log('通知被点击:', notificationId);
});


// === Presto REST API实现 ===
// 使用Personal SQL API查询Presto
// 
// 参数说明:
//   - username: 用户名（会自动转为邮箱格式）
//   - password: 密码（已废弃，不再使用）
//   - sql: SQL查询语句
//   - queue: Presto队列名称，如 'szsc-adhoc' 或 'szsc-scheduled'
//   - region: IDC集群，可选值: 'SG' (新加坡) 或 'US' (美国)
//   - catalog: Catalog名称，默认 'hive'
//   - schema: Schema名称，默认 'shopee'

async function queryPrestoSQL(username, password, sql, queue, region, catalog = 'hive', schema = 'shopee') {
  // 使用 Personal SQL API（不再直接连接Presto）
  const personalToken = 'l7Vx4TGfwhmA1gtPn+JmUQ==';  // 你的Personal Token
  const endUser = username.includes('@') ? username : username + '@shopee.com';
  
  console.log('📤 [Personal SQL API] 提交查询...');
  console.log('   Queue:', queue);
  console.log('   Region:', region);
  console.log('   SQL:', sql.substring(0, 100) + (sql.length > 100 ? '...' : ''));
  
  // Step 1: 提交查询
  const submitUrl = 'https://open-api.datasuite.shopee.io/dataservice/personal/query/presto';
  
  const submitBody = {
    sql: sql,
    prestoQueue: queue,
    idcRegion: region,
    priority: '3'
  };
  
  const submitResponse = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': personalToken,
      'X-End-User': endUser
    },
    body: JSON.stringify(submitBody)
  });
  
  if (!submitResponse.ok) {
    throw new Error(`提交查询失败: ${submitResponse.status}`);
  }
  
  const submitResult = await submitResponse.json();
  const jobId = submitResult.jobId;
  
  console.log('✅ [Personal SQL API] 查询已提交, jobId:', jobId);
  
  // Step 2: 轮询查询状态
  const maxAttempts = 60;
  let pollInterval = 500;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    // 动态调整间隔
    if (attempt > 20) pollInterval = 2000;
    else if (attempt > 5) pollInterval = 1000;
    
    const statusUrl = `https://open-api.datasuite.shopee.io/dataservice/personal/status/${jobId}`;
    
    const statusResponse = await fetch(statusUrl, {
      headers: {
        'Authorization': personalToken,
        'X-End-User': endUser
      }
    });
    
    const statusResult = await statusResponse.json();
    
    if (attempt % 5 === 0 || statusResult.status === 'FINISH' || statusResult.status === 'FAILED') {
      console.log(`🔄 [Personal SQL API] 轮询 ${attempt}/${maxAttempts}, 状态:`, statusResult.status);
    }
    
    if (statusResult.status === 'FINISH') {
      // Step 3: 获取结果
      const resultUrl = `https://open-api.datasuite.shopee.io/dataservice/personal/result/${jobId}`;
      
      const resultResponse = await fetch(resultUrl, {
        headers: {
          'Authorization': personalToken,
          'X-End-User': endUser
        }
      });
      
      const resultData = await resultResponse.json();
      
      console.log('✅ [Personal SQL API] 查询完成');
      
      // 解析结果格式
      const columns = resultData.resultSchema?.map(col => col.columnName) || [];
      const rows = resultData.rows?.map(row => {
        // 将 {values: {col1: val1, col2: val2}} 转换为数组 [val1, val2]
        const values = row.values || {};
        return columns.map(col => values[col]);
      }) || [];
      
      console.log('   列数:', columns.length);
      console.log('   行数:', rows.length);
      
      return {
        columns: columns,
        rows: rows,
        stats: {
          engine: resultData.engine,
          pageSize: resultData.pageSize
        }
      };
    } else if (statusResult.status === 'FAILED') {
      throw new Error(statusResult.message || '查询失败');
    }
  }
  
  throw new Error('查询超时（60秒）');
}
console.log('SPX Helper Service Worker 初始化完成');

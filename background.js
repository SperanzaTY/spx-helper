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
  // 默认窗口大小与 popup 一致：宽 750px，高 700px + 顶部提示栏
  const pos = position || { left: 100, top: 50, width: 780, height: 760 };
  
  // 先检查所有窗口，找到已存在的 Helper 窗口
  chrome.windows.getAll({ populate: true }, function(windows) {
    let foundWindow = null;
    
    for (const win of windows) {
      if (win.type === 'popup' && win.tabs && win.tabs.length > 0) {
        const tab = win.tabs[0];
        if (tab.url && tab.url.includes(chrome.runtime.id) && tab.url.includes('popup.html')) {
          foundWindow = win;
          break;
        }
      }
    }
    
    if (foundWindow) {
      // 找到已存在的窗口，聚焦它
      console.log('找到已存在的窗口，聚焦:', foundWindow.id);
      currentWindowId = foundWindow.id;
      chrome.windows.update(foundWindow.id, { focused: true });
    } else {
      // 没有找到，创建新窗口
      createWindow(pos);
    }
  });
}

// 创建窗口
function createWindow(pos) {
  console.log('创建窗口，位置:', pos);
  chrome.windows.create({
    url: chrome.runtime.getURL('popup.html?mode=window'),
    type: 'popup',
    width: Math.max(pos.width || 780, 780),
    height: Math.max(pos.height || 760, 760),
    left: Math.max(pos.left || 100, 0),
    top: Math.max(pos.top || 50, 0),
    focused: true
  }, function(win) {
    if (chrome.runtime.lastError) {
      console.error('创建窗口失败:', chrome.runtime.lastError);
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
  console.log('扩展图标被点击');
  chrome.storage.local.get(['windowMode', 'windowPosition'], function(result) {
    console.log('当前设置:', result);
    if (result.windowMode) {
      // 窗口模式：打开独立窗口
      openHelperWindow(result.windowPosition);
    }
  });
});

// 监听窗口关闭
chrome.windows.onRemoved.addListener(function(windowId) {
  if (windowId === currentWindowId) {
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
  
  // HTTP 请求代理（解决 CORS 问题）
  if (request.action === 'httpRequest') {
    const { method, url, headers, body } = request;
    
    console.log('代理 HTTP 请求:', method, url);
    
    const fetchOptions = {
      method: method,
      headers: headers || {}
    };
    
    if (body && !['GET', 'HEAD'].includes(method)) {
      fetchOptions.body = body;
    }
    
    fetch(url, fetchOptions)
      .then(async response => {
        const responseText = await response.text();
        sendResponse({
          success: true,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseText
        });
      })
      .catch(error => {
        console.error('HTTP 请求失败:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      });
    
    return true; // 保持消息通道开放
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
    
    if (enabled) {
      // 启用窗口模式：移除 popup，让点击触发 onClicked
      chrome.action.setPopup({ popup: '' });
      console.log('已切换到窗口模式');
    } else {
      // 禁用窗口模式：恢复 popup
      chrome.action.setPopup({ popup: 'popup.html' });
      console.log('已切换到弹窗模式');
    }
    
    sendResponse({ success: true });
  }
  
  // 保存窗口位置
  if (request.action === 'saveWindowPosition') {
    chrome.storage.local.set({ windowPosition: request.position });
    sendResponse({ success: true });
  }
  
  // 打开窗口模式
  if (request.action === 'openWindow') {
    chrome.storage.local.get(['windowPosition'], function(result) {
      openHelperWindow(result.windowPosition);
    });
    sendResponse({ success: true });
  }
  
  return true;
});

// 监听通知点击事件
chrome.notifications.onClicked.addListener(function(notificationId) {
  console.log('通知被点击:', notificationId);
});

console.log('SPX Helper Service Worker 初始化完成');

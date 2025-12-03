// Author: tianyi.liang

// 初始化页面
document.addEventListener('DOMContentLoaded', function() {
  loadExtensionId();
  loadCurrentConfig();
  initEventListeners();
});

// 初始化事件监听器
function initEventListeners() {
  // 复制扩展 ID
  const copyBtn = document.getElementById('copyExtensionIdBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', copyExtensionId);
  }
  
  // 打开 Cloud Console
  const cloudConsoleBtn = document.getElementById('openCloudConsoleBtn');
  if (cloudConsoleBtn) {
    cloudConsoleBtn.addEventListener('click', openGoogleCloudConsole);
  }
  
  // 打开详细教程
  const guideBtn = document.getElementById('openGuideBtn');
  if (guideBtn) {
    guideBtn.addEventListener('click', openDetailedGuide);
  }
  
  // 保存配置
  const saveBtn = document.getElementById('saveConfigBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveConfig);
  }
  
  // 测试授权
  const testBtn = document.getElementById('testAuthBtn');
  if (testBtn) {
    testBtn.addEventListener('click', testAuth);
  }
  
  // 清除配置
  const clearBtn = document.getElementById('clearConfigBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearConfig);
  }
}

// 加载扩展 ID
function loadExtensionId() {
  const extensionId = chrome.runtime.id;
  document.getElementById('extensionId').textContent = extensionId;
}

// 加载当前配置
function loadCurrentConfig() {
  chrome.storage.local.get(['calendarClientId'], function(result) {
    const clientId = result.calendarClientId;
    
    if (clientId) {
      document.getElementById('clientId').value = clientId;
      document.getElementById('currentClientId').textContent = clientId;
      document.getElementById('configStatus').textContent = '✅ 已配置';
      document.getElementById('configStatus').style.color = '#28a745';
    } else {
      document.getElementById('currentClientId').textContent = '未配置';
      document.getElementById('configStatus').textContent = '⚠️ 等待配置...';
      document.getElementById('configStatus').style.color = '#ffc107';
    }
  });
}

// 复制扩展 ID
function copyExtensionId() {
  const extensionId = document.getElementById('extensionId').textContent;
  navigator.clipboard.writeText(extensionId).then(() => {
    showStatus('✅ 扩展 ID 已复制到剪贴板！', 'success');
  }).catch(err => {
    showStatus('❌ 复制失败: ' + err.message, 'error');
  });
}

// 打开 Google Cloud Console
function openGoogleCloudConsole() {
  chrome.tabs.create({
    url: 'https://console.cloud.google.com/'
  });
  showStatus('📂 已在新标签页中打开 Google Cloud Console', 'info');
}

// 打开详细教程
function openDetailedGuide() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('OAUTH_SETUP_QUICK.md')
  });
}

// 保存配置
function saveConfig() {
  const clientId = document.getElementById('clientId').value.trim();
  
  // 验证输入
  if (!clientId) {
    showStatus('❌ 请输入 Client ID', 'error');
    return;
  }
  
  // 验证格式
  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    showStatus('❌ Client ID 格式不正确，应以 .apps.googleusercontent.com 结尾', 'error');
    return;
  }
  
  // 保存到 storage
  chrome.storage.local.set({
    calendarClientId: clientId,
    calendarConfigured: true
  }, function() {
    if (chrome.runtime.lastError) {
      showStatus('❌ 保存失败: ' + chrome.runtime.lastError.message, 'error');
    } else {
      showStatus('✅ 配置已保存！现在可以返回主页面使用日历功能了。', 'success');
      loadCurrentConfig();
      
      // 3秒后提示用户返回主页面
      setTimeout(() => {
        if (confirm('配置已保存！是否返回扩展主页面？')) {
          window.close();
        }
      }, 1500);
    }
  });
}

// 测试授权
function testAuth() {
  const clientId = document.getElementById('clientId').value.trim();
  
  if (!clientId) {
    showStatus('❌ 请先输入并保存 Client ID', 'error');
    return;
  }
  
  showStatus('🔄 正在测试授权...', 'info');
  
  // 检查 chrome.identity API 是否可用
  if (!chrome.identity || !chrome.identity.getAuthToken) {
    showStatus('❌ Chrome Identity API 不可用。请确保 manifest.json 中已添加 identity 权限。', 'error');
    return;
  }
  
  // 尝试获取 token
  chrome.identity.getAuthToken({ interactive: true }, function(token) {
    if (chrome.runtime.lastError) {
      showStatus('❌ 授权失败: ' + chrome.runtime.lastError.message + 
                '\n\n可能的原因：\n' +
                '1. Client ID 不正确\n' +
                '2. manifest.json 中的 oauth2 配置未更新\n' +
                '3. OAuth 客户端的应用 ID 与扩展 ID 不匹配', 'error');
    } else if (token) {
      showStatus('✅ 授权成功！Token 已获取。\n\n' +
                '现在可以在主页面的"今日日程"标签中查看日历了！', 'success');
      
      // 可选：撤销 token 以便下次重新测试
      setTimeout(() => {
        if (confirm('授权测试成功！是否撤销此次授权以便重新测试？')) {
          chrome.identity.removeCachedAuthToken({ token: token }, () => {
            showStatus('🔄 授权已撤销，可以重新测试', 'info');
          });
        }
      }, 2000);
    } else {
      showStatus('⚠️ 未获取到 token，请检查配置', 'error');
    }
  });
}

// 清除配置
function clearConfig() {
  if (!confirm('确定要清除配置吗？')) {
    return;
  }
  
  chrome.storage.local.remove(['calendarClientId', 'calendarConfigured'], function() {
    document.getElementById('clientId').value = '';
    showStatus('🗑️ 配置已清除', 'info');
    loadCurrentConfig();
  });
}

// 显示状态消息
function showStatus(message, type) {
  const statusDiv = document.getElementById('statusMessage');
  statusDiv.textContent = message;
  statusDiv.className = 'status-message ' + type;
  statusDiv.style.display = 'block';
  
  // 3秒后自动隐藏 info 类型的消息
  if (type === 'info') {
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
}


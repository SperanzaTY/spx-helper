// SPX Helper - Shopee 大数据开发助手
// Author: tianyi.liang
// v2.6.0

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  initWindowMode();
  initSettings();
  initTabs();
  initLinks();
  initNotes();
  initUtils();
  initTimezone();
  initJsonTool();
  initSqlTool();
  initCronTool();
  initRegexTool();
  initDiffTool();
  initCaseTool();
  initMermaidTool();
  initHttpTool();
  initCalendarTool();
  initCodeHelper();
  initTodos();
  
  // 事件监听器
  document.getElementById('addLink').addEventListener('click', addLink);
  document.getElementById('addLinkCategory').addEventListener('click', addLinkCategory);
  document.getElementById('getCurrentTimestamp').addEventListener('click', setCurrentTimestamp);
  document.getElementById('convertToTimestamp').addEventListener('click', convertToTimestamp);
  document.getElementById('timestampInput').addEventListener('input', convertTimestamp);
  document.getElementById('searchTodos').addEventListener('input', filterTodos);
});

// ===== 窗口模式检测 =====
function initWindowMode() {
  // 检查是否在窗口模式下打开
  const urlParams = new URLSearchParams(window.location.search);
  const isWindowMode = urlParams.get('mode') === 'window';
  
  if (isWindowMode) {
    document.body.classList.add('window-mode');
    
    // 监听窗口大小变化，保存位置
    let saveTimeout;
    window.addEventListener('resize', function() {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveWindowPosition, 500);
    });
  }
}

// 保存窗口位置
function saveWindowPosition() {
  const position = {
    width: window.outerWidth,
    height: window.outerHeight,
    left: window.screenX,
    top: window.screenY
  };
  chrome.runtime.sendMessage({ action: 'saveWindowPosition', position: position });
}

// ===== 设置面板 =====
function initSettings() {
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const closeSettings = document.getElementById('closeSettings');
  const windowModeSwitch = document.getElementById('windowModeSwitch');
  
  // 显示当前版本号
  const manifest = chrome.runtime.getManifest();
  const versionElement = document.getElementById('currentVersion');
  if (versionElement) {
    versionElement.textContent = manifest.version;
  }
  
  // 加载当前设置
  chrome.storage.local.get(['windowMode'], function(result) {
    if (windowModeSwitch) {
      windowModeSwitch.checked = result.windowMode || false;
    }
  });
  
  // 打开设置面板
  if (settingsBtn) {
    settingsBtn.addEventListener('click', function() {
      settingsPanel.style.display = 'flex';
    });
  }
  
  // 关闭设置面板
  if (closeSettings) {
    closeSettings.addEventListener('click', function() {
      settingsPanel.style.display = 'none';
    });
  }
  
  // 点击遮罩关闭
  if (settingsPanel) {
    settingsPanel.addEventListener('click', function(e) {
      if (e.target === settingsPanel) {
        settingsPanel.style.display = 'none';
      }
    });
  }
  
  // 窗口模式开关
  if (windowModeSwitch) {
    windowModeSwitch.addEventListener('change', function() {
      const enabled = this.checked;
      
      // 保存设置
      chrome.storage.local.set({ windowMode: enabled }, function() {
        // 通知 background 切换模式
        chrome.runtime.sendMessage({ action: 'toggleWindowMode', enabled: enabled }, function() {
          // 关闭设置面板
          settingsPanel.style.display = 'none';
          
          // 检查当前是否在窗口模式中
          const urlParams = new URLSearchParams(window.location.search);
          const isInWindowMode = urlParams.get('mode') === 'window';
          
          if (enabled && !isInWindowMode) {
            // 从弹窗模式切换到窗口模式：打开独立窗口并关闭当前 popup
            chrome.runtime.sendMessage({ action: 'openWindow' });
            setTimeout(function() {
              window.close();
            }, 300);
          } else if (!enabled && isInWindowMode) {
            // 从窗口模式切换到弹窗模式：关闭当前窗口，用户点击图标即可看到弹窗
            alert('已切换回弹窗模式，点击扩展图标即可打开');
            window.close();
          }
        });
      });
    });
  }
  
  // 数据导出按钮
  const exportDataBtn = document.getElementById('exportDataBtn');
  if (exportDataBtn) {
    exportDataBtn.addEventListener('click', exportAllData);
  }
  
  // 数据导入按钮
  const importDataBtn = document.getElementById('importDataBtn');
  const importDataFile = document.getElementById('importDataFile');
  if (importDataBtn && importDataFile) {
    importDataBtn.addEventListener('click', function() {
      importDataFile.click();
    });
    importDataFile.addEventListener('change', importAllData);
  }
  
  // 清除所有数据按钮
  const clearAllDataBtn = document.getElementById('clearAllDataBtn');
  if (clearAllDataBtn) {
    clearAllDataBtn.addEventListener('click', clearAllData);
  }
  
  // 检查更新按钮
  const checkUpdateBtn = document.getElementById('checkUpdateBtn');
  if (checkUpdateBtn) {
    checkUpdateBtn.addEventListener('click', checkForUpdates);
  }
  
  // 加载更新检查配置
  loadUpdateConfig();
  
  // 保存更新配置按钮
  const saveUpdateConfigBtn = document.getElementById('saveUpdateConfigBtn');
  const githubRepoInput = document.getElementById('githubRepoInput');
  if (saveUpdateConfigBtn && githubRepoInput) {
    saveUpdateConfigBtn.addEventListener('click', saveUpdateConfig);
  }
}

// 加载更新检查配置
function loadUpdateConfig() {
  chrome.storage.local.get(['updateCheckConfig'], function(result) {
    const config = result.updateCheckConfig || {};
    const githubRepoInput = document.getElementById('githubRepoInput');
    
    // 如果没有配置，设置默认值
    if (!config.githubRepo) {
      config.githubRepo = 'SperanzaTY/spx-helper';
      chrome.storage.local.set({ updateCheckConfig: config });
    }
    
    if (githubRepoInput) {
      githubRepoInput.value = config.githubRepo || 'SperanzaTY/spx-helper';
    }
  });
}

// 保存更新检查配置
function saveUpdateConfig() {
  const githubRepoInput = document.getElementById('githubRepoInput');
  const updateConfigStatus = document.getElementById('updateConfigStatus');
  
  if (!githubRepoInput || !updateConfigStatus) return;
  
  const repo = githubRepoInput.value.trim();
  
  // 验证格式
  if (repo && !/^[\w\-\.]+\/[\w\-\.]+$/.test(repo)) {
    updateConfigStatus.textContent = '❌ 格式错误，应为：owner/repo';
    updateConfigStatus.style.color = '#dc2626';
    return;
  }
  
  const config = { githubRepo: repo || null };
  
  chrome.storage.local.set({ updateCheckConfig: config }, function() {
    updateConfigStatus.textContent = repo ? '✓ 配置已保存' : '✓ 已清除配置';
    updateConfigStatus.style.color = '#16a34a';
    
    setTimeout(() => {
      updateConfigStatus.textContent = '';
    }, 2000);
  });
}

// 检查更新
function checkForUpdates() {
  const checkUpdateBtn = document.getElementById('checkUpdateBtn');
  const updateStatus = document.getElementById('updateStatus');
  
  if (!checkUpdateBtn || !updateStatus) return;
  
  // 显示检查中状态
  checkUpdateBtn.disabled = true;
  checkUpdateBtn.textContent = '检查中...';
  updateStatus.style.display = 'block';
  updateStatus.className = 'update-status checking';
  updateStatus.innerHTML = '正在检查更新...';
  
  // 获取当前版本
  const manifest = chrome.runtime.getManifest();
  const currentVersion = manifest.version;
  
  // 从存储中读取更新检查配置
  chrome.storage.local.get(['updateCheckConfig'], function(result) {
    const config = result.updateCheckConfig || {};
    const githubRepo = config.githubRepo; // 格式: "owner/repo"
    
    if (githubRepo) {
      // 从 GitHub Releases API 检查
      checkGitHubUpdates(githubRepo, currentVersion, checkUpdateBtn, updateStatus);
    } else {
      // 没有配置远程检查，显示手动更新说明
      showManualUpdateInstructions(currentVersion, checkUpdateBtn, updateStatus);
    }
  });
}

// 从 GitHub Releases API 检查更新
function checkGitHubUpdates(githubRepo, currentVersion, checkUpdateBtn, updateStatus) {
  const apiUrl = `https://api.github.com/repos/${githubRepo}/releases/latest`;
  
  fetch(apiUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error(`GitHub API 错误: ${response.status}`);
      }
      return response.json();
    })
    .then(release => {
      // 从 tag_name 提取版本号（格式可能是 "v2.6.5" 或 "2.6.5"）
      const latestVersion = release.tag_name.replace(/^v/, '');
      const isNewer = compareVersions(latestVersion, currentVersion) > 0;
      
      if (isNewer) {
        // 有新版本，查找 zip 文件下载链接
        const zipAsset = release.assets.find(asset => asset.name.endsWith('.zip'));
        const downloadUrl = zipAsset ? zipAsset.browser_download_url : null;
        
        updateStatus.className = 'update-status update-available';
        updateStatus.innerHTML = `
          <div class="update-info">
            <strong>发现新版本 v${latestVersion}</strong>
            <p>当前版本：v${currentVersion}</p>
            <p style="font-size: 12px; margin-top: 8px;">${release.name || release.tag_name}</p>
            <div class="update-actions">
              <button id="updateNowBtn" class="btn btn-primary btn-small" style="margin-top: 8px;">
                ⬇️ 立即更新
              </button>
              <a href="${release.html_url}" target="_blank" class="btn btn-secondary btn-small" style="margin-top: 8px; text-decoration: none; display: inline-block;">
                查看详情
              </a>
            </div>
            <div id="updateProgress" style="display: none; margin-top: 12px; font-size: 12px;"></div>
          </div>
        `;
        
        // 绑定立即更新按钮
        const updateNowBtn = document.getElementById('updateNowBtn');
        if (updateNowBtn && downloadUrl) {
          updateNowBtn.addEventListener('click', function() {
            downloadAndInstallUpdate(downloadUrl, latestVersion, release.html_url);
          });
        } else if (updateNowBtn) {
          // 如果没有找到 zip 文件，跳转到 Release 页面
          updateNowBtn.addEventListener('click', function() {
            chrome.tabs.create({ url: release.html_url });
          });
        }
      } else {
        // 已是最新版本
        updateStatus.className = 'update-status up-to-date';
        updateStatus.innerHTML = `✓ 已是最新版本 (v${currentVersion})`;
      }
    })
    .catch(error => {
      console.error('更新检查失败:', error);
      updateStatus.className = 'update-status error';
      updateStatus.innerHTML = `
        <div class="update-info">
          <p>无法连接到更新服务器</p>
          <p class="update-desc" style="font-size: 11px; margin-top: 4px;">${error.message}</p>
        </div>
      `;
    })
    .finally(() => {
      checkUpdateBtn.disabled = false;
      checkUpdateBtn.textContent = '检查更新';
    });
}

// 显示手动更新说明
function showManualUpdateInstructions(currentVersion, checkUpdateBtn, updateStatus) {
  updateStatus.className = 'update-status info';
  updateStatus.innerHTML = `
    <div class="update-info">
      <p><strong>当前版本：v${currentVersion}</strong></p>
      <p class="update-desc">本地扩展无法自动检查更新</p>
      <p class="update-desc" style="margin-top: 8px;">更新步骤：</p>
      <ol style="text-align: left; margin: 8px 0; padding-left: 20px; font-size: 12px;">
        <li>访问 <code>chrome://extensions/</code></li>
        <li>找到 SPX Helper</li>
        <li>点击"重新加载"或下载新版本安装</li>
      </ol>
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
        <p class="update-desc" style="font-size: 11px; color: #666;">
          提示：如需自动检查更新，可在设置中配置 GitHub 仓库地址
        </p>
      </div>
    </div>
  `;
  
  checkUpdateBtn.disabled = false;
  checkUpdateBtn.textContent = '检查更新';
}

// 比较版本号
function compareVersions(version1, version2) {
  const v1parts = version1.split('.').map(Number);
  const v2parts = version2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
    const v1part = v1parts[i] || 0;
    const v2part = v2parts[i] || 0;
    
    if (v1part > v2part) return 1;
    if (v1part < v2part) return -1;
  }
  
  return 0;
}

// 下载并安装更新
function downloadAndInstallUpdate(downloadUrl, version, releaseUrl) {
  const updateProgress = document.getElementById('updateProgress');
  const updateNowBtn = document.getElementById('updateNowBtn');
  
  if (!updateProgress || !updateNowBtn) {
    console.error('更新进度元素未找到');
    return;
  }
  
  console.log('开始下载更新:', downloadUrl);
  
  // 显示下载进度
  updateProgress.style.display = 'block';
  updateProgress.innerHTML = '📥 正在启动下载...';
  updateNowBtn.disabled = true;
  updateNowBtn.textContent = '下载中...';
  
  // 尝试使用 Chrome Downloads API
  const filename = `SPX_Helper_v${version}.zip`;
  let currentDownloadId = null;
  
  // 监听下载状态
  const downloadListener = function(downloadDelta) {
    // 只处理当前下载的状态变化
    if (currentDownloadId !== null && downloadDelta.id !== currentDownloadId) {
      return;
    }
    
    console.log('下载状态变化:', downloadDelta);
    
    if (downloadDelta.state && downloadDelta.state.current === 'complete') {
      // 下载完成
      updateProgress.innerHTML = '✅ 下载完成！';
      setTimeout(() => {
        showInstallInstructions(version, releaseUrl);
      }, 500);
      chrome.downloads.onChanged.removeListener(downloadListener);
    } else if (downloadDelta.error) {
      // 下载失败
      const errorMsg = downloadDelta.error.current || '未知错误';
      console.error('下载失败:', errorMsg);
      updateProgress.innerHTML = `
        <div style="color: #dc2626;">
          ⚠️ 下载失败：${errorMsg}<br>
          请<a href="${downloadUrl}" target="_blank" style="color: #667eea; text-decoration: underline;">点击这里手动下载</a>
        </div>
      `;
      updateNowBtn.disabled = false;
      updateNowBtn.textContent = '⬇️ 立即更新';
      chrome.downloads.onChanged.removeListener(downloadListener);
    }
  };
  
  // 添加监听器
  chrome.downloads.onChanged.addListener(downloadListener);
  
  // 开始下载
  try {
    chrome.downloads.download({
      url: downloadUrl,
      filename: filename,
      saveAs: false
    }, function(downloadId) {
      if (chrome.runtime.lastError) {
        // Downloads API 失败，使用新标签页下载
        const errorMsg = chrome.runtime.lastError.message;
        console.error('下载 API 错误:', errorMsg);
        updateProgress.innerHTML = `
          <div style="color: #92400e; background: #fef3c7; padding: 8px; border-radius: 6px;">
            📥 正在新标签页中打开下载链接...<br>
            <small>如果下载未开始，请<a href="${downloadUrl}" target="_blank" style="color: #667eea; text-decoration: underline;">点击这里</a></small>
          </div>
        `;
        // 在新标签页打开下载链接
        chrome.tabs.create({ url: downloadUrl });
        // 延迟显示安装指引
        setTimeout(() => {
          showInstallInstructions(version, releaseUrl);
        }, 2000);
        updateNowBtn.disabled = false;
        updateNowBtn.textContent = '✅ 已打开下载';
        chrome.downloads.onChanged.removeListener(downloadListener);
      } else if (downloadId) {
        // 下载已启动
        currentDownloadId = downloadId;
        console.log('下载已启动，ID:', downloadId);
        updateProgress.innerHTML = '📥 正在下载更新...';
      } else {
        // 下载 ID 为空
        console.error('下载 ID 为空，使用备用方案');
        updateProgress.innerHTML = `
          <div style="color: #92400e; background: #fef3c7; padding: 8px; border-radius: 6px;">
            📥 正在新标签页中打开下载链接...<br>
            <small>如果下载未开始，请<a href="${downloadUrl}" target="_blank" style="color: #667eea; text-decoration: underline;">点击这里</a></small>
          </div>
        `;
        chrome.tabs.create({ url: downloadUrl });
        setTimeout(() => {
          showInstallInstructions(version, releaseUrl);
        }, 2000);
        updateNowBtn.disabled = false;
        updateNowBtn.textContent = '✅ 已打开下载';
        chrome.downloads.onChanged.removeListener(downloadListener);
      }
    });
  } catch (error) {
    // 捕获异常，使用备用方案
    console.error('下载异常:', error);
    updateProgress.innerHTML = `
      <div style="color: #92400e; background: #fef3c7; padding: 8px; border-radius: 6px;">
        📥 正在新标签页中打开下载链接...<br>
        <small>如果下载未开始，请<a href="${downloadUrl}" target="_blank" style="color: #667eea; text-decoration: underline;">点击这里</a></small>
      </div>
    `;
    chrome.tabs.create({ url: downloadUrl });
    setTimeout(() => {
      showInstallInstructions(version, releaseUrl);
    }, 2000);
    updateNowBtn.disabled = false;
    updateNowBtn.textContent = '✅ 已打开下载';
    chrome.downloads.onChanged.removeListener(downloadListener);
  }
}

// 显示安装指引
function showInstallInstructions(version, releaseUrl) {
  const updateProgress = document.getElementById('updateProgress');
  const updateNowBtn = document.getElementById('updateNowBtn');
  
  if (!updateProgress) return;
  
  updateProgress.innerHTML = `
    <div style="background: #f0f9ff; padding: 12px; border-radius: 8px; margin-top: 8px; text-align: left;">
      <strong style="display: block; margin-bottom: 8px; color: #1e40af;">📦 安装步骤：</strong>
      <ol style="margin: 0; padding-left: 20px; font-size: 12px; line-height: 1.8; color: #1e40af;">
        <li>打开 <code style="background: rgba(255,255,255,0.5); padding: 2px 6px; border-radius: 4px;">chrome://extensions/</code></li>
        <li>开启右上角"开发者模式"</li>
        <li>点击"加载已解压的扩展程序"</li>
        <li>选择下载的 zip 文件解压后的文件夹</li>
        <li>完成！扩展已更新到 v${version}</li>
      </ol>
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #bfdbfe;">
        <button id="openExtensionsPage" class="btn btn-primary btn-small" style="font-size: 11px; padding: 4px 8px;">
          🔗 打开扩展管理页面
        </button>
        <a href="${releaseUrl}" target="_blank" class="btn btn-secondary btn-small" style="font-size: 11px; padding: 4px 8px; text-decoration: none; display: inline-block; margin-left: 6px;">
          📋 查看更新日志
        </a>
      </div>
    </div>
  `;
  
  if (updateNowBtn) {
    updateNowBtn.disabled = false;
    updateNowBtn.textContent = '✅ 下载完成';
  }
  
  // 绑定打开扩展管理页面按钮
  const openExtensionsPageBtn = document.getElementById('openExtensionsPage');
  if (openExtensionsPageBtn) {
    openExtensionsPageBtn.addEventListener('click', function() {
      chrome.tabs.create({ url: 'chrome://extensions/' });
    });
  }
}

// 导出所有数据
function exportAllData() {
  chrome.storage.local.get(null, function(data) {
    // 添加导出元信息
    const exportData = {
      _meta: {
        exportTime: new Date().toISOString(),
        version: '2.6.2',
        app: 'SPX Helper'
      },
      ...data
    };
    
    // 创建并下载文件
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spx-helper-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // 显示成功提示
    alert('✅ 数据导出成功！\n\n请妥善保存备份文件，重装扩展后可导入恢复。');
  });
}

// 导入所有数据
function importAllData(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const importData = JSON.parse(e.target.result);
      
      // 验证是否是有效的备份文件
      if (!importData._meta || importData._meta.app !== 'SPX Helper') {
        alert('❌ 无效的备份文件！\n\n请选择由 SPX Helper 导出的 .json 文件。');
        return;
      }
      
      // 确认导入
      const confirmMsg = `确定要导入备份数据吗？\n\n` +
        `备份时间: ${new Date(importData._meta.exportTime).toLocaleString()}\n` +
        `备份版本: ${importData._meta.version}\n\n` +
        `⚠️ 导入将覆盖当前所有数据！`;
      
      if (!confirm(confirmMsg)) {
        return;
      }
      
      // 移除元信息后导入
      delete importData._meta;
      
      chrome.storage.local.set(importData, function() {
        alert('✅ 数据导入成功！\n\n页面将自动刷新以加载新数据。');
        location.reload();
      });
    } catch (err) {
      console.error('导入失败:', err);
      alert('❌ 导入失败！\n\n文件格式错误，请确保选择正确的备份文件。');
    }
  };
  reader.readAsText(file);
  
  // 重置 input，允许重复选择同一文件
  event.target.value = '';
}

// 清除所有数据
function clearAllData() {
  const confirmMsg = '⚠️ 确定要清除所有数据吗？\n\n' +
    '这将删除：\n' +
    '• 所有记事本内容\n' +
    '• 所有待办事项\n' +
    '• 自定义快速链接\n' +
    '• HTTP 请求历史\n' +
    '• 所有设置\n\n' +
    '此操作不可恢复！建议先导出备份。';
  
  if (!confirm(confirmMsg)) {
    return;
  }
  
  // 二次确认
  if (!confirm('再次确认：真的要清除所有数据吗？')) {
    return;
  }
  
  chrome.storage.local.clear(function() {
    alert('✅ 所有数据已清除！\n\n页面将自动刷新。');
    location.reload();
  });
}

// ===== Tab 切换 =====
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  console.log('初始化标签页:', {
    'tabBtns数量': tabBtns.length,
    'tabPanes数量': tabPanes.length
  });
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const tabName = this.dataset.tab;
      const targetTab = document.getElementById(`${tabName}-tab`);
      
      console.log('切换到标签页:', tabName, '目标元素:', targetTab);
      
      // 更新按钮状态
      tabBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      // 更新面板状态
      tabPanes.forEach(pane => pane.classList.remove('active'));
      if (targetTab) {
        targetTab.classList.add('active');
      } else {
        console.error('找不到标签页:', `${tabName}-tab`);
      }
    });
  });
}

// ===== 快速链接管理 =====
const DEFAULT_LINK_CATEGORIES = [
  { id: 'tools', name: '🛠️ 开发工具', order: 1 },
  { id: 'docs', name: '📚 常用文档', order: 2 }
];

const DEFAULT_LINKS = [
  // 开发工具
  { id: 1, name: 'JIRA 项目管理', url: 'https://jira.shopee.io/', category: 'tools', order: 1 },
  { id: 2, name: 'DMS 开发管理', url: 'https://dms.ssc.shopee.io/', category: 'tools', order: 2 },
  { id: 3, name: 'DataSuite 主页', url: 'https://datasuite.shopee.io/home', category: 'tools', order: 3 },
  { id: 4, name: 'Apollo 配置中心', url: 'https://config.ssc.shopeemobile.com/', category: 'tools', order: 4 },
  { id: 5, name: 'GitLab 代码仓库', url: 'https://git.garena.com/', category: 'tools', order: 5 },
  { id: 6, name: 'Data Manager', url: 'https://data.ssc.shopeemobile.com/', category: 'tools', order: 6 },
  { id: 7, name: 'Kafka Manager', url: 'https://km.data-infra.shopee.io/kafka/topic', category: 'tools', order: 7 },
  { id: 8, name: 'ApiMart 接口管理', url: 'https://apimart.ssc.shopee.io/', category: 'tools', order: 8 },
  { id: 9, name: 'Grafana 监控', url: 'https://grafana.idata.shopeemobile.com/', category: 'tools', order: 9 },
  { id: 10, name: 'ClickHouse 监控', url: 'http://monitor.olap.data-infra.shopee.io/v2/dashboard/clickhouse-gateway-forwarding', category: 'tools', order: 10 },
  { id: 11, name: 'Space 日志平台', url: 'https://space.shopee.io/observability/log/log-search', category: 'tools', order: 11 },
  { id: 12, name: 'CAT 监控', url: 'https://space-next.shopee.io/observability/monitoring/transaction', category: 'tools', order: 12 },
  { id: 13, name: 'JSON 在线工具', url: 'https://www.json.cn/', category: 'tools', order: 13 },
  { id: 14, name: '文本差异对比', url: 'https://www.jq22.com/textDifference', category: 'tools', order: 14 },
  { id: 15, name: 'YApi 接口文档', url: 'https://apidoc.i.ssc.shopeemobile.com/', category: 'tools', order: 15 },
  { id: 16, name: 'Mermaid 流程图', url: 'https://mermaid.live/', category: 'tools', order: 16 },
  
  // 常用文档
  { id: 17, name: 'SPX 常用链接', url: 'https://confluence.shopee.io/pages/viewpage.action?pageId=33302192', category: 'docs', order: 1 },
  { id: 18, name: 'VPN 使用教程', url: 'https://itcenter.sea.com/user/8/chs/knowledge/categories/146/articles/CNDC-VPN-Tutorial', category: 'docs', order: 2 },
  { id: 19, name: 'SPX 产品知识中心', url: 'https://confluence.shopee.io/display/BPMShopee/4.+SPX+Product+Knowledge+Center', category: 'docs', order: 3 },
  { id: 20, name: 'DoD Admin 平台', url: 'https://dod.shopee.io/team?id=1682', category: 'docs', order: 4 },
  { id: 21, name: 'SPX On-Duty 值班安排', url: 'https://docs.google.com/spreadsheets/d/17jW1K3gEwhyyJxoOsXTOLlzQVXVIaU44S4SLLZBO-Zo/edit?gid=374454140#gid=374454140', category: 'docs', order: 5 },
  { id: 22, name: 'SSC System Portal Data Map', url: 'https://docs.google.com/spreadsheets/d/1W1ei0-qSBPco93mIoJSZTQLlG6CXUnnad3ieC6wrYwM/edit?gid=0#gid=0', category: 'docs', order: 6 },
  { id: 23, name: '[SSC] SPX Mart Design', url: 'https://docs.google.com/spreadsheets/d/1XjdArP6_L6ZVv-2xY7tWAQkCYn2k7bqU4uHUw060oXQ/edit?gid=0#gid=0', category: 'docs', order: 7 },
  { id: 24, name: 'RTI新建及重建-登记表', url: 'https://docs.google.com/spreadsheets/d/11Unf3vGaYNzm6vmFz014R4Nre0RpaV_x9IqxXp-HYVc/edit?gid=0#gid=0', category: 'docs', order: 8 },
  { id: 25, name: '[All] SSC table change information', url: 'https://docs.google.com/spreadsheets/d/1b7xkO6T8yPrGr3LRo-WuIj-HQDvGPsPPuPYjlqUSBHA/edit?gid=0#gid=0', category: 'docs', order: 9 }
];

function initLinks() {
  chrome.storage.local.get(['allLinks', 'linkCategories'], function(result) {
    let allLinks = result.allLinks;
    let linkCategories = result.linkCategories;
    
    // 首次使用，初始化默认数据
    if (!allLinks || allLinks.length === 0) {
      allLinks = DEFAULT_LINKS;
      chrome.storage.local.set({ allLinks: allLinks });
    }
    
    if (!linkCategories || linkCategories.length === 0) {
      linkCategories = DEFAULT_LINK_CATEGORIES;
      chrome.storage.local.set({ linkCategories: linkCategories });
    }
    
    // 渲染所有分类
    renderLinkCategories(linkCategories, allLinks);
    
    // 更新分类选择器
    updateCategorySelectors(linkCategories);
  });
}

function renderLinkCategories(categories, allLinks) {
  const container = document.getElementById('linksContainer');
  if (!container) return;
  
  // 按order排序
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  
  container.innerHTML = sortedCategories.map((cat, catIndex) => {
    const links = allLinks.filter(link => link.category === cat.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0)); // 按order排序链接
    
    const linksHtml = links.length > 0 
      ? links.map((link, linkIndex) => `
          <div class="link-card" data-url="${link.url}">
            <div class="link-content">
              <div class="link-name">${escapeHtml(link.name)}</div>
              <div class="link-url">${escapeHtml(link.url)}</div>
            </div>
            <div class="link-actions">
              <button class="btn-icon move-link-up" data-id="${link.id}" data-category="${cat.id}" ${linkIndex === 0 ? 'disabled' : ''} title="上移">⬆️</button>
              <button class="btn-icon move-link-down" data-id="${link.id}" data-category="${cat.id}" ${linkIndex === links.length - 1 ? 'disabled' : ''} title="下移">⬇️</button>
              <button class="btn-icon edit-link-btn" data-id="${link.id}" title="编辑">✏️</button>
              <button class="btn-icon delete-link-btn" data-id="${link.id}" title="删除">🗑️</button>
            </div>
          </div>
        `).join('')
      : '<div class="empty-state"><div class="empty-state-icon">🔗</div><div class="empty-state-text">暂无链接</div></div>';
    
    return `
      <div class="category-section">
        <div class="category-header">
          <h3>${escapeHtml(cat.name)}</h3>
          <div class="category-actions">
            <button class="btn-icon move-category-up" data-id="${cat.id}" ${catIndex === 0 ? 'disabled' : ''} title="上移分类">⬆️</button>
            <button class="btn-icon move-category-down" data-id="${cat.id}" ${catIndex === sortedCategories.length - 1 ? 'disabled' : ''} title="下移分类">⬇️</button>
            <button class="btn-icon edit-category-btn" data-id="${cat.id}" title="编辑分类">✏️</button>
            <button class="btn-icon delete-category-btn" data-id="${cat.id}" title="删除分类">🗑️</button>
          </div>
        </div>
        <div class="links-grid" id="${cat.id}Links">
          ${linksHtml}
        </div>
      </div>
    `;
  }).join('');
  
  // 重新绑定所有事件
  bindLinkEvents();
  bindCategoryEvents();
}

function bindLinkEvents() {
  // 绑定链接点击
  document.querySelectorAll('.link-card').forEach(card => {
    card.addEventListener('click', function(e) {
      if (!e.target.classList.contains('btn-icon') && !e.target.closest('.link-actions')) {
        chrome.tabs.create({ url: this.dataset.url });
      }
    });
  });
  
  // 绑定上移链接
  document.querySelectorAll('.move-link-up').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!this.disabled) {
        moveLinkUp(parseInt(this.dataset.id), this.dataset.category);
      }
    });
  });
  
  // 绑定下移链接
  document.querySelectorAll('.move-link-down').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!this.disabled) {
        moveLinkDown(parseInt(this.dataset.id), this.dataset.category);
      }
    });
  });
  
  // 绑定编辑链接
  document.querySelectorAll('.edit-link-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      editLink(parseInt(this.dataset.id));
    });
  });
  
  // 绑定删除链接
  document.querySelectorAll('.delete-link-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (confirm('确定要删除这个链接吗？')) {
        deleteLink(parseInt(this.dataset.id));
      }
    });
  });
}

function bindCategoryEvents() {
  // 绑定上移分类
  document.querySelectorAll('.move-category-up').forEach(btn => {
    btn.addEventListener('click', function() {
      if (!this.disabled) {
        moveCategoryUp(this.dataset.id);
      }
    });
  });
  
  // 绑定下移分类
  document.querySelectorAll('.move-category-down').forEach(btn => {
    btn.addEventListener('click', function() {
      if (!this.disabled) {
        moveCategoryDown(this.dataset.id);
      }
    });
  });
  
  // 绑定编辑分类
  document.querySelectorAll('.edit-category-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      editLinkCategory(this.dataset.id);
    });
  });
  
  // 绑定删除分类
  document.querySelectorAll('.delete-category-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      if (confirm('确定要删除这个分类吗？该分类下的所有链接也会被删除。')) {
        deleteLinkCategory(this.dataset.id);
      }
    });
  });
}

function updateCategorySelectors(categories) {
  const selector = document.getElementById('linkCategory');
  if (!selector) return;
  
  selector.innerHTML = categories
    .sort((a, b) => a.order - b.order)
    .map(cat => `<option value="${cat.id}">${cat.name}</option>`)
    .join('');
}

// 分类管理函数
let editingCategoryId = null;

function addLinkCategory() {
  const name = prompt('请输入分类名称（可以包含emoji）：');
  if (!name || !name.trim()) return;
  
  chrome.storage.local.get(['linkCategories'], function(result) {
    const categories = result.linkCategories || DEFAULT_LINK_CATEGORIES;
    const maxOrder = Math.max(...categories.map(c => c.order), 0);
    
    categories.push({
      id: 'cat_' + Date.now(),
      name: name.trim(),
      order: maxOrder + 1
    });
    
    chrome.storage.local.set({ linkCategories: categories }, function() {
      initLinks();
    });
  });
}

function editLinkCategory(id) {
  chrome.storage.local.get(['linkCategories'], function(result) {
    const categories = result.linkCategories || [];
    const category = categories.find(c => c.id === id);
    
    if (category) {
      const newName = prompt('请输入新的分类名称：', category.name);
      if (!newName || !newName.trim()) return;
      
      const index = categories.findIndex(c => c.id === id);
      categories[index].name = newName.trim();
      
      chrome.storage.local.set({ linkCategories: categories }, function() {
        initLinks();
      });
    }
  });
}

function deleteLinkCategory(id) {
  chrome.storage.local.get(['linkCategories', 'allLinks'], function(result) {
    const categories = result.linkCategories || [];
    const links = result.allLinks || [];
    
    // 删除分类
    const filteredCategories = categories.filter(c => c.id !== id);
    
    // 删除该分类下的所有链接
    const filteredLinks = links.filter(link => link.category !== id);
    
    chrome.storage.local.set({ 
      linkCategories: filteredCategories,
      allLinks: filteredLinks
    }, function() {
      initLinks();
    });
  });
}

// 分类排序函数
function moveCategoryUp(id) {
  chrome.storage.local.get(['linkCategories'], function(result) {
    const categories = result.linkCategories || [];
    const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
    const index = sortedCategories.findIndex(c => c.id === id);
    
    if (index > 0) {
      // 交换 order
      const temp = sortedCategories[index].order;
      sortedCategories[index].order = sortedCategories[index - 1].order;
      sortedCategories[index - 1].order = temp;
      
      chrome.storage.local.set({ linkCategories: sortedCategories }, function() {
        initLinks();
      });
    }
  });
}

function moveCategoryDown(id) {
  chrome.storage.local.get(['linkCategories'], function(result) {
    const categories = result.linkCategories || [];
    const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
    const index = sortedCategories.findIndex(c => c.id === id);
    
    if (index < sortedCategories.length - 1) {
      // 交换 order
      const temp = sortedCategories[index].order;
      sortedCategories[index].order = sortedCategories[index + 1].order;
      sortedCategories[index + 1].order = temp;
      
      chrome.storage.local.set({ linkCategories: sortedCategories }, function() {
        initLinks();
      });
    }
  });
}

// 链接排序函数
function moveLinkUp(id, categoryId) {
  chrome.storage.local.get(['allLinks'], function(result) {
    const links = result.allLinks || [];
    const categoryLinks = links.filter(link => link.category === categoryId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const index = categoryLinks.findIndex(link => link.id === id);
    
    if (index > 0) {
      // 交换 order
      const temp = categoryLinks[index].order || index;
      categoryLinks[index].order = categoryLinks[index - 1].order || (index - 1);
      categoryLinks[index - 1].order = temp;
      
      // 更新所有链接
      const updatedLinks = links.map(link => {
        const found = categoryLinks.find(cl => cl.id === link.id);
        return found || link;
      });
      
      chrome.storage.local.set({ allLinks: updatedLinks }, function() {
        initLinks();
      });
    }
  });
}

function moveLinkDown(id, categoryId) {
  chrome.storage.local.get(['allLinks'], function(result) {
    const links = result.allLinks || [];
    const categoryLinks = links.filter(link => link.category === categoryId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const index = categoryLinks.findIndex(link => link.id === id);
    
    if (index < categoryLinks.length - 1) {
      // 交换 order
      const temp = categoryLinks[index].order || index;
      categoryLinks[index].order = categoryLinks[index + 1].order || (index + 1);
      categoryLinks[index + 1].order = temp;
      
      // 更新所有链接
      const updatedLinks = links.map(link => {
        const found = categoryLinks.find(cl => cl.id === link.id);
        return found || link;
      });
      
      chrome.storage.local.set({ allLinks: updatedLinks }, function() {
        initLinks();
      });
    }
  });
}

let editingLinkId = null;

function addLink() {
  const name = document.getElementById('linkName').value.trim();
  const url = document.getElementById('linkUrl').value.trim();
  const category = document.getElementById('linkCategory').value;
  
  if (!name || !url) {
    alert('请输入链接名称和URL');
    return;
  }
  
  if (!isValidUrl(url)) {
    alert('请输入有效的URL');
    return;
  }
  
  chrome.storage.local.get(['allLinks'], function(result) {
    const links = result.allLinks || DEFAULT_LINKS;
    
    if (editingLinkId) {
      // 编辑模式
      const index = links.findIndex(link => link.id === editingLinkId);
      if (index !== -1) {
        links[index] = {
          id: editingLinkId,
          name: name,
          url: url,
          category: category
        };
      }
      editingLinkId = null;
      document.getElementById('addLink').textContent = '添加链接';
    } else {
      // 添加模式
      links.push({
        id: Date.now(),
        name: name,
        url: url,
        category: category
      });
    }
    
    chrome.storage.local.set({ allLinks: links }, function() {
      document.getElementById('linkName').value = '';
      document.getElementById('linkUrl').value = '';
      document.getElementById('linkCategory').value = 'tools';
      initLinks();
    });
  });
}

function editLink(id) {
  chrome.storage.local.get(['allLinks'], function(result) {
    const links = result.allLinks || [];
    const link = links.find(l => l.id === id);
    
    if (link) {
      document.getElementById('linkName').value = link.name;
      document.getElementById('linkUrl').value = link.url;
      document.getElementById('linkCategory').value = link.category;
      document.getElementById('addLink').textContent = '保存修改';
      editingLinkId = id;
      
      // 滚动到表单
      document.getElementById('linkName').scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('linkName').focus();
    }
  });
}

function deleteLink(id) {
  chrome.storage.local.get(['allLinks'], function(result) {
    const links = result.allLinks || [];
    const filtered = links.filter(link => link.id !== id);
    
    chrome.storage.local.set({ allLinks: filtered }, function() {
      // 如果正在编辑这个链接，取消编辑状态
      if (editingLinkId === id) {
        editingLinkId = null;
        document.getElementById('addLink').textContent = '添加链接';
        document.getElementById('linkName').value = '';
        document.getElementById('linkUrl').value = '';
      }
      initLinks();
    });
  });
}

// ===== 笔记管理 =====
const DEFAULT_NOTE_CATEGORIES = [
  { id: 'work', name: '📋 工作笔记', order: 1 },
  { id: 'study', name: '📚 学习笔记', order: 2 },
  { id: 'daily', name: '📝 日常记录', order: 3 }
];

const DEFAULT_NOTES = [];

let currentNoteFilter = 'all';
let allNotesCache = [];

function initNotes() {
  chrome.storage.local.get(['allNotes', 'noteCategories'], function(result) {
    let allNotes = result.allNotes;
    let noteCategories = result.noteCategories;
    
    // 首次使用，初始化默认数据
    if (!allNotes) {
      allNotes = DEFAULT_NOTES;
      chrome.storage.local.set({ allNotes: allNotes });
    }
    
    if (!noteCategories || noteCategories.length === 0) {
      noteCategories = DEFAULT_NOTE_CATEGORIES;
      chrome.storage.local.set({ noteCategories: noteCategories });
    }
    
    // 设置全局缓存
    window.noteCategoriesCache = noteCategories;
    
    allNotesCache = allNotes;
    renderNotes(allNotes);
    initNoteFilter(noteCategories);
    updateNoteCategorySelector(noteCategories);
    initNoteModal();
  });
}

function initNoteFilter(categories) {
  const filterContainer = document.querySelector('.notes-filter');
  
  filterContainer.innerHTML = `
    <button class="filter-btn active" data-filter="all">全部</button>
    ${categories.sort((a, b) => a.order - b.order).map(cat => 
      `<button class="filter-btn" data-filter="${cat.id}" data-category-id="${cat.id}">${cat.name}</button>`
    ).join('')}
    <button class="btn btn-secondary btn-small" id="addNoteCategory" style="margin-left: 5px;">➕ 添加分类</button>
  `;
  
  // 绑定过滤事件
  const filterBtns = filterContainer.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', function(e) {
      if (e.button !== 0) return;
      
      currentNoteFilter = this.dataset.filter;
      
      filterBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      renderNotes(allNotesCache);
    });
    
    // 右键菜单
    const categoryId = btn.dataset.categoryId;
    if (categoryId) {
      btn.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        showNoteCategoryMenu(categoryId, e.pageX, e.pageY);
      });
    }
  });
  
  // 绑定添加分类按钮
  document.getElementById('addNoteCategory').addEventListener('click', addNoteCategory);
}

function showNoteCategoryMenu(categoryId, x, y) {
  const existingMenu = document.getElementById('categoryContextMenu');
  if (existingMenu) existingMenu.remove();
  
  const menu = document.createElement('div');
  menu.id = 'categoryContextMenu';
  menu.className = 'context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.innerHTML = `
    <div class="context-menu-item" data-action="edit">
      <span class="context-menu-icon">✏️</span>
      <span>编辑分类</span>
    </div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item danger" data-action="delete">
      <span class="context-menu-icon">🗑️</span>
      <span>删除分类</span>
    </div>
  `;
  
  document.body.appendChild(menu);
  
  menu.querySelector('[data-action="edit"]').addEventListener('click', () => {
    menu.remove();
    editNoteCategory(categoryId);
  });
  
  menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
    menu.remove();
    if (confirm('确定要删除这个分类吗？该分类下的所有笔记也会被删除。')) {
      deleteNoteCategory(categoryId);
    }
  });
  
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

function updateNoteCategorySelector(categories) {
  const selector = document.getElementById('noteCategory');
  if (!selector) return;
  
  selector.innerHTML = categories
    .sort((a, b) => a.order - b.order)
    .map(cat => `<option value="${cat.id}">${cat.name}</option>`)
    .join('');
}

function addNoteCategory() {
  const name = prompt('请输入分类名称：');
  if (!name || !name.trim()) return;
  
  chrome.storage.local.get(['noteCategories'], function(result) {
    const categories = result.noteCategories || DEFAULT_NOTE_CATEGORIES;
    const maxOrder = Math.max(...categories.map(c => c.order), 0);
    
    const id = name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '');
    
    if (categories.find(c => c.id === id)) {
      alert('该分类已存在！');
      return;
    }
    
    categories.push({
      id: id,
      name: name.trim(),
      order: maxOrder + 1
    });
    
    chrome.storage.local.set({ noteCategories: categories }, function() {
      initNotes();
    });
  });
}

function editNoteCategory(id) {
  chrome.storage.local.get(['noteCategories'], function(result) {
    const categories = result.noteCategories || [];
    const category = categories.find(c => c.id === id);
    
    if (category) {
      const newName = prompt('请输入新的分类名称：', category.name);
      if (!newName || !newName.trim()) return;
      
      const index = categories.findIndex(c => c.id === id);
      categories[index].name = newName.trim();
      
      chrome.storage.local.set({ noteCategories: categories }, function() {
        initNotes();
      });
    }
  });
}

function deleteNoteCategory(id) {
  chrome.storage.local.get(['noteCategories', 'allNotes'], function(result) {
    const categories = result.noteCategories || [];
    const notes = result.allNotes || [];
    
    const notesInCategory = notes.filter(n => n.category === id);
    if (notesInCategory.length > 0) {
      if (!confirm(`该分类下有 ${notesInCategory.length} 条笔记，删除分类会同时删除这些笔记。确定继续吗？`)) {
        return;
      }
    }
    
    const filteredCategories = categories.filter(c => c.id !== id);
    const filteredNotes = notes.filter(n => n.category !== id);
    
    chrome.storage.local.set({ 
      noteCategories: filteredCategories,
      allNotes: filteredNotes
    }, function() {
      if (currentNoteFilter === id) {
        currentNoteFilter = 'all';
      }
      initNotes();
    });
  });
}

function renderNotes(notes) {
  const container = document.getElementById('notesList');
  
  // 根据过滤器过滤
  let filtered = notes;
  if (currentNoteFilter !== 'all') {
    filtered = notes.filter(n => n.category === currentNoteFilter);
  }
  
  // 按创建时间倒序
  filtered.sort((a, b) => b.createdAt - a.createdAt);
  
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-text">暂无笔记，点击上方"新建笔记"开始记录</div></div>';
    return;
  }
  
  // 获取待办列表用于显示关联信息
  chrome.storage.local.get(['todos'], function(result) {
    const todos = result.todos || [];
    
    container.innerHTML = filtered.map(note => {
      const date = new Date(note.createdAt).toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      // 获取关联的待办信息
      let linkedTodoHtml = '';
      if (note.linkedTodoId) {
        const linkedTodo = todos.find(t => t.id === note.linkedTodoId);
        if (linkedTodo) {
          linkedTodoHtml = `<span class="note-linked-todo">${escapeHtml(linkedTodo.title.substring(0, 12))}${linkedTodo.title.length > 12 ? '…' : ''}</span>`;
        }
      }
      
      // 预览内容（最多显示80字符）
      const previewContent = note.content.length > 80 ? note.content.substring(0, 80) + '…' : note.content;
      
      return `
      <div class="note-card clickable" data-id="${note.id}">
        <div class="note-header">
          <span class="note-title">${escapeHtml(note.title)}</span>
          <span class="note-category">${getCategoryNameForNotes(note.category)}</span>
        </div>
        <div class="note-preview">${escapeHtml(previewContent).replace(/\n/g, ' ')}</div>
        <div class="note-footer">
          <div class="note-meta">
            <span class="note-date">${date}</span>
            ${linkedTodoHtml}
          </div>
        </div>
      </div>
    `;
    }).join('');
    
    // 绑定点击事件 - 打开详情
    container.querySelectorAll('.note-card').forEach(card => {
      card.addEventListener('click', function() {
        openNoteModal(parseInt(this.dataset.id));
      });
    });
  });
}

// 初始化笔记弹窗事件
function initNoteModal() {
  const modal = document.getElementById('noteModal');
  const addNoteBtn = document.getElementById('addNoteBtn');
  const closeBtn = document.getElementById('closeNoteModal');
  const cancelBtn = document.getElementById('cancelNoteBtn');
  const saveBtn = document.getElementById('saveNoteBtn');
  const deleteBtn = document.getElementById('deleteNoteBtn');
  const editBtn = document.getElementById('editNoteBtn');
  const copyBtn = document.getElementById('copyNoteBtn');
  const linkedTodoInfo = document.getElementById('noteLinkedTodoInfo');
  
  // 新建笔记按钮
  if (addNoteBtn) {
    addNoteBtn.addEventListener('click', () => openNoteModal());
  }
  
  // 关闭弹窗
  if (closeBtn) {
    closeBtn.addEventListener('click', closeNoteModal);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeNoteModal);
  }
  
  // 保存笔记
  if (saveBtn) {
    saveBtn.addEventListener('click', saveNote);
  }
  
  // 删除笔记
  if (deleteBtn) {
    deleteBtn.addEventListener('click', function() {
      const noteId = document.getElementById('editNoteId').value;
      if (noteId && confirm('确定要删除这条笔记吗？')) {
        deleteNote(parseInt(noteId));
        closeNoteModal();
      }
    });
  }
  
  // 编辑按钮
  if (editBtn) {
    editBtn.addEventListener('click', function() {
      switchToNoteEditView();
    });
  }
  
  // 导出按钮
  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      exportSingleNote();
    });
  }
  
  // 关联待办点击跳转
  if (linkedTodoInfo) {
    linkedTodoInfo.addEventListener('click', function() {
      const todoId = this.dataset.todoId;
      if (todoId) {
        closeNoteModal();
        // 切换到待办标签
        const todosTabBtn = document.querySelector('[data-tab="todos"]');
        if (todosTabBtn) {
          todosTabBtn.click();
        }
        // 高亮对应的待办（可选）
      }
    });
  }
  
  // 点击遮罩关闭
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeNoteModal();
      }
    });
  }
}

// 简单的Markdown渲染
function renderMarkdown(text) {
  if (!text) return '';
  
  let html = escapeHtml(text);
  
  // 代码块 (```code```)
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // 行内代码 (`code`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // 粗体和斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  // 引用
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  
  // 无序列表
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  
  // 有序列表
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  
  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  
  // 分割线
  html = html.replace(/^---$/gm, '<hr>');
  
  // 换行
  html = html.replace(/\n/g, '<br>');
  
  // 清理多余的br在块元素后
  html = html.replace(/<\/(h1|h2|h3|ul|ol|pre|blockquote)><br>/g, '</$1>');
  html = html.replace(/<br><(h1|h2|h3|ul|ol|pre|blockquote)/g, '<$1');
  
  return html;
}

// 打开笔记弹窗
function openNoteModal(noteId = null) {
  const modal = document.getElementById('noteModal');
  const modalTitle = document.getElementById('noteModalTitle');
  const deleteBtn = document.getElementById('deleteNoteBtn');
  const editBtn = document.getElementById('editNoteBtn');
  const copyBtn = document.getElementById('copyNoteBtn');
  const saveBtn = document.getElementById('saveNoteBtn');
  const cancelBtn = document.getElementById('cancelNoteBtn');
  const editNoteIdInput = document.getElementById('editNoteId');
  const detailView = document.getElementById('noteDetailView');
  const editView = document.getElementById('noteEditView');
  
  // 加载待办列表到下拉框
  loadTodoSelectOptions();
  
  if (noteId) {
    // 查看详情模式
    modalTitle.textContent = '笔记详情';
    editNoteIdInput.value = noteId;
    
    // 显示详情视图，隐藏编辑视图
    detailView.style.display = 'block';
    editView.style.display = 'none';
    
    // 显示/隐藏按钮
    deleteBtn.style.display = 'block';
    editBtn.style.display = 'inline-block';
    copyBtn.style.display = 'inline-block';
    saveBtn.style.display = 'none';
    cancelBtn.textContent = '关闭';
    
    // 加载笔记数据
    chrome.storage.local.get(['allNotes', 'todos'], function(result) {
      const notes = result.allNotes || [];
      const todos = result.todos || [];
      const note = notes.find(n => n.id === noteId);
      
      if (note) {
        // 填充详情视图
        document.getElementById('noteDetailTitle').textContent = note.title;
        document.getElementById('noteDetailCategory').textContent = getCategoryNameForNotes(note.category);
        document.getElementById('noteDetailDate').textContent = new Date(note.createdAt).toLocaleString('zh-CN');
        document.getElementById('noteDetailContent').innerHTML = renderMarkdown(note.content);
        
        // 填充编辑表单（为切换到编辑模式准备）
        document.getElementById('noteTitle').value = note.title;
        document.getElementById('noteCategory').value = note.category;
        document.getElementById('noteContent').value = note.content;
        document.getElementById('noteTodoLink').value = note.linkedTodoId || '';
        
        // 显示关联待办
        const linkedTodoInfo = document.getElementById('noteLinkedTodoInfo');
        if (note.linkedTodoId) {
          const linkedTodo = todos.find(t => t.id === note.linkedTodoId);
          if (linkedTodo) {
            const statusIcon = linkedTodo.status === 'completed' ? '✅' : (linkedTodo.status === 'in-progress' ? '⏳' : '📝');
            document.getElementById('linkedTodoText').textContent = `${statusIcon} ${linkedTodo.title}`;
            linkedTodoInfo.dataset.todoId = linkedTodo.id;
            linkedTodoInfo.style.display = 'flex';
          } else {
            linkedTodoInfo.style.display = 'none';
          }
        } else {
          linkedTodoInfo.style.display = 'none';
        }
      }
    });
  } else {
    // 新建模式
    modalTitle.textContent = '新建笔记';
    editNoteIdInput.value = '';
    
    // 显示编辑视图，隐藏详情视图
    detailView.style.display = 'none';
    editView.style.display = 'block';
    
    // 显示/隐藏按钮
    deleteBtn.style.display = 'none';
    editBtn.style.display = 'none';
    copyBtn.style.display = 'none';
    saveBtn.style.display = 'inline-block';
    cancelBtn.textContent = '取消';
    
    // 清空表单
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('noteTodoLink').value = '';
  }
  
  modal.style.display = 'flex';
  
  if (!noteId) {
    document.getElementById('noteTitle').focus();
  }
}

// 切换到编辑视图
function switchToNoteEditView() {
  const modalTitle = document.getElementById('noteModalTitle');
  const detailView = document.getElementById('noteDetailView');
  const editView = document.getElementById('noteEditView');
  const editBtn = document.getElementById('editNoteBtn');
  const copyBtn = document.getElementById('copyNoteBtn');
  const saveBtn = document.getElementById('saveNoteBtn');
  const cancelBtn = document.getElementById('cancelNoteBtn');
  
  modalTitle.textContent = '编辑笔记';
  detailView.style.display = 'none';
  editView.style.display = 'block';
  editBtn.style.display = 'none';
  copyBtn.style.display = 'none';
  saveBtn.style.display = 'inline-block';
  cancelBtn.textContent = '取消';
  
  document.getElementById('noteTitle').focus();
}

// 关闭笔记弹窗
function closeNoteModal() {
  const modal = document.getElementById('noteModal');
  modal.style.display = 'none';
}

// 加载待办选项到下拉框
function loadTodoSelectOptions() {
  const select = document.getElementById('noteTodoLink');
  if (!select) return;
  
  chrome.storage.local.get(['todos'], function(result) {
    const todos = result.todos || [];
    
    // 只显示未完成的待办
    const activeTodos = todos.filter(t => t.status !== 'completed');
    
    select.innerHTML = '<option value="">不关联待办</option>' +
      activeTodos.map(todo => {
        const statusIcon = todo.status === 'in-progress' ? '⏳' : '📝';
        const priorityIcon = todo.priority === 'high' ? '🔴' : (todo.priority === 'medium' ? '🟡' : '');
        return `<option value="${todo.id}">${statusIcon} ${priorityIcon} ${escapeHtml(todo.title)}</option>`;
      }).join('');
  });
}

// 保存笔记
function saveNote() {
  const title = document.getElementById('noteTitle').value.trim();
  const category = document.getElementById('noteCategory').value;
  const content = document.getElementById('noteContent').value.trim();
  const linkedTodoId = document.getElementById('noteTodoLink').value;
  const editNoteId = document.getElementById('editNoteId').value;
  
  if (!title || !content) {
    alert('请输入笔记标题和内容');
    return;
  }
  
  chrome.storage.local.get(['allNotes'], function(result) {
    const notes = result.allNotes || [];
    
    if (editNoteId) {
      // 编辑模式
      const index = notes.findIndex(n => n.id === parseInt(editNoteId));
      if (index !== -1) {
        notes[index] = {
          ...notes[index],
          title: title,
          category: category,
          content: content,
          linkedTodoId: linkedTodoId ? parseInt(linkedTodoId) : null,
          updatedAt: Date.now()
        };
      }
    } else {
      // 添加模式
      notes.push({
        id: Date.now(),
        title: title,
        category: category,
        content: content,
        linkedTodoId: linkedTodoId ? parseInt(linkedTodoId) : null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    
    chrome.storage.local.set({ allNotes: notes }, function() {
      closeNoteModal();
      initNotes();
    });
  });
}

function deleteNote(id) {
  chrome.storage.local.get(['allNotes'], function(result) {
    const notes = result.allNotes || [];
    const filtered = notes.filter(note => note.id !== id);
    
    chrome.storage.local.set({ allNotes: filtered }, function() {
      initNotes();
    });
  });
}

function getCategoryNameForNotes(category) {
  if (window.noteCategoriesCache) {
    const cat = window.noteCategoriesCache.find(c => c.id === category);
    if (cat) return cat.name;
  }
  return category;
}

// 导出单个笔记功能
function exportSingleNote() {
  const noteId = document.getElementById('editNoteId').value;
  if (!noteId) return;
  
  chrome.storage.local.get(['allNotes'], function(result) {
    const notes = result.allNotes || [];
    const note = notes.find(n => n.id === parseInt(noteId));
    
    if (!note) {
      alert('笔记不存在');
      return;
    }
    
    // 让用户选择导出格式
    const format = confirm('点击"确定"导出为Markdown格式(.md)\n点击"取消"导出为纯文本格式(.txt)') ? 'md' : 'txt';
    
    let content = '';
    const date = new Date(note.createdAt).toLocaleString('zh-CN');
    const category = getCategoryNameForNotes(note.category);
    
    if (format === 'md') {
      content = `# ${note.title}\n\n`;
      content += `> 分类：${category} | 创建时间：${date}\n\n`;
      content += `---\n\n`;
      content += note.content;
    } else {
      content = `标题：${note.title}\n`;
      content += `分类：${category}\n`;
      content += `时间：${date}\n`;
      content += `${'='.repeat(50)}\n\n`;
      content += note.content;
    }
    
    // 创建下载
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // 使用笔记标题作为文件名，移除特殊字符
    const safeTitle = note.title.replace(/[\\/:*?"<>|]/g, '_');
    a.download = `${safeTitle}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    const copyBtn = document.getElementById('copyNoteBtn');
    if (copyBtn) {
      copyBtn.textContent = '✅ 已导出';
      setTimeout(() => { copyBtn.textContent = '导出'; }, 2000);
    }
  });
}

// ===== 实用工具切换 =====
function initUtils() {
  const utilsBtns = document.querySelectorAll('.utils-grid-btn');
  const utilsContents = document.querySelectorAll('.utils-content');
  
  utilsBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const utilName = this.dataset.util;
      
      // 更新按钮状态
      utilsBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      // 更新内容显示
      utilsContents.forEach(content => {
        if (content.id === `${utilName}-util`) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });
    });
  });
}

// ===== JSON 工具 =====
function initJsonTool() {
  document.getElementById('formatJson').addEventListener('click', formatJson);
  document.getElementById('compactJson').addEventListener('click', compactJson);
  document.getElementById('validateJson').addEventListener('click', validateJson);
  document.getElementById('clearJson').addEventListener('click', clearJson);
  
  // 输入时自动更新统计信息
  document.getElementById('jsonInput').addEventListener('input', updateJsonStats);
}

function formatJson() {
  const input = document.getElementById('jsonInput').value.trim();
  const output = document.getElementById('jsonOutput');
  const status = document.getElementById('jsonStatus');
  
  if (!input) {
    showJsonStatus('请输入JSON内容', 'error');
    return;
  }
  
  try {
    const parsed = JSON.parse(input);
    const formatted = JSON.stringify(parsed, null, 2);
    output.value = formatted;
    showJsonStatus('✅ 格式化成功！', 'success');
    updateJsonStats();
  } catch (error) {
    showJsonStatus(`❌ JSON格式错误: ${error.message}`, 'error');
    output.value = '';
  }
}

function compactJson() {
  const input = document.getElementById('jsonInput').value.trim();
  const output = document.getElementById('jsonOutput');
  
  if (!input) {
    showJsonStatus('请输入JSON内容', 'error');
    return;
  }
  
  try {
    const parsed = JSON.parse(input);
    const compacted = JSON.stringify(parsed);
    output.value = compacted;
    showJsonStatus('✅ 压缩成功！', 'success');
    updateJsonStats();
  } catch (error) {
    showJsonStatus(`❌ JSON格式错误: ${error.message}`, 'error');
    output.value = '';
  }
}

function validateJson() {
  const input = document.getElementById('jsonInput').value.trim();
  
  if (!input) {
    showJsonStatus('请输入JSON内容', 'error');
    return;
  }
  
  try {
    JSON.parse(input);
    showJsonStatus('✅ JSON格式正确！', 'success');
    updateJsonStats();
  } catch (error) {
    showJsonStatus(`❌ JSON格式错误: ${error.message}`, 'error');
  }
}

function clearJson() {
  document.getElementById('jsonInput').value = '';
  document.getElementById('jsonOutput').value = '';
  document.getElementById('jsonStatus').className = 'json-status';
  resetJsonStats();
}

function showJsonStatus(message, type) {
  const status = document.getElementById('jsonStatus');
  status.textContent = message;
  status.className = `json-status ${type}`;
  
  if (type === 'success') {
    setTimeout(() => {
      status.className = 'json-status';
    }, 3000);
  }
}

function updateJsonStats() {
  const input = document.getElementById('jsonInput').value.trim();
  
  if (!input) {
    resetJsonStats();
    return;
  }
  
  try {
    const parsed = JSON.parse(input);
    
    // 计算统计信息
    const charCount = input.length;
    const depth = getJsonDepth(parsed);
    const { objects, arrays } = countJsonElements(parsed);
    
    document.getElementById('jsonCharCount').textContent = charCount.toLocaleString();
    document.getElementById('jsonDepth').textContent = depth;
    document.getElementById('jsonObjects').textContent = objects;
    document.getElementById('jsonArrays').textContent = arrays;
  } catch (error) {
    // 解析失败时不更新统计
  }
}

function resetJsonStats() {
  document.getElementById('jsonCharCount').textContent = '0';
  document.getElementById('jsonDepth').textContent = '0';
  document.getElementById('jsonObjects').textContent = '0';
  document.getElementById('jsonArrays').textContent = '0';
}

function getJsonDepth(obj, currentDepth = 1) {
  if (typeof obj !== 'object' || obj === null) {
    return currentDepth;
  }
  
  let maxDepth = currentDepth;
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const depth = getJsonDepth(obj[key], currentDepth + 1);
      maxDepth = Math.max(maxDepth, depth);
    }
  }
  
  return maxDepth;
}

function countJsonElements(obj) {
  let objects = 0;
  let arrays = 0;
  
  function traverse(item) {
    if (typeof item === 'object' && item !== null) {
      if (Array.isArray(item)) {
        arrays++;
        item.forEach(traverse);
      } else {
        objects++;
        Object.values(item).forEach(traverse);
      }
    }
  }
  
  traverse(obj);
  return { objects, arrays };
}

// ===== SQL 格式化工具 =====
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
  'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON',
  'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE',
  'ALTER', 'DROP', 'INDEX', 'VIEW', 'AS', 'DISTINCT', 'TOP', 'CASE', 'WHEN',
  'THEN', 'ELSE', 'END', 'NULL', 'IS', 'EXISTS', 'COUNT', 'SUM', 'AVG',
  'MAX', 'MIN', 'CAST', 'CONVERT', 'COALESCE', 'NULLIF', 'WITH', 'OVER',
  'PARTITION', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD',
  'ASC', 'DESC', 'USING', 'NATURAL', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
  'CONSTRAINT', 'DEFAULT', 'AUTO_INCREMENT', 'UNIQUE', 'CHECK'
];

function initSqlTool() {
  document.getElementById('formatSql').addEventListener('click', formatSql);
  document.getElementById('compactSql').addEventListener('click', compactSql);
  document.getElementById('upperSql').addEventListener('click', () => convertSqlKeywords(true));
  document.getElementById('lowerSql').addEventListener('click', () => convertSqlKeywords(false));
  document.getElementById('clearSql').addEventListener('click', clearSql);
  document.getElementById('copySqlResult').addEventListener('click', copySqlResult);
}

function formatSql() {
  const input = document.getElementById('sqlInput').value.trim();
  if (!input) return;
  
  let sql = input;
  
  // 标准化空白
  sql = sql.replace(/\s+/g, ' ');
  
  // 主要关键字前换行
  const newlineKeywords = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 
    'INNER JOIN', 'OUTER JOIN', 'FULL JOIN', 'CROSS JOIN', 'GROUP BY', 'ORDER BY', 'HAVING', 
    'LIMIT', 'OFFSET', 'UNION', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE'];
  
  newlineKeywords.forEach(keyword => {
    const regex = new RegExp(`\\b(${keyword})\\b`, 'gi');
    sql = sql.replace(regex, '\n$1');
  });
  
  // 逗号后换行（在 SELECT 子句中）
  sql = sql.replace(/,\s*/g, ',\n    ');
  
  // 缩进调整
  const lines = sql.split('\n').map(line => line.trim()).filter(line => line);
  let formatted = [];
  let indent = 0;
  
  lines.forEach(line => {
    const upperLine = line.toUpperCase();
    
    // 减少缩进的关键字
    if (upperLine.startsWith('FROM') || upperLine.startsWith('WHERE') || 
        upperLine.startsWith('GROUP') || upperLine.startsWith('ORDER') ||
        upperLine.startsWith('HAVING') || upperLine.startsWith('LIMIT')) {
      indent = 0;
    }
    
    // 添加行
    formatted.push('  '.repeat(indent) + line);
    
    // 增加缩进的关键字
    if (upperLine.startsWith('SELECT')) {
      indent = 2;
    } else if (upperLine.match(/^(LEFT|RIGHT|INNER|OUTER|FULL|CROSS)?\s*JOIN/)) {
      indent = 1;
    }
  });
  
  document.getElementById('sqlOutput').value = formatted.join('\n');
}

function compactSql() {
  const input = document.getElementById('sqlInput').value.trim();
  if (!input) return;
  
  // 压缩：移除多余空白，保留单个空格
  const compacted = input.replace(/\s+/g, ' ').trim();
  document.getElementById('sqlOutput').value = compacted;
}

function convertSqlKeywords(toUpper) {
  const input = document.getElementById('sqlInput').value;
  if (!input) return;
  
  let result = input;
  SQL_KEYWORDS.forEach(keyword => {
    const regex = new RegExp(`\\b(${keyword})\\b`, 'gi');
    result = result.replace(regex, toUpper ? keyword.toUpperCase() : keyword.toLowerCase());
  });
  
  document.getElementById('sqlOutput').value = result;
}

function clearSql() {
  document.getElementById('sqlInput').value = '';
  document.getElementById('sqlOutput').value = '';
}

function copySqlResult() {
  const output = document.getElementById('sqlOutput').value;
  if (!output) return;
  
  navigator.clipboard.writeText(output).then(() => {
    const btn = document.getElementById('copySqlResult');
    btn.textContent = '✅ 已复制';
    setTimeout(() => { btn.textContent = '📋 复制结果'; }, 2000);
  });
}

// ===== Cron 表达式工具 =====
function initCronTool() {
  document.getElementById('parseCron').addEventListener('click', parseCron);
  
  // 预设按钮
  document.querySelectorAll('.cron-preset').forEach(btn => {
    btn.addEventListener('click', function() {
      document.getElementById('cronInput').value = this.dataset.cron;
      parseCron();
    });
  });
}

function parseCron() {
  const input = document.getElementById('cronInput').value.trim();
  const resultDiv = document.getElementById('cronResult');
  
  if (!input) {
    resultDiv.style.display = 'none';
    return;
  }
  
  const parts = input.split(/\s+/);
  if (parts.length !== 5) {
    document.getElementById('cronDescription').innerHTML = '<span class="cron-error">❌ 格式错误：需要 5 个字段（分 时 日 月 周）</span>';
    document.getElementById('cronNextRuns').innerHTML = '';
    resultDiv.style.display = 'block';
    return;
  }
  
  const [minute, hour, day, month, weekday] = parts;
  
  // 生成描述
  const description = generateCronDescription(minute, hour, day, month, weekday);
  document.getElementById('cronDescription').innerHTML = `<span class="cron-desc">📅 ${description}</span>`;
  
  // 计算接下来 5 次执行时间
  const nextRuns = calculateNextRuns(parts, 5);
  document.getElementById('cronNextRuns').innerHTML = nextRuns.map(date => 
    `<li>${date.toLocaleString('zh-CN', { 
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short'
    })}</li>`
  ).join('');
  
  resultDiv.style.display = 'block';
}

function generateCronDescription(minute, hour, day, month, weekday) {
  let desc = '';
  
  // 星期
  if (weekday !== '*') {
    const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    if (weekday.includes('-')) {
      const [start, end] = weekday.split('-').map(Number);
      desc += `${weekdayNames[start]}到${weekdayNames[end]} `;
    } else if (weekday.includes(',')) {
      desc += weekday.split(',').map(w => weekdayNames[parseInt(w)]).join('、') + ' ';
    } else {
      desc += weekdayNames[parseInt(weekday)] + ' ';
    }
  }
  
  // 月份
  if (month !== '*') {
    desc += `${month}月 `;
  }
  
  // 日期
  if (day !== '*') {
    desc += `${day}号 `;
  }
  
  // 时间
  if (hour === '*' && minute === '*') {
    desc += '每分钟执行';
  } else if (hour === '*') {
    desc += `每小时的第${minute}分钟执行`;
  } else if (minute.startsWith('*/')) {
    desc += `每${minute.slice(2)}分钟执行`;
  } else if (hour.startsWith('*/')) {
    desc += `每${hour.slice(2)}小时执行`;
  } else if (hour.includes('-')) {
    desc += `${hour}点期间，第${minute}分钟执行`;
  } else {
    desc += `${hour.padStart(2, '0')}:${minute.padStart(2, '0')} 执行`;
  }
  
  return desc || '每分钟执行';
}

function calculateNextRuns(parts, count) {
  const [minute, hour, day, month, weekday] = parts;
  const results = [];
  let current = new Date();
  current.setSeconds(0, 0);
  
  for (let i = 0; i < 1000 && results.length < count; i++) {
    current = new Date(current.getTime() + 60000); // 加1分钟
    
    if (matchCronField(current.getMinutes(), minute) &&
        matchCronField(current.getHours(), hour) &&
        matchCronField(current.getDate(), day) &&
        matchCronField(current.getMonth() + 1, month) &&
        matchCronField(current.getDay(), weekday)) {
      results.push(new Date(current));
    }
  }
  
  return results;
}

function matchCronField(value, pattern) {
  if (pattern === '*') return true;
  
  // 处理步长 */n
  if (pattern.startsWith('*/')) {
    const step = parseInt(pattern.slice(2));
    return value % step === 0;
  }
  
  // 处理范围 a-b
  if (pattern.includes('-') && !pattern.includes(',')) {
    const [start, end] = pattern.split('-').map(Number);
    return value >= start && value <= end;
  }
  
  // 处理列表 a,b,c
  if (pattern.includes(',')) {
    return pattern.split(',').map(Number).includes(value);
  }
  
  // 精确匹配
  return parseInt(pattern) === value;
}

// ===== 正则测试器 =====
function initRegexTool() {
  document.getElementById('testRegex').addEventListener('click', testRegex);
  document.getElementById('clearRegex').addEventListener('click', clearRegex);
  
  // 预设按钮
  document.querySelectorAll('.regex-preset-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.getElementById('regexPattern').value = this.dataset.pattern;
      document.getElementById('regexFlags').value = this.dataset.flags;
    });
  });
  
  // 实时测试
  document.getElementById('regexPattern').addEventListener('input', testRegex);
  document.getElementById('regexFlags').addEventListener('input', testRegex);
  document.getElementById('regexTestText').addEventListener('input', testRegex);
}

function testRegex() {
  const pattern = document.getElementById('regexPattern').value;
  const flags = document.getElementById('regexFlags').value;
  const testText = document.getElementById('regexTestText').value;
  const resultDiv = document.getElementById('regexResult');
  
  if (!pattern || !testText) {
    resultDiv.style.display = 'none';
    return;
  }
  
  try {
    const regex = new RegExp(pattern, flags);
    const matches = [];
    let match;
    
    if (flags.includes('g')) {
      while ((match = regex.exec(testText)) !== null) {
        matches.push({
          value: match[0],
          index: match.index,
          groups: match.slice(1)
        });
        if (match.index === regex.lastIndex) regex.lastIndex++;
      }
    } else {
      match = regex.exec(testText);
      if (match) {
        matches.push({
          value: match[0],
          index: match.index,
          groups: match.slice(1)
        });
      }
    }
    
    // 显示匹配信息
    document.getElementById('regexMatchInfo').innerHTML = matches.length > 0
      ? `<span class="regex-success">✅ 找到 ${matches.length} 个匹配</span>`
      : `<span class="regex-no-match">❌ 没有匹配</span>`;
    
    // 显示匹配列表
    if (matches.length > 0) {
      document.getElementById('regexMatches').innerHTML = matches.map((m, i) => 
        `<div class="regex-match-item">
          <span class="match-index">#${i + 1}</span>
          <span class="match-value">"${escapeHtml(m.value)}"</span>
          <span class="match-pos">位置: ${m.index}</span>
          ${m.groups.length > 0 ? `<span class="match-groups">分组: ${m.groups.map(g => `"${g}"`).join(', ')}</span>` : ''}
        </div>`
      ).join('');
      
      // 高亮显示
      let highlighted = testText;
      const sortedMatches = [...matches].sort((a, b) => b.index - a.index);
      sortedMatches.forEach(m => {
        highlighted = highlighted.slice(0, m.index) + 
          `<mark>${escapeHtml(m.value)}</mark>` + 
          highlighted.slice(m.index + m.value.length);
      });
      document.getElementById('regexHighlighted').innerHTML = `<pre>${highlighted}</pre>`;
    } else {
      document.getElementById('regexMatches').innerHTML = '';
      document.getElementById('regexHighlighted').innerHTML = '';
    }
    
    resultDiv.style.display = 'block';
    
  } catch (e) {
    document.getElementById('regexMatchInfo').innerHTML = `<span class="regex-error">❌ 正则表达式错误: ${e.message}</span>`;
    document.getElementById('regexMatches').innerHTML = '';
    document.getElementById('regexHighlighted').innerHTML = '';
    resultDiv.style.display = 'block';
  }
}

function clearRegex() {
  document.getElementById('regexPattern').value = '';
  document.getElementById('regexFlags').value = 'g';
  document.getElementById('regexTestText').value = '';
  document.getElementById('regexResult').style.display = 'none';
}

// ===== 文本差异对比 =====
function initDiffTool() {
  const textA = document.getElementById('diffTextA');
  const textB = document.getElementById('diffTextB');
  const highlightLeft = document.getElementById('diffHighlightLeft');
  const highlightRight = document.getElementById('diffHighlightRight');
  
  // 实时对比
  textA.addEventListener('input', realtimeDiff);
  textB.addEventListener('input', realtimeDiff);
  document.getElementById('swapDiff').addEventListener('click', swapDiff);
  document.getElementById('clearDiff').addEventListener('click', clearDiff);
  
  // 同步滚动 - 编辑器和高亮层（包括横向滚动）
  let isScrollingA = false;
  let isScrollingB = false;
  
  textA.addEventListener('scroll', function() {
    if (isScrollingB) return;
    isScrollingA = true;
    
    // 同步高亮层
    highlightLeft.scrollTop = textA.scrollTop;
    highlightLeft.scrollLeft = textA.scrollLeft;
    
    // 同步另一边（垂直滚动）
    textB.scrollTop = textA.scrollTop;
    highlightRight.scrollTop = textA.scrollTop;
    
    setTimeout(() => { isScrollingA = false; }, 10);
  });
  
  textB.addEventListener('scroll', function() {
    if (isScrollingA) return;
    isScrollingB = true;
    
    // 同步高亮层
    highlightRight.scrollTop = textB.scrollTop;
    highlightRight.scrollLeft = textB.scrollLeft;
    
    // 同步另一边（垂直滚动）
    textA.scrollTop = textB.scrollTop;
    highlightLeft.scrollTop = textB.scrollTop;
    
    setTimeout(() => { isScrollingB = false; }, 10);
  });
}

// 实时对比（防抖）
let diffDebounceTimer = null;
function realtimeDiff() {
  clearTimeout(diffDebounceTimer);
  diffDebounceTimer = setTimeout(compareDiff, 100);
}

function compareDiff() {
  const textA = document.getElementById('diffTextA').value;
  const textB = document.getElementById('diffTextB').value;
  const highlightLeft = document.getElementById('diffHighlightLeft');
  const highlightRight = document.getElementById('diffHighlightRight');
  const statsDiv = document.getElementById('diffStats');
  
  // 如果都为空
  if (!textA && !textB) {
    highlightLeft.innerHTML = '';
    highlightRight.innerHTML = '';
    statsDiv.innerHTML = '';
    document.getElementById('diffLeftInfo').textContent = '';
    document.getElementById('diffRightInfo').textContent = '';
    return;
  }
  
  const linesA = textA.split('\n');
  const linesB = textB.split('\n');
  
  // 使用行级对齐 + 字符级差异
  const diffResult = computeLineDiff(linesA, linesB);
  
  // 更新统计信息
  statsDiv.innerHTML = `
    <span class="diff-stat-added">+${diffResult.addedChars}</span>
    <span class="diff-stat-removed">-${diffResult.removedChars}</span>
  `;
  
  document.getElementById('diffLeftInfo').textContent = `${linesA.length} 行, ${textA.length} 字符`;
  document.getElementById('diffRightInfo').textContent = `${linesB.length} 行, ${textB.length} 字符`;
  
  // 渲染高亮
  highlightLeft.innerHTML = diffResult.leftHtml;
  highlightRight.innerHTML = diffResult.rightHtml;
}

// 计算行级差异，然后对修改的行做字符级对比
function computeLineDiff(linesA, linesB) {
  // 使用 LCS 算法找出行级对齐
  const aligned = alignLines(linesA, linesB);
  
  let leftHtml = '';
  let rightHtml = '';
  let addedChars = 0;
  let removedChars = 0;
  
  aligned.forEach((pair, idx) => {
    const isLast = idx === aligned.length - 1;
    const newline = isLast ? '' : '\n';
    
    if (pair.type === 'equal') {
      // 相同行
      const text = escapeHtml(pair.left);
      leftHtml += `<span class="diff-char-equal">${text}</span>${newline}`;
      rightHtml += `<span class="diff-char-equal">${text}</span>${newline}`;
    } else if (pair.type === 'delete') {
      // 左边有，右边没有
      const text = escapeHtml(pair.left);
      leftHtml += `<span class="diff-char-delete">${text}</span>${newline}`;
      rightHtml += `<span class="diff-line-placeholder"></span>${newline}`;
      removedChars += pair.left.length + 1; // +1 for newline
    } else if (pair.type === 'insert') {
      // 右边有，左边没有
      const text = escapeHtml(pair.right);
      leftHtml += `<span class="diff-line-placeholder"></span>${newline}`;
      rightHtml += `<span class="diff-char-insert">${text}</span>${newline}`;
      addedChars += pair.right.length + 1;
    } else if (pair.type === 'modify') {
      // 两边都有但不同，做字符级对比
      const charDiff = diffChars(pair.left, pair.right);
      leftHtml += charDiff.leftHtml + newline;
      rightHtml += charDiff.rightHtml + newline;
      addedChars += charDiff.added;
      removedChars += charDiff.removed;
    }
  });
  
  return { leftHtml, rightHtml, addedChars, removedChars };
}

// 使用 LCS 算法对齐行
function alignLines(linesA, linesB) {
  const m = linesA.length;
  const n = linesB.length;
  
  // 计算 LCS 表
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // 回溯找出对齐结果
  const result = [];
  let i = m, j = n;
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      result.unshift({ type: 'equal', left: linesA[i - 1], right: linesB[j - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'insert', left: null, right: linesB[j - 1] });
      j--;
    } else if (i > 0) {
      result.unshift({ type: 'delete', left: linesA[i - 1], right: null });
      i--;
    }
  }
  
  // 优化：将相邻的 delete+insert 合并为 modify（如果行数相同）
  const optimized = [];
  let idx = 0;
  while (idx < result.length) {
    if (result[idx].type === 'delete') {
      // 收集连续的 delete
      const deletes = [];
      while (idx < result.length && result[idx].type === 'delete') {
        deletes.push(result[idx]);
        idx++;
      }
      // 收集连续的 insert
      const inserts = [];
      while (idx < result.length && result[idx].type === 'insert') {
        inserts.push(result[idx]);
        idx++;
      }
      // 配对为 modify
      const minLen = Math.min(deletes.length, inserts.length);
      for (let k = 0; k < minLen; k++) {
        optimized.push({ type: 'modify', left: deletes[k].left, right: inserts[k].right });
      }
      // 剩余的
      for (let k = minLen; k < deletes.length; k++) {
        optimized.push(deletes[k]);
      }
      for (let k = minLen; k < inserts.length; k++) {
        optimized.push(inserts[k]);
      }
    } else {
      optimized.push(result[idx]);
      idx++;
    }
  }
  
  return optimized;
}

// 字符级差异对比（用于单行内对比）
function diffChars(textA, textB) {
  // 使用简化的字符级 LCS
  const m = textA.length;
  const n = textB.length;
  
  // 为了性能，对于很长的行使用简化算法
  if (m > 500 || n > 500) {
    return simpleDiffChars(textA, textB);
  }
  
  // 计算 LCS
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (textA[i - 1] === textB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // 回溯生成差异
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && textA[i - 1] === textB[j - 1]) {
      ops.unshift({ type: 'equal', char: textA[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'insert', char: textB[j - 1] });
      j--;
    } else {
      ops.unshift({ type: 'delete', char: textA[i - 1] });
      i--;
    }
  }
  
  // 合并连续相同类型
  const merged = [];
  for (const op of ops) {
    if (merged.length > 0 && merged[merged.length - 1].type === op.type) {
      merged[merged.length - 1].chars += op.char;
    } else {
      merged.push({ type: op.type, chars: op.char });
    }
  }
  
  // 生成 HTML
  let leftHtml = '';
  let rightHtml = '';
  let added = 0, removed = 0;
  
  for (const part of merged) {
    const text = escapeHtml(part.chars);
    if (part.type === 'equal') {
      leftHtml += `<span class="diff-char-equal">${text}</span>`;
      rightHtml += `<span class="diff-char-equal">${text}</span>`;
    } else if (part.type === 'delete') {
      leftHtml += `<span class="diff-char-delete">${text}</span>`;
      removed += part.chars.length;
    } else if (part.type === 'insert') {
      rightHtml += `<span class="diff-char-insert">${text}</span>`;
      added += part.chars.length;
    }
  }
  
  return { leftHtml, rightHtml, added, removed };
}

// 简化的字符级差异（用于长行）
function simpleDiffChars(textA, textB) {
  // 找公共前缀
  let prefixLen = 0;
  while (prefixLen < textA.length && prefixLen < textB.length && textA[prefixLen] === textB[prefixLen]) {
    prefixLen++;
  }
  
  // 找公共后缀
  let suffixLen = 0;
  while (suffixLen < textA.length - prefixLen && suffixLen < textB.length - prefixLen && 
         textA[textA.length - 1 - suffixLen] === textB[textB.length - 1 - suffixLen]) {
    suffixLen++;
  }
  
  const prefix = escapeHtml(textA.substring(0, prefixLen));
  const suffix = escapeHtml(textA.substring(textA.length - suffixLen));
  const deletedMiddle = escapeHtml(textA.substring(prefixLen, textA.length - suffixLen));
  const insertedMiddle = escapeHtml(textB.substring(prefixLen, textB.length - suffixLen));
  
  let leftHtml = '';
  let rightHtml = '';
  
  if (prefix) {
    leftHtml += `<span class="diff-char-equal">${prefix}</span>`;
    rightHtml += `<span class="diff-char-equal">${prefix}</span>`;
  }
  if (deletedMiddle) {
    leftHtml += `<span class="diff-char-delete">${deletedMiddle}</span>`;
  }
  if (insertedMiddle) {
    rightHtml += `<span class="diff-char-insert">${insertedMiddle}</span>`;
  }
  if (suffix) {
    leftHtml += `<span class="diff-char-equal">${suffix}</span>`;
    rightHtml += `<span class="diff-char-equal">${suffix}</span>`;
  }
  
  return { 
    leftHtml, 
    rightHtml, 
    added: textB.length - prefixLen - suffixLen,
    removed: textA.length - prefixLen - suffixLen
  };
}

// 计算对齐的差异（用于并排显示）
function computeAlignedDiff(linesA, linesB) {
  const result = [];
  let i = 0, j = 0;
  
  while (i < linesA.length || j < linesB.length) {
    if (i >= linesA.length) {
      result.push({ type: 'add', left: null, right: linesB[j], leftNum: null, rightNum: j + 1 });
      j++;
    } else if (j >= linesB.length) {
      result.push({ type: 'remove', left: linesA[i], right: null, leftNum: i + 1, rightNum: null });
      i++;
    } else if (linesA[i] === linesB[j]) {
      result.push({ type: 'unchanged', left: linesA[i], right: linesB[j], leftNum: i + 1, rightNum: j + 1 });
      i++; j++;
    } else {
      // 查找最近的匹配
      const lookAheadB = linesB.slice(j, j + 10).indexOf(linesA[i]);
      const lookAheadA = linesA.slice(i, i + 10).indexOf(linesB[j]);
      
      if (lookAheadB !== -1 && (lookAheadA === -1 || lookAheadB <= lookAheadA)) {
        // B 中找到了 A[i]，先输出 B 中新增的
        for (let k = 0; k < lookAheadB; k++) {
          result.push({ type: 'add', left: null, right: linesB[j + k], leftNum: null, rightNum: j + k + 1 });
        }
        j += lookAheadB;
      } else if (lookAheadA !== -1) {
        // A 中找到了 B[j]，先输出 A 中删除的
        for (let k = 0; k < lookAheadA; k++) {
          result.push({ type: 'remove', left: linesA[i + k], right: null, leftNum: i + k + 1, rightNum: null });
        }
        i += lookAheadA;
      } else {
        // 都找不到，标记为修改（左边删除，右边新增，同一行显示）
        result.push({ type: 'modify', left: linesA[i], right: linesB[j], leftNum: i + 1, rightNum: j + 1 });
        i++; j++;
      }
    }
  }
  
  return result;
}

// 渲染并排差异视图
function renderSideBySideDiff(alignedDiff, viewLeft, viewRight) {
  let leftHtml = '';
  let rightHtml = '';
  
  alignedDiff.forEach(d => {
    const leftNum = d.leftNum !== null ? d.leftNum : '';
    const rightNum = d.rightNum !== null ? d.rightNum : '';
    const leftContent = d.left !== null ? escapeHtml(d.left) || '&nbsp;' : '&nbsp;';
    const rightContent = d.right !== null ? escapeHtml(d.right) || '&nbsp;' : '&nbsp;';
    
    if (d.type === 'unchanged') {
      leftHtml += `<div class="diff-row diff-row-unchanged"><span class="diff-num">${leftNum}</span><span class="diff-text">${leftContent}</span></div>`;
      rightHtml += `<div class="diff-row diff-row-unchanged"><span class="diff-num">${rightNum}</span><span class="diff-text">${rightContent}</span></div>`;
    } else if (d.type === 'remove') {
      leftHtml += `<div class="diff-row diff-row-removed"><span class="diff-num">${leftNum}</span><span class="diff-text">${leftContent}</span></div>`;
      rightHtml += `<div class="diff-row diff-row-empty"><span class="diff-num"></span><span class="diff-text">&nbsp;</span></div>`;
    } else if (d.type === 'add') {
      leftHtml += `<div class="diff-row diff-row-empty"><span class="diff-num"></span><span class="diff-text">&nbsp;</span></div>`;
      rightHtml += `<div class="diff-row diff-row-added"><span class="diff-num">${rightNum}</span><span class="diff-text">${rightContent}</span></div>`;
    } else if (d.type === 'modify') {
      // 高亮字符级差异
      const charDiff = highlightCharDiff(d.left || '', d.right || '');
      leftHtml += `<div class="diff-row diff-row-modified-left"><span class="diff-num">${leftNum}</span><span class="diff-text">${charDiff.left}</span></div>`;
      rightHtml += `<div class="diff-row diff-row-modified-right"><span class="diff-num">${rightNum}</span><span class="diff-text">${charDiff.right}</span></div>`;
    }
  });
  
  viewLeft.innerHTML = leftHtml;
  viewRight.innerHTML = rightHtml;
}

// 高亮行内字符差异
function highlightCharDiff(textA, textB) {
  // 简单的字符级差异高亮
  let leftHtml = '';
  let rightHtml = '';
  
  const wordsA = textA.split(/(\s+)/);
  const wordsB = textB.split(/(\s+)/);
  
  let i = 0, j = 0;
  while (i < wordsA.length || j < wordsB.length) {
    if (i >= wordsA.length) {
      rightHtml += `<span class="diff-highlight-add">${escapeHtml(wordsB[j])}</span>`;
      j++;
    } else if (j >= wordsB.length) {
      leftHtml += `<span class="diff-highlight-remove">${escapeHtml(wordsA[i])}</span>`;
      i++;
    } else if (wordsA[i] === wordsB[j]) {
      leftHtml += escapeHtml(wordsA[i]);
      rightHtml += escapeHtml(wordsB[j]);
      i++; j++;
    } else {
      leftHtml += `<span class="diff-highlight-remove">${escapeHtml(wordsA[i])}</span>`;
      rightHtml += `<span class="diff-highlight-add">${escapeHtml(wordsB[j])}</span>`;
      i++; j++;
    }
  }
  
  return { left: leftHtml || '&nbsp;', right: rightHtml || '&nbsp;' };
}

function computeDiff(linesA, linesB) {
  const result = [];
  let i = 0, j = 0;
  
  while (i < linesA.length || j < linesB.length) {
    if (i >= linesA.length) {
      // A 已结束，B 剩余的都是新增
      result.push({ type: 'add', line: linesB[j] });
      j++;
    } else if (j >= linesB.length) {
      // B 已结束，A 剩余的都是删除
      result.push({ type: 'remove', line: linesA[i] });
      i++;
    } else if (linesA[i] === linesB[j]) {
      // 相同
      result.push({ type: 'unchanged', line: linesA[i] });
      i++;
      j++;
    } else {
      // 不同，尝试查找最近的匹配
      const lookAheadB = linesB.slice(j, j + 5).indexOf(linesA[i]);
      const lookAheadA = linesA.slice(i, i + 5).indexOf(linesB[j]);
      
      if (lookAheadB !== -1 && (lookAheadA === -1 || lookAheadB <= lookAheadA)) {
        // B 中找到了 A[i]，先输出 B 中新增的
        for (let k = 0; k < lookAheadB; k++) {
          result.push({ type: 'add', line: linesB[j + k] });
        }
        j += lookAheadB;
      } else if (lookAheadA !== -1) {
        // A 中找到了 B[j]，先输出 A 中删除的
        for (let k = 0; k < lookAheadA; k++) {
          result.push({ type: 'remove', line: linesA[i + k] });
        }
        i += lookAheadA;
      } else {
        // 都找不到，标记为删除和新增
        result.push({ type: 'remove', line: linesA[i] });
        result.push({ type: 'add', line: linesB[j] });
        i++;
        j++;
      }
    }
  }
  
  return result;
}

function swapDiff() {
  const textA = document.getElementById('diffTextA').value;
  const textB = document.getElementById('diffTextB').value;
  document.getElementById('diffTextA').value = textB;
  document.getElementById('diffTextB').value = textA;
  compareDiff();
}

function clearDiff() {
  document.getElementById('diffTextA').value = '';
  document.getElementById('diffTextB').value = '';
  document.getElementById('diffHighlightLeft').innerHTML = '';
  document.getElementById('diffHighlightRight').innerHTML = '';
  document.getElementById('diffStats').innerHTML = '';
  document.getElementById('diffLeftInfo').textContent = '';
  document.getElementById('diffRightInfo').textContent = '';
}

// ===== 命名转换工具 =====
function initCaseTool() {
  document.getElementById('toCamelCase').addEventListener('click', () => convertCase('camel'));
  document.getElementById('toPascalCase').addEventListener('click', () => convertCase('pascal'));
  document.getElementById('toSnakeCase').addEventListener('click', () => convertCase('snake'));
  document.getElementById('toKebabCase').addEventListener('click', () => convertCase('kebab'));
  document.getElementById('toConstantCase').addEventListener('click', () => convertCase('constant'));
  document.getElementById('clearCase').addEventListener('click', clearCase);
  document.getElementById('copyCaseResult').addEventListener('click', copyCaseResult);
}

function convertCase(targetCase) {
  const input = document.getElementById('caseInput').value;
  const output = document.getElementById('caseOutput');
  
  if (!input.trim()) {
    output.value = '';
    return;
  }
  
  // 支持批量转换（按行分割）
  const lines = input.split('\n');
  const converted = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    
    switch(targetCase) {
      case 'camel':
        return toCamelCase(trimmed);
      case 'pascal':
        return toPascalCase(trimmed);
      case 'snake':
        return toSnakeCase(trimmed);
      case 'kebab':
        return toKebabCase(trimmed);
      case 'constant':
        return toConstantCase(trimmed);
      default:
        return trimmed;
    }
  });
  
  output.value = converted.join('\n');
}

function toCamelCase(str) {
  // 先分词
  const words = splitWords(str);
  return words.map((word, index) => {
    word = word.toLowerCase();
    if (index === 0) {
      return word;
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join('');
}

function toPascalCase(str) {
  const words = splitWords(str);
  return words.map(word => {
    word = word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join('');
}

function toSnakeCase(str) {
  const words = splitWords(str);
  return words.map(word => word.toLowerCase()).join('_');
}

function toKebabCase(str) {
  const words = splitWords(str);
  return words.map(word => word.toLowerCase()).join('-');
}

function toConstantCase(str) {
  const words = splitWords(str);
  return words.map(word => word.toUpperCase()).join('_');
}

function splitWords(str) {
  // 处理各种命名格式，分割成单词数组
  let words = [];
  
  // 先处理常见的分隔符：下划线、短横线、空格、点号
  let temp = str.replace(/[_\-\s.]+/g, '|');
  
  // 处理驼峰命名：在大写字母前插入分隔符
  temp = temp.replace(/([a-z])([A-Z])/g, '$1|$2');
  temp = temp.replace(/([A-Z])([A-Z][a-z])/g, '$1|$2');
  
  // 分割并过滤空字符串
  words = temp.split('|').filter(word => word.length > 0);
  
  return words;
}

function clearCase() {
  document.getElementById('caseInput').value = '';
  document.getElementById('caseOutput').value = '';
}

function copyCaseResult() {
  const output = document.getElementById('caseOutput');
  const text = output.value;
  
  if (!text) {
    return;
  }
  
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyCaseResult');
    const originalText = btn.textContent;
    btn.textContent = '✅ 已复制';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  });
}

// ===== Mermaid 图表工具 =====
let mermaidInitialized = false;
let currentMermaidSvg = null;

// Mermaid 示例代码
const MERMAID_EXAMPLES = {
  flowchart: `graph TD
    A[开始] --> B{判断条件}
    B -->|是| C[执行操作A]
    B -->|否| D[执行操作B]
    C --> E[结束]
    D --> E`,
  
  sequence: `sequenceDiagram
    participant 用户
    participant 前端
    participant 后端
    participant 数据库
    
    用户->>前端: 发起请求
    前端->>后端: API调用
    后端->>数据库: 查询数据
    数据库-->>后端: 返回结果
    后端-->>前端: 响应数据
    前端-->>用户: 展示结果`,
  
  class: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +String breed
        +bark()
    }
    class Cat {
        +String color
        +meow()
    }
    Animal <|-- Dog
    Animal <|-- Cat`,
  
  er: `erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "ordered in"
    
    USER {
        int id PK
        string name
        string email
    }
    ORDER {
        int id PK
        date created_at
        int user_id FK
    }
    PRODUCT {
        int id PK
        string name
        float price
    }`,
  
  gantt: `gantt
    title 项目开发计划
    dateFormat  YYYY-MM-DD
    section 需求阶段
    需求分析           :a1, 2024-01-01, 7d
    需求评审           :after a1, 3d
    section 开发阶段
    后端开发           :2024-01-11, 14d
    前端开发           :2024-01-11, 14d
    section 测试阶段
    功能测试           :2024-01-25, 7d
    上线部署           :2024-02-01, 2d`,
  
  pie: `pie title 项目时间分配
    "开发" : 45
    "测试" : 25
    "设计" : 15
    "会议" : 10
    "其他" : 5`
};

async function initMermaidTool() {
  // 初始化 Mermaid（库已在 HTML 中加载）
  initMermaidLibrary();
  
  // 绑定事件
  document.getElementById('renderMermaid').addEventListener('click', renderMermaid);
  document.getElementById('copyMermaidImage').addEventListener('click', copyMermaidImage);
  document.getElementById('downloadMermaidImage').addEventListener('click', downloadMermaidImage);
  document.getElementById('downloadMermaidSvg').addEventListener('click', downloadMermaidSvg);
  document.getElementById('clearMermaid').addEventListener('click', clearMermaid);
  
  // 绑定示例按钮
  document.querySelectorAll('.mermaid-example-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const example = this.dataset.example;
      if (MERMAID_EXAMPLES[example]) {
        document.getElementById('mermaidInput').value = MERMAID_EXAMPLES[example];
      }
    });
  });
}

function initMermaidLibrary() {
  if (mermaidInitialized) return;
  
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: 14,
      flowchart: {
        useMaxWidth: false,  // 不限制宽度，保持原始尺寸
        htmlLabels: true,
        curve: 'basis',
        padding: 15,
        nodeSpacing: 50,
        rankSpacing: 50
      },
      themeVariables: {
        fontSize: '14px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }
    });
    mermaidInitialized = true;
    console.log('✅ Mermaid 库初始化完成');
  } else {
    console.error('❌ Mermaid 库未加载');
  }
}

async function renderMermaid() {
  const input = document.getElementById('mermaidInput').value.trim();
  const output = document.getElementById('mermaidOutput');
  const copyBtn = document.getElementById('copyMermaidImage');
  const downloadBtn = document.getElementById('downloadMermaidImage');
  const downloadSvgBtn = document.getElementById('downloadMermaidSvg');
  
  if (!input) {
    showMermaidStatus('请输入 Mermaid 代码', 'error');
    return;
  }
  
  if (!mermaidInitialized) {
    initMermaidLibrary();
    if (!mermaidInitialized) {
      showMermaidStatus('Mermaid 库未能初始化', 'error');
      return;
    }
  }
  
  showMermaidStatus('正在渲染...', 'info');
  
  try {
    // 生成唯一ID
    const id = 'mermaid-' + Date.now();
    
    // 渲染 Mermaid
    const { svg } = await mermaid.render(id, input);
    
    // 显示 SVG
    output.innerHTML = svg;
    currentMermaidSvg = svg;
    
    // 启用复制和下载按钮
    copyBtn.disabled = false;
    downloadBtn.disabled = false;
    downloadSvgBtn.disabled = false;
    
    showMermaidStatus('✅ 渲染成功！', 'success');
  } catch (error) {
    console.error('Mermaid 渲染错误:', error);
    output.innerHTML = `
      <div class="mermaid-error">
        <span class="error-icon">❌</span>
        <span class="error-text">渲染失败: ${error.message || '语法错误'}</span>
      </div>
    `;
    currentMermaidSvg = null;
    copyBtn.disabled = true;
    downloadBtn.disabled = true;
    downloadSvgBtn.disabled = true;
    showMermaidStatus('❌ 渲染失败，请检查语法', 'error');
  }
}

async function copyMermaidImage() {
  if (!currentMermaidSvg) {
    showMermaidStatus('请先渲染图表', 'error');
    return;
  }
  
  const btn = document.getElementById('copyMermaidImage');
  const originalText = btn.textContent;
  btn.textContent = '⏳ 生成中...';
  btn.disabled = true;
  
  try {
    // 将 SVG 转换为 PNG
    const pngBlob = await svgToPngBlob(currentMermaidSvg);
    
    // 复制到剪贴板
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': pngBlob
      })
    ]);
    
    const sizeMB = (pngBlob.size / 1024 / 1024).toFixed(2);
    btn.textContent = '✅ 已复制';
    btn.disabled = false;
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
    
    showMermaidStatus(`✅ 图片已复制 (${sizeMB} MB)`, 'success');
  } catch (error) {
    console.error('复制图片失败:', error);
    btn.textContent = originalText;
    btn.disabled = false;
    
    // 提供更友好的错误提示
    let errorMsg = error.message;
    if (errorMsg.includes('Canvas') || errorMsg.includes('太大')) {
      errorMsg = '图片太大，请降低清晰度后重试';
    }
    showMermaidStatus('❌ 复制失败: ' + errorMsg, 'error');
  }
}

async function downloadMermaidImage() {
  if (!currentMermaidSvg) {
    showMermaidStatus('请先渲染图表', 'error');
    return;
  }
  
  const btn = document.getElementById('downloadMermaidImage');
  const originalText = btn.textContent;
  btn.textContent = '⏳ 生成中...';
  btn.disabled = true;
  
  try {
    // 将 SVG 转换为 PNG
    const pngBlob = await svgToPngBlob(currentMermaidSvg);
    
    // 创建下载链接
    const url = URL.createObjectURL(pngBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mermaid-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    const sizeMB = (pngBlob.size / 1024 / 1024).toFixed(2);
    btn.textContent = '✅ 已下载';
    btn.disabled = false;
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
    
    showMermaidStatus(`✅ 图片已下载 (${sizeMB} MB)`, 'success');
  } catch (error) {
    console.error('下载图片失败:', error);
    btn.textContent = originalText;
    btn.disabled = false;
    
    // 提供更友好的错误提示
    let errorMsg = error.message;
    if (errorMsg.includes('Canvas') || errorMsg.includes('太大')) {
      errorMsg = '图片太大，请降低清晰度后重试';
    }
    showMermaidStatus('❌ 下载失败: ' + errorMsg, 'error');
  }
}

// 下载 SVG 矢量图（无限清晰）
function downloadMermaidSvg() {
  if (!currentMermaidSvg) {
    showMermaidStatus('请先渲染图表', 'error');
    return;
  }
  
  try {
    // 处理 SVG，确保可以独立使用
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(currentMermaidSvg, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;
    
    // 确保有 xmlns 属性
    if (!svgElement.getAttribute('xmlns')) {
      svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    svgElement.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    
    // 添加白色背景
    const rect = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', 'white');
    svgElement.insertBefore(rect, svgElement.firstChild);
    
    // 序列化
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgElement);
    
    // 创建 Blob 并下载
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mermaid-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    const sizeMB = (blob.size / 1024).toFixed(1);
    const btn = document.getElementById('downloadMermaidSvg');
    btn.textContent = '✅ 已下载';
    setTimeout(() => {
      btn.textContent = '📐 下载 SVG';
    }, 2000);
    
    showMermaidStatus(`✅ SVG 已下载 (${sizeMB} KB) - 矢量图可无限放大`, 'success');
  } catch (error) {
    console.error('下载 SVG 失败:', error);
    showMermaidStatus('❌ 下载失败: ' + error.message, 'error');
  }
}

function svgToPngBlob(svgString) {
  return new Promise((resolve, reject) => {
    // 创建一个临时的 div 来获取 SVG 实际渲染尺寸
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.visibility = 'hidden';
    tempDiv.style.left = '-9999px';
    tempDiv.innerHTML = svgString;
    document.body.appendChild(tempDiv);
    
    const svgElement = tempDiv.querySelector('svg');
    
    // 获取 SVG 的实际渲染尺寸（最准确的方式）
    const bbox = svgElement.getBoundingClientRect();
    let width = bbox.width;
    let height = bbox.height;
    
    // 如果 getBoundingClientRect 返回 0，尝试其他方式
    if (width === 0 || height === 0) {
      // 尝试从 viewBox 获取
      const viewBox = svgElement.getAttribute('viewBox');
      if (viewBox) {
        const parts = viewBox.split(/[\s,]+/);
        if (parts.length >= 4) {
          width = parseFloat(parts[2]) || 800;
          height = parseFloat(parts[3]) || 600;
        }
      }
      
      // 尝试从 width/height 属性获取
      if (width === 0 || height === 0) {
        const widthAttr = svgElement.getAttribute('width');
        const heightAttr = svgElement.getAttribute('height');
        width = parseFloat(widthAttr) || 800;
        height = parseFloat(heightAttr) || 600;
      }
    }
    
    // 移除临时元素
    document.body.removeChild(tempDiv);
    
    // 确保有合理的尺寸
    width = Math.max(width, 100);
    height = Math.max(height, 100);
    
    console.log('SVG 尺寸:', width, 'x', height);
    
    // 从选择器获取清晰度倍数
    const qualitySelect = document.getElementById('mermaidQuality');
    let scale = qualitySelect ? parseInt(qualitySelect.value) || 8 : 8;
    
    let scaledWidth = Math.round(width * scale);
    let scaledHeight = Math.round(height * scale);
    
    // 浏览器 Canvas 有最大尺寸限制
    // Chrome: ~16384, Safari: ~4096, Firefox: ~32767
    // 使用 OffscreenCanvas 检测或保守估计
    const MAX_DIMENSION = 16384;
    const MAX_AREA = 268435456; // 16384 * 16384
    
    // 检查是否超出限制
    const totalArea = scaledWidth * scaledHeight;
    if (scaledWidth > MAX_DIMENSION || scaledHeight > MAX_DIMENSION || totalArea > MAX_AREA) {
      // 计算最大可用缩放
      const maxScaleByDim = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      const maxScaleByArea = Math.sqrt(MAX_AREA / (width * height));
      const maxScale = Math.min(maxScaleByDim, maxScaleByArea);
      
      if (maxScale < scale) {
        console.warn(`原始 ${scale}x 超出限制，自动调整为 ${Math.floor(maxScale)}x`);
        scale = Math.floor(maxScale);
        scaledWidth = Math.round(width * scale);
        scaledHeight = Math.round(height * scale);
      }
    }
    
    console.log('输出尺寸:', scaledWidth, 'x', scaledHeight, '(', scale, 'x 缩放)');
    
    // 创建 canvas
    const canvas = document.createElement('canvas');
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    const ctx = canvas.getContext('2d');
    
    // 检查 canvas 是否创建成功
    if (!ctx) {
      reject(new Error('无法创建 Canvas，图片可能太大'));
      return;
    }
    
    // 关闭图像平滑，保持锐利边缘（对于矢量图形更清晰）
    ctx.imageSmoothingEnabled = false;
    
    // 设置白色背景
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, scaledWidth, scaledHeight);
    
    // 创建 Image 对象
    const img = new Image();
    
    // 克隆 SVG 并设置高分辨率尺寸
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const clonedSvg = svgDoc.documentElement;
    
    // 确保有 xmlns 属性
    if (!clonedSvg.getAttribute('xmlns')) {
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    
    // 直接设置 SVG 为缩放后的尺寸（关键！让 SVG 以高分辨率渲染）
    clonedSvg.setAttribute('width', scaledWidth);
    clonedSvg.setAttribute('height', scaledHeight);
    
    // 如果有 viewBox，保持不变（这样 SVG 会自动缩放内容）
    if (!clonedSvg.getAttribute('viewBox')) {
      clonedSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }
    
    // 添加样式确保文字清晰
    const style = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `
      text { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        text-rendering: geometricPrecision !important;
      }
      * {
        shape-rendering: geometricPrecision !important;
      }
    `;
    clonedSvg.insertBefore(style, clonedSvg.firstChild);
    
    // 序列化 SVG
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(clonedSvg);
    
    // 将 SVG 转换为 data URL（使用 base64 编码）
    const base64Svg = btoa(unescape(encodeURIComponent(svgStr)));
    const dataUrl = 'data:image/svg+xml;base64,' + base64Svg;
    
    img.onload = () => {
      // 绘制到 canvas（1:1，因为 SVG 已经是高分辨率）
      ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);
      
      // 使用最高质量导出 PNG
      canvas.toBlob((blob) => {
        if (blob) {
          console.log('PNG 生成成功，大小:', (blob.size / 1024).toFixed(1), 'KB');
          resolve(blob);
        } else {
          reject(new Error('Canvas 转换失败'));
        }
      }, 'image/png', 1.0);
    };
    
    img.onerror = (e) => {
      console.error('SVG 加载失败:', e);
      reject(new Error('SVG 加载失败'));
    };
    
    img.src = dataUrl;
  });
}

function clearMermaid() {
  document.getElementById('mermaidInput').value = '';
  document.getElementById('mermaidOutput').innerHTML = `
    <div class="mermaid-placeholder">
      <span class="placeholder-icon">📊</span>
      <span class="placeholder-text">输入 Mermaid 代码后点击"渲染图表"</span>
    </div>
  `;
  currentMermaidSvg = null;
  document.getElementById('copyMermaidImage').disabled = true;
  document.getElementById('downloadMermaidImage').disabled = true;
  document.getElementById('downloadMermaidSvg').disabled = true;
  document.getElementById('mermaidStatus').className = 'mermaid-status';
  document.getElementById('mermaidStatus').textContent = '';
}

function showMermaidStatus(message, type) {
  const status = document.getElementById('mermaidStatus');
  status.textContent = message;
  status.className = `mermaid-status ${type}`;
  
  if (type === 'success') {
    setTimeout(() => {
      status.className = 'mermaid-status';
      status.textContent = '';
    }, 3000);
  }
}

// ===== HTTP 请求测试工具 =====
let httpHistory = [];

function initHttpTool() {
  // 加载历史记录
  loadHttpHistory();
  
  // 加载上次的配置
  loadHttpConfig();
  
  // 绑定发送请求按钮
  document.getElementById('sendHttpRequest').addEventListener('click', sendHttpRequest);
  
  // 绑定清除按钮
  document.getElementById('clearHttpConfig').addEventListener('click', clearHttpConfig);
  
  // 自动保存配置（输入变化时）
  document.getElementById('httpUrl').addEventListener('input', saveHttpConfig);
  document.getElementById('httpMethod').addEventListener('change', saveHttpConfig);
  document.getElementById('httpBody').addEventListener('input', saveHttpConfig);
  document.getElementById('authType').addEventListener('change', function() {
    saveHttpConfig();
  });
  document.getElementById('bearerToken').addEventListener('input', saveHttpConfig);
  document.getElementById('basicUsername').addEventListener('input', saveHttpConfig);
  document.getElementById('basicPassword').addEventListener('input', saveHttpConfig);
  document.getElementById('apiKeyName').addEventListener('input', saveHttpConfig);
  document.getElementById('apiKeyValue').addEventListener('input', saveHttpConfig);
  
  // 绑定添加 Header 按钮
  document.getElementById('addHttpHeader').addEventListener('click', addHttpHeader);
  
  // 绑定删除 Header 按钮（事件委托）
  document.getElementById('httpHeadersList').addEventListener('click', function(e) {
    if (e.target.classList.contains('remove-header')) {
      e.target.closest('.http-header-row').remove();
    }
  });
  
  // 绑定 HTTP 子选项卡切换
  document.querySelectorAll('.http-tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const tabName = this.dataset.httpTab;
      
      // 更新按钮状态
      document.querySelectorAll('.http-tab-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      // 更新面板显示
      document.querySelectorAll('.http-panel').forEach(panel => panel.classList.remove('active'));
      document.getElementById(`http-${tabName}-panel`).classList.add('active');
    });
  });
  
  // 绑定认证类型切换
  document.getElementById('authType').addEventListener('change', function() {
    const authType = this.value;
    
    // 隐藏所有认证面板
    document.querySelectorAll('.auth-section').forEach(section => {
      section.style.display = 'none';
    });
    
    // 显示对应的认证面板
    if (authType !== 'none') {
      document.getElementById(`auth-${authType}`).style.display = 'block';
    }
  });
  
  // 绑定 JWT 解析按钮
  document.getElementById('parseJwt').addEventListener('click', parseJwtToken);
  
  // 绑定 ApiMart JWT 生成按钮（在 Bearer Token 面板中）
  document.getElementById('generateApiMartJwt').addEventListener('click', generateApiMartJwt);
  
  // 绑定 JWT 配置相关按钮
  document.getElementById('toggleJwtConfig').addEventListener('click', toggleJwtConfigPanel);
  document.getElementById('toggleSecretVisibility').addEventListener('click', toggleSecretVisibility);
  document.getElementById('saveJwtConfig').addEventListener('click', saveJwtEnvConfig);
  document.getElementById('resetJwtConfig').addEventListener('click', resetJwtEnvConfig);
  document.getElementById('applyJwtLive').addEventListener('click', () => applyJwtPreset('live'));
  document.getElementById('applyJwtTest').addEventListener('click', () => applyJwtPreset('test'));
  document.getElementById('presetClearAuth').addEventListener('click', clearAuthPreset);
  
  // JWT 环境切换
  document.querySelectorAll('.jwt-env-tab').forEach(tab => {
    tab.addEventListener('click', () => switchJwtEnv(tab.dataset.env));
  });
  
  // 加载 JWT 配置
  loadJwtConfigs();
  
  // 绑定复制响应按钮
  document.getElementById('copyHttpResponse').addEventListener('click', copyHttpResponse);
  
  // 绑定格式化响应按钮
  document.getElementById('formatHttpResponse').addEventListener('click', formatHttpResponse);
  
  // 绑定清空历史按钮
  document.getElementById('clearHttpHistory').addEventListener('click', clearHttpHistory);
  
  // 绑定历史记录点击（事件委托）
  document.getElementById('httpHistoryList').addEventListener('click', function(e) {
    const historyItem = e.target.closest('.http-history-item');
    if (historyItem) {
      const index = parseInt(historyItem.dataset.index);
      loadFromHistory(index);
    }
  });
}

function addHttpHeader() {
  const headersList = document.getElementById('httpHeadersList');
  const newRow = document.createElement('div');
  newRow.className = 'http-header-row';
  newRow.innerHTML = `
    <input type="text" class="header-key" placeholder="Header Name">
    <input type="text" class="header-value" placeholder="Header Value">
    <button class="btn-icon remove-header" title="删除">🗑️</button>
  `;
  headersList.appendChild(newRow);
  
  // 绑定输入事件以保存配置
  newRow.querySelector('.header-key').addEventListener('input', saveHttpConfig);
  newRow.querySelector('.header-value').addEventListener('input', saveHttpConfig);
}

function getHeaders() {
  const headers = {};
  document.querySelectorAll('.http-header-row').forEach(row => {
    const key = row.querySelector('.header-key').value.trim();
    const value = row.querySelector('.header-value').value.trim();
    if (key) {
      headers[key] = value;
    }
  });
  return headers;
}

function getAuthHeaders() {
  const authType = document.getElementById('authType').value;
  const headers = {};
  
  switch (authType) {
    case 'bearer':
      const token = document.getElementById('bearerToken').value.trim();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      break;
    case 'basic':
    case 'digest':
      const username = authType === 'basic' 
        ? document.getElementById('basicUsername').value 
        : document.getElementById('digestUsername').value;
      const password = authType === 'basic'
        ? document.getElementById('basicPassword').value
        : document.getElementById('digestPassword').value;
      if (username) {
        const encoded = btoa(`${username}:${password}`);
        headers['Authorization'] = `Basic ${encoded}`;
      }
      break;
    case 'apikey':
      const keyName = document.getElementById('apiKeyName').value.trim() || 'X-API-Key';
      const keyValue = document.getElementById('apiKeyValue').value.trim();
      if (keyValue) {
        headers[keyName] = keyValue;
      }
      break;
    // apikey-query 在 URL 处理，不加 header
    case 'apikey-query':
      break;
    case 'oauth1':
      // OAuth 1.0 签名比较复杂，这里提供基础支持
      // 实际使用可能需要更完整的实现
      console.log('OAuth 1.0 认证需要额外的签名处理');
      break;
    case 'aws':
      // AWS Signature V4 需要复杂的签名计算
      // 这里只是占位，实际使用需要完整实现
      console.log('AWS Signature 认证需要额外的签名处理');
      break;
  }
  
  return headers;
}

// 获取 API Key Query 参数（用于 apikey-query 类型）
function getApiKeyQueryParam() {
  const authType = document.getElementById('authType').value;
  if (authType === 'apikey-query') {
    const paramName = document.getElementById('apiKeyQueryName').value.trim() || 'api_key';
    const paramValue = document.getElementById('apiKeyQueryValue').value.trim();
    if (paramValue) {
      return { name: paramName, value: paramValue };
    }
  }
  return null;
}

async function sendHttpRequest() {
  const method = document.getElementById('httpMethod').value;
  let url = document.getElementById('httpUrl').value.trim();
  
  if (!url) {
    alert('请输入请求 URL');
    return;
  }
  
  // 处理 API Key Query 参数
  const apiKeyQuery = getApiKeyQueryParam();
  if (apiKeyQuery) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}${encodeURIComponent(apiKeyQuery.name)}=${encodeURIComponent(apiKeyQuery.value)}`;
  }
  
  // 获取 Headers
  const customHeaders = getHeaders();
  const authHeaders = getAuthHeaders();
  const allHeaders = { ...customHeaders, ...authHeaders };
  
  // 获取 Body
  const body = document.getElementById('httpBody').value.trim();
  
  // 显示加载状态
  const responseDiv = document.getElementById('httpResponse');
  const metaDiv = document.getElementById('httpResponseMeta');
  responseDiv.innerHTML = '<div class="http-loading">⏳ 请求中...</div>';
  metaDiv.innerHTML = '';
  
  const startTime = Date.now();
  
  try {
    // 通过 background.js 代理请求（解决 CORS 问题）
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'httpRequest',
        method: method,
        url: url,
        headers: allHeaders,
        body: body
      }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error(response ? response.error : '请求失败'));
        }
      });
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // 获取响应信息
    const responseText = response.body;
    const responseSize = new Blob([responseText]).size;
    
    // 显示响应元信息
    const statusClass = response.status >= 200 && response.status < 300 ? 'status-success' : 'status-error';
    metaDiv.innerHTML = `
      <span class="http-status ${statusClass}">${response.status} ${response.statusText}</span>
      <span class="http-time">⏱️ ${duration}ms</span>
      <span class="http-size">📦 ${formatSize(responseSize)}</span>
    `;
    
    // 尝试格式化 JSON
    let displayText = responseText;
    try {
      const jsonData = JSON.parse(responseText);
      displayText = JSON.stringify(jsonData, null, 2);
    } catch (e) {
      // 不是 JSON，保持原样
    }
    
    responseDiv.innerHTML = `<pre class="http-response-content">${escapeHtml(displayText)}</pre>`;
    
    // 启用复制和格式化按钮
    document.getElementById('copyHttpResponse').disabled = false;
    document.getElementById('formatHttpResponse').disabled = false;
    
    // 保存到历史记录
    saveToHistory({
      method,
      url,
      headers: allHeaders,
      body,
      status: response.status,
      statusText: response.statusText,
      duration,
      timestamp: Date.now()
    });
    
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    metaDiv.innerHTML = `
      <span class="http-status status-error">请求失败</span>
      <span class="http-time">⏱️ ${duration}ms</span>
    `;
    
    responseDiv.innerHTML = `
      <div class="http-error">
        <div class="error-icon">❌</div>
        <div class="error-message">${escapeHtml(error.message)}</div>
        <div class="error-hint">可能原因：网络错误、URL 无效、服务器拒绝连接</div>
      </div>
    `;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function parseJwtToken() {
  const token = document.getElementById('bearerToken').value.trim();
  const infoDiv = document.getElementById('jwtInfo');
  
  if (!token) {
    infoDiv.style.display = 'none';
    return;
  }
  
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('无效的 JWT 格式');
    }
    
    // 解码 Header 和 Payload
    const header = JSON.parse(atob(parts[0]));
    const payload = JSON.parse(atob(parts[1]));
    
    // 检查过期时间
    let expStatus = '';
    if (payload.exp) {
      const expDate = new Date(payload.exp * 1000);
      const now = new Date();
      const diff = expDate - now;
      
      if (diff > 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        expStatus = `<span class="jwt-valid">✅ 有效 (剩余 ${hours}h ${minutes}m)</span>`;
      } else {
        const hoursAgo = Math.floor(-diff / (1000 * 60 * 60));
        expStatus = `<span class="jwt-expired">❌ 已过期 (${hoursAgo}小时前)</span>`;
      }
    }
    
    // 格式化时间戳字段
    const formatTimestamp = (ts) => {
      if (!ts) return '';
      return new Date(ts * 1000).toLocaleString('zh-CN');
    };
    
    infoDiv.innerHTML = `
      <div class="jwt-section">
        <div class="jwt-section-title">📋 Header</div>
        <pre>${JSON.stringify(header, null, 2)}</pre>
      </div>
      <div class="jwt-section">
        <div class="jwt-section-title">📦 Payload</div>
        <pre>${JSON.stringify(payload, null, 2)}</pre>
        ${payload.iat ? `<div class="jwt-time">🕐 签发时间: ${formatTimestamp(payload.iat)}</div>` : ''}
        ${payload.timestamp ? `<div class="jwt-time">🕐 时间戳: ${formatTimestamp(payload.timestamp)}</div>` : ''}
        ${payload.exp ? `<div class="jwt-time">⏰ 过期时间: ${formatTimestamp(payload.exp)}</div>` : ''}
        ${expStatus ? `<div class="jwt-status">${expStatus}</div>` : ''}
      </div>
    `;
    infoDiv.style.display = 'block';
    
  } catch (error) {
    infoDiv.innerHTML = `<div class="jwt-error">❌ 解析失败: ${error.message}</div>`;
    infoDiv.style.display = 'block';
  }
}

// ===== JWT 环境配置 =====

// 默认配置
const DEFAULT_JWT_CONFIGS = {
  live: {
    account: 'mgmt_app',
    secret: 'hZl.`xjR=0XUphtTf&uf)|K)Fo|/&-m',
    country: ''
  },
  test: {
    account: 'test_project_account',
    secret: 'test10010',
    country: ''
  }
};

// 当前选中的环境
let currentJwtEnv = 'live';
// JWT 配置缓存
let jwtConfigs = { ...DEFAULT_JWT_CONFIGS };

// 加载 JWT 配置
function loadJwtConfigs() {
  chrome.storage.local.get(['jwtConfigs'], function(result) {
    if (result.jwtConfigs) {
      jwtConfigs = result.jwtConfigs;
    }
    // 显示当前环境的配置
    displayJwtConfig(currentJwtEnv);
  });
}

// 显示指定环境的配置
function displayJwtConfig(env) {
  const config = jwtConfigs[env] || DEFAULT_JWT_CONFIGS[env];
  document.getElementById('jwtAccount').value = config.account || '';
  document.getElementById('jwtSecret').value = config.secret || '';
  document.getElementById('jwtCountry').value = config.country || '';
}

// 切换 JWT 环境
function switchJwtEnv(env) {
  currentJwtEnv = env;
  
  // 更新 Tab 样式
  document.querySelectorAll('.jwt-env-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.env === env);
  });
  
  // 显示对应配置
  displayJwtConfig(env);
}

// 切换配置面板显示
function toggleJwtConfigPanel() {
  const panel = document.getElementById('jwtConfigPanel');
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? 'block' : 'none';
  document.getElementById('toggleJwtConfig').textContent = isHidden ? '⬆️' : '⚙️';
}

// 切换密钥可见性
function toggleSecretVisibility() {
  const secretInput = document.getElementById('jwtSecret');
  const btn = document.getElementById('toggleSecretVisibility');
  if (secretInput.type === 'password') {
    secretInput.type = 'text';
    btn.textContent = '🙈';
  } else {
    secretInput.type = 'password';
    btn.textContent = '👁️';
  }
}

// 保存当前环境的 JWT 配置
function saveJwtEnvConfig() {
  const config = {
    account: document.getElementById('jwtAccount').value.trim(),
    secret: document.getElementById('jwtSecret').value,
    country: document.getElementById('jwtCountry').value.trim()
  };
  
  if (!config.account || !config.secret) {
    showHttpToast('❌ Account 和 Secret 不能为空');
    return;
  }
  
  jwtConfigs[currentJwtEnv] = config;
  chrome.storage.local.set({ jwtConfigs: jwtConfigs });
  
  const envName = currentJwtEnv === 'live' ? 'Live' : 'Test';
  showHttpToast(`✅ ${envName} 配置已保存`);
}

// 重置当前环境为默认配置
function resetJwtEnvConfig() {
  jwtConfigs[currentJwtEnv] = { ...DEFAULT_JWT_CONFIGS[currentJwtEnv] };
  chrome.storage.local.set({ jwtConfigs: jwtConfigs });
  displayJwtConfig(currentJwtEnv);
  
  const envName = currentJwtEnv === 'live' ? 'Live' : 'Test';
  showHttpToast(`🔄 ${envName} 配置已重置为默认值`);
}

// 应用 JWT 预设（Live 或 Test）
async function applyJwtPreset(env) {
  try {
    const config = jwtConfigs[env] || DEFAULT_JWT_CONFIGS[env];
    
    if (!config.account || !config.secret) {
      showHttpToast(`❌ ${env === 'live' ? 'Live' : 'Test'} 配置不完整，请先配置`);
      return;
    }
    
    // 生成 JWT
    const jwt = await generateJwtWithConfig(config);
    
    // 确保 Auth 类型为 None（使用 Headers 方式）
    document.getElementById('authType').value = 'none';
    document.querySelectorAll('.auth-section').forEach(s => s.style.display = 'none');
    
    // 添加或更新 jwt-token Header
    addOrUpdateHeader('jwt-token', jwt);
    
    // 保存配置
    saveHttpConfig();
    
    // 显示成功提示
    const envName = env === 'live' ? '🟢 Live' : '🟡 Test';
    showHttpToast(`✅ ${envName} jwt-token 已生成`);
    
  } catch (error) {
    console.error('JWT 生成失败:', error);
    showHttpToast('❌ 生成失败: ' + error.message);
  }
}

// 使用指定配置生成 JWT
async function generateJwtWithConfig(config) {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
    account: config.account
  };
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    timestamp: now
  };
  
  // 如果有 country，添加到 payload
  if (config.country) {
    payload.country = config.country;
  }
  
  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${headerEncoded}.${payloadEncoded}`;
  const signature = await hmacSha256(config.secret, signatureInput);
  
  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

// 添加或更新 Header
function addOrUpdateHeader(key, value) {
  const headersList = document.getElementById('httpHeadersList');
  let headerExists = false;
  
  headersList.querySelectorAll('.http-header-row').forEach(row => {
    const keyInput = row.querySelector('.header-key');
    if (keyInput && keyInput.value.toLowerCase() === key.toLowerCase()) {
      row.querySelector('.header-value').value = value;
      headerExists = true;
    }
  });
  
  if (!headerExists) {
    const newRow = document.createElement('div');
    newRow.className = 'http-header-row';
    newRow.innerHTML = `
      <input type="text" class="header-key" placeholder="Header Name" value="${escapeHtml(key)}">
      <input type="text" class="header-value" placeholder="Header Value" value="${escapeHtml(value)}">
      <button class="btn-icon remove-header" title="删除">🗑️</button>
    `;
    headersList.appendChild(newRow);
    
    newRow.querySelector('.header-key').addEventListener('input', saveHttpConfig);
    newRow.querySelector('.header-value').addEventListener('input', saveHttpConfig);
  }
}

// 清除认证预设
function clearAuthPreset() {
  // 重置 Auth 类型
  document.getElementById('authType').value = 'none';
  document.querySelectorAll('.auth-section').forEach(s => s.style.display = 'none');
  
  // 清空 Auth 相关输入
  document.getElementById('bearerToken').value = '';
  document.getElementById('basicUsername').value = '';
  document.getElementById('basicPassword').value = '';
  document.getElementById('apiKeyName').value = 'X-API-Key';
  document.getElementById('apiKeyValue').value = '';
  document.getElementById('jwtInfo').style.display = 'none';
  
  // 移除 Headers 中的认证相关项
  const headersList = document.getElementById('httpHeadersList');
  const authHeaderKeys = ['jwt-token', 'authorization', 'x-api-key'];
  
  headersList.querySelectorAll('.http-header-row').forEach(row => {
    const keyInput = row.querySelector('.header-key');
    if (keyInput && authHeaderKeys.includes(keyInput.value.toLowerCase())) {
      row.remove();
    }
  });
  
  // 保存配置
  saveHttpConfig();
  
  showHttpToast('🧹 认证配置已清除');
}

// 显示 HTTP 工具提示
function showHttpToast(message) {
  // 检查是否已有 toast
  let toast = document.querySelector('.http-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'http-toast';
    document.body.appendChild(toast);
  }
  
  toast.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// 生成 ApiMart JWT Token（返回 token 字符串）
async function generateApiMartJwtToken() {
  const account = 'mgmt_app';
  const secret = 'hZl.`xjR=0XUphtTf&uf)|K)Fo|/&-m';
  
  const header = {
    alg: 'HS256',
    typ: 'JWT',
    account: account
  };
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    timestamp: now
  };
  
  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${headerEncoded}.${payloadEncoded}`;
  const signature = await hmacSha256(secret, signatureInput);
  
  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

// ===== ApiMart JWT 生成 =====
// Base64URL 编码
function base64UrlEncode(str) {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// HMAC-SHA256 签名（使用 Web Crypto API）
async function hmacSha256(key, message) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  
  // 转换为 Base64URL
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return base64UrlEncode(binary);
}

// 生成 ApiMart JWT Token
async function generateApiMartJwt() {
  const infoDiv = document.getElementById('jwtInfo');
  const tokenInput = document.getElementById('bearerToken');
  
  try {
    // ApiMart 配置
    const account = 'mgmt_app';
    const secret = 'hZl.`xjR=0XUphtTf&uf)|K)Fo|/&-m';
    
    // Header
    const header = {
      alg: 'HS256',
      typ: 'JWT',
      account: account
    };
    
    // Payload
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      timestamp: now
    };
    
    // 编码 Header 和 Payload
    const headerEncoded = base64UrlEncode(JSON.stringify(header));
    const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
    
    // 生成签名
    const signatureInput = `${headerEncoded}.${payloadEncoded}`;
    const signature = await hmacSha256(secret, signatureInput);
    
    // 组合 JWT
    const jwt = `${headerEncoded}.${payloadEncoded}.${signature}`;
    
    // 填入 Token 输入框
    tokenInput.value = jwt;
    
    // 保存配置
    saveHttpConfig();
    
    // 显示成功信息
    infoDiv.innerHTML = `
      <div class="jwt-success">
        <div class="jwt-success-icon">✅</div>
        <div class="jwt-success-text">ApiMart Token 生成成功！</div>
        <div class="jwt-success-info">
          <div>🏢 Account: ${account}</div>
          <div>🕐 时间戳: ${new Date(now * 1000).toLocaleString('zh-CN')}</div>
        </div>
      </div>
    `;
    infoDiv.style.display = 'block';
    
    // 自动添加 jwt-token Header（如果不存在）
    const headersList = document.getElementById('httpHeadersList');
    let hasJwtHeader = false;
    headersList.querySelectorAll('.http-header-row').forEach(row => {
      const key = row.querySelector('.header-key').value.toLowerCase();
      if (key === 'jwt-token') {
        row.querySelector('.header-value').value = jwt;
        hasJwtHeader = true;
      }
    });
    
    if (!hasJwtHeader) {
      // 添加 jwt-token Header
      const newRow = document.createElement('div');
      newRow.className = 'http-header-row';
      newRow.innerHTML = `
        <input type="text" class="header-key" placeholder="Header Name" value="jwt-token">
        <input type="text" class="header-value" placeholder="Header Value" value="${jwt}">
        <button class="btn-icon remove-header" title="删除">🗑️</button>
      `;
      headersList.appendChild(newRow);
      
      // 绑定事件
      newRow.querySelector('.header-key').addEventListener('input', saveHttpConfig);
      newRow.querySelector('.header-value').addEventListener('input', saveHttpConfig);
    }
    
    // 保存配置
    saveHttpConfig();
    
  } catch (error) {
    console.error('JWT 生成失败:', error);
    infoDiv.innerHTML = `<div class="jwt-error">❌ 生成失败: ${error.message}</div>`;
    infoDiv.style.display = 'block';
  }
}

function copyHttpResponse() {
  const responseContent = document.querySelector('.http-response-content');
  if (responseContent) {
    navigator.clipboard.writeText(responseContent.textContent).then(() => {
      const btn = document.getElementById('copyHttpResponse');
      btn.textContent = '✅ 已复制';
      setTimeout(() => { btn.textContent = '📋 复制响应'; }, 2000);
    });
  }
}

function formatHttpResponse() {
  const responseContent = document.querySelector('.http-response-content');
  if (responseContent) {
    try {
      const json = JSON.parse(responseContent.textContent);
      responseContent.textContent = JSON.stringify(json, null, 2);
    } catch (e) {
      alert('响应内容不是有效的 JSON');
    }
  }
}

function loadHttpHistory() {
  chrome.storage.local.get(['httpHistory'], function(result) {
    httpHistory = result.httpHistory || [];
    renderHttpHistory();
  });
}

function saveToHistory(request) {
  httpHistory.unshift(request);
  // 只保留最近 20 条
  if (httpHistory.length > 20) {
    httpHistory = httpHistory.slice(0, 20);
  }
  chrome.storage.local.set({ httpHistory: httpHistory });
  renderHttpHistory();
}

function renderHttpHistory() {
  const listDiv = document.getElementById('httpHistoryList');
  
  if (httpHistory.length === 0) {
    listDiv.innerHTML = '<div class="http-history-empty">暂无历史记录</div>';
    return;
  }
  
  listDiv.innerHTML = httpHistory.map((item, index) => {
    const methodClass = `method-${item.method.toLowerCase()}`;
    const statusClass = item.status >= 200 && item.status < 300 ? 'status-success' : 'status-error';
    const time = new Date(item.timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // 截取 URL 显示
    let displayUrl = item.url;
    try {
      const urlObj = new URL(item.url);
      displayUrl = urlObj.pathname + urlObj.search;
      if (displayUrl.length > 40) {
        displayUrl = displayUrl.substring(0, 40) + '...';
      }
    } catch (e) {
      if (displayUrl.length > 40) {
        displayUrl = displayUrl.substring(0, 40) + '...';
      }
    }
    
    return `
      <div class="http-history-item" data-index="${index}">
        <span class="history-method ${methodClass}">${item.method}</span>
        <span class="history-url" title="${escapeHtml(item.url)}">${escapeHtml(displayUrl)}</span>
        <span class="history-status ${statusClass}">${item.status}</span>
        <span class="history-time">${time}</span>
      </div>
    `;
  }).join('');
}

function loadFromHistory(index) {
  const item = httpHistory[index];
  if (!item) return;
  
  // 填充 URL 和方法
  document.getElementById('httpMethod').value = item.method;
  document.getElementById('httpUrl').value = item.url;
  
  // 填充 Body
  document.getElementById('httpBody').value = item.body || '';
  
  // 重置 Auth 状态
  document.getElementById('authType').value = 'none';
  document.getElementById('bearerToken').value = '';
  document.getElementById('basicUsername').value = '';
  document.getElementById('basicPassword').value = '';
  document.getElementById('apiKeyName').value = 'X-API-Key';
  document.getElementById('apiKeyValue').value = '';
  document.querySelectorAll('.auth-section').forEach(s => s.style.display = 'none');
  document.getElementById('jwtInfo').style.display = 'none';
  
  // 填充 Headers
  const headersList = document.getElementById('httpHeadersList');
  headersList.innerHTML = '';
  
  let hasAuthHeader = false;
  
  if (item.headers && Object.keys(item.headers).length > 0) {
    Object.entries(item.headers).forEach(([key, value]) => {
      const keyLower = key.toLowerCase();
      
      // 处理 Authorization Header
      if (keyLower === 'authorization') {
        hasAuthHeader = true;
        if (value.startsWith('Bearer ')) {
          document.getElementById('authType').value = 'bearer';
          document.getElementById('bearerToken').value = value.replace('Bearer ', '');
          document.getElementById('auth-bearer').style.display = 'block';
        } else if (value.startsWith('Basic ')) {
          document.getElementById('authType').value = 'basic';
          try {
            const decoded = atob(value.replace('Basic ', ''));
            const colonIndex = decoded.indexOf(':');
            if (colonIndex > -1) {
              document.getElementById('basicUsername').value = decoded.substring(0, colonIndex);
              document.getElementById('basicPassword').value = decoded.substring(colonIndex + 1);
            }
          } catch (e) {
            console.error('Basic Auth 解码失败:', e);
          }
          document.getElementById('auth-basic').style.display = 'block';
        }
        return; // 不添加到 Headers 列表
      }
      
      // 添加到 Headers 列表（jwt-token 等自定义 Header 直接作为普通 Header 处理）
      const newRow = document.createElement('div');
      newRow.className = 'http-header-row';
      newRow.innerHTML = `
        <input type="text" class="header-key" placeholder="Header Name" value="${escapeHtml(key)}">
        <input type="text" class="header-value" placeholder="Header Value" value="${escapeHtml(value)}">
        <button class="btn-icon remove-header" title="删除">🗑️</button>
      `;
      headersList.appendChild(newRow);
      
      // 绑定输入事件
      newRow.querySelector('.header-key').addEventListener('input', saveHttpConfig);
      newRow.querySelector('.header-value').addEventListener('input', saveHttpConfig);
    });
  }
  
  // 如果没有 Headers，添加默认的 Content-Type
  if (headersList.children.length === 0) {
    const defaultRow = document.createElement('div');
    defaultRow.className = 'http-header-row';
    defaultRow.innerHTML = `
      <input type="text" class="header-key" placeholder="Header Name" value="Content-Type">
      <input type="text" class="header-value" placeholder="Header Value" value="application/json">
      <button class="btn-icon remove-header" title="删除">🗑️</button>
    `;
    headersList.appendChild(defaultRow);
    defaultRow.querySelector('.header-key').addEventListener('input', saveHttpConfig);
    defaultRow.querySelector('.header-value').addEventListener('input', saveHttpConfig);
  }
  
  // 保存当前配置
  saveHttpConfig();
}

function clearHttpHistory() {
  if (confirm('确定要清空所有历史记录吗？')) {
    httpHistory = [];
    chrome.storage.local.set({ httpHistory: [] });
    renderHttpHistory();
  }
}

// 保存 HTTP 配置
function saveHttpConfig() {
  const config = {
    method: document.getElementById('httpMethod').value,
    url: document.getElementById('httpUrl').value,
    body: document.getElementById('httpBody').value,
    authType: document.getElementById('authType').value,
    bearerToken: document.getElementById('bearerToken').value,
    basicUsername: document.getElementById('basicUsername').value,
    basicPassword: document.getElementById('basicPassword').value,
    apiKeyName: document.getElementById('apiKeyName').value,
    apiKeyValue: document.getElementById('apiKeyValue').value,
    headers: []
  };
  
  // 保存 Headers
  document.querySelectorAll('.http-header-row').forEach(row => {
    const key = row.querySelector('.header-key').value;
    const value = row.querySelector('.header-value').value;
    config.headers.push({ key, value });
  });
  
  chrome.storage.local.set({ httpConfig: config });
}

// 加载 HTTP 配置
function loadHttpConfig() {
  chrome.storage.local.get(['httpConfig'], function(result) {
    const config = result.httpConfig;
    if (!config) return;
    
    // 恢复基本配置
    if (config.method) document.getElementById('httpMethod').value = config.method;
    if (config.url) document.getElementById('httpUrl').value = config.url;
    if (config.body) document.getElementById('httpBody').value = config.body;
    
    // 恢复认证配置
    if (config.authType) {
      document.getElementById('authType').value = config.authType;
      // 触发认证类型切换
      document.querySelectorAll('.auth-section').forEach(section => {
        section.style.display = 'none';
      });
      if (config.authType !== 'none') {
        const authSection = document.getElementById(`auth-${config.authType}`);
        if (authSection) authSection.style.display = 'block';
      }
    }
    if (config.bearerToken) document.getElementById('bearerToken').value = config.bearerToken;
    if (config.basicUsername) document.getElementById('basicUsername').value = config.basicUsername;
    if (config.basicPassword) document.getElementById('basicPassword').value = config.basicPassword;
    if (config.apiKeyName) document.getElementById('apiKeyName').value = config.apiKeyName;
    if (config.apiKeyValue) document.getElementById('apiKeyValue').value = config.apiKeyValue;
    
    // 恢复 Headers
    if (config.headers && config.headers.length > 0) {
      const headersList = document.getElementById('httpHeadersList');
      headersList.innerHTML = '';
      
      config.headers.forEach(header => {
        const newRow = document.createElement('div');
        newRow.className = 'http-header-row';
        newRow.innerHTML = `
          <input type="text" class="header-key" placeholder="Header Name" value="${escapeHtml(header.key || '')}">
          <input type="text" class="header-value" placeholder="Header Value" value="${escapeHtml(header.value || '')}">
          <button class="btn-icon remove-header" title="删除">🗑️</button>
        `;
        headersList.appendChild(newRow);
        
        // 绑定输入事件以保存配置
        newRow.querySelector('.header-key').addEventListener('input', saveHttpConfig);
        newRow.querySelector('.header-value').addEventListener('input', saveHttpConfig);
      });
    }
  });
}

// 清除 HTTP 配置
function clearHttpConfig() {
  if (confirm('确定要清除当前配置吗？')) {
    // 清空表单
    document.getElementById('httpMethod').value = 'GET';
    document.getElementById('httpUrl').value = '';
    document.getElementById('httpBody').value = '';
    document.getElementById('authType').value = 'none';
    document.getElementById('bearerToken').value = '';
    document.getElementById('basicUsername').value = '';
    document.getElementById('basicPassword').value = '';
    document.getElementById('apiKeyName').value = 'X-API-Key';
    document.getElementById('apiKeyValue').value = '';
    
    // 隐藏所有认证面板
    document.querySelectorAll('.auth-section').forEach(section => {
      section.style.display = 'none';
    });
    
    // 重置 Headers
    document.getElementById('httpHeadersList').innerHTML = `
      <div class="http-header-row">
        <input type="text" class="header-key" placeholder="Header Name" value="Content-Type">
        <input type="text" class="header-value" placeholder="Header Value" value="application/json">
        <button class="btn-icon remove-header" title="删除">🗑️</button>
      </div>
    `;
    
    // 重新绑定 Header 输入事件
    document.querySelector('.http-header-row .header-key').addEventListener('input', saveHttpConfig);
    document.querySelector('.http-header-row .header-value').addEventListener('input', saveHttpConfig);
    
    // 清空响应区域
    document.getElementById('httpResponse').innerHTML = `
      <div class="http-response-placeholder">
        <span class="placeholder-icon">📡</span>
        <span class="placeholder-text">发送请求后在此显示响应</span>
      </div>
    `;
    document.getElementById('httpResponseMeta').innerHTML = '';
    document.getElementById('copyHttpResponse').disabled = true;
    document.getElementById('formatHttpResponse').disabled = true;
    
    // 清除存储的配置
    chrome.storage.local.remove('httpConfig');
  }
}

// ===== 今日日程工具 =====
let calendarAccessToken = null;
const CALENDAR_CLIENT_ID = '72278918032-km42j88dalsp3ojcnrm4ug8novn2610a.apps.googleusercontent.com';

function initCalendarTool() {
  const authorizeBtn = document.getElementById('authorizeCalendar');
  const refreshBtn = document.getElementById('refreshEvents');
  const retryBtn = document.getElementById('retryCalendar');
  const configBtn = document.getElementById('configCalendar');
  const openTodoDetailBtn = document.getElementById('openTodoDetail');

  if (authorizeBtn) {
    authorizeBtn.addEventListener('click', authorizeGoogleCalendar);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadTodayEvents);
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', loadTodayEvents);
  }

  if (configBtn) {
    configBtn.addEventListener('click', openConfigPage);
  }

  if (openTodoDetailBtn) {
    openTodoDetailBtn.addEventListener('click', () => {
      // 切换到代办事项标签
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
      
      const todoTab = document.querySelector('[data-tab="todos"]');
      const todoPane = document.getElementById('todos-tab');
      
      if (todoTab) todoTab.classList.add('active');
      if (todoPane) todoPane.classList.add('active');
    });
  }

  // 直接尝试加载日程和代办
  checkAuthAndLoadEvents();
  loadMiniTodoBoard();
}

function loadCalendarConfig() {
  // Client ID 已硬编码，直接尝试加载
  console.log('📋 使用硬编码的 Client ID:', CALENDAR_CLIENT_ID);
  checkAuthAndLoadEvents();
}

function showConfigPrompt() {
  hideAll();
  const authSection = document.getElementById('calendarAuthSection');
  authSection.innerHTML = `
    <div class="auth-icon">⚙️</div>
    <h3>配置信息</h3>
    <p>Client ID 已配置完成</p>
    <p>扩展 ID: ${chrome.runtime.id}</p>
    <button id="openConfigBtn" class="btn btn-secondary">⚙️ 查看配置详情</button>
  `;
  authSection.style.display = 'block';
  
  document.getElementById('openConfigBtn').addEventListener('click', openConfigPage);
}

function openConfigPage() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('calendar-config.html')
  });
}

async function checkAuthAndLoadEvents() {
  try {
    // 检查 API 可用性
    if (!chrome.identity || !chrome.identity.getAuthToken) {
      throw new Error('Identity API 不可用');
    }
    
    // 尝试静默获取token
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError) {
        console.log('需要授权:', chrome.runtime.lastError);
        showAuthSection();
        return;
      }
      
      if (token) {
        calendarAccessToken = token;
        loadTodayEvents();
      } else {
        showAuthSection();
      }
    });
  } catch (error) {
    console.log('需要授权:', error);
    showAuthSection();
  }
}

function authorizeGoogleCalendar() {
  try {
    // 检查 API 可用性
    if (!chrome.identity || !chrome.identity.getAuthToken) {
      showError('Identity API 不可用，请检查 manifest.json 中的 oauth2 配置是否正确');
      return;
    }
    
    showLoading();
    
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        console.error('授权失败:', chrome.runtime.lastError);
        showError('授权失败: ' + chrome.runtime.lastError.message + '\n\n请确保已在 manifest.json 中配置正确的 client_id');
        return;
      }
      
      if (token) {
        calendarAccessToken = token;
        console.log('授权成功');
        loadTodayEvents();
      } else {
        showError('未获取到授权令牌');
      }
    });
  } catch (error) {
    console.error('授权过程出错:', error);
    showError('授权失败: ' + error.message);
  }
}

async function loadTodayEvents() {
  if (!calendarAccessToken) {
    showAuthSection();
    return;
  }
  
  try {
    showLoading();
    
    // 获取今天的开始和结束时间
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const timeMin = today.toISOString();
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const timeMax = tomorrow.toISOString();
    
    // 调用 Google Calendar API
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(timeMin)}&` +
      `timeMax=${encodeURIComponent(timeMax)}&` +
      `orderBy=startTime&` +
      `singleEvents=true`,
      {
        headers: {
          'Authorization': `Bearer ${calendarAccessToken}`
        }
      }
    );
    
    if (!response.ok) {
      if (response.status === 401) {
        // Token过期，重新授权
        calendarAccessToken = null;
        if (chrome.identity && chrome.identity.removeCachedAuthToken) {
          chrome.identity.removeCachedAuthToken({ token: calendarAccessToken }, () => {
            showAuthSection();
          });
        } else {
          showAuthSection();
        }
        return;
      }
      throw new Error(`API错误: ${response.status}`);
    }
    
    const data = await response.json();
    // 过滤掉全天事件，只显示有具体时间的日程
    const eventsWithTime = (data.items || []).filter(event => event.start.dateTime);
    displayEvents(eventsWithTime);
    
  } catch (error) {
    console.error('加载日程失败:', error);
    showError('加载日程失败: ' + error.message);
  }
}

function displayEvents(events) {
  const listDiv = document.getElementById('calendarEventsList');
  hideAll();
  
  if (events.length === 0) {
    listDiv.innerHTML = `
      <div class="no-events">
        <div class="no-events-icon">📅</div>
        <p>今天没有安排的日程</p>
      </div>
    `;
    listDiv.style.display = 'block';
    return;
  }
  
  const now = new Date();
  let pastEventsHtml = '';
  let currentAndFutureEventsHtml = '';
  let pastEventCount = 0;
  
  events.forEach((event, index) => {
    const startTime = event.start.dateTime || event.start.date;
    const endTime = event.end.dateTime || event.end.date;
    
    // 格式化时间
    let timeStr = '';
    let isOngoing = false;
    let isPast = false;
    
    if (event.start.dateTime) {
      const start = new Date(startTime);
      const end = new Date(endTime);
      timeStr = `${formatTime(start)} - ${formatTime(end)}`;
      
      // 判断事件状态
      isOngoing = now >= start && now < end;
      isPast = now >= end;
    } else {
      timeStr = '全天';
    }
    
    // 处理换行符
    const description = event.description ? event.description.replace(/\n/g, '<br>') : '';
    
    const eventHtml = `
      <div class="event-item ${isOngoing ? 'event-ongoing' : ''} ${isPast ? 'event-past' : ''}">
        <div class="event-time-badge ${isOngoing ? 'ongoing' : ''}">${timeStr}</div>
        <div class="event-details">
          <div class="event-title">
            ${isOngoing ? '<span class="ongoing-indicator">🔴 进行中</span> ' : ''}
            ${escapeHtml(event.summary || '(无标题)')}
          </div>
          ${description ? `<div class="event-description">${escapeHtml(description).replace(/&lt;br&gt;/g, '<br>')}</div>` : ''}
          ${event.location ? `<div class="event-location">📍 ${escapeHtml(event.location)}</div>` : ''}
          ${event.hangoutLink ? `<a href="${event.hangoutLink}" target="_blank" class="event-link">🎥 加入会议</a>` : ''}
          ${event.htmlLink ? `<a href="${event.htmlLink}" target="_blank" class="event-link">在 Calendar 中查看</a>` : ''}
        </div>
      </div>
    `;
    
    if (isPast) {
      pastEventsHtml += eventHtml;
      pastEventCount++;
    } else {
      currentAndFutureEventsHtml += eventHtml;
    }
  });
  
  let html = '';
  
  // 添加已过期事件（可折叠，默认折叠）
  if (pastEventCount > 0) {
    html += `
      <div class="past-events-section">
        <div class="past-events-header" id="pastEventsHeader">
          <span class="past-events-toggle" id="pastEventsToggle">▶</span>
          <span class="past-events-title">已结束的日程 (${pastEventCount})</span>
        </div>
        <div class="past-events-content" id="pastEventsContent" style="display: none;">
          ${pastEventsHtml}
        </div>
      </div>
    `;
  }
  
  // 添加当前和未来事件
  html += currentAndFutureEventsHtml;
  
  listDiv.innerHTML = html;
  listDiv.style.display = 'block';
  
  // 绑定折叠/展开事件
  const pastEventsHeader = document.getElementById('pastEventsHeader');
  if (pastEventsHeader) {
    pastEventsHeader.addEventListener('click', togglePastEvents);
  }
}

// 切换已过期事件的显示/隐藏
function togglePastEvents() {
  const content = document.getElementById('pastEventsContent');
  const toggle = document.getElementById('pastEventsToggle');
  
  if (content.style.display === 'none') {
    content.style.display = 'block';
    toggle.textContent = '▼';
  } else {
    content.style.display = 'none';
    toggle.textContent = '▶';
  }
}

function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function showAuthSection() {
  hideAll();
  document.getElementById('calendarAuthSection').style.display = 'block';
}

function showLoading() {
  hideAll();
  document.getElementById('calendarLoading').style.display = 'block';
}

function showError(message) {
  hideAll();
  const errorDiv = document.getElementById('calendarError');
  document.getElementById('calendarErrorMessage').textContent = message;
  errorDiv.style.display = 'block';
}

function hideAll() {
  document.getElementById('calendarAuthSection').style.display = 'none';
  document.getElementById('calendarLoading').style.display = 'none';
  document.getElementById('calendarEventsList').style.display = 'none';
  document.getElementById('calendarError').style.display = 'none';
}

// ===== 时区转换 =====
const TIMEZONES = {
  sg: { zone: 'Asia/Singapore', name: 'Singapore' },
  vn: { zone: 'Asia/Ho_Chi_Minh', name: 'Vietnam' },
  id: { zone: 'Asia/Jakarta', name: 'Indonesia' },
  my: { zone: 'Asia/Kuala_Lumpur', name: 'Malaysia' },
  ph: { zone: 'Asia/Manila', name: 'Philippines' },
  th: { zone: 'Asia/Bangkok', name: 'Thailand' },
  cn: { zone: 'Asia/Shanghai', name: 'China' },
  br: { zone: 'America/Sao_Paulo', name: 'Brazil' }
};

function initTimezone() {
  setCurrentTimestamp();
  
  // 反向转换 - 当前时间按钮
  document.getElementById('setNow').addEventListener('click', function() {
    const now = new Date();
    document.getElementById('datetimeInput').value = formatDateTimeForInput(now);
  });
}

function formatDateTimeForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function setCurrentTimestamp() {
  const now = Math.floor(Date.now() / 1000);
  document.getElementById('timestampInput').value = now;
  convertTimestamp();
}

function convertTimestamp() {
  const timestamp = parseInt(document.getElementById('timestampInput').value);
  
  if (!timestamp || timestamp < 0) {
    return;
  }
  
  const date = new Date(timestamp * 1000);
  
  Object.keys(TIMEZONES).forEach(key => {
    const tz = TIMEZONES[key];
    const formatted = date.toLocaleString('zh-CN', {
      timeZone: tz.zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    document.getElementById(`tz-${key}`).textContent = formatted;
  });
  
  // 绑定复制按钮
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', function() {
      const tzKey = this.dataset.tz;
      const value = document.getElementById(`tz-${tzKey}`).textContent;
      copyToClipboard(value);
      this.textContent = '✅';
      setTimeout(() => { this.textContent = '复制'; }, 2000);
    });
  });
}

function convertToTimestamp() {
  const datetimeInput = document.getElementById('datetimeInput').value.trim();
  const timezone = document.getElementById('fromTimezone').value;
  
  if (!datetimeInput) {
    alert('请输入日期时间');
    return;
  }
  
  // 解析用户输入的日期时间 (支持格式: YYYY-MM-DD HH:MM:SS 或 YYYY-MM-DD HH:MM)
  const datePattern = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/;
  const match = datetimeInput.match(datePattern);
  
  if (!match) {
    alert('日期格式不正确，请使用格式: 2025-11-14 16:30:00');
    return;
  }
  
  const [, year, month, day, hour, minute, second = '0'] = match;
  const dateString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`;
  
  const date = new Date(dateString);
  const timestamp = Math.floor(date.getTime() / 1000);
  
  document.getElementById('timestampResult').innerHTML = `
    <div style="font-size: 14px; font-weight: bold; color: #667eea;">时间戳: ${timestamp}</div>
    <div style="font-size: 12px; color: #666; margin-top: 5px;">时区: ${timezone}</div>
  `;
}

// ===== Code Helper - LLM对话功能 =====
let chatHistory = [];

function initCodeHelper() {
  // 加载聊天历史
  loadChatHistory();
  
  // 恢复输入框内容
  restoreChatInput();
  
  // 获取元素
  const sendBtn = document.getElementById('sendMessage');
  const chatInput = document.getElementById('chatInput');
  const clearBtn = document.getElementById('clearChat');
  
  // 检查元素是否存在
  if (!sendBtn || !chatInput || !clearBtn) {
    console.error('Code Helper 元素未找到:', {
      sendBtn: !!sendBtn,
      chatInput: !!chatInput,
      clearBtn: !!clearBtn
    });
    return;
  }
  
  // 发送消息
  sendBtn.addEventListener('click', function() {
    sendMessage();
  });
  
  // 回车发送（Shift+Enter换行）
  chatInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // 保存输入框内容（实时保存）
  chatInput.addEventListener('input', function() {
    saveChatInput(this.value);
  });
  
  // 清空对话
  clearBtn.addEventListener('click', function() {
    if (confirm('确定要清空对话历史吗？')) {
      chatHistory = [];
      saveChatHistory();
      renderChatMessages();
      // 清空thread_id，让下次对话使用新的thread
      chrome.storage.local.remove('threadId');
    }
  });
  
  console.log('✅ Code Helper 初始化完成');
}

// 删除配置加载函数，不再需要
// function loadLLMConfig() { ... }

function loadChatHistory() {
  chrome.storage.local.get(['chatHistory'], function(result) {
    chatHistory = result.chatHistory || [];
    renderChatMessages();
  });
}

function saveChatHistory() {
  chrome.storage.local.set({ chatHistory: chatHistory }, function() {
    if (chrome.runtime.lastError) {
      console.error('保存聊天历史失败:', chrome.runtime.lastError);
    } else {
      console.log('聊天历史已保存，共', chatHistory.length, '条消息');
    }
  });
}

// 保存输入框内容
function saveChatInput(content) {
  chrome.storage.local.set({ chatInputDraft: content });
}

// 恢复输入框内容
function restoreChatInput() {
  chrome.storage.local.get(['chatInputDraft'], function(result) {
    if (result.chatInputDraft) {
      const chatInput = document.getElementById('chatInput');
      if (chatInput) {
        chatInput.value = result.chatInputDraft;
        // 自动调整输入框高度
        chatInput.style.height = 'auto';
        chatInput.style.height = chatInput.scrollHeight + 'px';
      }
    }
  });
}

function renderChatMessages() {
  const container = document.getElementById('chatMessages');
  
  // 清空容器
  container.innerHTML = '';
  
  // 如果没有聊天历史，显示欢迎消息
  if (chatHistory.length === 0) {
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'chat-message assistant';
    welcomeDiv.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <div class="message-text">👋 你好！我是你的 <strong>智能工作助手</strong>

我可以帮你处理各种日常工作：

<strong>📊 数据开发</strong>
• SQL 编写、修复、优化（Presto/Spark/ClickHouse）
• 数据分析思路和方法

<strong>🌍 语言翻译</strong>
• 中英文互译、专业术语翻译
• 技术文档翻译润色

<strong>📝 文档处理</strong>
• Google Sheets 公式和脚本
• 文档撰写、总结、润色

<strong>💻 代码辅助</strong>
• Python、JavaScript 等代码问题
• 代码解释和优化建议

💬 有什么我可以帮你的？</div>
      </div>
    `;
    container.appendChild(welcomeDiv);
    return;
  }
  
  // 渲染聊天历史
  chatHistory.forEach(msg => {
    const messageEl = createMessageElement(msg.role, msg.content);
    container.appendChild(messageEl);
  });
  
  // 滚动到底部
  container.scrollTop = container.scrollHeight;
}

function createMessageElement(role, content) {
  const div = document.createElement('div');
  div.className = `chat-message ${role}`;
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? '👤' : '🤖';
  
  const messageContent = document.createElement('div');
  messageContent.className = 'message-content';
  
  const messageText = document.createElement('div');
  messageText.className = 'message-text';
  
  // 处理代码块显示
  messageText.innerHTML = formatMessage(content);
  
  messageContent.appendChild(messageText);
  div.appendChild(avatar);
  div.appendChild(messageContent);
  
  return div;
}

function formatMessage(text) {
  // 1. 处理代码块 ```language\ncode\n```
  text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, function(match, lang, code) {
    return '<pre>' + escapeHtml(code.trim()) + '</pre>';
  });
  
  // 2. 处理行内代码 `code`
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // 3. 处理标题 ## 或 **标题：**
  text = text.replace(/^##\s+(.+)$/gm, '<strong style="font-size: 15px; display: block; margin: 10px 0 5px 0;">$1</strong>');
  text = text.replace(/\*\*(.+?)[:：]\*\*/g, '<strong style="color: #667eea;">$1:</strong>');
  
  // 4. 处理加粗 **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // 5. 处理列表项 - item 或 • item
  text = text.replace(/^[\-•]\s+(.+)$/gm, '<div style="margin-left: 20px; margin-bottom: 4px;">• $1</div>');
  
  // 6. 保留换行（但不要给列表项加额外的br）
  text = text.replace(/\n/g, '<br>');
  
  return text;
}

// HTML转义函数，防止代码块中的HTML被解析
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (!message) return;
  
  // 添加用户消息
  chatHistory.push({
    role: 'user',
    content: message
  });
  
  // 清空输入框和草稿
  input.value = '';
  chrome.storage.local.remove('chatInputDraft');
  
  // 渲染消息
  renderChatMessages();
  
  // 显示加载状态
  const loadingEl = createLoadingMessage();
  document.getElementById('chatMessages').appendChild(loadingEl);
  document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
  
  try {
    // Smart Agent配置（直接内置）
    const SMART_CONFIG = {
      endpointHashId: 'oxff0svf5ht51i507t6k68d8',
      endpointKey: 'k160r2z9t0y0s573kt51o8vb',
      userId: 'spx_helper_user'
    };
    
    console.log('🔧 配置信息:', SMART_CONFIG);
    
    // 获取或创建thread_id
    const result = await chrome.storage.local.get(['threadId']);
    let threadId = result.threadId;
    if (!threadId) {
      threadId = 'thread_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      await chrome.storage.local.set({ threadId: threadId });
    }
    
    console.log('🔗 Thread ID:', threadId);
    
    // 准备请求数据 - Smart平台格式
    const requestData = {
      endpoint_deployment_hash_id: SMART_CONFIG.endpointHashId,
      endpoint_deployment_key: SMART_CONFIG.endpointKey,
      user_id: SMART_CONFIG.userId,
      message: {
        input_str: message,
        thread_id: threadId
      }
    };
    
    console.log('📤 发送请求数据:', JSON.stringify(requestData, null, 2));
    
    // 调用Smart Agent API
    const apiUrl = 'https://smart.shopee.io/apis/smart/v1/orchestrator/deployments/invoke';
    console.log('🌐 API地址:', apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    console.log('📥 HTTP状态:', response.status, response.statusText);
    
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
    }
    
    // 检查响应类型
    const contentType = response.headers.get('content-type');
    console.log('📋 Content-Type:', contentType);
    
    let assistantMessage = '';
    
    // 根据Content-Type决定如何解析
    if (contentType && contentType.includes('application/json')) {
      // JSON 响应
      const data = await response.json();
      console.log('Smart API完整响应(JSON):', JSON.stringify(data, null, 2));
      
      // 检查API是否返回成功
      if (data.status !== 'success') {
        throw new Error(`API请求失败: ${data.error_message || data.error || '未知错误'}`);
      }
      
      // 尝试各种可能的响应格式
      if (data.data && data.data.response && data.data.response.response_str) {
        // Smart平台标准格式: data.data.response.response_str
        assistantMessage = data.data.response.response_str;
      } else if (data.output && data.output.output_str) {
        assistantMessage = data.output.output_str;
      } else if (data.output && typeof data.output === 'string') {
        assistantMessage = data.output;
      } else if (data.result && data.result.output_str) {
        assistantMessage = data.result.output_str;
      } else if (data.response && typeof data.response === 'string') {
        assistantMessage = data.response;
      } else if (data.message) {
        assistantMessage = data.message;
      } else if (data.data && data.data.output_str) {
        assistantMessage = data.data.output_str;
      } else if (data.output) {
        // 如果output是对象，尝试提取文本
        assistantMessage = JSON.stringify(data.output, null, 2);
      } else {
        // 显示完整响应以便调试
        console.error('无法解析响应，完整数据:', data);
        throw new Error(`API返回数据格式不正确。\n\n返回数据: ${JSON.stringify(data).substring(0, 200)}...\n\n请查看控制台获取完整响应`);
      }
    } else {
      // 纯文本响应
      assistantMessage = await response.text();
      console.log('Smart API完整响应(Text):', assistantMessage);
    }
    
    if (!assistantMessage || assistantMessage.trim() === '') {
      throw new Error('Agent返回了空响应');
    }
    
    // 移除加载状态
    loadingEl.remove();
    
    // 添加助手回复
    chatHistory.push({
      role: 'assistant',
      content: assistantMessage
    });
    
    // 保存历史
    saveChatHistory();
    
    // 渲染消息
    renderChatMessages();
    
  } catch (error) {
    console.error('发送消息失败:', error);
    loadingEl.remove();
    
    // 显示错误消息
    const errorMsg = createMessageElement('assistant', `❌ 发送失败: ${error.message}\n\n请检查：\n1. 网络连接是否正常\n2. Agent是否已正确部署\n3. 如果问题持续，请联系管理员`);
    document.getElementById('chatMessages').appendChild(errorMsg);
    document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
  }
}

function createLoadingMessage() {
  const div = document.createElement('div');
  div.className = 'chat-message assistant';
  div.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-content">
      <div class="message-text">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
        正在思考...
      </div>
    </div>
  `;
  return div;
}

// 添加打字指示器样式到CSS
const style = document.createElement('style');
style.textContent = `
.typing-indicator {
  display: inline-flex;
  gap: 4px;
  margin-right: 8px;
}
.typing-indicator span {
  width: 6px;
  height: 6px;
  background: #667eea;
  border-radius: 50%;
  animation: typing 1.4s infinite;
}
.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}
.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-10px); }
}
`;
document.head.appendChild(style);

// ===== 待办事项管理 =====
function initTodos() {
  loadTodos();
  initTodoFilters();
  updateTodoStats();
  
  // 打开新建任务弹窗
  document.getElementById('openAddTodoModal').addEventListener('click', function() {
    openTodoModal();
  });
  
  // 关闭弹窗
  document.getElementById('closeTodoModal').addEventListener('click', function() {
    closeTodoModal();
  });
  
  document.getElementById('cancelTodo').addEventListener('click', function() {
    closeTodoModal();
  });
  
  // 点击弹窗背景关闭
  document.getElementById('todoModal').addEventListener('click', function(e) {
    if (e.target === this) {
      closeTodoModal();
    }
  });
  
  // 保存按钮
  document.getElementById('saveTodo').addEventListener('click', function() {
    saveTodo();
  });
  
  // 快捷按钮 - 待办截止日期
  document.getElementById('setTodayDue').addEventListener('click', function() {
    const today = new Date();
    document.getElementById('todoDueDate').value = formatDateForInput(today);
  });
  
  document.getElementById('setTomorrowDue').addEventListener('click', function() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('todoDueDate').value = formatDateForInput(tomorrow);
  });
  
  document.getElementById('setNextWeekDue').addEventListener('click', function() {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    document.getElementById('todoDueDate').value = formatDateForInput(nextWeek);
  });
}

function openTodoModal(todoId = null) {
  const modal = document.getElementById('todoModal');
  const modalTitle = document.getElementById('modalTitle');
  const editTodoId = document.getElementById('editTodoId');
  
  if (todoId) {
    // 编辑模式
    modalTitle.textContent = '编辑任务';
    editTodoId.value = todoId;
    
    // 加载任务数据
    chrome.storage.local.get(['todos'], function(result) {
      const todos = result.todos || [];
      const todo = todos.find(t => t.id === todoId);
      if (todo) {
        document.getElementById('todoTitle').value = todo.title;
        document.getElementById('todoDescription').value = todo.description || '';
        document.getElementById('todoPriority').value = todo.priority;
        document.getElementById('todoCategory').value = todo.category || '';
        document.getElementById('todoDueDate').value = todo.dueDate || '';
      }
    });
  } else {
    // 新建模式
    modalTitle.textContent = '新建任务';
    editTodoId.value = '';
    document.getElementById('todoTitle').value = '';
    document.getElementById('todoDescription').value = '';
    document.getElementById('todoPriority').value = 'medium';
    document.getElementById('todoCategory').value = '';
    document.getElementById('todoDueDate').value = '';
  }
  
  modal.classList.add('show');
}

function closeTodoModal() {
  const modal = document.getElementById('todoModal');
  modal.classList.remove('show');
}

function saveTodo() {
  const editTodoId = document.getElementById('editTodoId').value;
  const title = document.getElementById('todoTitle').value.trim();
  const description = document.getElementById('todoDescription').value.trim();
  const priority = document.getElementById('todoPriority').value;
  const category = document.getElementById('todoCategory').value;
  const dueDate = document.getElementById('todoDueDate').value;
  
  if (!title) {
    alert('请输入任务标题');
    return;
  }
  
  chrome.storage.local.get(['todos'], function(result) {
    let todos = result.todos || [];
    
    if (editTodoId) {
      // 编辑现有任务
      const todoId = parseInt(editTodoId);
      const index = todos.findIndex(t => t.id === todoId);
      if (index !== -1) {
        todos[index] = {
          ...todos[index],
          title: title,
          description: description,
          priority: priority,
          category: category,
          dueDate: dueDate,
          updatedAt: new Date().toISOString()
        };
      }
    } else {
      // 创建新任务
      todos.unshift({
        id: Date.now(),
        title: title,
        description: description,
        priority: priority,
        category: category,
        dueDate: dueDate,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
    }
    
    chrome.storage.local.set({ todos: todos }, function() {
      closeTodoModal();
      loadTodos();
    });
  });
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadTodos() {
  chrome.storage.local.get(['todos'], function(result) {
    const todos = result.todos || [];
    renderTodos(todos);
    updateTodoStats();
  });
}

function renderTodos(todos) {
  const container = document.getElementById('todosList');
  
  if (todos.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">还没有待办任务</div></div>';
    return;
  }
  
  // 获取关联的笔记
  chrome.storage.local.get(['allNotes'], function(result) {
    const notes = result.allNotes || [];
    
    container.innerHTML = todos.map(todo => {
      // 查找关联到此待办的笔记
      const linkedNotes = notes.filter(n => n.linkedTodoId === todo.id);
      const linkedNotesHtml = linkedNotes.length > 0 ? `
        <div class="todo-linked-notes">
          <span class="linked-notes-label">📝 关联笔记:</span>
          ${linkedNotes.map(note => `
            <span class="linked-note-tag" data-note-id="${note.id}" title="${escapeHtml(note.title)}">${escapeHtml(note.title.substring(0, 12))}${note.title.length > 12 ? '...' : ''}</span>
          `).join('')}
        </div>
      ` : '';
      
      return `
      <div class="todo-card ${todo.status} ${todo.priority === 'high' ? 'high-priority' : ''}" data-status="${todo.status}">
        <div class="todo-header">
          <div class="todo-title">${escapeHtml(todo.title)}</div>
          <div class="todo-badges">
            <span class="todo-badge badge-priority ${todo.priority}">${getPriorityIcon(todo.priority)} ${getPriorityText(todo.priority)}</span>
            ${todo.category ? `<span class="todo-badge badge-category">${getCategoryText(todo.category)}</span>` : ''}
            <span class="todo-badge badge-status ${todo.status}">${getStatusText(todo.status)}</span>
          </div>
        </div>
        
        ${todo.description ? `<div class="todo-description">${escapeHtml(todo.description)}</div>` : ''}
        
        ${linkedNotesHtml}
        
        <div class="todo-footer">
          <div class="todo-meta">
            <span>📅 ${formatDate(todo.createdAt)}</span>
            ${todo.dueDate ? `<span class="todo-due-date ${isOverdue(todo.dueDate) ? 'overdue' : ''}">
              ⏰ 截止: ${formatDate(todo.dueDate)}
            </span>` : ''}
          </div>
          <div class="todo-actions">
            <button class="todo-edit" data-id="${todo.id}">✏️ 编辑</button>
            ${todo.status !== 'pending' ? `<button class="todo-status-btn status-pending" data-id="${todo.id}" data-status="pending">待办</button>` : ''}
            ${todo.status !== 'in-progress' ? `<button class="todo-status-btn status-in-progress" data-id="${todo.id}" data-status="in-progress">进行中</button>` : ''}
            ${todo.status !== 'completed' ? `<button class="todo-status-btn status-completed" data-id="${todo.id}" data-status="completed">完成</button>` : ''}
            <button class="todo-delete" data-id="${todo.id}">删除</button>
          </div>
        </div>
      </div>
    `;
    }).join('');
    
    // 绑定编辑事件
    container.querySelectorAll('.todo-edit').forEach(btn => {
      btn.addEventListener('click', function() {
        openTodoModal(parseInt(this.dataset.id));
      });
    });
    
    // 绑定状态切换事件
    container.querySelectorAll('.todo-status-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        updateTodoStatus(parseInt(this.dataset.id), this.dataset.status);
      });
    });
    
    // 绑定删除事件
    container.querySelectorAll('.todo-delete').forEach(btn => {
      btn.addEventListener('click', function() {
        if (confirm('确定要删除这个任务吗？')) {
          deleteTodo(parseInt(this.dataset.id));
        }
      });
    });
    
    // 绑定关联笔记点击事件
    container.querySelectorAll('.linked-note-tag').forEach(tag => {
      tag.addEventListener('click', function(e) {
        e.stopPropagation();
        const noteId = parseInt(this.dataset.noteId);
        // 切换到笔记标签并打开笔记详情
        const notesTabBtn = document.querySelector('[data-tab="notes"]');
        if (notesTabBtn) {
          notesTabBtn.click();
          setTimeout(() => {
            openNoteModal(noteId);
          }, 100);
        }
      });
    });
  });
}

function updateTodoStatus(id, status) {
  chrome.storage.local.get(['todos'], function(result) {
    const todos = result.todos || [];
    const todo = todos.find(t => t.id === id);
    
    if (todo) {
      todo.status = status;
      if (status === 'completed') {
        todo.completedAt = new Date().toISOString();
      }
      
      chrome.storage.local.set({ todos: todos }, function() {
        loadTodos();
      });
    }
  });
}

function deleteTodo(id) {
  if (!confirm('确定要删除这个任务吗？')) return;
  
  chrome.storage.local.get(['todos'], function(result) {
    const todos = result.todos || [];
    const filtered = todos.filter(todo => todo.id !== id);
    
    chrome.storage.local.set({ todos: filtered }, function() {
      loadTodos();
    });
  });
}

function initTodoFilters() {
  const filterBtns = document.querySelectorAll('.todo-filters .filter-btn');
  
  filterBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const filter = this.dataset.filter;
      
      filterBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      chrome.storage.local.get(['todos'], function(result) {
        let todos = result.todos || [];
        
        if (filter !== 'all') {
          todos = todos.filter(t => t.status === filter);
        }
        
        renderTodos(todos);
      });
    });
  });
}

function filterTodos() {
  const searchText = document.getElementById('searchTodos').value.toLowerCase();
  const activeFilter = document.querySelector('.todo-filters .filter-btn.active').dataset.filter;
  
  chrome.storage.local.get(['todos'], function(result) {
    let todos = result.todos || [];
    
    // 按状态过滤
    if (activeFilter !== 'all') {
      todos = todos.filter(t => t.status === activeFilter);
    }
    
    // 按搜索文本过滤
    if (searchText) {
      todos = todos.filter(todo => 
        todo.title.toLowerCase().includes(searchText) ||
        (todo.description && todo.description.toLowerCase().includes(searchText))
      );
    }
    
    renderTodos(todos);
  });
}

function updateTodoStats() {
  chrome.storage.local.get(['todos'], function(result) {
    const todos = result.todos || [];
    
    const total = todos.length;
    const pending = todos.filter(t => t.status === 'pending').length;
    const inProgress = todos.filter(t => t.status === 'in-progress').length;
    const completed = todos.filter(t => t.status === 'completed').length;
    
    document.getElementById('todoTotal').textContent = total;
    document.getElementById('todoPending').textContent = pending;
    document.getElementById('todoInProgress').textContent = inProgress;
    document.getElementById('todoCompleted').textContent = completed;
  });
}

function getPriorityIcon(priority) {
  const icons = {
    high: '🔴',
    medium: '🟡',
    low: '🟢'
  };
  return icons[priority] || '⚪';
}

function getPriorityText(priority) {
  const texts = {
    high: '高',
    medium: '中',
    low: '低'
  };
  return texts[priority] || priority;
}

function getStatusText(status) {
  const texts = {
    pending: '待办',
    'in-progress': '进行中',
    completed: '已完成'
  };
  return texts[status] || status;
}

function getCategoryText(category) {
  const texts = {
    development: '开发任务',
    debug: '问题排查',
    optimization: '性能优化',
    meeting: '会议',
    review: 'Code Review',
    documentation: '文档',
    other: '其他'
  };
  return texts[category] || category;
}

function isOverdue(dueDate) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  
  // 检查是否包含时间部分
  const hasTime = dateString.includes(':') || dateString.includes('T');
  
  if (hasTime) {
    // 如果有时间部分，显示完整的日期和时间
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } else {
    // 如果只有日期，只显示月-日
    return date.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit'
    });
  }
}

// ===== 工具函数 =====
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    console.log('已复制到剪贴板');
  }).catch(err => {
    console.error('复制失败:', err);
  });
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== 首页Mini代办看板 =====
function loadMiniTodoBoard() {
  chrome.storage.local.get(['todos'], function(result) {
    const todos = result.todos || [];
    
    const pending = todos.filter(t => t.status === 'pending');
    const inProgress = todos.filter(t => t.status === 'in-progress');
    const completed = todos.filter(t => t.status === 'completed');
    
    // 更新计数
    document.getElementById('miniPendingCount').textContent = pending.length;
    document.getElementById('miniInProgressCount').textContent = inProgress.length;
    document.getElementById('miniCompletedCount').textContent = completed.length;
    
    // 渲染各列
    renderMiniColumn('miniPendingTodos', pending);
    renderMiniColumn('miniInProgressTodos', inProgress);
    renderMiniColumn('miniCompletedTodos', completed);
  });
}

function renderMiniColumn(containerId, todos) {
  const container = document.getElementById(containerId);
  
  if (!container) return;
  
  if (todos.length === 0) {
    container.innerHTML = '<div class="empty-todos-mini">暂无任务</div>';
    return;
  }
  
  // 只显示前5个
  const displayTodos = todos.slice(0, 5);
  
  container.innerHTML = displayTodos.map(todo => {
    const dueDate = todo.dueDate ? new Date(todo.dueDate) : null;
    const isOverdue = dueDate && new Date() > dueDate;
    
    return `
      <div class="todo-card-mini ${todo.priority === 'high' ? 'high-priority' : ''} ${todo.status === 'completed' ? 'completed' : ''}" 
           data-id="${todo.id}">
        <div class="todo-title-mini">${escapeHtml(todo.title)}</div>
        <div class="todo-meta-mini">
          ${todo.priority === 'high' ? '<span>🔴 高</span>' : ''}
          ${dueDate ? `<span class="${isOverdue ? 'overdue' : ''}">⏰ ${formatDate(todo.dueDate)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
  
  // 绑定点击事件，点击后跳转到代办详情
  container.querySelectorAll('.todo-card-mini').forEach(card => {
    card.addEventListener('click', () => {
      document.getElementById('openTodoDetail').click();
    });
  });
}

// 监听代办事项的变化，自动更新首页看板
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.todos) {
    loadMiniTodoBoard();
  }
});

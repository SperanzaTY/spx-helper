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
  initDecisionHelper();
  initCalendarTool();
  initGmailTool();
  initCodeHelper();
  initTodos();
  initFmsLinks();
  initDodTool();
  
  // 事件监听器
  document.getElementById('addLink').addEventListener('click', addLink);
  document.getElementById('addLinkCategory').addEventListener('click', addLinkCategory);
  document.getElementById('getCurrentTimestamp').addEventListener('click', setCurrentTimestamp);
  document.getElementById('convertTimestampBtn').addEventListener('click', convertTimestamp);
  document.getElementById('convertToTimestamp').addEventListener('click', convertToTimestamp);
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
    versionElement.textContent = 'v' + manifest.version;
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
  
  // 加载分类展开/收起状态
  chrome.storage.local.get(['categoryExpanded'], function(result) {
    const categoryExpanded = result.categoryExpanded || {};
    
    // 按order排序
    const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
    
    container.innerHTML = sortedCategories.map((cat, catIndex) => {
      const links = allLinks.filter(link => link.category === cat.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0)); // 按order排序链接
      
      // 检查该分类是否展开（默认展开，如果之前收起过则收起）
      const isExpanded = categoryExpanded[cat.id] !== undefined ? categoryExpanded[cat.id] : true;
      
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
          <div class="category-header" data-category-id="${cat.id}">
            <div class="category-title-wrapper">
              <button class="category-toggle-btn" data-category-id="${cat.id}" title="${isExpanded ? '收起' : '展开'}">
                <span class="toggle-icon">${isExpanded ? '▼' : '▶'}</span>
              </button>
              <h3>${escapeHtml(cat.name)}</h3>
            </div>
            <div class="category-actions">
              <button class="btn-icon move-category-up" data-id="${cat.id}" ${catIndex === 0 ? 'disabled' : ''} title="上移分类">⬆️</button>
              <button class="btn-icon move-category-down" data-id="${cat.id}" ${catIndex === sortedCategories.length - 1 ? 'disabled' : ''} title="下移分类">⬇️</button>
              <button class="btn-icon edit-category-btn" data-id="${cat.id}" title="编辑分类">✏️</button>
              <button class="btn-icon delete-category-btn" data-id="${cat.id}" title="删除分类">🗑️</button>
            </div>
          </div>
          <div class="links-grid category-content" id="${cat.id}Links" style="display: ${isExpanded ? 'flex' : 'none'};">
            ${linksHtml}
          </div>
        </div>
      `;
    }).join('');
    
    // 重新绑定所有事件
    bindLinkEvents();
    bindCategoryEvents();
    bindCategoryToggle();
  });
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

function bindCategoryToggle() {
  // 绑定分类展开/收起按钮
  document.querySelectorAll('.category-toggle-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const categoryId = this.dataset.categoryId;
      toggleCategory(categoryId);
    });
  });
  
  // 点击分类标题也可以展开/收起
  document.querySelectorAll('.category-header').forEach(header => {
    header.addEventListener('click', function(e) {
      // 如果点击的是按钮或操作按钮，不触发
      if (e.target.closest('.category-actions') || e.target.closest('.category-toggle-btn')) {
        return;
      }
      const categoryId = this.dataset.categoryId;
      if (categoryId) {
        toggleCategory(categoryId);
      }
    });
  });
}

function toggleCategory(categoryId) {
  const content = document.getElementById(`${categoryId}Links`);
  const toggleBtn = document.querySelector(`.category-toggle-btn[data-category-id="${categoryId}"]`);
  const toggleIcon = toggleBtn ? toggleBtn.querySelector('.toggle-icon') : null;
  
  if (!content) return;
  
  const isExpanded = content.style.display !== 'none';
  const newExpanded = !isExpanded;
  
  // 更新显示状态
  content.style.display = newExpanded ? 'flex' : 'none';
  if (toggleIcon) {
    toggleIcon.textContent = newExpanded ? '▼' : '▶';
  }
  if (toggleBtn) {
    toggleBtn.title = newExpanded ? '收起' : '展开';
  }
  
  // 保存状态
  chrome.storage.local.get(['categoryExpanded'], function(result) {
    const categoryExpanded = result.categoryExpanded || {};
    categoryExpanded[categoryId] = newExpanded;
    chrome.storage.local.set({ categoryExpanded: categoryExpanded });
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
    console.log('🟢 Popup: 发送 HTTP 请求到 background.js');
    console.log('🟢 Method:', method);
    console.log('🟢 URL:', url);
    console.log('🟢 Headers:', allHeaders);
    
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'httpRequest',
        method: method,
        url: url,
        headers: allHeaders,
        body: body
      }, response => {
        if (chrome.runtime.lastError) {
          console.error('❌ Popup: 消息发送失败', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success) {
          console.log('✅ Popup: 收到成功响应', response.status);
          resolve(response);
        } else {
          console.error('❌ Popup: 请求失败', response);
          reject(new Error(response ? (response.error || '请求失败') : '请求失败'));
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
// 注意：站点查询使用 TEST 环境配置，因为接口域名是 test 环境
async function generateApiMartJwtToken() {
  const account = 'test_project_account';
  const secret = 'test10010';
  
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

// ===== 转盘抽奖工具 =====
let wheelCanvas = null;
let wheelCtx = null;
let wheelOptions = [];
let wheelWeights = [];
let wheelRotation = 0;
let isSpinning = false;

function initDecisionHelper() {
  initWheelMode();
}

function initWheelMode() {
  const spinBtn = document.getElementById('spinWheelBtn');
  const clearBtn = document.getElementById('clearWheelOptionsBtn');
  const addBtn = document.getElementById('addWheelOptionBtn');
  const saveBtn = document.getElementById('saveWheelChoiceBtn');
  const enableWeightCheckbox = document.getElementById('wheelEnableWeight');
  const optionsListDiv = document.getElementById('wheelOptionsList');
  
  if (!optionsListDiv) return;
  
  if (enableWeightCheckbox) {
    enableWeightCheckbox.addEventListener('change', function() {
      updateWheelOptionsWeightDisplay();
      initWheel();
    });
  }
  
  if (spinBtn) spinBtn.addEventListener('click', spinWheel);
  if (addBtn) addBtn.addEventListener('click', () => addWheelOption());
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (optionsListDiv) optionsListDiv.innerHTML = '';
    wheelWeights = [];
    initWheel();
  });
  if (saveBtn) saveBtn.addEventListener('click', saveWheelChoice);
  
  addWheelOption();
  loadWheelHistory();
  initWheel();
}

function addWheelOption() {
  const optionsListDiv = document.getElementById('wheelOptionsList');
  if (!optionsListDiv) return;
  
  const enableWeightCheckbox = document.getElementById('wheelEnableWeight');
  const useWeight = enableWeightCheckbox && enableWeightCheckbox.checked;
  
  const item = document.createElement('div');
  item.className = 'weight-option-item';
  
  if (useWeight) {
    item.innerHTML = `
      <input type="text" class="weight-option-input" placeholder="选项名称">
      <div class="weight-controls">
        <label>权重:</label>
        <input type="range" class="weight-slider" min="1" max="10" value="5">
        <span class="weight-value">5</span>
      </div>
      <button class="btn-icon remove-weight-option">🗑️</button>
    `;
    
    const slider = item.querySelector('.weight-slider');
    const valueSpan = item.querySelector('.weight-value');
    slider.addEventListener('input', function() {
      valueSpan.textContent = this.value;
      initWheel();
    });
  } else {
    item.innerHTML = `
      <input type="text" class="weight-option-input" placeholder="选项名称" style="flex: 1;">
      <button class="btn-icon remove-weight-option">🗑️</button>
    `;
  }
  
  item.querySelector('.remove-weight-option').addEventListener('click', function() {
    item.remove();
    initWheel();
  });
  
  const input = item.querySelector('.weight-option-input');
  input.addEventListener('input', function() {
    initWheel();
  });
  
  optionsListDiv.appendChild(item);
}

function updateWheelOptionsWeightDisplay() {
  const optionsListDiv = document.getElementById('wheelOptionsList');
  const enableWeightCheckbox = document.getElementById('wheelEnableWeight');
  if (!optionsListDiv || !enableWeightCheckbox) return;
  
  const useWeight = enableWeightCheckbox.checked;
  const items = optionsListDiv.querySelectorAll('.weight-option-item');
  
  items.forEach(item => {
    const input = item.querySelector('.weight-option-input');
    const text = input ? input.value : '';
    
    if (useWeight) {
      if (!item.querySelector('.weight-controls')) {
        item.innerHTML = `
          <input type="text" class="weight-option-input" value="${escapeHtml(text)}" placeholder="选项名称">
          <div class="weight-controls">
            <label>权重:</label>
            <input type="range" class="weight-slider" min="1" max="10" value="5">
            <span class="weight-value">5</span>
          </div>
          <button class="btn-icon remove-weight-option">🗑️</button>
        `;
        
        const slider = item.querySelector('.weight-slider');
        const valueSpan = item.querySelector('.weight-value');
        slider.addEventListener('input', function() {
          valueSpan.textContent = this.value;
          initWheel();
        });
        
        item.querySelector('.remove-weight-option').addEventListener('click', function() {
          item.remove();
          initWheel();
        });
        
        const inputEl = item.querySelector('.weight-option-input');
        inputEl.addEventListener('input', function() {
          initWheel();
        });
      }
    } else {
      item.innerHTML = `
        <input type="text" class="weight-option-input" value="${escapeHtml(text)}" placeholder="选项名称" style="flex: 1;">
        <button class="btn-icon remove-weight-option">🗑️</button>
      `;
      
      item.querySelector('.remove-weight-option').addEventListener('click', function() {
        item.remove();
        initWheel();
      });
      
      const inputEl = item.querySelector('.weight-option-input');
      inputEl.addEventListener('input', function() {
        initWheel();
      });
    }
  });
}

function initWheel() {
  const canvas = document.getElementById('wheelCanvas');
  if (!canvas) return;
  
  wheelCanvas = canvas;
  wheelCtx = canvas.getContext('2d');
  
  drawWheel();
}

function drawWheel() {
  if (!wheelCtx || !wheelCanvas) return;
  
  const centerX = wheelCanvas.width / 2;
  const centerY = wheelCanvas.height / 2;
  const radius = Math.min(centerX, centerY) - 20;
  
  wheelCtx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);
  
  const enableWeightCheckbox = document.getElementById('wheelEnableWeight');
  const useWeight = enableWeightCheckbox && enableWeightCheckbox.checked;
  const optionsListDiv = document.getElementById('wheelOptionsList');
  
  let options = [];
  let weights = [];
  
  if (optionsListDiv) {
    const items = optionsListDiv.querySelectorAll('.weight-option-item');
    items.forEach(item => {
      const input = item.querySelector('.weight-option-input');
      const text = input.value.trim();
      if (text) {
        options.push(text);
        if (useWeight) {
          const slider = item.querySelector('.weight-slider');
          const weight = slider ? parseInt(slider.value) : 1;
          weights.push(weight);
        } else {
          weights.push(1);
        }
      }
    });
  }
  
  if (options.length === 0) {
    wheelCtx.fillStyle = '#f0f0f0';
    wheelCtx.beginPath();
    wheelCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    wheelCtx.fill();
    
    wheelCtx.fillStyle = '#999';
    wheelCtx.font = '14px Arial';
    wheelCtx.textAlign = 'center';
    wheelCtx.fillText('添加选项', centerX, centerY);
    wheelOptions = [];
    wheelWeights = [];
    return;
  }
  
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const colors = ['#667eea', '#764ba2', '#9f7aea', '#b794f6', '#c084fc'];
  
  let currentAngle = wheelRotation;
  
  options.forEach((option, index) => {
    const weight = weights[index];
    const anglePerOption = (weight / totalWeight) * Math.PI * 2;
    const startAngle = currentAngle;
    const endAngle = currentAngle + anglePerOption;
    
    wheelCtx.fillStyle = colors[index % colors.length];
    wheelCtx.beginPath();
    wheelCtx.moveTo(centerX, centerY);
    wheelCtx.arc(centerX, centerY, radius, startAngle, endAngle);
    wheelCtx.closePath();
    wheelCtx.fill();
    
    wheelCtx.save();
    wheelCtx.translate(centerX, centerY);
    wheelCtx.rotate(startAngle + anglePerOption / 2);
    wheelCtx.fillStyle = 'white';
    wheelCtx.font = 'bold 12px Arial';
    wheelCtx.textAlign = 'center';
    wheelCtx.fillText(option.length > 8 ? option.substring(0, 8) + '...' : option, radius * 0.7, 5);
    wheelCtx.restore();
    
    currentAngle = endAngle;
  });
  
  wheelOptions = options;
  wheelWeights = weights;
  
  wheelCtx.fillStyle = 'white';
  wheelCtx.beginPath();
  wheelCtx.arc(centerX, centerY, 20, 0, Math.PI * 2);
  wheelCtx.fill();
}

function spinWheel() {
  if (isSpinning || wheelOptions.length === 0) return;
  
  isSpinning = true;
  const spinBtn = document.getElementById('spinWheelBtn');
  if (spinBtn) spinBtn.disabled = true;
  
  const spins = 5 + Math.random() * 3;
  const randomAngle = Math.random() * Math.PI * 2;
  const targetRotation = wheelRotation + spins * Math.PI * 2 + randomAngle;
  
  const startRotation = wheelRotation;
  const duration = 2000;
  const startTime = Date.now();
  
  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    const easeOut = 1 - Math.pow(1 - progress, 3);
    wheelRotation = startRotation + (targetRotation - startRotation) * easeOut;
    
    drawWheel();
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      isSpinning = false;
      if (spinBtn) spinBtn.disabled = false;
    }
  }
  
  animate();
}

function saveWheelChoice() {
  const optionsListDiv = document.getElementById('wheelOptionsList');
  const enableWeightCheckbox = document.getElementById('wheelEnableWeight');
  if (!optionsListDiv || !enableWeightCheckbox) return;

  const useWeight = enableWeightCheckbox.checked;
  const options = [];
  optionsListDiv.querySelectorAll('.weight-option-item').forEach(item => {
    const input = item.querySelector('.weight-option-input');
    const text = input.value.trim();
    if (text) {
      const weight = useWeight ? parseInt(item.querySelector('.weight-slider').value) : 1;
      options.push({ text, weight });
    }
  });

  if (options.length === 0) {
    alert('请至少添加一个选项！');
    return;
  }

  const choiceName = prompt('请输入配置名称：', `转盘配置 ${new Date().toLocaleString()}`);
  if (!choiceName) return;

  chrome.storage.local.get(['decisionHelper'], function(result) {
    const helper = result.decisionHelper || {};
    const wheelChoices = helper.wheelChoices || [];
    
    wheelChoices.push({
      id: Date.now(),
      name: choiceName,
      options: options,
      useWeight: useWeight
    });

    chrome.storage.local.set({
      decisionHelper: {
        ...helper,
        wheelChoices: wheelChoices
      }
    }, function() {
      alert('配置保存成功！');
      loadWheelHistory();
    });
  });
}

function loadWheelHistory() {
  const historyList = document.getElementById('wheelHistoryList');
  if (!historyList) return;

  chrome.storage.local.get(['decisionHelper'], function(result) {
    const helper = result.decisionHelper || {};
    const wheelChoices = helper.wheelChoices || [];

    if (wheelChoices.length === 0) {
      historyList.innerHTML = '<div class="history-empty">暂无保存的配置</div>';
      return;
    }

    historyList.innerHTML = wheelChoices.map(choice => `
      <div class="history-item">
        <span class="history-name">${escapeHtml(choice.name)}</span>
        <span class="history-options">${choice.options.length}个选项${choice.useWeight ? ' (带权重)' : ''}</span>
        <div class="history-actions">
          <button class="btn-icon load-history" data-id="${choice.id}" title="加载配置">📥</button>
          <button class="btn-icon delete-history" data-id="${choice.id}" title="删除配置">🗑️</button>
        </div>
      </div>
    `).join('');

    historyList.querySelectorAll('.load-history').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = parseInt(this.dataset.id);
        const choice = wheelChoices.find(c => c.id === id);
        if (!choice) return;

        const optionsListDiv = document.getElementById('wheelOptionsList');
        const enableWeightCheckbox = document.getElementById('wheelEnableWeight');
        if (!optionsListDiv || !enableWeightCheckbox) return;

        optionsListDiv.innerHTML = '';
        enableWeightCheckbox.checked = choice.useWeight;

        choice.options.forEach(opt => {
          const item = document.createElement('div');
          item.className = 'weight-option-item';
          
          if (choice.useWeight && opt.weight) {
            item.innerHTML = `
              <input type="text" class="weight-option-input" value="${escapeHtml(opt.text)}" placeholder="选项名称">
              <div class="weight-controls">
                <label>权重:</label>
                <input type="range" class="weight-slider" min="1" max="10" value="${opt.weight}">
                <span class="weight-value">${opt.weight}</span>
              </div>
              <button class="btn-icon remove-weight-option">🗑️</button>
            `;
            
            const slider = item.querySelector('.weight-slider');
            const valueSpan = item.querySelector('.weight-value');
            slider.addEventListener('input', function() {
              valueSpan.textContent = this.value;
              initWheel();
            });
          } else {
            item.innerHTML = `
              <input type="text" class="weight-option-input" value="${escapeHtml(opt.text || opt)}" placeholder="选项名称" style="flex: 1;">
              <button class="btn-icon remove-weight-option">🗑️</button>
            `;
          }
          
          item.querySelector('.remove-weight-option').addEventListener('click', function() {
            item.remove();
            initWheel();
          });
          
          const inputEl = item.querySelector('.weight-option-input');
          inputEl.addEventListener('input', function() {
            initWheel();
          });
          
          optionsListDiv.appendChild(item);
        });
        
        updateWheelOptionsWeightDisplay();
        initWheel();
      });
    });
    
    historyList.querySelectorAll('.delete-history').forEach(btn => {
      btn.addEventListener('click', function() {
        if (!confirm('确定要删除这个配置吗？')) return;
        const id = parseInt(this.dataset.id);
        const newChoices = wheelChoices.filter(c => c.id !== id);
        chrome.storage.local.set({
          decisionHelper: {
            ...helper,
            wheelChoices: newChoices
          }
        }, function() {
          loadWheelHistory();
        });
      });
    });
  });
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
    const hasDescription = description && description.trim().length > 0;
    // 使用事件ID或时间戳生成唯一ID
    const eventId = `event-${event.id || index}-${startTime}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 判断是否需要展开/收起功能
    // 条件：有描述 且 (描述超过150字符 或 包含超过3个换行符)
    const descriptionText = event.description || '';
    const lineCount = (descriptionText.match(/\n/g) || []).length;
    const needsExpand = hasDescription && (descriptionText.length > 150 || lineCount > 3);
    
    const eventHtml = `
      <div class="event-item ${isOngoing ? 'event-ongoing' : ''} ${isPast ? 'event-past' : ''}">
        <div class="event-time-badge ${isOngoing ? 'ongoing' : ''}">${timeStr}</div>
        <div class="event-details">
          <div class="event-title">
            ${isOngoing ? '<span class="ongoing-indicator">🔴 进行中</span> ' : ''}
            ${escapeHtml(event.summary || '(无标题)')}
          </div>
          ${event.location ? `<div class="event-location">📍 ${escapeHtml(event.location)}</div>` : ''}
          ${needsExpand ? `
            <div class="event-expandable-content" id="${eventId}-content" style="display: none;">
              ${description ? `<div class="event-description">${escapeHtml(description).replace(/&lt;br&gt;/g, '<br>')}</div>` : ''}
              ${event.hangoutLink ? `<a href="${event.hangoutLink}" target="_blank" class="event-link">🎥 加入会议</a>` : ''}
              ${event.htmlLink ? `<a href="${event.htmlLink}" target="_blank" class="event-link">在 Calendar 中查看</a>` : ''}
            </div>
            <button class="event-expand-btn" data-event-id="${eventId}">
              <span class="expand-icon">▼</span> 展开详情
            </button>
          ` : `
            ${description ? `<div class="event-description">${escapeHtml(description).replace(/&lt;br&gt;/g, '<br>')}</div>` : ''}
            ${event.hangoutLink ? `<a href="${event.hangoutLink}" target="_blank" class="event-link">🎥 加入会议</a>` : ''}
            ${event.htmlLink ? `<a href="${event.htmlLink}" target="_blank" class="event-link">在 Calendar 中查看</a>` : ''}
          `}
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
  
  // 绑定日程详情展开/收起事件
  document.querySelectorAll('.event-expand-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const eventId = this.dataset.eventId;
      const content = document.getElementById(eventId + '-content');
      const icon = this.querySelector('.expand-icon');
      
      if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▲';
        this.innerHTML = '<span class="expand-icon">▲</span> 收起详情';
      } else {
        content.style.display = 'none';
        icon.textContent = '▼';
        this.innerHTML = '<span class="expand-icon">▼</span> 展开详情';
      }
    });
  });
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
  
  // 设置反向转换的默认时间为当前时间
  const now = new Date();
  document.getElementById('datetimeInput').value = formatDateTimeForInput(now);
  
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
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
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
    alert('请选择日期时间');
    return;
  }
  
  // datetime-local 返回格式: YYYY-MM-DDTHH:mm:ss 或 YYYY-MM-DDTHH:mm
  const date = new Date(datetimeInput);
  
  if (isNaN(date.getTime())) {
    alert('日期时间格式不正确');
    return;
  }
  
  const timestamp = Math.floor(date.getTime() / 1000);
  
  document.getElementById('timestampResult').innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; justify-content: space-between;">
      <div>
        <div style="font-size: 14px; font-weight: bold; color: #667eea;">时间戳: ${timestamp}</div>
        <div style="font-size: 12px; color: #666; margin-top: 5px;">时区: ${timezone}</div>
      </div>
      <button class="btn btn-secondary" id="copyTimestampBtn" style="flex-shrink: 0;">复制</button>
    </div>
  `;
  
  // 绑定复制按钮
  document.getElementById('copyTimestampBtn').addEventListener('click', function() {
    copyToClipboard(timestamp.toString());
    this.textContent = '✅ 已复制';
    setTimeout(() => { this.textContent = '复制'; }, 2000);
  });
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
        input_str: message
        // thread_id 是可选的，如果需要保持对话上下文可以添加
        // thread_id: threadId
      }
    };
    
    // 如果需要保持对话上下文，添加 thread_id
    if (threadId) {
      requestData.message.thread_id = threadId;
    }
    
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

// ===== Gmail 邮件模块 =====
let gmailAccessToken = null;
let currentGmailFilter = 'all';
let gmailMessages = [];
let gmailBlockedSenders = []; // 存储屏蔽的发件人列表

function initGmailTool() {
  // 加载屏蔽列表
  loadBlockedSenders();
  
  // 绑定事件
  const authorizeBtn = document.getElementById('authorizeGmailBtn');
  const refreshBtn = document.getElementById('refreshGmailBtn');
  const retryBtn = document.getElementById('retryGmail');
  const searchInput = document.getElementById('searchGmail');
  const filterSettingsBtn = document.getElementById('gmailFilterSettingsBtn');
  const closeFilterModal = document.getElementById('closeGmailFilterModal');
  const addFilterBtn = document.getElementById('addFilterBtn');
  const markAllReadBtn = document.getElementById('markAllReadBtn');
  
  if (authorizeBtn) {
    authorizeBtn.addEventListener('click', authorizeGmail);
  }
  
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadGmailMessages);
  }
  
  if (retryBtn) {
    retryBtn.addEventListener('click', loadGmailMessages);
  }
  
  if (searchInput) {
    searchInput.addEventListener('input', filterGmailMessages);
  }
  
  if (filterSettingsBtn) {
    filterSettingsBtn.addEventListener('click', openFilterSettings);
  }
  
  if (closeFilterModal) {
    closeFilterModal.addEventListener('click', closeFilterSettings);
  }
  
  if (addFilterBtn) {
    addFilterBtn.addEventListener('click', addBlockedSender);
  }
  
  if (markAllReadBtn) {
    markAllReadBtn.addEventListener('click', markAllGmailAsRead);
  }
  
  // 回车添加
  const filterEmailInput = document.getElementById('filterEmailInput');
  if (filterEmailInput) {
    filterEmailInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        addBlockedSender();
      }
    });
  }
  
  // 绑定筛选按钮
  const filterBtns = document.querySelectorAll('#gmailFilters .filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      filterBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentGmailFilter = this.dataset.filter;
      filterGmailMessages();
    });
  });
  
  // 初始化时检查授权状态
  checkGmailAuth();
}

async function checkGmailAuth() {
  try {
    // 尝试获取已有的 token
    if (chrome.identity && chrome.identity.getAuthToken) {
      chrome.identity.getAuthToken({ interactive: false }, function(token) {
        if (chrome.runtime.lastError || !token) {
          showGmailAuthSection();
        } else {
          gmailAccessToken = token;
          loadGmailMessages();
        }
      });
    } else {
      showGmailAuthSection();
    }
  } catch (error) {
    console.error('Gmail 授权检查失败:', error);
    showGmailAuthSection();
  }
}

function showGmailAuthSection() {
  document.getElementById('gmailAuthSection').style.display = 'block';
  document.getElementById('gmailLoading').style.display = 'none';
  document.getElementById('gmailStats').style.display = 'none';
  document.getElementById('gmailFilters').style.display = 'none';
  document.getElementById('gmailList').style.display = 'none';
  document.getElementById('gmailError').style.display = 'none';
}

function showGmailLoading() {
  document.getElementById('gmailAuthSection').style.display = 'none';
  document.getElementById('gmailLoading').style.display = 'block';
  document.getElementById('gmailStats').style.display = 'none';
  document.getElementById('gmailFilters').style.display = 'none';
  document.getElementById('gmailList').style.display = 'none';
  document.getElementById('gmailError').style.display = 'none';
}

function showGmailContent() {
  document.getElementById('gmailAuthSection').style.display = 'none';
  document.getElementById('gmailLoading').style.display = 'none';
  document.getElementById('gmailStats').style.display = 'grid';
  document.getElementById('gmailFilters').style.display = 'flex';
  document.getElementById('gmailList').style.display = 'block';
  document.getElementById('gmailError').style.display = 'none';
  document.getElementById('gmailFilterSettingsBtn').style.display = 'inline-block';
  document.getElementById('markAllReadBtn').style.display = 'inline-block';
}

function showGmailError(message) {
  document.getElementById('gmailAuthSection').style.display = 'none';
  document.getElementById('gmailLoading').style.display = 'none';
  document.getElementById('gmailStats').style.display = 'none';
  document.getElementById('gmailFilters').style.display = 'none';
  document.getElementById('gmailList').style.display = 'none';
  document.getElementById('gmailError').style.display = 'block';
  document.getElementById('gmailErrorMessage').textContent = message;
}

async function authorizeGmail() {
  try {
    if (!chrome.identity || !chrome.identity.getAuthToken) {
      showGmailError('当前浏览器不支持 Google 授权功能');
      return;
    }
    
    showGmailLoading();
    
    chrome.identity.getAuthToken({ interactive: true }, function(token) {
      if (chrome.runtime.lastError) {
        console.error('Gmail 授权失败:', chrome.runtime.lastError);
        showGmailError('授权失败: ' + chrome.runtime.lastError.message);
        return;
      }
      
      gmailAccessToken = token;
      loadGmailMessages();
    });
  } catch (error) {
    console.error('Gmail 授权失败:', error);
    showGmailError('授权失败: ' + error.message);
  }
}

async function loadGmailMessages() {
  if (!gmailAccessToken) {
    showGmailAuthSection();
    return;
  }
  
  try {
    showGmailLoading();
    
    // 使用 Gmail 搜索语法的相对日期，更稳定
    // newer_than:3d 表示最近3天
    // maxResults=500 获取更多邮件（Gmail API 最大支持 500）
    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500&labelIds=INBOX&q=newer_than:3d',
      {
        headers: {
          'Authorization': `Bearer ${gmailAccessToken}`
        }
      }
    );
    
    if (!response.ok) {
      if (response.status === 401) {
        // Token 过期，重新授权
        gmailAccessToken = null;
        if (chrome.identity && chrome.identity.removeCachedAuthToken) {
          chrome.identity.removeCachedAuthToken({ token: gmailAccessToken }, () => {
            showGmailAuthSection();
          });
        } else {
          showGmailAuthSection();
        }
        return;
      }
      throw new Error(`API错误: ${response.status}`);
    }
    
    const data = await response.json();
    const messageIds = (data.messages || []).map(m => m.id);
    
    if (messageIds.length === 0) {
      gmailMessages = [];
      updateGmailStats();
      showGmailContent();
      filterGmailMessages();
      return;
    }
    
    // 批量获取邮件详情
    // 为了性能，分批次获取，每批 20 封
    const batchSize = 20;
    const batches = [];
    
    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batchIds = messageIds.slice(i, i + batchSize);
      batches.push(batchIds);
    }
    
    console.log(`正在加载 ${messageIds.length} 封邮件，分 ${batches.length} 批次...`);
    
    // 并发获取所有批次
    const allMessages = [];
    for (const batchIds of batches) {
      const detailPromises = batchIds.map(id => 
        fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata`, {
          headers: {
            'Authorization': `Bearer ${gmailAccessToken}`
          }
        }).then(r => r.json())
      );
      
      const batchMessages = await Promise.all(detailPromises);
      allMessages.push(...batchMessages);
    }
    
    gmailMessages = allMessages;
    
    console.log(`成功加载 ${gmailMessages.length} 封邮件`);
    
    updateGmailStats();
    showGmailContent();
    // 应用当前筛选器，而不是显示全部
    filterGmailMessages();
    
  } catch (error) {
    console.error('加载邮件失败:', error);
    showGmailError('加载邮件失败: ' + error.message);
  }
}

async function markAllGmailAsRead() {
  if (!gmailAccessToken) {
    alert('请先授权 Gmail 访问');
    return;
  }
  
  // 获取所有未读邮件
  const unreadMessages = gmailMessages.filter(m => 
    m.labelIds && m.labelIds.includes('UNREAD')
  );
  
  if (unreadMessages.length === 0) {
    alert('没有未读邮件');
    return;
  }
  
  const confirmed = confirm(`确定要将 ${unreadMessages.length} 封未读邮件标记为已读吗？`);
  if (!confirmed) {
    return;
  }
  
  const markAllReadBtn = document.getElementById('markAllReadBtn');
  const originalText = markAllReadBtn.textContent;
  markAllReadBtn.disabled = true;
  markAllReadBtn.textContent = '⏳ 处理中...';
  
  try {
    // 批量标记为已读，每批处理20封
    const batchSize = 20;
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < unreadMessages.length; i += batchSize) {
      const batch = unreadMessages.slice(i, i + batchSize);
      
      const promises = batch.map(async (message) => {
        try {
          const response = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}/modify`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${gmailAccessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                removeLabelIds: ['UNREAD']
              })
            }
          );
          
          if (response.ok) {
            successCount++;
            // 更新本地缓存
            const index = gmailMessages.findIndex(m => m.id === message.id);
            if (index !== -1) {
              gmailMessages[index].labelIds = gmailMessages[index].labelIds.filter(l => l !== 'UNREAD');
            }
          } else {
            errorCount++;
            console.error(`标记邮件 ${message.id} 失败:`, response.status);
          }
        } catch (error) {
          errorCount++;
          console.error(`标记邮件 ${message.id} 失败:`, error);
        }
      });
      
      await Promise.all(promises);
      
      // 更新按钮文本显示进度
      markAllReadBtn.textContent = `⏳ ${successCount}/${unreadMessages.length}`;
    }
    
    // 刷新显示
    updateGmailStats();
    filterGmailMessages();
    
    if (errorCount === 0) {
      showToast(`✅ 已成功标记 ${successCount} 封邮件为已读`);
    } else {
      showToast(`⚠️ 成功 ${successCount} 封，失败 ${errorCount} 封`);
    }
    
  } catch (error) {
    console.error('标记全部已读失败:', error);
    alert('标记失败: ' + error.message);
  } finally {
    markAllReadBtn.disabled = false;
    markAllReadBtn.textContent = originalText;
  }
}

function updateGmailStats() {
  const unreadCount = gmailMessages.filter(m => 
    m.labelIds && m.labelIds.includes('UNREAD')
  ).length;
  
  const starredCount = gmailMessages.filter(m => 
    m.labelIds && m.labelIds.includes('STARRED')
  ).length;
  
  document.getElementById('gmailUnreadCount').textContent = unreadCount;
  document.getElementById('gmailTotalCount').textContent = gmailMessages.length;
  document.getElementById('gmailStarredCount').textContent = starredCount;
}

function filterGmailMessages() {
  let filtered = [...gmailMessages];
  
  // 首先应用屏蔽规则
  filtered = filtered.filter(m => {
    const from = getHeader(m, 'From');
    return !isEmailBlocked(from);
  });
  
  // 按筛选器过滤
  if (currentGmailFilter === 'unread') {
    filtered = filtered.filter(m => m.labelIds && m.labelIds.includes('UNREAD'));
  } else if (currentGmailFilter === 'starred') {
    filtered = filtered.filter(m => m.labelIds && m.labelIds.includes('STARRED'));
  } else if (currentGmailFilter === 'important') {
    filtered = filtered.filter(m => m.labelIds && m.labelIds.includes('IMPORTANT'));
  }
  
  // 按搜索关键词过滤
  const searchInput = document.getElementById('searchGmail');
  if (searchInput && searchInput.value.trim()) {
    const keyword = searchInput.value.toLowerCase();
    filtered = filtered.filter(m => {
      const subject = getHeader(m, 'Subject').toLowerCase();
      const from = getHeader(m, 'From').toLowerCase();
      return subject.includes(keyword) || from.includes(keyword);
    });
  }
  
  renderGmailMessages(filtered);
}

function renderGmailMessages(messages) {
  const listDiv = document.getElementById('gmailList');
  
  if (!messages || messages.length === 0) {
    listDiv.innerHTML = `
      <div class="gmail-empty">
        <div class="gmail-empty-icon">📭</div>
        <div class="gmail-empty-text">没有找到邮件</div>
      </div>
    `;
    return;
  }
  
  listDiv.innerHTML = messages.map(msg => {
    const isUnread = msg.labelIds && msg.labelIds.includes('UNREAD');
    const isStarred = msg.labelIds && msg.labelIds.includes('STARRED');
    const isImportant = msg.labelIds && msg.labelIds.includes('IMPORTANT');
    
    const from = getHeader(msg, 'From');
    const subject = getHeader(msg, 'Subject') || '(无主题)';
    const date = new Date(parseInt(msg.internalDate));
    const dateStr = formatGmailDate(date);
    const snippet = msg.snippet || '';
    
    return `
      <div class="gmail-item ${isUnread ? 'unread' : ''}" data-id="${msg.id}">
        <div class="gmail-item-header">
          <div class="gmail-item-from">${escapeHtml(from)}</div>
          <div class="gmail-item-date">${dateStr}</div>
        </div>
        <div class="gmail-item-subject">${escapeHtml(subject)}</div>
        <div class="gmail-item-snippet">${escapeHtml(snippet)}</div>
        ${(isStarred || isImportant) ? `
          <div class="gmail-item-labels">
            ${isStarred ? '<span class="gmail-label starred">⭐ 星标</span>' : ''}
            ${isImportant ? '<span class="gmail-label important">🔴 重要</span>' : ''}
          </div>
        ` : ''}
        <div class="gmail-item-actions">
          <button class="gmail-action-btn gmail-open-btn" data-message-id="${msg.id}">📧 打开</button>
          ${isUnread ? `<button class="gmail-action-btn gmail-read-btn" data-message-id="${msg.id}">✓ 标记已读</button>` : ''}
          <button class="gmail-action-btn gmail-star-btn" data-message-id="${msg.id}" data-starred="${isStarred}">
            ${isStarred ? '⭐ 取消星标' : '☆ 加星标'}
          </button>
          <button class="gmail-action-btn gmail-important-btn" data-message-id="${msg.id}" data-important="${isImportant}">
            ${isImportant ? '🔴 取消重要' : '⚪ 标记重要'}
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  // 绑定邮件卡片点击事件（点击查看详情）
  listDiv.querySelectorAll('.gmail-item').forEach(item => {
    item.addEventListener('click', function(e) {
      // 如果点击的是按钮，不触发详情查看
      if (e.target.classList.contains('gmail-action-btn') || 
          e.target.closest('.gmail-action-btn')) {
        return;
      }
      const messageId = this.dataset.id;
      showGmailDetail(messageId);
    });
  });
  
  // 使用事件委托绑定按钮点击事件
  listDiv.querySelectorAll('.gmail-open-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const messageId = this.dataset.messageId;
      openGmailInBrowser(messageId);
    });
  });
  
  listDiv.querySelectorAll('.gmail-read-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const messageId = this.dataset.messageId;
      markGmailAsRead(messageId);
    });
  });
  
  listDiv.querySelectorAll('.gmail-star-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const messageId = this.dataset.messageId;
      const isStarred = this.dataset.starred === 'true';
      toggleGmailStar(messageId, isStarred);
    });
  });
  
  listDiv.querySelectorAll('.gmail-important-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const messageId = this.dataset.messageId;
      const isImportant = this.dataset.important === 'true';
      toggleGmailImportant(messageId, isImportant);
    });
  });
}

function getHeader(message, headerName) {
  if (!message.payload || !message.payload.headers) return '';
  const header = message.payload.headers.find(h => h.name === headerName);
  return header ? header.value : '';
}

function formatGmailDate(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function openGmailInBrowser(messageId) {
  const url = `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
  window.open(url, '_blank');
}

async function markGmailAsRead(messageId) {
  try {
    // 禁用按钮，显示加载状态
    const btn = document.querySelector(`.gmail-read-btn[data-message-id="${messageId}"]`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ 处理中...';
    }
    
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${gmailAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          removeLabelIds: ['UNREAD']
        })
      }
    );
    
    if (response.ok) {
      console.log('邮件已标记为已读:', messageId);
      // 刷新邮件列表
      await loadGmailMessages();
    } else {
      const errorData = await response.json();
      console.error('标记已读失败:', errorData);
      alert('标记已读失败: ' + (errorData.error?.message || '请求失败'));
      // 恢复按钮
      if (btn) {
        btn.disabled = false;
        btn.textContent = '✓ 标记已读';
      }
    }
  } catch (error) {
    console.error('标记已读失败:', error);
    alert('标记已读失败: ' + error.message);
    // 恢复按钮
    const btn = document.querySelector(`.gmail-read-btn[data-message-id="${messageId}"]`);
    if (btn) {
      btn.disabled = false;
      btn.textContent = '✓ 标记已读';
    }
  }
}

async function toggleGmailStar(messageId, currentlyStarred) {
  try {
    // 禁用按钮，显示加载状态
    const btn = document.querySelector(`.gmail-star-btn[data-message-id="${messageId}"]`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ 处理中...';
    }
    
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${gmailAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(currentlyStarred ? {
          removeLabelIds: ['STARRED']
        } : {
          addLabelIds: ['STARRED']
        })
      }
    );
    
    if (response.ok) {
      console.log(currentlyStarred ? '已取消星标' : '已加星标', messageId);
      // 刷新邮件列表
      await loadGmailMessages();
    } else {
      const errorData = await response.json();
      console.error('操作失败:', errorData);
      alert('操作失败: ' + (errorData.error?.message || '请求失败'));
      // 恢复按钮
      if (btn) {
        btn.disabled = false;
        btn.textContent = currentlyStarred ? '⭐ 取消星标' : '☆ 加星标';
      }
    }
  } catch (error) {
    console.error('操作失败:', error);
    alert('操作失败: ' + error.message);
    // 恢复按钮
    const btn = document.querySelector(`.gmail-star-btn[data-message-id="${messageId}"]`);
    if (btn) {
      btn.disabled = false;
      btn.textContent = currentlyStarred ? '⭐ 取消星标' : '☆ 加星标';
    }
  }
}

async function toggleGmailImportant(messageId, currentlyImportant) {
  try {
    // 禁用按钮，显示加载状态
    const btn = document.querySelector(`.gmail-important-btn[data-message-id="${messageId}"]`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ 处理中...';
    }
    
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${gmailAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(currentlyImportant ? {
          removeLabelIds: ['IMPORTANT']
        } : {
          addLabelIds: ['IMPORTANT']
        })
      }
    );
    
    if (response.ok) {
      console.log(currentlyImportant ? '已取消重要' : '已标记重要', messageId);
      // 刷新邮件列表
      await loadGmailMessages();
    } else {
      const errorData = await response.json();
      console.error('操作失败:', errorData);
      alert('操作失败: ' + (errorData.error?.message || '请求失败'));
      // 恢复按钮
      if (btn) {
        btn.disabled = false;
        btn.textContent = currentlyImportant ? '🔴 取消重要' : '⚪ 标记重要';
      }
    }
  } catch (error) {
    console.error('操作失败:', error);
    alert('操作失败: ' + error.message);
    // 恢复按钮
    const btn = document.querySelector(`.gmail-important-btn[data-message-id="${messageId}"]`);
    if (btn) {
      btn.disabled = false;
      btn.textContent = currentlyImportant ? '🔴 取消重要' : '⚪ 标记重要';
    }
  }
}

// 静默标记已读（打开详情时自动调用，不显示UI反馈）
async function markGmailAsReadSilently(messageId) {
  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${gmailAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          removeLabelIds: ['UNREAD']
        })
      }
    );
    
    if (response.ok) {
      console.log('邮件已自动标记为已读:', messageId);
      // 静默刷新邮件列表，更新未读状态
      await loadGmailMessages();
    } else {
      console.warn('自动标记已读失败，但不影响查看');
    }
  } catch (error) {
    console.error('自动标记已读失败:', error);
    // 失败不提示用户，不影响查看体验
  }
}

// ===== Gmail 邮件过滤功能 =====

// 加载屏蔽发件人列表
function loadBlockedSenders() {
  chrome.storage.local.get(['gmailBlockedSenders'], function(result) {
    gmailBlockedSenders = result.gmailBlockedSenders || [];
  });
}

// 保存屏蔽发件人列表
function saveBlockedSenders() {
  chrome.storage.local.set({ gmailBlockedSenders: gmailBlockedSenders });
}

// 打开过滤设置弹窗
function openFilterSettings() {
  renderBlockedSendersList();
  document.getElementById('gmailFilterModal').style.display = 'flex';
}

// 关闭过滤设置弹窗
function closeFilterSettings() {
  document.getElementById('gmailFilterModal').style.display = 'none';
  document.getElementById('filterEmailInput').value = '';
}

// 渲染屏蔽列表
function renderBlockedSendersList() {
  const listDiv = document.getElementById('filterList');
  
  if (gmailBlockedSenders.length === 0) {
    listDiv.innerHTML = '<div class="filter-empty">暂无屏蔽规则，添加后将自动隐藏匹配的邮件</div>';
    return;
  }
  
  listDiv.innerHTML = gmailBlockedSenders.map((email, index) => `
    <div class="filter-item">
      <div class="filter-item-email">${escapeHtml(email)}</div>
      <div class="filter-item-actions">
        <button class="filter-remove-btn" data-index="${index}">🗑️ 删除</button>
      </div>
    </div>
  `).join('');
  
  // 绑定删除事件
  listDiv.querySelectorAll('.filter-remove-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const index = parseInt(this.dataset.index);
      removeBlockedSender(index);
    });
  });
}

// 添加屏蔽发件人
function addBlockedSender() {
  const input = document.getElementById('filterEmailInput');
  const email = input.value.trim();
  
  if (!email) {
    alert('请输入邮箱地址或匹配规则');
    return;
  }
  
  // 检查是否已存在
  if (gmailBlockedSenders.includes(email)) {
    alert('该规则已存在');
    return;
  }
  
  // 添加到列表
  gmailBlockedSenders.push(email);
  saveBlockedSenders();
  
  // 清空输入框
  input.value = '';
  
  // 重新渲染列表
  renderBlockedSendersList();
  
  // 刷新邮件列表
  filterGmailMessages();
}

// 删除屏蔽发件人
function removeBlockedSender(index) {
  if (confirm('确定要删除这条屏蔽规则吗？')) {
    gmailBlockedSenders.splice(index, 1);
    saveBlockedSenders();
    renderBlockedSendersList();
    
    // 刷新邮件列表
    filterGmailMessages();
  }
}

// 检查邮件是否被屏蔽
function isEmailBlocked(from) {
  if (!from) return false;
  
  const fromLower = from.toLowerCase();
  
  return gmailBlockedSenders.some(rule => {
    const ruleLower = rule.toLowerCase();
    
    // 支持多种匹配方式
    if (ruleLower.startsWith('@')) {
      // 域名匹配：@example.com
      return fromLower.includes(ruleLower);
    } else if (ruleLower.endsWith('@')) {
      // 前缀匹配：noreply@
      return fromLower.includes(ruleLower);
    } else if (ruleLower.includes('@')) {
      // 完整邮箱匹配
      return fromLower.includes(ruleLower);
    } else {
      // 部分匹配
      return fromLower.includes(ruleLower);
    }
  });
}

// ===== Gmail 邮件详情查看 =====

async function showGmailDetail(messageId) {
  const modal = document.getElementById('gmailDetailModal');
  const loadingDiv = document.getElementById('gmailDetailLoading');
  const contentDiv = document.getElementById('gmailDetailContent');
  
  // 显示弹窗和加载状态
  modal.style.display = 'flex';
  loadingDiv.style.display = 'block';
  contentDiv.innerHTML = '';
  
  try {
    // 获取完整的邮件详情
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          'Authorization': `Bearer ${gmailAccessToken}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`获取邮件详情失败: ${response.status}`);
    }
    
    const message = await response.json();
    
    // 隐藏加载状态
    loadingDiv.style.display = 'none';
    
    // 渲染邮件详情
    renderGmailDetail(message);
    
    // 如果是未读邮件，自动标记为已读
    const isUnread = message.labelIds && message.labelIds.includes('UNREAD');
    if (isUnread) {
      // 异步标记为已读，不阻塞界面
      markGmailAsReadSilently(messageId);
    }
    
  } catch (error) {
    console.error('加载邮件详情失败:', error);
    loadingDiv.style.display = 'none';
    contentDiv.innerHTML = `
      <div class="calendar-error">
        <div class="error-icon">⚠️</div>
        <p>加载邮件详情失败: ${error.message}</p>
      </div>
    `;
  }
}

function renderGmailDetail(message) {
  const contentDiv = document.getElementById('gmailDetailContent');
  
  const from = getHeader(message, 'From');
  const to = getHeader(message, 'To');
  const subject = getHeader(message, 'Subject') || '(无主题)';
  const date = new Date(parseInt(message.internalDate));
  const dateStr = date.toLocaleString('zh-CN');
  
  const isUnread = message.labelIds && message.labelIds.includes('UNREAD');
  const isStarred = message.labelIds && message.labelIds.includes('STARRED');
  const isImportant = message.labelIds && message.labelIds.includes('IMPORTANT');
  
  // 获取邮件正文
  let body = '';
  if (message.payload) {
    body = extractEmailBody(message.payload);
  }
  
  contentDiv.innerHTML = `
    <div class="gmail-detail-header">
      <div class="gmail-detail-subject">${escapeHtml(subject)}</div>
      ${(isUnread || isStarred || isImportant) ? `
        <div class="gmail-detail-labels-list">
          ${isUnread ? '<span class="gmail-label">📬 未读</span>' : ''}
          ${isStarred ? '<span class="gmail-label starred">⭐ 星标</span>' : ''}
          ${isImportant ? '<span class="gmail-label important">🔴 重要</span>' : ''}
        </div>
      ` : ''}
    </div>
    
    <div class="gmail-detail-meta">
      <div class="gmail-detail-meta-row">
        <div class="gmail-detail-label">发件人：</div>
        <div class="gmail-detail-value">${escapeHtml(from)}</div>
      </div>
      <div class="gmail-detail-meta-row">
        <div class="gmail-detail-label">收件人：</div>
        <div class="gmail-detail-value">${escapeHtml(to)}</div>
      </div>
      <div class="gmail-detail-meta-row">
        <div class="gmail-detail-label">时间：</div>
        <div class="gmail-detail-value">${dateStr}</div>
      </div>
    </div>
    
    <div class="gmail-detail-body">
      <div class="gmail-detail-body-content">${body || message.snippet || '(无内容)'}</div>
    </div>
    
    <div class="gmail-detail-actions">
      <button class="btn btn-primary gmail-detail-open-btn" data-message-id="${message.id}">
        📧 在 Gmail 中打开
      </button>
      <button class="btn btn-secondary gmail-detail-close-btn">
        关闭
      </button>
    </div>
  `;
  
  // 绑定按钮事件
  const openBtn = contentDiv.querySelector('.gmail-detail-open-btn');
  if (openBtn) {
    openBtn.addEventListener('click', function() {
      const messageId = this.dataset.messageId;
      openGmailInBrowser(messageId);
    });
  }
  
  const closeBtn = contentDiv.querySelector('.gmail-detail-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeGmailDetailModal);
  }
}

// 提取邮件正文
function extractEmailBody(payload) {
  if (!payload) return '';
  
  // 尝试获取 text/plain 部分
  if (payload.body && payload.body.data) {
    return decodeBase64(payload.body.data);
  }
  
  // 递归查找 parts
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        return decodeBase64(part.body.data);
      }
      
      // 递归查找子部分
      if (part.parts) {
        const body = extractEmailBody(part);
        if (body) return body;
      }
    }
    
    // 如果没有 text/plain，尝试 text/html
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body && part.body.data) {
        const html = decodeBase64(part.body.data);
        // 简单去除 HTML 标签
        return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
      }
    }
  }
  
  return '';
}

// Base64 URL-safe 解码
function decodeBase64(str) {
  try {
    // 替换 URL-safe 字符
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    // 补齐 padding
    while (str.length % 4) {
      str += '=';
    }
    return decodeURIComponent(escape(atob(str)));
  } catch (e) {
    console.error('Base64 解码失败:', e);
    return '(无法解码邮件内容)';
  }
}

// 关闭详情弹窗
function closeGmailDetailModal() {
  document.getElementById('gmailDetailModal').style.display = 'none';
}

// 绑定关闭按钮
document.getElementById('closeGmailDetail')?.addEventListener('click', closeGmailDetailModal);

// 点击弹窗外部关闭
document.getElementById('gmailDetailModal')?.addEventListener('click', function(e) {
  if (e.target === this) {
    closeGmailDetailModal();
  }
});

// ===== FMS 链接初始化 =====
function initFmsLinks() {
  // 获取所有环境标签按钮
  const envTabs = document.querySelectorAll('.fms-env-tab');
  const marketsContainers = document.querySelectorAll('.fms-markets');
  
  // 为每个标签添加点击事件
  envTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const env = this.dataset.env;
      
      // 移除所有active状态
      envTabs.forEach(t => t.classList.remove('active'));
      marketsContainers.forEach(m => m.classList.remove('active'));
      
      // 添加当前active状态
      this.classList.add('active');
      const targetMarkets = document.querySelector(`.fms-markets[data-env="${env}"]`);
      if (targetMarkets) {
        targetMarkets.classList.add('active');
      }
    });
  });
}

// ========================================
// 通用 Toast 提示函数
// ========================================
function showToast(message, duration = 3000) {
  // 检查是否已有 toast
  let toast = document.querySelector('.spx-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'spx-toast';
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(-20px);
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-size: 14px;
      opacity: 0;
      transition: all 0.3s ease;
      pointer-events: none;
      max-width: 80%;
      text-align: center;
    `;
    document.body.appendChild(toast);
  }
  
  toast.textContent = message;
  
  // 显示动画
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  
  // 自动隐藏
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-20px)';
  }, duration);
}

// ===== 站点查询工具 =====
// 站点查询 - 使用 ApiMart 接口
const STATION_API_URL = 'https://mgmt-data.ssc.test.shopeemobile.com/api_mart/mgmt_app/data_api/internal_search';

// ========================================
// ClickHouse 直连配置（TEST 环境）
// ========================================
const TEST_CLICKHOUSE_CONFIG = {
  host: 'clickhouse-k8s-sg-prod.data-infra.shopee.io',
  port: '443',
  user: 'spx_mart-cluster_szsc_data_shared_online',
  password: 'RtL3jHWkDoHp',
  database: 'spx_mart_pub'
};

/**
 * 直接连接 TEST 环境 ClickHouse 执行 SQL
 * 
 * 用途：数据同步（从 LIVE 同步到 TEST）
 * 
 * @param {string} sql - SQL 语句（支持 SELECT、INSERT 等）
 * @returns {Promise<Object>} - { success: boolean, data?: string, error?: string }
 */
async function executeTestClickHouseSQL(sql) {
  try {
    console.log('🔵 [TEST ClickHouse 直连] 开始执行');
    console.log('📝 SQL:', sql);
    
    const config = TEST_CLICKHOUSE_CONFIG;
    
    // 构建 ClickHouse HTTP 接口 URL
    const url = `https://${config.host}:${config.port}/`;
    
    // 创建 Basic Auth
    const basicAuth = btoa(`${config.user}:${config.password}`);
    
    console.log('🌐 连接到:', url);
    console.log('🔑 认证方式: Basic Auth');
    console.log('📊 数据库:', config.database);
    
    // 发送请求到 ClickHouse
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'text/plain'
      },
      body: sql
    });
    
    console.log('📡 响应状态:', response.status);
    
    // 获取响应文本
    const responseText = await response.text();
    console.log('📄 响应内容:', responseText.substring(0, 500));
    
    // 检查响应状态
    if (!response.ok) {
      console.error('❌ 请求失败:', responseText);
      return {
        success: false,
        error: `HTTP ${response.status}: ${responseText}`
      };
    }
    
    // 成功
    console.log('✅ SQL 执行成功');
    return {
      success: true,
      data: responseText
    };
    
  } catch (error) {
    console.error('❌ 执行异常:', error);
    return {
      success: false,
      error: error.message || '执行失败'
    };
  }
}

// 通用的 ClickHouse SQL 执行函数（通过 internal_search API，查询 LIVE 数据）
async function executeClickHouseSQL(sql) {
  /**
   * 通过 API 执行 ClickHouse SQL（查询 LIVE 环境数据）
   * 
   * 用途：站点查询等（后端连接 LIVE ClickHouse）
   * 
   * @param {string} sql - SQL 语句（必须以 ", 1 as flag" 结尾）
   * @returns {Promise<Object>} - 返回格式：{ success: boolean, data?: any, error?: string }
   */
  try {
    console.log('🔵 [ClickHouse SQL 执行器 - API] 开始执行');
    console.log('📝 SQL:', sql);
    
    // 生成 JWT Token
    const jwtToken = await generateApiMartJwtToken();
    console.log('🔑 JWT Token 已生成');
    
    // 发送请求
    const response = await fetch(STATION_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'jwt-token': jwtToken
      },
      body: JSON.stringify({ sql })
    });
    
    console.log('📡 响应状态:', response.status);
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ 请求失败:', errorText);
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`
      };
    }
    
    // 解析响应
    const result = await response.json();
    console.log('📊 响应数据:', result);
    
    // 检查业务状态码
    if (result.retcode !== 0) {
      console.error('❌ 业务错误:', result);
      return {
        success: false,
        error: result.message || '未知错误'
      };
    }
    
    // 成功返回数据
    console.log('✅ SQL 执行成功');
    return {
      success: true,
      data: result.data
    };
    
  } catch (error) {
    console.error('❌ 执行异常:', error);
    return {
      success: false,
      error: error.message || '执行失败'
    };
  }
}

// 切换查询类型（ID / 名称）
document.querySelectorAll('.station-search-tab').forEach(tab => {
  tab.addEventListener('click', function() {
    const searchType = this.dataset.searchType;
    
    // 切换标签状态
    document.querySelectorAll('.station-search-tab').forEach(t => t.classList.remove('active'));
    this.classList.add('active');
    
    // 切换面板
    document.querySelectorAll('.station-search-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`station-search-${searchType}`).classList.add('active');
  });
});

// 按站点 ID 查询
document.getElementById('searchStationById')?.addEventListener('click', async function() {
  const stationId = document.getElementById('stationIdInput').value.trim();
  const market = document.getElementById('stationMarketSelect').value;
  
  if (!stationId) {
    showStationError('请输入站点 ID');
    return;
  }
  
  await queryStationById(stationId, market);
});

// 按站点名称查询
document.getElementById('searchStationByName')?.addEventListener('click', async function() {
  const stationName = document.getElementById('stationNameInput').value.trim();
  const market = document.getElementById('stationMarketSelectName').value;
  
  if (!stationName) {
    showStationError('请输入站点名称关键词');
    return;
  }
  
  await queryStationByName(stationName, market);
});

// 回车键触发查询
document.getElementById('stationIdInput')?.addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    document.getElementById('searchStationById').click();
  }
});

document.getElementById('stationNameInput')?.addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    document.getElementById('searchStationByName').click();
  }
});

// 查询站点 ID
async function queryStationById(stationId, market = '') {
  const resultsContainer = document.getElementById('stationResults');
  resultsContainer.innerHTML = '<div class="station-loading"><div class="station-loading-spinner"></div><div class="station-loading-text">查询中...</div></div>';
  
  console.log('=== 开始查询站点 ID ===');
  console.log('📋 输入参数:', { stationId, market });
  
  try {
    // 生成 JWT Token
    console.log('🔑 生成 JWT Token...');
    const jwtToken = await generateApiMartJwtToken();
    console.log('🔑 JWT Token:', jwtToken.substring(0, 50) + '...');
    
    // 构造 SQL 查询
    const markets = ['sg', 'id', 'my', 'th', 'ph', 'vn', 'tw', 'br'];
    const targetMarkets = market ? [market] : markets;
    console.log('🎯 目标市场:', targetMarkets);
    
    // 构造 UNION ALL 查询以支持跨市场查询
    const sqlParts = targetMarkets.map(m => 
      `SELECT '${m}' as market, station_id, station_name, station_type, status, city_name, district_id, latitude, longitude, manager, manager_email, director, director_email, is_active_site_l7d, station_region, station_area, station_sub_area, is_own_fleet, xpt_flag, address, bi_station_type, 1 as flag FROM spx_mart_manage_app.dim_spx_station_tab_${m}_all WHERE station_id = ${stationId}`
    );
    const sql = sqlParts.join(' UNION ALL ');
    
    console.log('📝 查询 SQL:', sql);
    console.log('📝 SQL 长度:', sql.length);
    
    const startTime = Date.now();
    console.log('🌐 发送请求到:', STATION_API_URL);
    
    const response = await fetch(STATION_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'jwt-token': jwtToken
      },
      body: JSON.stringify({ sql })
    });
    
    console.log('📡 响应状态:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ 响应错误:', errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    const queryTime = ((Date.now() - startTime) / 1000).toFixed(2) + 's';
    
    console.log('✅ 查询结果:', result);
    console.log('✅ result.data:', result.data);
    console.log('✅ result.data.list:', result.data?.list);
    console.log('✅ 数据长度:', result.data?.list?.length);
    console.log('✅ 查询耗时:', queryTime);
    
    // 检查返回数据 (数据在 result.data.list 数组中)
    if (result && result.retcode === 0 && result.data && result.data.list && Array.isArray(result.data.list) && result.data.list.length > 0) {
      console.log('✅ 渲染结果...');
      renderStationResults(result.data.list, queryTime);
    } else {
      console.warn('⚠️ 未找到数据');
      showStationEmpty(`未找到站点 ID: ${stationId}`);
    }
  } catch (error) {
    console.error('❌ 查询失败:', error);
    console.error('❌ 错误堆栈:', error.stack);
    showStationError(`查询失败: ${error.message}`);
  }
  
  console.log('=== 查询结束 ===');
}

// 查询站点名称
async function queryStationByName(stationName, market = '') {
  const resultsContainer = document.getElementById('stationResults');
  resultsContainer.innerHTML = '<div class="station-loading"><div class="station-loading-spinner"></div><div class="station-loading-text">搜索中...</div></div>';
  
  console.log('=== 开始搜索站点名称 ===');
  console.log('📋 输入参数:', { stationName, market });
  
  try {
    // 生成 JWT Token
    console.log('🔑 生成 JWT Token...');
    const jwtToken = await generateApiMartJwtToken();
    console.log('🔑 JWT Token:', jwtToken.substring(0, 50) + '...');
    
    // 构造 SQL 查询（使用 LIKE 模糊匹配）
    const markets = ['sg', 'id', 'my', 'th', 'ph', 'vn', 'tw', 'br'];
    const targetMarkets = market ? [market] : markets;
    console.log('🎯 目标市场:', targetMarkets);
    
    // 构造 UNION ALL 查询以支持跨市场查询
    const sqlParts = targetMarkets.map(m => 
      `SELECT '${m}' as market, station_id, station_name, station_type, status, city_name, district_id, latitude, longitude, manager, manager_email, director, director_email, is_active_site_l7d, station_region, station_area, station_sub_area, is_own_fleet, xpt_flag, address, bi_station_type, 1 as flag FROM spx_mart_manage_app.dim_spx_station_tab_${m}_all WHERE station_name LIKE '%${stationName}%' LIMIT 50`
    );
    const sql = sqlParts.join(' UNION ALL ');
    
    console.log('📝 搜索 SQL:', sql);
    console.log('📝 SQL 长度:', sql.length);
    
    const startTime = Date.now();
    console.log('🌐 发送请求到:', STATION_API_URL);
    
    const response = await fetch(STATION_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'jwt-token': jwtToken
      },
      body: JSON.stringify({ sql })
    });
    
    console.log('📡 响应状态:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ 响应错误:', errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    const queryTime = ((Date.now() - startTime) / 1000).toFixed(2) + 's';
    
    console.log('✅ 搜索结果:', result);
    console.log('✅ result.data:', result.data);
    console.log('✅ result.data.list:', result.data?.list);
    console.log('✅ 数据长度:', result.data?.list?.length);
    console.log('✅ 查询耗时:', queryTime);
    
    // 检查返回数据 (数据在 result.data.list 数组中)
    if (result && result.retcode === 0 && result.data && result.data.list && Array.isArray(result.data.list) && result.data.list.length > 0) {
      console.log('✅ 渲染结果...');
      renderStationResults(result.data.list, queryTime);
    } else {
      console.warn('⚠️ 未找到数据');
      showStationEmpty(`未找到包含 "${stationName}" 的站点`);
    }
  } catch (error) {
    console.error('❌ 搜索失败:', error);
    console.error('❌ 错误堆栈:', error.stack);
    showStationError(`搜索失败: ${error.message}`);
  }
  
  console.log('=== 搜索结束 ===');
}

// 渲染查询结果
function renderStationResults(stations, queryTime) {
  const resultsContainer = document.getElementById('stationResults');
  
  let html = `<div class="station-results-header" style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #667eea;">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span style="font-weight: 600; color: #333;">找到 ${stations.length} 个站点</span>
      <span style="font-size: 12px; color: #999;">耗时: ${queryTime}</span>
    </div>
  </div>`;
  
  stations.forEach(station => {
    const statusText = station.status === 1 ? '✅ 正常' : '❌ 停用';
    const activeText = station.is_active_site_l7d === 1 ? '✅ 活跃' : '⚪ 不活跃';
    
    html += `
      <div class="station-result-card">
        <div class="station-result-header">
          <div class="station-result-title">${station.station_name || '-'}</div>
          <div class="station-result-market">${(station.market || '').toUpperCase()}</div>
        </div>
        <div class="station-result-body">
          <div class="station-result-field">
            <div class="station-result-label">站点 ID</div>
            <div class="station-result-value highlight">${station.station_id}</div>
          </div>
          <div class="station-result-field">
            <div class="station-result-label">类型</div>
            <div class="station-result-value">${station.bi_station_type || '-'}</div>
          </div>
          <div class="station-result-field">
            <div class="station-result-label">状态</div>
            <div class="station-result-value">${statusText}</div>
          </div>
          <div class="station-result-field">
            <div class="station-result-label">活跃状态</div>
            <div class="station-result-value">${activeText}</div>
          </div>
          <div class="station-result-field">
            <div class="station-result-label">城市</div>
            <div class="station-result-value">${station.city_name || '-'}</div>
          </div>
          <div class="station-result-field">
            <div class="station-result-label">区域</div>
            <div class="station-result-value">${station.station_region || '-'}</div>
          </div>
          <div class="station-result-field">
            <div class="station-result-label">经理</div>
            <div class="station-result-value">${station.manager || '-'}</div>
          </div>
          <div class="station-result-field">
            <div class="station-result-label">经理邮箱</div>
            <div class="station-result-value" style="font-size: 12px;">${station.manager_email || '-'}</div>
          </div>
          <div class="station-result-field">
            <div class="station-result-label">坐标</div>
            <div class="station-result-value" style="font-size: 12px;">${station.latitude || '-'}, ${station.longitude || '-'}</div>
          </div>
          <div class="station-result-field" style="grid-column: 1 / -1;">
            <div class="station-result-label">地址</div>
            <div class="station-result-value" style="font-size: 12px;">${station.address || '-'}</div>
          </div>
        </div>
        <div class="station-result-actions">
          <button class="btn btn-secondary btn-small copy-station-id" data-id="${station.station_id}">📋 复制 ID</button>
          <button class="btn btn-secondary btn-small copy-station-info" data-info='${JSON.stringify(station).replace(/'/g, "&apos;")}'>📄 复制详情</button>
        </div>
      </div>
    `;
  });
  
  resultsContainer.innerHTML = html;
  
  // 绑定复制事件
  document.querySelectorAll('.copy-station-id').forEach(btn => {
    btn.addEventListener('click', function() {
      const stationId = this.dataset.id;
      copyToClipboard(stationId);
      showToast('✅ 站点 ID 已复制到剪贴板');
    });
  });
  
  document.querySelectorAll('.copy-station-info').forEach(btn => {
    btn.addEventListener('click', function() {
      const info = JSON.parse(this.dataset.info);
      const text = `站点信息:\n` +
        `市场: ${info.market}\n` +
        `站点ID: ${info.station_id}\n` +
        `站点名称: ${info.station_name}\n` +
        `类型: ${info.bi_station_type}\n` +
        `城市: ${info.city_name}\n` +
        `经理: ${info.manager} (${info.manager_email})\n` +
        `地址: ${info.address}`;
      
      copyToClipboard(text);
      showToast('✅ 站点详情已复制到剪贴板');
    });
  });
}

// 显示空状态
function showStationEmpty(message) {
  const resultsContainer = document.getElementById('stationResults');
  resultsContainer.innerHTML = `
    <div class="station-empty">
      <div class="station-empty-icon">🔍</div>
      <div class="station-empty-text">${message}</div>
    </div>
  `;
}

// 显示错误
function showStationError(message) {
  const resultsContainer = document.getElementById('stationResults');
  resultsContainer.innerHTML = `
    <div class="station-error">
      <div class="station-error-icon">⚠️</div>
      <div>${message}</div>
    </div>
  `;
}

// 测试连接


// ========================================
// 数据同步工具 (LIVE → TEST)
// ========================================

// 获取选中的市场列表
function getSelectedMarkets() {
  const checkboxes = document.querySelectorAll('.market-checkbox:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

// 更新选中市场的提示
function updateSelectedMarketsHint() {
  const markets = getSelectedMarkets();
  const hint = document.getElementById('selectedMarketsHint');
  if (hint) {
    if (markets.length > 0) {
      hint.textContent = `已选择: ${markets.map(m => m.toUpperCase()).join(', ')}`;
      hint.style.color = '#667eea';
      hint.style.fontWeight = '500';
    } else {
      hint.textContent = '请至少选择一个市场';
      hint.style.color = '#ff5252';
      hint.style.fontWeight = '500';
    }
  }
}

// 市场复选框事件监听
document.querySelectorAll('.market-checkbox').forEach(checkbox => {
  checkbox.addEventListener('change', () => {
    updateSelectedMarketsHint();
    updateSyncTablePreview();
  });
});

// 全选按钮
document.getElementById('selectAllMarkets')?.addEventListener('click', () => {
  document.querySelectorAll('.market-checkbox').forEach(cb => cb.checked = true);
  updateSelectedMarketsHint();
  updateSyncTablePreview();
});

// 清空按钮
document.getElementById('clearAllMarkets')?.addEventListener('click', () => {
  document.querySelectorAll('.market-checkbox').forEach(cb => cb.checked = false);
  updateSelectedMarketsHint();
  updateSyncTablePreview();
});

// 初始化市场选择提示
updateSelectedMarketsHint();

// 更新表名预览
function updateSyncTablePreview() {
  const template = document.getElementById('syncTableTemplate')?.value || '';
  const markets = getSelectedMarkets();
  const database = document.getElementById('syncDatabase')?.value || '';
  
  const previewDiv = document.getElementById('syncTablePreview');
  if (!previewDiv) return;
  
  if (template && markets.length > 0 && database) {
    if (markets.length === 1) {
      const fullTableName = `${database}.${template}_${markets[0]}_all`;
      previewDiv.textContent = fullTableName;
    } else {
      const tableNames = markets.map(m => `${database}.${template}_${m}_all`).join('\n');
      previewDiv.innerHTML = tableNames.replace(/\n/g, '<br>');
    }
  } else {
    previewDiv.textContent = '-';
  }
}

// 监听输入变化
document.getElementById('syncTableTemplate')?.addEventListener('input', updateSyncTablePreview);
document.getElementById('syncDatabase')?.addEventListener('input', updateSyncTablePreview);

// 初始化预览
updateSyncTablePreview();

// 步骤 1: 验证源数据
document.getElementById('verifySyncSourceBtn')?.addEventListener('click', async function() {
  const btn = this;
  const statusDiv = document.getElementById('syncStatus');
  const executeSyncBtn = document.getElementById('executeSyncBtn');
  
  // 获取配置
  const sourceHost = document.getElementById('syncSourceHost').value;
  const template = document.getElementById('syncTableTemplate').value.trim();
  const markets = getSelectedMarkets();
  const database = document.getElementById('syncDatabase').value.trim();
  
  // 验证输入
  if (!template) {
    statusDiv.className = 'sync-status error';
    statusDiv.innerHTML = '<div class="sync-status-title">❌ 输入错误</div><div>请输入表名模板</div>';
    return;
  }
  
  if (markets.length === 0) {
    statusDiv.className = 'sync-status error';
    statusDiv.innerHTML = '<div class="sync-status-title">❌ 输入错误</div><div>请至少选择一个市场</div>';
    return;
  }
  
  if (!database) {
    statusDiv.className = 'sync-status error';
    statusDiv.innerHTML = '<div class="sync-status-title">❌ 输入错误</div><div>请输入数据库名</div>';
    return;
  }
  
  // 禁用按钮
  btn.disabled = true;
  btn.textContent = '🔍 验证中...';
  executeSyncBtn.disabled = true;
  
  // 显示加载状态
  statusDiv.className = 'sync-status loading';
  statusDiv.innerHTML = `<div class="sync-status-title">🔍 正在验证 ${markets.length} 个市场的源数据...</div>`;
  
  try {
    const results = [];
    
    // 验证每个市场
    for (const market of markets) {
      const sourceTable = `${database}.${template}_${market}_all`;
      
      console.log(`=== 验证源数据: ${market.toUpperCase()} ===`);
      console.log('源表:', sourceTable);
      
      try {
        // 查询源表数据量
        const sql = `
          SELECT 
            count() as row_count,
            '${market}' as market
          FROM remote(
            '${sourceHost}',
            '${sourceTable}',
            'spx_mart',
            'RtL3jHWkDoHp'
          )
          FORMAT JSON
        `;
        
        const result = await executeTestClickHouseSQL(sql);
        
        if (result.success) {
          const data = JSON.parse(result.data);
          const rowCount = data.data[0].row_count;
          results.push({
            market: market.toUpperCase(),
            table: sourceTable,
            rowCount: rowCount,
            success: true
          });
          console.log(`✅ ${market.toUpperCase()}: ${rowCount} 行`);
        } else {
          results.push({
            market: market.toUpperCase(),
            table: sourceTable,
            error: result.error,
            success: false
          });
          console.error(`❌ ${market.toUpperCase()}: ${result.error}`);
        }
      } catch (error) {
        results.push({
          market: market.toUpperCase(),
          table: sourceTable,
          error: error.message,
          success: false
        });
        console.error(`❌ ${market.toUpperCase()}: ${error.message}`);
      }
    }
    
    // 统计结果
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    // 显示结果
    if (failCount === 0) {
      // 全部成功
      statusDiv.className = 'sync-status success';
      let html = `
        <div class="sync-status-title">✅ 源数据验证成功 (${successCount}/${markets.length})</div>
        <div style="margin-top: 10px;">
      `;
      
      results.forEach(r => {
        html += `
          <div style="padding: 6px 0; border-bottom: 1px solid #e0e0e0;">
            <strong>${r.market}</strong>: ${r.rowCount.toLocaleString()} 行
            <div style="font-size: 11px; color: #666;">${r.table}</div>
          </div>
        `;
      });
      
      html += `
        </div>
        <div style="margin-top: 15px; padding: 10px; background: #fff3e1; border-radius: 4px; color: #f57c00;">
          ⚠️ 准备好后，点击"执行同步"开始同步数据到 TEST 环境
        </div>
      `;
      
      statusDiv.innerHTML = html;
      executeSyncBtn.disabled = false;
      
    } else {
      // 部分或全部失败
      statusDiv.className = 'sync-status error';
      let html = `
        <div class="sync-status-title">⚠️ 验证完成：${successCount} 成功，${failCount} 失败</div>
        <div style="margin-top: 10px;">
      `;
      
      results.forEach(r => {
        if (r.success) {
          html += `
            <div style="padding: 6px 0; border-bottom: 1px solid #e0e0e0; color: #2e7d32;">
              ✅ <strong>${r.market}</strong>: ${r.rowCount.toLocaleString()} 行
            </div>
          `;
        } else {
          html += `
            <div style="padding: 6px 0; border-bottom: 1px solid #e0e0e0; color: #c62828;">
              ❌ <strong>${r.market}</strong>: ${r.error}
            </div>
          `;
        }
      });
      
      html += `</div>`;
      
      if (successCount > 0) {
        html += `
          <div style="margin-top: 15px; padding: 10px; background: #fff3e1; border-radius: 4px; color: #f57c00;">
            💡 你可以只同步验证成功的市场，取消失败市场的勾选后重新验证
          </div>
        `;
      }
      
      statusDiv.innerHTML = html;
      executeSyncBtn.disabled = successCount === 0; // 如果有成功的，允许同步
    }
    
  } catch (error) {
    console.error('❌ 验证过程出错:', error);
    
    statusDiv.className = 'sync-status error';
    statusDiv.innerHTML = `
      <div class="sync-status-title">❌ 验证过程出错</div>
      <div>${error.message}</div>
    `;
    
    executeSyncBtn.disabled = true;
    
  } finally {
    // 恢复按钮
    btn.disabled = false;
    btn.textContent = '1️⃣ 验证源数据';
  }
});

// 步骤 2: 执行同步
document.getElementById('executeSyncBtn')?.addEventListener('click', async function() {
  const btn = this;
  const statusDiv = document.getElementById('syncStatus');
  const verifyResultBtn = document.getElementById('verifySyncResultBtn');
  
  // 获取配置
  const sourceHost = document.getElementById('syncSourceHost').value;
  const template = document.getElementById('syncTableTemplate').value.trim();
  const markets = getSelectedMarkets();
  const database = document.getElementById('syncDatabase').value.trim();
  const syncMode = document.getElementById('syncMode').value;
  
  if (markets.length === 0) {
    statusDiv.className = 'sync-status error';
    statusDiv.innerHTML = '<div class="sync-status-title">❌ 请至少选择一个市场</div>';
    return;
  }
  
  // 确认操作
  const confirmMsg = `确认要${syncMode === 'full_ddl' ? '清空并重新导入' : '追加'} ${markets.length} 个市场的数据吗？\n\n市场: ${markets.map(m => m.toUpperCase()).join(', ')}`;
  if (!confirm(confirmMsg)) {
    return;
  }
  
  // 禁用按钮
  btn.disabled = true;
  btn.textContent = '⏳ 同步中...';
  verifyResultBtn.disabled = true;
  
  // 显示加载状态
  statusDiv.className = 'sync-status loading';
  statusDiv.innerHTML = `<div class="sync-status-title">🔄 正在同步 ${markets.length} 个市场...</div>`;
  
  try {
    const results = [];
    
    // 同步每个市场
    for (let i = 0; i < markets.length; i++) {
      const market = markets[i];
      // LIVE环境使用用户输入的数据库名，TEST环境固定使用spx_mart_pub
      const sourceTable = `${database}.${template}_${market}_all`;
      const testDatabase = 'spx_mart_pub';  // TEST环境固定数据库名
      const targetTableAll = `${testDatabase}.${template}_${market}_all`;
      const targetTableLocal = `${testDatabase}.${template}_${market}_local`;
      
      statusDiv.innerHTML = `<div class="sync-status-title">🔄 正在同步 ${market.toUpperCase()} (${i+1}/${markets.length})...</div>`;
      
      console.log(`=== 开始同步: ${market.toUpperCase()} ===`);
      console.log(`源: ${sourceTable} (LIVE)`);
      console.log(`目标: ${targetTableAll} (TEST)`);
      
      try {
        if (syncMode === 'full_ddl') {
          // 完整同步模式：清空local表 + 写入all表
          console.log('步骤 1: 清空TEST的local表数据...');
          
          // 清空local表（实际存储数据的表）
          const truncateSQL = `TRUNCATE TABLE IF EXISTS ${targetTableLocal}`;
          const truncateResult = await executeTestClickHouseSQL(truncateSQL);
          
          if (!truncateResult.success) {
            // 检测表不存在的情况
            if (truncateResult.error && truncateResult.error.includes('does not exist')) {
              throw new Error(
                `表不存在: ${targetTableLocal}\n\n` +
                `⚠️ 完整同步模式要求local表已提前创建\n` +
                `请联系DBA创建表结构，或使用追加模式`
              );
            }
            throw new Error(`清空local表失败: ${truncateResult.error}`);
          }
          
          console.log('✅ 表已清空');
          
        }
        
        // 导入数据（写入all表，自动路由到local表）
        console.log('步骤 2: 通过all表导入数据...');
        
        const insertSQL = `
          INSERT INTO ${targetTableAll}
          SELECT * FROM remote(
            '${sourceHost}',
            '${sourceTable}',
            'spx_mart',
            'RtL3jHWkDoHp'
          )
        `;
        
        const insertResult = await executeTestClickHouseSQL(insertSQL);
        
        if (!insertResult.success) {
          // 分析错误类型
          const errorMsg = insertResult.error;
          
          if (errorMsg.includes('does not exist') || errorMsg.includes('Table') && errorMsg.includes('not found')) {
            throw new Error(
              `表不存在: ${targetTableAll}\n\n` +
              `💡 解决方案:\n` +
              `1. 联系DBA创建TEST环境的表结构\n` +
              `2. 或检查表名、数据库名是否正确`
            );
          } else if (errorMsg.includes('Column') || errorMsg.includes('type mismatch') || errorMsg.includes('Structure')) {
            throw new Error(
              `表结构不匹配\n\n` +
              `⚠️ LIVE和TEST的表结构不一致，需要手动修改表结构\n\n` +
              `💡 解决方案:\n` +
              `1. 联系DBA同步表结构\n` +
              `2. 手动执行ALTER TABLE修改列定义\n\n` +
              `详细错误: ${errorMsg}`
            );
          } else {
            throw new Error(`导入数据失败: ${errorMsg}`);
          }
        }
        
        console.log(`✅ ${market.toUpperCase()} 同步成功`);
        
        results.push({
          market: market.toUpperCase(),
          success: true
        });
        
      } catch (error) {
        console.error(`❌ ${market.toUpperCase()} 同步失败:`, error);
        
        results.push({
          market: market.toUpperCase(),
          success: false,
          error: error.message
        });
      }
    }
    
    // 统计结果
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    // 显示结果
    if (failCount === 0) {
      // 全部成功
      statusDiv.className = 'sync-status success';
      let html = `
        <div class="sync-status-title">✅ 同步完成 (${successCount}/${markets.length})</div>
        <div style="margin-top: 10px;">
      `;
      
      results.forEach(r => {
        html += `<div style="padding: 4px 0; color: #2e7d32;">✅ ${r.market}</div>`;
      });
      
      html += `
        </div>
        <div style="margin-top: 15px; padding: 10px; background: #e3f2fd; border-radius: 4px; color: #1976d2;">
          💡 点击"验证结果"查看 TEST 环境的数据
        </div>
      `;
      
      statusDiv.innerHTML = html;
      verifyResultBtn.disabled = false;
      
    } else {
      // 部分或全部失败
      statusDiv.className = 'sync-status error';
      let html = `
        <div class="sync-status-title">⚠️ 同步完成：${successCount} 成功，${failCount} 失败</div>
        <div style="margin-top: 10px;">
      `;
      
      results.forEach(r => {
        if (r.success) {
          html += `<div style="padding: 4px 0; color: #2e7d32;">✅ ${r.market}</div>`;
        } else {
          html += `
            <div style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
              <div style="color: #c62828; font-weight: bold;">❌ ${r.market}</div>
              <div style="font-size: 11px; color: #666; margin-top: 4px; white-space: pre-wrap;">${r.error}</div>
            </div>
          `;
        }
      });
      
      html += `</div>`;
      
      statusDiv.innerHTML = html;
      verifyResultBtn.disabled = successCount === 0;
    }
    
  } catch (error) {
    console.error('❌ 同步过程出错:', error);
    
    statusDiv.className = 'sync-status error';
    statusDiv.innerHTML = `
      <div class="sync-status-title">❌ 同步过程出错</div>
      <div style="white-space: pre-wrap;">${error.message}</div>
    `;
    
  } finally {
    // 恢复按钮
    btn.disabled = false;
    btn.textContent = '2️⃣ 执行同步';
  }
});

// 步骤 3: 验证结果
document.getElementById('verifySyncResultBtn')?.addEventListener('click', async function() {
  const btn = this;
  const statusDiv = document.getElementById('syncStatus');
  
  // 获取配置
  const template = document.getElementById('syncTableTemplate').value.trim();
  const markets = getSelectedMarkets();
  const database = document.getElementById('syncDatabase').value.trim();
  
  if (markets.length === 0) {
    statusDiv.className = 'sync-status error';
    statusDiv.innerHTML = '<div class="sync-status-title">❌ 请至少选择一个市场</div>';
    return;
  }
  
  // 禁用按钮
  btn.disabled = true;
  btn.textContent = '🔍 验证中...';
  
  // 显示加载状态
  statusDiv.className = 'sync-status loading';
  statusDiv.innerHTML = `<div class="sync-status-title">🔍 正在验证 ${markets.length} 个市场的 TEST 环境数据...</div>`;
  
  try {
    const results = [];
    
    // 验证每个市场
    for (const market of markets) {
      const testDatabase = 'spx_mart_pub';  // TEST环境固定数据库名
      const targetTable = `${testDatabase}.${template}_${market}_all`;
      
      console.log(`=== 验证结果: ${market.toUpperCase()} ===`);
      console.log('表:', targetTable);
      
      try {
        // 查询 TEST 环境的表数据
        const sql = `
          SELECT count() as row_count
          FROM ${targetTable}
          FORMAT JSON
        `;
        
        const result = await executeTestClickHouseSQL(sql);
        
        if (result.success) {
          const data = JSON.parse(result.data);
          const rowCount = data.data[0].row_count;
          results.push({
            market: market.toUpperCase(),
            table: targetTable,
            rowCount: rowCount,
            success: true
          });
          console.log(`✅ ${market.toUpperCase()}: ${rowCount} 行`);
        } else {
          results.push({
            market: market.toUpperCase(),
            table: targetTable,
            error: result.error,
            success: false
          });
          console.error(`❌ ${market.toUpperCase()}: ${result.error}`);
        }
      } catch (error) {
        results.push({
          market: market.toUpperCase(),
          table: targetTable,
          error: error.message,
          success: false
        });
        console.error(`❌ ${market.toUpperCase()}: ${error.message}`);
      }
    }
    
    // 统计结果
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    // 显示结果
    if (failCount === 0) {
      // 全部成功
      statusDiv.className = 'sync-status success';
      let html = `
        <div class="sync-status-title">✅ 验证完成 (${successCount}/${markets.length})</div>
        <div style="margin-top: 10px;">
      `;
      
      results.forEach(r => {
        html += `
          <div style="padding: 6px 0; border-bottom: 1px solid #e0e0e0;">
            <strong>${r.market}</strong>: ${r.rowCount.toLocaleString()} 行
            <div style="font-size: 11px; color: #666;">${r.table}</div>
          </div>
        `;
      });
      
      html += `
        </div>
        <div style="margin-top: 15px; padding: 10px; background: #e8f5e9; border-radius: 4px; color: #2e7d32;">
          🎉 数据同步流程完成！
        </div>
      `;
      
      statusDiv.innerHTML = html;
      
    } else {
      // 部分或全部失败
      statusDiv.className = 'sync-status error';
      let html = `
        <div class="sync-status-title">⚠️ 验证完成：${successCount} 成功，${failCount} 失败</div>
        <div style="margin-top: 10px;">
      `;
      
      results.forEach(r => {
        if (r.success) {
          html += `
            <div style="padding: 6px 0; border-bottom: 1px solid #e0e0e0; color: #2e7d32;">
              ✅ <strong>${r.market}</strong>: ${r.rowCount.toLocaleString()} 行
            </div>
          `;
        } else {
          html += `
            <div style="padding: 6px 0; border-bottom: 1px solid #e0e0e0; color: #c62828;">
              ❌ <strong>${r.market}</strong>: ${r.error}
            </div>
          `;
        }
      });
      
      html += `</div>`;
      
      statusDiv.innerHTML = html;
    }
    
  } catch (error) {
    console.error('❌ 验证失败:', error);
    
    statusDiv.className = 'sync-status error';
    statusDiv.innerHTML = `
      <div class="sync-status-title">❌ 验证失败</div>
      <div>${error.message}</div>
    `;
    
  } finally {
    // 恢复按钮
    btn.disabled = false;
    btn.textContent = '3️⃣ 验证结果';
  }
});


// ========================================
// API 数据溯源工具
// ========================================

let apiTrackerCount = 0;

// 刷新页面按钮
document.getElementById('refreshPageBtn')?.addEventListener('click', async function() {
  const btn = this;
  const originalText = btn.innerHTML;
  btn.innerHTML = '🔄 刷新中...';
  btn.disabled = true;
  
  try {
    // 获取所有标签页，找到最近的非扩展页面
    const tabs = await chrome.tabs.query({});
    const webTabs = tabs.filter(tab => {
      return tab.url && 
             !tab.url.startsWith('chrome://') && 
             !tab.url.startsWith('chrome-extension://') &&
             !tab.url.startsWith('edge://') &&
             !tab.url.startsWith('about:');
    });
    
    webTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    const tab = webTabs[0];
    
    if (!tab || !tab.id) {
      showToast('❌ 无法获取网页标签页，请先打开一个网页');
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }
    
    console.log('✅ 刷新目标标签页:', tab.url);
    
    // 刷新页面
    await chrome.tabs.reload(tab.id);
    
    showToast('✅ 页面已刷新，等待加载完成...');
    
    // 等待一下让页面加载
    setTimeout(() => {
      loadAPIRecords();
      btn.innerHTML = originalText;
      btn.disabled = false;
    }, 2000);
    
  } catch (error) {
    console.error('❌ 刷新页面失败:', error.message);
    showToast('❌ 刷新失败: ' + error.message);
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
});

// 启动 API 溯源检查器
document.getElementById('startAPITracker')?.addEventListener('click', async function() {
  const btn = this;
  const originalText = btn.innerHTML;
  btn.innerHTML = '🔄 启动中...';
  btn.disabled = true;
  
  try {
    // 获取所有标签页，找到最近的非扩展页面
    const tabs = await chrome.tabs.query({});
    const webTabs = tabs.filter(tab => {
      return tab.url && 
             !tab.url.startsWith('chrome://') && 
             !tab.url.startsWith('chrome-extension://') &&
             !tab.url.startsWith('edge://') &&
             !tab.url.startsWith('about:');
    });
    
    webTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    const tab = webTabs[0];
    
    if (!tab || !tab.id) {
      showToast('❌ 无法获取网页标签页，请先打开一个网页');
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }
    
    console.log('✅ 找到目标标签页:', tab.url);
    
    chrome.tabs.sendMessage(tab.id, { action: 'START_INSPECTOR' }, (response) => {
      if (chrome.runtime.lastError) {
        showToast('❌ 无法启动检查器，请刷新页面后重试');
        console.log('ℹ️ Content script 未就绪:', chrome.runtime.lastError.message);
        console.log('💡 提示: 刷新页面让 content.js 重新加载');
      } else if (response?.success) {
        showToast('✅ 检查器已启动！现在可以点击页面元素了');
        document.getElementById('apiTrackerActive').textContent = '运行中';
        document.getElementById('apiTrackerActive').style.color = '#4caf50';
        
        // 不关闭窗口模式的 popup
        // setTimeout(() => window.close(), 1000);
      }
      
      btn.innerHTML = originalText;
      btn.disabled = false;
    });
  } catch (error) {
    console.error('❌ 启动检查器失败:', error.message);
    showToast('❌ 启动失败: ' + error.message);
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
});

// 加载 API 记录
async function loadAPIRecords() {
  try {
    // 获取所有标签页，找到最近的非扩展页面
    const tabs = await chrome.tabs.query({});
    
    // 过滤掉扩展自己的页面
    const webTabs = tabs.filter(tab => {
      return tab.url && 
             !tab.url.startsWith('chrome://') && 
             !tab.url.startsWith('chrome-extension://') &&
             !tab.url.startsWith('edge://') &&
             !tab.url.startsWith('about:');
    });
    
    // 找到最近活跃的网页标签（按 lastAccessed 排序）
    webTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    
    const tab = webTabs[0];
    
    if (!tab || !tab.id) {
      console.log('⚠️ 无法获取网页标签页');
      
      const countEl = document.getElementById('apiTrackerCount');
      const listEl = document.getElementById('apiTrackerList');
      
      if (countEl) countEl.textContent = '0';
      if (listEl) {
        listEl.innerHTML = `
          <div style="text-align: center; color: #999; padding: 20px;">
            <div style="margin-bottom: 10px;">📄</div>
            <div style="font-size: 12px;">
              请先访问一个网页<br>
              或刷新当前页面
            </div>
          </div>
        `;
      }
      return;
    }
    
    console.log('✅ 找到目标标签页:', tab.url);
    
    chrome.tabs.sendMessage(tab.id, { action: 'GET_API_RECORDS' }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script 可能还未加载，这是正常情况
        console.log('ℹ️ Content script 未就绪:', chrome.runtime.lastError.message);
        
        // 显示提示信息
        const countEl = document.getElementById('apiTrackerCount');
        const listEl = document.getElementById('apiTrackerList');
        
        if (countEl) countEl.textContent = '0';
        if (listEl) {
          listEl.innerHTML = `
            <div style="text-align: center; color: #999; padding: 20px;">
              <div style="margin-bottom: 10px;">📄</div>
              <div style="font-size: 12px;">
                请先访问一个网页<br>
                或刷新当前页面
              </div>
            </div>
          `;
        }
        return;
      }
      
      if (response && response.records) {
        document.getElementById('apiTrackerCount').textContent = response.records.length;
        updateAPIRecordsList(response.records);
      } else {
        // 没有记录
        document.getElementById('apiTrackerCount').textContent = '0';
      }
    });
  } catch (error) {
    console.error('❌ 加载 API 记录失败:', error.message);
  }
}

// 更新 API 记录列表
function updateAPIRecordsList(records) {
  const listContainer = document.getElementById('apiTrackerList');
  
  if (!records || records.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; color: #999; padding: 20px;">
        暂无记录
      </div>
    `;
    return;
  }
  
  // 只显示最近 10 条
  const recentRecords = records.slice(-10).reverse();
  
  listContainer.innerHTML = recentRecords.map(record => `
    <div class="api-record-item" data-record-id="${record.id}" style="margin-bottom: 10px; padding: 10px; background: white; border-radius: 6px; border-left: 3px solid #667eea; cursor: pointer; transition: all 0.2s;">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 5px;">
        <span style="font-weight: 500; color: #667eea; font-size: 12px;">${record.method}</span>
        <span style="background: ${record.status === 200 ? '#4caf50' : '#ff9800'}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px;">
          ${record.status}
        </span>
      </div>
      <div style="font-size: 11px; color: #666; word-break: break-all; margin-bottom: 5px;">
        ${record.url}
      </div>
      <div style="font-size: 10px; color: #999;">
        ⏱️ ${record.duration}ms | 🕐 ${new Date(record.requestTime).toLocaleTimeString()}
      </div>
      <div style="margin-top: 8px; font-size: 11px; color: #667eea;">
        👁️ 点击查看详情
      </div>
    </div>
  `).join('');
  
  // 添加点击事件
  document.querySelectorAll('.api-record-item').forEach(item => {
    item.addEventListener('click', async function() {
      const recordId = this.dataset.recordId;
      await viewAPIRecordDetail(recordId);
    });
    
    // 悬停效果
    item.addEventListener('mouseenter', function() {
      this.style.background = '#f0f4ff';
      this.style.transform = 'translateX(2px)';
    });
    
    item.addEventListener('mouseleave', function() {
      this.style.background = 'white';
      this.style.transform = 'translateX(0)';
    });
  });
}

// 查看 API 记录详情
async function viewAPIRecordDetail(recordId) {
  try {
    // 获取所有标签页，找到最近的非扩展页面
    const tabs = await chrome.tabs.query({});
    const webTabs = tabs.filter(tab => {
      return tab.url && 
             !tab.url.startsWith('chrome://') && 
             !tab.url.startsWith('chrome-extension://') &&
             !tab.url.startsWith('edge://') &&
             !tab.url.startsWith('about:');
    });
    
    webTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    const tab = webTabs[0];
    
    if (!tab || !tab.id) {
      showToast('❌ 无法获取网页标签页');
      return;
    }
    
    // 从 content script 获取完整记录（包含 responseData）
    chrome.tabs.sendMessage(tab.id, { 
      action: 'GET_API_RECORD_DETAIL',
      recordId: recordId
    }, (response) => {
      if (chrome.runtime.lastError) {
        showToast('❌ 获取详情失败');
        console.error('获取详情失败:', chrome.runtime.lastError.message);
        return;
      }
      
      if (response && response.record) {
        showAPIDetailModal(response.record);
      } else {
        showToast('❌ 未找到记录');
      }
    });
  } catch (error) {
    console.error('查看详情失败:', error);
    showToast('❌ 查看详情失败');
  }
}

// 显示 API 详情弹窗
function showAPIDetailModal(record) {
  // 检测是否在窗口模式
  const isWindowMode = new URLSearchParams(window.location.search).get('mode') === 'window';
  
  if (isWindowMode) {
    // 窗口模式：在新窗口中打开
    openAPIDetailInNewWindow(record);
  } else {
    // 弹出模式：在当前弹窗中显示
    showAPIDetailInPopup(record);
  }
}

// 在新窗口中打开 API 详情
function openAPIDetailInNewWindow(record) {
  const newWindow = window.open('', '_blank', 'width=900,height=700');
  
  if (!newWindow) {
    showToast('❌ 无法打开新窗口，请检查浏览器设置');
    return;
  }
  
  newWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>API 响应详情 - ${record.method} ${record.status}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #f5f5f5;
          padding: 20px;
        }
        
        .container {
          max-width: 1200px;
          margin: 0 auto;
          background: white;
          border-radius: 12px;
          padding: 30px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .header {
          border-bottom: 2px solid #667eea;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        
        h1 {
          color: #333;
          margin-bottom: 10px;
          font-size: 24px;
        }
        
        .meta {
          display: flex;
          gap: 15px;
          align-items: center;
          font-size: 14px;
        }
        
        .badge {
          padding: 4px 12px;
          border-radius: 6px;
          font-weight: 500;
        }
        
        .badge-method {
          background: #667eea;
          color: white;
        }
        
        .badge-status-ok {
          background: #4caf50;
          color: white;
        }
        
        .badge-status-error {
          background: #ff9800;
          color: white;
        }
        
        .section {
          margin-bottom: 30px;
        }
        
        .section-title {
          font-size: 16px;
          font-weight: 600;
          color: #333;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .url-box {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 8px;
          font-family: 'Courier New', monospace;
          font-size: 13px;
          word-break: break-all;
          border-left: 4px solid #667eea;
        }
        
        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
        }
        
        .info-card {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 8px;
        }
        
        .info-label {
          color: #999;
          font-size: 12px;
          margin-bottom: 6px;
        }
        
        .info-value {
          color: #333;
          font-weight: 500;
          font-size: 14px;
        }
        
        .response-box {
          background: #1e1e1e;
          color: #d4d4d4;
          padding: 20px;
          border-radius: 8px;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          max-height: 500px;
          overflow-y: auto;
          position: relative;
        }
        
        .copy-btn {
          position: absolute;
          top: 15px;
          right: 15px;
          background: #667eea;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }
        
        .copy-btn:hover {
          background: #5568d3;
        }
        
        pre {
          margin: 0;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        
        .close-btn {
          background: #f5f5f5;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          margin-top: 20px;
          transition: all 0.2s;
        }
        
        .close-btn:hover {
          background: #e0e0e0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔍 API 响应详情</h1>
          <div class="meta">
            <span class="badge badge-method">${record.method}</span>
            <span class="badge ${record.status === 200 ? 'badge-status-ok' : 'badge-status-error'}">${record.status}</span>
            <span style="color: #666;">⏱️ ${record.duration}ms</span>
            <span style="color: #666;">🕐 ${new Date(record.requestTime).toLocaleString()}</span>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">📡 请求 URL</div>
          <div class="url-box">${record.url}</div>
        </div>
        
        <div class="section">
          <div class="section-title">⏱️ 请求信息</div>
          <div class="info-grid">
            <div class="info-card">
              <div class="info-label">请求方法</div>
              <div class="info-value">${record.method}</div>
            </div>
            <div class="info-card">
              <div class="info-label">响应状态</div>
              <div class="info-value">${record.status}</div>
            </div>
            <div class="info-card">
              <div class="info-label">请求耗时</div>
              <div class="info-value">${record.duration}ms</div>
            </div>
            <div class="info-card">
              <div class="info-label">请求时间</div>
              <div class="info-value">${new Date(record.requestTime).toLocaleString()}</div>
            </div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">📦 响应数据</div>
          <div class="response-box">
            <button class="copy-btn" onclick="copyResponse()">📋 复制</button>
            <pre>${JSON.stringify(record.responseData, null, 2)}</pre>
          </div>
        </div>
        
        <button class="close-btn" onclick="window.close()">✕ 关闭窗口</button>
      </div>
      
      <script>
        function copyResponse() {
          const text = ${JSON.stringify(JSON.stringify(record.responseData, null, 2))};
          navigator.clipboard.writeText(text).then(() => {
            const btn = document.querySelector('.copy-btn');
            const originalText = btn.textContent;
            btn.textContent = '✅ 已复制';
            btn.style.background = '#4caf50';
            setTimeout(() => {
              btn.textContent = originalText;
              btn.style.background = '#667eea';
            }, 2000);
          }).catch(err => {
            alert('复制失败: ' + err);
          });
        }
      </script>
    </body>
    </html>
  `);
  
  newWindow.document.close();
}

// 在弹窗中显示 API 详情
function showAPIDetailInPopup(record) {
  // 移除旧弹窗
  const oldModal = document.getElementById('api-detail-modal');
  if (oldModal) oldModal.remove();
  
  const modal = document.createElement('div');
  modal.id = 'api-detail-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    border-radius: 12px;
    width: 90%;
    max-width: 800px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  `;
  
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 20px;
    border-bottom: 1px solid #eee;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  
  header.innerHTML = `
    <div>
      <h3 style="margin: 0 0 8px 0; color: #333;">API 响应详情</h3>
      <div style="font-size: 12px; color: #666;">
        <span style="font-weight: 500; color: #667eea;">${record.method}</span>
        <span style="background: ${record.status === 200 ? '#4caf50' : '#ff9800'}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 8px;">
          ${record.status}
        </span>
      </div>
    </div>
    <button id="close-api-modal" style="background: #f5f5f5; border: none; border-radius: 6px; padding: 8px 15px; cursor: pointer; font-size: 14px;">
      ✕ 关闭
    </button>
  `;
  
  const body = document.createElement('div');
  body.style.cssText = `
    padding: 20px;
    overflow-y: auto;
    flex: 1;
  `;
  
  body.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div style="font-weight: 500; color: #333; margin-bottom: 8px;">📡 请求 URL</div>
      <div style="background: #f8f9fa; padding: 10px; border-radius: 6px; font-size: 12px; word-break: break-all; font-family: monospace;">
        ${record.url}
      </div>
    </div>
    
    <div style="margin-bottom: 20px;">
      <div style="font-weight: 500; color: #333; margin-bottom: 8px;">⏱️ 请求信息</div>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
        <div style="background: #f8f9fa; padding: 10px; border-radius: 6px; font-size: 12px;">
          <div style="color: #999; margin-bottom: 4px;">方法</div>
          <div style="font-weight: 500;">${record.method}</div>
        </div>
        <div style="background: #f8f9fa; padding: 10px; border-radius: 6px; font-size: 12px;">
          <div style="color: #999; margin-bottom: 4px;">状态</div>
          <div style="font-weight: 500;">${record.status}</div>
        </div>
        <div style="background: #f8f9fa; padding: 10px; border-radius: 6px; font-size: 12px;">
          <div style="color: #999; margin-bottom: 4px;">耗时</div>
          <div style="font-weight: 500;">${record.duration}ms</div>
        </div>
        <div style="background: #f8f9fa; padding: 10px; border-radius: 6px; font-size: 12px;">
          <div style="color: #999; margin-bottom: 4px;">时间</div>
          <div style="font-weight: 500;">${new Date(record.requestTime).toLocaleString()}</div>
        </div>
      </div>
    </div>
    
    <div style="margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="font-weight: 500; color: #333;">📦 响应数据</div>
        <button id="copy-response-btn" style="background: #667eea; color: white; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12px;">
          📋 复制
        </button>
      </div>
      <div style="background: #1e1e1e; color: #d4d4d4; padding: 15px; border-radius: 6px; font-size: 11px; max-height: 400px; overflow-y: auto; font-family: 'Courier New', monospace;">
        <pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word;">${JSON.stringify(record.responseData, null, 2)}</pre>
      </div>
    </div>
  `;
  
  content.appendChild(header);
  content.appendChild(body);
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  // 关闭按钮
  document.getElementById('close-api-modal').addEventListener('click', () => {
    modal.remove();
  });
  
  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  // 复制响应数据
  document.getElementById('copy-response-btn').addEventListener('click', () => {
    const text = JSON.stringify(record.responseData, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      showToast('✅ 已复制到剪贴板');
    }).catch(() => {
      showToast('❌ 复制失败');
    });
  });
}

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'API_RECORDED') {
    apiTrackerCount++;
    document.getElementById('apiTrackerCount').textContent = apiTrackerCount;
    
    // 重新加载列表
    loadAPIRecords();
  }
});

// 当切换到 API 溯源标签时，加载数据
// 刷新 API 列表按钮
document.getElementById('refreshAPIListBtn')?.addEventListener('click', function() {
  const btn = this;
  const originalText = btn.innerHTML;
  btn.innerHTML = '🔄 刷新中...';
  btn.disabled = true;
  
  loadAPIRecords();
  
  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }, 500);
});

// API 溯源工具打开时加载记录
document.querySelectorAll('[data-util="api-tracker"]').forEach(btn => {
  btn.addEventListener('click', () => {
    loadAPIRecords();
    startAutoRefresh();  // 启动自动刷新
  });
});

// 初始加载（如果当前就在 API 溯源标签）
if (document.querySelector('[data-util="api-tracker"].active')) {
  loadAPIRecords();
  startAutoRefresh();  // 启动自动刷新
}

// 自动刷新功能
let autoRefreshInterval = null;

function startAutoRefresh() {
  // 清除旧的定时器
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
  
  // 每 2 秒自动刷新一次 API 列表
  autoRefreshInterval = setInterval(() => {
    // 只有在 API 溯源工具显示时才刷新
    const apiTrackerUtil = document.getElementById('api-tracker-util');
    if (apiTrackerUtil && apiTrackerUtil.style.display !== 'none') {
      loadAPIRecords();
    } else {
      // 如果工具不显示了，停止刷新
      stopAutoRefresh();
    }
  }, 2000);
  
  console.log('✅ API 列表自动刷新已启动（每 2 秒）');
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    console.log('⏹️ API 列表自动刷新已停止');
  }
}

// 切换到其他工具时停止自动刷新
document.querySelectorAll('.utils-grid-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    const util = this.dataset.util;
    if (util !== 'api-tracker') {
      stopAutoRefresh();
    }
  });
});


// ===== DOD 查询工具 =====
const DOD_SHEET_ID = '17jW1K3gEwhyyJxoOsXTOLlzQVXVIaU44S4SLLZBO-Zo';
const DOD_SHEET_GID = '374454140';
let dodData = [];
let dodAllData = [];

function initDodTool() {
  const searchBtn = document.getElementById('searchDodBtn');
  const loadAllBtn = document.getElementById('loadAllDodBtn');
  const searchInput = document.getElementById('dodSearchInput');
  
  if (searchBtn) {
    searchBtn.addEventListener('click', searchDod);
  }
  
  if (loadAllBtn) {
    loadAllBtn.addEventListener('click', loadAllDod);
  }
  
  if (searchInput) {
    searchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        searchDod();
      }
    });
  }
}

async function loadAllDod() {
  showDodLoading();
  
  try {
    // 使用 Google Sheets 公开 CSV 导出
    const csvUrl = `https://docs.google.com/spreadsheets/d/${DOD_SHEET_ID}/export?format=csv&gid=${DOD_SHEET_GID}`;
    
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error('无法加载数据');
    }
    
    const csvText = await response.text();
    dodAllData = parseCSV(csvText);
    dodData = dodAllData;
    
    console.log('成功加载 DOD 数据:', dodData.length, '条记录');
    
    // 更新统计
    document.getElementById('dodTotalCount').textContent = dodAllData.length;
    document.getElementById('dodFilteredCount').textContent = dodData.length;
    document.getElementById('dodStats').style.display = 'grid';
    
    // 显示结果
    displayDodResults(dodData);
    
  } catch (error) {
    console.error('加载 DOD 失败:', error);
    showDodError('加载失败: ' + error.message);
  }
}

async function searchDod() {
  const keyword = document.getElementById('dodSearchInput').value.trim();
  
  if (!keyword) {
    alert('请输入搜索关键词');
    return;
  }
  
  // 如果还没有加载数据，先加载
  if (dodAllData.length === 0) {
    await loadAllDod();
  }
  
  // 搜索过滤
  const filtered = dodAllData.filter(item => {
    const searchText = JSON.stringify(item).toLowerCase();
    return searchText.includes(keyword.toLowerCase());
  });
  
  dodData = filtered;
  
  // 更新统计
  document.getElementById('dodFilteredCount').textContent = filtered.length;
  document.getElementById('dodStats').style.display = 'grid';
  
  // 显示结果
  displayDodResults(filtered);
}

function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];
  
  // 第一行是标题
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  
  // 解析数据行
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = values[index];
      });
      data.push(item);
    }
  }
  
  return data;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values;
}

function displayDodResults(data) {
  const resultsDiv = document.getElementById('dodResults');
  
  if (data.length === 0) {
    resultsDiv.innerHTML = `
      <div class="dod-no-results">
        <span class="dod-no-results-icon">🔍</span>
        <div class="dod-no-results-text">未找到匹配的记录</div>
      </div>
    `;
    return;
  }
  
  // 显示前50条结果
  const displayData = data.slice(0, 50);
  
  let html = '';
  displayData.forEach((item, index) => {
    html += `
      <div class="dod-item">
        <div class="dod-item-header">
          <div>
            <h4 class="dod-item-title">${escapeHtml(item['Table Name'] || item['table_name'] || '未知表名')}</h4>
            <div class="dod-item-meta">
              ${item['Field Name'] || item['field_name'] ? `<span class="dod-item-tag">字段: ${escapeHtml(item['Field Name'] || item['field_name'])}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="dod-item-body">
          ${Object.keys(item).map(key => {
            if (key !== 'Table Name' && key !== 'Field Name' && key !== 'table_name' && key !== 'field_name' && item[key]) {
              return `
                <div class="dod-item-row">
                  <div class="dod-item-label">${escapeHtml(key)}:</div>
                  <div class="dod-item-value">${escapeHtml(item[key])}</div>
                </div>
              `;
            }
            return '';
          }).join('')}
        </div>
      </div>
    `;
  });
  
  if (data.length > 50) {
    html += `
      <div style="text-align: center; padding: 15px; color: #666; font-size: 13px;">
        显示前 50 条结果，共 ${data.length} 条记录
      </div>
    `;
  }
  
  resultsDiv.innerHTML = html;
  hideDodLoading();
}

function showDodLoading() {
  document.getElementById('dodLoading').style.display = 'block';
  document.getElementById('dodResults').style.display = 'none';
}

function hideDodLoading() {
  document.getElementById('dodLoading').style.display = 'none';
  document.getElementById('dodResults').style.display = 'block';
}

function showDodError(message) {
  const resultsDiv = document.getElementById('dodResults');
  resultsDiv.innerHTML = `
    <div class="dod-no-results">
      <span class="dod-no-results-icon">⚠️</span>
      <div class="dod-no-results-text">${escapeHtml(message)}</div>
    </div>
  `;
  hideDodLoading();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

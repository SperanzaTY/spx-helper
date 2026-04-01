// cursor-ui.js — Self-contained UI infrastructure for Cursor ACP panel
// No dependency on seatalk-enhance / window.__helper
(function () {

  // ── Load marked.js for proper GFM Markdown rendering ──
  var markedLoaded = typeof marked !== 'undefined';
  if (!markedLoaded) {
    (function loadMarked() {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/marked@15/marked.min.js';
      s.onload = function () {
        markedLoaded = true;
        if (window.marked) window.marked.setOptions({ breaks: true, gfm: true });
        console.log('[cursor-ui] marked.js loaded');
      };
      s.onerror = function () {
        var s2 = document.createElement('script');
        s2.src = 'https://unpkg.com/marked@15/marked.min.js';
        s2.onload = function () {
          markedLoaded = true;
          if (window.marked) window.marked.setOptions({ breaks: true, gfm: true });
          console.log('[cursor-ui] marked.js loaded (fallback)');
        };
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    })();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sanitizeHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var dangerous = tmp.querySelectorAll(
      'script,iframe,object,embed,link[rel="import"],form,input,' +
      'textarea,select,button,svg,math,base,meta,style'
    );
    for (var i = 0; i < dangerous.length; i++) dangerous[i].remove();
    var all = tmp.querySelectorAll('*');
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      var attrs = Array.from(el.attributes);
      for (var k = 0; k < attrs.length; k++) {
        var name = attrs[k].name.toLowerCase();
        if (name.startsWith('on') || name === 'style'
            || ((name === 'href' || name === 'src' || name === 'action')
                && /^\s*(javascript|data|vbscript):/i.test(attrs[k].value))) {
          el.removeAttribute(name);
        }
      }
    }
    return tmp.innerHTML;
  }

  function injectCSS(id, css) {
    var old = document.getElementById(id);
    if (old) old.remove();
    var s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Layer for panels ──
  var layer = document.getElementById('cursor-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'cursor-layer';
    document.body.appendChild(layer);
  }
  layer.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';

  // ── Panel CSS ──
  injectCSS('cursor-panel-css', [
    '.hp-panel {',
    '  position:fixed; z-index:2147483647; pointer-events:auto; cursor:grab; -webkit-app-region:no-drag;',
    '  background:rgba(28,30,36,0.97); border:1px solid rgba(255,255,255,0.12);',
    '  border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,0.5);',
    '  backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);',
    '  font-family:-apple-system,BlinkMacSystemFont,sans-serif;',
    '  display:flex; flex-direction:column; overflow:hidden;',
    '  opacity:0; transform:translateY(8px); transition:opacity .2s, transform .2s;',
    '}',
    '.hp-panel.show { opacity:1; transform:translateY(0); }',
    '.hp-panel.dragging { cursor:grabbing; transition:none; user-select:none; }',
    '.hp-panel-header {',
    '  display:flex; align-items:center; justify-content:space-between;',
    '  padding:10px 14px 8px; border-bottom:1px solid rgba(255,255,255,0.06);',
    '  flex-shrink:0;',
    '}',
    '.hp-panel-title { font-size:13px; font-weight:600; color:rgba(255,255,255,0.85); }',
    '.hp-panel-close {',
    '  cursor:pointer; color:rgba(255,255,255,0.3); font-size:16px;',
    '  padding:0 2px; transition:color .15s; line-height:1;',
    '}',
    '.hp-panel-close:hover { color:rgba(255,255,255,0.8); }',
    '.hp-panel-body { padding:10px 14px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; flex:1; min-height:0; }',
    '.hp-panel-body::-webkit-scrollbar { width:4px; }',
    '.hp-panel-body::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12); border-radius:2px; }',
    '.hp-panel-resize-n { position:absolute; top:0; left:10px; right:10px; height:4px; cursor:ns-resize; z-index:5; }',
    '.hp-panel-resize-s { position:absolute; bottom:0; left:10px; right:10px; height:4px; cursor:ns-resize; z-index:5; }',
    '.hp-panel-resize-w { position:absolute; top:10px; bottom:10px; left:0; width:4px; cursor:ew-resize; z-index:5; }',
    '.hp-panel-resize-e { position:absolute; top:10px; bottom:10px; right:0; width:4px; cursor:ew-resize; z-index:5; }',
    '.hp-panel-resize-nw { position:absolute; top:0; left:0; width:10px; height:10px; cursor:nwse-resize; z-index:6; }',
    '.hp-panel-resize-ne { position:absolute; top:0; right:0; width:10px; height:10px; cursor:nesw-resize; z-index:6; }',
    '.hp-panel-resize-sw { position:absolute; bottom:0; left:0; width:10px; height:10px; cursor:nesw-resize; z-index:6; }',
    '.hp-panel-resize-se { position:absolute; bottom:0; right:0; width:10px; height:10px; cursor:nwse-resize; z-index:6; }',
    '.hp-panel.docked {',
    '  position:relative !important; border-radius:0; transition:none; overflow:hidden;',
    '  left:auto !important; top:auto !important; height:auto !important;',
    '  flex-shrink:0; border:none; border-left:1px solid rgba(255,255,255,0.08);',
    '  box-shadow:none; opacity:1 !important; transform:none !important;',
    '  text-align:left;',
    '}',
    '.hp-panel.docked .hp-panel-resize-n,.hp-panel.docked .hp-panel-resize-s,.hp-panel.docked .hp-panel-resize-e,' +
    '.hp-panel.docked .hp-panel-resize-nw,.hp-panel.docked .hp-panel-resize-ne,.hp-panel.docked .hp-panel-resize-sw,.hp-panel.docked .hp-panel-resize-se { display:none; }',
    '.hp-panel.docked .hp-panel-resize-w { top:0; bottom:0; left:0; width:4px; cursor:ew-resize; }',
    // Sidebar button
    '.cursor-sidebar-btn {',
    '  width:40px; height:40px; display:flex; align-items:center; justify-content:center;',
    '  border-radius:10px; cursor:pointer; background:transparent; border:none; padding:0;',
    '  -webkit-app-region:no-drag; transition:background 0.15s; color:rgba(255,255,255,0.7);',
    '}',
    '.cursor-sidebar-btn:hover { background:rgba(255,255,255,0.08); }',
    '.cursor-sidebar-btn.active { background:rgba(77,150,255,0.18); }',
    '.cursor-sidebar-btn svg { width:22px; height:22px; }',
    // Tooltip (always dark since it floats globally)
    '.cursor-tooltip {',
    '  position:fixed; z-index:2147483647; pointer-events:none;',
    '  background:#252526; border:1px solid #3c3c3c; border-radius:6px;',
    '  padding:6px 10px; font-size:11px; color:#cccccc;',
    '  box-shadow:0 4px 12px rgba(0,0,0,0.4); white-space:nowrap;',
    '}',
  ].join('\n'));

  // ── Tooltip ──
  var tooltipEl = null;
  function showTooltip(target, contentFn) {
    hideTooltip();
    var html = typeof contentFn === 'function' ? contentFn() : contentFn;
    if (!html) return;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'cursor-tooltip';
    tooltipEl.innerHTML = html;
    document.body.appendChild(tooltipEl);
    var r = target.getBoundingClientRect();
    tooltipEl.style.left = (r.right + 8) + 'px';
    tooltipEl.style.top = (r.top + r.height / 2 - tooltipEl.offsetHeight / 2) + 'px';
  }
  function hideTooltip() {
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
  }

  // ── Panel size persistence via localStorage ──
  function getSavedSize(key) {
    if (!key) return null;
    try { var v = localStorage.getItem('cursor_panel_' + key); return v ? JSON.parse(v) : null; } catch (_) { return null; }
  }
  function savePanelSize(key, w, h) {
    if (!key) return;
    try { localStorage.setItem('cursor_panel_' + key, JSON.stringify({ w: w, h: h })); } catch (_) {}
  }

  // ── createPanel ──
  function createPanel(opts) {
    opts = opts || {};
    var panelId = opts.id || ('hp-' + Date.now());
    var closeOnOutside = opts.closeOnOutsideClick !== undefined ? opts.closeOnOutsideClick : false;
    var dragExclude = opts.dragExclude || '.hp-panel-close';
    var resizable = opts.resizable !== false;
    var cleanupFns = [];

    var savedSize = getSavedSize(opts.sizeKey);
    var panelW = (savedSize && savedSize.w) || opts.width || 380;
    var panelH = (savedSize && savedSize.h) || opts.height || 520;

    var panel = document.createElement('div');
    panel.className = 'hp-panel' + (opts.className ? ' ' + opts.className : '');
    panel.id = panelId;
    panel.style.width = panelW + 'px';
    panel.style.height = panelH + 'px';
    panel.style.left = (window.innerWidth - panelW - 16) + 'px';
    panel.style.top = (window.innerHeight - panelH - 40) + 'px';

    var html = '<div class="hp-panel-header"><span class="hp-panel-title">' + (opts.title || '') + '</span><span class="hp-panel-close">\u2715</span></div>';
    html += '<div class="hp-panel-body">' + (opts.content || '') + '</div>';
    if (resizable) {
      html += '<div class="hp-panel-resize-n"></div><div class="hp-panel-resize-s"></div>';
      html += '<div class="hp-panel-resize-w"></div><div class="hp-panel-resize-e"></div>';
      html += '<div class="hp-panel-resize-nw"></div><div class="hp-panel-resize-ne"></div>';
      html += '<div class="hp-panel-resize-sw"></div><div class="hp-panel-resize-se"></div>';
    }
    panel.innerHTML = html;

    layer.appendChild(panel);
    requestAnimationFrame(function () { panel.classList.add('show'); });

    // Drag
    var dragState = null;
    function onDragMove(e) {
      if (!dragState) return;
      panel.style.left = (dragState.origLeft + e.clientX - dragState.startX) + 'px';
      panel.style.top = (dragState.origTop + e.clientY - dragState.startY) + 'px';
    }
    function onDragEnd() {
      if (dragState) { dragState = null; panel.classList.remove('dragging'); }
    }
    panel.addEventListener('mousedown', function (e) {
      if (e.target.closest(dragExclude)) return;
      dragState = { startX: e.clientX, startY: e.clientY, origLeft: panel.offsetLeft, origTop: panel.offsetTop };
      panel.classList.add('dragging');
      e.preventDefault();
    });
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    cleanupFns.push(function () {
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
    });

    // Resize — supports all edges and corners
    if (resizable) {
      var resizeState = null;
      var MIN_W = 320, MAX_W = 900, MIN_H = 250;
      var edges = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'];
      function onResizeMove(e) {
        if (!resizeState) return;
        var dx = e.clientX - resizeState.startX;
        var dy = e.clientY - resizeState.startY;
        var dir = resizeState.dir;
        if (isDocked) {
          // Docked: only w handle active, drag left edge to resize width
          var newW = Math.max(MIN_W, Math.min(MAX_W, resizeState.origW - dx));
          panel.style.width = newW + 'px';
          return;
        }
        var newW = resizeState.origW, newH = resizeState.origH;
        var newLeft = resizeState.origLeft, newTop = resizeState.origTop;
        if (dir.indexOf('e') >= 0) newW = Math.max(MIN_W, Math.min(MAX_W, resizeState.origW + dx));
        if (dir.indexOf('w') >= 0) { newW = Math.max(MIN_W, Math.min(MAX_W, resizeState.origW - dx)); newLeft = resizeState.origLeft + (resizeState.origW - newW); }
        if (dir.indexOf('s') >= 0) newH = Math.max(MIN_H, Math.min(window.innerHeight - 20, resizeState.origH + dy));
        if (dir.indexOf('n') >= 0) { newH = Math.max(MIN_H, Math.min(window.innerHeight - 20, resizeState.origH - dy)); newTop = resizeState.origTop + (resizeState.origH - newH); }
        panel.style.width = newW + 'px';
        panel.style.height = newH + 'px';
        panel.style.left = newLeft + 'px';
        panel.style.top = newTop + 'px';
      }
      function onResizeEnd() {
        if (!resizeState) return;
        resizeState = null;
        if (isDocked) {
          try { localStorage.setItem(DOCK_W_KEY, '' + panel.offsetWidth); } catch (_) {}
        } else {
          savePanelSize(opts.sizeKey, panel.offsetWidth, panel.offsetHeight);
        }
      }
      for (var ei = 0; ei < edges.length; ei++) {
        (function(dir) {
          var handle = panel.querySelector('.hp-panel-resize-' + dir);
          if (!handle) return;
          handle.addEventListener('mousedown', function (e) {
            resizeState = { dir: dir, startX: e.clientX, startY: e.clientY, origW: panel.offsetWidth, origH: panel.offsetHeight, origLeft: panel.offsetLeft, origTop: panel.offsetTop };
            e.preventDefault(); e.stopPropagation();
          });
        })(edges[ei]);
      }
      document.addEventListener('mousemove', onResizeMove);
      document.addEventListener('mouseup', onResizeEnd);
      cleanupFns.push(function () {
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeEnd);
      });
    }

    // Close
    function close() {
      if (isDocked) {
        isDocked = false;
        panel.classList.remove('docked');
        if (panel.parentNode) panel.parentNode.removeChild(panel);
      } else {
        panel.classList.remove('show');
        setTimeout(function () { if (panel.parentNode) panel.parentNode.removeChild(panel); }, 200);
      }
      for (var i = 0; i < cleanupFns.length; i++) cleanupFns[i]();
      if (closeDocHandler) document.removeEventListener('mousedown', closeDocHandler, true);
      if (typeof opts.onClose === 'function') opts.onClose();
    }

    panel.querySelector('.hp-panel-close').addEventListener('click', close);

    var closeDocHandler = null;
    if (closeOnOutside) {
      closeDocHandler = function (e) {
        if (panel.contains(e.target)) return;
        close();
      };
      setTimeout(function () { document.addEventListener('mousedown', closeDocHandler, true); }, 0);
    }

    var isDocked = false;
    var floatState = null;
    var DOCK_W_KEY = 'cursor_panel_dock_w';

    function findDockHost() {
      return document.querySelector('.home-main-window.hbox') ||
             document.querySelector('.home-main-window');
    }

    function dock() {
      if (isDocked) return;
      var host = findDockHost();
      if (!host) { console.warn('[cursor-ui] dock host not found'); return; }
      floatState = { left: panel.style.left, top: panel.style.top, width: panel.style.width, height: panel.style.height, parent: panel.parentNode };
      var savedDockW = 420;
      try { var v = localStorage.getItem(DOCK_W_KEY); if (v) savedDockW = parseInt(v) || 420; } catch (_) {}
      var dockW = Math.max(320, Math.min(700, savedDockW));

      panel.style.position = 'relative';
      panel.style.left = '';
      panel.style.top = '';
      panel.style.width = dockW + 'px';
      panel.style.height = '';
      panel.style.flexShrink = '0';
      panel.classList.add('docked');
      host.appendChild(panel);

      isDocked = true;
      try { localStorage.setItem('cursor_panel_docked', '1'); } catch (_) {}
      try { localStorage.setItem(DOCK_W_KEY, '' + dockW); } catch (_) {}
    }

    function undock() {
      if (!isDocked) return;
      panel.classList.remove('docked');
      panel.style.position = 'fixed';
      panel.style.flexShrink = '';
      var parent = (floatState && floatState.parent) || layer;
      parent.appendChild(panel);
      if (floatState) {
        panel.style.left = floatState.left;
        panel.style.top = floatState.top;
        panel.style.width = floatState.width;
        panel.style.height = floatState.height;
      } else {
        panel.style.width = panelW + 'px';
        panel.style.height = panelH + 'px';
        panel.style.left = (window.innerWidth - panelW - 16) + 'px';
        panel.style.top = (window.innerHeight - panelH - 40) + 'px';
      }
      isDocked = false;
      try { localStorage.setItem('cursor_panel_docked', '0'); } catch (_) {}
    }

    // Save dock width on resize end when docked
    var origOnResizeEnd = null;
    if (resizable) {
      var _origSave = savePanelSize;
      cleanupFns.push(function () {
        if (isDocked) undock();
      });
    }

    // Auto-dock if was docked last time
    try { if (localStorage.getItem('cursor_panel_docked') === '1') { setTimeout(dock, 100); } } catch (_) {}

    var handle = {
      el: panel,
      body: panel.querySelector('.hp-panel-body'),
      close: close,
      dock: dock,
      undock: undock,
      isDocked: function () { return isDocked; },
      toggleDock: function () { isDocked ? undock() : dock(); },
      setTitle: function (t) {
        var titleEl = panel.querySelector('.hp-panel-title');
        if (titleEl) titleEl.innerHTML = t;
      }
    };

    if (typeof opts.onMount === 'function') opts.onMount(handle);
    return handle;
  }

  // ── Sidebar button ──
  function createSidebarButton(opts) {
    var SIDEBAR = document.querySelector('.sidebar-sidebar');
    if (!SIDEBAR) { console.warn('[cursor-ui] .sidebar-sidebar not found'); return null; }

    var existing = document.getElementById(opts.id);
    if (existing) existing.remove();

    var btn = document.createElement('div');
    btn.id = opts.id;
    btn.className = 'cursor-sidebar-btn' + (opts.className ? ' ' + opts.className : '');
    btn.innerHTML = opts.icon;

    btn.addEventListener('click', opts.onClick);

    btn.addEventListener('mouseenter', function () { if (opts.tooltip) showTooltip(btn, opts.tooltip); });
    btn.addEventListener('mouseleave', hideTooltip);

    var settingsIcon = SIDEBAR.querySelector('.sprite_toolbar_ic_settings');
    if (settingsIcon && settingsIcon.parentNode) {
      SIDEBAR.insertBefore(btn, settingsIcon.parentNode);
    } else {
      SIDEBAR.appendChild(btn);
    }

    return btn;
  }

  // ── Streaming renderer ──
  var streaming = {
    renderMarkdown: function (text) {
      if (typeof marked !== 'undefined' && marked.parse) {
        try {
          var html = marked.parse(text, { breaks: true, gfm: true });
          return sanitizeHtml(html);
        } catch (_) {}
      }
      // Fallback: basic regex-based rendering
      var s = escapeHtml(text);
      s = s.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
        return '<pre><code>' + code + '</code></pre>';
      });
      // Simple table rendering for GFM tables
      s = s.replace(/((?:^\|.+\|$\n?)+)/gm, function(tableBlock) {
        var rows = tableBlock.trim().split('\n');
        if (rows.length < 2) return tableBlock;
        var html = '<table>';
        for (var ri = 0; ri < rows.length; ri++) {
          var row = rows[ri].trim();
          if (/^\|[\s:|-]+\|$/.test(row)) continue; // skip separator row
          var cells = row.split('|').filter(function(c, idx, arr) { return idx > 0 && idx < arr.length - 1; });
          var tag = ri === 0 ? 'th' : 'td';
          html += '<tr>';
          for (var ci = 0; ci < cells.length; ci++) {
            html += '<' + tag + '>' + cells[ci].trim() + '</' + tag + '>';
          }
          html += '</tr>';
        }
        html += '</table>';
        return html;
      });
      s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      s = s.replace(/^---$/gm, '<hr>');
      s = s.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
      s = s.replace(/\n/g, '<br>');
      return s;
    },

    maskSecrets: function (text) {
      return String(text || '')
        .replace(/(TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL|API_KEY)=('[^']*'|"[^"]*"|[^\s&;]+)/gi, function(_, k, v) {
          return k + '=***';
        })
        .replace(/(token|password|secret|apikey|api_key)["']?\s*[:=]\s*["']?[A-Za-z0-9+/=]{8,}["']?/gi, function(m) {
          return m.substring(0, m.indexOf('=') + 1) + '***';
        });
    },

    friendlyToolName: function (tc) {
      var name = tc.name || '';
      var desc = (tc.tool && tc.tool.action_description) || '';
      var kind = (tc.tool && tc.tool.kind) || tc.kind || '';

      var toolTypeMap = {
        'Terminal': 'Terminal',
        'Shell': 'Shell',
        'Read File': 'Read File',
        'Write File': 'Write File',
        'Edit File': 'Edit File',
        'Find': 'Search',
        'Grep': 'Search',
        'List MCP Resources': 'MCP Resources',
        'List Directory': 'List Dir'
      };

      // tc.name for shell commands is the full command string — detect and simplify
      if (!toolTypeMap[name] && name.length > 40) {
        // Likely a raw shell command string — show as "Shell"
        return { type: 'Shell', detail: desc || '' };
      }

      var friendlyType = toolTypeMap[name] || name;
      return { type: friendlyType, detail: desc && desc !== name ? desc : '' };
    },

    renderToolCallHTML: function (tc, opts) {
      opts = opts || {};
      var prefix = opts.prefix || 'hs';
      var truncLen = opts.truncateLen || 500;
      var toggleAttr = opts.toggleAttr || 'tool-call';
      var isCompleted = tc.status === 'completed' || !!tc.result;
      var isError = tc.status === 'error';
      var statusIcon = isCompleted ? '\u2705' : isError ? '\u274c' : '\u23f3';
      var friendly = streaming.friendlyToolName(tc);
      var label = statusIcon + ' ' + escapeHtml(friendly.type);
      if (friendly.detail) label += ' <span style="opacity:0.6">\u2014 ' + escapeHtml(friendly.detail) + '</span>';
      if (!isCompleted && !isError) label += ' <span style="opacity:0.5;font-size:10px">running...</span>';
      var body = '';
      if (tc.arguments) {
        var argsDisplay = streaming.maskSecrets(tc.arguments);
        try { argsDisplay = JSON.stringify(JSON.parse(argsDisplay), null, 2); } catch (_) {}
        if (argsDisplay.length > 1000) argsDisplay = argsDisplay.substring(0, 1000) + '\n...';
        body += '<div class="' + prefix + '-tool-call-section"><b>Input:</b><pre style="margin:4px 0 0;white-space:pre-wrap;word-break:break-all;font-size:11px;color:var(--cp-tool-input,#9cdcfe)">' + escapeHtml(argsDisplay) + '</pre></div>';
      }
      if (tc.result) {
        var resultDisplay = tc.result;
        try {
          var parsed = JSON.parse(tc.result);
          resultDisplay = parsed.result || JSON.stringify(parsed, null, 2);
        } catch (_) {}
        resultDisplay = streaming.maskSecrets(resultDisplay);
        if (resultDisplay.length > truncLen) resultDisplay = resultDisplay.substring(0, truncLen) + '\n...';
        body += '<div class="' + prefix + '-tool-call-section"><b>Output:</b><pre style="margin:4px 0 0;white-space:pre-wrap;word-break:break-all;font-size:11px;color:var(--cp-tool-output,#b5cea8)">' + escapeHtml(resultDisplay) + '</pre></div>';
      }
      // If no body content, don't render the expandable container at all
      if (!body) {
        return '<div class="' + prefix + '-tool-call-label">' + label + '</div>';
      }
      var bodyClass = opts.collapsed !== false ? prefix + '-tool-call-body' : prefix + '-tool-call-body open';
      return '<div class="' + prefix + '-tool-call-label" data-toggle="' + toggleAttr + '">' + label + '</div>' +
        '<div class="' + prefix + '-tool-call"><div class="' + bodyClass + '">' + body + '</div></div>';
    },

    bindToolCallToggle: function (container, prefix, toggleAttr) {
      toggleAttr = toggleAttr || 'tool-call';
      var labels = container.querySelectorAll('[data-toggle="' + toggleAttr + '"]');
      for (var i = 0; i < labels.length; i++) {
        if (labels[i]._bound) continue;
        labels[i]._bound = true;
        labels[i].addEventListener('click', function () {
          var wrapper = this.nextElementSibling;
          if (wrapper) {
            var inner = wrapper.querySelector('.' + prefix + '-tool-call-body');
            if (!inner) inner = wrapper.classList.contains(prefix + '-tool-call-body') ? wrapper : null;
            if (inner) inner.classList.toggle('open');
          }
        });
      }
    },

    createView: function (opts) {
      var container = opts.container;
      var prefix = opts.prefix || 'hs';
      var truncLen = opts.truncateLen || 500;
      var toggleAttr = opts.toggleAttr || 'tool-call';
      var thinkingEl = null, thinkLabelEl = null, thinkBodyEl = null;
      var resultEl = null, typingEl = container.querySelector('.' + prefix + '-typing');
      var toolCallEls = {};
      var thinkText = '', resultText = '';

      function removeTyping() {
        if (typingEl) { typingEl.remove(); typingEl = null; }
      }

      function ensureThinking() {
        if (thinkingEl) return;
        removeTyping();
        var wrap = document.createElement('div');
        wrap.innerHTML = '<div class="' + prefix + '-thinking-label">\u{1f4ad} thinking... \u25bc</div>' +
          '<div class="' + prefix + '-thinking"></div>';
        container.appendChild(wrap);
        thinkingEl = wrap;
        thinkLabelEl = wrap.querySelector('.' + prefix + '-thinking-label');
        thinkBodyEl = wrap.querySelector('.' + prefix + '-thinking');
        thinkLabelEl.addEventListener('click', function () {
          thinkBodyEl.classList.toggle('collapsed');
          this.textContent = thinkBodyEl.classList.contains('collapsed')
            ? '\u{1f4ad} thought (' + Math.round(thinkText.length / 4) + ' tokens) \u25b6'
            : '\u{1f4ad} thinking... \u25bc';
        });
      }

      function ensureResult() {
        if (resultEl) return;
        removeTyping();
        resultEl = document.createElement('div');
        resultEl.className = prefix + '-result';
        container.appendChild(resultEl);
      }

      return {
        reset: function () {
          thinkText = ''; resultText = '';
          thinkingEl = null; thinkLabelEl = null; thinkBodyEl = null;
          resultEl = null; toolCallEls = {};
          container.innerHTML = '<div class="' + prefix + '-typing"><span></span><span></span><span></span></div>';
          typingEl = container.querySelector('.' + prefix + '-typing');
        },

        clearResult: function () {
          resultText = '';
          if (resultEl) { resultEl.remove(); resultEl = null; }
          for (var k in toolCallEls) { if (toolCallEls[k]) toolCallEls[k].remove(); }
          toolCallEls = {};
        },

        processChunk: function (evt) {
          if (evt.type === 'thinking' || evt.type === 'thinking_done') {
            ensureThinking();
            thinkText = evt.thinking;
            thinkBodyEl.textContent = thinkText;
            thinkBodyEl.scrollTop = thinkBodyEl.scrollHeight;
            if (evt.type === 'thinking_done') {
              thinkLabelEl.textContent = '\u{1f4ad} thought (' + Math.round(thinkText.length / 4) + ' tokens) \u25bc';
            }
          }
          if (evt.type === 'tool_call' && evt.toolCall) {
            removeTyping();
            var elId = prefix + '-tc-' + (evt.toolCall.id || '').replace(/[^a-zA-Z0-9]/g, '');
            var el = toolCallEls[elId];
            var wasOpen = false;
            if (!el) {
              el = document.createElement('div');
              el.id = elId;
              container.appendChild(el);
              toolCallEls[elId] = el;
            } else {
              var existingBody = el.querySelector('.' + prefix + '-tool-call-body');
              wasOpen = existingBody && existingBody.classList.contains('open');
            }
            el.innerHTML = streaming.renderToolCallHTML(evt.toolCall, { prefix: prefix, truncateLen: truncLen, toggleAttr: toggleAttr, collapsed: !wasOpen });
            streaming.bindToolCallToggle(el, prefix, toggleAttr);
          }
          if (evt.type === 'text') {
            ensureResult();
            resultText = evt.text;
            resultEl.innerHTML = streaming.renderMarkdown(resultText);
            resultEl.scrollTop = resultEl.scrollHeight;
          }
          container.scrollTop = container.scrollHeight;
        },

        finalize: function () {
          if (resultText && resultEl) {
            resultEl.innerHTML = streaming.renderMarkdown(resultText);
          }
          if (thinkText && thinkBodyEl) {
            thinkBodyEl.classList.add('collapsed');
            thinkLabelEl.textContent = '\u{1f4ad} thought (' + Math.round(thinkText.length / 4) + ' tokens) \u25b6';
          }
          for (var tcKey in toolCallEls) {
            var tcEl = toolCallEls[tcKey];
            if (tcEl) {
              var tcBody = tcEl.querySelector('.' + prefix + '-tool-call-body');
              if (tcBody) tcBody.classList.remove('open');
            }
          }
        },

        getResult: function () { return resultText; },
        getThinking: function () { return thinkText; }
      };
    }
  };

  window.__cursorUI = {
    escapeHtml: escapeHtml,
    sanitizeHtml: sanitizeHtml,
    injectCSS: injectCSS,
    createPanel: createPanel,
    createSidebarButton: createSidebarButton,
    streaming: streaming,
    layer: layer
  };

  console.log('[cursor-ui] self-contained UI ready');
})();

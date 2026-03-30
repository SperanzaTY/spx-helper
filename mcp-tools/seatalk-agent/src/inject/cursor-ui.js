// cursor-ui.js — Self-contained UI infrastructure for Cursor ACP panel
// No dependency on seatalk-enhance / window.__helper
(function () {

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
    '  display:flex; flex-direction:column;',
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
    '.hp-panel-resize {',
    '  position:absolute; bottom:0; left:10%; right:10%; height:6px;',
    '  cursor:ns-resize; border-radius:0 0 10px 10px;',
    '}',
    '.hp-panel-resize-corner {',
    '  position:absolute; bottom:0; right:0; width:16px; height:16px;',
    '  cursor:nwse-resize; border-radius:0 0 10px 0;',
    '}',
    // Sidebar button
    '.cursor-sidebar-btn {',
    '  width:40px; height:40px; display:flex; align-items:center; justify-content:center;',
    '  border-radius:10px; cursor:pointer; background:transparent; border:none; padding:0;',
    '  -webkit-app-region:no-drag; transition:background 0.15s; color:rgba(255,255,255,0.7);',
    '}',
    '.cursor-sidebar-btn:hover { background:rgba(255,255,255,0.08); }',
    '.cursor-sidebar-btn.active { background:rgba(77,150,255,0.18); }',
    '.cursor-sidebar-btn svg { width:22px; height:22px; }',
    // Tooltip
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
    if (resizable) html += '<div class="hp-panel-resize"></div><div class="hp-panel-resize-corner"></div>';
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

    // Resize
    if (resizable) {
      var resizeState = null;
      var resizeBar = panel.querySelector('.hp-panel-resize');
      var resizeCorner = panel.querySelector('.hp-panel-resize-corner');
      function onResizeMove(e) {
        if (!resizeState) return;
        var newH = Math.max(300, Math.min(window.innerHeight * 0.85, resizeState.origH + e.clientY - resizeState.startY));
        panel.style.height = newH + 'px';
        if (resizeState.resizeW) {
          var newW = Math.max(320, Math.min(700, resizeState.origW + e.clientX - resizeState.startX));
          panel.style.width = newW + 'px';
        }
      }
      function onResizeEnd() {
        if (resizeState) { resizeState = null; savePanelSize(opts.sizeKey, panel.offsetWidth, panel.offsetHeight); }
      }
      resizeBar.addEventListener('mousedown', function (e) {
        resizeState = { startX: e.clientX, startY: e.clientY, origW: panel.offsetWidth, origH: panel.offsetHeight, resizeW: false };
        e.preventDefault(); e.stopPropagation();
      });
      resizeCorner.addEventListener('mousedown', function (e) {
        resizeState = { startX: e.clientX, startY: e.clientY, origW: panel.offsetWidth, origH: panel.offsetHeight, resizeW: true };
        e.preventDefault(); e.stopPropagation();
      });
      document.addEventListener('mousemove', onResizeMove);
      document.addEventListener('mouseup', onResizeEnd);
      cleanupFns.push(function () {
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeEnd);
      });
    }

    // Close
    function close() {
      panel.classList.remove('show');
      setTimeout(function () { if (panel.parentNode) panel.parentNode.removeChild(panel); }, 200);
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

    var handle = {
      el: panel,
      body: panel.querySelector('.hp-panel-body'),
      close: close,
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
      if (typeof marked !== 'undefined') {
        try { return sanitizeHtml(marked.parse(text, { breaks: true })); } catch (_) {}
      }
      var s = escapeHtml(text);
      s = s.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
        return '<pre><code>' + code + '</code></pre>';
      });
      s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
      s = s.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;font-size:12px">$1</code>');
      s = s.replace(/\n/g, '<br>');
      return s;
    },

    renderToolCallHTML: function (tc, opts) {
      opts = opts || {};
      var prefix = opts.prefix || 'hs';
      var truncLen = opts.truncateLen || 500;
      var toggleAttr = opts.toggleAttr || 'tool-call';
      var desc = (tc.tool && tc.tool.action_description) || tc.name || 'tool';
      var label = '\u{1f527} ' + escapeHtml(tc.name || 'tool');
      if (desc !== tc.name) label += ' \u2014 ' + escapeHtml(desc);
      if (tc.result) label += ' \u2705';
      var body = '';
      if (tc.arguments) {
        try { body += '<div class="' + prefix + '-tool-call-section"><b>Args:</b> ' + escapeHtml(JSON.stringify(JSON.parse(tc.arguments), null, 2)) + '</div>'; }
        catch (_) { body += '<div class="' + prefix + '-tool-call-section"><b>Args:</b> ' + escapeHtml(tc.arguments) + '</div>'; }
      }
      if (tc.result) {
        try {
          var r = JSON.parse(tc.result);
          var rt = r.result || JSON.stringify(r, null, 2);
          if (rt.length > truncLen) rt = rt.substring(0, truncLen) + '...';
          body += '<div class="' + prefix + '-tool-call-section"><b>Result:</b> ' + escapeHtml(rt) + '</div>';
        } catch (_) {
          var rt2 = tc.result.length > truncLen ? tc.result.substring(0, truncLen) + '...' : tc.result;
          body += '<div class="' + prefix + '-tool-call-section"><b>Result:</b> ' + escapeHtml(rt2) + '</div>';
        }
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
          var body = this.nextElementSibling;
          if (body) {
            var inner = body.querySelector('.' + prefix + '-tool-call-body');
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
            if (!el) {
              el = document.createElement('div');
              el.id = elId;
              container.appendChild(el);
              toolCallEls[elId] = el;
            }
            el.innerHTML = streaming.renderToolCallHTML(evt.toolCall, { prefix: prefix, truncateLen: truncLen, toggleAttr: toggleAttr, collapsed: false });
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

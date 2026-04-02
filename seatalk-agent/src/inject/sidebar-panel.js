// Agent sidebar panel — full chat UI injected into SeaTalk
(function () {
  if (document.getElementById('agent-panel')) return;

  var MIN_WIDTH = 320;
  var MAX_WIDTH = 800;
  var DEFAULT_WIDTH = 380;
  var ANIM_MS = 250;

  var savedWidth = DEFAULT_WIDTH;
  try {
    var sw = parseInt(localStorage.getItem('__agentPanelWidth'), 10);
    if (sw >= MIN_WIDTH && sw <= MAX_WIDTH) savedWidth = sw;
  } catch (e) {}
  var PANEL_WIDTH = savedWidth;

  // ── Styles ──

  var css = document.createElement('style');
  css.textContent = '\
#agent-panel {\
  position: fixed; right: 0; top: 0; bottom: 0;\
  width: ' + PANEL_WIDTH + 'px;\
  background: #1e1e2e;\
  border-left: 1px solid rgba(255,255,255,0.06);\
  z-index: 10000;\
  display: flex; flex-direction: column;\
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\
  font-size: 13px; color: rgba(255,255,255,0.85);\
  transform: translateX(100%);\
  transition: transform ' + ANIM_MS + 'ms cubic-bezier(0.4,0,0.2,1);\
  pointer-events: auto;\
}\
#agent-panel.open { transform: translateX(0); }\
\
#agent-resize-handle {\
  position: absolute; left: -3px; top: 0; bottom: 0; width: 6px;\
  cursor: col-resize; z-index: 10001;\
}\
#agent-resize-handle::after {\
  content: ""; position: absolute; left: 2px; top: 50%; transform: translateY(-50%);\
  width: 2px; height: 36px; border-radius: 1px;\
  background: rgba(255,255,255,0.1); transition: background 0.15s, height 0.15s;\
}\
#agent-resize-handle:hover::after, #agent-panel.resizing #agent-resize-handle::after {\
  background: rgba(122,162,247,0.5); height: 48px;\
}\
#agent-panel.resizing { transition: none !important; user-select: none; }\
\
#agent-panel-header {\
  display: flex; align-items: center; justify-content: space-between;\
  padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);\
  -webkit-app-region: no-drag; flex-shrink: 0;\
}\
#agent-panel-header .title {\
  font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px;\
}\
#agent-panel-header .title svg { width: 16px; height: 16px; }\
#agent-panel-header .close-btn {\
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;\
  border-radius: 6px; cursor: pointer; border: none; background: transparent;\
  color: rgba(255,255,255,0.5); font-size: 18px; line-height: 1;\
}\
#agent-panel-header .close-btn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.8); }\
\
#agent-toolbar {\
  display: flex; gap: 6px; padding: 8px 16px;\
  border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0;\
}\
.agent-toolbar-btn {\
  padding: 5px 10px; border-radius: 6px; cursor: pointer;\
  border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);\
  color: rgba(255,255,255,0.65); font-size: 12px;\
  transition: all 0.15s;\
}\
.agent-toolbar-btn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.9); }\
\
#agent-messages {\
  flex: 1; overflow-y: auto; padding: 16px;\
  display: flex; flex-direction: column; gap: 16px;\
}\
#agent-messages::-webkit-scrollbar { width: 4px; }\
#agent-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }\
\
.agent-msg {\
  display: flex; flex-direction: column; gap: 4px;\
}\
.agent-msg .sender {\
  font-size: 11px; font-weight: 600; text-transform: uppercase;\
  letter-spacing: 0.5px;\
}\
.agent-msg .sender.user { color: #7aa2f7; }\
.agent-msg .sender.assistant { color: #9ece6a; }\
.agent-msg .bubble {\
  padding: 10px 14px; border-radius: 10px; line-height: 1.5;\
  word-break: break-word;\
}\
.agent-msg .bubble p { margin: 4px 0; }\
.agent-msg .bubble p:first-child { margin-top: 0; }\
.agent-msg .bubble p:last-child { margin-bottom: 0; }\
.agent-msg .bubble.user-bubble { white-space: pre-wrap; }\
.agent-msg .bubble.user-bubble {\
  background: rgba(122,162,247,0.1); border: 1px solid rgba(122,162,247,0.15);\
}\
.agent-msg .bubble.assistant-bubble {\
  background: rgba(158,206,106,0.06); border: 1px solid rgba(158,206,106,0.1);\
}\
.agent-msg .bubble .tool-call {\
  margin-top: 6px; padding: 6px 10px; border-radius: 6px;\
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);\
  font-size: 11px; color: rgba(255,255,255,0.5); font-family: monospace;\
}\
\
.agent-thinking {\
  display: flex; align-items: center; gap: 8px;\
  padding: 10px 14px; color: rgba(255,255,255,0.4); font-size: 12px;\
}\
.agent-thinking .dots { display: inline-flex; gap: 3px; }\
.agent-thinking .dots span {\
  width: 4px; height: 4px; border-radius: 50%; background: rgba(158,206,106,0.6);\
  animation: agentDot 1.2s ease-in-out infinite;\
}\
.agent-thinking .dots span:nth-child(2) { animation-delay: 0.2s; }\
.agent-thinking .dots span:nth-child(3) { animation-delay: 0.4s; }\
@keyframes agentDot {\
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }\
  40% { opacity: 1; transform: scale(1.2); }\
}\
\
.agent-tool-item {\
  margin: 4px 0; border-radius: 6px;\
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);\
  font-size: 11px; color: rgba(255,255,255,0.5);\
  overflow: hidden;\
}\
.agent-tool-header {\
  padding: 6px 10px; display: flex; align-items: center; gap: 6px;\
  cursor: pointer; user-select: none;\
}\
.agent-tool-header:hover { background: rgba(255,255,255,0.03); }\
.agent-tool-item .tool-icon { font-size: 12px; flex-shrink: 0; }\
.agent-tool-item .tool-title { flex: 1; }\
.agent-tool-item .tool-chevron {\
  font-size: 10px; opacity: 0.4; transition: transform 0.15s;\
}\
.agent-tool-item.open .tool-chevron { transform: rotate(90deg); }\
.agent-tool-item.running .tool-icon { color: #e0af68; }\
.agent-tool-item.completed .tool-icon { color: #9ece6a; }\
.agent-tool-item.failed .tool-icon { color: #f7768e; }\
.agent-tool-detail {\
  display: none; padding: 6px 10px; border-top: 1px solid rgba(255,255,255,0.04);\
  font-family: "SF Mono", monospace; font-size: 11px; max-height: 200px;\
  overflow: auto; white-space: pre-wrap; word-break: break-all;\
  color: rgba(255,255,255,0.45); line-height: 1.4;\
}\
.agent-tool-item.open .agent-tool-detail { display: block; }\
\
.agent-thought {\
  margin: 4px 0; border-radius: 6px;\
  background: rgba(187,154,247,0.04); border: 1px solid rgba(187,154,247,0.08);\
  font-size: 12px; overflow: hidden;\
}\
.agent-thought-header {\
  padding: 5px 10px; display: flex; align-items: center; gap: 6px;\
  cursor: pointer; user-select: none; color: rgba(187,154,247,0.6);\
}\
.agent-thought-header:hover { background: rgba(187,154,247,0.04); }\
.agent-thought-header .thought-chevron {\
  font-size: 10px; opacity: 0.5; transition: transform 0.15s;\
}\
.agent-thought.open .thought-chevron { transform: rotate(90deg); }\
.agent-thought-body {\
  display: none; padding: 6px 10px; border-top: 1px solid rgba(187,154,247,0.06);\
  color: rgba(255,255,255,0.45); line-height: 1.5; white-space: pre-wrap;\
  word-break: break-word; max-height: 300px; overflow: auto;\
}\
.agent-thought.open .agent-thought-body { display: block; }\
\
.agent-stop-reason {\
  padding: 6px 12px; margin: 4px 0; border-radius: 6px;\
  font-size: 11px; display: flex; align-items: center; gap: 6px;\
}\
.agent-stop-reason.cancelled {\
  background: rgba(224,175,104,0.08); border: 1px solid rgba(224,175,104,0.15);\
  color: rgba(224,175,104,0.8);\
}\
.agent-stop-reason.error {\
  background: rgba(247,118,142,0.08); border: 1px solid rgba(247,118,142,0.15);\
  color: rgba(247,118,142,0.8);\
}\
.agent-stop-reason.max_tokens {\
  background: rgba(224,175,104,0.08); border: 1px solid rgba(224,175,104,0.15);\
  color: rgba(224,175,104,0.8);\
}\
\
#agent-status-bar {\
  padding: 4px 16px; font-size: 10px; color: rgba(255,255,255,0.3);\
  border-top: 1px solid rgba(255,255,255,0.04); flex-shrink: 0;\
  display: flex; align-items: center; gap: 8px;\
}\
#agent-status-bar .status-dot {\
  width: 6px; height: 6px; border-radius: 50%;\
}\
#agent-status-bar .status-dot.connected { background: #9ece6a; }\
#agent-status-bar .status-dot.disconnected { background: #f7768e; }\
\
#agent-mode-select {\
  padding: 3px 8px; border-radius: 5px; font-size: 11px;\
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);\
  color: rgba(255,255,255,0.7); cursor: pointer; outline: none;\
  -webkit-appearance: none; appearance: none;\
}\
#agent-mode-select:hover { background: rgba(255,255,255,0.1); }\
#agent-mode-select option { background: #1e1e2e; color: rgba(255,255,255,0.85); }\
\
#agent-history-overlay {\
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;\
  background: #1e1e2e; z-index: 10; display: none;\
  flex-direction: column;\
}\
#agent-history-overlay.show { display: flex; }\
#agent-history-header {\
  display: flex; align-items: center; padding: 12px 16px;\
  border-bottom: 1px solid rgba(255,255,255,0.06); gap: 10px;\
}\
#agent-history-header .back-btn {\
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;\
  border-radius: 6px; cursor: pointer; border: none; background: transparent;\
  color: rgba(255,255,255,0.5); font-size: 16px;\
}\
#agent-history-header .back-btn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.8); }\
#agent-history-header .hist-title { font-size: 14px; font-weight: 600; flex: 1; }\
#agent-history-list {\
  flex: 1; overflow-y: auto; padding: 8px 16px;\
}\
#agent-history-list::-webkit-scrollbar { width: 4px; }\
#agent-history-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }\
.agent-hist-item {\
  padding: 10px 12px; margin-bottom: 6px; border-radius: 8px;\
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);\
  cursor: pointer; transition: background 0.15s;\
}\
.agent-hist-item:hover { background: rgba(255,255,255,0.06); }\
.agent-hist-item.active { border-color: rgba(122,162,247,0.3); background: rgba(122,162,247,0.06); }\
.agent-hist-item .hist-summary {\
  font-size: 12px; color: rgba(255,255,255,0.75);\
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\
}\
.agent-hist-item .hist-meta {\
  display: flex; align-items: center; justify-content: space-between;\
  margin-top: 4px; font-size: 10px; color: rgba(255,255,255,0.3);\
}\
.agent-hist-item .hist-delete {\
  opacity: 0; padding: 2px 6px; border-radius: 4px; border: none;\
  background: rgba(247,118,142,0.15); color: rgba(247,118,142,0.7);\
  font-size: 10px; cursor: pointer; transition: opacity 0.15s;\
}\
.agent-hist-item:hover .hist-delete { opacity: 1; }\
.agent-hist-item .hist-delete:hover { background: rgba(247,118,142,0.25); }\
.agent-hist-empty {\
  text-align: center; padding: 40px 20px;\
  color: rgba(255,255,255,0.3); font-size: 12px;\
}\
\
\
.agent-msg .bubble.assistant-bubble {\
  font-size: 13px; line-height: 1.6; white-space: normal;\
  cursor: text; user-select: text;\
}\
.agent-msg .bubble code {\
  background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 3px;\
  font-family: "SF Mono", "Fira Code", monospace; font-size: 0.9em;\
  color: rgba(255,200,100,0.9);\
}\
.agent-msg .bubble pre {\
  position: relative; margin: 8px 0;\
  background: rgba(0,0,0,0.3); padding: 10px 12px; border-radius: 6px;\
  overflow-x: auto; border: 1px solid rgba(255,255,255,0.08);\
  font-size: 12px; line-height: 1.5;\
}\
.agent-msg .bubble pre code {\
  background: none; padding: 0; border-radius: 0;\
  font-size: inherit; color: rgba(255,255,255,0.8);\
  white-space: pre;\
}\
.agent-msg .bubble .code-copy-btn {\
  position: absolute; top: 4px; right: 4px;\
  padding: 2px 8px; border-radius: 4px; border: none; cursor: pointer;\
  background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.5);\
  font-size: 10px; transition: all 0.15s; opacity: 0;\
}\
.agent-msg .bubble pre:hover .code-copy-btn { opacity: 1; }\
.agent-msg .bubble .code-copy-btn:hover {\
  background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.8);\
}\
.agent-msg .bubble ul, .agent-msg .bubble ol {\
  margin: 6px 0; padding-left: 20px;\
}\
.agent-msg .bubble li { margin: 3px 0; }\
.agent-msg .bubble strong { color: rgba(255,255,255,0.95); }\
.agent-msg .bubble em { color: rgba(255,255,255,0.7); font-style: italic; }\
.agent-msg .bubble blockquote {\
  border-left: 3px solid rgba(122,162,247,0.4); margin: 8px 0;\
  padding: 4px 12px; color: rgba(255,255,255,0.6);\
  background: rgba(255,255,255,0.02);\
}\
.agent-msg .bubble h1, .agent-msg .bubble h2, .agent-msg .bubble h3 {\
  margin: 10px 0 4px; font-weight: 600; color: rgba(255,255,255,0.95);\
}\
.agent-msg .bubble h1 { font-size: 1.2em; }\
.agent-msg .bubble h2 { font-size: 1.1em; }\
.agent-msg .bubble h3 { font-size: 1.05em; }\
.agent-msg .bubble hr {\
  border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 12px 0;\
}\
.agent-msg .bubble table {\
  border-collapse: collapse; margin: 8px 0; font-size: 12px; width: 100%;\
}\
.agent-msg .bubble th {\
  text-align: left; padding: 5px 8px;\
  border-bottom: 1px solid rgba(255,255,255,0.15);\
  color: rgba(255,255,255,0.7); font-weight: 600;\
}\
.agent-msg .bubble td {\
  padding: 4px 8px; border-bottom: 1px solid rgba(255,255,255,0.05);\
}\
.agent-msg .bubble a {\
  color: rgba(100,180,255,0.9); text-decoration: none;\
}\
.agent-msg .bubble a:hover { text-decoration: underline; }\
\
.agent-welcome {\
  display: flex; flex-direction: column; align-items: center;\
  justify-content: center; flex: 1; gap: 12px; color: rgba(255,255,255,0.35);\
  text-align: center; padding: 40px;\
}\
.agent-welcome svg { width: 48px; height: 48px; opacity: 0.3; }\
.agent-welcome .hint { font-size: 12px; line-height: 1.6; }\
\
#agent-input-area {\
  display: flex; gap: 8px; padding: 12px 16px;\
  border-top: 1px solid rgba(255,255,255,0.06); flex-shrink: 0;\
  align-items: flex-end;\
}\
#agent-input {\
  flex: 1; min-height: 36px; max-height: 120px;\
  padding: 8px 12px; border-radius: 10px;\
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);\
  color: rgba(255,255,255,0.9); font-size: 13px; font-family: inherit;\
  resize: none; outline: none; line-height: 1.4;\
}\
#agent-input:focus { border-color: rgba(122,162,247,0.4); }\
#agent-input::placeholder { color: rgba(255,255,255,0.25); }\
#agent-send-btn {\
  width: 36px; height: 36px; border-radius: 8px;\
  background: #4d96ff; border: none; cursor: pointer;\
  display: flex; align-items: center; justify-content: center;\
  transition: background 0.15s; flex-shrink: 0;\
}\
#agent-send-btn:hover { background: #3a7ee8; }\
#agent-send-btn svg { width: 16px; height: 16px; }\
#agent-stop-btn {\
  width: 36px; height: 36px; border-radius: 8px;\
  background: #f7768e; border: none; cursor: pointer;\
  display: none; align-items: center; justify-content: center;\
  transition: background 0.15s; flex-shrink: 0;\
}\
#agent-stop-btn:hover { background: #e05672; }\
#agent-stop-btn svg { width: 14px; height: 14px; }\
\
#agent-context-bar {\
  display: none; padding: 6px 16px; font-size: 11px;\
  background: rgba(122,162,247,0.08); color: rgba(122,162,247,0.8);\
  border-bottom: 1px solid rgba(122,162,247,0.12); flex-shrink: 0;\
  align-items: center; gap: 6px;\
}\
#agent-context-bar.show { display: flex; }\
#agent-context-bar .remove {\
  margin-left: auto; cursor: pointer; opacity: 0.5;\
}\
#agent-context-bar .remove:hover { opacity: 1; }\
';
  document.head.appendChild(css);

  // ── Panel DOM ──

  var panel = document.createElement('div');
  panel.id = 'agent-panel';
  panel.innerHTML = '\
<div id="agent-resize-handle"></div>\
<div id="agent-panel-header">\
  <div class="title">\
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\
      <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/>\
    </svg>\
    Cursor\
  </div>\
  <div class="close-btn" id="agent-close-btn">&times;</div>\
</div>\
<div id="agent-toolbar">\
  <select id="agent-mode-select"><option value="agent">Agent</option><option value="ask">Ask</option><option value="plan">Plan</option></select>\
  <div class="agent-toolbar-btn" id="agent-ctx-btn">&#128172; \u5f15\u7528\u804a\u5929</div>\
  <div class="agent-toolbar-btn" id="agent-history-btn">&#128240; \u5386\u53f2</div>\
  <div class="agent-toolbar-btn" id="agent-new-btn">+ \u65b0\u5bf9\u8bdd</div>\
</div>\
<div id="agent-context-bar">\
  <span id="agent-context-label"></span>\
  <span class="remove" id="agent-context-remove">&times;</span>\
</div>\
<div id="agent-messages">\
  <div class="agent-welcome">\
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">\
      <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/>\
    </svg>\
    <div style="font-size:15px;color:rgba(255,255,255,0.5);font-weight:500;">Cursor</div>\
    <div class="hint">\u8f93\u5165\u95ee\u9898\u5f00\u59cb\u5bf9\u8bdd</div>\
  </div>\
</div>\
<div id="agent-history-overlay">\
  <div id="agent-history-header">\
    <button class="back-btn" id="agent-history-back">\u2190</button>\
    <span class="hist-title">\u5bf9\u8bdd\u5386\u53f2</span>\
  </div>\
  <div id="agent-history-list"></div>\
</div>\
<div id="agent-status-bar">\
  <span class="status-dot connected" id="agent-status-dot"></span>\
  <span id="agent-status-text">Connected</span>\
</div>\
<div id="agent-input-area">\
  <textarea id="agent-input" placeholder="\u8f93\u5165\u6d88\u606f..." rows="1"></textarea>\
  <button id="agent-send-btn">\
    <svg viewBox="0 0 24 24" fill="white" stroke="none"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>\
  </button>\
  <button id="agent-stop-btn">\
    <svg viewBox="0 0 24 24" fill="white" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>\
  </button>\
</div>';

  document.body.appendChild(panel);

  // Links inside panel open in system browser instead of SeaTalk webview
  panel.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || /^(javascript|data|vbscript):/i.test(href)) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      var shell = require('@electron/remote').shell || require('electron').shell;
      shell.openExternal(href);
    } catch (_) {
      try { require('electron').shell.openExternal(href); } catch (_2) {
        window.open(href, '_blank');
      }
    }
  }, true);

  // ── Resize handle ──

  (function () {
    var handle = document.getElementById('agent-resize-handle');
    var dragging = false;
    var startX = 0;
    var startW = 0;

    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startW = panel.offsetWidth;
      panel.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var delta = startX - e.clientX;
      var newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + delta));
      panel.style.width = newW + 'px';
      var detail = document.querySelector('.messages-message-detail-view');
      if (detail && panel.classList.contains('open')) {
        detail.style.transition = 'none';
        detail.style.marginRight = newW + 'px';
      }
    });

    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      panel.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      var finalW = panel.offsetWidth;
      try { localStorage.setItem('__agentPanelWidth', String(finalW)); } catch (e) {}
    });
  })();

  // ── State ──

  var STORAGE_KEY = '__agentConversations';
  var conversations = [];
  var currentConvIdx = -1;
  var messages = [];
  var contextMessages = null;
  var isOpen = false;

  function loadConversations() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) conversations = JSON.parse(raw);
    } catch (e) {}
  }

  function saveConversations() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(-50)));
    } catch (e) {}
  }

  function saveCurrentConversation() {
    if (messages.length === 0) return;
    var conv = {
      id: currentConvIdx >= 0 ? conversations[currentConvIdx].id : Date.now(),
      ts: Date.now(),
      messages: messages.slice(),
    };
    var firstUserMsg = messages.find(function (m) { return m.role === 'user'; });
    conv.summary = firstUserMsg ? firstUserMsg.text.substring(0, 80) : '(empty)';
    if (currentConvIdx >= 0) {
      conversations[currentConvIdx] = conv;
    } else {
      conversations.push(conv);
      currentConvIdx = conversations.length - 1;
    }
    saveConversations();
  }

  function switchToConversation(idx) {
    saveCurrentConversation();
    currentConvIdx = idx;
    var conv = conversations[idx];
    messages = conv ? conv.messages.slice() : [];
    toolCalls = {};
    renderMessages();
    historyOverlay.classList.remove('show');
  }

  function startNewConversation() {
    saveCurrentConversation();
    currentConvIdx = -1;
    messages = [];
    toolCalls = {};
    contextMessages = null;
    ctxBar.classList.remove('show');
    renderMessages();
  }

  function renderHistoryList() {
    if (conversations.length === 0) {
      historyList.innerHTML = '<div class="agent-hist-empty">\u6682\u65e0\u5386\u53f2\u5bf9\u8bdd</div>';
      return;
    }
    var html = '';
    for (var i = conversations.length - 1; i >= 0; i--) {
      var c = conversations[i];
      var d = new Date(c.ts);
      var timeStr = d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      var activeCls = (i === currentConvIdx) ? ' active' : '';
      html += '<div class="agent-hist-item' + activeCls + '" data-idx="' + i + '">' +
        '<div class="hist-summary">' + escHtml(c.summary || '(empty)') + '</div>' +
        '<div class="hist-meta"><span>' + timeStr + ' \u00b7 ' + c.messages.length + '\u6761\u6d88\u606f</span>' +
        '<button class="hist-delete" data-del-idx="' + i + '">\u5220\u9664</button></div></div>';
    }
    historyList.innerHTML = html;

    historyList.querySelectorAll('.agent-hist-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        if (e.target.classList.contains('hist-delete')) return;
        var idx = parseInt(item.getAttribute('data-idx'));
        switchToConversation(idx);
      });
    });

    historyList.querySelectorAll('.hist-delete').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute('data-del-idx'));
        if (idx === currentConvIdx) {
          currentConvIdx = -1;
          messages = [];
          toolCalls = {};
          renderMessages();
        } else if (currentConvIdx > idx) {
          currentConvIdx--;
        }
        conversations.splice(idx, 1);
        saveConversations();
        renderHistoryList();
      });
    });
  }

  loadConversations();

  // ── DOM refs ──

  var messagesEl = document.getElementById('agent-messages');
  var inputEl = document.getElementById('agent-input');
  var sendBtn = document.getElementById('agent-send-btn');
  var stopBtn = document.getElementById('agent-stop-btn');
  var closeBtn = document.getElementById('agent-close-btn');
  var ctxBtn = document.getElementById('agent-ctx-btn');
  var newBtn = document.getElementById('agent-new-btn');
  var ctxBar = document.getElementById('agent-context-bar');
  var ctxLabel = document.getElementById('agent-context-label');
  var ctxRemove = document.getElementById('agent-context-remove');
  var modeSelect = document.getElementById('agent-mode-select');
  var statusDot = document.getElementById('agent-status-dot');
  var statusText = document.getElementById('agent-status-text');
  var historyBtn = document.getElementById('agent-history-btn');
  var historyOverlay = document.getElementById('agent-history-overlay');
  var historyList = document.getElementById('agent-history-list');
  var historyBack = document.getElementById('agent-history-back');
  var isProcessing = false;

  function setProcessing(v) {
    isProcessing = v;
    sendBtn.style.display = v ? 'none' : 'flex';
    stopBtn.style.display = v ? 'flex' : 'none';
  }

  // ── Open / Close ──

  function openPanel() {
    isOpen = true;
    panel.classList.add('open');
    var detail = document.querySelector('.messages-message-detail-view');
    if (detail) detail.style.transition = 'margin-right ' + ANIM_MS + 'ms ease';
    if (detail) detail.style.marginRight = panel.offsetWidth + 'px';
    var btn = document.getElementById('agent-sidebar-btn');
    if (btn) btn.classList.add('active');
    setTimeout(function () { inputEl.focus(); }, ANIM_MS);
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('open');
    var detail = document.querySelector('.messages-message-detail-view');
    if (detail) detail.style.marginRight = '0';
    var btn = document.getElementById('agent-sidebar-btn');
    if (btn) btn.classList.remove('active');
  }

  window.__agentToggle = function (open) {
    if (open === undefined) open = !isOpen;
    if (open) openPanel();
    else closePanel();
  };

  closeBtn.addEventListener('click', function () { closePanel(); });

  modeSelect.addEventListener('change', function () {
    if (typeof window.__agentSend === 'function') {
      window.__agentSend(JSON.stringify({ type: 'set_mode', mode: modeSelect.value }));
    }
  });

  window.__agentSetStatus = function (connected, text) {
    statusDot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
    statusText.textContent = text || (connected ? 'Connected' : 'Disconnected');
  };

  historyBtn.addEventListener('click', function () {
    saveCurrentConversation();
    renderHistoryList();
    historyOverlay.classList.add('show');
  });

  historyBack.addEventListener('click', function () {
    historyOverlay.classList.remove('show');
  });

  // ── Markdown renderer (marked.js) ──

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  var markedReady = false;
  (function loadMarked() {
    if (window.marked) { markedReady = true; configureMarked(); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/marked@15/marked.min.js';
    s.onload = function () { markedReady = true; configureMarked(); };
    s.onerror = function () {
      var s2 = document.createElement('script');
      s2.src = 'https://unpkg.com/marked@15/marked.min.js';
      s2.onload = function () { markedReady = true; configureMarked(); };
      document.head.appendChild(s2);
    };
    document.head.appendChild(s);
  })();

  function configureMarked() {
    if (!window.marked) return;
    window.marked.setOptions({ breaks: true, gfm: true });
  }

  function renderMarkdown(raw) {
    if (markedReady && window.marked) {
      try { return sanitizeHtml(window.marked.parse(raw)); } catch (_) {}
    }
    return '<pre style="white-space:pre-wrap;">' + escHtml(raw) + '</pre>';
  }

  // ── Render messages ──

  var WELCOME_HTML = '\
<div class="agent-welcome">\
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">\
    <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/>\
  </svg>\
  <div style="font-size:15px;color:rgba(255,255,255,0.5);font-weight:500;">Cursor</div>\
  <div class="hint">\u8f93\u5165\u95ee\u9898\u5f00\u59cb\u5bf9\u8bdd</div>\
</div>';

  function buildMsgHtml(m) {
    var senderCls = m.role === 'user' ? 'user' : 'assistant';
    var bubbleCls = m.role === 'user' ? 'user-bubble' : 'assistant-bubble';
    var label = m.role === 'user' ? 'You' : 'Agent';
    var content = m.role === 'assistant' ? renderMarkdown(m.text) : escHtml(m.text);
    return '<div class="agent-msg">' +
      '<div class="sender ' + senderCls + '">' + label + '</div>' +
      '<div class="bubble ' + bubbleCls + '">' + content + '</div>' +
      '</div>';
  }

  function renderMessages() {
    if (messages.length === 0) {
      messagesEl.innerHTML = WELCOME_HTML;
      return;
    }
    var html = '';
    for (var i = 0; i < messages.length; i++) {
      html += buildMsgHtml(messages[i]);
    }
    messagesEl.innerHTML = html;
    autoScroll();
    bindCopyButtons();
  }

  function bindCopyButtons() {
    messagesEl.querySelectorAll('pre').forEach(function (pre) {
      if (pre.querySelector('.code-copy-btn')) return;
      var btn = document.createElement('button');
      btn.className = 'code-copy-btn';
      btn.textContent = 'Copy';
      btn.style.cssText = 'position:absolute;top:4px;right:4px;';
      pre.style.position = 'relative';
      btn.addEventListener('click', function () {
        var code = pre.querySelector('code');
        var text = code ? code.textContent : pre.textContent;
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = 'Copied!';
          setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
        });
      });
      pre.appendChild(btn);
    });
  }

  function findStreamingMsg() {
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].streaming) return messages[i];
    }
    return null;
  }

  function getOrCreateStreamBubble() {
    var el = document.getElementById('agent-stream-bubble');
    if (el) return el;
    var wrapper = document.createElement('div');
    wrapper.className = 'agent-msg';
    wrapper.innerHTML = '<div class="sender assistant">Agent</div>' +
      '<div class="bubble assistant-bubble" id="agent-stream-bubble"></div>';
    messagesEl.appendChild(wrapper);
    return document.getElementById('agent-stream-bubble');
  }

  var streamRenderTimer = null;

  function renderStreamBubble() {
    var last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    var bubble = getOrCreateStreamBubble();
    bubble.innerHTML = renderMarkdown(last.text);
    autoScroll();
  }

  function scheduleStreamRender() {
    if (streamRenderTimer) return;
    streamRenderTimer = setTimeout(function () {
      streamRenderTimer = null;
      renderStreamBubble();
    }, 60);
  }

  // ── Smart scroll ──

  var userScrolledUp = false;

  messagesEl.addEventListener('scroll', function () {
    var atBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 40;
    userScrolledUp = !atBottom;
  });

  function autoScroll() {
    if (!userScrolledUp) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  // ── Send message ──

  function sendMessage() {
    var text = inputEl.value.trim();
    if (!text || isProcessing) return;

    messages.push({ role: 'user', text: text });
    inputEl.value = '';
    inputEl.style.height = 'auto';
    renderMessages();

    var payload = { type: 'user_message', text: text };
    if (contextMessages) {
      payload.context = contextMessages;
      contextMessages = null;
      ctxBar.classList.remove('show');
    }

    if (typeof window.__agentSend === 'function') {
      window.__agentSend(JSON.stringify(payload));
    } else {
      // Mock response for PoC
      setTimeout(function () {
        messages.push({
          role: 'assistant',
          text: '[PoC] Agent \u8fd8\u672a\u8fde\u63a5\u3002\u5f53\u524d\u4e3a\u6f14\u793a\u6a21\u5f0f\u3002\n\n\u4f60\u53d1\u9001\u4e86: "' + text + '"',
        });
        renderMessages();
      }, 500);
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  stopBtn.addEventListener('click', function () {
    if (typeof window.__agentSend === 'function') {
      window.__agentSend(JSON.stringify({ type: 'cancel' }));
    }
    setProcessing(false);
    removeThinking();
  });
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  inputEl.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // ── Quote current chat ──

  ctxBtn.addEventListener('click', function () {
    try {
      var s = window.store.getState();
      var msgMap = (s.messages && s.messages.messages) || {};
      var sessions = (s.messages && s.messages.sessionList) || [];
      var userInfo = (s.contact && s.contact.userInfo) || {};
      var groupInfo = (s.contact && s.contact.groupInfo) || {};

      // Find current active session
      var activeSession = sessions[0];
      if (!activeSession) { alert('No active session'); return; }

      var sessType = activeSession.type;
      var sessId = activeSession.id;
      var sessName = '';
      if (sessType === 'group') {
        var gi = groupInfo[sessId];
        sessName = gi ? (gi.name || '') : 'group-' + sessId;
      } else {
        var ui = userInfo[sessId];
        sessName = ui ? (ui.name || '') : 'user-' + sessId;
      }

      var prefix = sessType + '-' + sessId;
      var chatMsgs = [];
      for (var key in msgMap) {
        if (key.indexOf(prefix + '-') !== 0) continue;
        var m = msgMap[key];
        if (!m || !m.timeStamp) continue;
        var senderName = '';
        if (m.senderId) {
          var su = userInfo[m.senderId];
          senderName = su ? (su.name || '') : 'user-' + m.senderId;
        }
        var text = (m.content && m.content.text) || '';
        if (text) chatMsgs.push({ sender: senderName, text: text.substring(0, 500), ts: m.timeStamp });
      }
      chatMsgs.sort(function (a, b) { return a.ts - b.ts; });
      chatMsgs = chatMsgs.slice(-20);

      contextMessages = { sessionName: sessName, sessionType: sessType, sessionId: sessId, messages: chatMsgs };
      ctxLabel.textContent = '\u5f15\u7528: ' + sessName + ' (\u6700\u8fd1' + chatMsgs.length + '\u6761)';
      ctxBar.classList.add('show');
    } catch (err) {
      alert('Failed to read chat: ' + err.message);
    }
  });

  ctxRemove.addEventListener('click', function () {
    contextMessages = null;
    ctxBar.classList.remove('show');
  });

  // ── New conversation ──

  newBtn.addEventListener('click', function () {
    startNewConversation();
    if (typeof window.__agentSend === 'function') {
      window.__agentSend(JSON.stringify({ type: 'new_conversation' }));
    }
  });

  // ── Receive from Node side ──

  var toolCalls = {};

  function removeThinking() {
    var el = document.getElementById('agent-thinking-indicator');
    if (el) el.remove();
  }

  function finalizeThought() {
    var el = document.getElementById('agent-current-thought');
    if (el) el.removeAttribute('id');
  }

  function getOrCreateToolEl(toolCallId) {
    var existing = document.getElementById('tool-' + toolCallId);
    if (existing) return existing;
    var el = document.createElement('div');
    el.id = 'tool-' + toolCallId;
    el.className = 'agent-tool-item running';
    el.innerHTML = '<div class="agent-tool-header">' +
      '<span class="tool-icon">\u26a1</span>' +
      '<span class="tool-title">Working...</span>' +
      '<span class="tool-chevron">\u25b6</span>' +
      '</div>' +
      '<div class="agent-tool-detail"></div>';
    el.querySelector('.agent-tool-header').addEventListener('click', function () {
      el.classList.toggle('open');
    });
    messagesEl.appendChild(el);
    autoScroll();
    return el;
  }

  window.__agentReceive = function (jsonStr) {
    try {
      var data = JSON.parse(jsonStr);

      if (data.type === 'thinking_start') {
        removeThinking();
        var ind = document.createElement('div');
        ind.id = 'agent-thinking-indicator';
        ind.className = 'agent-thinking';
        ind.innerHTML = '<div class="dots"><span></span><span></span><span></span></div> Thinking...';
        messagesEl.appendChild(ind);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        setProcessing(true);
        return;
      }

      if (data.type === 'assistant_message') {
        removeThinking();
        finalizeThought();
        messages.push({ role: 'assistant', text: data.text });
        renderMessages();
        setProcessing(false);
      } else if (data.type === 'assistant_chunk') {
        removeThinking();
        var streamingMsg = findStreamingMsg();
        if (streamingMsg) {
          streamingMsg.text += data.text;
        } else {
          messages.push({ role: 'assistant', text: data.text, streaming: true });
        }
        scheduleStreamRender();
      } else if (data.type === 'assistant_done') {
        var lastStreaming = findStreamingMsg();
        if (lastStreaming) lastStreaming.streaming = false;
        if (streamRenderTimer) { clearTimeout(streamRenderTimer); streamRenderTimer = null; }
        finalizeThought();
        var streamBubble = document.getElementById('agent-stream-bubble');
        if (streamBubble && lastStreaming) {
          streamBubble.innerHTML = renderMarkdown(lastStreaming.text);
          streamBubble.removeAttribute('id');
          bindCopyButtons();
        }
        setProcessing(false);
        saveCurrentConversation();
      } else if (data.type === 'tool_call_start') {
        var el = getOrCreateToolEl(data.toolCallId);
        var icon = data.kind === 'read' ? '\ud83d\udcc4' : data.kind === 'write' ? '\u270f\ufe0f' : data.kind === 'execute' ? '\u25b6\ufe0f' : data.kind === 'search' ? '\ud83d\udd0d' : data.kind === 'think' ? '\ud83e\udde0' : data.kind === 'fetch' ? '\ud83c\udf10' : '\u26a1';
        el.querySelector('.tool-icon').textContent = icon;
        el.querySelector('.tool-title').textContent = data.title || 'Tool call';
        if (data.input) el.querySelector('.agent-tool-detail').textContent = data.input;
        toolCalls[data.toolCallId] = { status: 'running' };
      } else if (data.type === 'tool_call_update') {
        var uel = getOrCreateToolEl(data.toolCallId);
        if (data.title) uel.querySelector('.tool-title').textContent = data.title;
        if (data.output) {
          var detail = uel.querySelector('.agent-tool-detail');
          detail.textContent = (detail.textContent ? detail.textContent + '\n' : '') + data.output;
        }
        if (data.status === 'completed') {
          uel.className = 'agent-tool-item completed';
          uel.querySelector('.tool-icon').textContent = '\u2705';
        } else if (data.status === 'failed') {
          uel.className = 'agent-tool-item failed';
          uel.querySelector('.tool-icon').textContent = '\u274c';
        }
      } else if (data.type === 'agent_thought_chunk') {
        var existingThought = document.getElementById('agent-current-thought');
        if (existingThought) {
          existingThought.querySelector('.agent-thought-body').textContent += data.text;
        } else {
          var thoughtEl = document.createElement('div');
          thoughtEl.className = 'agent-thought';
          thoughtEl.id = 'agent-current-thought';
          thoughtEl.innerHTML = '<div class="agent-thought-header">' +
            '<span class="thought-chevron">\u25b6</span>' +
            '<span>\ud83e\udde0 Thinking</span></div>' +
            '<div class="agent-thought-body"></div>';
          thoughtEl.querySelector('.agent-thought-body').textContent = data.text;
          thoughtEl.querySelector('.agent-thought-header').addEventListener('click', function () {
            thoughtEl.classList.toggle('open');
          });
          messagesEl.appendChild(thoughtEl);
        }
        autoScroll();
      } else if (data.type === 'stop_reason') {
        if (data.reason && data.reason !== 'end_turn') {
          var srEl = document.createElement('div');
          var srCls = data.reason === 'cancelled' ? 'cancelled' :
            data.reason === 'max_tokens' ? 'max_tokens' :
            data.reason === 'max_requests' ? 'max_tokens' : 'error';
          var srIcon = data.reason === 'cancelled' ? '\u23f9' :
            data.reason === 'max_tokens' ? '\u26a0\ufe0f' :
            data.reason === 'content_filter' ? '\ud83d\udeab' : '\u26a0\ufe0f';
          var srText = data.reason === 'cancelled' ? '\u5df2\u53d6\u6d88' :
            data.reason === 'max_tokens' ? '\u8fbe\u5230 Token \u4e0a\u9650' :
            data.reason === 'max_requests' ? '\u8fbe\u5230\u8bf7\u6c42\u4e0a\u9650' :
            data.reason === 'content_filter' ? '\u5185\u5bb9\u88ab\u8fc7\u6ee4' : data.reason;
          srEl.className = 'agent-stop-reason ' + srCls;
          srEl.textContent = srIcon + ' ' + srText;
          messagesEl.appendChild(srEl);
          autoScroll();
        }
      } else if (data.type === 'status_update') {
        if (typeof window.__agentSetStatus === 'function') {
          window.__agentSetStatus(data.connected, data.text);
        }
      } else if (data.type === 'mode_update') {
        modeSelect.value = data.mode || 'agent';
      }
    } catch (e) {}
  };

  // ── Keyboard shortcut: Ctrl+Shift+A ──

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      e.preventDefault();
      window.__agentToggle();
    }
  });
})();

// sidebar-app.js — Cursor ACP chat panel (Cursor-native style)
// Uses self-contained window.__cursorUI (no seatalk-enhance dependency)
(function () {
  var UI = window.__cursorUI;
  if (!UI || !UI.streaming || !UI.createPanel) {
    console.warn('[cursor-acp] window.__cursorUI not ready, skipping');
    return;
  }
  var oldPanel = document.getElementById('cursor-panel');
  if (oldPanel) oldPanel.remove();

  var sr = UI.streaming;
  var escapeHtml = UI.escapeHtml;

  // ── State ──
  var STORE_KEY = '__cursorConversations';
  var WS_KEY = '__cursorLastWorkspace';
  var WS_RECENT_KEY = '__cursorRecentWorkspaces';
  var MAX_RECENT_WS = 10;
  var messages = [];
  var conversations = loadConvs(), currentIdx = -1;
  var MODE_KEY = '__cursorMode';
  var isProcessing = false, contextData = null, currentMode = (function () { try { return localStorage.getItem(MODE_KEY) || 'agent'; } catch (_) { return 'agent'; } })();
  var cachedStatus = { connected: false, text: 'Connecting...' };
  var cachedModels = { models: [], currentModelId: '' };
  var cachedWorkspace = '', cachedWorkspaceList = [];
  var panelHandle = null, messagesEl = null, inputEl = null, sendBtn = null, stopBtn = null;
  var statusDot = null, statusText = null, statusModelEl = null;
  var modeSelect = null, modelSelect = null, ctxBar = null, ctxLabel = null;
  var wsLabel = null;
  var turnView = null, turnEl = null, turnFullText = '', turnFullThinking = '';
  var turnToolCalls = {}; // accumulate tool call state across tool_start / tool_update
  var pendingImages = []; // [{data: base64String, mimeType, name}]
  var imgPreviewEl = null, imgFileInput = null;
  var MAX_IMAGES = 4, MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  var ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  var cachedUpdate = { available: false, local: '', remote: '', behind: 0, changelog: '' };
  var verBadgeEl = null, updateOverlay = null;

  // ── Persistence ──
  function loadConvs() { try { var r = localStorage.getItem(STORE_KEY); return r ? JSON.parse(r) : []; } catch (_) { return []; } }
  function saveConvs(c) { try { localStorage.setItem(STORE_KEY, JSON.stringify(c.slice(-50))); } catch (_) {} }
  function saveCurrentConv() {
    if (messages.length === 0) return;
    var first = messages.find(function (m) { return m.role === 'user'; });
    var conv = {
      id: currentIdx >= 0 && conversations[currentIdx] ? conversations[currentIdx].id : Date.now(),
      ts: Date.now(),
      messages: messages.map(function (m) {
        var o = { role: m.role, text: m.text };
        if (m.thinking) o.thinking = m.thinking.length > 2000 ? m.thinking.substring(0, 2000) + '\n...(思考内容过长，已截断)' : m.thinking;
        if (m.toolSummary) o.toolSummary = m.toolSummary;
        return o;
      }),
      summary: first ? first.text.substring(0, 80) : '(empty)',
      workspace: cachedWorkspace || ''
    };
    if (currentIdx >= 0) { conversations[currentIdx] = conv; } else { conversations.push(conv); currentIdx = conversations.length - 1; }
    saveConvs(conversations);
  }

  // ── Theme ──
  var THEME_KEY = '__cursorTheme';
  var currentTheme = (function () { try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch (_) { return 'dark'; } })();

  function applyTheme(theme) {
    currentTheme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    var panel = document.getElementById('cursor-panel');
    if (panel) {
      panel.classList.remove('theme-dark', 'theme-light');
      panel.classList.add('theme-' + theme);
    }
  }

  // ── CSS — Cursor IDE native style with theme variables ──
  var oldCss = document.getElementById('cursor-acp-css');
  if (oldCss) oldCss.remove();
  UI.injectCSS('cursor-acp-css', [
    // ── Dark theme (default) ──
    '#cursor-panel.theme-dark, #cursor-panel:not(.theme-light) {',
    '  --cp-bg: #1e1e1e; --cp-bg2: #252526; --cp-bg3: #2a2d2e; --cp-bg4: #1a1a1a;',
    '  --cp-border: #2d2d2d; --cp-border2: #3c3c3c; --cp-border3: #333;',
    '  --cp-text: #d4d4d4; --cp-text2: #cccccc; --cp-text-dim: #858585; --cp-text-dim2: #5a5a5a; --cp-text-dim3: #6e6e6e;',
    '  --cp-heading: #e0e0e0; --cp-strong: #e0e0e0;',
    '  --cp-accent: #569cd6; --cp-accent-hover: #4a8abf; --cp-accent-bg: rgba(86,156,214,0.08); --cp-accent-bg2: rgba(86,156,214,0.1);',
    '  --cp-code-bg: #2d2d2d; --cp-code-color: #ce9178; --cp-pre-bg: #1a1a1a; --cp-pre-code: #d4d4d4;',
    '  --cp-blockquote-color: #9e9e9e; --cp-blockquote-bg: rgba(86,156,214,0.06);',
    '  --cp-tool-bg: #1a1a2e; --cp-tool-label: #6a9955; --cp-tool-label-hover: #b5cea8;',
    '  --cp-tool-input: #9cdcfe; --cp-tool-output: #b5cea8; --cp-tool-pre-bg: #0d0d1a; --cp-tool-pre-border: #252530;',
    '  --cp-tool-section-border: #2a2a2a; --cp-tool-section-b: #cccccc;',
    '  --cp-think-bg: #252526; --cp-think-border: #333; --cp-think-color: #858585;',
    '  --cp-typing-dot: #569cd6;',
    '  --cp-scroll-thumb: rgba(255,255,255,0.1); --cp-scroll-thumb-hover: rgba(255,255,255,0.18);',
    '  --cp-error: #d44; --cp-warn: #dca561; --cp-ok: #4ec9b0;',
    '  --cp-dd-shadow: rgba(0,0,0,0.4); --cp-panel-shadow: 0 8px 32px rgba(0,0,0,0.5);',
    '  --cp-log-color: #8c8c8c; --cp-diag-border: #2a2a2a;',
    '  --cp-sendbtn-bg: #569cd6; --cp-sendbtn-hover: #4a8abf; --cp-sendbtn-color: #fff;',
    '  --cp-stopbtn-bg: #d44; --cp-stopbtn-hover: #c33; --cp-stopbtn-color: #fff;',
    '  --cp-link: #569cd6; --cp-qo-icon: #a78bfa; --cp-qo-icon-hover: #8b5cf6;',
    '  --cp-sel-fab-bg: rgba(167,139,250,0.92); --cp-sel-fab-hover: rgba(139,92,246,0.95);',
    '}',

    // ── Light theme ──
    '#cursor-panel.theme-light {',
    '  --cp-bg: #ffffff; --cp-bg2: #f5f5f5; --cp-bg3: #eaeaea; --cp-bg4: #f0f0f0;',
    '  --cp-border: #e0e0e0; --cp-border2: #d0d0d0; --cp-border3: #ddd;',
    '  --cp-text: #333333; --cp-text2: #444444; --cp-text-dim: #888888; --cp-text-dim2: #aaaaaa; --cp-text-dim3: #999999;',
    '  --cp-heading: #222222; --cp-strong: #222222;',
    '  --cp-accent: #2b6cb0; --cp-accent-hover: #2c5282; --cp-accent-bg: rgba(43,108,176,0.06); --cp-accent-bg2: rgba(43,108,176,0.08);',
    '  --cp-code-bg: #f0f0f0; --cp-code-color: #c7254e; --cp-pre-bg: #f7f7f7; --cp-pre-code: #333333;',
    '  --cp-blockquote-color: #666666; --cp-blockquote-bg: rgba(43,108,176,0.04);',
    '  --cp-tool-bg: #f0f4ff; --cp-tool-label: #2e7d32; --cp-tool-label-hover: #4caf50;',
    '  --cp-tool-input: #0d47a1; --cp-tool-output: #2e7d32; --cp-tool-pre-bg: #f5f7fa; --cp-tool-pre-border: #e0e4ea;',
    '  --cp-tool-section-border: #e8e8e8; --cp-tool-section-b: #444444;',
    '  --cp-think-bg: #f5f5f5; --cp-think-border: #ddd; --cp-think-color: #888888;',
    '  --cp-typing-dot: #2b6cb0;',
    '  --cp-scroll-thumb: rgba(0,0,0,0.12); --cp-scroll-thumb-hover: rgba(0,0,0,0.22);',
    '  --cp-error: #c62828; --cp-warn: #e65100; --cp-ok: #2e7d32;',
    '  --cp-dd-shadow: rgba(0,0,0,0.12); --cp-panel-shadow: 0 8px 32px rgba(0,0,0,0.15);',
    '  --cp-log-color: #666666; --cp-diag-border: #e8e8e8;',
    '  --cp-sendbtn-bg: #2b6cb0; --cp-sendbtn-hover: #2c5282; --cp-sendbtn-color: #fff;',
    '  --cp-stopbtn-bg: #c62828; --cp-stopbtn-hover: #b71c1c; --cp-stopbtn-color: #fff;',
    '  --cp-link: #2b6cb0; --cp-qo-icon: #7c3aed; --cp-qo-icon-hover: #6d28d9;',
    '  --cp-sel-fab-bg: rgba(124,58,237,0.92); --cp-sel-fab-hover: rgba(109,40,217,0.95);',
    '}',

    // Override panel chrome
    '#cursor-panel { background:var(--cp-bg) !important; border-color:var(--cp-border) !important; }',
    '#cursor-panel .hp-panel-header { background:var(--cp-bg); border-bottom:none; padding:6px 12px 4px; cursor:grab; }',
    '#cursor-panel .hp-panel-header:active { cursor:grabbing; }',
    '#cursor-panel .hp-panel-title { font-size:11px; font-weight:400; color:var(--cp-text2); text-transform:uppercase; letter-spacing:0.5px; }',
    '#cursor-panel .hp-panel-body { padding:0; background:var(--cp-bg); }',
    '#cursor-panel .hp-panel-close { color:var(--cp-text-dim); }',
    '#cursor-panel .hp-panel-close:hover { color:var(--cp-text); }',

    // Messages container
    '.cursor-msgs { flex:1; overflow-y:auto; padding:0; display:flex; flex-direction:column; }',
    '.cursor-msgs::-webkit-scrollbar { width:6px; }',
    '.cursor-msgs::-webkit-scrollbar-track { background:transparent; }',
    '.cursor-msgs::-webkit-scrollbar-thumb { background:var(--cp-scroll-thumb); border-radius:3px; }',
    '.cursor-msgs::-webkit-scrollbar-thumb:hover { background:var(--cp-scroll-thumb-hover); }',

    // User message
    '.cursor-msg-user { padding:12px 16px; background:var(--cp-bg3); border-top:1px solid var(--cp-border); border-bottom:1px solid var(--cp-border); color:var(--cp-text); font-size:13px; line-height:1.5; white-space:pre-wrap; word-break:break-word; cursor:text; user-select:text; }',
    '.cursor-msg-user-label { font-size:11px; font-weight:600; color:var(--cp-accent); margin-bottom:4px; }',

    // Agent turn
    '.cursor-agent-turn { padding:12px 16px; border-bottom:1px solid var(--cp-border); }',

    // Streaming result — markdown rendering
    '.ca-result { font-size:13px; line-height:1.6; color:var(--cp-text); word-break:break-word; cursor:text; user-select:text; }',
    '.ca-result.has-tools { margin-top:10px; padding-top:10px; border-top:1px solid var(--cp-accent); border-top-style:dashed; }',
    '.ca-result p { margin:0 0 8px; } .ca-result p:last-child { margin-bottom:0; }',
    '.ca-result h1,.ca-result h2,.ca-result h3,.ca-result h4 { margin:16px 0 8px; font-weight:600; color:var(--cp-heading); }',
    '.ca-result h1 { font-size:1.3em; } .ca-result h2 { font-size:1.15em; } .ca-result h3 { font-size:1.05em; }',
    '.ca-result code { background:var(--cp-code-bg); padding:2px 6px; border-radius:3px; font-size:12px; color:var(--cp-code-color); font-family:\"Menlo\",\"Consolas\",\"Courier New\",monospace; }',
    '.ca-result pre { background:var(--cp-pre-bg); border:1px solid var(--cp-border3); border-radius:6px; padding:12px; margin:8px 0; overflow-x:auto; font-size:12px; line-height:1.5; }',
    '.ca-result pre code { background:none; padding:0; border-radius:0; font-size:12px; color:var(--cp-pre-code); }',
    '.ca-result ul,.ca-result ol { margin:6px 0; padding-left:24px; } .ca-result li { margin:4px 0; }',
    '.ca-result strong { color:var(--cp-strong); font-weight:600; }',
    '.ca-result em { color:var(--cp-text); }',
    '.ca-result blockquote { border-left:3px solid var(--cp-accent); margin:8px 0; padding:4px 16px; color:var(--cp-blockquote-color); background:var(--cp-blockquote-bg); }',
    '.ca-result table { border-collapse:collapse; margin:8px 0; font-size:12px; width:100%; }',
    '.ca-result th { text-align:left; padding:6px 10px; border:1px solid var(--cp-border3); background:var(--cp-bg3); color:var(--cp-text2); font-weight:600; }',
    '.ca-result td { padding:6px 10px; border:1px solid var(--cp-border3); color:var(--cp-text); }',
    '.ca-result a { color:var(--cp-link); text-decoration:none; } .ca-result a:hover { text-decoration:underline; }',
    '.ca-result hr { border:none; border-top:1px solid var(--cp-border3); margin:16px 0; }',

    // Thinking block
    '.ca-thinking { padding:8px 12px; border-radius:4px; background:var(--cp-think-bg); border:1px solid var(--cp-think-border); font-size:12px; line-height:1.5; color:var(--cp-think-color); max-height:200px; overflow-y:auto; white-space:pre-wrap; word-break:break-word; cursor:text; user-select:text; transition:max-height .3s, padding .2s; }',
    '.ca-thinking-label { font-size:11px; color:var(--cp-text-dim); cursor:pointer; user-select:none; display:flex; align-items:center; gap:4px; margin-bottom:4px; }',
    '.ca-thinking-label:hover { color:var(--cp-text2); }',
    '.ca-thinking.collapsed { max-height:0; overflow:hidden; padding:0 12px; border-color:transparent; }',

    // Tool calls
    '.ca-tool-call { padding:8px 10px; border-radius:6px; background:var(--cp-tool-bg); border:1px solid var(--cp-border3); font-size:11px; line-height:1.4; color:var(--cp-text-dim); margin:6px 0; transition:border-color .2s; }',
    '.ca-tool-call-label { font-size:12px; color:var(--cp-tool-label); cursor:pointer; user-select:none; margin-bottom:2px; display:flex; align-items:center; gap:4px; padding:4px 0; }',
    '.ca-tool-call-label:hover { color:var(--cp-tool-label-hover); }',
    '.ca-tool-call-body { max-height:0; overflow:hidden; transition:max-height .3s ease; }',
    '.ca-tool-call-body.open { max-height:400px; overflow-y:auto; }',
    '.ca-tool-call-section { color:var(--cp-text-dim); margin-top:6px; padding-top:6px; border-top:1px solid var(--cp-tool-section-border); }',
    '.ca-tool-call-section:first-child { border-top:none; margin-top:2px; padding-top:0; }',
    '.ca-tool-call-section b { color:var(--cp-tool-section-b); font-size:11px; }',
    '.ca-tool-call-section pre { background:var(--cp-tool-pre-bg); border:1px solid var(--cp-tool-pre-border); border-radius:4px; padding:6px 8px; }',

    // Typing indicator
    '.ca-typing { display:inline-flex; gap:4px; padding:12px 16px; }',
    '.ca-typing span { width:6px; height:6px; border-radius:50%; background:var(--cp-typing-dot); opacity:0.4; animation:ca-bounce 1.2s infinite; }',
    '.ca-typing span:nth-child(2) { animation-delay:0.15s; } .ca-typing span:nth-child(3) { animation-delay:0.3s; }',
    '@keyframes ca-bounce { 0%,60%,100%{transform:translateY(0);opacity:.4} 30%{transform:translateY(-4px);opacity:1} }',

    // Welcome / empty state
    '.cursor-empty-wrap { flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:20px; }',
    '.cursor-empty { text-align:center; color:var(--cp-text-dim); font-size:13px; line-height:1.6; }',
    '.cursor-empty .ce-icon { font-size:28px; margin-bottom:12px; opacity:0.5; }',
    '.cursor-empty .ce-title { font-size:14px; color:var(--cp-text2); font-weight:500; margin-bottom:4px; }',
    '.cursor-empty .ce-sub { font-size:12px; color:var(--cp-text-dim3); }',

    // Top bar
    '.cursor-topbar { display:flex; align-items:center; padding:0; border-bottom:1px solid var(--cp-border); background:var(--cp-bg); flex-shrink:0; cursor:grab; }',
    '.cursor-topbar:active { cursor:grabbing; }',
    '.cursor-mode-tabs { display:flex; flex:1; }',
    '.cursor-mode-tab { padding:8px 14px; font-size:11px; color:var(--cp-text-dim); cursor:pointer; border-bottom:2px solid transparent; transition:all .12s; user-select:none; text-transform:capitalize; }',
    '.cursor-mode-tab:hover { color:var(--cp-text2); }',
    '.cursor-mode-tab.active { color:var(--cp-text); border-bottom-color:var(--cp-accent); }',
    '.cursor-topbar-actions { display:flex; align-items:center; gap:2px; padding:0 8px; }',
    '.cursor-topbar-btn { width:28px; height:28px; display:flex; align-items:center; justify-content:center; border:none; background:transparent; color:var(--cp-text-dim); cursor:pointer; border-radius:4px; font-size:12px; }',
    '.cursor-topbar-btn:hover { background:var(--cp-bg3); color:var(--cp-text2); }',

    // Model selector badge
    '.cursor-model-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:4px; background:var(--cp-bg3); border:1px solid var(--cp-border2); font-size:10px; color:var(--cp-text-dim); cursor:pointer; transition:all .12s; user-select:none; }',
    '.cursor-model-badge:hover { border-color:var(--cp-accent); color:var(--cp-text2); }',
    '.cursor-model-badge .dot { width:5px; height:5px; border-radius:50%; background:var(--cp-accent); }',

    // Model dropdown overlay
    '.cursor-model-dd { display:none; position:absolute; bottom:100%; left:0; right:0; max-height:300px; overflow-y:auto; background:var(--cp-bg2); border:1px solid var(--cp-border2); border-radius:6px; box-shadow:0 -4px 20px var(--cp-dd-shadow); z-index:20; margin-bottom:4px; }',
    '.cursor-model-dd.show { display:block; }',
    '.cursor-model-dd-group { padding:4px 0; }',
    '.cursor-model-dd-label { padding:4px 12px; font-size:10px; font-weight:600; color:var(--cp-text-dim); text-transform:uppercase; letter-spacing:0.5px; }',
    '.cursor-model-dd-item { padding:6px 12px; font-size:12px; color:var(--cp-text2); cursor:pointer; display:flex; align-items:center; justify-content:space-between; }',
    '.cursor-model-dd-item:hover { background:var(--cp-bg3); }',
    '.cursor-model-dd-item.active { color:var(--cp-accent); }',
    '.cursor-model-dd-item.active::after { content:\"✓\"; font-size:11px; color:var(--cp-accent); }',

    // Input area
    '.cursor-input-area { padding:0; border-top:1px solid var(--cp-border); background:var(--cp-bg); flex-shrink:0; }',
    '.cursor-input-meta { display:flex; align-items:center; gap:6px; padding:6px 12px 0; position:relative; }',
    '.cursor-input-wrap { display:flex; align-items:flex-end; padding:8px 12px; gap:8px; }',
    '.cursor-input { flex:1; background:transparent; border:1px solid var(--cp-border2); border-radius:6px; padding:8px 10px; color:var(--cp-text); font-size:13px; font-family:inherit; resize:none; outline:none; min-height:36px; max-height:120px; transition:border-color .15s; }',
    '.cursor-input:focus { border-color:var(--cp-accent); }',
    '.cursor-input::placeholder { color:var(--cp-text-dim2); }',
    '.cursor-sendbtn { width:30px; height:30px; border-radius:6px; border:none; background:var(--cp-sendbtn-bg); color:var(--cp-sendbtn-color); cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .15s; }',
    '.cursor-sendbtn:hover { background:var(--cp-sendbtn-hover); }',
    '.cursor-stopbtn { width:30px; height:30px; border-radius:6px; border:none; background:var(--cp-stopbtn-bg); color:var(--cp-stopbtn-color); cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .15s; }',
    '.cursor-stopbtn:hover { background:var(--cp-stopbtn-hover); }',

    // Image upload button
    '.cursor-imgbtn { width:30px; height:30px; border-radius:6px; border:none; background:transparent; color:var(--cp-text-dim); cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all .15s; }',
    '.cursor-imgbtn:hover { background:var(--cp-bg3); color:var(--cp-accent); }',

    // Image preview area (pending images above textarea)
    '.cursor-img-preview { display:none; padding:6px 12px 2px; gap:6px; flex-wrap:wrap; align-items:center; }',
    '.cursor-img-preview.show { display:flex; }',
    '.cursor-img-preview-item { position:relative; width:60px; height:60px; border-radius:6px; overflow:hidden; border:1px solid var(--cp-border2); flex-shrink:0; }',
    '.cursor-img-preview-item img { width:100%; height:100%; object-fit:cover; display:block; }',
    '.cursor-img-preview-item .rm { position:absolute; top:1px; right:1px; width:16px; height:16px; border-radius:50%; background:rgba(0,0,0,0.6); color:#fff; font-size:10px; line-height:16px; text-align:center; cursor:pointer; opacity:0; transition:opacity .15s; }',
    '.cursor-img-preview-item:hover .rm { opacity:1; }',

    // Drag-over highlight on input area
    '.cursor-input-area.dragover { outline:2px dashed var(--cp-accent); outline-offset:-2px; background:var(--cp-accent-bg); }',

    // Images in user messages
    '.cursor-msg-images { display:flex; gap:4px; flex-wrap:wrap; margin-top:6px; }',
    '.cursor-msg-images img { max-width:120px; max-height:120px; border-radius:6px; border:1px solid var(--cp-border2); object-fit:cover; cursor:pointer; transition:transform .15s; }',
    '.cursor-msg-images img:hover { transform:scale(1.05); }',

    // Context bar (above input area)
    '.cursor-ctx { display:none; margin:0 12px 4px; padding:6px 10px; font-size:11px; background:var(--cp-bg3); color:var(--cp-text-dim); border-radius:6px; border:1px solid var(--cp-border); align-items:center; gap:6px; flex-shrink:0; line-height:1.4; max-height:60px; overflow:hidden; }',
    '.cursor-ctx.show { display:flex; }',
    '.cursor-ctx-icon { flex-shrink:0; color:var(--cp-accent); opacity:.7; }',
    '.cursor-ctx-label { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
    '.cursor-ctx .rm { flex-shrink:0; cursor:pointer; opacity:.4; font-size:14px; line-height:1; padding:0 2px; } .cursor-ctx .rm:hover { opacity:1; }',

    // Status bar
    '.cursor-status-bar { display:flex; align-items:center; gap:6px; padding:4px 12px; font-size:10px; color:var(--cp-text-dim2); border-top:1px solid var(--cp-border); flex-shrink:0; }',
    '.cursor-status-dot { width:5px; height:5px; border-radius:50%; flex-shrink:0; }',
    '.cursor-status-dot.on { background:var(--cp-ok); }',
    '.cursor-status-dot.off { background:var(--cp-error); }',
    '.cursor-status-dot.none { background:var(--cp-text-dim2); }',
    '.cursor-status-text { }',
    '.cursor-status-reconnect { display:none; padding:1px 8px; border-radius:3px; border:1px solid var(--cp-border2); background:var(--cp-bg3); color:var(--cp-accent); font-size:9px; cursor:pointer; transition:background .12s; white-space:nowrap; font-family:inherit; }',
    '.cursor-status-reconnect:hover { background:var(--cp-bg2); border-color:var(--cp-accent); }',
    '.cursor-status-reconnect.show { display:inline-block; }',
    '.cursor-status-model { flex:1; text-align:right; color:var(--cp-text-dim2); }',
    '.cursor-usage-badge { font-size:9px; color:var(--cp-text-dim2); display:flex; align-items:center; gap:2px; cursor:default; white-space:nowrap; }',
    '.cursor-turn-usage { font-size:10px; color:var(--cp-text-dim2); padding:4px 0 0; opacity:0.7; text-align:right; }',

    // Settings dropdown
    '.cursor-settings-wrap { position:relative; }',
    '.cursor-settings-dd { display:none; position:absolute; bottom:100%; right:0; min-width:160px; background:var(--cp-bg2); border:1px solid var(--cp-border2); border-radius:6px; box-shadow:0 4px 16px var(--cp-dd-shadow); z-index:20; padding:4px 0; margin-bottom:4px; }',
    '.cursor-settings-dd.show { display:block; }',
    '.cursor-settings-dd-item { display:flex; align-items:center; gap:8px; padding:6px 12px; font-size:11px; color:var(--cp-text2); cursor:pointer; transition:background .1s; white-space:nowrap; }',
    '.cursor-settings-dd-item:hover { background:var(--cp-bg3); }',
    '.cursor-settings-dd-item .dd-icon { width:16px; text-align:center; font-size:12px; opacity:.7; }',
    '.cursor-settings-dd-sep { height:1px; background:var(--cp-border2); margin:4px 0; }',

    // Logs overlay
    '.cursor-logs { position:absolute; top:0; left:0; right:0; bottom:0; background:var(--cp-bg); z-index:10; display:none; flex-direction:column; }',
    '.cursor-logs.show { display:flex; }',
    '.cursor-logs-hd { display:flex; align-items:center; padding:8px 12px; border-bottom:1px solid var(--cp-border); gap:8px; }',
    '.cursor-logs-back { border:none; background:none; color:var(--cp-text-dim); font-size:14px; cursor:pointer; padding:4px 8px; border-radius:4px; }',
    '.cursor-logs-back:hover { background:var(--cp-bg3); color:var(--cp-text2); }',
    '.cursor-logs-title { font-size:12px; font-weight:600; flex:1; color:var(--cp-text2); }',
    '.cursor-logs-body { flex:1; overflow-y:auto; padding:8px; font-family:"Menlo","Consolas","Courier New",monospace; font-size:10px; line-height:1.6; color:var(--cp-log-color); white-space:pre-wrap; word-break:break-all; }',

    // Diagnostics overlay
    '.cursor-diag { position:absolute; top:0; left:0; right:0; bottom:0; background:var(--cp-bg); z-index:10; display:none; flex-direction:column; }',
    '.cursor-diag.show { display:flex; }',
    '.cursor-diag-hd { display:flex; align-items:center; padding:8px 12px; border-bottom:1px solid var(--cp-border); gap:8px; }',
    '.cursor-diag-back { border:none; background:none; color:var(--cp-text-dim); font-size:14px; cursor:pointer; padding:4px 8px; border-radius:4px; }',
    '.cursor-diag-back:hover { background:var(--cp-bg3); color:var(--cp-text2); }',
    '.cursor-diag-title { font-size:12px; font-weight:600; flex:1; color:var(--cp-text2); }',
    '.cursor-diag-body { flex:1; overflow-y:auto; padding:12px; }',
    '.cursor-diag-row { display:flex; padding:4px 0; font-size:11px; border-bottom:1px solid var(--cp-diag-border); }',
    '.cursor-diag-key { width:110px; color:var(--cp-text-dim); flex-shrink:0; }',
    '.cursor-diag-val { color:var(--cp-text2); flex:1; word-break:break-all; }',
    '.cursor-diag-val.ok { color:var(--cp-ok); }',
    '.cursor-diag-val.err { color:var(--cp-error); }',

    // Stop reason
    '.cursor-stop-reason { padding:6px 16px; font-size:11px; display:flex; align-items:center; gap:6px; color:var(--cp-text-dim); border-bottom:1px solid var(--cp-border); }',
    '.cursor-stop-reason.cancelled { color:var(--cp-warn); }',
    '.cursor-stop-reason.error { color:var(--cp-error); }',

    // History overlay
    '.cursor-hist { position:absolute; top:0; left:0; right:0; bottom:0; background:var(--cp-bg); z-index:10; display:none; flex-direction:column; }',
    '.cursor-hist.show { display:flex; }',
    '.cursor-hist-hd { display:flex; align-items:center; padding:8px 12px; border-bottom:1px solid var(--cp-border); gap:8px; }',
    '.cursor-hist-back { border:none; background:none; color:var(--cp-text-dim); font-size:14px; cursor:pointer; padding:4px 8px; border-radius:4px; }',
    '.cursor-hist-back:hover { background:var(--cp-bg3); color:var(--cp-text2); }',
    '.cursor-hist-title { font-size:12px; font-weight:600; flex:1; color:var(--cp-text2); }',
    '.cursor-hist-list { flex:1; overflow-y:auto; padding:4px; }',
    '.cursor-hist-item { padding:8px 12px; margin:2px 0; border-radius:4px; cursor:pointer; transition:background .1s; }',
    '.cursor-hist-item:hover { background:var(--cp-bg3); }',
    '.cursor-hist-item.active { background:var(--cp-accent-bg2); }',
    '.cursor-hist-summary { font-size:12px; color:var(--cp-text2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }',
    '.cursor-hist-meta { display:flex; align-items:center; justify-content:space-between; margin-top:2px; font-size:10px; color:var(--cp-text-dim2); }',
    '.cursor-hist-del { opacity:0; padding:2px 6px; border-radius:3px; border:none; background:transparent; color:var(--cp-error); font-size:10px; cursor:pointer; }',
    '.cursor-hist-item:hover .cursor-hist-del { opacity:1; }',
    '.cursor-hist-del:hover { background:rgba(221,68,68,0.15); }',
    '.cursor-hist-empty { text-align:center; padding:40px 20px; color:var(--cp-text-dim2); font-size:12px; }',

    // Workspace bar
    '.cursor-ws-bar { display:flex; align-items:center; padding:4px 12px; border-bottom:1px solid var(--cp-border); font-size:10px; color:var(--cp-text-dim); gap:4px; flex-shrink:0; cursor:pointer; transition:background .12s; }',
    '.cursor-ws-bar:hover { background:var(--cp-bg2); }',
    '.cursor-ws-icon { opacity:.6; }',
    '.cursor-ws-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--cp-text2); }',
    '.cursor-ws-arrow { opacity:.4; font-size:8px; }',

    // Workspace picker overlay
    '.cursor-ws-picker { position:absolute; top:0; left:0; right:0; bottom:0; background:var(--cp-bg); z-index:12; display:none; flex-direction:column; }',
    '.cursor-ws-picker.show { display:flex; }',
    '.cursor-ws-picker-hd { display:flex; align-items:center; padding:8px 12px; border-bottom:1px solid var(--cp-border); gap:8px; }',
    '.cursor-ws-picker-back { border:none; background:none; color:var(--cp-text-dim); font-size:14px; cursor:pointer; padding:4px 8px; border-radius:4px; }',
    '.cursor-ws-picker-back:hover { background:var(--cp-bg3); color:var(--cp-text2); }',
    '.cursor-ws-picker-title { font-size:12px; font-weight:600; flex:1; color:var(--cp-text2); }',
    '.cursor-ws-picker-search { display:flex; margin:8px 12px; gap:6px; }',
    '.cursor-ws-picker-input { flex:1; background:var(--cp-bg2); border:1px solid var(--cp-border2); border-radius:4px; padding:6px 10px; color:var(--cp-text); font-size:12px; outline:none; font-family:inherit; min-width:0; }',
    '.cursor-ws-picker-input:focus { border-color:var(--cp-accent); }',
    '.cursor-ws-picker-browse { padding:5px 10px; background:var(--cp-bg3); border:1px solid var(--cp-border2); border-radius:4px; color:var(--cp-text2); font-size:11px; cursor:pointer; white-space:nowrap; transition:background .12s; }',
    '.cursor-ws-picker-browse:hover { background:var(--cp-bg2); border-color:var(--cp-accent); }',
    '.cursor-ws-picker-list { flex:1; overflow-y:auto; padding:4px; }',
    '.cursor-ws-picker-item { padding:8px 12px; margin:2px 0; border-radius:4px; cursor:pointer; font-size:12px; color:var(--cp-text2); transition:background .1s; display:flex; align-items:center; gap:8px; }',
    '.cursor-ws-picker-item:hover { background:var(--cp-bg3); }',
    '.cursor-ws-picker-item.active { background:var(--cp-accent-bg2); color:var(--cp-accent); }',
    '.cursor-ws-picker-item .ws-icon { font-size:14px; opacity:.6; }',
    '.cursor-ws-picker-item .ws-info { flex:1; overflow:hidden; }',
    '.cursor-ws-picker-item .ws-name { font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }',
    '.cursor-ws-picker-item .ws-path { font-size:10px; color:var(--cp-text-dim2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }',
    '.cursor-ws-picker-section { font-size:10px; font-weight:600; color:var(--cp-text-dim2); padding:8px 12px 4px; text-transform:uppercase; letter-spacing:.5px; border-bottom:1px solid var(--cp-border); margin-bottom:2px; }',

    // Cursor icon injected into SeaTalk native quick-operation-menu
    '.quick-operation-icon.cursor-qo-icon { color:var(--cp-qo-icon, #a78bfa); transition:color .12s; }',
    '.quick-operation-icon.cursor-qo-icon:hover { color:var(--cp-qo-icon-hover, #8b5cf6); }',

    // Text selection floating button
    '.cursor-sel-fab { position:fixed; z-index:2147483647; display:none; padding:5px 14px 5px 10px; border-radius:8px; background:var(--cp-sel-fab-bg, rgba(167,139,250,0.92)); color:#fff; border:none; cursor:pointer; font-size:12px; font-weight:500; box-shadow:0 2px 12px rgba(0,0,0,0.25); transition:transform .12s,background .12s,opacity .15s; opacity:0; pointer-events:none; white-space:nowrap; font-family:inherit; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); letter-spacing:0.3px; gap:5px; align-items:center; }',
    '.cursor-sel-fab.visible { display:inline-flex; opacity:1; pointer-events:auto; }',
    '.cursor-sel-fab:hover { background:var(--cp-sel-fab-hover, rgba(139,92,246,0.95)); transform:translateY(-1px); box-shadow:0 4px 16px rgba(0,0,0,0.3); }',
    '.cursor-sel-fab:active { transform:translateY(0); }',
    '.cursor-sel-fab svg { flex-shrink:0; }',

    // Light theme docked border override
    '#cursor-panel.theme-light.docked { border-left:1px solid var(--cp-border) !important; }',

    // Version badge in status bar
    '.cursor-ver-badge { display:inline-flex; align-items:center; gap:3px; padding:1px 6px; border-radius:3px; font-size:9px; cursor:pointer; transition:all .12s; white-space:nowrap; color:var(--cp-text-dim2); }',
    '.cursor-ver-badge:hover { color:var(--cp-text2); }',
    '.cursor-ver-badge.has-update { color:var(--cp-warn); font-weight:600; }',
    '.cursor-ver-badge.has-update:hover { color:#e0a030; }',
    '.cursor-ver-badge .ver-dot { display:none; width:6px; height:6px; border-radius:50%; background:var(--cp-warn); flex-shrink:0; animation:ca-pulse 2s infinite; }',
    '.cursor-ver-badge.has-update .ver-dot { display:inline-block; }',
    '@keyframes ca-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }',

    // Update overlay
    '.cursor-update { position:absolute; top:0; left:0; right:0; bottom:0; background:var(--cp-bg); z-index:15; display:none; flex-direction:column; }',
    '.cursor-update.show { display:flex; }',
    '.cursor-update-hd { display:flex; align-items:center; padding:8px 12px; border-bottom:1px solid var(--cp-border); gap:8px; }',
    '.cursor-update-back { border:none; background:none; color:var(--cp-text-dim); font-size:14px; cursor:pointer; padding:4px 8px; border-radius:4px; }',
    '.cursor-update-back:hover { background:var(--cp-bg3); color:var(--cp-text2); }',
    '.cursor-update-title { font-size:12px; font-weight:600; flex:1; color:var(--cp-text2); }',
    '.cursor-update-body { flex:1; overflow-y:auto; padding:16px; }',
    '.cursor-update-info { font-size:12px; color:var(--cp-text2); line-height:1.6; }',
    '.cursor-update-info .ver-current { color:var(--cp-text-dim); }',
    '.cursor-update-info .ver-new { color:var(--cp-ok); font-weight:600; }',
    '.cursor-update-info .ver-behind { color:var(--cp-warn); }',
    '.cursor-update-changelog { margin-top:12px; padding:8px 10px; background:var(--cp-pre-bg); border:1px solid var(--cp-border3); border-radius:6px; font-size:11px; font-family:"Menlo","Consolas","Courier New",monospace; line-height:1.6; color:var(--cp-text-dim); max-height:200px; overflow-y:auto; white-space:pre-wrap; }',
    '.cursor-update-actions { display:flex; gap:8px; margin-top:16px; }',
    '.cursor-update-btn { padding:6px 16px; border-radius:6px; border:none; font-size:12px; cursor:pointer; font-family:inherit; transition:all .15s; }',
    '.cursor-update-btn.primary { background:var(--cp-accent); color:#fff; } .cursor-update-btn.primary:hover { background:var(--cp-accent-hover); }',
    '.cursor-update-btn.secondary { background:var(--cp-bg3); color:var(--cp-text2); border:1px solid var(--cp-border2); } .cursor-update-btn.secondary:hover { border-color:var(--cp-accent); }',
    '.cursor-update-btn:disabled { opacity:0.5; cursor:not-allowed; }',
    '.cursor-update-progress { margin-top:12px; padding:8px 10px; background:var(--cp-bg3); border-radius:6px; font-size:11px; color:var(--cp-text2); line-height:1.8; white-space:pre-wrap; }',
    '.cursor-update-noup { text-align:center; padding:40px 20px; color:var(--cp-text-dim2); font-size:12px; }',
  ].join('\n'));

  // ── Model grouping ──
  var MODEL_GROUPS = [
    { prefix: 'auto', label: 'General' },
    { prefix: 'composer', label: 'Composer' },
    { prefix: 'claude', label: 'Claude' },
    { prefix: 'gpt-5.4', label: 'GPT-5.4' },
    { prefix: 'gpt-5.3', label: 'GPT-5.3' },
    { prefix: 'gpt-5.2', label: 'GPT-5.2' },
    { prefix: 'gpt-5.1', label: 'GPT-5.1' },
    { prefix: 'gpt-5', label: 'GPT-5' },
    { prefix: 'gemini', label: 'Gemini' },
    { prefix: 'grok', label: 'Grok' },
    { prefix: 'kimi', label: 'Kimi' },
  ];

  function groupModels(models) {
    var groups = {}, order = [];
    for (var g = 0; g < MODEL_GROUPS.length; g++) { groups[MODEL_GROUPS[g].label] = []; order.push(MODEL_GROUPS[g].label); }
    groups['Other'] = [];
    for (var i = 0; i < models.length; i++) {
      var m = models[i], placed = false;
      for (var g = 0; g < MODEL_GROUPS.length; g++) {
        if (m.modelId.indexOf(MODEL_GROUPS[g].prefix) === 0) { groups[MODEL_GROUPS[g].label].push(m); placed = true; break; }
      }
      if (!placed) groups['Other'].push(m);
    }
    order.push('Other');
    return { groups: groups, order: order };
  }

  // ── Render ──
  function renderAllMessages(container) {
    container.innerHTML = '';
    if (messages.length === 0) {
      container.innerHTML = '<div class="cursor-empty-wrap"><div class="cursor-empty">' +
        '<div class="ce-icon">✦</div>' +
        '<div class="ce-title">Cursor Agent</div>' +
        '<div class="ce-sub">在下方输入问题开始对话</div>' +
        '</div></div>';
      return;
    }
    messages.forEach(function (m) {
      if (m.role === 'user') {
        var el = document.createElement('div');
        el.className = 'cursor-msg-user';
        var html = '<div class="cursor-msg-user-label">You</div>' + escapeHtml(m.text);
        if (m.images && m.images.length > 0) {
          html += '<div class="cursor-msg-images">';
          m.images.forEach(function (img) {
            var src = img.preview || ('data:' + img.mimeType + ';base64,' + img.data);
            html += '<img src="' + src + '" title="' + escapeHtml(img.name || 'image') + '">';
          });
          html += '</div>';
        }
        el.innerHTML = html;
        container.appendChild(el);
      } else {
        var turnContainer = document.createElement('div');
        turnContainer.className = 'cursor-agent-turn';
        if (m.thinking) {
          var view = sr.createView({ container: turnContainer, prefix: 'ca' });
          view.processChunk({ type: 'thinking_done', thinking: m.thinking });
          if (m.text) view.processChunk({ type: 'text', text: m.text });
          view.finalize();
        } else if (m.text) {
          var resultDiv = document.createElement('div');
          resultDiv.className = 'ca-result';
          resultDiv.innerHTML = sr.renderMarkdown(m.text);
          turnContainer.appendChild(resultDiv);
        }
        if (m.toolSummary && m.toolSummary.length > 0) {
          var toolDiv = document.createElement('div');
          toolDiv.className = 'ca-tool-call';
          toolDiv.style.cssText = 'font-size:11px;color:var(--cp-text-dim);padding:6px 8px;margin-bottom:4px;';
          toolDiv.innerHTML = '<div style="font-size:10px;color:var(--cp-text-dim2);margin-bottom:2px">执行了 ' + m.toolSummary.length + ' 个工具:</div>' + m.toolSummary.map(function(s){ return '<div>' + escapeHtml(s) + '</div>'; }).join('');
          if (m.text || m.thinking) turnContainer.insertBefore(toolDiv, turnContainer.querySelector('.ca-result'));
          else turnContainer.appendChild(toolDiv);
        }
        container.appendChild(turnContainer);
      }
    });
    container.scrollTop = container.scrollHeight;
  }

  function setProcessingState(v) {
    isProcessing = v;
    if (sendBtn) sendBtn.style.display = v ? 'none' : '';
    if (stopBtn) stopBtn.style.display = v ? '' : 'none';
  }

  // ── Turn management ──
  function startTurn() {
    if (turnView) return;
    if (!messagesEl) showPanel();
    if (!messagesEl) return;
    var welcome = messagesEl.querySelector('.cursor-empty-wrap');
    if (welcome) welcome.remove();
    var typing = messagesEl.querySelector('.ca-typing');
    if (typing) typing.remove();
    turnEl = document.createElement('div');
    turnEl.className = 'cursor-agent-turn';
    messagesEl.appendChild(turnEl);
    turnView = sr.createView({ container: turnEl, prefix: 'ca' });
    turnView.reset();
    turnFullText = '';
    turnFullThinking = '';
    turnToolCalls = {};
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function endTurn(stopReason) {
    if (!turnView && !isProcessing) return; // already ended, ignore duplicate
    if (turnView) turnView.finalize();
    var finalText = turnFullText ? turnFullText.replace(/^\n+/, '') : '';
    // Build tool call summary for history
    var toolSummaries = [];
    for (var tcKey in turnToolCalls) {
      var tc = turnToolCalls[tcKey];
      var tcName = tc.name || 'Tool';
      var tcStatus = tc.status === 'completed' ? '✅' : tc.status === 'error' ? '❌' : '⏳';
      toolSummaries.push(tcStatus + ' ' + tcName);
    }
    var savedMsg = { role: 'assistant', text: finalText, thinking: turnFullThinking || undefined };
    if (toolSummaries.length > 0) savedMsg.toolSummary = toolSummaries;
    if (finalText || turnFullThinking || toolSummaries.length > 0) {
      messages.push(savedMsg);
    }
    if (stopReason && stopReason !== 'end_turn' && messagesEl) {
      var cls = stopReason === 'cancelled' ? 'cancelled' : 'error';
      var icon = stopReason === 'cancelled' ? '⏹' : '⚠';
      var labels = { cancelled: '已取消', max_tokens: '达到 Token 上限', error: '错误' };
      var el = document.createElement('div');
      el.className = 'cursor-stop-reason ' + cls;
      el.textContent = icon + ' ' + (labels[stopReason] || stopReason);
      messagesEl.appendChild(el);
    }
    // Visually separate final result from tool calls, and scroll to it
    if (turnEl && messagesEl) {
      var finalResult = turnEl.querySelector('.ca-result');
      var hasToolCalls = turnEl.querySelector('[id^="ca-tc-"]');
      if (finalResult && finalResult.textContent.trim() && hasToolCalls) {
        finalResult.classList.add('has-tools');
        setTimeout(function () { finalResult.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
      } else {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }
    turnView = null; turnEl = null;
    setProcessingState(false);
    saveCurrentConv();
  }

  // ── Image helpers ──
  function addPendingImage(file) {
    if (pendingImages.length >= MAX_IMAGES) return;
    if (ACCEPTED_TYPES.indexOf(file.type) < 0) return;
    if (file.size > MAX_IMAGE_BYTES) { console.warn('[cursor-acp] image too large:', file.size); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = reader.result;
      var base64 = dataUrl.split(',')[1];
      pendingImages.push({ data: base64, mimeType: file.type, name: file.name || 'image', preview: dataUrl });
      renderImagePreview();
    };
    reader.readAsDataURL(file);
  }
  function removePendingImage(idx) {
    pendingImages.splice(idx, 1);
    renderImagePreview();
  }
  function clearPendingImages() {
    pendingImages = [];
    renderImagePreview();
  }
  function renderImagePreview() {
    if (!imgPreviewEl) return;
    imgPreviewEl.innerHTML = '';
    if (pendingImages.length === 0) { imgPreviewEl.classList.remove('show'); return; }
    imgPreviewEl.classList.add('show');
    pendingImages.forEach(function (img, i) {
      var item = document.createElement('div');
      item.className = 'cursor-img-preview-item';
      item.innerHTML = '<img src="' + img.preview + '"><span class="rm">✕</span>';
      item.querySelector('.rm').addEventListener('click', function () { removePendingImage(i); });
      imgPreviewEl.appendChild(item);
    });
  }

  // ── Send ──
  function doSend() {
    if (!inputEl) return;
    var text = inputEl.value.trim();
    var hasImages = pendingImages.length > 0;
    if ((!text && !hasImages) || isProcessing) return;
    inputEl.value = ''; inputEl.style.height = '36px';
    var msgImages = hasImages ? pendingImages.slice() : undefined;
    clearPendingImages();
    messages.push({ role: 'user', text: text || (msgImages ? '[图片]' : ''), images: msgImages });
    renderAllMessages(messagesEl);
    var typing = document.createElement('div');
    typing.className = 'ca-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    var payload = { type: 'user_message', text: text || '' };
    if (msgImages) {
      payload.images = msgImages.map(function (img) { return { data: img.data, mimeType: img.mimeType }; });
    }
    if (contextData) { payload.context = contextData; contextData = null; if (ctxBar) ctxBar.classList.remove('show'); }
    // Attach conversation history for context recovery after restart
    if (messages.length > 1) {
      var hist = [];
      for (var hi = Math.max(0, messages.length - 20); hi < messages.length - 1; hi++) {
        var hm = messages[hi];
        var t = hm.text || '';
        if (t.length > 500) t = t.substring(0, 500) + '...';
        hist.push({ role: hm.role, text: t });
      }
      payload.history = hist;
    }
    if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify(payload));
  }

  // ── Ask Cursor: message hover & text selection ──
  var SEL_MSG_ITEM = '.messages-message-list-item';
  var SEL_MSG_BUBBLE = '.messages-message-list-item-bubble';
  var SEL_THREAD_ITEM = '.thread-message-list-item';
  var SEL_THREAD_BUBBLE = '.thread-message-content-container';
  var SEL_QO_MENU = '.quick-operation-menu, .thread-quick-operation-menu';

  function extractMsgFromBubble(bubble) {
    if (!bubble) return null;
    var row = bubble.closest(SEL_MSG_ITEM) || bubble.closest(SEL_THREAD_ITEM);
    if (!row) return null;

    var isThread = row.matches && row.matches(SEL_THREAD_ITEM);
    var textEl = isThread
      ? row.querySelector('.messages-message-list-item-text-content')
      : (row.querySelector('.content') || row.querySelector('.messages-message-list-item-text-content'));
    var text = textEl ? textEl.textContent.trim() : '';

    if (!text) {
      var imgEl = row.querySelector('img.image-content, img.chat-image, img[class*="image"]');
      var videoEl = row.querySelector('video, [class*="video-message"]');
      var fileEl = row.querySelector('[class*="file-message"], [class*="file-content"]');
      var stickerEl = row.querySelector('[class*="sticker"]');
      if (imgEl) {
        var src = imgEl.getAttribute('src') || '';
        var alt = imgEl.getAttribute('alt') || '';
        text = '[图片]';
        if (alt) text = '[图片: ' + alt + ']';
        if (src && src.indexOf('f.haiserve.com') >= 0) text += ' ' + src.split('?')[0];
      } else if (videoEl) {
        text = '[视频]';
      } else if (fileEl) {
        var fnameEl = fileEl.querySelector('[class*="file-name"], .name');
        text = '[文件' + (fnameEl ? ': ' + fnameEl.textContent.trim() : '') + ']';
      } else if (stickerEl) {
        text = '[表情]';
      }
    }
    if (!text) return null;

    var nameEl = isThread ? row.querySelector('.thread-message-header-box .name') : row.querySelector('.name');
    var isSent = bubble.classList.contains('isSentByMe');
    var sender;
    if (nameEl) sender = nameEl.textContent.trim().split('\n')[0];
    else if (isSent) sender = '我';
    else {
      var titleEl = document.querySelector('.messages-message-detail-view-header .title');
      sender = titleEl ? titleEl.textContent.trim().split(' (')[0].split(' | ')[0] : '对方';
    }
    return { sender: sender, text: text };
  }

  function getThreadMessages() {
    var threadList = document.querySelector('.thread-message-list');
    if (!threadList) return [];
    var rows = Array.from(threadList.querySelectorAll(SEL_THREAD_ITEM));
    var result = [];
    for (var i = 0; i < rows.length; i++) {
      var b = rows[i].querySelector(SEL_THREAD_BUBBLE) || rows[i];
      var m = extractMsgFromBubble(b);
      if (m) result.push(m);
    }
    return result;
  }

  function getContextMessages(bubble, count) {
    var row = bubble.closest(SEL_MSG_ITEM) || bubble.closest(SEL_THREAD_ITEM);
    if (!row) return [];
    var isThread = row.matches && row.matches(SEL_THREAD_ITEM);

    // Thread: return entire thread
    if (isThread) return getThreadMessages();

    // Main chat: return ±count surrounding messages
    var containerEl = document.querySelector('.message-list-container-for-drawer');
    if (!containerEl) return [];
    var allRows = Array.from(containerEl.querySelectorAll(SEL_MSG_ITEM));
    var idx = allRows.indexOf(row);
    if (idx < 0) return [];
    var start = Math.max(0, idx - count);
    var end = Math.min(allRows.length - 1, idx + count);
    var result = [];
    for (var i = start; i <= end; i++) {
      var r = allRows[i];
      var b = r.querySelector(SEL_MSG_BUBBLE) || r;
      var m = extractMsgFromBubble(b);
      if (m) result.push(m);
    }
    return result;
  }

  function setContextAndOpen(data) {
    if (!panelHandle) window.__agentToggle(true);
    contextData = data;
    var count = data.messages ? data.messages.length : 1;
    var preview = '';
    if (data.messages && data.messages.length > 0) {
      preview = (data.messages[0].text || '').substring(0, 60);
      if (preview.length >= 60) preview += '…';
    }
    var label = (data.label || '消息') + ' · ' + count + '条';
    if (preview) label += ' — ' + preview;
    if (ctxLabel) ctxLabel.textContent = label;
    if (ctxBar) ctxBar.classList.add('show');
    if (inputEl) inputEl.focus();
  }

  // Inject ✦ icon into SeaTalk native quick-operation-menu
  var CURSOR_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/></svg>';

  function injectCursorIcon(menu) {
    if (menu.querySelector('.cursor-qo-icon')) return;
    var lastIcon = menu.querySelector('.last-icon');
    var icon = document.createElement('span');
    icon.className = 'quick-operation-icon cursor-qo-icon';
    icon.setAttribute('data-menu-key', 'cursor');
    icon.title = 'Ask Cursor';
    icon.innerHTML = CURSOR_ICON_SVG;
    if (lastIcon) {
      menu.insertBefore(icon, lastIcon);
    } else {
      menu.appendChild(icon);
    }
  }

  // Event delegation on document for all ✦ icon clicks (main chat + thread)
  document.addEventListener('click', function (e) {
    var icon = e.target.closest('.cursor-qo-icon');
    if (!icon) return;
    e.stopPropagation();
    e.preventDefault();
    var menu = icon.closest('.quick-operation-menu') || icon.closest('.thread-quick-operation-menu');
    var row = null;
    if (menu) {
      var opContainer = menu.closest('.quick-operation');
      row = opContainer ? opContainer.closest(SEL_MSG_ITEM) || opContainer.closest(SEL_THREAD_ITEM) : null;
      if (!row) row = menu.closest(SEL_MSG_ITEM) || menu.closest(SEL_THREAD_ITEM);
    }
    var bubble = row ? (row.querySelector(SEL_MSG_BUBBLE) || row.querySelector(SEL_THREAD_BUBBLE) || row) : null;
    if (!bubble) { console.warn('[cursor-qo] no bubble found'); return; }
    var isThread = row && row.matches && row.matches(SEL_THREAD_ITEM);
    var msgs = getContextMessages(bubble, 5);
    var clicked = extractMsgFromBubble(bubble);
    var titleEl = document.querySelector('.thread-detail-page-title') || document.querySelector('.messages-message-detail-view-header .title');
    var chatName = titleEl ? titleEl.textContent.trim().split(' (')[0].split(' | ')[0] : 'Chat';
    var suffix = isThread ? ' (整个线程)' : ' (上下文)';
    setContextAndOpen({
      label: chatName + suffix,
      sessionName: chatName,
      messages: msgs,
      focusMessage: clicked,
      isThread: !!isThread
    });
  }, true);

  document.addEventListener('mousedown', function (e) {
    if (e.target.closest('.cursor-qo-icon')) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  // Observe DOM for quick-operation-menu appearing (main chat + thread)
  var qoObserver = new MutationObserver(function () {
    var menus = document.querySelectorAll(SEL_QO_MENU);
    for (var i = 0; i < menus.length; i++) { injectCursorIcon(menus[i]); }
  });
  qoObserver.observe(document.body, { childList: true, subtree: true });
  var existingMenus = document.querySelectorAll(SEL_QO_MENU);
  for (var em = 0; em < existingMenus.length; em++) { injectCursorIcon(existingMenus[em]); }

  // Text selection → floating "Ask Cursor" button (clean up stale ones first)
  var oldFabs = document.querySelectorAll('.cursor-sel-fab');
  for (var fi = 0; fi < oldFabs.length; fi++) oldFabs[fi].remove();
  var selFab = document.createElement('button');
  selFab.className = 'cursor-sel-fab';
  selFab.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>Ask Cursor</span>';
  document.body.appendChild(selFab);
  var selFabTimer = null;

  document.addEventListener('mouseup', function (e) {
    if (selFab.contains(e.target)) return;
    clearTimeout(selFabTimer);
    selFabTimer = setTimeout(function () {
      var sel = window.getSelection();
      var text = sel ? sel.toString().trim() : '';
      if (!text || text.length < 2) { selFab.classList.remove('visible'); return; }
      var msgArea = document.querySelector('.message-list-container-for-drawer');
      var threadArea = document.querySelector('.thread-message-list');
      var anchor = sel.anchorNode;
      if (!anchor) { selFab.classList.remove('visible'); return; }
      var inMsg = msgArea && msgArea.contains(anchor);
      var inThread = threadArea && threadArea.contains(anchor);
      if (!inMsg && !inThread) { selFab.classList.remove('visible'); return; }

      var range = sel.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      selFab.style.top = (rect.bottom + 6) + 'px';
      selFab.style.left = (rect.left + rect.width / 2 - 50) + 'px';
      selFab._selectedText = text;
      selFab._inThread = !!inThread;
      // Find the closest message bubble from the selection anchor for context extraction
      selFab._anchorBubble = null;
      var el = anchor.nodeType === 3 ? anchor.parentElement : anchor;
      if (el) {
        var row = el.closest(SEL_THREAD_ITEM) || el.closest(SEL_MSG_ITEM);
        if (row) selFab._anchorBubble = row.querySelector(SEL_THREAD_BUBBLE) || row.querySelector(SEL_MSG_BUBBLE) || row;
      }
      selFab.classList.add('visible');
    }, 200);
  });

  document.addEventListener('mousedown', function (e) {
    if (selFab.contains(e.target)) return;
    selFab.classList.remove('visible');
  });

  selFab.addEventListener('click', function () {
    var text = selFab._selectedText;
    if (!text) return;
    selFab.classList.remove('visible');
    var titleEl = document.querySelector('.thread-detail-page-title') || document.querySelector('.messages-message-detail-view-header .title');
    var chatName = titleEl ? titleEl.textContent.trim().split(' (')[0].split(' | ')[0] : 'Chat';
    var inThread = selFab._inThread;
    var ctxMsgs = [];

    if (inThread) {
      // Thread: send entire thread as context
      ctxMsgs = getThreadMessages();
    } else if (selFab._anchorBubble) {
      // Main chat: send ±3 surrounding messages as context
      ctxMsgs = getContextMessages(selFab._anchorBubble, 3);
    }

    var allMessages = [];
    if (ctxMsgs.length > 0) {
      allMessages = ctxMsgs;
    }
    var suffix = inThread ? ' (线程选中)' : ' (选中文字)';
    setContextAndOpen({
      label: chatName + suffix,
      sessionName: chatName,
      messages: allMessages,
      focusMessage: { sender: '选中内容', text: text },
      isThread: !!inThread
    });
  });

  // ── History ──
  function renderHistList(listEl) {
    if (conversations.length === 0) { listEl.innerHTML = '<div class="cursor-hist-empty">No previous chats</div>'; return; }
    var h = '';
    for (var i = conversations.length - 1; i >= 0; i--) {
      var c = conversations[i], d = new Date(c.ts);
      var ts = d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      var wsName = c.workspace ? wsDisplayName(c.workspace) : '';
      var wsBadge = wsName ? ' <span style="opacity:0.5;font-size:10px">📁 ' + escapeHtml(wsName) + '</span>' : '';
      h += '<div class="cursor-hist-item' + (i === currentIdx ? ' active' : '') + '" data-i="' + i + '"><div class="cursor-hist-summary">' + escapeHtml(c.summary || '(empty)') + '</div><div class="cursor-hist-meta"><span>' + ts + ' · ' + c.messages.length + wsBadge + '</span><button class="cursor-hist-del" data-d="' + i + '">Delete</button></div></div>';
    }
    listEl.innerHTML = h;
  }

  // ── Receive ──
  window.__agentReceive = function (jsonStr) {
    try {
      var d = JSON.parse(jsonStr);
      if (d.type === 'turn_start') {
        if (turnView) return;
        var typing = messagesEl && messagesEl.querySelector('.ca-typing');
        if (typing) typing.remove();
        startTurn(); setProcessingState(true);
      } else if (d.type === 'text_chunk') {
        if (!turnView) startTurn();
        turnFullText += d.text;
        turnView.processChunk({ type: 'text', text: turnFullText });
        if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      } else if (d.type === 'thought_chunk') {
        if (!turnView) startTurn();
        turnFullThinking += d.text;
        turnView.processChunk({ type: 'thinking', thinking: turnFullThinking });
        if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      } else if (d.type === 'tool_start') {
        if (!turnView) startTurn();
        // Clear intermediate explanation text when a new tool call starts
        if (turnFullText && turnFullText.replace(/\s/g, '').length > 0) {
          turnFullText = '';
          turnView.clearResult();
        } else {
          turnFullText = '';
        }
        var tcId = d.toolCallId || ('tc-' + Date.now());
        var existing = turnToolCalls[tcId];
        if (existing) {
          if (d.title) existing.name = d.title;
          if (d.kind) existing.tool = { action_description: d.kind };
          if (d.input) existing.arguments = d.input;
          existing.status = 'running';
        } else {
          turnToolCalls[tcId] = {
            id: tcId,
            name: d.title || 'Tool',
            tool: { action_description: d.kind || '' },
            arguments: d.input || '',
            status: 'running'
          };
        }
        turnView.processChunk({ type: 'tool_call', toolCall: turnToolCalls[tcId] });
        if (turnEl) { var r = turnEl.querySelector('.ca-result'); if (r) turnEl.appendChild(r); }
        if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      } else if (d.type === 'tool_update') {
        if (!turnView) return;
        var tcId2 = d.toolCallId || '';
        var tc = turnToolCalls[tcId2];
        if (!tc) {
          tc = { id: tcId2, name: d.title || 'Tool', status: d.status || 'running' };
          turnToolCalls[tcId2] = tc;
        }
        if (d.title) tc.name = d.title;
        if (d.status) tc.status = d.status;
        if (d.output) tc.result = d.output;
        turnView.processChunk({ type: 'tool_call', toolCall: tc });
        if (turnEl) { var r2 = turnEl.querySelector('.ca-result'); if (r2) turnEl.appendChild(r2); }
      } else if (d.type === 'turn_usage') {
        if (turnEl) {
          var uEl = document.createElement('div');
          uEl.className = 'cursor-turn-usage';
          var parts = [];
          if (d.inputTokens) parts.push('In: ' + formatTokens(d.inputTokens));
          if (d.outputTokens) parts.push('Out: ' + formatTokens(d.outputTokens));
          if (d.cachedReadTokens) parts.push('Cache: ' + formatTokens(d.cachedReadTokens));
          if (d.thoughtTokens) parts.push('Think: ' + formatTokens(d.thoughtTokens));
          uEl.textContent = parts.join(' · ');
          turnEl.appendChild(uEl);
        }
      } else if (d.type === 'turn_end') {
        if (!turnView && !turnEl) return;
        endTurn(d.stopReason);
      } else if (d.type === 'status') {
        var wasDisconnected = !cachedStatus.connected;
        cachedStatus = { connected: !!d.connected, text: d.text || (d.connected ? 'Connected' : 'Disconnected') };
        if (statusDot) statusDot.className = 'cursor-status-dot ' + (cachedStatus.connected ? 'on' : 'off');
        if (statusText) statusText.textContent = cachedStatus.text;
        var rcBtn = panelHandle && panelHandle.el ? panelHandle.el.querySelector('.cursor-status-reconnect') : null;
        if (rcBtn) {
          if (cachedStatus.connected) { rcBtn.classList.remove('show'); rcBtn.textContent = '重连'; }
          else { rcBtn.classList.add('show'); rcBtn.textContent = '重连'; }
        }
        updateSidebarBtnStatus();
        // After update restart: detect reconnection and auto-close update overlay
        if (wasDisconnected && cachedStatus.connected && updateOverlay && updateOverlay.classList.contains('show')) {
          appendUpdateProgress('✅ Agent 已重新连接！更新成功。');
          if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'update_check' }));
          setTimeout(function () { updateOverlay.classList.remove('show'); }, 3000);
        }
      } else if (d.type === 'logs') {
        showLogsOverlay(d.lines || []);
      } else if (d.type === 'diagnostics') {
        showDiagOverlay(d.info || {});
      } else if (d.type === 'mode') {
        var savedMode = null;
        try { savedMode = localStorage.getItem(MODE_KEY); } catch (_) {}
        currentMode = savedMode || d.mode || 'agent';
        try { localStorage.setItem(MODE_KEY, currentMode); } catch (_) {}
        updateModeTabs();
        if (savedMode && savedMode !== d.mode && typeof window.__agentSend === 'function') {
          window.__agentSend(JSON.stringify({ type: 'set_mode', mode: currentMode }));
        }
      } else if (d.type === 'models') {
        cachedModels = { models: d.models || [], currentModelId: d.currentModelId || '' };
        updateModelBadge();
        if (statusModelEl) updateStatusModel();
      } else if (d.type === 'workspace') {
        if (d.workspaces) cachedWorkspaceList = d.workspaces;
        // Read saved workspace BEFORE overwriting localStorage
        var savedWs = null;
        try { savedWs = localStorage.getItem(WS_KEY); } catch (_) {}
        if (d.isDefault && savedWs && savedWs !== (d.path || '')) {
          cachedWorkspace = savedWs;
          updateWsLabel();
          saveRecentWorkspace(savedWs);
          if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'set_workspace', path: savedWs }));
        } else {
          cachedWorkspace = d.path || '';
          updateWsLabel();
          if (cachedWorkspace) {
            try { localStorage.setItem(WS_KEY, cachedWorkspace); } catch (_) {}
            saveRecentWorkspace(cachedWorkspace);
          }
        }
      } else if (d.type === 'usage') {
        updateUsageBadge(d);
      } else if (d.type === 'folder_selected') {
        var fp = d.path || '';
        if (fp && fp !== cachedWorkspace) {
          cachedWorkspace = fp;
          updateWsLabel();
          saveCurrentConv(); currentIdx = -1; messages = []; turnView = null;
          renderAllMessages(messagesEl);
          if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'set_workspace', path: fp }));
        }
      } else if (d.type === 'update_available') {
        cachedUpdate = { available: !!d.available, local: d.local || '', remote: d.remote || '', behind: d.behind || 0, changelog: d.changelog || '', error: d.error };
        updateVerBadge();
        if (updateOverlay && updateOverlay.classList.contains('show')) renderUpdateOverlay();
      } else if (d.type === 'update_progress') {
        appendUpdateProgress(d.text || '');
      } else if (d.type === 'update_done') {
        if (d.success) {
          try { localStorage.setItem('__cursorUpdateState', JSON.stringify({ status: 'done', ts: Date.now() })); } catch (_) {}
          appendUpdateProgress('✅ 更新完成，Agent 即将重启...');
          setTimeout(function () { appendUpdateProgress('🔄 正在等待 Agent 重新连接...'); }, 2000);
          setTimeout(function () {
            appendUpdateProgress('💡 如果长时间未重连，请运行 seatalk 命令重启 Agent');
            var applyBtn2 = updateOverlay && updateOverlay.querySelector('[data-act="apply"]');
            if (applyBtn2) { applyBtn2.disabled = false; applyBtn2.textContent = '重新检查'; applyBtn2.dataset.act = 'check'; }
          }, 15000);
        } else {
          appendUpdateProgress('❌ 更新失败');
          var applyBtn = updateOverlay && updateOverlay.querySelector('[data-act="apply"]');
          if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = '重试更新'; }
        }
      }
    } catch (err) { console.error('[cursor-acp] __agentReceive error:', err); }
  };

  window.__agentSetStatus = function (connected, text) {
    cachedStatus = { connected: connected, text: text || (connected ? 'Connected' : 'Disconnected') };
    if (statusDot) statusDot.className = 'cursor-status-dot ' + (connected ? 'on' : 'off');
    if (statusText) statusText.textContent = cachedStatus.text;
    updateSidebarBtnStatus();
  };

  function updateSidebarBtnStatus() {
    var btn = document.getElementById('cursor-sidebar-btn');
    if (!btn) return;
    if (cachedStatus.connected) {
      btn.style.opacity = '';
    } else {
      btn.style.opacity = '0.6';
    }
  }

  function showUpdateOverlay() {
    if (!panelHandle || !panelHandle.el) return;
    var existing = panelHandle.el.querySelector('.cursor-update');
    if (existing) {
      existing.classList.add('show');
      renderUpdateOverlay();
      return;
    }
    updateOverlay = document.createElement('div');
    updateOverlay.className = 'cursor-update show';
    updateOverlay.innerHTML =
      '<div class="cursor-update-hd">' +
        '<button class="cursor-update-back">←</button>' +
        '<span class="cursor-update-title">版本更新</span>' +
      '</div>' +
      '<div class="cursor-update-body"></div>';
    updateOverlay.querySelector('.cursor-update-back').addEventListener('click', function () { updateOverlay.classList.remove('show'); });
    updateOverlay.querySelector('.cursor-update-body').addEventListener('click', function (e) {
      var btn = e.target.closest('.cursor-update-btn');
      if (!btn) return;
      var act = btn.dataset.act;
      if (act === 'apply') {
        btn.disabled = true;
        btn.textContent = '更新中...';
        try { localStorage.setItem('__cursorUpdateState', JSON.stringify({ status: 'applying', ts: Date.now() })); } catch (_) {}
        if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'update_apply' }));
      } else if (act === 'check') {
        btn.textContent = '检查中...';
        btn.disabled = true;
        if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'update_check' }));
        setTimeout(function () { btn.disabled = false; btn.textContent = '检查更新'; }, 5000);
      }
    });
    panelHandle.el.appendChild(updateOverlay);
    renderUpdateOverlay();
    // Auto-trigger check if no data yet
    if (!cachedUpdate.local) {
      if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'update_check' }));
    }
  }

  function showLogsOverlay(lines) {
    if (!panelHandle || !panelHandle.el) return;
    var existing = panelHandle.el.querySelector('.cursor-logs');
    if (existing) { existing.classList.add('show'); existing.querySelector('.cursor-logs-body').textContent = lines.join('\n'); return; }
    var ov = document.createElement('div');
    ov.className = 'cursor-logs show';
    ov.innerHTML =
      '<div class="cursor-logs-hd">' +
        '<button class="cursor-logs-back">←</button>' +
        '<span class="cursor-logs-title">后端日志 (最近 ' + lines.length + ' 条)</span>' +
      '</div>' +
      '<div class="cursor-logs-body"></div>';
    ov.querySelector('.cursor-logs-body').textContent = lines.join('\n');
    ov.querySelector('.cursor-logs-back').addEventListener('click', function () { ov.classList.remove('show'); });
    panelHandle.el.appendChild(ov);
    var body = ov.querySelector('.cursor-logs-body');
    body.scrollTop = body.scrollHeight;
  }

  function showDiagOverlay(info) {
    if (!panelHandle || !panelHandle.el) return;
    var existing = panelHandle.el.querySelector('.cursor-diag');
    if (existing) existing.remove();
    var rows = [
      { key: 'CDP 端口', val: info.cdpPort || '?', ok: true },
      { key: 'CDP 连接', val: info.cdpConnected ? '已连接' : '断开', ok: info.cdpConnected },
      { key: 'ACP 连接', val: info.acpConnected ? '已连接' : '断开', ok: info.acpConnected },
      { key: '工作区', val: info.workspace || '—', ok: true },
      { key: 'Session ID', val: info.sessionId || '—', ok: !!info.sessionId },
      { key: '当前模型', val: info.modelId || '—', ok: !!info.modelId },
      { key: '可用模型数', val: '' + (info.modelCount || 0), ok: info.modelCount > 0 },
      { key: '运行时间', val: formatUptime(info.uptime || 0), ok: true },
      { key: '进程 PID', val: '' + (info.pid || '?'), ok: true },
      { key: 'Node 版本', val: info.nodeVersion || '?', ok: true },
    ];
    var rowsHtml = '';
    for (var i = 0; i < rows.length; i++) {
      var cls = rows[i].ok ? 'ok' : 'err';
      rowsHtml += '<div class="cursor-diag-row"><span class="cursor-diag-key">' + escapeHtml(rows[i].key) + '</span><span class="cursor-diag-val ' + cls + '">' + escapeHtml(rows[i].val) + '</span></div>';
    }
    var ov = document.createElement('div');
    ov.className = 'cursor-diag show';
    ov.innerHTML =
      '<div class="cursor-diag-hd">' +
        '<button class="cursor-diag-back">←</button>' +
        '<span class="cursor-diag-title">诊断信息</span>' +
      '</div>' +
      '<div class="cursor-diag-body">' + rowsHtml + '</div>';
    ov.querySelector('.cursor-diag-back').addEventListener('click', function () { ov.classList.remove('show'); });
    panelHandle.el.appendChild(ov);
  }

  function formatUptime(s) {
    if (s < 60) return s + ' 秒';
    if (s < 3600) return Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒';
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    return h + ' 小时 ' + m + ' 分';
  }

  var modelBadgeEl = null, modelDropdown = null;

  function updateModelBadge() {
    if (!modelBadgeEl) return;
    var cur = cachedModels.models.find(function (m) { return m.modelId === cachedModels.currentModelId; });
    modelBadgeEl.innerHTML = '<span class="dot"></span>' + escapeHtml(cur ? cur.name : cachedModels.currentModelId || 'Model');
  }

  function updateStatusModel() {
    if (!statusModelEl) return;
    var cur = cachedModels.models.find(function (m) { return m.modelId === cachedModels.currentModelId; });
    statusModelEl.textContent = cur ? cur.name : cachedModels.currentModelId || '';
  }

  function buildModelDropdown() {
    if (!modelDropdown) return;
    var grouped = groupModels(cachedModels.models);
    var html = '';
    for (var gi = 0; gi < grouped.order.length; gi++) {
      var grp = grouped.order[gi];
      var items = grouped.groups[grp];
      if (items.length === 0) continue;
      html += '<div class="cursor-model-dd-group"><div class="cursor-model-dd-label">' + escapeHtml(grp) + '</div>';
      for (var j = 0; j < items.length; j++) {
        var m = items[j];
        var act = m.modelId === cachedModels.currentModelId ? ' active' : '';
        html += '<div class="cursor-model-dd-item' + act + '" data-mid="' + escapeHtml(m.modelId) + '">' + escapeHtml(m.name) + '</div>';
      }
      html += '</div>';
    }
    modelDropdown.innerHTML = html;
  }

  var modeTabEls = [];
  function updateModeTabs() {
    modeTabEls.forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.mode === currentMode);
    });
  }

  function wsDisplayName(p) {
    if (!p) return 'No workspace';
    var parts = p.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] || p;
  }

  function updateWsLabel() {
    if (wsLabel) wsLabel.textContent = wsDisplayName(cachedWorkspace);
  }

  function formatTokens(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }
  function updateUsageBadge(d) {
    if (!panelHandle || !panelHandle.el) return;
    var badge = panelHandle.el.querySelector('.cursor-usage-badge');
    if (!badge) return;
    var used = d.contextUsed || 0;
    var size = d.contextSize || 0;
    if (size === 0) { badge.style.display = 'none'; return; }
    var pct = Math.round((used / size) * 100);
    var color = pct > 80 ? '#e74c3c' : pct > 50 ? '#f39c12' : 'var(--hp-fg-muted, #888)';
    badge.style.display = '';
    badge.style.color = color;
    badge.title = 'Context: ' + formatTokens(used) + ' / ' + formatTokens(size) + ' tokens (' + pct + '%)';
    badge.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" opacity="0.25"/><path d="M12 2a10 10 0 0 1 0 20" style="stroke-dasharray:' + (pct * 0.628) + ' 62.8;stroke-dashoffset:0;transform-origin:center;transform:rotate(-90deg)"/></svg> ' + pct + '%';
  }

  // ── Update helpers ──
  function updateVerBadge() {
    if (!verBadgeEl) return;
    if (cachedUpdate.available) {
      verBadgeEl.classList.add('has-update');
      var behind = cachedUpdate.behind > 9 ? '9+' : String(cachedUpdate.behind);
      verBadgeEl.innerHTML = '<span class="ver-dot"></span>v' + escapeHtml(cachedUpdate.local) + ' → v' + escapeHtml(cachedUpdate.remote);
      verBadgeEl.title = '有新版本可用 (落后 ' + cachedUpdate.behind + ' 个提交)，点击查看';
    } else {
      verBadgeEl.classList.remove('has-update');
      verBadgeEl.innerHTML = 'v' + escapeHtml(cachedUpdate.local || '...');
      verBadgeEl.title = '当前版本';
    }
  }

  function renderUpdateOverlay() {
    if (!updateOverlay) return;
    var body = updateOverlay.querySelector('.cursor-update-body');
    if (!body) return;
    if (cachedUpdate.available) {
      var html = '<div class="cursor-update-info">' +
        '<div>当前版本: <span class="ver-current">v' + escapeHtml(cachedUpdate.local) + '</span></div>' +
        '<div>最新版本: <span class="ver-new">v' + escapeHtml(cachedUpdate.remote) + '</span></div>' +
        '<div>落后: <span class="ver-behind">' + cachedUpdate.behind + ' 个提交</span></div>' +
        '</div>';
      if (cachedUpdate.changelog) {
        html += '<div style="margin-top:12px;font-size:11px;color:var(--cp-text-dim)">最近更新:</div>';
        html += '<div class="cursor-update-changelog">' + escapeHtml(cachedUpdate.changelog) + '</div>';
      }
      html += '<div class="cursor-update-actions">' +
        '<button class="cursor-update-btn primary" data-act="apply">更新</button>' +
        '<button class="cursor-update-btn secondary" data-act="check">重新检查</button>' +
        '</div>';
      html += '<div class="cursor-update-progress" style="display:none"></div>';
      body.innerHTML = html;
    } else {
      var msg = cachedUpdate.error ? '检查失败: ' + escapeHtml(cachedUpdate.error) : '已是最新版本 (v' + escapeHtml(cachedUpdate.local || '...') + ')';
      body.innerHTML = '<div class="cursor-update-noup">' + msg + '</div>' +
        '<div class="cursor-update-actions" style="justify-content:center">' +
        '<button class="cursor-update-btn secondary" data-act="check">检查更新</button>' +
        '</div>';
    }
  }

  function appendUpdateProgress(text) {
    if (!updateOverlay) return;
    var prog = updateOverlay.querySelector('.cursor-update-progress');
    if (!prog) return;
    prog.style.display = 'block';
    prog.textContent += (prog.textContent ? '\n' : '') + text;
    prog.scrollTop = prog.scrollHeight;
    // Disable apply button during update
    var applyBtn = updateOverlay.querySelector('[data-act="apply"]');
    if (applyBtn) applyBtn.disabled = true;
  }

  // ── Show panel ──
  function showPanel() {
    if (panelHandle) { try { panelHandle.close(); } catch (_) {} }
    try { localStorage.setItem('__cursorPanelOpen', '1'); } catch (_) {}

    panelHandle = UI.createPanel({
      id: 'cursor-panel',
      title: 'CURSOR',
      width: 440,
      height: 560,
      sizeKey: 'cursorPanelSize',
      closeOnOutsideClick: false,
      dragExclude: '.hp-panel-close, .cursor-msgs, .cursor-input-wrap, .cursor-ws-bar, .cursor-ws-picker-search, .cursor-ws-picker-list, .cursor-model-badge, .cursor-model-dd, .cursor-status-bar, textarea, input, select, button',
      content: '<div class="cursor-msgs"></div>',
      onMount: function (h) {
        messagesEl = h.body.querySelector('.cursor-msgs');
        renderAllMessages(messagesEl);
        applyTheme(currentTheme);
      },
      onClose: function () {
        panelHandle = null; messagesEl = null; modelBadgeEl = null; modelDropdown = null;
        statusDot = null; statusText = null; statusModelEl = null;
        verBadgeEl = null; updateOverlay = null;
        wsLabel = null; modeTabEls = [];
        try { localStorage.setItem('__cursorPanelOpen', '0'); } catch (_) {}
        var btn = document.getElementById('cursor-sidebar-btn');
        if (btn) btn.classList.remove('active');
      }
    });

    // Reference point for insertBefore — use the panel body as anchor
    var bodyEl = panelHandle.body;

    // ── Top bar: mode tabs + action buttons ──
    var topbar = document.createElement('div');
    topbar.className = 'cursor-topbar';
    var modes = ['agent', 'ask', 'plan'];
    var tabsHtml = '<div class="cursor-mode-tabs">';
    for (var mi = 0; mi < modes.length; mi++) {
      var active = modes[mi] === currentMode ? ' active' : '';
      tabsHtml += '<div class="cursor-mode-tab' + active + '" data-mode="' + modes[mi] + '">' + modes[mi].charAt(0).toUpperCase() + modes[mi].slice(1) + '</div>';
    }
    tabsHtml += '</div>';
    var THEME_SUN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    var THEME_MOON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    topbar.innerHTML = tabsHtml +
      '<div class="cursor-topbar-actions">' +
      '<button class="cursor-topbar-btn" data-act="hist" title="History"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></button>' +
      '<button class="cursor-topbar-btn" data-act="new" title="New chat"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>' +
      '<button class="cursor-topbar-btn" data-act="theme" title="切换主题">' + (currentTheme === 'dark' ? THEME_SUN : THEME_MOON) + '</button>' +
      '<button class="cursor-topbar-btn" data-act="dock" title="侧边栏停靠"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg></button>' +
      '</div>';
    panelHandle.el.insertBefore(topbar, bodyEl);

    modeTabEls = Array.from(topbar.querySelectorAll('.cursor-mode-tab'));
    modeTabEls.forEach(function (tab) {
      tab.addEventListener('click', function () {
        currentMode = tab.dataset.mode;
        try { localStorage.setItem(MODE_KEY, currentMode); } catch (_) {}
        updateModeTabs();
        if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'set_mode', mode: currentMode }));
      });
    });

    topbar.querySelector('[data-act="hist"]').addEventListener('click', function () {
      saveCurrentConv();
      renderHistList(histListEl);
      histOverlay.classList.add('show');
    });
    topbar.querySelector('[data-act="new"]').addEventListener('click', function () {
      saveCurrentConv(); currentIdx = -1; messages = []; contextData = null; turnView = null;
      if (ctxBar) ctxBar.classList.remove('show');
      renderAllMessages(messagesEl);
      if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'new_conversation' }));
    });
    // Theme toggle
    var themeBtn = topbar.querySelector('[data-act="theme"]');
    themeBtn.addEventListener('click', function () {
      var newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(newTheme);
      themeBtn.innerHTML = newTheme === 'dark' ? THEME_SUN : THEME_MOON;
      themeBtn.title = newTheme === 'dark' ? '浅色模式' : '深色模式';
    });

    // Dock toggle
    var dockBtn = topbar.querySelector('[data-act="dock"]');
    var DOCK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>';
    var UNDOCK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="2"/><polyline points="3 9 3 3 9 3"/><polyline points="21 15 21 21 15 21"/></svg>';
    dockBtn.addEventListener('click', function () {
      panelHandle.toggleDock();
      dockBtn.innerHTML = panelHandle.isDocked() ? UNDOCK_ICON : DOCK_ICON;
      dockBtn.title = panelHandle.isDocked() ? '浮窗模式' : '侧边栏停靠';
    });
    setTimeout(function() {
      if (panelHandle && panelHandle.isDocked()) {
        dockBtn.innerHTML = UNDOCK_ICON;
        dockBtn.title = '浮窗模式';
      }
    }, 50);

    // Workspace bar
    var wsBar = document.createElement('div');
    wsBar.className = 'cursor-ws-bar';
    wsBar.innerHTML = '<span class="cursor-ws-icon">📁</span><span class="cursor-ws-name">' + escapeHtml(wsDisplayName(cachedWorkspace)) + '</span><span class="cursor-ws-arrow">▼</span>';
    wsLabel = wsBar.querySelector('.cursor-ws-name');
    panelHandle.el.insertBefore(wsBar, bodyEl);

    // Workspace picker overlay
    var wsPicker = document.createElement('div');
    wsPicker.className = 'cursor-ws-picker';
    wsPicker.innerHTML = '<div class="cursor-ws-picker-hd"><button class="cursor-ws-picker-back">←</button><span class="cursor-ws-picker-title">切换工作区</span></div><div class="cursor-ws-picker-search"><input class="cursor-ws-picker-input" placeholder="搜索工作区..." /><button class="cursor-ws-picker-browse">浏览...</button></div><div class="cursor-ws-picker-list"></div>';
    panelHandle.body.appendChild(wsPicker);
    var wsPickerList = wsPicker.querySelector('.cursor-ws-picker-list');
    var wsPickerInput = wsPicker.querySelector('.cursor-ws-picker-input');

    function renderWsList(filter) {
      var f = (filter || '').toLowerCase();
      var recentList = loadRecentWorkspaces();
      var scannedList = cachedWorkspaceList.slice();

      // Ensure current workspace is in recent list
      if (cachedWorkspace) {
        var inRecent = false;
        for (var ri = 0; ri < recentList.length; ri++) { if (recentList[ri].path === cachedWorkspace) { inRecent = true; break; } }
        if (!inRecent) {
          var parts = cachedWorkspace.replace(/\/+$/, '').split('/');
          recentList.unshift({ name: parts[parts.length - 1] || cachedWorkspace, path: cachedWorkspace });
        }
      }

      // Filter
      function matchFilter(w) { return !f || w.name.toLowerCase().indexOf(f) >= 0 || w.path.toLowerCase().indexOf(f) >= 0; }
      var filteredRecent = recentList.filter(matchFilter);
      var recentPaths = {};
      for (var rj = 0; rj < recentList.length; rj++) recentPaths[recentList[rj].path] = true;
      var filteredScanned = scannedList.filter(function (w) { return !recentPaths[w.path] && matchFilter(w); });

      // Custom path fallback when nothing matches a search
      if (filteredRecent.length === 0 && filteredScanned.length === 0 && f) {
        wsPickerList.innerHTML = '<div class="cursor-ws-picker-item" data-path="' + escapeHtml(f) + '"><span class="ws-icon">📂</span><div class="ws-info"><div class="ws-name">Use: ' + escapeHtml(f) + '</div><div class="ws-path">Press Enter or click to use this path</div></div></div>';
        return;
      }

      function renderItem(w) {
        var isCurrent = w.path === cachedWorkspace;
        var act = isCurrent ? ' active' : '';
        var icon = isCurrent ? '✓' : '📁';
        return '<div class="cursor-ws-picker-item' + act + '" data-path="' + escapeHtml(w.path) + '"><span class="ws-icon">' + icon + '</span><div class="ws-info"><div class="ws-name">' + escapeHtml(w.name) + '</div><div class="ws-path">' + escapeHtml(w.path) + '</div></div></div>';
      }

      var html = '';
      if (filteredRecent.length > 0) {
        html += '<div class="cursor-ws-picker-section">最近使用</div>';
        for (var a = 0; a < filteredRecent.length; a++) html += renderItem(filteredRecent[a]);
      }
      if (filteredScanned.length > 0) {
        html += '<div class="cursor-ws-picker-section">本机项目</div>';
        for (var b = 0; b < filteredScanned.length; b++) html += renderItem(filteredScanned[b]);
      }
      wsPickerList.innerHTML = html || '<div style="text-align:center;padding:20px;color:var(--cp-text-dim2);font-size:12px">No workspaces found<br><span style="font-size:10px;margin-top:4px;display:inline-block">点击「浏览...」选择项目文件夹，或在搜索框输入路径后按 Enter</span></div>';
    }

    wsBar.addEventListener('click', function () {
      renderWsList('');
      wsPickerInput.value = '';
      wsPicker.classList.add('show');
      setTimeout(function () { wsPickerInput.focus(); }, 100);
    });
    wsPicker.querySelector('.cursor-ws-picker-back').addEventListener('click', function () { wsPicker.classList.remove('show'); });
    wsPickerInput.addEventListener('input', function () { renderWsList(this.value); });
    wsPickerInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var val = this.value.trim();
        if (val) { selectWorkspace(val); }
      } else if (e.key === 'Escape') { wsPicker.classList.remove('show'); }
    });
    wsPickerList.addEventListener('click', function (e) {
      var item = e.target.closest('.cursor-ws-picker-item');
      if (!item) return;
      var p = item.dataset.path;
      if (!p || p === cachedWorkspace) { wsPicker.classList.remove('show'); return; }
      selectWorkspace(p);
    });

    wsPicker.querySelector('.cursor-ws-picker-browse').addEventListener('click', function () {
      if (typeof window.__agentSend === 'function') {
        window.__agentSend(JSON.stringify({ type: 'browse_folder' }));
      }
    });

    function loadRecentWorkspaces() {
      try {
        var raw = localStorage.getItem(WS_RECENT_KEY);
        if (raw) { var arr = JSON.parse(raw); if (Array.isArray(arr)) return arr; }
      } catch (_) {}
      return [];
    }
    function saveRecentWorkspace(wsPath) {
      if (!wsPath) return;
      var recent = loadRecentWorkspaces();
      // Remove if already exists, then prepend
      recent = recent.filter(function (r) { return r.path !== wsPath; });
      var parts = wsPath.replace(/\/+$/, '').split('/');
      recent.unshift({ name: parts[parts.length - 1] || wsPath, path: wsPath });
      if (recent.length > MAX_RECENT_WS) recent = recent.slice(0, MAX_RECENT_WS);
      try { localStorage.setItem(WS_RECENT_KEY, JSON.stringify(recent)); } catch (_) {}
    }

    function selectWorkspace(p) {
      cachedWorkspace = p;
      updateWsLabel();
      try { localStorage.setItem(WS_KEY, p); } catch (_) {}
      saveRecentWorkspace(p);
      wsPicker.classList.remove('show');
      saveCurrentConv(); currentIdx = -1; messages = []; turnView = null;
      renderAllMessages(messagesEl);
      if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'set_workspace', path: p }));
    }

    // Context bar (created here, inserted into inputArea later)

    // History overlay
    var histOverlay = document.createElement('div');
    histOverlay.className = 'cursor-hist';
    histOverlay.innerHTML = '<div class="cursor-hist-hd"><button class="cursor-hist-back">←</button><span class="cursor-hist-title">History</span></div><div class="cursor-hist-list"></div>';
    panelHandle.body.appendChild(histOverlay);
    var histListEl = histOverlay.querySelector('.cursor-hist-list');
    histOverlay.querySelector('.cursor-hist-back').addEventListener('click', function () { histOverlay.classList.remove('show'); });
    histListEl.addEventListener('click', function (e) {
      var del = e.target.closest('.cursor-hist-del');
      if (del) {
        e.stopPropagation();
        var idx = parseInt(del.dataset.d);
        if (idx === currentIdx) { currentIdx = -1; messages = []; turnView = null; renderAllMessages(messagesEl); }
        else if (currentIdx > idx) currentIdx--;
        conversations.splice(idx, 1); saveConvs(conversations); renderHistList(histListEl);
        return;
      }
      var item = e.target.closest('.cursor-hist-item');
      if (item) {
        saveCurrentConv();
        currentIdx = parseInt(item.dataset.i);
        var c = conversations[currentIdx];
        messages = c ? c.messages.slice() : [];
        turnView = null;
        renderAllMessages(messagesEl);
        histOverlay.classList.remove('show');
        // Switch workspace if the conversation was in a different one
        if (c && c.workspace && c.workspace !== cachedWorkspace) {
          cachedWorkspace = c.workspace;
          updateWsLabel();
          if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'set_workspace', path: c.workspace }));
        }
      }
    });

    // ── Input area ──
    var inputArea = document.createElement('div');
    inputArea.className = 'cursor-input-area';
    inputArea.innerHTML =
      '<div class="cursor-input-meta"><span class="cursor-model-badge"><span class="dot"></span>Model</span><div class="cursor-model-dd"></div></div>' +
      '<div class="cursor-img-preview"></div>' +
      '<div class="cursor-input-wrap">' +
      '<textarea class="cursor-input" placeholder="Ask anything..." rows="1"></textarea>' +
      '<button class="cursor-imgbtn" title="添加图片"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></button>' +
      '<input type="file" class="cursor-img-file" accept="image/png,image/jpeg,image/gif,image/webp" multiple style="display:none">' +
      '<button class="cursor-sendbtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>' +
      '<button class="cursor-stopbtn" style="display:none"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>' +
      '</div>';
    panelHandle.el.appendChild(inputArea);

    // Context bar — sits inside input area, above the text field
    ctxBar = document.createElement('div');
    ctxBar.className = 'cursor-ctx';
    ctxBar.innerHTML = '<svg class="cursor-ctx-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3-3 6.5-7 8-10a4 4 0 1 0-4-4"/><path d="M12.5 8c1.5 3 5 7 8 10"/></svg><span class="cursor-ctx-label"></span><span class="rm">✕</span>';
    ctxLabel = ctxBar.querySelector('.cursor-ctx-label');
    ctxBar.querySelector('.rm').addEventListener('click', function () { contextData = null; ctxBar.classList.remove('show'); });
    inputArea.insertBefore(ctxBar, inputArea.querySelector('.cursor-img-preview'));

    inputEl = inputArea.querySelector('.cursor-input');
    sendBtn = inputArea.querySelector('.cursor-sendbtn');
    stopBtn = inputArea.querySelector('.cursor-stopbtn');
    imgPreviewEl = inputArea.querySelector('.cursor-img-preview');
    imgFileInput = inputArea.querySelector('.cursor-img-file');
    modelBadgeEl = inputArea.querySelector('.cursor-model-badge');
    modelDropdown = inputArea.querySelector('.cursor-model-dd');

    // Image button click → trigger file input
    var imgBtn = inputArea.querySelector('.cursor-imgbtn');
    imgBtn.addEventListener('click', function () { if (imgFileInput) imgFileInput.click(); });
    imgFileInput.addEventListener('change', function () {
      var files = imgFileInput.files;
      for (var fi = 0; fi < files.length; fi++) addPendingImage(files[fi]);
      imgFileInput.value = '';
    });

    updateModelBadge();
    buildModelDropdown();

    modelBadgeEl.addEventListener('click', function (e) {
      e.stopPropagation();
      buildModelDropdown();
      modelDropdown.classList.toggle('show');
    });
    modelDropdown.addEventListener('click', function (e) {
      var item = e.target.closest('.cursor-model-dd-item');
      if (!item) return;
      cachedModels.currentModelId = item.dataset.mid;
      updateModelBadge();
      updateStatusModel();
      modelDropdown.classList.remove('show');
      if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'set_model', modelId: cachedModels.currentModelId }));
    });
    document.addEventListener('click', function () { if (modelDropdown) modelDropdown.classList.remove('show'); });

    var composing = false;
    inputEl.addEventListener('compositionstart', function () { composing = true; });
    inputEl.addEventListener('compositionend', function () {
      composing = false;
    });
    inputEl.addEventListener('input', function () { this.style.height = '36px'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (e.isComposing || composing) return;
        e.preventDefault();
        doSend();
      }
    });
    inputEl.addEventListener('keyup', function (e) {
      if (e.key === 'Enter') composing = false;
    });
    sendBtn.addEventListener('click', doSend);

    // Paste image from clipboard
    inputEl.addEventListener('paste', function (e) {
      var items = (e.clipboardData || e.originalEvent.clipboardData || {}).items;
      if (!items) return;
      for (var pi = 0; pi < items.length; pi++) {
        if (items[pi].type.indexOf('image/') === 0) {
          e.preventDefault();
          var file = items[pi].getAsFile();
          if (file) addPendingImage(file);
        }
      }
    });

    // Drag & drop images
    inputArea.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.stopPropagation();
      inputArea.classList.add('dragover');
    });
    inputArea.addEventListener('dragleave', function (e) {
      e.preventDefault();
      e.stopPropagation();
      inputArea.classList.remove('dragover');
    });
    inputArea.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      inputArea.classList.remove('dragover');
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files) return;
      for (var di = 0; di < files.length; di++) {
        if (files[di].type.indexOf('image/') === 0) addPendingImage(files[di]);
      }
    });

    stopBtn.addEventListener('click', function () {
      if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'cancel' }));
      // Don't setProcessingState(false) here — wait for turn_end from backend.
      // But set a safety timeout in case turn_end never comes.
      setTimeout(function () {
        if (isProcessing) {
          endTurn('cancelled');
        }
      }, 5000);
    });

    // Status bar
    var statusBar = document.createElement('div');
    statusBar.className = 'cursor-status-bar';
    statusBar.innerHTML =
      '<span class="cursor-status-dot none"></span>' +
      '<span class="cursor-status-text">...</span>' +
      '<button class="cursor-status-reconnect">重连</button>' +
      '<span class="cursor-ver-badge" title="当前版本">v...</span>' +
      '<span class="cursor-usage-badge" title="Context usage" style="display:none"></span>' +
      '<span class="cursor-status-model" style="flex:1;text-align:right"></span>' +
      '<span class="cursor-settings-wrap">' +
        '<button class="cursor-topbar-btn cursor-settings-btn" title="Settings"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>' +
        '<div class="cursor-settings-dd">' +
          '<div class="cursor-settings-dd-item" data-action="reconnect_acp"><span class="dd-icon">↻</span>重连 Agent</div>' +
          '<div class="cursor-settings-dd-item" data-action="reinject_ui"><span class="dd-icon">↻</span>重新注入 UI</div>' +
          '<div class="cursor-settings-dd-item" data-action="restart_agent"><span class="dd-icon">⟳</span>重启 Agent</div>' +
          '<div class="cursor-settings-dd-sep"></div>' +
          '<div class="cursor-settings-dd-item" data-action="show_logs"><span class="dd-icon">📋</span>查看后端日志</div>' +
          '<div class="cursor-settings-dd-item" data-action="show_diagnostics"><span class="dd-icon">ℹ</span>诊断信息</div>' +
          '<div class="cursor-settings-dd-sep"></div>' +
          '<div class="cursor-settings-dd-item" data-action="check_update"><span class="dd-icon">⬆</span>检查更新</div>' +
        '</div>' +
      '</span>';
    panelHandle.el.appendChild(statusBar);
    statusDot = statusBar.querySelector('.cursor-status-dot');
    statusText = statusBar.querySelector('.cursor-status-text');
    statusModelEl = statusBar.querySelector('.cursor-status-model');
    verBadgeEl = statusBar.querySelector('.cursor-ver-badge');
    var reconnectBtn = statusBar.querySelector('.cursor-status-reconnect');
    var settingsBtn = statusBar.querySelector('.cursor-settings-btn');
    var settingsDd = statusBar.querySelector('.cursor-settings-dd');

    statusDot.className = 'cursor-status-dot ' + (cachedStatus.connected ? 'on' : 'off');
    statusText.textContent = cachedStatus.text;
    if (!cachedStatus.connected) reconnectBtn.classList.add('show');
    updateStatusModel();
    updateVerBadge();

    // Version badge click → open update overlay
    verBadgeEl.addEventListener('click', function () {
      showUpdateOverlay();
    });

    // Reconnect button click
    reconnectBtn.addEventListener('click', function () {
      reconnectBtn.textContent = '重连中...';
      if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'reconnect_acp' }));
    });

    // Settings dropdown
    settingsBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      settingsDd.classList.toggle('show');
    });
    document.addEventListener('click', function () { if (settingsDd) settingsDd.classList.remove('show'); });

    settingsDd.addEventListener('click', function (e) {
      var item = e.target.closest('.cursor-settings-dd-item');
      if (!item) return;
      var action = item.dataset.action;
      settingsDd.classList.remove('show');
      if (action === 'reconnect_acp' || action === 'reinject_ui' || action === 'restart_agent') {
        if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: action }));
      } else if (action === 'show_logs') {
        if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'get_logs' }));
      } else if (action === 'show_diagnostics') {
        if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'get_diagnostics' }));
      } else if (action === 'check_update') {
        showUpdateOverlay();
        if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'update_check' }));
      }
    });

    inputEl.focus();
    var btn = document.getElementById('cursor-sidebar-btn');
    if (btn) btn.classList.add('active');
  }

  // ── Toggle ──
  window.__agentToggle = function (open) {
    if (open === false || (open === undefined && panelHandle)) {
      if (panelHandle) panelHandle.close();
    } else if (!panelHandle) {
      showPanel();
    }
  };

  // ── Sidebar button ──
  var oldBtn = document.getElementById('cursor-sidebar-btn');
  if (oldBtn) oldBtn.remove();
  UI.createSidebarButton({
    id: 'cursor-sidebar-btn',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/></svg>',
    onClick: function () { window.__agentToggle(); },
    tooltip: function () {
      var st = cachedStatus.connected
        ? '<span style="color:#4ec9b0">● 已连接</span>'
        : '<span style="color:#d44">○ 断开连接</span>';
      return '<b>✦ Cursor</b><div style="font-size:10px;color:#858585;margin-top:2px">' + st + '</div>';
    }
  });
  updateSidebarBtnStatus();

  document.addEventListener('keydown', function (e) { if (e.ctrlKey && e.shiftKey && e.key === 'A') { e.preventDefault(); window.__agentToggle(); } });

  // Restore panel open state after re-injection
  try { if (localStorage.getItem('__cursorPanelOpen') === '1' && !panelHandle) showPanel(); } catch (_) {}

  // Detect post-update restart: if update was applied recently, show success notification
  (function checkPostUpdate() {
    try {
      var raw = localStorage.getItem('__cursorUpdateState');
      if (!raw) return;
      var state = JSON.parse(raw);
      if ((state.status === 'done' || state.status === 'applying') && Date.now() - state.ts < 120000) {
        localStorage.removeItem('__cursorUpdateState');
        console.log('[cursor-acp] post-update restart detected, showing success notification');
        setTimeout(function () {
          if (!panelHandle) showPanel();
          setTimeout(function () {
            if (messagesEl) {
              var notice = document.createElement('div');
              notice.className = 'cursor-msg system';
              notice.innerHTML = '<div class="cursor-msg-text" style="color:#4ec9b0;font-weight:500">✅ 更新成功！Agent 已自动重启到最新版本。</div>';
              messagesEl.appendChild(notice);
              messagesEl.scrollTop = messagesEl.scrollHeight;
            }
            if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'update_check' }));
          }, 500);
        }, 1000);
      } else {
        localStorage.removeItem('__cursorUpdateState');
      }
    } catch (_) {}
  })();

  console.log('[cursor-acp] panel loaded (Cursor-native style)');
})();

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

  // ── Persistence ──
  function loadConvs() { try { var r = localStorage.getItem(STORE_KEY); return r ? JSON.parse(r) : []; } catch (_) { return []; } }
  function saveConvs(c) { try { localStorage.setItem(STORE_KEY, JSON.stringify(c.slice(-50))); } catch (_) {} }
  function saveCurrentConv() {
    if (messages.length === 0) return;
    var first = messages.find(function (m) { return m.role === 'user'; });
    var conv = { id: currentIdx >= 0 && conversations[currentIdx] ? conversations[currentIdx].id : Date.now(), ts: Date.now(), messages: messages.map(function (m) { return { role: m.role, text: m.text }; }), summary: first ? first.text.substring(0, 80) : '(empty)' };
    if (currentIdx >= 0) { conversations[currentIdx] = conv; } else { conversations.push(conv); currentIdx = conversations.length - 1; }
    saveConvs(conversations);
  }

  // ── CSS — Cursor IDE native style ──
  var oldCss = document.getElementById('cursor-acp-css');
  if (oldCss) oldCss.remove();
  UI.injectCSS('cursor-acp-css', [
    // Override panel chrome to match Cursor's look
    '#cursor-panel { background:#1e1e1e !important; border-color:rgba(255,255,255,0.08) !important; }',
    '#cursor-panel .hp-panel-header { background:#1e1e1e; border-bottom:none; padding:6px 12px 4px; cursor:grab; }',
    '#cursor-panel .hp-panel-header:active { cursor:grabbing; }',
    '#cursor-panel .hp-panel-title { font-size:11px; font-weight:400; color:#cccccc; text-transform:uppercase; letter-spacing:0.5px; }',
    '#cursor-panel .hp-panel-body { padding:0; background:#1e1e1e; }',

    // Messages container
    '.cursor-msgs { flex:1; overflow-y:auto; padding:0; display:flex; flex-direction:column; }',
    '.cursor-msgs::-webkit-scrollbar { width:6px; }',
    '.cursor-msgs::-webkit-scrollbar-track { background:transparent; }',
    '.cursor-msgs::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:3px; }',
    '.cursor-msgs::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,0.18); }',

    // User message — Cursor uses a slightly tinted background block
    '.cursor-msg-user { padding:12px 16px; background:#2a2d2e; border-top:1px solid #2d2d2d; border-bottom:1px solid #2d2d2d; color:#d4d4d4; font-size:13px; line-height:1.5; white-space:pre-wrap; word-break:break-word; cursor:text; user-select:text; }',
    '.cursor-msg-user-label { font-size:11px; font-weight:600; color:#569cd6; margin-bottom:4px; }',

    // Agent turn — full width, no bubbles (Cursor style)
    '.cursor-agent-turn { padding:12px 16px; border-bottom:1px solid #2d2d2d; }',

    // Streaming result — Cursor's markdown rendering
    '.ca-result { font-size:13px; line-height:1.6; color:#d4d4d4; word-break:break-word; cursor:text; user-select:text; }',
    '.ca-result p { margin:0 0 8px; } .ca-result p:last-child { margin-bottom:0; }',
    '.ca-result h1,.ca-result h2,.ca-result h3,.ca-result h4 { margin:16px 0 8px; font-weight:600; color:#e0e0e0; }',
    '.ca-result h1 { font-size:1.3em; } .ca-result h2 { font-size:1.15em; } .ca-result h3 { font-size:1.05em; }',
    '.ca-result code { background:#2d2d2d; padding:2px 6px; border-radius:3px; font-size:12px; color:#ce9178; font-family:\"Menlo\",\"Consolas\",\"Courier New\",monospace; }',
    '.ca-result pre { background:#1a1a1a; border:1px solid #333; border-radius:6px; padding:12px; margin:8px 0; overflow-x:auto; font-size:12px; line-height:1.5; }',
    '.ca-result pre code { background:none; padding:0; border-radius:0; font-size:12px; color:#d4d4d4; }',
    '.ca-result ul,.ca-result ol { margin:6px 0; padding-left:24px; } .ca-result li { margin:4px 0; }',
    '.ca-result strong { color:#e0e0e0; font-weight:600; }',
    '.ca-result em { color:#d4d4d4; }',
    '.ca-result blockquote { border-left:3px solid #569cd6; margin:8px 0; padding:4px 16px; color:#9e9e9e; background:rgba(86,156,214,0.06); }',
    '.ca-result table { border-collapse:collapse; margin:8px 0; font-size:12px; width:100%; }',
    '.ca-result th { text-align:left; padding:6px 10px; border:1px solid #333; background:#2a2d2e; color:#cccccc; font-weight:600; }',
    '.ca-result td { padding:6px 10px; border:1px solid #333; color:#d4d4d4; }',
    '.ca-result a { color:#569cd6; text-decoration:none; } .ca-result a:hover { text-decoration:underline; }',
    '.ca-result hr { border:none; border-top:1px solid #333; margin:16px 0; }',

    // Thinking block — Cursor shows thinking in a collapsible gray block
    '.ca-thinking { padding:8px 12px; border-radius:4px; background:#252526; border:1px solid #333; font-size:12px; line-height:1.5; color:#858585; max-height:200px; overflow-y:auto; white-space:pre-wrap; word-break:break-word; cursor:text; user-select:text; transition:max-height .3s, padding .2s; }',
    '.ca-thinking-label { font-size:11px; color:#858585; cursor:pointer; user-select:none; display:flex; align-items:center; gap:4px; margin-bottom:4px; }',
    '.ca-thinking-label:hover { color:#cccccc; }',
    '.ca-thinking.collapsed { max-height:0; overflow:hidden; padding:0 12px; border-color:transparent; }',

    // Tool calls — Cursor shows tool names with a dim icon
    '.ca-tool-call { padding:6px 10px; border-radius:4px; background:#252526; border:1px solid #333; font-size:11px; line-height:1.4; color:#858585; white-space:pre-wrap; word-break:break-word; margin:4px 0; }',
    '.ca-tool-call-label { font-size:11px; color:#6a9955; cursor:pointer; user-select:none; margin-bottom:2px; display:flex; align-items:center; gap:4px; }',
    '.ca-tool-call-label:hover { color:#b5cea8; }',
    '.ca-tool-call-body { max-height:0; overflow:hidden; transition:max-height .2s; }',
    '.ca-tool-call-body.open { max-height:200px; overflow-y:auto; }',
    '.ca-tool-call-section { color:#858585; margin-top:4px; }',
    '.ca-tool-call-section b { color:#cccccc; }',

    // Typing indicator — subtle dots
    '.ca-typing { display:inline-flex; gap:4px; padding:12px 16px; }',
    '.ca-typing span { width:6px; height:6px; border-radius:50%; background:#569cd6; opacity:0.4; animation:ca-bounce 1.2s infinite; }',
    '.ca-typing span:nth-child(2) { animation-delay:0.15s; } .ca-typing span:nth-child(3) { animation-delay:0.3s; }',
    '@keyframes ca-bounce { 0%,60%,100%{transform:translateY(0);opacity:.4} 30%{transform:translateY(-4px);opacity:1} }',

    // Welcome / empty state
    '.cursor-empty-wrap { flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:20px; }',
    '.cursor-empty { text-align:center; color:#858585; font-size:13px; line-height:1.6; }',
    '.cursor-empty .ce-icon { font-size:28px; margin-bottom:12px; opacity:0.5; }',
    '.cursor-empty .ce-title { font-size:14px; color:#cccccc; font-weight:500; margin-bottom:4px; }',
    '.cursor-empty .ce-sub { font-size:12px; color:#6e6e6e; }',
    '.cursor-quick-actions { display:flex; flex-direction:column; gap:6px; width:100%; max-width:320px; margin-top:16px; }',
    '.cursor-quick-btn { display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:6px; border:1px solid #333; background:#252526; color:#cccccc; cursor:pointer; transition:all .15s; text-align:left; font-size:12px; }',
    '.cursor-quick-btn:hover { background:#2a2d2e; border-color:#464646; }',
    '.cursor-quick-icon { font-size:14px; flex-shrink:0; }',
    '.cursor-quick-text { flex:1; }',
    '.cursor-quick-text .title { font-weight:500; }',
    '.cursor-quick-text .desc { font-size:11px; color:#6e6e6e; margin-top:1px; }',

    // Top bar: mode tabs + model selector (Cursor puts these at the top)
    '.cursor-topbar { display:flex; align-items:center; padding:0; border-bottom:1px solid #2d2d2d; background:#1e1e1e; flex-shrink:0; cursor:grab; }',
    '.cursor-topbar:active { cursor:grabbing; }',
    '.cursor-mode-tabs { display:flex; flex:1; }',
    '.cursor-mode-tab { padding:8px 14px; font-size:11px; color:#858585; cursor:pointer; border-bottom:2px solid transparent; transition:all .12s; user-select:none; text-transform:capitalize; }',
    '.cursor-mode-tab:hover { color:#cccccc; }',
    '.cursor-mode-tab.active { color:#d4d4d4; border-bottom-color:#569cd6; }',
    '.cursor-topbar-actions { display:flex; align-items:center; gap:2px; padding:0 8px; }',
    '.cursor-topbar-btn { width:28px; height:28px; display:flex; align-items:center; justify-content:center; border:none; background:transparent; color:#858585; cursor:pointer; border-radius:4px; font-size:12px; }',
    '.cursor-topbar-btn:hover { background:#2a2d2e; color:#cccccc; }',

    // Model selector badge in bottom input area (Cursor style)
    '.cursor-model-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:4px; background:#2a2d2e; border:1px solid #3c3c3c; font-size:10px; color:#858585; cursor:pointer; transition:all .12s; user-select:none; }',
    '.cursor-model-badge:hover { border-color:#569cd6; color:#cccccc; }',
    '.cursor-model-badge .dot { width:5px; height:5px; border-radius:50%; background:#569cd6; }',

    // Model dropdown overlay
    '.cursor-model-dd { display:none; position:absolute; bottom:100%; left:0; right:0; max-height:300px; overflow-y:auto; background:#252526; border:1px solid #3c3c3c; border-radius:6px; box-shadow:0 -4px 20px rgba(0,0,0,0.4); z-index:20; margin-bottom:4px; }',
    '.cursor-model-dd.show { display:block; }',
    '.cursor-model-dd-group { padding:4px 0; }',
    '.cursor-model-dd-label { padding:4px 12px; font-size:10px; font-weight:600; color:#858585; text-transform:uppercase; letter-spacing:0.5px; }',
    '.cursor-model-dd-item { padding:6px 12px; font-size:12px; color:#cccccc; cursor:pointer; display:flex; align-items:center; justify-content:space-between; }',
    '.cursor-model-dd-item:hover { background:#2a2d2e; }',
    '.cursor-model-dd-item.active { color:#569cd6; }',
    '.cursor-model-dd-item.active::after { content:\"✓\"; font-size:11px; color:#569cd6; }',

    // Input area — Cursor's bottom composer
    '.cursor-input-area { padding:0; border-top:1px solid #2d2d2d; background:#1e1e1e; flex-shrink:0; }',
    '.cursor-input-meta { display:flex; align-items:center; gap:6px; padding:6px 12px 0; position:relative; }',
    '.cursor-input-wrap { display:flex; align-items:flex-end; padding:8px 12px; gap:8px; }',
    '.cursor-input { flex:1; background:transparent; border:1px solid #3c3c3c; border-radius:6px; padding:8px 10px; color:#d4d4d4; font-size:13px; font-family:inherit; resize:none; outline:none; min-height:36px; max-height:120px; transition:border-color .15s; }',
    '.cursor-input:focus { border-color:#569cd6; }',
    '.cursor-input::placeholder { color:#5a5a5a; }',
    '.cursor-sendbtn { width:30px; height:30px; border-radius:6px; border:none; background:#569cd6; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .15s; }',
    '.cursor-sendbtn:hover { background:#4a8abf; }',
    '.cursor-stopbtn { width:30px; height:30px; border-radius:6px; border:none; background:#d44; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .15s; }',
    '.cursor-stopbtn:hover { background:#c33; }',

    // Context bar
    '.cursor-ctx { display:none; padding:6px 12px; font-size:11px; background:rgba(86,156,214,0.08); color:#569cd6; border-bottom:1px solid #2d2d2d; align-items:center; gap:6px; flex-shrink:0; }',
    '.cursor-ctx.show { display:flex; }',
    '.cursor-ctx .rm { margin-left:auto; cursor:pointer; opacity:.5; } .cursor-ctx .rm:hover { opacity:1; }',

    // New conversation button — Cursor uses a small icon button in the top bar
    // (already handled via topbar-btn)

    // Status bar
    '.cursor-status-bar { display:flex; align-items:center; gap:6px; padding:4px 12px; font-size:10px; color:#5a5a5a; border-top:1px solid #2d2d2d; flex-shrink:0; }',
    '.cursor-status-dot { width:5px; height:5px; border-radius:50%; flex-shrink:0; }',
    '.cursor-status-dot.on { background:#4ec9b0; }',
    '.cursor-status-dot.off { background:#d44; }',
    '.cursor-status-dot.none { background:#5a5a5a; }',
    '.cursor-status-text { }',
    '.cursor-status-reconnect { display:none; padding:1px 8px; border-radius:3px; border:1px solid #3c3c3c; background:#2a2d2e; color:#569cd6; font-size:9px; cursor:pointer; transition:background .12s; white-space:nowrap; font-family:inherit; }',
    '.cursor-status-reconnect:hover { background:#37373d; border-color:#569cd6; }',
    '.cursor-status-reconnect.show { display:inline-block; }',
    '.cursor-status-model { flex:1; text-align:right; color:#5a5a5a; }',

    // Settings dropdown
    '.cursor-settings-wrap { position:relative; }',
    '.cursor-settings-dd { display:none; position:absolute; bottom:100%; right:0; min-width:160px; background:#252526; border:1px solid #3c3c3c; border-radius:6px; box-shadow:0 4px 16px rgba(0,0,0,0.4); z-index:20; padding:4px 0; margin-bottom:4px; }',
    '.cursor-settings-dd.show { display:block; }',
    '.cursor-settings-dd-item { display:flex; align-items:center; gap:8px; padding:6px 12px; font-size:11px; color:#cccccc; cursor:pointer; transition:background .1s; white-space:nowrap; }',
    '.cursor-settings-dd-item:hover { background:#2a2d2e; }',
    '.cursor-settings-dd-item .dd-icon { width:16px; text-align:center; font-size:12px; opacity:.7; }',
    '.cursor-settings-dd-sep { height:1px; background:#3c3c3c; margin:4px 0; }',

    // Logs overlay
    '.cursor-logs { position:absolute; top:0; left:0; right:0; bottom:0; background:#1e1e1e; z-index:10; display:none; flex-direction:column; }',
    '.cursor-logs.show { display:flex; }',
    '.cursor-logs-hd { display:flex; align-items:center; padding:8px 12px; border-bottom:1px solid #2d2d2d; gap:8px; }',
    '.cursor-logs-back { border:none; background:none; color:#858585; font-size:14px; cursor:pointer; padding:4px 8px; border-radius:4px; }',
    '.cursor-logs-back:hover { background:#2a2d2e; color:#cccccc; }',
    '.cursor-logs-title { font-size:12px; font-weight:600; flex:1; color:#cccccc; }',
    '.cursor-logs-body { flex:1; overflow-y:auto; padding:8px; font-family:"Menlo","Consolas","Courier New",monospace; font-size:10px; line-height:1.6; color:#8c8c8c; white-space:pre-wrap; word-break:break-all; }',

    // Diagnostics overlay
    '.cursor-diag { position:absolute; top:0; left:0; right:0; bottom:0; background:#1e1e1e; z-index:10; display:none; flex-direction:column; }',
    '.cursor-diag.show { display:flex; }',
    '.cursor-diag-hd { display:flex; align-items:center; padding:8px 12px; border-bottom:1px solid #2d2d2d; gap:8px; }',
    '.cursor-diag-back { border:none; background:none; color:#858585; font-size:14px; cursor:pointer; padding:4px 8px; border-radius:4px; }',
    '.cursor-diag-back:hover { background:#2a2d2e; color:#cccccc; }',
    '.cursor-diag-title { font-size:12px; font-weight:600; flex:1; color:#cccccc; }',
    '.cursor-diag-body { flex:1; overflow-y:auto; padding:12px; }',
    '.cursor-diag-row { display:flex; padding:4px 0; font-size:11px; border-bottom:1px solid #2a2a2a; }',
    '.cursor-diag-key { width:110px; color:#858585; flex-shrink:0; }',
    '.cursor-diag-val { color:#cccccc; flex:1; word-break:break-all; }',
    '.cursor-diag-val.ok { color:#4ec9b0; }',
    '.cursor-diag-val.err { color:#d44; }',

    // Stop reason
    '.cursor-stop-reason { padding:6px 16px; font-size:11px; display:flex; align-items:center; gap:6px; color:#858585; border-bottom:1px solid #2d2d2d; }',
    '.cursor-stop-reason.cancelled { color:#dca561; }',
    '.cursor-stop-reason.error { color:#d44; }',

    // History overlay
    '.cursor-hist { position:absolute; top:0; left:0; right:0; bottom:0; background:#1e1e1e; z-index:10; display:none; flex-direction:column; }',
    '.cursor-hist.show { display:flex; }',
    '.cursor-hist-hd { display:flex; align-items:center; padding:8px 12px; border-bottom:1px solid #2d2d2d; gap:8px; }',
    '.cursor-hist-back { border:none; background:none; color:#858585; font-size:14px; cursor:pointer; padding:4px 8px; border-radius:4px; }',
    '.cursor-hist-back:hover { background:#2a2d2e; color:#cccccc; }',
    '.cursor-hist-title { font-size:12px; font-weight:600; flex:1; color:#cccccc; }',
    '.cursor-hist-list { flex:1; overflow-y:auto; padding:4px; }',
    '.cursor-hist-item { padding:8px 12px; margin:2px 0; border-radius:4px; cursor:pointer; transition:background .1s; }',
    '.cursor-hist-item:hover { background:#2a2d2e; }',
    '.cursor-hist-item.active { background:rgba(86,156,214,0.1); }',
    '.cursor-hist-summary { font-size:12px; color:#cccccc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }',
    '.cursor-hist-meta { display:flex; align-items:center; justify-content:space-between; margin-top:2px; font-size:10px; color:#5a5a5a; }',
    '.cursor-hist-del { opacity:0; padding:2px 6px; border-radius:3px; border:none; background:transparent; color:#d44; font-size:10px; cursor:pointer; }',
    '.cursor-hist-item:hover .cursor-hist-del { opacity:1; }',
    '.cursor-hist-del:hover { background:rgba(221,68,68,0.15); }',
    '.cursor-hist-empty { text-align:center; padding:40px 20px; color:#5a5a5a; font-size:12px; }',

    // Workspace bar
    '.cursor-ws-bar { display:flex; align-items:center; padding:4px 12px; border-bottom:1px solid #2d2d2d; font-size:10px; color:#858585; gap:4px; flex-shrink:0; cursor:pointer; transition:background .12s; }',
    '.cursor-ws-bar:hover { background:#252526; }',
    '.cursor-ws-icon { opacity:.6; }',
    '.cursor-ws-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#cccccc; }',
    '.cursor-ws-arrow { opacity:.4; font-size:8px; }',

    // Workspace picker overlay
    '.cursor-ws-picker { position:absolute; top:0; left:0; right:0; bottom:0; background:#1e1e1e; z-index:12; display:none; flex-direction:column; }',
    '.cursor-ws-picker.show { display:flex; }',
    '.cursor-ws-picker-hd { display:flex; align-items:center; padding:8px 12px; border-bottom:1px solid #2d2d2d; gap:8px; }',
    '.cursor-ws-picker-back { border:none; background:none; color:#858585; font-size:14px; cursor:pointer; padding:4px 8px; border-radius:4px; }',
    '.cursor-ws-picker-back:hover { background:#2a2d2e; color:#cccccc; }',
    '.cursor-ws-picker-title { font-size:12px; font-weight:600; flex:1; color:#cccccc; }',
    '.cursor-ws-picker-search { display:flex; margin:8px 12px; gap:6px; }',
    '.cursor-ws-picker-input { flex:1; background:#252526; border:1px solid #3c3c3c; border-radius:4px; padding:6px 10px; color:#d4d4d4; font-size:12px; outline:none; font-family:inherit; min-width:0; }',
    '.cursor-ws-picker-input:focus { border-color:#569cd6; }',
    '.cursor-ws-picker-browse { padding:5px 10px; background:#2a2d2e; border:1px solid #3c3c3c; border-radius:4px; color:#cccccc; font-size:11px; cursor:pointer; white-space:nowrap; transition:background .12s; }',
    '.cursor-ws-picker-browse:hover { background:#37373d; border-color:#569cd6; }',
    '.cursor-ws-picker-list { flex:1; overflow-y:auto; padding:4px; }',
    '.cursor-ws-picker-item { padding:8px 12px; margin:2px 0; border-radius:4px; cursor:pointer; font-size:12px; color:#cccccc; transition:background .1s; display:flex; align-items:center; gap:8px; }',
    '.cursor-ws-picker-item:hover { background:#2a2d2e; }',
    '.cursor-ws-picker-item.active { background:rgba(86,156,214,0.1); color:#569cd6; }',
    '.cursor-ws-picker-item .ws-icon { font-size:14px; opacity:.6; }',
    '.cursor-ws-picker-item .ws-info { flex:1; overflow:hidden; }',
    '.cursor-ws-picker-item .ws-name { font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }',
    '.cursor-ws-picker-item .ws-path { font-size:10px; color:#5a5a5a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }',

    // Cursor icon injected into SeaTalk native quick-operation-menu
    '.quick-operation-icon.cursor-qo-icon { color:#a78bfa; transition:color .12s; }',
    '.quick-operation-icon.cursor-qo-icon:hover { color:#8b5cf6; }',

    // Text selection floating button
    '.cursor-sel-fab { position:fixed; z-index:2147483647; display:none; padding:4px 12px; border-radius:14px; background:rgba(167,139,250,0.92); color:#fff; border:none; cursor:pointer; font-size:11px; font-weight:600; box-shadow:0 2px 10px rgba(0,0,0,0.3); transition:transform .1s,background .1s,opacity .12s; opacity:0; pointer-events:none; white-space:nowrap; font-family:inherit; }',
    '.cursor-sel-fab.visible { display:block; opacity:1; pointer-events:auto; }',
    '.cursor-sel-fab:hover { background:rgba(139,92,246,0.95); transform:scale(1.05); }',
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
  var QUICK_ACTIONS = [
    { icon: '🔍', label: '查询数据', desc: 'SQL 查询 Presto/CK/Spark', text: '帮我写一个查询' },
    { icon: '📝', label: '代码审查', desc: '分析代码并提出建议', text: '请帮我审查一下代码' },
  ];

  function renderAllMessages(container) {
    container.innerHTML = '';
    if (messages.length === 0) {
      var h = '<div class="cursor-empty-wrap"><div class="cursor-empty">';
      h += '<div class="ce-icon">✦</div>';
      h += '<div class="ce-title">Cursor Agent</div>';
      h += '<div class="ce-sub">Ask anything, or try a quick action below</div>';
      h += '</div><div class="cursor-quick-actions">';
      for (var q = 0; q < QUICK_ACTIONS.length; q++) {
        var qa = QUICK_ACTIONS[q];
        h += '<button class="cursor-quick-btn" data-text="' + escapeHtml(qa.text) + '"><span class="cursor-quick-icon">' + qa.icon + '</span><div class="cursor-quick-text"><div class="title">' + escapeHtml(qa.label) + '</div><div class="desc">' + escapeHtml(qa.desc) + '</div></div></button>';
      }
      h += '</div></div>';
      container.innerHTML = h;
      return;
    }
    messages.forEach(function (m) {
      if (m.role === 'user') {
        var el = document.createElement('div');
        el.className = 'cursor-msg-user';
        el.innerHTML = '<div class="cursor-msg-user-label">You</div>' + escapeHtml(m.text);
        container.appendChild(el);
      } else {
        var turnContainer = document.createElement('div');
        turnContainer.className = 'cursor-agent-turn';
        if (m.thinking) {
          var view = sr.createView({ container: turnContainer, prefix: 'ca' });
          view.processChunk({ type: 'thinking_done', thinking: m.thinking });
          view.processChunk({ type: 'text', text: m.text });
          view.finalize();
        } else {
          var resultDiv = document.createElement('div');
          resultDiv.className = 'ca-result';
          resultDiv.innerHTML = sr.renderMarkdown(m.text);
          turnContainer.appendChild(resultDiv);
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
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function endTurn(stopReason) {
    if (turnView) turnView.finalize();
    if (turnFullText) {
      messages.push({ role: 'assistant', text: turnFullText, thinking: turnFullThinking || undefined });
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
    turnView = null; turnEl = null;
    setProcessingState(false);
    saveCurrentConv();
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ── Send ──
  function doSend() {
    if (!inputEl) return;
    var text = inputEl.value.trim();
    if (!text || isProcessing) return;
    inputEl.value = ''; inputEl.style.height = '36px';
    messages.push({ role: 'user', text: text });
    renderAllMessages(messagesEl);
    var typing = document.createElement('div');
    typing.className = 'ca-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    var payload = { type: 'user_message', text: text };
    if (contextData) { payload.context = contextData; contextData = null; if (ctxBar) ctxBar.classList.remove('show'); }
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

  function getContextMessages(bubble, count) {
    var row = bubble.closest(SEL_MSG_ITEM) || bubble.closest(SEL_THREAD_ITEM);
    if (!row) return [];
    var isThread = row.matches && row.matches(SEL_THREAD_ITEM);
    var containerEl = isThread ? row.closest('.thread-message-list') : document.querySelector('.message-list-container-for-drawer');
    if (!containerEl) return [];
    var sel = isThread ? SEL_THREAD_ITEM : SEL_MSG_ITEM;
    var allRows = Array.from(containerEl.querySelectorAll(sel));
    var idx = allRows.indexOf(row);
    if (idx < 0) return [];
    var start = Math.max(0, idx - count);
    var end = Math.min(allRows.length - 1, idx + count);
    var result = [];
    for (var i = start; i <= end; i++) {
      var r = allRows[i];
      var b = r.querySelector(SEL_MSG_BUBBLE) || r.querySelector(SEL_THREAD_BUBBLE) || r;
      var m = extractMsgFromBubble(b);
      if (m) result.push(m);
    }
    return result;
  }

  function setContextAndOpen(data) {
    if (!panelHandle) window.__agentToggle(true);
    contextData = data;
    var label = '引用: ' + (data.label || '消息') + ' (' + (data.messages ? data.messages.length : 1) + ' 条)';
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
    var msgs = getContextMessages(bubble, 5);
    var clicked = extractMsgFromBubble(bubble);
    var titleEl = document.querySelector('.thread-detail-page-title') || document.querySelector('.messages-message-detail-view-header .title');
    var chatName = titleEl ? titleEl.textContent.trim().split(' (')[0].split(' | ')[0] : 'Chat';
    setContextAndOpen({
      label: chatName,
      sessionName: chatName,
      messages: msgs,
      focusMessage: clicked
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

  // Text selection → floating "Ask Cursor" button
  var selFab = document.createElement('button');
  selFab.className = 'cursor-sel-fab';
  selFab.textContent = '✦ Ask Cursor';
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
    var titleEl = document.querySelector('.messages-message-detail-view-header .title');
    var chatName = titleEl ? titleEl.textContent.trim().split(' (')[0].split(' | ')[0] : 'Chat';
    setContextAndOpen({
      label: chatName + ' (选中文字)',
      sessionName: chatName,
      messages: [{ sender: '选中内容', text: text }]
    });
  });

  // ── History ──
  function renderHistList(listEl) {
    if (conversations.length === 0) { listEl.innerHTML = '<div class="cursor-hist-empty">No previous chats</div>'; return; }
    var h = '';
    for (var i = conversations.length - 1; i >= 0; i--) {
      var c = conversations[i], d = new Date(c.ts);
      var ts = d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      h += '<div class="cursor-hist-item' + (i === currentIdx ? ' active' : '') + '" data-i="' + i + '"><div class="cursor-hist-summary">' + escapeHtml(c.summary || '(empty)') + '</div><div class="cursor-hist-meta"><span>' + ts + ' · ' + c.messages.length + '</span><button class="cursor-hist-del" data-d="' + i + '">Delete</button></div></div>';
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
        turnView.processChunk({ type: 'tool_call', toolCall: { id: d.toolCallId, name: d.title || 'Tool', tool: { action_description: d.kind || '' }, arguments: d.input || '' } });
        if (turnEl) { var r = turnEl.querySelector('.ca-result'); if (r) turnEl.appendChild(r); }
        if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      } else if (d.type === 'tool_update') {
        if (!turnView) return;
        if (d.status === 'completed') {
          turnView.processChunk({ type: 'tool_call', toolCall: { id: d.toolCallId, name: d.title || '', result: d.output || 'done' } });
        } else if (d.status === 'in_progress') {
          turnView.processChunk({ type: 'tool_call', toolCall: { id: d.toolCallId, name: d.title || '' } });
        }
        if (turnEl) { var r2 = turnEl.querySelector('.ca-result'); if (r2) turnEl.appendChild(r2); }
      } else if (d.type === 'turn_end') {
        if (!turnView && !turnEl) return;
        endTurn(d.stopReason);
      } else if (d.type === 'status') {
        cachedStatus = { connected: !!d.connected, text: d.text || (d.connected ? 'Connected' : 'Disconnected') };
        if (statusDot) statusDot.className = 'cursor-status-dot ' + (cachedStatus.connected ? 'on' : 'off');
        if (statusText) statusText.textContent = cachedStatus.text;
        var rcBtn = panelHandle && panelHandle.el ? panelHandle.el.querySelector('.cursor-status-reconnect') : null;
        if (rcBtn) {
          if (cachedStatus.connected) { rcBtn.classList.remove('show'); rcBtn.textContent = '重连'; }
          else { rcBtn.classList.add('show'); rcBtn.textContent = '重连'; }
        }
        updateSidebarBtnStatus();
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
        cachedWorkspace = d.path || '';
        if (d.workspaces) cachedWorkspaceList = d.workspaces;
        updateWsLabel();
      } else if (d.type === 'folder_selected') {
        var fp = d.path || '';
        if (fp && fp !== cachedWorkspace) {
          cachedWorkspace = fp;
          updateWsLabel();
          saveCurrentConv(); currentIdx = -1; messages = []; turnView = null;
          renderAllMessages(messagesEl);
          if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'set_workspace', path: fp }));
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

  // ── Show panel ──
  function showPanel() {
    if (panelHandle) { try { panelHandle.close(); } catch (_) {} }

    panelHandle = UI.createPanel({
      id: 'cursor-panel',
      title: 'CURSOR',
      width: 440,
      height: 560,
      sizeKey: 'cursorPanelSize',
      closeOnOutsideClick: false,
      dragExclude: '.hp-panel-close, .cursor-msgs, .cursor-input-wrap, .cursor-ws-bar, .cursor-ws-picker-search, .cursor-ws-picker-list, .cursor-model-badge, .cursor-model-dd, .cursor-status-bar',
      content: '<div class="cursor-msgs"></div>',
      onMount: function (h) {
        messagesEl = h.body.querySelector('.cursor-msgs');
        renderAllMessages(messagesEl);
      },
      onClose: function () {
        panelHandle = null; messagesEl = null; modelBadgeEl = null; modelDropdown = null;
        statusDot = null; statusText = null; statusModelEl = null;
        wsLabel = null; modeTabEls = [];
        var btn = document.getElementById('cursor-sidebar-btn');
        if (btn) btn.classList.remove('active');
      }
    });

    var resizeHandle = panelHandle.el.querySelector('.hp-panel-resize');

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
    topbar.innerHTML = tabsHtml +
      '<div class="cursor-topbar-actions">' +
      '<button class="cursor-topbar-btn" data-act="hist" title="History">📋</button>' +
      '<button class="cursor-topbar-btn" data-act="new" title="New chat">＋</button>' +
      '</div>';
    panelHandle.el.insertBefore(topbar, resizeHandle);

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

    // Workspace bar
    var wsBar = document.createElement('div');
    wsBar.className = 'cursor-ws-bar';
    wsBar.innerHTML = '<span class="cursor-ws-icon">📁</span><span class="cursor-ws-name">' + escapeHtml(wsDisplayName(cachedWorkspace)) + '</span><span class="cursor-ws-arrow">▼</span>';
    wsLabel = wsBar.querySelector('.cursor-ws-name');
    panelHandle.el.insertBefore(wsBar, resizeHandle);

    // Workspace picker overlay
    var wsPicker = document.createElement('div');
    wsPicker.className = 'cursor-ws-picker';
    wsPicker.innerHTML = '<div class="cursor-ws-picker-hd"><button class="cursor-ws-picker-back">←</button><span class="cursor-ws-picker-title">切换工作区</span></div><div class="cursor-ws-picker-search"><input class="cursor-ws-picker-input" placeholder="搜索工作区..." /><button class="cursor-ws-picker-browse">浏览...</button></div><div class="cursor-ws-picker-list"></div>';
    panelHandle.body.appendChild(wsPicker);
    var wsPickerList = wsPicker.querySelector('.cursor-ws-picker-list');
    var wsPickerInput = wsPicker.querySelector('.cursor-ws-picker-input');

    function renderWsList(filter) {
      var f = (filter || '').toLowerCase();
      var items = cachedWorkspaceList.filter(function (w) {
        return !f || w.name.toLowerCase().indexOf(f) >= 0 || w.path.toLowerCase().indexOf(f) >= 0;
      });
      if (items.length === 0 && f) {
        wsPickerList.innerHTML = '<div class="cursor-ws-picker-item" data-path="' + escapeHtml(f) + '"><span class="ws-icon">📂</span><div class="ws-info"><div class="ws-name">Use: ' + escapeHtml(f) + '</div><div class="ws-path">Press Enter or click to use this path</div></div></div>';
        return;
      }
      var html = '';
      for (var i = 0; i < items.length; i++) {
        var w = items[i];
        var isCurrent = w.path === cachedWorkspace;
        var act = isCurrent ? ' active' : '';
        var icon = isCurrent ? '✓' : '📁';
        html += '<div class="cursor-ws-picker-item' + act + '" data-path="' + escapeHtml(w.path) + '"><span class="ws-icon">' + icon + '</span><div class="ws-info"><div class="ws-name">' + escapeHtml(w.name) + '</div><div class="ws-path">' + escapeHtml(w.path) + '</div></div></div>';
      }
      wsPickerList.innerHTML = html || '<div style="text-align:center;padding:20px;color:#5a5a5a;font-size:12px">No workspaces found</div>';
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

    function selectWorkspace(p) {
      cachedWorkspace = p;
      updateWsLabel();
      wsPicker.classList.remove('show');
      saveCurrentConv(); currentIdx = -1; messages = []; turnView = null;
      renderAllMessages(messagesEl);
      if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'set_workspace', path: p }));
    }

    // Context bar
    ctxBar = document.createElement('div');
    ctxBar.className = 'cursor-ctx';
    ctxBar.innerHTML = '<span class="cursor-ctx-label"></span><span class="rm">✕</span>';
    ctxLabel = ctxBar.querySelector('.cursor-ctx-label');
    ctxBar.querySelector('.rm').addEventListener('click', function () { contextData = null; ctxBar.classList.remove('show'); });
    panelHandle.el.insertBefore(ctxBar, resizeHandle);

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
      }
    });

    // ── Input area ──
    var inputArea = document.createElement('div');
    inputArea.className = 'cursor-input-area';
    inputArea.innerHTML =
      '<div class="cursor-input-meta"><span class="cursor-model-badge"><span class="dot"></span>Model</span><div class="cursor-model-dd"></div></div>' +
      '<div class="cursor-input-wrap">' +
      '<textarea class="cursor-input" placeholder="Ask anything..." rows="1"></textarea>' +
      '<button class="cursor-sendbtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>' +
      '<button class="cursor-stopbtn" style="display:none"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>' +
      '</div>';
    panelHandle.el.insertBefore(inputArea, resizeHandle);

    inputEl = inputArea.querySelector('.cursor-input');
    sendBtn = inputArea.querySelector('.cursor-sendbtn');
    stopBtn = inputArea.querySelector('.cursor-stopbtn');
    modelBadgeEl = inputArea.querySelector('.cursor-model-badge');
    modelDropdown = inputArea.querySelector('.cursor-model-dd');

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
    messagesEl.addEventListener('click', function (e) {
      var qb = e.target.closest('.cursor-quick-btn');
      if (qb && qb.dataset.text) { inputEl.value = qb.dataset.text; doSend(); }
    });
    stopBtn.addEventListener('click', function () {
      if (typeof window.__agentSend === 'function') window.__agentSend(JSON.stringify({ type: 'cancel' }));
      setProcessingState(false);
    });

    // Status bar
    var statusBar = document.createElement('div');
    statusBar.className = 'cursor-status-bar';
    statusBar.innerHTML =
      '<span class="cursor-status-dot none"></span>' +
      '<span class="cursor-status-text">...</span>' +
      '<button class="cursor-status-reconnect">重连</button>' +
      '<span class="cursor-status-model" style="flex:1;text-align:right"></span>' +
      '<span class="cursor-settings-wrap">' +
        '<button class="cursor-topbar-btn cursor-settings-btn" title="Settings" style="font-size:12px;padding:0 4px;">⚙</button>' +
        '<div class="cursor-settings-dd">' +
          '<div class="cursor-settings-dd-item" data-action="reconnect_acp"><span class="dd-icon">↻</span>重连 Agent</div>' +
          '<div class="cursor-settings-dd-item" data-action="reinject_ui"><span class="dd-icon">↻</span>重新注入 UI</div>' +
          '<div class="cursor-settings-dd-item" data-action="restart_agent"><span class="dd-icon">⟳</span>重启 Agent</div>' +
          '<div class="cursor-settings-dd-sep"></div>' +
          '<div class="cursor-settings-dd-item" data-action="show_logs"><span class="dd-icon">📋</span>查看后端日志</div>' +
          '<div class="cursor-settings-dd-item" data-action="show_diagnostics"><span class="dd-icon">ℹ</span>诊断信息</div>' +
        '</div>' +
      '</span>';
    panelHandle.el.insertBefore(statusBar, resizeHandle);
    statusDot = statusBar.querySelector('.cursor-status-dot');
    statusText = statusBar.querySelector('.cursor-status-text');
    statusModelEl = statusBar.querySelector('.cursor-status-model');
    var reconnectBtn = statusBar.querySelector('.cursor-status-reconnect');
    var settingsBtn = statusBar.querySelector('.cursor-settings-btn');
    var settingsDd = statusBar.querySelector('.cursor-settings-dd');

    statusDot.className = 'cursor-status-dot ' + (cachedStatus.connected ? 'on' : 'off');
    statusText.textContent = cachedStatus.text;
    if (!cachedStatus.connected) reconnectBtn.classList.add('show');
    updateStatusModel();

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
  console.log('[cursor-acp] panel loaded (Cursor-native style)');
})();

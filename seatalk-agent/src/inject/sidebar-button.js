// Sidebar toggle button — injected into .sidebar-sidebar
(function () {
  if (document.getElementById('agent-sidebar-btn')) return;

  var SIDEBAR = document.querySelector('.sidebar-sidebar');
  if (!SIDEBAR) return;

  var style = document.createElement('style');
  style.textContent = [
    '#agent-sidebar-btn {',
    '  width: 40px; height: 40px; margin: 4px auto;',
    '  display: flex; align-items: center; justify-content: center;',
    '  border-radius: 10px; cursor: pointer;',
    '  background: transparent; border: none; padding: 0;',
    '  -webkit-app-region: no-drag;',
    '  transition: background 0.15s;',
    '}',
    '#agent-sidebar-btn:hover { background: rgba(255,255,255,0.08); }',
    '#agent-sidebar-btn.active { background: rgba(77,150,255,0.18); }',
    '#agent-sidebar-btn svg { width: 22px; height: 22px; }',
  ].join('\n');
  document.head.appendChild(style);

  var btn = document.createElement('div');
  btn.id = 'agent-sidebar-btn';
  btn.title = 'Cursor';
  // Cursor-style sparkle icon
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/>' +
    '<path d="M19 3L20 6L23 7L20 8L19 11L18 8L15 7L18 6L19 3Z" opacity="0.5"/>' +
    '</svg>';

  btn.addEventListener('click', function () {
    if (typeof window.__agentToggle === 'function') {
      window.__agentToggle();
    }
    var panel = document.getElementById('agent-panel');
    btn.classList.toggle('active', panel && panel.classList.contains('open'));
  });

  // Insert before the settings icon area (near bottom)
  var settingsIcon = SIDEBAR.querySelector('.sprite_toolbar_ic_settings');
  if (settingsIcon && settingsIcon.parentNode) {
    SIDEBAR.insertBefore(btn, settingsIcon.parentNode);
  } else {
    SIDEBAR.appendChild(btn);
  }
})();

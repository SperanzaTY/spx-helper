// SeaTalk programmatic send — extract React Fiber actions & expose __seatalkSend()
// Based on seatalk-enhance's proven approach, adapted for seatalk-agent.
(function () {
  var SEND_SCRIPT_VERSION = 9;
  if (window.__seatalkSendVersion >= SEND_SCRIPT_VERSION) return;
  window.__seatalkSendVersion = SEND_SCRIPT_VERSION;

  // ── protocolJson builders ──

  var STYLE = { PLAIN: 0, BOLD: 1, ITALIC: 2, CODE: 16 };
  var NODE = { DOC: 10001, OL: 10002, UL: 10003, PARA: 10004, CODE_BLOCK: 10005, TEXT: 20001 };

  function parseInline(text) {
    var nodes = [];
    var re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    var last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) nodes.push({ t: NODE.TEXT, tx: text.slice(last, m.index), s: STYLE.PLAIN });
      if (m[2]) nodes.push({ t: NODE.TEXT, tx: m[2], s: STYLE.BOLD | STYLE.ITALIC });
      else if (m[3]) nodes.push({ t: NODE.TEXT, tx: m[3], s: STYLE.BOLD });
      else if (m[4]) nodes.push({ t: NODE.TEXT, tx: m[4], s: STYLE.ITALIC });
      else if (m[5]) nodes.push({ t: NODE.TEXT, tx: m[5], s: STYLE.CODE });
      last = re.lastIndex;
    }
    if (last < text.length) nodes.push({ t: NODE.TEXT, tx: text.slice(last), s: STYLE.PLAIN });
    if (nodes.length === 0) nodes.push({ t: NODE.TEXT, tx: text, s: STYLE.PLAIN });
    return nodes;
  }

  function textToProtocolJson(text) {
    var paragraphs = text.split('\n').map(function (line) {
      return { t: NODE.PARA, e: [{ t: NODE.TEXT, tx: line, s: STYLE.PLAIN }] };
    });
    return { t: NODE.DOC, e: paragraphs };
  }

  function markdownToProtocolJson(md) {
    var lines = md.split('\n');
    var elements = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (/^```/.test(line)) {
        var codeLines = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) codeLines.push(lines[i++]);
        if (i < lines.length) i++;
        elements.push({ t: NODE.CODE_BLOCK, e: [{ t: NODE.TEXT, tx: codeLines.join('\n'), s: STYLE.PLAIN }] });
        continue;
      }
      if (line.trim() === '') {
        elements.push({ t: NODE.PARA, e: [{ t: NODE.TEXT, tx: '', s: STYLE.PLAIN }] });
        i++; continue;
      }
      var ulMatch = line.match(/^[-*]\s+(.*)/);
      if (ulMatch) { elements.push({ t: NODE.UL, e: parseInline(ulMatch[1]) }); i++; continue; }
      var olMatch = line.match(/^\d+\.\s+(.*)/);
      if (olMatch) { elements.push({ t: NODE.OL, e: parseInline(olMatch[1]) }); i++; continue; }
      var hMatch = line.match(/^#{1,6}\s+(.*)/);
      if (hMatch) { elements.push({ t: NODE.PARA, e: [{ t: NODE.TEXT, tx: hMatch[1], s: STYLE.BOLD }] }); i++; continue; }
      elements.push({ t: NODE.PARA, e: parseInline(line) });
      i++;
    }
    return { t: NODE.DOC, e: elements };
  }

  function markdownToPlainText(md) {
    return md
      .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^[-*]\s+/gm, '• ');
  }

  // ── React Fiber actions extraction ──

  var cachedActions = null;
  /** 与 cachedActions 对应的会话，如 "group-123"；与当前选中不一致时必须丢弃缓存 */
  var cachedActionsSessionKey = null;

  function sessionKeyNormalized(type, id) {
    return String(type).toLowerCase() + '-' + id;
  }

  function extractActions() {
    var el = document.querySelector('.ProseMirror.seatalk-editor-content');
    if (!el || !el.parentElement) return null;
    var fKey = Object.keys(el.parentElement).find(function (k) {
      return k.startsWith('__reactFiber');
    });
    if (!fKey) return null;
    var f = el.parentElement[fKey];
    for (var d = 0; d < 6; d++) {
      if (!f.return) return null;
      f = f.return;
    }
    var inst = f.stateNode;
    if (!inst || !inst.props || !inst.props.actions) return null;
    var a = inst.props.actions;
    if (typeof a.logicSendMessage !== 'function') return null;
    return a;
  }

  function getSessionName(type, id) {
    try {
      var s = window.store.getState().contact;
      if (type === 'group') return (s.groupInfo[id] || {}).name || '';
      return (s.userInfo[id] || {}).name || '';
    } catch (_) {}
    return '';
  }

  function ensureActions(sessType, sessIdNum) {
    var idStr = String(sessIdNum);
    var wantKey = sessionKeyNormalized(sessType, sessIdNum);
    var selectedOk = false;
    try {
      var sel = window.store.getState().messages.selectedSession;
      if (sel && String(sel.id) === idStr) {
        selectedOk = sessionKeyNormalized(sel.type, sel.id) === wantKey;
      }
    } catch (_) { selectedOk = false; }

    if (cachedActions && cachedActionsSessionKey === wantKey && selectedOk) {
      return Promise.resolve(cachedActions);
    }

    cachedActions = null;
    cachedActionsSessionKey = null;

    return navigateToSession(idStr).then(function () {
      return new Promise(function (resolve, reject) {
        var attempts = 0;
        var timer = setInterval(function () {
          var a = extractActions();
          if (a) {
            cachedActions = a;
            cachedActionsSessionKey = wantKey;
            clearInterval(timer);
            resolve(a);
            return;
          }
          if (++attempts >= 20) {
            clearInterval(timer);
            reject(new Error('editor did not appear after selecting session'));
          }
        }, 200);
      });
    });
  }

  function navigateToSession(sessionId) {
    var item = document.querySelector(
      '.messages-chat-session-list-item[data-id="' + sessionId + '"]'
    );
    if (item) {
      item.click();
      return Promise.resolve();
    }
    // 列表里暂时看不到目标时，尝试从当前已打开的编辑器拿到 moveToTop（不依赖过期的 cachedActions）
    if (!cachedActions || typeof cachedActions.actionMoveChatSessionToTop !== 'function') {
      var boot = extractActions();
      if (boot && typeof boot.actionMoveChatSessionToTop === 'function') cachedActions = boot;
    }
    // Session not visible in virtualized list — use actionMoveChatSessionToTop
    // to pull it into the rendered area, then click it.
    if (cachedActions && typeof cachedActions.actionMoveChatSessionToTop === 'function') {
      try {
        var s = window.store.getState();
        var sl = (s.messages && s.messages.sessionList) || [];
        var sessions =
          sl.length > 0 ? sl : (s.messages && s.messages.sessions) || [];
        var sid = parseInt(sessionId, 10);
        var sess = null;
        for (var i = 0; i < sessions.length; i++) {
          if (sessions[i] && sessions[i].id === sid) { sess = sessions[i]; break; }
        }
        if (sess) {
          cachedActions.actionMoveChatSessionToTop({ session: { type: sess.type, id: sid } });
          return new Promise(function (resolve, reject) {
            var att = 0;
            var t = setInterval(function () {
              var el = document.querySelector('.messages-chat-session-list-item[data-id="' + sessionId + '"]');
              if (el) { clearInterval(t); el.click(); resolve(); return; }
              if (++att >= 15) { clearInterval(t); reject(new Error('session "' + sessionId + '" did not appear in list after moveToTop')); }
            }, 200);
          });
        }
      } catch (_) {}
    }
    return Promise.reject(new Error('session "' + sessionId + '" not in chat list. Use add_seatalk_contact first for new contacts.'));
  }

  function tryCache() {
    if (cachedActions) return;
    var a = extractActions();
    if (a) {
      cachedActions = a;
      try {
        var sel = window.store.getState().messages.selectedSession;
        cachedActionsSessionKey = sel ? sessionKeyNormalized(sel.type, sel.id) : null;
      } catch (_) { cachedActionsSessionKey = null; }
      console.log('[seatalk-send] actions cached');
    }
  }

  // ── Main API ──

  var sendLog = [];
  var RATE_LIMIT_PER_MIN = 10;

  window.__seatalkSendLog = function () { return sendLog.slice(-50); };

  /**
   * opts.confirmed must be true — only main.ts bridge handler sets this
   * after user confirms in the panel dialog (or grant mode is on).
   */
  window.__seatalkSend = function (opts) {
    if (!opts || !opts.session || !opts.text) {
      return Promise.reject(new Error('missing session or text'));
    }
    if (!opts.confirmed) {
      return Promise.reject(new Error('DENIED: opts.confirmed must be true. Send via seatalk-agent bridge.'));
    }
    var match = opts.session.match(/^(group|buddy)-(\d+)$/);
    if (!match) return Promise.reject(new Error('invalid session format'));

    var now = Date.now();
    var recentCount = sendLog.filter(function (e) { return now - e.ts < 60000; }).length;
    if (recentCount >= RATE_LIMIT_PER_MIN) {
      return Promise.reject(new Error('rate limit: max ' + RATE_LIMIT_PER_MIN + ' messages per minute'));
    }

    var type = match[1];
    var id = parseInt(match[2], 10);
    var text = opts.text;
    var format = opts.format || 'text';

    var displayText = text;
    var protocolJson;
    if (format === 'markdown') {
      displayText = markdownToPlainText(text);
      protocolJson = markdownToProtocolJson(text);
    } else {
      protocolJson = textToProtocolJson(text);
    }

    var rootMid = opts.rootMid || undefined;

    return ensureActions(type, id).then(function (actions) {
      var session = { type: type, id: id };
      actions.actionChangeDraft({
        session: session,
        rootMid: rootMid,
        text: displayText,
        protocolJson: protocolJson,
        mentions: [],
        timeStamp: Math.floor(Date.now() / 1000),
        clearFormattingCount: 0
      });
      actions.logicSendMessage({
        data: { messageType: 'text', session: session, rootMid: rootMid }
      });
      sendLog.push({ ts: Date.now(), session: opts.session, len: opts.text.length, rootMid: rootMid });
      if (sendLog.length > 100) sendLog = sendLog.slice(-50);
      return { ok: true, session: opts.session, rootMid: rootMid };
    });
  };

  window.__seatalkSendInfo = function () {
    var result = { currentSession: null, sessions: [] };
    try {
      var s = window.store.getState();
      var sel = s.messages.selectedSession;
      if (sel) {
        var selType = sel.type === 'group' ? 'group' : 'buddy';
        result.currentSession = selType + '-' + sel.id;
      }
      var sessions = s.messages.sessions || [];
      var info = s.contact.userInfo || {};
      var groups = s.contact.groupInfo || {};
      for (var i = 0; i < Math.min(sessions.length, 30); i++) {
        var sess = sessions[i];
        var name = '';
        if (sess.type === 'group') name = (groups[sess.id] || {}).name || 'group-' + sess.id;
        else name = (info[sess.id] || {}).name || 'user-' + sess.id;
        result.sessions.push({ id: sess.type + '-' + sess.id, name: name });
      }
    } catch (_) {}
    return result;
  };

  // ── ContactService extraction ──

  var contactServicePromise = null;

  function getContactService() {
    if (contactServicePromise) return contactServicePromise;
    contactServicePromise = new Promise(function (resolve, reject) {
      var resources = performance.getEntriesByType('resource');
      var chunkUrl = null;
      for (var i = 0; i < resources.length; i++) {
        if (resources[i].name.indexOf('chunk-service-') >= 0 && resources[i].name.indexOf('.js') >= 0) {
          chunkUrl = resources[i].name;
          break;
        }
      }
      if (!chunkUrl) { contactServicePromise = null; reject(new Error('chunk-service not found')); return; }
      import(chunkUrl).then(function (mod) {
        var keys = Object.keys(mod);
        for (var j = 0; j < keys.length; j++) {
          var v = mod[keys[j]];
          if (v && typeof v === 'object' && typeof v.sendContactRequest === 'function') {
            window.__contactService = v;
            resolve(v);
            return;
          }
        }
        contactServicePromise = null;
        reject(new Error('ContactService not found in chunk-service exports'));
      }).catch(function (e) { contactServicePromise = null; reject(e); });
    });
    return contactServicePromise;
  }

  window.__seatalkAddContact = function (opts) {
    if (!opts || !opts.userId) return Promise.reject(new Error('missing userId'));
    var userId = Number(opts.userId);
    if (isNaN(userId)) return Promise.reject(new Error('invalid userId'));

    var bl = (window.store.getState().contact.buddyList || []);
    if (bl.some(function (b) { return b.id === userId; })) {
      return Promise.resolve({ ok: true, userId: userId, becameContact: true, alreadyContact: true });
    }

    var name = opts.name || '';
    return getContactService().then(function (cs) {
      return cs.sendContactRequest(userId, { type: 1 }, name);
    }).then(function (result) {
      return { ok: true, userId: userId, becameContact: result.becameContact };
    });
  };

  // ── Recall API (via chunk-service putRecallMessages) ──

  var recallServicePromise = null;

  function getRecallService() {
    if (recallServicePromise) return recallServicePromise;
    recallServicePromise = new Promise(function (resolve, reject) {
      var resources = performance.getEntriesByType('resource');
      var chunkUrl = null;
      for (var i = 0; i < resources.length; i++) {
        if (resources[i].name.indexOf('chunk-service-') >= 0 && resources[i].name.indexOf('.js') >= 0) {
          chunkUrl = resources[i].name; break;
        }
      }
      if (!chunkUrl) { recallServicePromise = null; reject(new Error('chunk-service not found')); return; }
      import(chunkUrl).then(function (mod) {
        var keys = Object.keys(mod);
        for (var j = 0; j < keys.length; j++) {
          var v = mod[keys[j]];
          if (v && typeof v === 'object' && typeof v.putRecallMessages === 'function') {
            resolve(v); return;
          }
        }
        recallServicePromise = null;
        reject(new Error('putRecallMessages not found in chunk-service'));
      }).catch(function (e) { recallServicePromise = null; reject(e); });
    });
    return recallServicePromise;
  }

  window.__seatalkRecall = function (opts) {
    if (!opts || !opts.session || !opts.mid) {
      return Promise.reject(new Error('missing session or mid'));
    }
    if (!opts.confirmed) {
      return Promise.reject(new Error('DENIED: opts.confirmed must be true. Send via seatalk-agent bridge.'));
    }
    var match = opts.session.match(/^(group|buddy)-(\d+)$/);
    if (!match) return Promise.reject(new Error('invalid session format'));

    var type = match[1];
    var id = parseInt(match[2], 10);
    var session = { type: type, id: id };
    var mid = String(opts.mid);

    return getRecallService().then(function (svc) {
      return svc.putRecallMessages(session, [mid]);
    }).then(function () {
      return { ok: true, session: opts.session, mid: mid };
    });
  };

  // ── Probe API (for debugging) ──

  window.__seatalkProbe = function () {
    var result = { actions: [], storeSlices: [] };
    try {
      var a = cachedActions || extractActions();
      if (a) {
        result.actions = Object.keys(a).filter(function (k) { return typeof a[k] === 'function'; });
      }
    } catch (_) {}
    try {
      var s = window.store.getState();
      result.storeSlices = Object.keys(s);
    } catch (_) {}
    return result;
  };

  if (window.store) tryCache();
  var observer = new MutationObserver(function () {
    if (cachedActions) { observer.disconnect(); return; }
    tryCache();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  getContactService().catch(function () {});
  getRecallService().catch(function () {});

  console.log('[seatalk-send] ready v7');
})();

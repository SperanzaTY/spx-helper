// SeaTalk Watch Mode — Redux store.subscribe based message listener
(function () {
  var WATCH_VERSION = 5;
  if (window.__seatalkWatchVersion >= WATCH_VERSION) return;
  if (window.__seatalkWatch && typeof window.__seatalkWatch.stop === 'function') {
    try { window.__seatalkWatch.stop(); } catch (_) {}
  }
  window.__seatalkWatchVersion = WATCH_VERSION;

  var _active = false;
  var _unsubscribe = null;
  var _debounceTimer = null;
  var _config = { sessions: 'all', mentionsOnly: false, keywords: [] };
  var _lastMaxTs = 0;
  var _seenMids = {};
  var _startTime = 0;
  var _msgCount = 0;
  var _sentTexts = {};
  var _senderProbeCount = 0;
  var _senderProbeMax = 5;

  function getMyUid() {
    try {
      var s = window.store.getState();
      return (s.login && (s.login.userid || (s.login.userInfo && s.login.userInfo.id))) || null;
    } catch (_) { return null; }
  }

  function getSessionName(key) {
    try {
      var s = window.store.getState().contact;
      var parts = key.match(/^(group|buddy)-(\d+)/);
      if (!parts) return key;
      var type = parts[1], id = parseInt(parts[2], 10);
      if (type === 'group') return (s.groupInfo[id] || {}).name || key;
      return (s.userInfo[id] || {}).name || key;
    } catch (_) { return key; }
  }

  function getSenderInfo(senderId) {
    try {
      var ui = window.store.getState().contact.userInfo || {};
      return ui[senderId] || null;
    } catch (_) { return null; }
  }

  function getSenderName(senderId) {
    var u = getSenderInfo(senderId);
    return u ? (u.name || 'user-' + senderId) : 'user-' + senderId;
  }

  function extractSessionKey(msgKey) {
    var m = msgKey.match(/^(group|buddy)-(\d+)/);
    return m ? m[1] + '-' + m[2] : null;
  }

  function matchesConfig(msg, sessionKey, myUid) {
    if (_config.sessions !== 'all') {
      if (_config.sessions === 'mentions') {
        if (!myUid) return false;
        var content = (msg.content && (msg.content.text || JSON.stringify(msg.content))) || '';
        if (content.indexOf(String(myUid)) < 0) return false;
      } else if (Array.isArray(_config.sessions)) {
        if (_config.sessions.indexOf(sessionKey) < 0) return false;
      }
    }

    if (_config.mentionsOnly && myUid) {
      var ct = (msg.content && (msg.content.text || JSON.stringify(msg.content))) || '';
      if (ct.indexOf(String(myUid)) < 0) return false;
    }

    if (_config.keywords && _config.keywords.length > 0) {
      var text = (msg.content && msg.content.text) || '';
      var lowerText = text.toLowerCase();
      var matched = false;
      for (var i = 0; i < _config.keywords.length; i++) {
        if (lowerText.indexOf(_config.keywords[i].toLowerCase()) >= 0) { matched = true; break; }
      }
      if (!matched) return false;
    }

    return true;
  }

  function findMessageStore(state) {
    var msgSlice = state.messages;
    if (!msgSlice) return {};
    // Try common shapes: messages.messages, messages.data, or messages itself as flat map
    if (msgSlice.messages && typeof msgSlice.messages === 'object') return msgSlice.messages;
    if (msgSlice.data && typeof msgSlice.data === 'object') return msgSlice.data;
    // Fallback: try iterating the slice directly (skip non-object values)
    if (typeof msgSlice === 'object') {
      var hasMsg = false;
      for (var k in msgSlice) {
        var v = msgSlice[k];
        if (v && typeof v === 'object' && (v.mid || v.timeStamp || v.timestamp)) { hasMsg = true; break; }
      }
      if (hasMsg) return msgSlice;
    }
    return {};
  }

  var _probeLogged = false;

  function scanMessages() {
    if (!_active || !window.store) return;
    try {
      var state = window.store.getState();

      if (!_probeLogged) {
        _probeLogged = true;
        var msgSlice = state.messages;
        if (msgSlice) {
          var topKeys = Object.keys(msgSlice).slice(0, 20);
          console.log('[seatalk-watch] messages slice keys:', topKeys.join(', '));
          for (var pk = 0; pk < Math.min(3, topKeys.length); pk++) {
            var pv = msgSlice[topKeys[pk]];
            console.log('[seatalk-watch]   ' + topKeys[pk] + ':', typeof pv, pv && typeof pv === 'object' ? Object.keys(pv).slice(0, 10).join(',') : String(pv).substring(0, 100));
          }
        } else {
          console.log('[seatalk-watch] no messages slice in store. Slices:', Object.keys(state).join(', '));
        }
      }

      var msgMap = findMessageStore(state);
      var myUid = getMyUid();
      var newMsgs = [];

      for (var key in msgMap) {
        var m = msgMap[key];
        if (!m || typeof m !== 'object') continue;
        var ts = m.timeStamp || m.timestamp || m.ts || 0;
        if (!ts) continue;
        if (ts <= _lastMaxTs) continue;

        var mid = m.mid || m.id || key.split('-').pop();
        if (_seenMids[mid]) continue;

        var sessionKey = extractSessionKey(key);
        if (!sessionKey) {
          sessionKey = m.session || m.sessionKey || null;
        }
        if (!sessionKey) continue;

        var senderId = m.senderId || m.sender_id || m.from;
        var isSelfSession = myUid && sessionKey === 'buddy-' + myUid;
        if (myUid && senderId == myUid && !isSelfSession) continue;

        if (!matchesConfig(m, sessionKey, myUid)) continue;

        _seenMids[mid] = 1;
        var text = '';
        if (m.content) {
          if (typeof m.content === 'string') text = m.content;
          else if (typeof m.content.text === 'string') text = m.content.text;
          else if (m.content.elements) {
            var parts = [];
            for (var j = 0; j < m.content.elements.length; j++) {
              var el = m.content.elements[j];
              if (el.text) parts.push(el.text);
            }
            text = parts.join('');
          }
        } else if (m.text) {
          text = m.text;
        }

        // Skip echoed self-sent messages (our own replies in self-session)
        if (isSelfSession && _sentTexts[text.substring(0, 500)]) {
          _seenMids[mid] = 1;
          continue;
        }
        if (isSelfSession && text.substring(0, 12) === 'Remote Agent') {
          _seenMids[mid] = 1;
          continue;
        }

        var isMention = myUid && text.indexOf(String(myUid)) >= 0;

        if (_senderProbeCount < _senderProbeMax) {
          _senderProbeCount++;
          var sInfo = getSenderInfo(senderId);
          console.log('[seatalk-watch] sender probe #' + _senderProbeCount + ':', senderId,
            sInfo ? JSON.stringify(Object.keys(sInfo)) : '(not in userInfo)',
            sInfo ? JSON.stringify(sInfo) : '');
        }

        newMsgs.push({
          mid: mid,
          session: sessionKey,
          sessionName: getSessionName(sessionKey),
          sender: getSenderName(senderId),
          senderId: senderId,
          text: text.substring(0, 500),
          ts: ts,
          tag: m.tag || m.type || 'text',
          isMention: isMention,
          isSelfCommand: !!isSelfSession,
          rootMid: m.rootMid || null
        });
      }

      if (newMsgs.length > 0) {
        newMsgs.sort(function (a, b) { return a.ts - b.ts; });
        var maxTs = newMsgs[newMsgs.length - 1].ts;
        if (maxTs > _lastMaxTs) _lastMaxTs = maxTs;
        _msgCount += newMsgs.length;

        if (typeof window.__agentSend === 'function') {
          window.__agentSend(JSON.stringify({
            type: 'watch_new_messages',
            messages: newMsgs
          }));
        }
      }

      // Prevent seenMids from growing unbounded
      var seenKeys = Object.keys(_seenMids);
      if (seenKeys.length > 5000) {
        var toRemove = seenKeys.slice(0, seenKeys.length - 3000);
        for (var r = 0; r < toRemove.length; r++) delete _seenMids[toRemove[r]];
      }
    } catch (e) {
      console.error('[seatalk-watch] scan error:', e);
    }
  }

  function onStoreChange() {
    if (!_active) return;
    if (_debounceTimer) return;
    _debounceTimer = setTimeout(function () {
      _debounceTimer = null;
      scanMessages();
    }, 500);
  }

  window.__seatalkWatch = {
    start: function (config) {
      if (_active) this.stop();
      if (config) {
        if (config.sessions !== undefined) _config.sessions = config.sessions;
        if (config.mentionsOnly !== undefined) _config.mentionsOnly = config.mentionsOnly;
        if (config.keywords !== undefined) _config.keywords = config.keywords;
      }

      _seenMids = {};
      _msgCount = 0;
      _probeLogged = false;
      _startTime = Date.now();

      // Initialize lastMaxTs from current store to skip all existing messages
      _lastMaxTs = 0;
      try {
        if (window.store) {
          var curState = window.store.getState();
          var curMsgMap = findMessageStore(curState);
          for (var ck in curMsgMap) {
            var cm = curMsgMap[ck];
            if (cm && typeof cm === 'object') {
              var cts = cm.timeStamp || cm.timestamp || cm.ts || 0;
              if (cts > _lastMaxTs) _lastMaxTs = cts;
              var cmid = cm.mid || cm.id || ck.split('-').pop();
              if (cmid) _seenMids[cmid] = 1;
            }
          }
        }
      } catch (_) {}
      if (_lastMaxTs === 0) _lastMaxTs = Math.floor(Date.now() / 1000);
      console.log('[seatalk-watch] init lastMaxTs=' + _lastMaxTs + ', pre-seeded ' + Object.keys(_seenMids).length + ' mids');

      _active = true;

      if (window.store && typeof window.store.subscribe === 'function') {
        _unsubscribe = window.store.subscribe(onStoreChange);
      }

      console.log('[seatalk-watch] started', JSON.stringify(_config));
      return { ok: true, config: _config };
    },

    stop: function () {
      _active = false;
      if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
      if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
      console.log('[seatalk-watch] stopped');
      return { ok: true };
    },

    status: function () {
      return {
        active: _active,
        config: _config,
        startTime: _startTime,
        elapsed: _active ? Date.now() - _startTime : 0,
        messageCount: _msgCount
      };
    },

    addSentText: function (text) {
      _sentTexts[text] = Date.now();
      // Clean entries older than 60s
      for (var k in _sentTexts) {
        if (_sentTexts[k] < Date.now() - 60000) delete _sentTexts[k];
      }
    }
  };

  console.log('[seatalk-watch] ready v' + WATCH_VERSION);
})();

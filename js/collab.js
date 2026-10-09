/**
 * =========================================================
 * MiroSQL Studio - Real-time Collaboration Engine (v5.0)
 * =========================================================
 * MULTI-TRANSPORT REAL-TIME COLLABORATION:
 *  1. Server-Sent Events (SSE) + HTTP POST to server.js
 *     -> Works across different browsers, private tabs, and LAN devices!
 *  2. LocalStorage Storage Events & Polling (60ms backup)
 *     -> Instant zero-latency cross-tab communication in same browser
 *  3. BroadcastChannel (mirosql_collab_v5)
 *     -> Microsecond cross-tab IPC
 * =========================================================
 */

const Collab = (() => {
  // Unique client instance ID per tab
  const myClientId = 'peer_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();

  // Storage keys
  const IDENTITY_KEY = 'mirosql_user_identity_v1';
  const SESSION_KEY = 'mirosql_session_identity_v1';
  const CURSOR_PREFIX = 'mirosql_cursor_';
  const roomId = (new URLSearchParams(window.location.search).get('room') || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100) || 'default';
  const SYNC_KEY = 'mirosql_collab_sync_v5_' + roomId;

  // Palette
  const USER_COLORS = [
    '#6366f1', '#10b981', '#f43f5e', '#8b5cf6', '#0ea5e9',
    '#f59e0b', '#ec4899', '#14b8a6', '#f97316', '#06b6d4'
  ];

  let role = 'teacher';
  let userName = '';
  let userColor = '#6366f1';
  let isFollowing = false;
  let isReady = false;

  // Spotlight (laser pointer)
  let isSpotlightActive = false;
  let spotlightEl = null;

  // Coordinates
  let lastClientX = window.innerWidth / 2;
  let lastClientY = window.innerHeight / 2;
  let lastWorldX = 0;
  let lastWorldY = 0;

  // Remote peers map: peerId -> { id, name, role, color, wx, wy, spotlight, ts, el, spotEl }
  const remotePeers = new Map();

  // BroadcastChannel
  let bc = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('mirosql_collab_v5_' + roomId);
    }
  } catch (e) {}

  // WebSocket is the cross-browser transport. BroadcastChannel remains a local fallback.
  let isServerConnected = false;

  // Message dedup
  const seenMessages = new Map();
  let msgSeq = 0;

  function isDuplicate(msgId) {
    if (!msgId) return false;
    if (seenMessages.has(msgId)) return true;
    seenMessages.set(msgId, Date.now());
    if (seenMessages.size > 300) {
      const cutoff = Date.now() - 30000;
      for (const [id, time] of seenMessages.entries()) {
        if (time < cutoff) seenMessages.delete(id);
      }
    }
    return false;
  }

  // ==========================================
  // Identity Management (Permanent + Tab-scoped)
  // ==========================================
  function loadIdentity() {
    // 1. Check URL query params for quick testing (e.g. ?role=student&name=Мария)
    try {
      const params = new URLSearchParams(window.location.search);
      const urlRole = params.get('role');
      const urlName = params.get('name');
      if (urlRole || urlName) {
        role = urlRole === 'student' ? 'student' : (urlRole === 'teacher' ? 'teacher' : 'student');
        userName = urlName ? decodeURIComponent(urlName) : (role === 'teacher' ? 'Преподаватель' : 'Студент');
        userColor = role === 'teacher' ? '#6366f1' : '#10b981';
        saveIdentity(true);
        return true;
      }
    } catch (e) {}

    // 2. Check tab session identity first
    try {
      const sessionRaw = sessionStorage.getItem(SESSION_KEY);
      if (sessionRaw) {
        const data = JSON.parse(sessionRaw);
        if (data.name && data.role) {
          userName = data.name;
          role = data.role;
          userColor = data.color || (role === 'teacher' ? '#6366f1' : '#10b981');
          return true;
        }
      }
    } catch (e) {}

    // 3. Check permanent localStorage identity
    try {
      const localRaw = localStorage.getItem(IDENTITY_KEY);
      if (localRaw) {
        const data = JSON.parse(localRaw);
        if (data.name && data.role) {
          userName = data.name;
          role = data.role;
          userColor = data.color || (role === 'teacher' ? '#6366f1' : '#10b981');
          // Copy to session
          saveIdentity(false);
          return true;
        }
      }
    } catch (e) {}

    return false;
  }

  function saveIdentity(permanent = true) {
    const payload = JSON.stringify({
      name: userName,
      role: role,
      color: userColor,
      savedAt: Date.now()
    });

    try { sessionStorage.setItem(SESSION_KEY, payload); } catch (e) {}

    if (permanent) {
      try { localStorage.setItem(IDENTITY_KEY, payload); } catch (e) {}
    }
  }

  // ==========================================
  // Welcome / Onboarding Modal
  // ==========================================
  function showWelcomeModal(isEditMode = false) {
    const modal = document.getElementById('welcome-modal');
    if (!modal) {
      userName = 'Пользователь';
      role = 'teacher';
      userColor = '#6366f1';
      saveIdentity(true);
      finishOnboarding();
      return;
    }

    modal.classList.remove('hidden');
    try { lucide.createIcons({ attrs: { class: '' }, nameAttr: 'data-lucide' }); } catch(e) {}

    let selectedRole = role || null;
    const nameInput = document.getElementById('welcome-name');
    const submitBtn = document.getElementById('welcome-submit');
    const teacherCard = document.getElementById('welcome-role-teacher');
    const studentCard = document.getElementById('welcome-role-student');

    if (userName && nameInput) {
      nameInput.value = userName;
    }

    if (selectedRole === 'teacher' && teacherCard) {
      teacherCard.classList.add('selected');
      studentCard?.classList.remove('selected');
    } else if (selectedRole === 'student' && studentCard) {
      studentCard.classList.add('selected');
      teacherCard?.classList.remove('selected');
    }

    function validateForm() {
      const nameOk = nameInput && nameInput.value.trim().length >= 1;
      const roleOk = !!selectedRole;
      if (submitBtn) submitBtn.disabled = !(nameOk && roleOk);
    }

    validateForm();

    if (nameInput) {
      nameInput.oninput = validateForm;
      setTimeout(() => nameInput.focus(), 300);
    }

    [teacherCard, studentCard].forEach(card => {
      if (!card) return;
      card.onclick = () => {
        teacherCard?.classList.remove('selected');
        studentCard?.classList.remove('selected');
        card.classList.add('selected');
        selectedRole = card.dataset.role;
        validateForm();
      };
    });

    if (submitBtn) {
      submitBtn.onclick = () => {
        if (submitBtn.disabled) return;
        const name = nameInput?.value.trim();
        if (!name || !selectedRole) return;

        userName = name;
        role = selectedRole;
        userColor = selectedRole === 'teacher'
          ? '#6366f1'
          : USER_COLORS[1 + Math.floor(Math.random() * (USER_COLORS.length - 1))];

        saveIdentity(true);

        modal.style.transition = 'opacity 0.25s ease';
        modal.style.opacity = '0';
        setTimeout(() => {
          modal.classList.add('hidden');
          modal.style.opacity = '';
          finishOnboarding();
        }, 250);
      };
    }

    if (nameInput) {
      nameInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !submitBtn?.disabled) submitBtn?.click();
      };
    }
  }

  function finishOnboarding() {
    isReady = true;
    applyRoleToUI(true);
    startCollaboration();
  }

  // WebSocket transport (works behind Cloudflare Tunnel).
  let socket = null;
  let roomReady = false;
  function initServerConnection() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = protocol + '//' + window.location.host + '/api/collab/ws?id=' +
      encodeURIComponent(myClientId) + '&room=' + encodeURIComponent(roomId);
    socket = new WebSocket(url);
    socket.onopen = () => {
      isServerConnected = true;
      updateOnlineIndicator();
      console.info('[Collab] WebSocket connected, awaiting room state:', roomId);
    };
    socket.onmessage = event => {
      try { handleIncomingPacket(JSON.parse(event.data)); }
      catch (error) { console.error('[Collab] Failed to process server message:', error); }
    };
    socket.onerror = () => {
      isServerConnected = false;
      updateOnlineIndicator();
      console.warn('[Collab] WebSocket connection failed:', url);
    };
    socket.onclose = event => {
      isServerConnected = false;
      roomReady = false;
      updateOnlineIndicator();
      console.warn('[Collab] WebSocket closed:', event.code, event.reason || '(no reason)');
      if (isReady) setTimeout(initServerConnection, 2000);
    };
  }

  function sendToServer(packet) {
    if (!isReady || !roomReady || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ ...packet, room: roomId, _senderId: myClientId }));
  }

  // ==========================================
  // Unified Message Dispatch & Reception
  // ==========================================
  function broadcastMessage(packet) {
    // Local tabs must continue to share edits even while the server is offline.
    if (!isReady) return;
    msgSeq++;
    const enriched = {
      ...packet,
      _id: `${myClientId}_${msgSeq}_${Date.now()}`,
      _senderId: myClientId,
      _time: Date.now(),
      room: roomId
    };

    // 1. Send to local BroadcastChannel
    if (bc) {
      try { bc.postMessage(enriched); } catch (e) {}
    }

    // 2. Send to localStorage sync key
    if (packet.type !== 'cursor') {
      try {
        localStorage.setItem(SYNC_KEY, JSON.stringify(enriched));
      } catch (e) {}
    }

    // 3. Send to Server (cross-browser/LAN)
    sendToServer(enriched);
  }

  function handleIncomingPacket(packet) {
    if (!packet || typeof packet !== 'object') return;
    if (packet.room && packet.room !== roomId) return;
    if (packet.type === 'room_snapshot') {
      roomReady = true;
      updateOnlineIndicator();
      if (Array.isArray(packet.pages) && window.Pages) Pages.onRemotePagesUpdate(packet.pages, null);
      if (packet.tables && window.DB) DB.onRemoteDbUpdate(packet.tables, packet.tableSchemas);
      if (!packet.pages && window.Pages) Collab.broadcastPagesUpdate(Pages.getPages(), Pages.getActivePage()?.id);
      if (!packet.tables && window.DB) Collab.broadcastDbUpdate(DB.getTables(), DB.getTableSchemas());
      return;
    }
    const senderId = packet._senderId || packet.senderId || packet.id;
    if (senderId === myClientId) return; // skip self

    // Snapshots on SSE connect
    if (packet.type === 'peers_snapshot' && Array.isArray(packet.peers)) {
      const now = Date.now();
      packet.peers.forEach(peer => {
        if (peer.id && peer.id !== myClientId) {
          renderPeerCursor(peer.id, peer, now);
        }
      });
      updateOnlineIndicator();
      return;
    }

    // Cursor movement packet
    if (packet.type === 'cursor') {
      renderPeerCursor(senderId, packet, Date.now());
      updateOnlineIndicator();
      return;
    }

    // Leave packet
    if (packet.type === 'leave') {
      removePeer(senderId);
      updateOnlineIndicator();
      return;
    }

    // Dedup non-cursor messages
    if (isDuplicate(packet._id)) return;
    if (packet.pageId && packet.pageId !== Pages.getActivePage()?.id) return;

    // Handle board sync commands
    handleSyncMessage(packet);
  }

  // ==========================================
  // Cursor Engine: Write, Poll & Storage Events
  // ==========================================
  let lastWriteTime = 0;
  let lastServerCursorSend = 0;

  function writeMyCursor() {
    if (!isReady) return;
    const now = Date.now();

    const cursorData = {
      type: 'cursor',
      id: myClientId,
      name: userName,
      role: role,
      color: userColor,
      wx: lastWorldX,
      wy: lastWorldY,
      spotlight: isSpotlightActive,
      room: roomId,
      ts: now
    };

    // 1. Write to tab's localStorage key
    try {
      localStorage.setItem(CURSOR_PREFIX + myClientId, JSON.stringify(cursorData));
    } catch (e) {}

    // 2. Broadcast via BroadcastChannel
    if (bc) {
      try {
        bc.postMessage({ ...cursorData, _senderId: myClientId });
      } catch (e) {}
    }

    // 3. Broadcast to Server (throttled to ~20fps to keep network light)
    if (now - lastServerCursorSend > 45) {
      lastServerCursorSend = now;
      sendToServer(cursorData);
    }
  }

  /** Snapshot all cursor keys and poll localStorage */
  function pollCursors() {
    const now = Date.now();
    const foundPeerIds = new Set();

    // Snapshot keys first to avoid indexing issues during mutation
    const keysToCheck = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CURSOR_PREFIX)) {
          keysToCheck.push(key);
        }
      }
    } catch (e) { return; }

    for (const key of keysToCheck) {
      const peerId = key.substring(CURSOR_PREFIX.length);
      if (peerId === myClientId) continue;

      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (!data || !data.ts || (data.room && data.room !== roomId)) continue;

        // Clean up stale cursors (> 12 seconds old)
        if (now - data.ts > 12000) {
          try { localStorage.removeItem(key); } catch (e) {}
          continue;
        }

        foundPeerIds.add(peerId);
        renderPeerCursor(peerId, data, now);
      } catch (e) {}
    }

    // Remove dead peers that haven't sent updates
    remotePeers.forEach((peer, id) => {
      if (!foundPeerIds.has(id) && (now - peer.timestamp > 12000)) {
        removePeer(id);
      }
    });

    updateOnlineIndicator();
  }

  // ==========================================
  // Visual Cursor Rendering
  // ==========================================
  function getOverlay() {
    let overlay = document.getElementById('collab-overlay-layer');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'collab-overlay-layer';
      overlay.className = 'fixed inset-0 pointer-events-none z-[45] overflow-hidden';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function worldToScreenCoords(wx, wy) {
    if (window.Canvas && typeof Canvas.worldToScreen === 'function') {
      try {
        return Canvas.worldToScreen(wx, wy);
      } catch (e) {}
    }
    return { x: wx, y: wy };
  }

  function renderPeerCursor(peerId, data, now) {
    const overlay = getOverlay();
    if (!overlay) return;

    let peer = remotePeers.get(peerId);

    if (!peer) {
      // Create new cursor DOM element
      const el = document.createElement('div');
      el.id = 'cursor-' + peerId;
      el.style.cssText = `
        position: absolute;
        left: 0; top: 0;
        z-index: 999980;
        pointer-events: none;
        user-select: none;
        will-change: transform;
        transition: transform 70ms linear, opacity 300ms ease;
      `;
      overlay.appendChild(el);

      peer = {
        id: peerId,
        el: el,
        spotEl: null,
        name: data.name || 'Участник',
        role: data.role || 'student',
        color: data.color || '#10b981',
        wx: data.wx !== undefined ? data.wx : 0,
        wy: data.wy !== undefined ? data.wy : 0,
        timestamp: now
      };
      remotePeers.set(peerId, peer);
      rebuildCursorHTML(peer);
    }

    // Update peer metadata
    const nameChanged = peer.name !== data.name;
    const colorChanged = peer.color !== data.color;
    const roleChanged = peer.role !== data.role;

    peer.name = data.name || peer.name;
    peer.role = data.role || peer.role;
    peer.color = data.color || peer.color;
    peer.wx = data.wx !== undefined ? data.wx : peer.wx;
    peer.wy = data.wy !== undefined ? data.wy : peer.wy;
    peer.timestamp = now;

    if (nameChanged || colorChanged || roleChanged) {
      rebuildCursorHTML(peer);
    }

    // Position cursor in client viewport coordinates
    const screenPos = worldToScreenCoords(peer.wx, peer.wy);
    // Offset slightly so pointer tip (top-left) aligns with exact mouse coordinate
    peer.el.style.transform = `translate3d(${screenPos.x - 3}px, ${screenPos.y - 3}px, 0)`;

    // Fade if stationary/inactive for > 6 seconds
    const elapsed = now - (data.ts || now);
    peer.el.style.opacity = elapsed > 6000 ? '0.65' : '1';

    // Spotlight / Laser pointer handling
    if (data.spotlight) {
      if (!peer.spotEl) {
        peer.spotEl = createSpotlightEl(peer.name);
        peer.spotEl.style.transition = 'transform 70ms linear';
        overlay.appendChild(peer.spotEl);
      }
      peer.spotEl.style.transform = `translate3d(${screenPos.x - 80}px, ${screenPos.y - 80}px, 0)`;
    } else if (peer.spotEl) {
      peer.spotEl.remove();
      peer.spotEl = null;
    }
  }

  function rebuildCursorHTML(peer) {
    if (!peer || !peer.el) return;
    const icon = peer.role === 'teacher' ? '👨‍🏫' : '👩‍🎓';
    const name = peer.name || 'Участник';
    const color = peer.color || '#6366f1';

    peer.el.innerHTML = `
      <div style="display:flex;align-items:flex-start;filter:drop-shadow(0 3px 10px rgba(0,0,0,0.35));">
        <!-- SVG Cursor Pointer -->
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style="transform:rotate(-4deg);filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));">
          <path d="M5.65 2.5L20.35 12.2L12.5 13.8L9.2 21.5L5.65 2.5Z" fill="${color}" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round"/>
        </svg>
        <!-- Name & Role Tag -->
        <div style="
          margin-left:-2px; margin-top:14px;
          padding:3px 10px;
          border-radius:999px;
          color:#ffffff;
          font-size:11px; font-weight:800;
          font-family:'Inter',system-ui,sans-serif;
          white-space:nowrap;
          display:flex; align-items:center; gap:4px;
          background:${color};
          border:2px solid rgba(255,255,255,0.7);
          box-shadow:0 4px 14px -2px rgba(0,0,0,0.4), 0 0 0 1px ${color}60;
          backdrop-filter:blur(6px);
          letter-spacing:0.02em;
        ">
          <span style="font-size:13px;line-height:1;">${icon}</span>
          <span>${name}</span>
        </div>
      </div>
    `;
  }

  function removePeer(peerId) {
    const peer = remotePeers.get(peerId);
    if (peer) {
      if (peer.el) peer.el.remove();
      if (peer.spotEl) peer.spotEl.remove();
      remotePeers.delete(peerId);
      console.log('[Collab] Peer removed:', peerId);
    }
  }

  function updateOnlineIndicator() {
    const indicator = document.getElementById('collab-online-indicator');
    const textEl = document.getElementById('collab-online-text');
    if (!indicator || !textEl) return;

    indicator.classList.remove('hidden');
    indicator.classList.add('flex');

    const online = roomReady && socket && socket.readyState === WebSocket.OPEN;
    const dot = indicator.querySelector('span.relative > span:last-child');
    const ping = indicator.querySelector('span.relative > span:first-child');
    if (dot) {
      dot.classList.toggle('bg-emerald-500', online);
      dot.classList.toggle('bg-amber-500', !online);
    }
    if (ping) ping.classList.toggle('hidden', !online);

    const totalCount = 1 + remotePeers.size;
    if (!online) {
      textEl.textContent = remotePeers.size ? totalCount + ' локально · сервер отключён' : 'Нет связи с сервером';
      indicator.title = 'Курсоры между вкладками могут работать локально. Откройте F12 → Network → WS и проверьте /api/collab/ws.';
      return;
    }

    indicator.title = 'WebSocket подключён к комнате ' + roomId;
    if (remotePeers.size === 0) {
      textEl.textContent = '1 онлайн';
    } else {
      const peerNames = Array.from(remotePeers.values()).map(p => p.name).slice(0, 2);
      const othersText = remotePeers.size > 2 ? ' +' + (remotePeers.size - 2) : '';
      textEl.textContent = totalCount + ' онлайн (' + peerNames.join(', ') + othersText + ')';
    }
  }

  // ==========================================
  // Collaboration Start & Pointer Handlers
  // ==========================================
  function startCollaboration() {
    if (window.Canvas && typeof Canvas.screenToWorld === 'function') {
      const initialWorld = Canvas.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
      lastWorldX = initialWorld.x;
      lastWorldY = initialWorld.y;
    }

    // Pointer move handler
    const handleMove = (e) => {
      lastClientX = e.clientX;
      lastClientY = e.clientY;

      if (isSpotlightActive && spotlightEl) {
        spotlightEl.style.transform = `translate3d(${e.clientX - 80}px, ${e.clientY - 80}px, 0)`;
      }

      if (window.Canvas && typeof Canvas.screenToWorld === 'function') {
        const world = Canvas.screenToWorld(e.clientX, e.clientY);
        lastWorldX = world.x;
        lastWorldY = world.y;
      }

      // Throttled cursor write (~30fps)
      const now = Date.now();
      if (now - lastWriteTime < 32) return;
      lastWriteTime = now;
      writeMyCursor();
    };

    window.addEventListener('pointermove', handleMove, { passive: true });
    document.addEventListener('pointermove', handleMove, { passive: true });

    // Initial write
    writeMyCursor();

    // Heartbeat every 1.2 seconds to maintain active state
    setInterval(writeMyCursor, 1200);

    // Continuous polling every 60ms
    setInterval(pollCursors, 60);

    // Initial server connection
    initServerConnection();

    // Onunload: clean up cursor key and inform peers
    window.addEventListener('beforeunload', () => {
      try { localStorage.removeItem(CURSOR_PREFIX + myClientId); } catch (e) {}
      broadcastMessage({ type: 'leave', senderId: myClientId });
    });

    // Spotlight shortcut (L)
    window.addEventListener('keydown', (e) => {
      if (['TEXTAREA', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'l' || e.key === 'L') toggleSpotlight();
    });

    updateOnlineIndicator();
    console.log('[Collab v5.0] Started | My ID:', myClientId, '| Name:', userName, '| Role:', role);
  }

  // ==========================================
  // UI & Role Presentation
  // ==========================================
  function applyRoleToUI(notify = true) {
    const badge = document.getElementById('role-badge');
    const roleText = document.getElementById('role-text');
    const followBtn = document.getElementById('btn-follow-mode');

    if (badge && roleText) {
      if (role === 'teacher') {
        badge.className = 'px-2.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 cursor-pointer hover:shadow-sm transition select-none';
        roleText.textContent = `👨‍🏫 ${userName || 'Преподаватель'}`;
        if (followBtn) followBtn.classList.add('hidden');
      } else {
        badge.className = 'px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 cursor-pointer hover:shadow-sm transition select-none';
        roleText.textContent = `👩‍🎓 ${userName || 'Ученик'}`;
        if (followBtn) followBtn.classList.remove('hidden');
      }
    }

    document.querySelectorAll('.board-item').forEach(el => {
      if (el._onRoleChange) el._onRoleChange(role);
    });

    if (notify && isReady) {
      broadcastMessage({ type: 'role_change', senderId: myClientId, role, name: userName, color: userColor });
      if (window.App) window.App.showToast(`Роль: ${role === 'teacher' ? '👨‍🏫 Преподаватель' : '👩‍🎓 Ученик'} (${userName})`);
    }
  }

  function setRole(newRole, notify = true) {
    role = newRole;
    userColor = role === 'teacher' ? '#6366f1' : '#10b981';
    saveIdentity(true);
    applyRoleToUI(notify);
    writeMyCursor();
  }

  function toggleRole() {
    setRole(role === 'teacher' ? 'student' : 'teacher', true);
  }

  function editProfile() {
    showWelcomeModal(true);
  }

  // ==========================================
  // Canvas Transform Hook (Pan/Zoom)
  // ==========================================
  function onCanvasTransform() {
    const now = Date.now();
    remotePeers.forEach((peer) => {
      if (peer.el) {
        const screenPos = worldToScreenCoords(peer.wx, peer.wy);
        peer.el.style.transform = `translate3d(${screenPos.x - 3}px, ${screenPos.y - 3}px, 0)`;
        if (peer.spotEl) {
          peer.spotEl.style.transform = `translate3d(${screenPos.x - 80}px, ${screenPos.y - 80}px, 0)`;
        }
      }
    });
  }

  // ==========================================
  // Spotlight / Laser Pointer (L)
  // ==========================================
  function toggleSpotlight() {
    isSpotlightActive = !isSpotlightActive;
    const btn = document.getElementById('btn-spotlight-toggle');

    if (btn) {
      if (isSpotlightActive) {
        btn.classList.add('bg-amber-500', 'text-white', 'shadow-md', 'border-amber-600');
        btn.classList.remove('text-slate-700', 'bg-white/95');
        if (window.App) window.App.showToast('🎯 Указка включена (L для выкл)');
      } else {
        btn.classList.remove('bg-amber-500', 'text-white', 'shadow-md', 'border-amber-600');
        btn.classList.add('text-slate-700', 'bg-white/95');
        if (window.App) window.App.showToast('Указка выключена');
      }
    }

    const overlay = getOverlay();
    if (isSpotlightActive) {
      if (overlay && !spotlightEl) {
        spotlightEl = createSpotlightEl(userName);
        overlay.appendChild(spotlightEl);
      }
      if (spotlightEl) {
        spotlightEl.style.transform = `translate3d(${lastClientX - 80}px, ${lastClientY - 80}px, 0)`;
      }
    } else if (spotlightEl) {
      spotlightEl.remove();
      spotlightEl = null;
    }

    writeMyCursor();
  }

  function createSpotlightEl(ownerName) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;z-index:999999;width:160px;height:160px;left:0;top:0;will-change:transform;pointer-events:none;';
    el.innerHTML = `
      <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:0;border-radius:50%;border:2px dashed rgba(251,191,36,0.9);background:rgba(251,191,36,0.15);box-shadow:0 0 35px rgba(251,191,36,0.6);animation:pulse 2s infinite;"></div>
        <div style="position:absolute;width:56px;height:56px;border-radius:50%;border:1px solid rgba(244,63,94,0.6);"></div>
        <div style="width:16px;height:16px;border-radius:50%;background:#dc2626;border:2px solid #fff;box-shadow:0 0 12px #f43f5e,0 0 25px #ef4444;position:relative;z-index:20;display:flex;align-items:center;justify-content:center;">
          <div style="width:6px;height:6px;border-radius:50%;background:#fff;"></div>
        </div>
        <div style="position:absolute;bottom:-24px;background:rgba(15,23,42,0.95);color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;box-shadow:0 4px 12px rgba(0,0,0,0.3);border:1px solid rgba(71,85,105,0.5);white-space:nowrap;display:flex;align-items:center;gap:6px;z-index:30;">
          <span style="width:8px;height:8px;border-radius:50%;background:#ef4444;animation:ping 1s infinite;display:inline-block;"></span>
          <span>${ownerName}</span>
        </div>
      </div>
    `;
    return el;
  }

  // ==========================================
  // Follow Mode & Viewport
  // ==========================================
  function broadcastViewport(scale, panX, panY) {
    if (role === 'teacher') {
      broadcastMessage({ type: 'viewport', senderId: myClientId, role: 'teacher', scale, panX, panY });
    }
  }

  function toggleFollowMode() {
    isFollowing = !isFollowing;
    const btn = document.getElementById('btn-follow-mode');
    if (btn) {
      if (isFollowing) {
        btn.classList.add('bg-indigo-600', 'text-white');
        btn.classList.remove('bg-white/95', 'text-slate-700');
        if (window.App) window.App.showToast('👁️ Следование за преподавателем ВКЛЮЧЕНО');
      } else {
        btn.classList.remove('bg-indigo-600', 'text-white');
        btn.classList.add('bg-white/95', 'text-slate-700');
        if (window.App) window.App.showToast('Следование выключено');
      }
    }
  }

  // ==========================================
  // Sync Message Handler
  // ==========================================
  function handleSyncMessage(msg) {
    if (!msg) return;

    if (msg.type === 'viewport' && isFollowing && msg.role === 'teacher') {
      if (window.Canvas) {
        Canvas.setScale(msg.scale);
        Canvas.setPan(msg.panX, msg.panY);
      }
    }

    if (msg.type === 'item_text') {
      if (window.Widgets && Widgets.updateRemoteItemText) {
        Widgets.updateRemoteItemText(msg.id, msg.field, msg.value);
      }
    }

    if (msg.type === 'item_move') {
      if (window.Widgets && Widgets.updateRemoteItemPos) {
        Widgets.updateRemoteItemPos(msg.id, msg.x, msg.y, msg.width, msg.height);
      }
    }

    if (msg.type === 'item_create') {
      if (window.Widgets && Widgets.mountRemoteItem) {
        Widgets.mountRemoteItem(msg.item);
      }
    }

    if (msg.type === 'item_delete') {
      if (window.Widgets && Widgets.deleteRemoteItem) {
        Widgets.deleteRemoteItem(msg.id);
      }
    }

    if (msg.type === 'item_lock') {
      if (window.Widgets && Widgets.lockRemoteItem) {
        Widgets.lockRemoteItem(msg.id, msg.isLocked);
      }
    }

    if (msg.type === 'item_update') {
      if (window.Widgets && Widgets.updateRemoteItemData) {
        Widgets.updateRemoteItemData(msg.id, msg.data);
      }
    }

    if (msg.type === 'pages_sync') {
      if (window.Pages && Pages.onRemotePagesUpdate) {
        Pages.onRemotePagesUpdate(msg.pages, msg.activePageId);
      }
    }

    if (msg.type === 'db_sync') {
      if (window.DB && DB.onRemoteDbUpdate) {
        DB.onRemoteDbUpdate(msg.tables, msg.tableSchemas);
      }
    }

    if (msg.type === 'stroke_add') {
      if (window.Canvas && Canvas.addRemoteStroke) {
        Canvas.addRemoteStroke(msg.stroke);
      }
    }
  }

  // ==========================================
  // Public Broadcasting Helpers
  // ==========================================
  function broadcastItemText(id, field, value) { broadcastMessage({ type: 'item_text', id, field, value, pageId: Pages.getActivePage()?.id }); }
  function broadcastItemMove(id, x, y, width, height) { broadcastMessage({ type: 'item_move', id, x, y, width, height, pageId: Pages.getActivePage()?.id }); }
  function broadcastItemCreate(item) { broadcastMessage({ type: 'item_create', id: item.id, item, pageId: Pages.getActivePage()?.id }); }
  function broadcastItemDelete(id) { broadcastMessage({ type: 'item_delete', id, pageId: Pages.getActivePage()?.id }); }
  function broadcastItemLock(id, isLocked) { broadcastMessage({ type: 'item_lock', id, isLocked, pageId: Pages.getActivePage()?.id }); }
  function broadcastItemUpdate(id, data) { broadcastMessage({ type: 'item_update', id, data, pageId: Pages.getActivePage()?.id }); }
  function broadcastPagesUpdate(pages, activePageId) { broadcastMessage({ type: 'pages_sync', pages, activePageId }); }
  function broadcastDbUpdate(tables, tableSchemas) { broadcastMessage({ type: 'db_sync', tables, tableSchemas }); }
  function broadcastStroke(stroke) { broadcastMessage({ type: 'stroke_add', stroke, pageId: Pages.getActivePage()?.id }); }

  // ==========================================
  // Init
  // ==========================================
  function init() {
    // 1. BroadcastChannel listener
    if (bc) {
      bc.onmessage = (e) => handleIncomingPacket(e.data);
    }

    // 2. Window storage event listener (instant cross-tab cursor & sync)
    window.addEventListener('storage', (e) => {
      if (!e.newValue) return;
      if (e.key && e.key.startsWith(CURSOR_PREFIX)) {
        try {
          const peerId = e.key.substring(CURSOR_PREFIX.length);
          if (peerId !== myClientId) {
            const peer = JSON.parse(e.newValue);
            if (!peer.room || peer.room === roomId) renderPeerCursor(peerId, peer, Date.now());
          }
        } catch (err) {}
      } else if (e.key === SYNC_KEY) {
        try {
          handleIncomingPacket(JSON.parse(e.newValue));
        } catch (err) {}
      }
    });

    // 3. Double-click on role badge opens name/role editor
    const roleBadge = document.getElementById('role-badge');
    if (roleBadge) {
      roleBadge.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        editProfile();
      });
    }

    // 4. Load identity or display onboarding modal
    if (loadIdentity()) {
      finishOnboarding();
    } else {
      showWelcomeModal();
    }
  }

  return {
    init,
    getRole: () => role,
    setRole,
    toggleRole,
    editProfile,
    broadcastViewport,
    toggleFollowMode,
    toggleSpotlight,
    isFollowing: () => isFollowing,
    onCanvasTransform,
    broadcastItemText,
    broadcastItemMove,
    broadcastItemCreate,
    broadcastItemDelete,
    broadcastItemLock,
    broadcastItemUpdate,
    broadcastPagesUpdate,
    broadcastDbUpdate,
    broadcastStroke,
    getClientId: () => myClientId,
    getPeers: () => Array.from(remotePeers.values()),
    getUserName: () => userName,
    getConnectionStatus: () => ({ room: roomId, websocketOpen: isServerConnected, roomReady, state: socket?.readyState ?? -1 }),
    getUserColor: () => userColor
  };
})();

// Allow widgets and other classic scripts to discover the collaboration API.
window.Collab = Collab;

/**
 * =========================================================
 * MiroSQL Studio - Real-time Collaboration Engine
 * Dual-transport (BroadcastChannel + localStorage storage event)
 * Multi-tab Cursors, Laser Pointer (Spotlight), & Full Content Sync
 * =========================================================
 */

const Collab = (() => {
  // Unique ID for this tab instance
  const myClientId = 'peer_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();

  let role = 'teacher';
  let userName = 'Преподаватель (Алексей)';
  let userColor = '#6366f1';
  let isFollowing = false;

  // Spotlight (laser pointer)
  let isSpotlightActive = false;
  let spotlightEl = null;

  // Track last pointer coordinates
  let lastClientX = window.innerWidth / 2;
  let lastClientY = window.innerHeight / 2;
  let lastWorldX = 0;
  let lastWorldY = 0;

  // Remote peers: peerId -> { name, role, color, wx, wy, timestamp, el, spotEl, isIdle }
  const remotePeers = new Map();

  // Dual transport
  const CHANNEL_NAME = 'mirosql_collab_v4';
  const STORAGE_KEY = 'mirosql_collab_sync_v4';
  let bc = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(CHANNEL_NAME);
    }
  } catch (e) {
    console.warn('BroadcastChannel unavailable:', e);
  }

  // Deduplication cache for dual transport
  const seenMessages = new Map();
  let msgSeq = 0;

  function isDuplicate(msgId) {
    if (!msgId) return false;
    if (seenMessages.has(msgId)) return true;
    seenMessages.set(msgId, Date.now());
    if (seenMessages.size > 250) {
      const cutoff = Date.now() - 30000;
      for (const [id, time] of seenMessages.entries()) {
        if (time < cutoff) seenMessages.delete(id);
      }
    }
    return false;
  }

  // ==========================================
  // Transport Layer
  // ==========================================
  let lastStorageCursorTime = 0;

  function broadcast(payload) {
    msgSeq++;
    const packet = {
      ...payload,
      _id: `${myClientId}_${msgSeq}_${Date.now()}`,
      _senderId: myClientId,
      _time: Date.now()
    };

    // 1. Primary: BroadcastChannel (low latency)
    if (bc) {
      try { bc.postMessage(packet); } catch (e) { /* ignore */ }
    }

    // 2. Secondary: localStorage storage event (reliable fallback)
    // Avoid storage spam for high frequency cursor updates, throttle to 100ms
    if (packet.type !== 'cursor' || (Date.now() - lastStorageCursorTime > 100)) {
      if (packet.type === 'cursor') lastStorageCursorTime = Date.now();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(packet));
      } catch (e) { /* ignore */ }
    }
  }

  function onIncomingPacket(packet) {
    if (!packet || typeof packet !== 'object') return;
    if (packet._senderId === myClientId) return;
    if (isDuplicate(packet._id)) return;
    handleRemoteMessage(packet);
  }

  // ==========================================
  // Init
  // ==========================================
  function init() {
    // Determine initial role from sessionStorage (per tab)
    const savedRole = sessionStorage.getItem('mirosql_tab_role');
    if (savedRole) {
      setRole(savedRole, false);
    } else {
      // Default to teacher, will auto-adjust to student if teacher responds to hello
      setRole('teacher', false);
    }

    // Transport listeners
    if (bc) {
      bc.onmessage = (e) => onIncomingPacket(e.data);
      bc.addEventListener('message', (e) => onIncomingPacket(e.data));
    }
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const packet = JSON.parse(e.newValue);
          onIncomingPacket(packet);
        } catch (err) { /* ignore */ }
      }
    });

    // Announce connection
    broadcast({
      type: 'hello',
      senderId: myClientId,
      role,
      name: userName,
      color: userColor,
      hasExplicitRole: !!savedRole
    });

    if (window.Canvas) {
      const initialWorld = Canvas.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
      lastWorldX = initialWorld.x;
      lastWorldY = initialWorld.y;
    }

    // Pointer listeners
    let lastBroadcastTime = 0;
    const handleMove = (e) => {
      lastClientX = e.clientX;
      lastClientY = e.clientY;

      // Update local spotlight synchronously (zero lag)
      if (isSpotlightActive && spotlightEl) {
        const pos = clientToOverlay(e.clientX, e.clientY);
        spotlightEl.style.transform = `translate3d(${pos.x - 80}px, ${pos.y - 80}px, 0)`;
      }

      if (!window.Canvas) return;
      const world = Canvas.screenToWorld(e.clientX, e.clientY);
      lastWorldX = world.x;
      lastWorldY = world.y;

      // Throttled cursor broadcast (~30fps)
      const now = Date.now();
      if (now - lastBroadcastTime < 33) return;
      lastBroadcastTime = now;

      broadcast({
        type: 'cursor',
        senderId: myClientId,
        name: userName,
        role,
        color: userColor,
        wx: world.x,
        wy: world.y,
        spotlight: isSpotlightActive
      });
    };

    window.addEventListener('pointermove', handleMove, { passive: true });
    window.addEventListener('mousemove', handleMove, { passive: true });
    document.addEventListener('pointermove', handleMove, { passive: true });
    document.addEventListener('mousemove', handleMove, { passive: true });

    // Periodic heartbeat (every 2.5s) to keep cursor visible even if stationary
    setInterval(() => {
      broadcast({
        type: 'heartbeat',
        senderId: myClientId,
        role,
        name: userName,
        color: userColor,
        wx: lastWorldX,
        wy: lastWorldY,
        spotlight: isSpotlightActive
      });
      cleanupStalePeers();
    }, 2500);

    // Tab close notification
    window.addEventListener('beforeunload', () => {
      broadcast({ type: 'leave', senderId: myClientId });
    });

    // Keyboard shortcut L for spotlight
    window.addEventListener('keydown', (e) => {
      if (['TEXTAREA', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'l' || e.key === 'L') toggleSpotlight();
    });
  }

  // ==========================================
  // Role Management
  // ==========================================
  function setRole(newRole, notify = true) {
    role = newRole;
    sessionStorage.setItem('mirosql_tab_role', newRole);

    if (role === 'teacher') {
      userName = 'Преподаватель (Алексей)';
      userColor = '#6366f1';
    } else {
      userName = 'Студент (Мария)';
      userColor = '#10b981';
    }

    const badge = document.getElementById('role-badge');
    const roleText = document.getElementById('role-text');
    const followBtn = document.getElementById('btn-follow-mode');

    if (badge && roleText) {
      if (role === 'teacher') {
        badge.className = 'px-2.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 cursor-pointer hover:shadow-sm transition select-none';
        roleText.textContent = '👨‍🏫 Преподаватель';
        if (followBtn) followBtn.classList.add('hidden');
      } else {
        badge.className = 'px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 cursor-pointer hover:shadow-sm transition select-none';
        roleText.textContent = '👩‍🎓 Ученик';
        if (followBtn) followBtn.classList.remove('hidden');
      }
    }

    // Notify board widgets if needed
    document.querySelectorAll('.board-item').forEach(el => {
      if (el._onRoleChange) el._onRoleChange(role);
    });

    if (notify) {
      broadcast({ type: 'role_change', senderId: myClientId, role, name: userName, color: userColor });
      if (window.App) window.App.showToast(`Роль: ${role === 'teacher' ? '👨‍🏫 Преподаватель' : '👩‍🎓 Ученик'}`);
    }
  }

  function toggleRole() {
    setRole(role === 'teacher' ? 'student' : 'teacher', true);
  }

  // ==========================================
  // Coordinate Helpers
  // ==========================================
  function getOverlay() {
    let overlay = document.getElementById('collab-overlay-layer');
    if (!overlay) {
      const container = document.getElementById('canvas-container');
      if (container) {
        overlay = document.createElement('div');
        overlay.id = 'collab-overlay-layer';
        overlay.className = 'absolute inset-0 pointer-events-none z-30 overflow-hidden';
        container.appendChild(overlay);
      }
    }
    return overlay;
  }

  function clientToOverlay(clientX, clientY) {
    const container = document.getElementById('canvas-container');
    if (!container) return { x: clientX, y: clientY };
    const rect = container.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function worldToOverlay(wx, wy) {
    if (window.Canvas) {
      const scale = Canvas.getScale();
      const pan = Canvas.getPan();
      return {
        x: wx * scale + pan.x,
        y: wy * scale + pan.y
      };
    }
    return { x: wx, y: wy };
  }

  // ==========================================
  // Remote Message Handling
  // ==========================================
  function handleRemoteMessage(msg) {
    if (!msg) return;

    // 1. Connection lifecycle
    if (msg.type === 'hello') {
      // Respond with our presence
      broadcast({
        type: 'welcome',
        senderId: myClientId,
        role,
        name: userName,
        color: userColor,
        wx: lastWorldX,
        wy: lastWorldY,
        spotlight: isSpotlightActive
      });

      // If new tab doesn't have an explicit role and we are teacher, new tab should be student
      if (!msg.hasExplicitRole && role === 'teacher') {
        // Teacher is already here
      }
    }

    if (msg.type === 'welcome') {
      // If we don't have an explicit saved role, and existing peer is teacher, become student!
      const hasSavedRole = !!sessionStorage.getItem('mirosql_tab_role');
      if (!hasSavedRole && msg.role === 'teacher' && role === 'teacher') {
        setRole('student', false);
      }
      upsertPeerCursor(msg);
    }

    if (msg.type === 'role_change') {
      let peer = remotePeers.get(msg.senderId);
      if (peer) {
        peer.role = msg.role;
        peer.name = msg.name;
        peer.color = msg.color;
        updatePeerUI(peer);
      }
    }

    if (msg.type === 'cursor' || msg.type === 'heartbeat') {
      upsertPeerCursor(msg);
    }

    if (msg.type === 'leave') {
      removePeer(msg.senderId);
    }

    // 2. Viewport follow mode
    if (msg.type === 'viewport' && isFollowing && msg.role === 'teacher') {
      if (window.Canvas) {
        Canvas.setScale(msg.scale);
        Canvas.setPan(msg.panX, msg.panY);
      }
    }

    // 3. Real-time Text updates
    if (msg.type === 'item_text') {
      if (window.Widgets && Widgets.updateRemoteItemText) {
        Widgets.updateRemoteItemText(msg.id, msg.field, msg.value);
      }
    }

    // 4. Real-time Item Move / Resize
    if (msg.type === 'item_move') {
      if (window.Widgets && Widgets.updateRemoteItemPos) {
        Widgets.updateRemoteItemPos(msg.id, msg.x, msg.y, msg.width, msg.height);
      }
    }

    // 5. Item Creation
    if (msg.type === 'item_create') {
      if (window.Widgets && Widgets.mountRemoteItem) {
        Widgets.mountRemoteItem(msg.item);
      }
    }

    // 6. Item Deletion
    if (msg.type === 'item_delete') {
      if (window.Widgets && Widgets.deleteRemoteItem) {
        Widgets.deleteRemoteItem(msg.id);
      }
    }

    // 7. Item Lock
    if (msg.type === 'item_lock') {
      if (window.Widgets && Widgets.lockRemoteItem) {
        Widgets.lockRemoteItem(msg.id, msg.isLocked);
      }
    }

    // 8. Item Data Update (e.g. quiz selection, checklist toggle)
    if (msg.type === 'item_update') {
      if (window.Widgets && Widgets.updateRemoteItemData) {
        Widgets.updateRemoteItemData(msg.id, msg.data);
      }
    }

    // 9. Page Sync
    if (msg.type === 'pages_sync') {
      if (window.Pages && Pages.onRemotePagesUpdate) {
        Pages.onRemotePagesUpdate(msg.pages, msg.activePageId);
      }
    }

    // 10. Database Sync
    if (msg.type === 'db_sync') {
      if (window.DB && DB.onRemoteDbUpdate) {
        DB.onRemoteDbUpdate(msg.tables, msg.tableSchemas);
      }
    }

    // 11. Freehand Drawing Stroke Sync
    if (msg.type === 'stroke_add') {
      if (window.Canvas && Canvas.addRemoteStroke) {
        Canvas.addRemoteStroke(msg.stroke);
      }
    }
  }

  // ==========================================
  // Peer Cursor Rendering
  // ==========================================
  function upsertPeerCursor(msg) {
    const overlay = getOverlay();
    if (!overlay) return;

    let peer = remotePeers.get(msg.senderId);

    if (!peer) {
      // Create cursor element
      const el = document.createElement('div');
      el.className = 'remote-peer-cursor absolute left-0 top-0 pointer-events-none select-none';
      el.style.zIndex = '999980';
      el.style.willChange = 'transform, opacity';
      el.style.transition = 'transform 60ms linear, opacity 300ms ease';

      overlay.appendChild(el);
      peer = {
        id: msg.senderId,
        el,
        spotEl: null,
        name: msg.name,
        role: msg.role,
        color: msg.color,
        wx: msg.wx || 0,
        wy: msg.wy || 0,
        timestamp: Date.now()
      };
      remotePeers.set(msg.senderId, peer);
      updatePeerUI(peer);
    }

    // Update position and activity
    peer.wx = msg.wx !== undefined ? msg.wx : peer.wx;
    peer.wy = msg.wy !== undefined ? msg.wy : peer.wy;
    peer.timestamp = Date.now();
    peer.el.style.opacity = '1';

    // Position cursor in overlay
    const pos = worldToOverlay(peer.wx, peer.wy);
    peer.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;

    // Remote Spotlight (Laser pointer)
    if (msg.spotlight) {
      if (!peer.spotEl) {
        peer.spotEl = createSpotlightEl(msg.name);
        peer.spotEl.style.transition = 'transform 60ms linear';
        overlay.appendChild(peer.spotEl);
      }
      peer.spotEl.style.transform = `translate3d(${pos.x - 80}px, ${pos.y - 80}px, 0)`;
    } else if (peer.spotEl) {
      peer.spotEl.remove();
      peer.spotEl = null;
    }
  }

  function updatePeerUI(peer) {
    if (!peer || !peer.el) return;
    const icon = peer.role === 'teacher' ? '👨‍🏫' : '👩‍🎓';
    peer.el.innerHTML = `
      <div class="flex items-start">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" class="drop-shadow-md">
          <path d="M5.65 2.5L20.35 12.2L12.5 13.8L9.2 21.5L5.65 2.5Z" fill="${peer.color}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
        </svg>
        <div class="ml-1 mt-3 px-2 py-0.5 rounded-full text-white text-[10px] font-bold shadow-lg whitespace-nowrap flex items-center gap-1 border border-white/20" style="background:${peer.color}">
          <span>${icon}</span>
          <span>${peer.name}</span>
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
    }
  }

  function cleanupStalePeers() {
    const now = Date.now();
    remotePeers.forEach((peer, id) => {
      const elapsed = now - peer.timestamp;
      if (elapsed > 90000) {
        // Disconnected
        removePeer(id);
      } else if (elapsed > 12000) {
        // Idle - fade slightly
        if (peer.el) peer.el.style.opacity = '0.4';
      }
    });
  }

  // ==========================================
  // Canvas Transform Hook
  // ==========================================
  function onCanvasTransform() {
    remotePeers.forEach((peer) => {
      const pos = worldToOverlay(peer.wx, peer.wy);
      if (peer.el) peer.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      if (peer.spotEl) peer.spotEl.style.transform = `translate3d(${pos.x - 80}px, ${pos.y - 80}px, 0)`;
    });
  }

  // ==========================================
  // Local Spotlight (Zero-lag Laser Pointer)
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

    if (isSpotlightActive) {
      const overlay = getOverlay();
      if (overlay && !spotlightEl) {
        spotlightEl = createSpotlightEl(userName);
        overlay.appendChild(spotlightEl);
      }
      if (spotlightEl) {
        const pos = clientToOverlay(lastClientX, lastClientY);
        spotlightEl.style.transform = `translate3d(${pos.x - 80}px, ${pos.y - 80}px, 0)`;
      }
    } else {
      if (spotlightEl) {
        spotlightEl.remove();
        spotlightEl = null;
      }
    }

    // Broadcast spotlight status change
    broadcast({
      type: 'cursor',
      senderId: myClientId,
      name: userName,
      role,
      color: userColor,
      wx: lastWorldX,
      wy: lastWorldY,
      spotlight: isSpotlightActive
    });
  }

  function createSpotlightEl(ownerName) {
    const el = document.createElement('div');
    el.className = 'absolute pointer-events-none select-none';
    el.style.cssText = 'z-index:999999;width:160px;height:160px;left:0;top:0;will-change:transform;';
    el.innerHTML = `
      <div class="relative w-full h-full flex items-center justify-center">
        <div class="absolute inset-0 rounded-full border-2 border-dashed border-amber-400/90 bg-amber-400/20 shadow-[0_0_35px_rgba(251,191,36,0.6)] animate-pulse"></div>
        <div class="absolute w-14 h-14 rounded-full border border-rose-400/60"></div>
        <div class="w-4 h-4 rounded-full bg-rose-600 border-2 border-white shadow-[0_0_12px_#f43f5e,0_0_25px_#ef4444] relative z-20 flex items-center justify-center">
          <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
        </div>
        <div class="absolute -bottom-6 bg-slate-900/95 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-slate-700 whitespace-nowrap flex items-center gap-1.5 z-30">
          <span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
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
      broadcast({ type: 'viewport', senderId: myClientId, role: 'teacher', scale, panX, panY });
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
  // Public Broadcasting Helpers for Content Sync
  // ==========================================
  function broadcastItemText(id, field, value) {
    broadcast({ type: 'item_text', id, field, value });
  }

  function broadcastItemMove(id, x, y, width, height) {
    broadcast({ type: 'item_move', id, x, y, width, height });
  }

  function broadcastItemCreate(item) {
    broadcast({ type: 'item_create', item });
  }

  function broadcastItemDelete(id) {
    broadcast({ type: 'item_delete', id });
  }

  function broadcastItemLock(id, isLocked) {
    broadcast({ type: 'item_lock', id, isLocked });
  }

  function broadcastItemUpdate(id, data) {
    broadcast({ type: 'item_update', id, data });
  }

  function broadcastPagesUpdate(pages, activePageId) {
    broadcast({ type: 'pages_sync', pages, activePageId });
  }

  function broadcastDbUpdate(tables, tableSchemas) {
    broadcast({ type: 'db_sync', tables, tableSchemas });
  }

  function broadcastStroke(stroke) {
    broadcast({ type: 'stroke_add', stroke });
  }

  return {
    init,
    getRole: () => role,
    setRole,
    toggleRole,
    broadcastViewport,
    toggleFollowMode,
    toggleSpotlight,
    isFollowing: () => isFollowing,
    onCanvasTransform,
    // Content sync broadcasters
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
    getPeers: () => Array.from(remotePeers.values())
  };
})();

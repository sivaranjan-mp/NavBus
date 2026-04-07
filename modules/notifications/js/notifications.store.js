/* ============================================================
   NavBus — Notification Store
   In-memory store for all notifications. Handles
   adding, reading, filtering, and clearing.
   Max 100 items — oldest dropped when full.
   ============================================================ */

const NotificationStore = (() => {

  const MAX_ITEMS  = 100;
  const _listeners = [];

  // ── Internal state ────────────────────────────────────────────
  let _notifications = _loadFromStorage();
  let _unreadCount   = _notifications.filter(n => !n.read).length;

  // ── Persist to localStorage ───────────────────────────────────
  function _saveToStorage() {
    try {
      localStorage.setItem('navbus_notifications', JSON.stringify(_notifications.slice(0, 50)));
    } catch(e) {}
  }

  function _loadFromStorage() {
    try {
      return JSON.parse(localStorage.getItem('navbus_notifications') || '[]');
    } catch {
      return [];
    }
  }

  // ── Emit to listeners ─────────────────────────────────────────
  function _emit(event, payload) {
    _listeners.forEach(fn => { try { fn(event, payload); } catch(e) {} });
  }

  // ── Add a notification ─────────────────────────────────────────
  function add(notification) {
    const item = {
      id:        notification.id || `nb-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      type:      notification.type,      // 'arriving' | 'delayed' | 'missed'
      busId:     notification.busId     || null,
      deviceId:  notification.deviceId  || null,
      plate:     notification.plate     || '—',
      route:     notification.route     || null,
      routeName: notification.routeName || null,
      title:     notification.title,
      message:   notification.message,
      meta:      notification.meta      || {},   // ETA, delay, nextBus, etc.
      read:      false,
      createdAt: notification.createdAt || new Date().toISOString(),
    };

    // Prepend (newest first)
    _notifications.unshift(item);

    // Trim old items
    if (_notifications.length > MAX_ITEMS) {
      _notifications = _notifications.slice(0, MAX_ITEMS);
    }

    _unreadCount++;
    _saveToStorage();
    _emit('add', item);
    return item;
  }

  // ── Mark a notification as read ───────────────────────────────
  function markRead(id) {
    const item = _notifications.find(n => n.id === id);
    if (item && !item.read) {
      item.read  = true;
      _unreadCount = Math.max(0, _unreadCount - 1);
      _saveToStorage();
      _emit('read', { id });
    }
  }

  // ── Mark all as read ──────────────────────────────────────────
  function markAllRead() {
    _notifications.forEach(n => { n.read = true; });
    _unreadCount = 0;
    _saveToStorage();
    _emit('all_read', null);
  }

  // ── Remove one ────────────────────────────────────────────────
  function remove(id) {
    const idx = _notifications.findIndex(n => n.id === id);
    if (idx !== -1) {
      const was_unread = !_notifications[idx].read;
      _notifications.splice(idx, 1);
      if (was_unread) _unreadCount = Math.max(0, _unreadCount - 1);
      _saveToStorage();
      _emit('remove', { id });
    }
  }

  // ── Clear all ─────────────────────────────────────────────────
  function clear(type = null) {
    if (type) {
      _notifications = _notifications.filter(n => n.type !== type);
    } else {
      _notifications = [];
    }
    _unreadCount = _notifications.filter(n => !n.read).length;
    _saveToStorage();
    _emit('clear', { type });
  }

  // ── Get notifications ──────────────────────────────────────────
  function getAll(type = null) {
    if (!type) return [..._notifications];
    return _notifications.filter(n => n.type === type);
  }

  // ── Get unread count ──────────────────────────────────────────
  function getUnreadCount() { return _unreadCount; }

  // ── Subscribe to changes ──────────────────────────────────────
  function subscribe(fn) {
    _listeners.push(fn);
    return () => { const i = _listeners.indexOf(fn); if (i > -1) _listeners.splice(i, 1); };
  }

  return { add, markRead, markAllRead, remove, clear, getAll, getUnreadCount, subscribe };
})();
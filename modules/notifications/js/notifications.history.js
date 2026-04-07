/* ============================================================
   NavBus — Notification History Panel
   Slide-in drawer showing all past notifications.
   Attached to a bell icon in the header.
   ============================================================ */

const NotificationHistory = (() => {

  let _isOpen        = false;
  let _activeFilter  = 'all';
  let _unsubscribe   = null;

  // ── Ensure DOM exists ────────────────────────────────────────
  function _ensureDOM() {
    if (document.getElementById('nbHistoryPanel')) return;

    // Overlay
    const overlay = document.createElement('div');
    overlay.id    = 'nbHistoryOverlay';
    overlay.className = 'nb-history-overlay';
    overlay.addEventListener('click', close);
    document.body.appendChild(overlay);

    // Panel
    const panel = document.createElement('div');
    panel.id    = 'nbHistoryPanel';
    panel.className = 'nb-history-panel';
    panel.innerHTML = `
      <!-- Header -->
      <div class="nb-history-header">
        <div class="nb-history-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" stroke-width="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          Notifications
          <span id="nbHistoryUnread" style="
            padding:2px 8px;border-radius:99px;
            background:rgba(201,168,76,0.12);
            border:1px solid rgba(201,168,76,0.25);
            font-size:0.6rem;font-weight:700;
            letter-spacing:0.12em;color:#c9a84c;
          ">0</span>
        </div>
        <button class="nb-history-close" id="nbHistoryCloseBtn">✕</button>
      </div>

      <!-- Filter tabs -->
      <div class="nb-filter-tabs">
        <button class="nb-filter-tab active" data-filter="all">All</button>
        <button class="nb-filter-tab" data-filter="arriving">Arriving</button>
        <button class="nb-filter-tab" data-filter="delayed">Delayed</button>
        <button class="nb-filter-tab" data-filter="missed">Missed</button>
      </div>

      <!-- List -->
      <div class="nb-history-list" id="nbHistoryList">
        <!-- Populated by JS -->
      </div>

      <!-- Footer -->
      <div class="nb-history-footer">
        <button class="nb-clear-btn" id="nbClearBtn">Clear all</button>
      </div>`;

    document.body.appendChild(panel);

    // Wire close
    panel.querySelector('#nbHistoryCloseBtn').addEventListener('click', close);

    // Wire filter tabs
    panel.querySelectorAll('.nb-filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        panel.querySelectorAll('.nb-filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        _activeFilter = tab.dataset.filter;
        _render();
      });
    });

    // Wire clear
    panel.querySelector('#nbClearBtn').addEventListener('click', () => {
      NotificationStore.clear(_activeFilter === 'all' ? null : _activeFilter);
    });

    // Subscribe to store changes
    _unsubscribe = NotificationStore.subscribe((event) => {
      if (_isOpen) _render();
      _updateBell();
    });
  }

  // ── Render history list ───────────────────────────────────────
  function _render() {
    const listEl  = document.getElementById('nbHistoryList');
    const unreadEl = document.getElementById('nbHistoryUnread');
    if (!listEl) return;

    const notifications = NotificationStore.getAll(_activeFilter === 'all' ? null : _activeFilter);
    const unread        = NotificationStore.getUnreadCount();

    if (unreadEl) unreadEl.textContent = unread > 0 ? unread : '';

    if (notifications.length === 0) {
      listEl.innerHTML = `
        <div class="nb-history-empty">
          <div class="nb-history-empty-icon">🔔</div>
          <div class="nb-history-empty-text">No notifications yet</div>
        </div>`;
      return;
    }

    const icons = {
      arriving: '⏱',
      delayed:  '⚠',
      missed:   '✕',
    };

    listEl.innerHTML = notifications.map(n => `
      <div class="nb-history-item ${n.type} ${n.read ? 'nb-read' : ''}"
        data-id="${n.id}"
        onclick="NotificationHistory.handleItemClick('${n.id}')">
        <div class="nb-history-icon">${icons[n.type] || '🔔'}</div>
        <div class="nb-history-body">
          <span class="nb-history-msg">${_esc(n.title)}</span>
          <span class="nb-history-time">${_timeAgo(n.createdAt)}</span>
        </div>
        ${!n.read ? '<div class="nb-history-unread-dot"></div>' : ''}
      </div>`).join('');
  }

  // ── Handle history item click ─────────────────────────────────
  function handleItemClick(id) {
    NotificationStore.markRead(id);
    _render();
    _updateBell();
  }

  // ── Update bell badge ─────────────────────────────────────────
  function _updateBell() {
    const count   = NotificationStore.getUnreadCount();
    const badges  = document.querySelectorAll('.nb-bell-badge');
    badges.forEach(badge => {
      badge.textContent    = count > 0 ? (count > 99 ? '99+' : count) : '';
      badge.style.display  = count > 0 ? 'flex' : 'none';
    });
  }

  // ── Open / close ─────────────────────────────────────────────
  function open() {
    _ensureDOM();
    _isOpen = true;
    _render();
    NotificationStore.markAllRead();
    _render(); // re-render after marking read

    document.getElementById('nbHistoryPanel')?.classList.add('open');
    document.getElementById('nbHistoryOverlay')?.classList.add('open');
    document.body.style.overflow = 'hidden';
    _updateBell();
  }

  function close() {
    _isOpen = false;
    document.getElementById('nbHistoryPanel')?.classList.remove('open');
    document.getElementById('nbHistoryOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  function toggle() {
    _isOpen ? close() : open();
  }

  // ── Build bell button HTML ────────────────────────────────────
  function buildBellButton(options = {}) {
    const count = NotificationStore.getUnreadCount();
    return `
      <button class="nb-bell-btn"
        id="${options.id || 'nbBellBtn'}"
        onclick="NotificationHistory.toggle()"
        title="Notifications"
        aria-label="Open notifications">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <span class="nb-bell-badge" style="display:${count > 0 ? 'flex' : 'none'};">
          ${count > 99 ? '99+' : count}
        </span>
      </button>`;
  }

  // ── Helpers ───────────────────────────────────────────────────
  function _timeAgo(dateStr) {
    if (!dateStr) return '—';
    const sec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (sec < 10)  return 'Just now';
    if (sec < 60)  return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60)  return `${min}m ago`;
    const hr  = Math.floor(min / 60);
    if (hr < 24)   return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  }

  function _esc(s) {
    if (!s) return '';
    return String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { open, close, toggle, buildBellButton, handleItemClick };
})();
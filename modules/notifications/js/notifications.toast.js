/* ============================================================
   NavBus — Toast Renderer
   Creates and animates DOM toast elements.
   Called by NotificationEngine when a new notification arrives.
   ============================================================ */

const NotificationToast = (() => {

  const DURATION_MS   = 6000;  // Auto-dismiss after 6s
  const MAX_VISIBLE   = 4;     // Max toasts on screen at once
  let   _containerId  = 'navbusToastContainer';

  // ── Ensure container exists ───────────────────────────────────
  function _getContainer() {
    let el = document.getElementById(_containerId);
    if (!el) {
      el            = document.createElement('div');
      el.id         = _containerId;
      document.body.appendChild(el);
    }
    return el;
  }

  // ── Icon SVG per type ─────────────────────────────────────────
  function _getIcon(type) {
    const icons = {
      arriving: `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>`,
      delayed: `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>`,
      missed: `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>`,
    };
    return icons[type] || icons.arriving;
  }

  // ── Label per type ────────────────────────────────────────────
  function _getLabel(type) {
    return { arriving: 'Arriving', delayed: 'Delayed', missed: 'Missed Bus' }[type] || type;
  }

  // ── Build meta line ───────────────────────────────────────────
  function _buildMeta(type, meta) {
    const items = [];

    if (type === 'arriving') {
      if (meta.eta_minutes != null) {
        items.push(`
          <span class="nb-meta-item">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            ETA ${meta.eta_minutes} min
          </span>`);
      }
      if (meta.stops_away != null) {
        items.push(`<span class="nb-meta-item">📍 ${meta.stops_away} stop${meta.stops_away !== 1 ? 's' : ''} away</span>`);
      }
      if (meta.stop_name) {
        items.push(`<span class="nb-meta-item">🚏 ${_esc(meta.stop_name)}</span>`);
      }
    }

    if (type === 'delayed') {
      if (meta.delay_minutes != null) {
        items.push(`<span class="nb-meta-item">⏱ Delayed ~${meta.delay_minutes} min</span>`);
      }
      if (meta.original_time) {
        items.push(`<span class="nb-meta-item">Was ${_esc(meta.original_time)}</span>`);
      }
      if (meta.new_time) {
        items.push(`<span class="nb-meta-item">Now ${_esc(meta.new_time)}</span>`);
      }
    }

    if (type === 'missed') {
      if (meta.left_minutes_ago != null) {
        items.push(`<span class="nb-meta-item">Left ${meta.left_minutes_ago} min ago</span>`);
      }
      if (meta.next_bus_minutes != null) {
        items.push(`<span class="nb-meta-item">🚌 Next in ${meta.next_bus_minutes} min</span>`);
      }
    }

    return items.length > 0
      ? `<div class="nb-meta">${items.join('')}</div>`
      : '';
  }

  // ── Show a toast ──────────────────────────────────────────────
  function show(notification) {
    const container = _getContainer();

    // Limit visible toasts
    const existing = container.querySelectorAll('.nb-toast');
    if (existing.length >= MAX_VISIBLE) {
      // Remove oldest (last child)
      _dismiss(existing[existing.length - 1], false);
    }

    const { id, type, plate, route, routeName, title, message, meta } = notification;
    const label     = _getLabel(type);
    const icon      = _getIcon(type);
    const metaHtml  = _buildMeta(type, meta || {});
    const routeStr  = route ? `Route ${_esc(route)}${routeName ? ' · ' + _esc(routeName) : ''}` : (message || '');

    const toast = document.createElement('div');
    toast.className  = `nb-toast nb-toast-${type}`;
    toast.id         = `toast-${id}`;
    toast.dataset.id = id;

    toast.innerHTML = `
      <!-- Icon -->
      <div class="nb-icon-wrap">${icon}</div>

      <!-- Content -->
      <div class="nb-content">
        <div class="nb-top-row">
          <span class="nb-type-badge">${_esc(label)}</span>
          <span class="nb-plate">${_esc(plate)}</span>
        </div>
        <div class="nb-title">${_esc(title)}</div>
        <div class="nb-sub">${routeStr}</div>
        ${metaHtml}
      </div>

      <!-- Dismiss -->
      <button class="nb-dismiss" aria-label="Dismiss">✕</button>

      <!-- Progress bar -->
      <div class="nb-progress-track">
        <div class="nb-progress-bar" id="progress-${id}"></div>
      </div>`;

    // Prepend (newest at top)
    container.insertBefore(toast, container.firstChild);

    // Trigger entry animation
    requestAnimationFrame(() => {
      toast.style.transition = 'opacity 0.4s cubic-bezier(0.16,1,0.3,1), transform 0.4s cubic-bezier(0.16,1,0.3,1)';
      toast.style.opacity    = '1';
      toast.style.transform  = 'translateX(0)';
    });

    // Progress bar countdown
    const progressEl = document.getElementById(`progress-${id}`);
    if (progressEl) {
      progressEl.style.transition = `transform ${DURATION_MS}ms linear`;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          progressEl.style.transform = 'scaleX(0)';
        });
      });
    }

    // Click to open history
    toast.addEventListener('click', (e) => {
      if (e.target.classList.contains('nb-dismiss') || e.target.closest('.nb-dismiss')) return;
      NotificationStore.markRead(id);
      NotificationHistory.open();
    });

    // Dismiss button
    toast.querySelector('.nb-dismiss')?.addEventListener('click', (e) => {
      e.stopPropagation();
      _dismiss(toast, true);
    });

    // Auto-dismiss
    const timer = setTimeout(() => _dismiss(toast, true), DURATION_MS);
    toast.dataset.timer = timer;

    // Pause on hover
    toast.addEventListener('mouseenter', () => {
      clearTimeout(parseInt(toast.dataset.timer));
      if (progressEl) progressEl.style.animationPlayState = 'paused';
    });

    toast.addEventListener('mouseleave', () => {
      const remaining = 2000; // 2s remaining after hover
      if (progressEl) {
        progressEl.style.transition = `transform ${remaining}ms linear`;
        progressEl.style.transform  = 'scaleX(0)';
      }
      const t = setTimeout(() => _dismiss(toast, true), remaining);
      toast.dataset.timer = t;
    });

    return toast;
  }

  // ── Dismiss a toast ───────────────────────────────────────────
  function _dismiss(toast, animate = true) {
    clearTimeout(parseInt(toast.dataset.timer));

    if (!animate) {
      toast.remove();
      return;
    }

    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease, max-height 0.3s ease 0.15s, padding 0.3s ease 0.15s, margin 0.3s ease 0.15s';
    toast.style.opacity    = '0';
    toast.style.transform  = 'translateX(60px)';

    setTimeout(() => {
      toast.style.maxHeight  = '0';
      toast.style.paddingTop = '0';
      toast.style.paddingBottom = '0';
      toast.style.marginBottom  = '0';
      toast.style.overflow   = 'hidden';
    }, 200);

    setTimeout(() => toast.remove(), 600);
  }

  // ── Dismiss all ───────────────────────────────────────────────
  function dismissAll() {
    const container = _getContainer();
    container.querySelectorAll('.nb-toast').forEach(t => _dismiss(t, true));
  }

  function _esc(s) {
    if (!s) return '';
    return String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { show, dismissAll };
})();
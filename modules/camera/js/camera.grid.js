/* ============================================================
   NavBus — Camera Grid Manager
   Builds the 2×2 (or other layout) camera grid for a bus,
   mounts all streams, manages layout switching and fullscreen.
   ============================================================ */

const CameraGrid = (() => {

  let _currentBus    = null;
  let _currentLayout = '2x2';
  let _cellEls       = [];

  // Layout definitions
  const LAYOUTS = {
    '2x2':   { class: 'layout-2x2',  label: '2×2' },
    '1-3':   { class: 'layout-1-3',  label: '1+3' },
    'row':   { class: 'layout-row',  label: 'Row' },
    '1x1':   { class: 'layout-1x1',  label: 'Full' },
  };

  // ── Render the grid for a bus ─────────────────────────────────
  function render(bus, containerId, layout = '2x2') {
    _currentBus    = bus;
    _currentLayout = layout;

    const container = document.getElementById(containerId);
    if (!container) return;

    // Stop previous players
    CameraPlayer.destroyAll();
    CameraStatus.stop();
    CameraStatus.clear();

    // Clear container
    container.innerHTML = '';

    // Create grid wrapper
    const grid = document.createElement('div');
    grid.className = `cam-grid ${LAYOUTS[layout]?.class || 'layout-2x2'}`;
    grid.id        = 'camGrid';
    container.appendChild(grid);

    _cellEls = [];
    const statusCells = [];

    bus.cameras.forEach((camera, index) => {
      const cell = _buildCell(camera, bus.number_plate, index);
      grid.appendChild(cell);
      _cellEls.push(cell);
      if (camera.url) statusCells.push({ cellEl: cell, camera });
    });

    // Register for status monitoring
    CameraStatus.register(statusCells);
    CameraStatus.start();

    // Mount all streams with slight stagger
    bus.cameras.forEach((camera, i) => {
      setTimeout(() => {
        CameraPlayer.mount(_cellEls[i], camera, bus.number_plate);
      }, i * 200);
    });

    return grid;
  }

  // ── Build a single camera cell ─────────────────────────────────
  function _buildCell(camera, busPlate, index) {
    const cell = document.createElement('div');
    cell.className       = 'cam-cell';
    cell.dataset.cellId  = `cell-${camera.position}-${Date.now()}`;
    cell.dataset.position = camera.position;

    cell.innerHTML = `
      <!-- Video area -->
      <div class="cam-video-wrap">
        <!-- Content inserted by CameraPlayer -->
      </div>

      <!-- Position label (top-left) -->
      <div class="cam-position-label">
        <span class="cam-position-icon">${camera.icon}</span>
        <span class="cam-position-text">${camera.label}</span>
      </div>

      <!-- Status badge (top-right) -->
      <div class="cam-stream-status loading">
        <span class="cam-status-dot"></span>
        <span class="cam-status-text">Loading…</span>
      </div>

      <!-- Bottom bar (hover reveal) -->
      <div class="cam-cell-bar">
        <div class="cam-cell-actions">
          <button class="cam-cell-btn snap" title="Snapshot" data-action="snap" data-position="${camera.position}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
          <button class="cam-cell-btn full" title="Fullscreen" data-action="full" data-position="${camera.position}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>
            </svg>
          </button>
          ${!camera.url ? '' : `
          <button class="cam-cell-btn" title="Reload Stream" data-action="reload" data-position="${camera.position}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-.02-9.5"/>
            </svg>
          </button>`}
        </div>
        <span class="cam-cell-time" id="cellTime-${camera.position}">—</span>
      </div>`;

    // Click listeners for bottom bar actions
    cell.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action   = btn.dataset.action;
      const position = btn.dataset.position;

      if (action === 'snap') {
        CameraSnapshot.capture(cell, busPlate, position);
      } else if (action === 'full') {
        openFullscreen(cell, busPlate, camera);
      } else if (action === 'reload') {
        CameraPlayer.destroy(cell.dataset.cellId);
        CameraPlayer.mount(cell, camera, busPlate);
      }
    });

    return cell;
  }

  // ── Switch grid layout ────────────────────────────────────────
  function setLayout(layout) {
    if (!LAYOUTS[layout]) return;
    _currentLayout = layout;

    const grid = document.getElementById('camGrid');
    if (!grid) return;

    // Remove old layout class
    Object.values(LAYOUTS).forEach(l => grid.classList.remove(l.class));
    grid.classList.add(LAYOUTS[layout].class);

    // Update layout btn states
    document.querySelectorAll('.cam-layout-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.layout === layout);
    });
  }

  // ── Open fullscreen modal ─────────────────────────────────────
  function openFullscreen(cellEl, busPlate, camera) {
    const modal    = document.getElementById('camFullscreenModal');
    const content  = document.getElementById('camFullscreenContent');
    const plateEl  = document.getElementById('camFullscreenPlate');
    const posEl    = document.getElementById('camFullscreenPos');
    if (!modal || !content) return;

    // Populate header
    if (plateEl) plateEl.textContent = busPlate || '—';
    if (posEl)   posEl.textContent   = (camera.label || 'Camera').toUpperCase();

    // Clone media element
    content.innerHTML = '';
    const media = CameraPlayer.getMediaElement(cellEl);

    if (media) {
      const clone = media.cloneNode(true);
      clone.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:0;';
      if (clone.tagName === 'VIDEO') {
        clone.muted = true;
        clone.play().catch(() => {});
      }
      content.appendChild(clone);
    } else if (camera.url) {
      // Create fresh player in fullscreen
      const tempCell  = document.createElement('div');
      tempCell.className = 'cam-cell';
      const wrapEl       = document.createElement('div');
      wrapEl.className   = 'cam-video-wrap';
      wrapEl.style.cssText = 'width:100%;height:100%;';
      tempCell.appendChild(wrapEl);
      content.appendChild(wrapEl);
      CameraPlayer.mount(tempCell, camera, busPlate);
    } else {
      content.innerHTML = `
        <div style="text-align:center;color:#6e6354;padding:40px;">
          <div style="font-size:3rem;margin-bottom:16px;opacity:0.4;">📷</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:0.9rem;letter-spacing:0.14em;text-transform:uppercase;">No stream available</div>
        </div>`;
    }

    modal.classList.add('open');
    document.addEventListener('keydown', _fullscreenKeyHandler);
  }

  // ── Close fullscreen ──────────────────────────────────────────
  function closeFullscreen() {
    const modal = document.getElementById('camFullscreenModal');
    if (modal) modal.classList.remove('open');
    document.removeEventListener('keydown', _fullscreenKeyHandler);

    // Stop any videos inside fullscreen content
    const content = document.getElementById('camFullscreenContent');
    content?.querySelectorAll('video').forEach(v => v.pause());
    if (content) content.innerHTML = '';
  }

  function _fullscreenKeyHandler(e) {
    if (e.key === 'Escape') closeFullscreen();
  }

  // ── Clear grid ────────────────────────────────────────────────
  function clear(containerId) {
    CameraPlayer.destroyAll();
    CameraStatus.stop();
    CameraStatus.clear();
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';
    _cellEls    = [];
    _currentBus = null;
  }

  // ── Update cell timestamps every second ───────────────────────
  function startCellTimestamps() {
    setInterval(() => {
      const now = new Date().toTimeString().slice(0, 8);
      document.querySelectorAll('[id^="cellTime-"]').forEach(el => {
        el.textContent = now;
      });
    }, 1000);
  }

  return {
    render,
    setLayout,
    openFullscreen,
    closeFullscreen,
    clear,
    startCellTimestamps,
    LAYOUTS,
  };
})();

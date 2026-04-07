/* ============================================================
   NavBus — Camera Player
   Handles HLS.js, MJPEG, plain video, and snapshot streams.
   Provides a unified API: CameraPlayer.mount(cellEl, camera)
   ============================================================ */

const CameraPlayer = (() => {

  // HLS CDN (loaded on demand)
  const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js';
  let _hlsLoaded = false;

  // Map<cellId, { hls, type, url, retryTimer, retryCount }>
  const _players = new Map();
  const MAX_RETRIES = 3;

  // ── Load HLS.js if not yet loaded ─────────────────────────────
  async function _ensureHLS() {
    if (window.Hls || _hlsLoaded) return;
    return new Promise((resolve, reject) => {
      const s  = document.createElement('script');
      s.src    = HLS_CDN;
      s.onload = () => { _hlsLoaded = true; resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ── Mount a camera into a cell element ────────────────────────
  // camera = { position, label, icon, url, type, hasUrl }
  async function mount(cellEl, camera, busPlate) {
    const cellId = cellEl.dataset.cellId || (cellEl.dataset.cellId = `cam-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    // Destroy any existing player
    destroy(cellId);

    const wrapEl = cellEl.querySelector('.cam-video-wrap');
    if (!wrapEl) return;

    // Clear previous content (except overlay elements)
    wrapEl.querySelectorAll('video, img.cam-video, img.cam-mjpeg, .cam-no-stream').forEach(e => e.remove());

    if (!camera.url) {
      _showNoStream(wrapEl, camera, null);
      _setStatusBadge(cellEl, 'offline');
      return;
    }

    _showLoading(wrapEl);
    _setStatusBadge(cellEl, 'loading');

    try {
      switch (camera.type) {
        case 'hls':
          await _mountHLS(cellId, cellEl, wrapEl, camera, busPlate);
          break;
        case 'mjpeg':
        case 'unknown': // try as MJPEG img
          _mountMJPEG(cellId, cellEl, wrapEl, camera);
          break;
        case 'snapshot':
          _mountSnapshot(cellId, cellEl, wrapEl, camera);
          break;
        case 'video':
          _mountVideo(cellId, cellEl, wrapEl, camera);
          break;
        case 'rtsp':
          _showNoStream(wrapEl, camera, 'RTSP streams require a proxy (e.g. go2rtc or MediaMTX).');
          _setStatusBadge(cellEl, 'offline');
          break;
        default:
          _mountMJPEG(cellId, cellEl, wrapEl, camera);
      }
    } catch (err) {
      console.error('[CameraPlayer] Mount error:', err);
      _showError(wrapEl, 'Stream error');
      _setStatusBadge(cellEl, 'offline');
    }

    _players.set(cellId, { type: camera.type, url: camera.url, retryCount: 0, retryTimer: null });
  }

  // ── HLS.js player ─────────────────────────────────────────────
  async function _mountHLS(cellId, cellEl, wrapEl, camera) {
    await _ensureHLS();
    _hideLoading(wrapEl);

    const video = document.createElement('video');
    video.className  = 'cam-video';
    video.autoplay   = true;
    video.muted      = true;
    video.playsInline = true;
    video.controls   = false;
    wrapEl.appendChild(video);

    if (window.Hls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });

      hls.loadSource(camera.url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
        _setStatusBadge(cellEl, 'live');
        _hideLoading(wrapEl);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          _onStreamError(cellId, cellEl, wrapEl, camera);
        }
      });

      const entry = _players.get(cellId) || {};
      entry.hls = hls;
      _players.set(cellId, entry);

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari)
      video.src = camera.url;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {});
        _setStatusBadge(cellEl, 'live');
        _hideLoading(wrapEl);
      });
      video.addEventListener('error', () => _onStreamError(cellId, cellEl, wrapEl, camera));
    } else {
      _showNoStream(wrapEl, camera, 'HLS not supported in this browser.');
      _setStatusBadge(cellEl, 'offline');
    }
  }

  // ── MJPEG stream via <img> ─────────────────────────────────────
  function _mountMJPEG(cellId, cellEl, wrapEl, camera) {
    const img = document.createElement('img');
    img.className = 'cam-mjpeg';
    img.alt       = `${camera.label} camera`;

    // Add cache-buster to force fresh frames if it's a snapshot endpoint
    img.src = camera.url + (camera.url.includes('?') ? '&' : '?') + '_t=' + Date.now();

    img.onload = () => {
      _hideLoading(wrapEl);
      _setStatusBadge(cellEl, 'live');
    };

    img.onerror = () => {
      _onStreamError(cellId, cellEl, wrapEl, camera);
    };

    wrapEl.appendChild(img);
  }

  // ── Refreshing snapshot (poll every N seconds) ─────────────────
  function _mountSnapshot(cellId, cellEl, wrapEl, camera, refreshMs = 2000) {
    const img = document.createElement('img');
    img.className = 'cam-mjpeg';
    img.alt       = `${camera.label} snapshot`;

    const loadFrame = () => {
      const url = camera.url + (camera.url.includes('?') ? '&' : '?') + '_t=' + Date.now();
      const tempImg = new Image();
      tempImg.onload = () => {
        img.src = tempImg.src;
        _hideLoading(wrapEl);
        _setStatusBadge(cellEl, 'live');
      };
      tempImg.onerror = () => {};
      tempImg.src = url;
    };

    loadFrame();
    wrapEl.appendChild(img);

    const entry = _players.get(cellId) || {};
    entry.refreshTimer = setInterval(loadFrame, refreshMs);
    _players.set(cellId, entry);
  }

  // ── Plain video (MP4/WebM) ─────────────────────────────────────
  function _mountVideo(cellId, cellEl, wrapEl, camera) {
    const video = document.createElement('video');
    video.className   = 'cam-video';
    video.autoplay    = true;
    video.muted       = true;
    video.playsInline = true;
    video.loop        = true;
    video.src         = camera.url;

    video.onloadeddata = () => {
      video.play().catch(() => {});
      _hideLoading(wrapEl);
      _setStatusBadge(cellEl, 'live');
    };

    video.onerror = () => _onStreamError(cellId, cellEl, wrapEl, camera);

    wrapEl.appendChild(video);
  }

  // ── Stream error + retry ───────────────────────────────────────
  function _onStreamError(cellId, cellEl, wrapEl, camera) {
    const entry = _players.get(cellId) || {};
    entry.retryCount = (entry.retryCount || 0) + 1;
    _players.set(cellId, entry);

    _setStatusBadge(cellEl, 'offline');

    if (entry.retryCount <= MAX_RETRIES) {
      _showLoading(wrapEl, `Retrying (${entry.retryCount}/${MAX_RETRIES})…`);
      entry.retryTimer = setTimeout(async () => {
        await mount(cellEl, camera);
      }, 4000 * entry.retryCount);
    } else {
      _showError(wrapEl, 'Stream unavailable');
    }
  }

  // ── Destroy a player ──────────────────────────────────────────
  function destroy(cellId) {
    const entry = _players.get(cellId);
    if (!entry) return;

    if (entry.hls) { entry.hls.destroy(); }
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    if (entry.refreshTimer) clearInterval(entry.refreshTimer);

    _players.delete(cellId);
  }

  // ── Destroy all ───────────────────────────────────────────────
  function destroyAll() {
    _players.forEach((_, id) => destroy(id));
  }

  // ── Get current video/img element from a cell ─────────────────
  function getMediaElement(cellEl) {
    const wrap = cellEl.querySelector('.cam-video-wrap');
    return wrap?.querySelector('video, img.cam-mjpeg') || null;
  }

  // ── UI helpers ────────────────────────────────────────────────
  function _showLoading(wrapEl, text = 'Connecting to stream…') {
    _removeOverlays(wrapEl);
    const el = document.createElement('div');
    el.className = 'cam-loading-overlay';
    el.innerHTML = `
      <div class="cam-loading-spinner"></div>
      <div class="cam-loading-text">${_esc(text)}</div>`;
    wrapEl.appendChild(el);
  }

  function _hideLoading(wrapEl) {
    wrapEl.querySelector('.cam-loading-overlay')?.remove();
  }

  function _showNoStream(wrapEl, camera, hint = null) {
    _removeOverlays(wrapEl);
    const el = document.createElement('div');
    el.className = 'cam-no-stream';
    el.innerHTML = `
      <div class="cam-no-stream-icon">📷</div>
      <div class="cam-no-stream-title">No Stream Configured</div>
      ${hint ? `<div class="cam-no-stream-url">${_esc(hint)}</div>` :
        camera.url ? `<div class="cam-no-stream-url">${_esc(camera.url)}</div>` :
        '<div class="cam-no-stream-url">Camera URL not set for this position</div>'}`;
    wrapEl.appendChild(el);
  }

  function _showError(wrapEl, msg) {
    _removeOverlays(wrapEl);
    const el = document.createElement('div');
    el.className = 'cam-error-overlay';
    el.innerHTML = `
      <div class="cam-error-icon">⚠️</div>
      <div class="cam-error-msg">${_esc(msg)}</div>
      <button class="cam-retry-btn" onclick="this.closest('.cam-error-overlay').remove();">Retry</button>`;
    wrapEl.appendChild(el);
  }

  function _removeOverlays(wrapEl) {
    wrapEl.querySelectorAll('.cam-loading-overlay, .cam-error-overlay, .cam-no-stream').forEach(e => e.remove());
  }

  function _setStatusBadge(cellEl, status) {
    const badge = cellEl.querySelector('.cam-stream-status');
    if (!badge) return;

    badge.className = `cam-stream-status ${status}`;
    const labels = { live: 'Live', offline: 'Offline', loading: 'Loading…' };
    badge.querySelector('.cam-status-text').textContent = labels[status] || status;
  }

  function _esc(s) {
    return String(s || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { mount, destroy, destroyAll, getMediaElement };
})();

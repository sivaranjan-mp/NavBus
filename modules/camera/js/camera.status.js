/* ============================================================
   NavBus — Camera Status Monitor
   Periodically pings image/video URLs to check if streams
   are alive. Updates cell badges accordingly.
   Runs every 30 seconds in the background.
   ============================================================ */

const CameraStatus = (() => {

  let _intervalId  = null;
  let _activeCells = [];  // Array<{ cellEl, camera }>
  const CHECK_MS   = 30_000;

  // ── Register cells to monitor ─────────────────────────────────
  function register(cells) {
    _activeCells = cells;
  }

  // ── Clear registered cells ────────────────────────────────────
  function clear() {
    _activeCells = [];
  }

  // ── Start background checks ───────────────────────────────────
  function start() {
    if (_intervalId) return;
    _intervalId = setInterval(_checkAll, CHECK_MS);
    console.log('[CameraStatus] Heartbeat started');
  }

  // ── Stop ──────────────────────────────────────────────────────
  function stop() {
    if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }
  }

  // ── Check all registered streams ─────────────────────────────
  async function _checkAll() {
    for (const { cellEl, camera } of _activeCells) {
      if (!camera.url) continue;
      if (camera.type === 'rtsp') continue; // can't check RTSP from browser

      const alive = await _ping(camera.url, camera.type);
      _updateBadge(cellEl, alive ? 'live' : 'offline');
    }
  }

  // ── Ping a URL to see if it responds ─────────────────────────
  async function _ping(url, type) {
    try {
      if (type === 'hls') {
        // Fetch the m3u8 playlist
        const r = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(5000) });
        return r.ok;
      } else {
        // Try loading as image
        return new Promise((resolve) => {
          const img     = new Image();
          const timeout = setTimeout(() => { img.src = ''; resolve(false); }, 5000);
          img.onload  = () => { clearTimeout(timeout); resolve(true); };
          img.onerror = () => { clearTimeout(timeout); resolve(false); };
          img.src = url + (url.includes('?') ? '&' : '?') + '_ping=' + Date.now();
        });
      }
    } catch {
      return false;
    }
  }

  // ── Update a single cell badge ────────────────────────────────
  function _updateBadge(cellEl, status) {
    const badge = cellEl?.querySelector('.cam-stream-status');
    if (!badge) return;
    badge.className = `cam-stream-status ${status}`;
    const labels = { live: 'Live', offline: 'Offline', loading: 'Loading…' };
    const textEl = badge.querySelector('.cam-status-text');
    if (textEl) textEl.textContent = labels[status] || status;
  }

  return { register, clear, start, stop };
})();

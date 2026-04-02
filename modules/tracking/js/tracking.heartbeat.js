/* ============================================================
   NavBus — Heartbeat Monitor
   Periodically checks for stale devices and marks them offline.
   Runs every 30 seconds. A bus is considered offline if no GPS
   ping has been received for STALE_MS milliseconds.
   ============================================================ */

const TrackingHeartbeat = (() => {

  let _intervalId = null;
  const CHECK_INTERVAL_MS = 30_000; // check every 30s

  function start() {
    if (_intervalId) return;
    _intervalId = setInterval(_checkAllBuses, CHECK_INTERVAL_MS);
    console.log('[Heartbeat] Monitor started — checking every 30s');
  }

  function stop() {
    if (_intervalId) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
  }

  function _checkAllBuses() {
    const buses = BusState.getAll();
    let staleCount = 0;

    buses.forEach(bus => {
      if (bus.status === 'online' && BusState.isStale(bus.device_id)) {
        console.log(`[Heartbeat] Bus ${bus.number_plate} (${bus.device_id}) is stale → marking offline`);
        BusState.markOffline(bus.device_id);
        staleCount++;
      }
    });

    if (staleCount > 0) {
      console.log(`[Heartbeat] ${staleCount} bus(es) marked offline`);
    }

    // Update HUD counts
    window.dispatchEvent(new CustomEvent('navbus:counts_update'));
  }

  // ── Force a manual check ─────────────────────────────────────
  function checkNow() { _checkAllBuses(); }

  return { start, stop, checkNow };
})();

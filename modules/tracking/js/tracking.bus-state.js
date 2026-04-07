/* ============================================================
   NavBus — Bus State Manager
   In-memory store of all bus states. Single source of truth
   for the tracking UI.
   ============================================================ */

const BusState = (() => {

  // Map<device_id, busObject>
  const _state = new Map();

  // Map<device_id, gps record>
  const _lastGPS = new Map();

  // Listeners for UI updates
  const _listeners = [];

  // ── Register a listener ─────────────────────────────────────
  function onUpdate(fn) {
    _listeners.push(fn);
  }

  function _emit(event, payload) {
    _listeners.forEach(fn => {
      try { fn(event, payload); } catch(e) { console.warn('[BusState] listener error:', e); }
    });
  }

  // ── Initialize all buses from DB ─────────────────────────────
  function initBuses(busArray) {
    busArray.forEach(bus => {
      _state.set(bus.device_id, {
        ...bus,
        // Runtime state — not from DB
        _visible: bus.is_active && bus.status !== 'maintenance',
        _lastPing: null,
        _pingCount: 0,
      });
    });
    _emit('init', getAllVisible());
  }

  // ── Update GPS position for a device ─────────────────────────
  // Called when a new row arrives in bus_status via realtime
  function updateGPS(gpsRow) {
    const { device_id, latitude, longitude, speed_kmh, heading_deg, recorded_at } = gpsRow;

    const bus = _state.get(device_id);
    if (!bus) {
      // Device not registered in buses table — ignore
      console.warn('[BusState] Unknown device_id:', device_id);
      return null;
    }

    // Update GPS fields on the bus object
    bus.latitude     = latitude;
    bus.longitude    = longitude;
    bus.speed_kmh    = speed_kmh || 0;
    bus.heading_deg  = heading_deg || 0;
    bus.status       = 'online';
    bus._lastPing    = new Date(recorded_at || Date.now());
    bus._pingCount   = (bus._pingCount || 0) + 1;
    bus._visible     = true;

    // Store full gps row
    _lastGPS.set(device_id, gpsRow);

    _state.set(device_id, bus);
    _emit('gps_update', { bus, gpsRow });
    return bus;
  }

  // ── Mark a bus offline (called by heartbeat) ─────────────────
  function markOffline(device_id) {
    const bus = _state.get(device_id);
    if (!bus || bus.status === 'offline') return;
    bus.status   = 'offline';
    bus._visible = false;
    _state.set(device_id, bus);
    _emit('bus_offline', { bus });
  }

  // ── Get all buses currently visible (online + active) ────────
  function getAllVisible() {
    return Array.from(_state.values()).filter(b => b._visible);
  }

  // ── Get all buses (for roster, including offline) ─────────────
  function getAll() {
    return Array.from(_state.values()).filter(b => b.is_active);
  }

  // ── Get a single bus by device_id ─────────────────────────────
  function getByDeviceId(device_id) {
    return _state.get(device_id) || null;
  }

  // ── Get last GPS row for a device ────────────────────────────
  function getLastGPS(device_id) {
    return _lastGPS.get(device_id) || null;
  }

  // ── Check if bus is stale (no ping in X ms) ───────────────────
  function isStale(device_id, thresholdMs = 120000) {
    const bus = _state.get(device_id);
    if (!bus || !bus._lastPing) return true;
    return (Date.now() - bus._lastPing.getTime()) > thresholdMs;
  }

  // ── Count helpers ─────────────────────────────────────────────
  function countOnline()  { return Array.from(_state.values()).filter(b => b.status === 'online'  && b.is_active).length; }
  function countOffline() { return Array.from(_state.values()).filter(b => b.status === 'offline' && b.is_active).length; }
  function countTotal()   { return Array.from(_state.values()).filter(b => b.is_active).length; }

  return {
    onUpdate,
    initBuses,
    updateGPS,
    markOffline,
    getAllVisible,
    getAll,
    getByDeviceId,
    getLastGPS,
    isStale,
    countOnline,
    countOffline,
    countTotal,
  };
})();
/* ============================================================
   NavBus — GPS Trail Renderer
   Draws a fading polyline trail for the selected bus.
   ============================================================ */

const TrackingTrail = (() => {

  let _map         = null;
  let _activeLine  = null;
  let _device_id   = null;
  const MAX_POINTS = 60;  // Keep last 60 GPS points in trail

  // Map<device_id, Array<[lat, lng]>>
  const _trails = new Map();

  function init(mapInstance) {
    _map = mapInstance;
  }

  // ── Add a GPS point to a device's trail ──────────────────────
  function addPoint(device_id, lat, lng) {
    if (lat == null || lng == null) return;

    if (!_trails.has(device_id)) {
      _trails.set(device_id, []);
    }

    const trail = _trails.get(device_id);
    trail.push([lat, lng]);

    // Trim to max points
    if (trail.length > MAX_POINTS) {
      trail.splice(0, trail.length - MAX_POINTS);
    }

    // If this is the active trail, redraw
    if (_device_id === device_id) {
      _redraw(device_id);
    }
  }

  // ── Show trail for a specific bus ────────────────────────────
  function showTrail(device_id) {
    _device_id = device_id;
    _clearLine();
    _redraw(device_id);
  }

  // ── Hide trail ───────────────────────────────────────────────
  function hideTrail() {
    _clearLine();
    _device_id = null;
  }

  // ── Redraw the active trail ───────────────────────────────────
  function _redraw(device_id) {
    if (!_map) return;
    const points = _trails.get(device_id);
    if (!points || points.length < 2) return;

    _clearLine();

    _activeLine = L.polyline(points, {
      color:     'rgba(201,168,76,0.7)',
      weight:    2.5,
      opacity:   1,
      lineCap:   'round',
      lineJoin:  'round',
      dashArray: '6, 4',
    }).addTo(_map);
  }

  function _clearLine() {
    if (_activeLine && _map) {
      _activeLine.remove();
      _activeLine = null;
    }
  }

  // ── Clear trail data for a device ────────────────────────────
  function clearTrail(device_id) {
    _trails.delete(device_id);
    if (_device_id === device_id) { _clearLine(); }
  }

  // ── Clear all trails ─────────────────────────────────────────
  function clearAll() {
    _clearLine();
    _trails.clear();
    _device_id = null;
  }

  // ── Preload last N GPS points from DB for a bus ───────────────
  async function preloadFromDB(device_id, limit = 40) {
    const { data } = await NAVBUS_DB
      .from('bus_status')
      .select('latitude, longitude, recorded_at')
      .eq('device_id', device_id)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (!data || data.length === 0) return;

    // Reverse so oldest is first
    const points = data.reverse();
    _trails.set(device_id, points.map(p => [p.latitude, p.longitude]));

    if (_device_id === device_id) _redraw(device_id);
  }

  return { init, addPoint, showTrail, hideTrail, clearTrail, clearAll, preloadFromDB };
})();

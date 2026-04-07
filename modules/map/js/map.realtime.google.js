/* ============================================================
   NavBus — Google Maps Realtime GPS Bridge
   Bridges Supabase Realtime → NavBusMarkers + UI updates.
   This replaces tracking.realtime.js for the Google Maps page.
   ============================================================ */

const NavBusRealtimeGoogle = (() => {

  let _channel      = null;
  let _isConnected  = false;
  let _reconnectTimer = null;
  let _reconnectDelay = 2000;

  // Callbacks
  let _onGPS        = null;
  let _onConnect    = null;
  let _onDisconnect = null;

  // ── Start ─────────────────────────────────────────────────────
  async function start(callbacks = {}) {
    _onGPS        = callbacks.onGPS        || null;
    _onConnect    = callbacks.onConnect    || null;
    _onDisconnect = callbacks.onDisconnect || null;

    _setStatus('connecting');

    _channel = NAVBUS_DB
      .channel('navbus_google_tracking')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bus_status' },
        _onInsert
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          _isConnected    = true;
          _reconnectDelay = 2000;
          _setStatus('connected');
          if (_onConnect) _onConnect();
          console.log('[NavBusRealtimeGoogle] ✓ Subscribed');
        } else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) {
          _isConnected = false;
          _setStatus('disconnected');
          if (_onDisconnect) _onDisconnect();
          _scheduleReconnect();
        }
      });
  }

  // ── Handle INSERT on bus_status ───────────────────────────────
  function _onInsert(payload) {
    const gps = payload.new;
    if (!gps?.device_id || gps.latitude == null) return;

    console.log(`[Realtime] GPS → ${gps.device_id} | ${gps.latitude.toFixed(5)},${gps.longitude.toFixed(5)} | ${gps.speed_kmh?.toFixed(1)} km/h`);

    if (_onGPS) _onGPS(gps);
  }

  // ── Stop ──────────────────────────────────────────────────────
  async function stop() {
    clearTimeout(_reconnectTimer);
    if (_channel) {
      await NAVBUS_DB.removeChannel(_channel);
      _channel = null;
    }
    _isConnected = false;
    _setStatus('disconnected');
  }

  // ── Reconnect ─────────────────────────────────────────────────
  function _scheduleReconnect() {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = setTimeout(async () => {
      await stop();
      await start({ onGPS: _onGPS, onConnect: _onConnect, onDisconnect: _onDisconnect });
      _reconnectDelay = Math.min(_reconnectDelay * 2, 30000);
    }, _reconnectDelay);
  }

  // ── Update connection bar UI ──────────────────────────────────
  function _setStatus(status) {
    const bar  = document.getElementById('gmapConnBar');
    const text = document.getElementById('gmapConnText');
    if (!bar || !text) return;

    bar.className = `gmap-conn-bar ${status}`;
    const labels = {
      connected:    '● Realtime Connected',
      connecting:   '◌ Connecting…',
      disconnected: '✕ Disconnected',
    };
    text.textContent = labels[status] || status;
  }

  function isConnected() { return _isConnected; }

  return { start, stop, isConnected };
})();
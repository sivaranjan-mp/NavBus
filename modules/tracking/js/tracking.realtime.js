/* ============================================================
   NavBus — Realtime GPS Subscription
   Subscribes to Supabase Realtime on bus_status table.
   When a new GPS row is inserted by the IoT device, this
   fires and updates BusState + map markers.
   ============================================================ */

const TrackingRealtime = (() => {

  let _channel     = null;
  let _isConnected = false;
  let _reconnectTimer = null;
  const MAX_RECONNECT_DELAY = 30_000;
  let _reconnectDelay = 2_000;

  // ── Start subscription ───────────────────────────────────────
  async function start() {
    _setConnectionStatus('connecting');

    _channel = NAVBUS_DB
      .channel('navbus_tracking')
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'bus_status',
        },
        _onGPSInsert
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          _isConnected = true;
          _reconnectDelay = 2_000;
          _setConnectionStatus('connected');
          console.log('[Realtime] ✓ Connected to bus_status channel');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          _isConnected = false;
          _setConnectionStatus('disconnected');
          console.error('[Realtime] Channel error:', err);
          _scheduleReconnect();
        } else if (status === 'CLOSED') {
          _isConnected = false;
          _setConnectionStatus('disconnected');
          _scheduleReconnect();
        }
      });
  }

  // ── Handle new GPS row ───────────────────────────────────────
  function _onGPSInsert(payload) {
    const gpsRow = payload.new;

    if (!gpsRow || !gpsRow.device_id) {
      console.warn('[Realtime] GPS row missing device_id:', gpsRow);
      return;
    }

    // Validate coordinates
    if (gpsRow.latitude == null || gpsRow.longitude == null) {
      console.warn('[Realtime] GPS row missing coordinates:', gpsRow);
      return;
    }

    console.log(`[Realtime] GPS ping — ${gpsRow.device_id} | ${gpsRow.latitude.toFixed(5)},${gpsRow.longitude.toFixed(5)} | ${gpsRow.speed_kmh?.toFixed(1)} km/h`);

    // Update bus state (matches device_id → bus)
    const bus = BusState.updateGPS(gpsRow);
    if (!bus) return; // Unknown device — skip

    // Add to trail
    TrackingTrail.addPoint(gpsRow.device_id, gpsRow.latitude, gpsRow.longitude);

    // Update/create map marker
    TrackingMarker.upsertMarker(bus);

    // Flash the bus card in the list
    window.dispatchEvent(new CustomEvent('navbus:gps_update', {
      detail: { device_id: gpsRow.device_id, bus, gpsRow }
    }));

    // Update counts in HUD
    window.dispatchEvent(new CustomEvent('navbus:counts_update'));
  }

  // ── Stop subscription ─────────────────────────────────────────
  async function stop() {
    if (_channel) {
      await NAVBUS_DB.removeChannel(_channel);
      _channel = null;
    }
    _isConnected = false;
    _setConnectionStatus('disconnected');
  }

  // ── Reconnect logic ───────────────────────────────────────────
  function _scheduleReconnect() {
    clearTimeout(_reconnectTimer);
    console.log(`[Realtime] Reconnecting in ${_reconnectDelay / 1000}s…`);
    _reconnectTimer = setTimeout(async () => {
      await stop();
      await start();
      _reconnectDelay = Math.min(_reconnectDelay * 2, MAX_RECONNECT_DELAY);
    }, _reconnectDelay);
  }

  // ── Update connection bar UI ──────────────────────────────────
  function _setConnectionStatus(status) {
    const bar  = document.getElementById('connectionBar');
    const text = document.getElementById('connectionText');
    if (!bar || !text) return;

    bar.className = `connection-bar ${status}`;

    const labels = {
      connected:    '● Realtime — Connected',
      connecting:   '◌ Realtime — Connecting…',
      disconnected: '✕ Realtime — Disconnected',
    };
    text.textContent = labels[status] || status;
  }

  // ── Public status ─────────────────────────────────────────────
  function isConnected() { return _isConnected; }

  return { start, stop, isConnected };
})();

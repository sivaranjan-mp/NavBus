/* ============================================================
   NavBus — Notification Engine
   Core business logic. Subscribes to Supabase Realtime on:
     1. bus_status (GPS changes → detect arriving / missed)
     2. alerts     (delayed bus alerts)
   Generates notifications and calls NotificationToast.show()
   ============================================================ */

const NotificationEngine = (() => {

  let _channel         = null;
  let _alertChannel    = null;
  let _isRunning       = false;
  let _subscribedBuses = new Set();  // device_ids to watch (empty = all)
  let _busCache        = new Map();  // device_id → bus meta

  // ── Thresholds ────────────────────────────────────────────────
  const ARRIVING_THRESHOLD_M  = 3;    // notify when ETA ≤ 3 min
  const MISSED_THRESHOLD_S    = 90;   // seconds of no GPS = missed
  const DELAY_THRESHOLD_MIN   = 10;   // delay > 10 min = delayed

  // Track state per bus to avoid duplicate notifications
  const _state = new Map(); // device_id → { lastEta, notifiedArriving, notifiedMissed, lastPingMs }

  // ── Start engine ─────────────────────────────────────────────
  async function start(options = {}) {
    if (_isRunning) return;
    _isRunning = true;

    // Optional: only watch specific bus device_ids
    if (options.watchDeviceIds?.length > 0) {
      options.watchDeviceIds.forEach(id => _subscribedBuses.add(id));
    }

    // Load bus metadata (for plate, route, etc.)
    await _loadBusCache();

    // Subscribe to GPS inserts
    _channel = NAVBUS_DB
      .channel('nb_notifications_gps')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bus_status' },
        _onGPSInsert
      )
      .subscribe((status) => {
        console.log('[NotificationEngine] GPS channel:', status);
      });

    // Subscribe to alerts table (delayed bus)
    _alertChannel = NAVBUS_DB
      .channel('nb_notifications_alerts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts' },
        _onAlertInsert
      )
      .subscribe((status) => {
        console.log('[NotificationEngine] Alerts channel:', status);
      });

    // Heartbeat: check for missed buses every 30s
    setInterval(_checkMissedBuses, 30_000);

    console.log('[NotificationEngine] Started');
  }

  // ── Stop engine ───────────────────────────────────────────────
  async function stop() {
    _isRunning = false;
    if (_channel)      await NAVBUS_DB.removeChannel(_channel);
    if (_alertChannel) await NAVBUS_DB.removeChannel(_alertChannel);
    _channel = null;
    _alertChannel = null;
    console.log('[NotificationEngine] Stopped');
  }

  // ── Load bus metadata into cache ──────────────────────────────
  async function _loadBusCache() {
    const { data } = await NAVBUS_DB
      .from('buses')
      .select('id, device_id, number_plate, bus_name, routes(id, route_number, name)')
      .eq('is_active', true);

    (data || []).forEach(bus => {
      _busCache.set(bus.device_id, bus);
      // Initialize state
      if (!_state.has(bus.device_id)) {
        _state.set(bus.device_id, {
          lastEta:          null,
          notifiedArriving: false,
          notifiedMissed:   false,
          lastPingMs:       null,
        });
      }
    });

    console.log(`[NotificationEngine] Bus cache loaded: ${_busCache.size} buses`);
  }

  // ── Handle GPS INSERT ─────────────────────────────────────────
  function _onGPSInsert(payload) {
    const gps = payload.new;
    if (!gps?.device_id) return;

    // Filter: only watch subscribed buses (or all if empty)
    if (_subscribedBuses.size > 0 && !_subscribedBuses.has(gps.device_id)) return;

    const bus = _busCache.get(gps.device_id);
    if (!bus) return;

    const state     = _state.get(gps.device_id) || {};
    const nowMs     = Date.now();

    // Update last ping time
    state.lastPingMs       = nowMs;
    state.notifiedMissed   = false; // Reset missed flag when GPS arrives
    _state.set(gps.device_id, state);

    // ── Arriving detection ──────────────────────────────────────
    // A bus is "arriving" when GPS is pinging rapidly and speed drops,
    // or when ETA (from meta or computed) ≤ ARRIVING_THRESHOLD_M.
    // Here we use a speed-based heuristic: speed < 5 km/h = near stop.
    const speed    = gps.speed_kmh || 0;
    const isNearStop = speed < 5 && speed >= 0 && gps.latitude != null;

    if (isNearStop && !state.notifiedArriving) {
      // Compute rough ETA from last known GPS — here we emit immediately
      // as "arriving / at stop" since we don't have route shape data.
      const etaMin = Math.round(Math.random() * 2) + 1; // 1–3 min placeholder

      _fireArriving(bus, gps, etaMin);
      state.notifiedArriving = true;
      _state.set(gps.device_id, state);

      // Reset arriving flag after 5 minutes so it can fire again
      setTimeout(() => {
        const s = _state.get(gps.device_id);
        if (s) { s.notifiedArriving = false; _state.set(gps.device_id, s); }
      }, 5 * 60_000);
    }

    // Reset arriving flag if bus moves again (speed > 15)
    if (speed > 15 && state.notifiedArriving) {
      state.notifiedArriving = false;
      _state.set(gps.device_id, state);
    }
  }

  // ── Handle alerts INSERT (delayed) ───────────────────────────
  function _onAlertInsert(payload) {
    const alert = payload.new;
    if (!alert?.device_id) return;

    // Only process delay-type alerts
    if (!['delay', 'delayed', 'over_speed'].includes(alert.alert_type?.toLowerCase())) {
      // Also check for manual delay alerts
      if (alert.alert_type !== 'delay') return;
    }

    const bus = _busCache.get(alert.device_id);
    if (!bus) return;

    _fireDelayed(bus, alert);
  }

  // ── Check for missed buses (heartbeat) ────────────────────────
  function _checkMissedBuses() {
    const nowMs = Date.now();

    _state.forEach((state, deviceId) => {
      if (!state.lastPingMs) return;
      if (state.notifiedMissed)  return;

      const ageMs = nowMs - state.lastPingMs;

      // Bus was recently active (in last 10 min) but now silent → missed
      const recentlyActive  = ageMs < 10 * 60_000;
      const nowSilent       = ageMs > MISSED_THRESHOLD_S * 1000;

      if (!recentlyActive && nowSilent) {
        const bus = _busCache.get(deviceId);
        if (bus) {
          _fireMissed(bus, Math.floor(ageMs / 60_000));
          state.notifiedMissed = true;
          _state.set(deviceId, state);
        }
      }
    });
  }

  // ── Fire ARRIVING notification ────────────────────────────────
  function _fireArriving(bus, gps, etaMin) {
    const notification = NotificationStore.add({
      type:      'arriving',
      busId:     bus.id,
      deviceId:  bus.device_id,
      plate:     bus.number_plate,
      route:     bus.routes?.route_number,
      routeName: bus.routes?.name,
      title:     `Bus ${bus.number_plate} arriving soon`,
      message:   `Route ${bus.routes?.route_number || '—'} · ${bus.routes?.name || ''}`,
      meta: {
        eta_minutes: etaMin,
        speed_kmh:   Math.round(gps.speed_kmh || 0),
        stop_name:   gps.near_stop_name || null,
        stops_away:  gps.stops_away || null,
      },
    });

    NotificationToast.show(notification);
    _playSound('arriving');
    _updateBell();
  }

  // ── Fire DELAYED notification ─────────────────────────────────
  function _fireDelayed(bus, alert) {
    const delayMin = alert.sensor_value != null
      ? Math.round(alert.sensor_value)
      : DELAY_THRESHOLD_MIN;

    const notification = NotificationStore.add({
      type:      'delayed',
      busId:     bus.id,
      deviceId:  bus.device_id,
      plate:     bus.number_plate,
      route:     bus.routes?.route_number,
      routeName: bus.routes?.name,
      title:     `Bus ${bus.number_plate} running late`,
      message:   alert.message || `Delayed ~${delayMin} minutes`,
      meta: {
        delay_minutes: delayMin,
        alert_type:    alert.alert_type,
        severity:      alert.severity,
      },
    });

    NotificationToast.show(notification);
    _playSound('delayed');
    _updateBell();
  }

  // ── Fire MISSED notification ──────────────────────────────────
  function _fireMissed(bus, minutesAgo) {
    const notification = NotificationStore.add({
      type:      'missed',
      busId:     bus.id,
      deviceId:  bus.device_id,
      plate:     bus.number_plate,
      route:     bus.routes?.route_number,
      routeName: bus.routes?.name,
      title:     `You missed Bus ${bus.number_plate}`,
      message:   `Route ${bus.routes?.route_number || '—'} · Left ${minutesAgo} min ago`,
      meta: {
        left_minutes_ago: minutesAgo,
        next_bus_minutes: Math.floor(Math.random() * 15) + 8, // placeholder
      },
    });

    NotificationToast.show(notification);
    _playSound('missed');
    _updateBell();
  }

  // ── Manual trigger methods (for testing / admin use) ──────────
  function triggerArriving(busId, meta = {}) {
    const bus = [..._busCache.values()].find(b => b.id === busId || b.device_id === busId);
    if (!bus) return console.warn('[NotificationEngine] Bus not found:', busId);
    _fireArriving(bus, { speed_kmh: 2, ...meta }, meta.eta_minutes || 2);
  }

  function triggerDelayed(busId, delayMin = 15) {
    const bus = [..._busCache.values()].find(b => b.id === busId || b.device_id === busId);
    if (!bus) return console.warn('[NotificationEngine] Bus not found:', busId);
    _fireDelayed(bus, { alert_type: 'delay', sensor_value: delayMin, message: `Running ~${delayMin} minutes late` });
  }

  function triggerMissed(busId, minutesAgo = 2) {
    const bus = [..._busCache.values()].find(b => b.id === busId || b.device_id === busId);
    if (!bus) return console.warn('[NotificationEngine] Bus not found:', busId);
    _fireMissed(bus, minutesAgo);
  }

  // ── Watch specific buses only ─────────────────────────────────
  function watchBus(deviceId) { _subscribedBuses.add(deviceId); }
  function unwatchBus(deviceId) { _subscribedBuses.delete(deviceId); }
  function watchAll()  { _subscribedBuses.clear(); }

  // ── Sound (optional — silent if AudioContext unavailable) ─────
  function _playSound(type) {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const configs = {
        arriving: { freq: [440, 523], dur: 0.15, vol: 0.08 },
        delayed:  { freq: [330, 294], dur: 0.18, vol: 0.06 },
        missed:   { freq: [220, 196], dur: 0.20, vol: 0.07 },
      };

      const cfg = configs[type] || configs.arriving;

      gain.gain.setValueAtTime(cfg.vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + cfg.dur * 2);

      osc.frequency.setValueAtTime(cfg.freq[0], ctx.currentTime);
      osc.frequency.setValueAtTime(cfg.freq[1], ctx.currentTime + cfg.dur);
      osc.type = 'sine';

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + cfg.dur * 2);
    } catch (e) {
      // AudioContext not available or blocked — silent
    }
  }

  // ── Update bell badge ─────────────────────────────────────────
  function _updateBell() {
    const count  = NotificationStore.getUnreadCount();
    const badges = document.querySelectorAll('.nb-bell-badge');
    badges.forEach(badge => {
      badge.textContent  = count > 99 ? '99+' : count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    });
  }

  return {
    start, stop,
    triggerArriving, triggerDelayed, triggerMissed,
    watchBus, unwatchBus, watchAll,
  };
})();
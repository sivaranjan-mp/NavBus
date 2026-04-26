/* ============================================================
   NavBus — User Live Track Logic
   Loads a single bus, shows its position on map,
   subscribes to realtime GPS updates from Supabase.
   ============================================================ */

let _map          = null;
let _marker       = null;
let _trail        = null;
let _trailPoints  = [];
let _channel      = null;
let _busData      = null;
let _lastPingDate = null;
const MAX_TRAIL   = 50;

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const busId = new URLSearchParams(window.location.search).get('id');
  if (!busId) {
    showOfflineOverlay('Invalid bus ID. Please go back and select a bus.');
    return;
  }

  // Load bus data
  await loadBus(busId);

  // Init map
  initMap();

  // Load trail history
  await loadTrailHistory();

  // Subscribe to realtime GPS
  subscribeGPS();

  // Start last-seen ticker
  startLastSeenTicker();
});

// ── Load bus ──────────────────────────────────────────────────
async function loadBus(busId) {
  const { data: bus, error } = await NAVBUS_DB
    .from('buses')
    .select(`
      id, device_id, number_plate, bus_name, bus_model,
      bus_type, capacity, status, is_active,
      routes(id, route_number, name, origin, destination),
      drivers(id, name, phone)
    `)
    .eq('id', busId)
    .single();

  if (error || !bus) {
    showOfflineOverlay('Bus not found or has been removed.');
    return;
  }

  _busData = bus;
  populateHeader(bus);

  // Load latest GPS
  const { data: gps } = await NAVBUS_DB
    .from('bus_status')
    .select('latitude, longitude, speed_kmh, heading_deg, recorded_at')
    .eq('device_id', bus.device_id)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();

  if (gps) {
    _lastPingDate = new Date(gps.recorded_at);
    const stale   = (Date.now() - _lastPingDate.getTime()) > 90_000;

    if (stale) {
      bus.status    = 'offline';
      bus.latitude  = gps.latitude;
      bus.longitude = gps.longitude;
      bus.speed_kmh = 0;
    } else {
      bus.latitude    = gps.latitude;
      bus.longitude   = gps.longitude;
      bus.speed_kmh   = gps.speed_kmh   || 0;
      bus.heading_deg = gps.heading_deg || 0;
    }

    updateSheetStats(bus, gps);
  } else {
    showOfflineOverlay('No GPS data available for this bus yet.');
  }
}

// ── Populate header ───────────────────────────────────────────
function populateHeader(bus) {
  const plateEl = document.getElementById('trackPlate');
  const routeEl = document.getElementById('trackRoute');
  if (plateEl) plateEl.textContent = bus.number_plate;
  if (routeEl) routeEl.textContent =
    bus.routes
      ? `${bus.routes.route_number} — ${bus.routes.name}`
      : (bus.bus_name || 'No route assigned');

  // Page title
  document.title = `NavBus — ${bus.number_plate}`;
}

// ── Init Leaflet map ──────────────────────────────────────────
function initMap() {
  const center = (_busData?.latitude && _busData?.longitude)
    ? [_busData.latitude, _busData.longitude]
    : [20.5937, 78.9629];

  _map = L.map('userTrackMap', {
    center,
    zoom:             _busData?.latitude ? 16 : 5,
    zoomControl:      false,
    attributionControl: false,
    preferCanvas:     true,
  });

  L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 19,
  }).addTo(_map);

  // Place marker if we have GPS
  if (_busData?.latitude != null) {
    placeOrUpdateMarker(_busData.latitude, _busData.longitude, _busData.heading_deg || 0, _busData.status);
  }
}

// ── Load GPS trail from DB ────────────────────────────────────
async function loadTrailHistory() {
  if (!_busData?.device_id) return;

  const { data } = await NAVBUS_DB
    .from('bus_status')
    .select('latitude, longitude, recorded_at')
    .eq('device_id', _busData.device_id)
    .order('recorded_at', { ascending: false })
    .limit(MAX_TRAIL);

  if (!data || data.length < 2) return;

  _trailPoints = data.reverse().map(p => [p.latitude, p.longitude]);
  drawTrail();
}

// ── Draw / update trail ───────────────────────────────────────
function drawTrail() {
  if (!_map || _trailPoints.length < 2) return;
  if (_trail) { _trail.remove(); }

  _trail = L.polyline(_trailPoints, {
    color:     'rgba(201,168,76,0.6)',
    weight:    2,
    opacity:   1,
    dashArray: '5, 4',
    lineCap:   'round',
  }).addTo(_map);
}

// ── Place or update bus marker ────────────────────────────────
function placeOrUpdateMarker(lat, lng, heading, status) {
  if (!_map) return;

  const isOnline = status === 'online';
  const color    = isOnline ? '#4ade80' : '#475569';
  const glow     = isOnline ? 'rgba(74,222,128,0.4)' : 'transparent';
  const pulse    = isOnline ? 'animation:markerBeat 2s ease-in-out infinite;' : '';

  const arrowHtml = isOnline ? `
    <div style="
      position:absolute;top:-10px;left:50%;
      transform:translateX(-50%) rotate(${heading || 0}deg);
      width:0;height:0;
      border-left:6px solid transparent;
      border-right:6px solid transparent;
      border-bottom:12px solid ${color};
      filter:drop-shadow(0 0 4px ${color});
    "></div>` : '';

  const iconHtml = `
    <style>
      @keyframes markerBeat {
        0%,100% { box-shadow: 0 0 0 0 ${glow}, 0 4px 20px rgba(0,0,0,0.6); }
        50%      { box-shadow: 0 0 0 10px transparent, 0 4px 20px rgba(0,0,0,0.6); }
      }
    </style>
    <div style="position:relative;display:flex;align-items:center;justify-content:center;">
      ${arrowHtml}
      <div style="
        width:46px;height:46px;border-radius:50%;
        background:rgba(8,8,6,0.9);
        border:2.5px solid ${color};
        display:flex;align-items:center;justify-content:center;
        font-size:20px;
        ${pulse}
        box-shadow:0 0 16px ${glow}, 0 4px 20px rgba(0,0,0,0.7);
        z-index:1;position:relative;
      ">🚌</div>
      <div style="
        position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);
        background:rgba(8,8,6,0.92);
        border:1px solid ${color};border-radius:5px;
        padding:2px 8px;
        font-family:'JetBrains Mono',monospace;font-size:10px;
        color:${color};white-space:nowrap;letter-spacing:0.08em;
      ">${_busData?.number_plate || '—'}</div>
    </div>`;

  const icon = L.divIcon({
    className: '',
    html: iconHtml,
    iconSize:   [46, 68],
    iconAnchor: [23, 23],
  });

  if (_marker) {
    _marker.setLatLng([lat, lng]);
    _marker.setIcon(icon);
  } else {
    _marker = L.marker([lat, lng], { icon }).addTo(_map);
  }
}

// ── Update bottom sheet ───────────────────────────────────────
function updateSheetStats(bus, gps) {
  const stale  = !gps?.recorded_at || (Date.now() - new Date(gps.recorded_at).getTime()) > 90_000;
  const status = stale ? 'offline' : 'online';
  const speed  = gps?.speed_kmh != null ? `${Math.round(gps.speed_kmh)} km/h` : '—';
  const head   = gps?.heading_deg != null ? `${headingToCardinal(gps.heading_deg)} ${Math.round(gps.heading_deg)}°` : '—';
  const coord  = gps?.latitude ? `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}` : '—';
  const driver = bus.drivers?.name || '—';
  const type   = bus.bus_type || bus.bus_model || '—';

  setEl('sheetBusName', bus.number_plate);
  setEl('sheetSpeed',   speed);
  setEl('sheetHeading', head);
  setEl('sheetDriver',  driver);
  setEl('sheetType',    type);
  setEl('sheetCoords',  coord);
  setEl('sheetRoute',   bus.routes ? `${bus.routes.route_number || ''} ${bus.routes.name || ''}`.trim() : '—');

  // Status indicator
  const statusEl = document.getElementById('sheetStatus');
  if (statusEl) {
    statusEl.innerHTML = status === 'online'
      ? `<span style="color:#4ade80;">●</span> <span style="color:#4ade80;">Live</span>`
      : `<span style="color:#475569;">●</span> <span style="color:#6e6354;">Offline</span>`;
  }

  // Coords row
  setEl('sheetCoordsValue', coord);

  if (status === 'offline') {
    document.getElementById('offlineOverlay')?.classList.add('show');
  } else {
    document.getElementById('offlineOverlay')?.classList.remove('show');
  }
}

// ── Realtime GPS subscription ─────────────────────────────────
function subscribeGPS() {
  if (!_busData?.device_id) return;
  if (_channel) NAVBUS_DB.removeChannel(_channel);

  _channel = NAVBUS_DB
    .channel(`track_${_busData.device_id}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'bus_status',
        filter: `device_id=eq.${_busData.device_id}`,
      },
      (payload) => {
        const gps = payload.new;
        if (!gps || gps.latitude == null) return;

        // Update state
        _lastPingDate   = new Date(gps.recorded_at || Date.now());
        _busData.status = 'online';

        // Update marker position
        placeOrUpdateMarker(gps.latitude, gps.longitude, gps.heading_deg || 0, 'online');

        // Pan map smoothly
        _map?.panTo([gps.latitude, gps.longitude], { animate: true, duration: 0.8 });

        // Update trail
        _trailPoints.push([gps.latitude, gps.longitude]);
        if (_trailPoints.length > MAX_TRAIL) {
          _trailPoints.splice(0, _trailPoints.length - MAX_TRAIL);
        }
        drawTrail();

        // Update bottom sheet
        updateSheetStats(_busData, gps);
        updateLastSeenDisplay();

        // Remove offline overlay
        document.getElementById('offlineOverlay')?.classList.remove('show');
      }
    )
    .subscribe((status) => {
      console.log('[Track] Realtime status:', status);
    });
}

// ── Last-seen ticker ──────────────────────────────────────────
function startLastSeenTicker() {
  updateLastSeenDisplay();
  setInterval(updateLastSeenDisplay, 8_000);

  // Auto-offline check every 30s
  setInterval(() => {
    if (_lastPingDate && (Date.now() - _lastPingDate.getTime()) > 90_000) {
      document.getElementById('offlineOverlay')?.classList.add('show');
    }
  }, 30_000);
}

function updateLastSeenDisplay() {
  const el = document.getElementById('lastSeenText');
  if (!el) return;
  if (!_lastPingDate) { el.textContent = 'No GPS data'; return; }
  const sec = Math.floor((Date.now() - _lastPingDate.getTime()) / 1000);
  if (sec <  5)  { el.textContent = 'Just now'; return; }
  if (sec < 60)  { el.textContent = `${sec}s ago`; return; }
  const min = Math.floor(sec / 60);
  el.textContent = min < 60 ? `${min}m ago` : `${Math.floor(min/60)}h ago`;
}

// ── Utils ─────────────────────────────────────────────────────
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val || '—';
}

function headingToCardinal(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round((deg || 0) / 45) % 8];
}

function showOfflineOverlay(msg) {
  const overlay = document.getElementById('offlineOverlay');
  const sub     = document.getElementById('offlineSub');
  if (overlay) overlay.classList.add('show');
  if (sub && msg) sub.textContent = msg;
}

// ── Cleanup on page leave ────────────────────────────────────
window.addEventListener('beforeunload', () => {
  if (_channel) NAVBUS_DB.removeChannel(_channel);
});
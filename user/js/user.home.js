/* ============================================================
   NavBus — User Home Logic
   - Stop autocomplete (search origin/destination)
   - Search buses by route
   - Show best option
   - Show all available buses
   ============================================================ */

let ALL_STOPS   = [];
let ALL_ROUTES  = [];
let ALL_BUSES   = [];
let searchTimer = null;

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([
    loadStops(),
    loadRoutes(),
    loadAvailableBuses(),
  ]);

  initSearch();
  initSwapBtn();
  initRecentSearches();
  renderAllRoutes();
});

// ── Load all stops (for autocomplete) ────────────────────────
async function loadStops() {
  const { data } = await NAVBUS_DB
    .from('stops')
    .select('id, name, code, route_id, sequence_order, routes(id, route_number, name)')
    .eq('is_active', true)
    .order('name');

  ALL_STOPS = data || [];
}

// ── Load all active routes ────────────────────────────────────
async function loadRoutes() {
  const { data } = await NAVBUS_DB
    .from('routes')
    .select('id, route_number, name, origin, destination, total_distance_km, estimated_duration_min')
    .eq('is_active', true)
    .order('route_number');

  ALL_ROUTES = data || [];
}

// ── Load available (online) buses with latest GPS ─────────────
async function loadAvailableBuses() {
  showBusSkeleton('onlineBusesList', 3);

  // 1. Get all active buses
  const { data: buses } = await NAVBUS_DB
    .from('buses')
    .select(`
      id, device_id, number_plate, bus_name, bus_model,
      bus_type, capacity, status, is_active,
      routes(id, route_number, name, origin, destination),
      drivers(id, name, phone)
    `)
    .eq('is_active', true)
    .order('number_plate');

  if (!buses || buses.length === 0) {
    renderBusList('onlineBusesList', [], 'No buses registered.');
    return;
  }

  // 2. Get latest GPS for each bus device
  const deviceIds = buses.map(b => b.device_id);
  const { data: gpsData } = await NAVBUS_DB
    .from('bus_status')
    .select('device_id, latitude, longitude, speed_kmh, heading_deg, recorded_at')
    .in('device_id', deviceIds)
    .order('recorded_at', { ascending: false });

  // Build GPS map (latest per device)
  const gpsMap = {};
  (gpsData || []).forEach(g => {
    if (!gpsMap[g.device_id]) gpsMap[g.device_id] = g;
  });

  // Attach GPS + determine online status
  ALL_BUSES = buses.map(bus => {
    const gps   = gpsMap[bus.device_id];
    const stale = !gps || (Date.now() - new Date(gps.recorded_at).getTime()) > 90_000;
    return {
      ...bus,
      latitude:    gps?.latitude   ?? null,
      longitude:   gps?.longitude  ?? null,
      speed_kmh:   gps?.speed_kmh  ?? 0,
      heading_deg: gps?.heading_deg ?? 0,
      last_ping:   gps?.recorded_at ?? null,
      is_live:     !stale && bus.status === 'online',
    };
  });

  const onlineBuses  = ALL_BUSES.filter(b => b.is_live);
  const allActive    = ALL_BUSES;

  renderBusList('onlineBusesList', onlineBuses, 'No buses are currently online.');
  renderBusList('allBusesList',    allActive,   'No buses registered.');
  renderBestOption(onlineBuses);
  updateFleetStats(onlineBuses.length, allActive.length);
}

// ── Render fleet stats ────────────────────────────────────────
function updateFleetStats(online, total) {
  const el1 = document.getElementById('statOnlineBuses');
  const el2 = document.getElementById('statTotalBuses');
  if (el1) el1.textContent = online;
  if (el2) el2.textContent = total;
}

// ── Render best option banner ─────────────────────────────────
function renderBestOption(onlineBuses) {
  const container = document.getElementById('bestOptionSection');
  if (!container) return;

  if (onlineBuses.length === 0) {
    container.style.display = 'none';
    return;
  }

  // Best bus = online, has GPS, highest speed (most active)
  const best = onlineBuses
    .filter(b => b.latitude != null)
    .sort((a, b) => (b.speed_kmh || 0) - (a.speed_kmh || 0))[0];

  if (!best) { container.style.display = 'none'; return; }

  container.style.display = 'block';
  container.innerHTML = `
    <div class="section-heading">
      <h3>Best Option Now</h3>
    </div>
    <a href="track.html?id=${best.id}" class="best-option-banner stagger-child">
      <div class="best-badge">⭐ Best Match</div>
      <span class="best-plate">${escHtml(best.number_plate)}</span>
      <span class="best-route-name">${escHtml(best.routes?.route_number || '')} ${escHtml(best.routes?.name || best.bus_name || 'No route assigned')}</span>
      <div class="best-stats">
        <div class="best-stat">
          <span class="best-stat-label">Speed</span>
          <span class="best-stat-value">${Math.round(best.speed_kmh || 0)} km/h</span>
        </div>
        <div class="best-stat">
          <span class="best-stat-label">Status</span>
          <span class="best-stat-value">● Live</span>
        </div>
        ${best.routes?.origin ? `
        <div class="best-stat">
          <span class="best-stat-label">From</span>
          <span class="best-stat-value">${escHtml(best.routes.origin.split(' ')[0])}</span>
        </div>` : ''}
      </div>
      <div class="best-track-btn">→</div>
    </a>`;
}

// ── Render bus list ───────────────────────────────────────────
function renderBusList(containerId, buses, emptyMsg = 'No buses found.') {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (buses.length === 0) {
    el.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🚌</div>
        <div class="no-results-title">No Buses</div>
        <div class="no-results-sub">${emptyMsg}</div>
      </div>`;
    return;
  }

  el.innerHTML = `<div class="bus-results-list">
    ${buses.map((bus, i) => buildBusCard(bus, i === 0)).join('')}
  </div>`;

  // Stagger animation
  el.querySelectorAll('.bus-result-card').forEach((card, i) => {
    card.style.animationDelay = `${i * 0.07}s`;
    card.classList.add('stagger-child');
  });
}

// ── Build bus card HTML ───────────────────────────────────────
function buildBusCard(bus, isBest = false) {
  const iconClass   = bus.is_live ? 'online' : 'offline';
  const pillClass   = bus.is_live ? 'online' : 'offline';
  const pillLabel   = bus.is_live ? 'Online'  : 'Offline';
  const speed       = bus.is_live ? `${Math.round(bus.speed_kmh || 0)} km/h` : '—';
  const origin      = bus.routes?.origin      || '—';
  const destination = bus.routes?.destination || '—';
  const routeNum    = bus.routes?.route_number || '';
  const routeName   = bus.routes?.name        || bus.bus_name || 'Unassigned';

  return `
    <div class="bus-result-card ${isBest ? 'best-bus' : ''}"
      onclick="window.location.href='track.html?id=${bus.id}'"
      style="cursor:pointer;">
      <div class="card-top">
        <div class="card-bus-icon ${iconClass}">
          🚌
          <span class="status-ring ${iconClass}"></span>
        </div>
        <div class="card-bus-info">
          <span class="card-plate">${escHtml(bus.number_plate)}</span>
          <span class="card-route">${routeNum ? routeNum + ' · ' : ''}${escHtml(routeName)}</span>
        </div>
        <div class="card-right">
          <div class="status-pill ${pillClass}">
            <span class="status-pill-dot"></span>
            ${pillLabel}
          </div>
          ${bus.is_live ? `<div class="card-speed-chip">${speed}</div>` : ''}
        </div>
      </div>
      <div class="card-bottom">
        <div class="card-stops-row">
          <span class="card-stop">${escHtml(origin.length > 14 ? origin.slice(0,14) + '…' : origin)}</span>
          <span class="card-stop-arrow">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </span>
          <span class="card-stop">${escHtml(destination.length > 14 ? destination.slice(0,14) + '…' : destination)}</span>
        </div>
        <a href="track.html?id=${bus.id}" class="card-track-btn" onclick="event.stopPropagation()">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          Track
        </a>
      </div>
    </div>`;
}

// ── Search buses by source → destination ─────────────────────
function initSearch() {
  const originInput = document.getElementById('originInput');
  const destInput   = document.getElementById('destInput');
  const searchBtn   = document.getElementById('searchBtn');
  const originDrop  = document.getElementById('originDropdown');
  const destDrop    = document.getElementById('destDropdown');

  let selectedOrigin = null;
  let selectedDest   = null;

  // Origin autocomplete
  originInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      showStopDropdown(originInput.value, originDrop, (stop) => {
        selectedOrigin = stop;
        originInput.value = stop.name;
        originDrop.classList.remove('open');
      });
    }, 200);
  });

  // Destination autocomplete
  destInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      showStopDropdown(destInput.value, destDrop, (stop) => {
        selectedDest = stop;
        destInput.value = stop.name;
        destDrop.classList.remove('open');
      });
    }, 200);
  });

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.route-input-wrap')) {
      originDrop?.classList.remove('open');
      destDrop?.classList.remove('open');
    }
  });

  // Search
  searchBtn?.addEventListener('click', async () => {
    const originVal = originInput?.value.trim();
    const destVal   = destInput?.value.trim();

    if (!originVal && !destVal) {
      // No filter — show all available
      renderBusList('searchResultsList', ALL_BUSES.filter(b => b.is_live), 'No online buses found.');
      showSearchResults();
      return;
    }

    setSearchLoading(true);

    // Find matching route
    const results = await searchBuses(originVal, destVal);
    renderSearchResults(results, originVal, destVal);
    saveRecentSearch(originVal, destVal);
    setSearchLoading(false);
    showSearchResults();
  });

  // Enter key
  [originInput, destInput].forEach(inp => {
    inp?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchBtn?.click();
    });
  });
}

// ── Show stop autocomplete dropdown ──────────────────────────
function showStopDropdown(query, dropEl, onSelect) {
  if (!dropEl) return;

  const q = query.toLowerCase().trim();
  if (!q) { dropEl.classList.remove('open'); return; }

  const matches = ALL_STOPS.filter(s =>
    s.name.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q)
  ).slice(0, 6);

  if (matches.length === 0) {
    // Also allow free text
    dropEl.classList.remove('open');
    return;
  }

  dropEl.innerHTML = matches.map(s => `
    <div class="autocomplete-item" data-id="${s.id}">
      <div class="autocomplete-item-icon">📍</div>
      <div class="autocomplete-item-text">
        <span class="autocomplete-item-name">${escHtml(s.name)}</span>
        <span class="autocomplete-item-sub">${s.routes?.route_number ? 'Route ' + escHtml(s.routes.route_number) : ''} ${s.code ? '· ' + escHtml(s.code) : ''}</span>
      </div>
    </div>`).join('');

  dropEl.classList.add('open');

  // Attach click handlers
  dropEl.querySelectorAll('.autocomplete-item').forEach((item, i) => {
    item.addEventListener('click', () => { onSelect(matches[i]); });
  });
}

// ── Search logic: match buses on routes that serve both stops ─
async function searchBuses(originText, destText) {
  if (!originText && !destText) {
    return ALL_BUSES.filter(b => b.is_live);
  }

  // Strategy: filter routes that contain origin/dest in their name
  const matchingRouteIds = ALL_ROUTES
    .filter(r => {
      const haystack = `${r.name} ${r.origin} ${r.destination}`.toLowerCase();
      const originMatch = !originText || haystack.includes(originText.toLowerCase());
      const destMatch   = !destText   || haystack.includes(destText.toLowerCase());
      return originMatch && destMatch;
    })
    .map(r => r.id);

  if (matchingRouteIds.length === 0) {
    // Try partial stop match via DB
    return await searchBusesByStops(originText, destText);
  }

  // Filter buses on matching routes
  return ALL_BUSES.filter(b =>
    b.routes && matchingRouteIds.includes(b.routes.id)
  );
}

// ── DB search: find stops matching text, then buses on those routes
async function searchBusesByStops(originText, destText) {
  // Find routes that have a stop matching origin
  const { data: originStops } = await NAVBUS_DB
    .from('stops')
    .select('route_id')
    .ilike('name', `%${originText}%`)
    .eq('is_active', true);

  const { data: destStops } = destText ? await NAVBUS_DB
    .from('stops')
    .select('route_id')
    .ilike('name', `%${destText}%`)
    .eq('is_active', true) : { data: [] };

  const originRouteIds = new Set((originStops || []).map(s => s.route_id));
  const destRouteIds   = new Set((destStops   || []).map(s => s.route_id));

  // Routes that serve both stops
  let validRouteIds;
  if (originText && destText) {
    validRouteIds = [...originRouteIds].filter(id => destRouteIds.has(id));
  } else if (originText) {
    validRouteIds = [...originRouteIds];
  } else {
    validRouteIds = [...destRouteIds];
  }

  if (validRouteIds.length === 0) return [];

  return ALL_BUSES.filter(b =>
    b.routes && validRouteIds.includes(b.routes.id)
  );
}

// ── Render search results ─────────────────────────────────────
function renderSearchResults(buses, origin, dest) {
  const container = document.getElementById('searchResultsContainer');
  const headerEl  = document.getElementById('searchResultsHeader');
  if (!container) return;

  // Sort: online first
  const sorted = [...buses].sort((a, b) => {
    if (a.is_live && !b.is_live) return -1;
    if (!a.is_live && b.is_live) return  1;
    return 0;
  });

  const count   = sorted.length;
  const onlineN = sorted.filter(b => b.is_live).length;

  if (headerEl) {
    headerEl.innerHTML = `
      <h3>${count} Bus${count !== 1 ? 'es' : ''} Found</h3>
      <span style="font-size:0.72rem;color:var(--text-muted);">${onlineN} online</span>`;
  }

  if (count === 0) {
    container.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <div class="no-results-title">No Matches</div>
        <div class="no-results-sub">No buses found for<br/><strong style="color:var(--gold)">${escHtml(origin || '?')}</strong> → <strong style="color:var(--gold)">${escHtml(dest || '?')}</strong></div>
      </div>`;
    return;
  }

  container.innerHTML = `<div class="bus-results-list">
    ${sorted.map((bus, i) => buildBusCard(bus, i === 0 && bus.is_live)).join('')}
  </div>`;

  container.querySelectorAll('.bus-result-card').forEach((card, i) => {
    card.style.animationDelay = `${i * 0.07}s`;
    card.classList.add('stagger-child');
  });
}

// ── Render all routes ─────────────────────────────────────────
function renderAllRoutes() {
  const el = document.getElementById('allRoutesList');
  if (!el || ALL_ROUTES.length === 0) return;

  el.innerHTML = ALL_ROUTES.slice(0, 8).map(r => `
    <div class="route-list-item stagger-child">
      <span class="route-list-badge">${escHtml(r.route_number)}</span>
      <div class="route-list-info">
        <span class="route-list-name">${escHtml(r.name)}</span>
        <span class="route-list-sub">${escHtml(r.origin)} → ${escHtml(r.destination)}</span>
      </div>
      <svg class="route-list-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>`).join('');
}

// ── Show/hide sections ────────────────────────────────────────
function showSearchResults() {
  document.getElementById('searchResultsSection')?.style.setProperty('display', 'block');
  document.getElementById('searchResultsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Swap origin/dest ──────────────────────────────────────────
function initSwapBtn() {
  document.getElementById('swapBtn')?.addEventListener('click', () => {
    const orig = document.getElementById('originInput');
    const dest = document.getElementById('destInput');
    if (!orig || !dest) return;
    const temp = orig.value;
    orig.value = dest.value;
    dest.value = temp;
  });
}

// ── Recent searches (localStorage) ───────────────────────────
const RECENT_KEY = 'navbus_recent_searches';

function saveRecentSearch(origin, dest) {
  if (!origin && !dest) return;
  const searches = getRecentSearches();
  const entry    = { origin, dest, ts: Date.now() };
  const updated  = [entry, ...searches.filter(s => s.origin !== origin || s.dest !== dest)].slice(0, 5);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(updated)); } catch (e) {}
  renderRecentSearches();
}

function getRecentSearches() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}

function initRecentSearches() {
  renderRecentSearches();
}

function renderRecentSearches() {
  const el = document.getElementById('recentSearches');
  if (!el) return;

  const searches = getRecentSearches();
  if (searches.length === 0) {
    el.innerHTML = '<span style="font-size:0.72rem;color:var(--text-muted);">No recent searches</span>';
    return;
  }

  el.innerHTML = searches.map(s => `
    <div class="recent-chip" onclick="fillSearch('${escAttr(s.origin)}','${escAttr(s.dest)}')">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      ${s.origin ? escHtml(s.origin) : ''}${s.origin && s.dest ? ' → ' : ''}${s.dest ? escHtml(s.dest) : ''}
    </div>`).join('');
}

function fillSearch(origin, dest) {
  const orig = document.getElementById('originInput');
  const dst  = document.getElementById('destInput');
  if (orig) orig.value = origin;
  if (dst)  dst.value  = dest;
  document.getElementById('searchBtn')?.click();
}

// ── Loading helpers ───────────────────────────────────────────
function setSearchLoading(loading) {
  const btn = document.getElementById('searchBtn');
  if (!btn) return;
  if (loading) {
    btn.classList.add('loading');
    btn.innerHTML = `<span class="user-spinner" style="border-top-color:#080806;border-color:rgba(8,8,6,0.3);"></span><span>Searching…</span>`;
  } else {
    btn.classList.remove('loading');
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span>Search Buses</span>`;
  }
}

function showBusSkeleton(containerId, count = 3) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = Array(count).fill(0).map(() => `
    <div class="bus-result-card" style="pointer-events:none;">
      <div class="card-top" style="gap:12px;">
        <div class="skeleton" style="width:44px;height:44px;border-radius:12px;flex-shrink:0;"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
          <div class="skeleton" style="height:14px;width:60%;border-radius:4px;"></div>
          <div class="skeleton" style="height:11px;width:40%;border-radius:4px;"></div>
        </div>
        <div class="skeleton" style="height:24px;width:60px;border-radius:99px;"></div>
      </div>
    </div>`).join('');
}

// ── Utils ─────────────────────────────────────────────────────
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(s) {
  if (!s) return '';
  return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
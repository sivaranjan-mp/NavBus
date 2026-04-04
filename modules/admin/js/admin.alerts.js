/* ============================================================
   NavBus — Admin Alerts Module
   Derives live alerts from: buses (status) + bus_status (GPS) + travel_history
   No separate alerts table required — all data comes from existing tables.
   ============================================================ */

let ALL_ALERTS    = [];
let AUTO_REFRESH  = null;

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadAlerts();

  // Auto-refresh every 30 seconds
  AUTO_REFRESH = setInterval(loadAlerts, 30_000);

  bindFilter();

  document.getElementById('btnMarkAllRead')?.addEventListener('click', markAllRead);
  document.getElementById('btnRefresh')?.addEventListener('click', loadAlerts);
});

// ── Fetch & derive alerts ────────────────────────────────────
async function loadAlerts() {
  setRefreshLoading(true);
  ALL_ALERTS = [];

  // ── 1. Fetch buses in alert / offline status ──────────────
  const { data: alertBuses, error: busErr } = await NAVBUS_DB
    .from('buses')
    .select(`
      id, number_plate, bus_name, status, updated_at,
      drivers ( name ),
      routes  ( route_number, name )
    `)
    .in('status', ['alert', 'offline'])
    .eq('is_active', true);

  if (!busErr && alertBuses?.length) {
    alertBuses.forEach(b => {
      const plate    = b.number_plate;
      const route    = b.routes?.route_number ? `Route ${b.routes.route_number}` : 'Unassigned';
      const driver   = b.drivers?.name || 'No driver assigned';
      const minsAgo  = Math.round((Date.now() - new Date(b.updated_at)) / 60000);
      const isAlert  = b.status === 'alert';

      ALL_ALERTS.push({
        id:       'bus_' + b.id,
        severity: isAlert ? 'critical' : 'warning',
        title:    `${isAlert ? 'Bus Alert' : 'GPS Signal Lost'} — ${plate}`,
        meta:     `${driver} • ${route} • last seen ${minsAgo} min ago`,
        time:     relativeTime(b.updated_at),
        unread:   true,
        source:   'fleet',
      });
    });
  }

  // ── 2. Speed-limit violations in last 60 minutes ─────────
  const since60 = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: speedData } = await NAVBUS_DB
    .from('bus_status')
    .select(`
      device_id, speed_kmh, recorded_at,
      buses!inner ( number_plate, drivers ( name ) )
    `)
    .gt('speed_kmh', 80)
    .gte('recorded_at', since60)
    .order('speed_kmh', { ascending: false })
    .limit(10);

  if (speedData?.length) {
    // De-dup by device
    const seen = new Set();
    speedData.forEach(s => {
      if (seen.has(s.device_id)) return;
      seen.add(s.device_id);
      const plate  = s.buses?.number_plate || s.device_id;
      const driver = s.buses?.drivers?.name || 'Unknown driver';
      ALL_ALERTS.push({
        id:       'spd_' + s.device_id + '_' + s.recorded_at,
        severity: 'warning',
        title:    `Speed Limit Exceeded — ${plate}`,
        meta:     `${driver} reached ${Math.round(s.speed_kmh)} km/h`,
        time:     relativeTime(s.recorded_at),
        unread:   true,
        source:   'speed',
      });
    });
  }

  // ── 3. Cancelled / incomplete trips today ─────────────────
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: failedTrips } = await NAVBUS_DB
    .from('travel_history')
    .select(`
      id, status, created_at,
      buses    ( number_plate ),
      routes   ( route_number ),
      drivers  ( name )
    `)
    .in('status', ['cancelled', 'incomplete'])
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(5);

  if (failedTrips?.length) {
    failedTrips.forEach(t => {
      const plate  = t.buses?.number_plate    || '—';
      const route  = t.routes?.route_number   ? 'Route ' + t.routes.route_number : 'Unknown route';
      const driver = t.drivers?.name || 'Unknown driver';
      ALL_ALERTS.push({
        id:       'trip_' + t.id,
        severity: t.status === 'cancelled' ? 'warning' : 'info',
        title:    `Trip ${t.status === 'cancelled' ? 'Cancelled' : 'Incomplete'} — ${plate}`,
        meta:     `${driver} • ${route}`,
        time:     relativeTime(t.created_at),
        unread:   false,
        source:   'trips',
      });
    });
  }

  // ── 4. License expiry warnings ────────────────────────────
  const in30days = new Date(Date.now() + 30 * 86400_000).toISOString().split('T')[0];
  const { data: expDrivers } = await NAVBUS_DB
    .from('drivers')
    .select('id, name, license_expiry')
    .lte('license_expiry', in30days)
    .eq('is_active', true)
    .order('license_expiry');

  if (expDrivers?.length) {
    expDrivers.forEach(d => {
      const expired = new Date(d.license_expiry) < new Date();
      ALL_ALERTS.push({
        id:       'lic_' + d.id,
        severity: expired ? 'critical' : 'warning',
        title:    `License ${expired ? 'Expired' : 'Expiring Soon'} — ${d.name}`,
        meta:     `License valid until ${d.license_expiry}`,
        time:     expired ? 'Expired' : `Expires in ${Math.ceil((new Date(d.license_expiry)-new Date())/86400_000)} days`,
        unread:   expired,
        source:   'license',
      });
    });
  }

  // Sort: unread first, then by severity
  const sevOrder = { critical:0, warning:1, info:2, success:3 };
  ALL_ALERTS.sort((a, b) => {
    if (a.unread !== b.unread) return a.unread ? -1 : 1;
    return (sevOrder[a.severity]||2) - (sevOrder[b.severity]||2);
  });

  renderAlerts(ALL_ALERTS);
  updateStats(ALL_ALERTS);
  setRefreshLoading(false);
}

// ── Render ────────────────────────────────────────────────────
function renderAlerts(list) {
  const container = document.getElementById('alertsList');
  if (!container) return;

  const countEl = document.getElementById('alertCount');
  if (countEl) countEl.textContent = list.length + ' alert' + (list.length !== 1 ? 's' : '');

  if (!list.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:48px;color:var(--text-muted);">
        🎉 No active alerts — all systems nominal.
      </div>`;
    return;
  }

  const sevMap = {
    critical: ['alert-dot critical', 'sev-critical', 'Critical'],
    warning:  ['alert-dot warning',  'sev-warning',  'Warning'],
    info:     ['alert-dot info',     'sev-info',     'Info'],
    success:  ['alert-dot success',  'sev-success',  'Resolved'],
  };

  container.innerHTML = list.map(a => {
    const [dotCls, badgeCls, label] = sevMap[a.severity] || sevMap.info;
    return `
      <div class="alert-item" style="${a.unread ? 'background:rgba(201,168,76,0.04);' : ''}">
        <div class="${dotCls}"></div>
        <div class="alert-body">
          <div class="alert-title">
            ${escHtml(a.title)}
            ${a.unread ? '<span class="unread-indicator"></span>' : ''}
          </div>
          <div class="alert-meta">${escHtml(a.meta)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
          <span class="severity-badge ${badgeCls}">${label}</span>
          <span class="alert-time">${escHtml(a.time)}</span>
        </div>
      </div>`;
  }).join('');
}

// ── Stats row ─────────────────────────────────────────────────
function updateStats(all) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('statCritical', all.filter(a => a.severity === 'critical').length);
  set('statWarning',  all.filter(a => a.severity === 'warning').length);
  set('statInfo',     all.filter(a => a.severity === 'info').length);
  set('statResolved', all.filter(a => a.severity === 'success').length);

  // Update sidebar badge
  const unread = all.filter(a => a.unread).length;
  const badge  = document.getElementById('sidebarAlertCount');
  if (badge) { badge.textContent = unread || ''; badge.style.display = unread ? '' : 'none'; }
}

// ── Filter ────────────────────────────────────────────────────
function bindFilter() {
  document.getElementById('severityFilter')?.addEventListener('change', applyFilter);
}

function applyFilter() {
  const s = document.getElementById('severityFilter')?.value || 'all';
  renderAlerts(s === 'all' ? ALL_ALERTS : ALL_ALERTS.filter(a => a.severity === s));
}
window.filterAlerts = applyFilter;

// ── Mark all read ─────────────────────────────────────────────
function markAllRead() {
  ALL_ALERTS.forEach(a => a.unread = false);
  renderAlerts(ALL_ALERTS);
  updateStats(ALL_ALERTS);
}
window.markAllRead = markAllRead;

// ── Refresh loading ───────────────────────────────────────────
function setRefreshLoading(on) {
  const btn = document.getElementById('btnRefresh');
  if (btn) btn.disabled = on, btn.textContent = on ? 'Refreshing…' : '↻ Refresh';
}

// ── Utilities ─────────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function relativeTime(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)   return 'Just now';
  if (diff < 3600) return Math.floor(diff/60) + ' min ago';
  if (diff < 86400)return Math.floor(diff/3600) + ' hr ago';
  return Math.floor(diff/86400) + 'd ago';
}

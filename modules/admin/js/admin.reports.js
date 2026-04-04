/* ============================================================
   NavBus — Admin Reports Module
   Queries: fleet_summary, driver_performance, travel_history,
            route_summary views + tables.
   Also provides CSV export for each report type.
   ============================================================ */

let CURRENT_PERIOD = 'today';

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadReports('today');

  document.getElementById('reportPeriod')?.addEventListener('change', async e => {
    CURRENT_PERIOD = e.target.value;
    await loadReports(CURRENT_PERIOD);
  });

  // Wire up report card clicks
  bindReportCards();
});

// ── Main loader ───────────────────────────────────────────────
async function loadReports(period) {
  const { from: fromDate } = periodRange(period);
  await Promise.all([
    loadFleetSummary(),
    loadTripSummary(fromDate),
    loadDriverSummary(fromDate),
    loadRouteSummary(),
  ]);
}

// ── Fleet summary (from fleet_summary view) ───────────────────
async function loadFleetSummary() {
  const { data, error } = await NAVBUS_DB
    .from('fleet_summary')
    .select('*')
    .single();

  if (error || !data) return;

  setVal('rFleetTotal',    data.total_buses   ?? '—');
  setVal('rFleetOnline',   data.online        ?? '—');
  setVal('rFleetOffline',  data.offline       ?? '—');
  setVal('rFleetActive',   data.active        ?? '—');
  setVal('rFleetAssigned', data.assigned_buses ?? '—');
}

// ── Trip summary (from travel_history) ────────────────────────
async function loadTripSummary(fromDate) {
  const { data, error } = await NAVBUS_DB
    .from('travel_history')
    .select('id, status, distance_covered_km, duration_min, passenger_count, avg_speed_kmh')
    .gte('start_time', fromDate);

  if (error || !data) return;

  const completed  = data.filter(t => t.status === 'completed');
  const cancelled  = data.filter(t => t.status === 'cancelled');
  const totalKm    = completed.reduce((s, t) => s + (t.distance_covered_km || 0), 0);
  const avgSpeed   = completed.length
    ? (completed.reduce((s,t) => s + (t.avg_speed_kmh||0), 0) / completed.length).toFixed(1)
    : '—';
  const totalPax   = data.reduce((s,t) => s + (t.passenger_count||0), 0);

  setVal('rTripTotal',     data.length);
  setVal('rTripCompleted', completed.length);
  setVal('rTripCancelled', cancelled.length);
  setVal('rTripKm',        totalKm.toFixed(1) + ' km');
  setVal('rTripAvgSpeed',  avgSpeed + (avgSpeed !== '—' ? ' km/h' : ''));
  setVal('rTripPax',       totalPax);
}

// ── Driver performance (driver_performance view) ──────────────
async function loadDriverSummary(fromDate) {
  const { data, error } = await NAVBUS_DB
    .from('driver_performance')
    .select('driver_name, total_trips, completed_trips, avg_rating, total_km_driven, avg_speed_kmh')
    .gt('total_trips', 0)
    .order('completed_trips', { ascending: false })
    .limit(10);

  if (error || !data?.length) return;

  const tbody = document.getElementById('rDriverTable');
  if (!tbody) return;

  tbody.innerHTML = data.map(d => `
    <tr>
      <td style="font-weight:600;color:var(--text-primary);">${escHtml(d.driver_name)}</td>
      <td>${d.completed_trips ?? 0} / ${d.total_trips ?? 0}</td>
      <td style="font-family:var(--font-mono);">${d.total_km_driven ?? '—'} km</td>
      <td style="font-family:var(--font-mono);">${d.avg_speed_kmh ?? '—'} km/h</td>
      <td>${ratingStars(d.avg_rating)} ${d.avg_rating ? Number(d.avg_rating).toFixed(1) : '—'}</td>
    </tr>`).join('');
}

// ── Route summary (route_summary view) ───────────────────────
async function loadRouteSummary() {
  const { data, error } = await NAVBUS_DB
    .from('route_summary')
    .select('route_number, name, origin, destination, total_stops, total_buses, buses_online, is_active')
    .order('route_number');

  if (error || !data?.length) return;

  const tbody = document.getElementById('rRouteTable');
  if (!tbody) return;

  tbody.innerHTML = data.map(r => `
    <tr>
      <td style="font-family:var(--font-mono);font-weight:700;color:var(--gold);">${escHtml(r.route_number)}</td>
      <td>${escHtml(r.name)}</td>
      <td style="font-size:0.78rem;">${escHtml(r.origin)} → ${escHtml(r.destination)}</td>
      <td style="text-align:center;">${r.total_stops ?? 0}</td>
      <td style="text-align:center;">
        <span style="color:${r.buses_online>0?'#4ade80':'var(--text-muted)'};">${r.buses_online ?? 0}</span>
        / ${r.total_buses ?? 0}
      </td>
      <td>
        <span class="status-badge ${r.is_active ? 'status-active' : 'status-inactive'}">
          ${r.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
    </tr>`).join('');
}

// ── Report card clicks → CSV export ──────────────────────────
function bindReportCards() {
  const cards = {
    'cardFleet':   exportFleetReport,
    'cardTrip':    exportTripReport,
    'cardDriver':  exportDriverReport,
    'cardAlerts':  exportAlertsReport,
  };

  Object.entries(cards).forEach(([id, fn]) => {
    document.getElementById(id)?.addEventListener('click', fn);
  });

  document.getElementById('btnExportPDF')?.addEventListener('click', () => {
    window.print();
  });
}

// ── CSV Exporters ─────────────────────────────────────────────
async function exportFleetReport() {
  const { data } = await NAVBUS_DB
    .from('buses')
    .select('number_plate, bus_name, bus_model, status, capacity, device_id, is_active, created_at, routes(route_number), drivers(name)')
    .order('number_plate');

  if (!data?.length) { showToast('No fleet data to export.', 'error'); return; }

  const rows = [
    ['Plate', 'Name', 'Model', 'Status', 'Capacity', 'Route', 'Driver', 'Active', 'Registered'],
    ...data.map(b => [
      b.number_plate, b.bus_name||'', b.bus_model||'', b.status, b.capacity,
      b.routes?.route_number||'', b.drivers?.name||'', b.is_active, b.created_at?.split('T')[0],
    ]),
  ];
  downloadCSV(rows, 'navbus_fleet_report.csv');
}

async function exportTripReport() {
  const { from: fromDate } = periodRange(CURRENT_PERIOD);
  const { data } = await NAVBUS_DB
    .from('travel_history')
    .select('start_time, end_time, status, distance_covered_km, duration_min, avg_speed_kmh, passenger_count, buses(number_plate), drivers(name), routes(route_number)')
    .gte('start_time', fromDate)
    .order('start_time', { ascending: false });

  if (!data?.length) { showToast('No trip data for selected period.', 'error'); return; }

  const rows = [
    ['Date', 'Bus', 'Driver', 'Route', 'Status', 'Distance (km)', 'Duration (min)', 'Avg Speed', 'Passengers'],
    ...data.map(t => [
      t.start_time?.split('T')[0], t.buses?.number_plate, t.drivers?.name, t.routes?.route_number,
      t.status, t.distance_covered_km, t.duration_min, t.avg_speed_kmh, t.passenger_count,
    ]),
  ];
  downloadCSV(rows, 'navbus_trip_report.csv');
}

async function exportDriverReport() {
  const { data } = await NAVBUS_DB
    .from('driver_performance')
    .select('*')
    .order('total_trips', { ascending: false });

  if (!data?.length) { showToast('No driver data to export.', 'error'); return; }

  const rows = [
    ['Driver', 'Phone', 'Total Trips', 'Completed', 'Cancelled', 'Total KM', 'Avg Speed', 'Avg Rating', 'Feedback Count', 'License Expiry'],
    ...data.map(d => [
      d.driver_name, d.phone, d.total_trips, d.completed_trips, d.cancelled_trips,
      d.total_km_driven, d.avg_speed_kmh, d.avg_rating, d.total_feedback, d.license_expiry,
    ]),
  ];
  downloadCSV(rows, 'navbus_driver_report.csv');
}

async function exportAlertsReport() {
  const { data } = await NAVBUS_DB
    .from('buses')
    .select('number_plate, status, updated_at, drivers(name), routes(route_number)')
    .in('status', ['alert', 'offline'])
    .eq('is_active', true);

  if (!data?.length) { showToast('No active alerts to export.', 'error'); return; }

  const rows = [
    ['Bus', 'Status', 'Driver', 'Route', 'Last Updated'],
    ...data.map(b => [
      b.number_plate, b.status, b.drivers?.name||'', b.routes?.route_number||'', b.updated_at,
    ]),
  ];
  downloadCSV(rows, 'navbus_alerts_report.csv');
}

// ── CSV download helper ───────────────────────────────────────
function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Report downloaded: ' + filename, 'success');
}

// ── Period helper ─────────────────────────────────────────────
function periodRange(period) {
  const now  = new Date();
  const from = new Date(now);
  if (period === 'today')   from.setHours(0, 0, 0, 0);
  if (period === 'week')    from.setDate(now.getDate() - 7);
  if (period === 'month')   from.setMonth(now.getMonth() - 1);
  if (period === 'quarter') from.setMonth(now.getMonth() - 3);
  return { from: from.toISOString(), to: now.toISOString() };
}

// ── Tiny helpers ──────────────────────────────────────────────
function setVal(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function ratingStars(n) {
  if (!n) return '';
  const filled = Math.round(Number(n));
  return '★'.repeat(filled) + '☆'.repeat(Math.max(0, 5-filled));
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position:'fixed', bottom:'24px', right:'24px', padding:'12px 20px',
    background: type === 'success' ? '#4ade80' : '#f87171',
    color:'#000', borderRadius:'8px', fontWeight:'600', zIndex:'9999', transition:'opacity 0.3s',
  });
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 3000);
}

// Expose for period dropdown inline handler
window.updatePeriod = () => {
  const p = document.getElementById('reportPeriod')?.value || 'today';
  CURRENT_PERIOD = p;
  loadReports(p);
};

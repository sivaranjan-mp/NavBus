/* ============================================================
   NavBus — Admin Reports Module
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  loadReports();
  bindExportActions();
});

async function updatePeriod() {
  await loadReports();
}
window.updatePeriod = updatePeriod;

async function loadReports() {
  const period = document.getElementById('reportPeriod')?.value || 'week';
  
  // Calculate date boundary
  const d = new Date();
  if (period === 'today') {
    d.setHours(0,0,0,0);
  } else if (period === 'week') {
    d.setDate(d.getDate() - 7);
  } else if (period === 'month') {
    d.setMonth(d.getMonth() - 1);
  }
  const dateStr = d.toISOString();

  // Load global stats from travel_history
  await loadGlobalStats(dateStr);

  // Load tables from views
  await loadDriverPerformance();
  await loadRouteOverview();
}

async function loadGlobalStats(dateFrom) {
  const { data, error } = await NAVBUS_DB
    .from('travel_history')
    .select('distance_covered_km, passenger_count, status')
    .gte('start_time', dateFrom);

  if (error || !data) return;

  let km = 0;
  let pax = 0;
  let comp = 0;
  let canc = 0;

  data.forEach(t => {
    if (t.distance_covered_km) km += parseFloat(t.distance_covered_km);
    if (t.passenger_count) pax += t.passenger_count;
    if (t.status === 'completed') comp++;
    if (t.status === 'cancelled') canc++;
  });

  const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  set('rTripKm', km.toFixed(1));
  set('rTripPax', pax);
  set('rTripCompleted', comp);
  set('rTripCancelled', canc);
}

async function loadDriverPerformance() {
  const tbody = document.getElementById('rDriverTable');
  if (!tbody) return;

  const { data, error } = await NAVBUS_DB
    .from('driver_performance')
    .select('*')
    .order('total_km_driven', { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">No driver data available.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(d => `
    <tr>
      <td>
        <div style="font-weight:600;color:var(--text-primary);">${escHtml(d.driver_name)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);">${escHtml(d.phone)}</div>
      </td>
      <td>${d.completed_trips} / ${d.total_trips}</td>
      <td>${d.total_km_driven || 0} km</td>
      <td>${d.avg_speed_kmh || 0} km/h</td>
      <td style="color:var(--gold);">★ ${d.avg_rating || 'N/A'}</td>
    </tr>
  `).join('');
}

async function loadRouteOverview() {
  const tbody = document.getElementById('rRouteTable');
  if (!tbody) return;

  const { data, error } = await NAVBUS_DB
    .from('route_summary')
    .select('*')
    .order('route_number');

  if (error || !data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">No route data available.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(r => `
    <tr>
      <td><span style="font-family:var(--font-mono);color:var(--gold);">${escHtml(r.route_number)}</span></td>
      <td>
        <div style="font-weight:600;color:var(--text-primary);">${escHtml(r.name)}</div>
      </td>
      <td><span style="font-size:0.75rem;color:var(--text-secondary);">${escHtml(r.origin)} → ${escHtml(r.destination)}</span></td>
      <td>${r.total_stops}</td>
      <td>${r.buses_online} / ${r.total_buses}</td>
      <td>
        <span style="padding:3px 8px;border-radius:6px;font-size:0.65rem;font-weight:600;text-transform:uppercase;background:${r.is_active ? 'rgba(74,222,128,0.1)' : 'rgba(148,163,184,0.1)'};color:${r.is_active ? '#4ade80' : 'var(--text-muted)'};">${r.is_active ? 'Active' : 'Inactive'}</span>
      </td>
    </tr>
  `).join('');
}

function escHtml(str) {
  if (!str) return '—';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── Export & Downloads ────────────────────────────────────────

function bindExportActions() {
  document.getElementById('btnExportPDF')?.addEventListener('click', () => {
    window.print();
  });

  document.getElementById('cardFleet')?.addEventListener('click', exportFleetSummary);
  document.getElementById('cardTrip')?.addEventListener('click', exportTripReport);
  document.getElementById('cardDriver')?.addEventListener('click', exportDriverPerformance);
  document.getElementById('cardAlerts')?.addEventListener('click', exportAlerts);
  document.getElementById('cardPassenger')?.addEventListener('click', exportPassengerReport);
  document.getElementById('cardCustom')?.addEventListener('click', () => {
    window.Toast?.info('Custom report builder coming soon.');
  });
}

// Helper to convert array of objects to CSV and trigger download
function downloadCSV(data, filename) {
  if (!data || !data.length) {
    window.Toast?.warning('No data available to export.');
    return;
  }
  
  const headers = Object.keys(data[0]);
  const csvRows = [];
  
  // Add Header Row
  csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));
  
  // Add Data Rows
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header] === null || row[header] === undefined ? '' : String(row[header]);
      return `"${val.replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  }
  
  const csvString = csvRows.join('\\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  window.Toast?.success(`Exported ${filename} successfully.`);
}

async function exportFleetSummary() {
  window.Toast?.info('Generating Fleet Summary...');
  const { data, error } = await NAVBUS_DB.from('fleet_summary').select('*');
  if (error || !data) return window.Toast?.error('Failed to generate report.');
  downloadCSV(data, `NavBus_Fleet_Summary_${new Date().toISOString().split('T')[0]}.csv`);
}

async function exportTripReport() {
  window.Toast?.info('Generating Trip Report...');
  const { data, error } = await NAVBUS_DB
    .from('travel_history')
    .select('id, bus_id, driver_id, start_time, end_time, distance_covered_km, passenger_count, status')
    .order('start_time', { ascending: false });
  if (error || !data) return window.Toast?.error('Failed to generate report.');
  downloadCSV(data, `NavBus_Trip_Report_${new Date().toISOString().split('T')[0]}.csv`);
}

async function exportDriverPerformance() {
  window.Toast?.info('Generating Driver Performance...');
  const { data, error } = await NAVBUS_DB.from('driver_performance').select('*');
  if (error || !data) return window.Toast?.error('Failed to generate report.');
  downloadCSV(data, `NavBus_Driver_Performance_${new Date().toISOString().split('T')[0]}.csv`);
}

async function exportAlerts() {
  window.Toast?.info('Generating Alerts & Incidents...');
  const { data, error } = await NAVBUS_DB
    .from('feedback')
    .select('id, type, subject, message, status, created_at, user_id')
    .order('created_at', { ascending: false });
  if (error || !data) return window.Toast?.error('Failed to generate report.');
  downloadCSV(data, `NavBus_Alerts_Incidents_${new Date().toISOString().split('T')[0]}.csv`);
}

async function exportPassengerReport() {
  window.Toast?.info('Generating Passenger Report...');
  const { data, error } = await NAVBUS_DB
    .from('travel_history')
    .select('bus_id, passenger_count, start_time, end_time')
    .not('passenger_count', 'is', null)
    .order('start_time', { ascending: false });
  if (error || !data) return window.Toast?.error('Failed to generate report.');
  downloadCSV(data, `NavBus_Passenger_Report_${new Date().toISOString().split('T')[0]}.csv`);
}
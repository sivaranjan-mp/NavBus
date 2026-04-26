/* ============================================================
   NavBus — Admin Dashboard Stats
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  loadDashboardStats();
  setInterval(loadDashboardStats, 30_000); // auto-refresh every 30s
});

async function loadDashboardStats() {
  // Query buses table directly (fleet_summary view may not exist)
  const { data, error } = await NAVBUS_DB
    .from('buses')
    .select('status')
    .eq('is_active', true);

  if (error || !data) return;

  const total  = data.length;
  const online = data.filter(b => b.status === 'online').length;
  const maint  = data.filter(b => b.status === 'maintenance').length;
  const offline= data.filter(b => b.status === 'offline' || b.status === 'alert').length;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('statTotal',   total);
  set('statOnline',  online);
  set('statOffline', offline);
  set('statMaint',   maint);

  // Update sidebar complaint badge
  const { count: complaintCount } = await NAVBUS_DB
    .from('complaints')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');

  const badge = document.getElementById('sidebarComplaintCount');
  if (badge) {
    badge.textContent  = complaintCount || '';
    badge.style.display = complaintCount ? '' : 'none';
  }
}

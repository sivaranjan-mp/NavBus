/* ============================================================
   NavBus — Admin Dashboard Stats (shared)
   Loads fleet summary for dashboard page
   ============================================================ */

async function loadDashboardStats() {
  const { data, error } = await NAVBUS_DB
    .from('buses')
    .select('status, is_active')
    .eq('is_active', true);

  if (error || !data) return;

  const total   = data.length;
  const online  = data.filter(b => b.status === 'online').length;
  const offline = data.filter(b => b.status === 'offline').length;
  const maint   = data.filter(b => b.status === 'maintenance').length;

  const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  set('statTotal',   total);
  set('statOnline',  online);
  set('statOffline', offline);
  set('statMaint',   maint);
}

document.addEventListener('DOMContentLoaded', loadDashboardStats);

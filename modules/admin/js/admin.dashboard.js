/* ============================================================
   NavBus — Admin Dashboard Stats
   ============================================================ */

document.addEventListener('DOMContentLoaded', loadDashboardStats);

async function loadDashboardStats() {
  const { data, error } = await NAVBUS_DB
    .from('fleet_summary')
    .select('*')
    .single();

  if (error || !data) return;

  const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  set('statTotal',   data.total_buses);
  set('statOnline',  data.online);
  set('statOffline', data.offline);
  set('statMaint',   data.maintenance);
}

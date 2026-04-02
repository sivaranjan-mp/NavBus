/* ============================================================
   NavBus — Admin Bus List
   Fetches buses from Supabase, renders table with search/filter
   ============================================================ */

let ALL_BUSES    = [];   // full dataset
let CURRENT_PAGE = 1;
const PAGE_SIZE  = 10;

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadBuses();
  initSearch();
  initFilter();
});

// ── Fetch all buses with route + driver ─────────────────────
async function loadBuses() {
  showTableSkeleton();

  const { data, error } = await NAVBUS_DB
    .from('buses')
    .select(`
      id, number_plate, bus_name, bus_model, bus_type,
      capacity, device_id, status, is_active,
      camera_url_front, camera_url_rear,
      camera_url_cabin, camera_url_driver,
      created_at,
      routes   ( id, route_number, name ),
      drivers  ( id, name, phone )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    showTableError(error.message);
    return;
  }

  ALL_BUSES    = data || [];
  CURRENT_PAGE = 1;
  renderTable(ALL_BUSES);
  updateStatCards(ALL_BUSES);
}

// ── Render table ─────────────────────────────────────────────
function renderTable(buses) {
  const tbody  = document.getElementById('busTableBody');
  const footer = document.getElementById('tableFooter');
  if (!tbody) return;

  const total = buses.length;
  const start = (CURRENT_PAGE - 1) * PAGE_SIZE;
  const end   = Math.min(start + PAGE_SIZE, total);
  const page  = buses.slice(start, end);

  // Results count
  const countEl = document.getElementById('resultsCount');
  if (countEl) countEl.textContent = `${total} bus${total !== 1 ? 'es' : ''}`;

  if (total === 0) {
    tbody.innerHTML = `
      <tr><td colspan="8">
        <div class="table-empty">
          <div class="table-empty-icon">🚌</div>
          <div class="table-empty-title">No Buses Found</div>
          <div class="table-empty-sub">Register your first bus to get started.</div>
          <a href="add-bus.html" class="btn btn-gold btn-md">+ Register Bus</a>
        </div>
      </td></tr>`;
    if (footer) footer.style.display = 'none';
    return;
  }

  tbody.innerHTML = page.map((bus, i) => buildRow(bus, start + i + 1)).join('');

  // Pagination
  if (footer) {
    footer.style.display = 'flex';
    renderPagination(total, CURRENT_PAGE, buses);
  }

  // Attach action listeners
  attachRowActions(buses);
}

// ── Build single table row ────────────────────────────────────
function buildRow(bus, index) {
  const hasCam = bus.camera_url_front || bus.camera_url_rear ||
                 bus.camera_url_cabin || bus.camera_url_driver;

  const camCount = [
    bus.camera_url_front, bus.camera_url_rear,
    bus.camera_url_cabin, bus.camera_url_driver,
  ].filter(Boolean).length;

  const statusClass = (bus.status || 'offline').toLowerCase();
  const route = bus.routes?.[0] || bus.routes || null;
  const driver = bus.drivers?.[0] || bus.drivers || null;

  return `
    <tr data-bus-id="${bus.id}">
      <td>
        <div class="cell-plate">
          <div>
            <div class="plate-badge">${escHtml(bus.number_plate)}</div>
            <div class="cell-sub">${escHtml(bus.bus_name || bus.bus_model || '—')}</div>
          </div>
        </div>
      </td>
      <td>
        <span class="device-id-chip">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
          </svg>
          ${escHtml(bus.device_id)}
        </span>
      </td>
      <td>
        <div style="font-size:0.83rem;color:var(--text-secondary);">${escHtml(bus.bus_type || '—')}</div>
        <div class="cell-sub">${bus.capacity} seats</div>
      </td>
      <td>
        <div style="font-size:0.83rem;color:var(--text-secondary);">
          ${route ? `<span style="color:var(--gold);font-family:var(--font-mono);font-size:0.72rem;">${escHtml(route.route_number)}</span> ${escHtml(route.name)}` : '<span style="color:var(--text-muted);">Unassigned</span>'}
        </div>
        ${driver ? `<div class="cell-sub">${escHtml(driver.name)}</div>` : ''}
      </td>
      <td>
        ${hasCam
          ? `<span class="camera-pill live">
               <span class="cam-dot"></span>
               ${camCount} cam${camCount !== 1 ? 's' : ''}
             </span>`
          : `<span class="camera-pill no-cam">No Camera</span>`
        }
      </td>
      <td>
        <span class="status-badge ${statusClass}">
          <span class="status-dot"></span>
          ${statusClass}
        </span>
      </td>
      <td>
        <div class="table-actions">
          <a href="edit-bus.html?id=${bus.id}" class="action-btn edit" title="Edit Bus">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </a>
          <button class="action-btn delete" title="Delete Bus" data-id="${bus.id}" data-plate="${escHtml(bus.number_plate)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>`;
}

// ── Attach row action handlers ────────────────────────────────
function attachRowActions(buses) {
  document.querySelectorAll('.action-btn.delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id    = btn.dataset.id;
      const plate = btn.dataset.plate;
      openDeleteModal(id, plate);
    });
  });
}

// ── Stat cards ────────────────────────────────────────────────
function updateStatCards(buses) {
  const total   = buses.length;
  const online  = buses.filter(b => b.status === 'online').length;
  const offline = buses.filter(b => b.status === 'offline').length;
  const maint   = buses.filter(b => b.status === 'maintenance').length;

  setStatValue('statTotal',   total);
  setStatValue('statOnline',  online);
  setStatValue('statOffline', offline);
  setStatValue('statMaint',   maint);
}

function setStatValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Search ────────────────────────────────────────────────────
function initSearch() {
  const searchEl = document.getElementById('busSearch');
  if (!searchEl) return;

  searchEl.addEventListener('input', debounce(() => {
    const q = searchEl.value.trim().toLowerCase();
    const filtered = q
      ? ALL_BUSES.filter(b =>
          b.number_plate.toLowerCase().includes(q) ||
          b.device_id?.toLowerCase().includes(q)   ||
          b.bus_name?.toLowerCase().includes(q)     ||
          b.bus_model?.toLowerCase().includes(q)    ||
          b.bus_type?.toLowerCase().includes(q)
        )
      : ALL_BUSES;
    CURRENT_PAGE = 1;
    renderTable(filtered);
  }, 260));
}

// ── Status filter ─────────────────────────────────────────────
function initFilter() {
  const filterEl = document.getElementById('statusFilter');
  if (!filterEl) return;

  filterEl.addEventListener('change', () => {
    const val = filterEl.value;
    const filtered = val === 'all'
      ? ALL_BUSES
      : ALL_BUSES.filter(b => b.status === val);
    CURRENT_PAGE = 1;
    renderTable(filtered);
  });
}

// ── Pagination ────────────────────────────────────────────────
function renderPagination(total, current, buses) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const infoEl  = document.getElementById('paginationInfo');
  const ctrlEl  = document.getElementById('paginationControls');

  const start = (current - 1) * PAGE_SIZE + 1;
  const end   = Math.min(current * PAGE_SIZE, total);
  if (infoEl) infoEl.textContent = `Showing ${start}–${end} of ${total}`;

  if (!ctrlEl) return;
  ctrlEl.innerHTML = '';

  // Prev
  const prevBtn = _pageBtn('‹', current === 1);
  prevBtn.addEventListener('click', () => {
    if (current > 1) { CURRENT_PAGE--; renderTable(buses); }
  });
  ctrlEl.appendChild(prevBtn);

  // Page numbers
  for (let p = 1; p <= totalPages; p++) {
    if (totalPages > 7) {
      if (p !== 1 && p !== totalPages && Math.abs(p - current) > 2) {
        if (p === 2 || p === totalPages - 1) {
          const dots = document.createElement('span');
          dots.textContent = '…';
          dots.style.cssText = 'padding:0 6px;color:var(--text-muted);font-size:0.8rem;';
          ctrlEl.appendChild(dots);
        }
        continue;
      }
    }
    const btn = _pageBtn(p, false, p === current);
    btn.addEventListener('click', () => { CURRENT_PAGE = p; renderTable(buses); });
    ctrlEl.appendChild(btn);
  }

  // Next
  const nextBtn = _pageBtn('›', current === totalPages);
  nextBtn.addEventListener('click', () => {
    if (current < totalPages) { CURRENT_PAGE++; renderTable(buses); }
  });
  ctrlEl.appendChild(nextBtn);
}

function _pageBtn(label, disabled, active = false) {
  const btn = document.createElement('button');
  btn.className = `page-btn${active ? ' active' : ''}`;
  btn.textContent = label;
  btn.disabled = disabled;
  return btn;
}

// ── Table skeleton ────────────────────────────────────────────
function showTableSkeleton() {
  const tbody = document.getElementById('busTableBody');
  if (!tbody) return;
  tbody.innerHTML = Array(6).fill(0).map(() => `
    <tr class="skeleton-row">
      ${Array(7).fill(0).map(() => `<td><div class="skeleton-block" style="width:${60+Math.random()*35|0}%"></div></td>`).join('')}
    </tr>`).join('');
}

function showTableError(msg) {
  const tbody = document.getElementById('busTableBody');
  if (tbody) tbody.innerHTML = `
    <tr><td colspan="8" style="text-align:center;padding:40px;color:var(--danger);font-size:0.85rem;">
      Error loading buses: ${escHtml(msg)}
    </td></tr>`;
}

// ── Helpers ───────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

/* ============================================================
   NavBus — Admin Drivers Module
   Full Supabase CRUD: load, add, edit, delete drivers
   Table: drivers | Joined: buses (for assigned plate)
   ============================================================ */

let ALL_DRIVERS = [];
let EDIT_ID     = null;   // UUID of driver being edited (null = new)

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadDrivers();
  bindSearchFilter();
  bindModal();
});

// ── Fetch drivers + assigned bus plate ───────────────────────
async function loadDrivers() {
  showSkeleton();

  const { data, error } = await NAVBUS_DB
    .from('drivers')
    .select(`
      id, name, phone, email,
      license_number, license_expiry,
      joining_date, is_active, notes,
      buses ( number_plate )
    `)
    .order('name');

  if (error) {
    showError('Failed to load drivers: ' + error.message);
    return;
  }

  // Flatten bus plate
  ALL_DRIVERS = (data || []).map(d => ({
    ...d,
    assigned_bus: d.buses?.[0]?.number_plate || '—',
    status: d.is_active ? 'active' : 'inactive',
    exp: experienceLabel(d.joining_date),
    initials: initials(d.name),
  }));

  renderDrivers(ALL_DRIVERS);
}

// ── Render table ─────────────────────────────────────────────
function renderDrivers(list) {
  const tbody = document.getElementById('driversTableBody');
  if (!tbody) return;

  document.getElementById('resultsCount').textContent =
    list.length + ' driver' + (list.length !== 1 ? 's' : '');

  updateStats(ALL_DRIVERS);

  if (!list.length) {
    tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <p>No drivers match your search.</p>
        </div>
      </td></tr>`;
    return;
  }

  const statusMap = {
    active:   ['status-badge status-active',   'Active'],
    inactive: ['status-badge status-inactive', 'Inactive'],
  };

  tbody.innerHTML = list.map(d => {
    const [cls, label] = statusMap[d.status] || statusMap.inactive;
    const expiry       = d.license_expiry ? new Date(d.license_expiry) : null;
    const expired      = expiry && expiry < new Date();
    return `
      <tr>
        <td>
          <div class="driver-name-cell">
            <div class="driver-avatar">${escHtml(d.initials)}</div>
            <span style="font-weight:600;color:var(--text-primary);">${escHtml(d.name)}</span>
          </div>
        </td>
        <td style="font-family:var(--font-mono);font-size:0.78rem;">
          ${escHtml(d.license_number)}
          ${expired ? '<span style="color:#f87171;font-size:0.65rem;margin-left:4px;">EXPIRED</span>' : ''}
        </td>
        <td>${escHtml(d.phone)}</td>
        <td style="font-family:var(--font-mono);font-size:0.78rem;">${escHtml(d.assigned_bus)}</td>
        <td>${escHtml(d.exp)}</td>
        <td><span class="${cls}">${label}</span></td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-outline btn-sm" onclick="openEditModal('${d.id}')">Edit</button>
            <button class="btn btn-danger btn-sm"  onclick="confirmDelete('${d.id}','${escHtml(d.name)}')">Remove</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ── Stats row ─────────────────────────────────────────────────
function updateStats(all) {
  document.getElementById('statTotal').textContent    = all.length;
  document.getElementById('statActive').textContent   = all.filter(d => d.status === 'active').length;
  document.getElementById('statOnLeave').textContent  = '—';
  document.getElementById('statInactive').textContent = all.filter(d => d.status === 'inactive').length;
}

// ── Search / filter ───────────────────────────────────────────
function bindSearchFilter() {
  document.getElementById('driverSearch')?.addEventListener('input', applyFilter);
  document.getElementById('statusFilter')?.addEventListener('change', applyFilter);
}

function applyFilter() {
  const q = (document.getElementById('driverSearch')?.value || '').toLowerCase();
  const s = document.getElementById('statusFilter')?.value || 'all';
  const filtered = ALL_DRIVERS.filter(d => {
    const mq = !q ||
      d.name.toLowerCase().includes(q) ||
      d.license_number.toLowerCase().includes(q) ||
      d.phone.includes(q);
    const ms = s === 'all' || d.status === s;
    return mq && ms;
  });
  renderDrivers(filtered);
}

// Also expose for inline oninput/onchange attributes
window.filterDrivers = applyFilter;

// ── Modal wiring ──────────────────────────────────────────────
function bindModal() {
  document.getElementById('modalOverlay')?.addEventListener('click', closeModal);
  document.getElementById('btnSaveDriver')?.addEventListener('click', saveDriver);
  document.getElementById('btnCancelDriver')?.addEventListener('click', closeModal);

  // "Add Driver" button
  document.getElementById('btnAddDriver')?.addEventListener('click', () => {
    EDIT_ID = null;
    clearForm();
    document.getElementById('modalTitle').textContent = 'Add Driver';
    document.getElementById('driverModal').style.display = 'flex';
  });
}

function openEditModal(id) {
  const d = ALL_DRIVERS.find(x => x.id === id);
  if (!d) return;
  EDIT_ID = id;

  setValue('fName',    d.name);
  setValue('fPhone',   d.phone);
  setValue('fEmail',   d.email  || '');
  setValue('fLicense', d.license_number);
  setValue('fExpiry',  d.license_expiry || '');
  setValue('fJoining', d.joining_date   || '');
  setValue('fNotes',   d.notes  || '');
  const activeEl = document.getElementById('fIsActive');
  if (activeEl) activeEl.checked = d.is_active;

  document.getElementById('modalTitle').textContent = 'Edit Driver';
  document.getElementById('driverModal').style.display = 'flex';
}
window.openEditModal = openEditModal;

function closeModal() {
  document.getElementById('driverModal').style.display = 'none';
  clearForm();
  EDIT_ID = null;
}

function clearForm() {
  ['fName','fPhone','fEmail','fLicense','fExpiry','fJoining','fNotes'].forEach(id => setValue(id, ''));
  const activeEl = document.getElementById('fIsActive');
  if (activeEl) activeEl.checked = true;
  clearFormError();
}

// ── Save (insert or update) ───────────────────────────────────
async function saveDriver() {
  const name     = getValue('fName').trim();
  const phone    = getValue('fPhone').trim();
  const email    = getValue('fEmail').trim() || null;
  const license  = getValue('fLicense').trim();
  const expiry   = getValue('fExpiry')   || null;
  const joining  = getValue('fJoining')  || null;
  const notes    = getValue('fNotes').trim()   || null;
  const isActive = document.getElementById('fIsActive')?.checked ?? true;

  if (!name || !phone || !license || !expiry) {
    showFormError('Name, phone, license number, and expiry date are required.');
    return;
  }

  const payload = {
    name, phone, email,
    license_number: license,
    license_expiry: expiry,
    joining_date:   joining,
    notes, is_active: isActive,
  };

  setBtnLoading(true);

  let error;
  if (EDIT_ID) {
    ({ error } = await NAVBUS_DB.from('drivers').update(payload).eq('id', EDIT_ID));
  } else {
    ({ error } = await NAVBUS_DB.from('drivers').insert(payload));
  }

  setBtnLoading(false);

  if (error) {
    showFormError('Save failed: ' + error.message);
    return;
  }

  closeModal();
  await loadDrivers();
  showToast(EDIT_ID ? 'Driver updated.' : 'Driver added.', 'success');
}

// ── Delete ────────────────────────────────────────────────────
async function confirmDelete(id, name) {
  if (!confirm(`Remove driver "${name}"? This cannot be undone.`)) return;

  const { error } = await NAVBUS_DB.from('drivers').delete().eq('id', id);
  if (error) {
    showToast('Delete failed: ' + error.message, 'error');
    return;
  }
  await loadDrivers();
  showToast('Driver removed.', 'success');
}
window.confirmDelete = confirmDelete;

// ── Skeleton / error helpers ──────────────────────────────────
function showSkeleton() {
  const tbody = document.getElementById('driversTableBody');
  if (!tbody) return;
  tbody.innerHTML = Array(4).fill('').map(() => `
    <tr>
      ${Array(7).fill('<td><div style="height:14px;background:var(--bg-tertiary);border-radius:4px;animation:pulse 1.4s ease-in-out infinite;"></div></td>').join('')}
    </tr>`).join('');
}

function showError(msg) {
  const tbody = document.getElementById('driversTableBody');
  if (!tbody) return;
  tbody.innerHTML = `
    <tr><td colspan="7">
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p>${escHtml(msg)}</p>
        <button class="btn btn-outline btn-sm" onclick="loadDrivers()">Retry</button>
      </div>
    </td></tr>`;
}

function showFormError(msg) {
  const el = document.getElementById('formError');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function clearFormError() {
  const el = document.getElementById('formError');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

function setBtnLoading(on) {
  const btn = document.getElementById('btnSaveDriver');
  if (btn) btn.disabled = on, btn.textContent = on ? 'Saving…' : 'Save Driver';
}

// ── Tiny helpers ──────────────────────────────────────────────
function getValue(id) { return document.getElementById(id)?.value || ''; }
function setValue(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function initials(name) {
  return (name || '').split(' ').slice(0,2).map(w => w[0] || '').join('').toUpperCase() || '??';
}
function experienceLabel(joining) {
  if (!joining) return '—';
  const yrs = Math.floor((Date.now() - new Date(joining)) / (365.25 * 86400 * 1000));
  return yrs < 1 ? '< 1 yr' : yrs + ' yr' + (yrs !== 1 ? 's' : '');
}
function showToast(msg, type = 'success') {
  if (window.NavBusToast?.show) { window.NavBusToast.show(msg, type); return; }
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position:'fixed', bottom:'24px', right:'24px', padding:'12px 20px',
    background: type === 'success' ? '#4ade80' : '#f87171',
    color:'#000', borderRadius:'8px', fontWeight:'600', zIndex:'9999',
    transition:'opacity 0.3s',
  });
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

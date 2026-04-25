/* ============================================================
   NavBus — Admin Drivers Module
   Full Supabase CRUD: load, add, edit, delete drivers
   Table: drivers | Joined: buses (for assigned plate)
   ============================================================ */

let ALL_DRIVERS = [];
let EDIT_ID     = null;   // UUID of driver being edited (null = new)

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Bind UI interactions immediately — never wait for data
  bindSearchFilter();
  bindModal();
  // Load data async separately
  loadDrivers();
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
        <div class="table-empty">
          <div class="table-empty-icon">🔍</div>
          <div class="table-empty-title">No Drivers Found</div>
          <div class="table-empty-sub">No drivers match your search.</div>
        </div>
      </td></tr>`;
    document.getElementById('tableFooter').style.display = 'none';
    return;
  }
  document.getElementById('tableFooter').style.display = 'flex';

  const statusMap = {
    active:   ['status-badge active',   'Active'],
    inactive: ['status-badge inactive', 'Inactive'],
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
            <div class="driver-info">
              <span class="driver-name">${escHtml(d.name)}</span>
            </div>
          </div>
        </td>
        <td style="font-family:var(--font-mono);font-size:0.78rem;">
          ${escHtml(d.license_number)}
          ${expired ? '<span style="color:#f87171;font-size:0.65rem;margin-left:4px;">EXPIRED</span>' : ''}
        </td>
        <td>${escHtml(d.phone)}</td>
        <td>
          <span class="assigned-bus-badge">${escHtml(d.assigned_bus)}</span>
        </td>
        <td>${escHtml(d.exp)}</td>
        <td><span class="${cls}"><span class="status-dot"></span>${label}</span></td>
        <td>
          <div class="table-actions">
            <button class="action-btn edit" title="Edit" onclick="openEditModal('${d.id}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="action-btn delete" title="Remove" onclick="confirmDelete('${d.id}','${escHtml(d.name)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
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
  // Clicking the dark overlay (outside card) closes modal
  document.getElementById('modalOverlay')?.addEventListener('click', closeModal);

  // Clicks INSIDE the card must NOT bubble up to the overlay
  document.getElementById('driverModal')?.addEventListener('click', (e) => e.stopPropagation());

  document.getElementById('btnSaveDriver')?.addEventListener('click', saveDriver);
  document.getElementById('btnCancelDriver')?.addEventListener('click', closeModal);

  // "Add Driver" button
  document.getElementById('btnAddDriver')?.addEventListener('click', () => {
    EDIT_ID = null;
    clearForm();
    document.getElementById('modalTitle').textContent = 'Add Driver';
    document.getElementById('modalOverlay').style.display = 'flex';
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
  document.getElementById('modalOverlay').style.display = 'flex';
}
window.openEditModal = openEditModal;

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  clearForm();
  EDIT_ID = null;
}

function clearForm() {
  ['fName','fPhone','fEmail','fLicense','fExpiry','fJoining','fNotes'].forEach(id => setValue(id, ''));
  ['fPhoto','fBiometric'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const activeEl = document.getElementById('fIsActive');
  if (activeEl) activeEl.checked = true;
  clearFormError();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
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

  const photoFile = document.getElementById('fPhoto')?.files[0];
  const bioFile   = document.getElementById('fBiometric')?.files[0];

  try {
    if (photoFile) payload.photo_url = await fileToBase64(photoFile);
    if (bioFile) payload.biometric_url = await fileToBase64(bioFile);
  } catch(e) {
    showFormError('Failed to read files.');
    return;
  }

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
    <tr class="skeleton-row">
      ${Array(7).fill('<td><div class="skeleton-block" style="width:100%"></div></td>').join('')}
    </tr>`).join('');
}

function showError(msg) {
  const tbody = document.getElementById('driversTableBody');
  if (!tbody) return;
  tbody.innerHTML = `
    <tr><td colspan="7">
      <div class="table-empty">
        <div class="table-empty-icon">⚠️</div>
        <div class="table-empty-title">Failed to load</div>
        <div class="table-empty-sub">${escHtml(msg)}</div>
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
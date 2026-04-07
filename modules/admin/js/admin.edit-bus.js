/* ============================================================
   NavBus — Edit Bus Logic
   Pre-fills form from Supabase, validates, and updates record
   FIX (Bug 5): Removed duplicate loadRoutesDropdown() and
   loadDriversDropdown() — these now live in admin.bus-form.shared.js.
   Make sure that file is loaded BEFORE this one in edit-bus.html.
   ============================================================ */

let EDIT_BUS_ID = null;

document.addEventListener('DOMContentLoaded', async () => {
  EDIT_BUS_ID = new URLSearchParams(window.location.search).get('id');

  if (!EDIT_BUS_ID) {
    showFormAlert('error', 'No bus ID provided. Please go back and try again.');
    return;
  }

  await loadRoutesDropdown();
  await loadDriversDropdown();
  await prefillForm(EDIT_BUS_ID);
  initEditValidation();
  initEditSubmit();
});

// ── Prefill form ──────────────────────────────────────────────
async function prefillForm(busId) {
  const { data: bus, error } = await NAVBUS_DB
    .from('buses')
    .select('*')
    .eq('id', busId)
    .single();

  if (error || !bus) {
    showFormAlert('error', 'Bus not found. It may have been deleted.');
    document.getElementById('editBusForm')?.remove();
    return;
  }

  // Store original values for uniqueness exclusion
  window._ORIG_DEVICE_ID    = bus.device_id;
  window._ORIG_NUMBER_PLATE = bus.number_plate;

  // Update breadcrumb title
  const titleEl = document.getElementById('editBusTitle');
  if (titleEl) titleEl.textContent = `Edit — ${bus.number_plate}`;

  // Fill inputs
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };

  set('busNumberPlate', bus.number_plate);
  set('busDeviceId',    bus.device_id);
  set('busName',        bus.bus_name);
  set('busModel',       bus.bus_model);
  set('busCapacity',    bus.capacity);
  set('camFront',       bus.camera_url_front);
  set('camRear',        bus.camera_url_rear);
  set('camCabin',       bus.camera_url_cabin);
  set('camDriver',      bus.camera_url_driver);

  // Selects
  setSelectValue('busType',   bus.bus_type);
  setSelectValue('busStatus', bus.status);
  setSelectValue('busRoute',  bus.route_id);
  setSelectValue('busDriver', bus.driver_id);
}

function setSelectValue(id, val) {
  const el = document.getElementById(id);
  if (!el || !val) return;
  // Timeout to allow options to load
  setTimeout(() => { el.value = val; }, 100);
}

// ── Edit validation ───────────────────────────────────────────
function initEditValidation() {
  const deviceInput = document.getElementById('busDeviceId');
  deviceInput?.addEventListener('blur', async () => {
    const val = deviceInput.value.trim().toUpperCase();
    deviceInput.value = val;
    if (!val || val === window._ORIG_DEVICE_ID) { clearFieldState(deviceInput); return; }
    setFieldChecking(deviceInput);
    const unique = await checkUnique('buses', 'device_id', val, EDIT_BUS_ID);
    unique ? setFieldValid(deviceInput, 'Device ID available') : setFieldError(deviceInput, 'Device ID already in use');
  });

  const plateInput = document.getElementById('busNumberPlate');
  plateInput?.addEventListener('blur', async () => {
    const val = plateInput.value.trim().toUpperCase();
    plateInput.value = val;
    if (!val || val === window._ORIG_NUMBER_PLATE) { clearFieldState(plateInput); return; }
    setFieldChecking(plateInput);
    const unique = await checkUnique('buses', 'number_plate', val, EDIT_BUS_ID);
    unique ? setFieldValid(plateInput, 'Plate available') : setFieldError(plateInput, 'Plate already registered');
  });

  // Camera preview
  document.querySelectorAll('.camera-preview-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = document.getElementById(btn.dataset.inputId)?.value?.trim();
      if (!url) return window.Toast?.warning('Enter a camera URL first.');
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  });
}

// ── Edit submit ───────────────────────────────────────────────
function initEditSubmit() {
  const form    = document.getElementById('editBusForm');
  const saveBtn = document.getElementById('saveBusBtn');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFormAlert();

    const plate    = document.getElementById('busNumberPlate')?.value.trim().toUpperCase();
    const deviceId = document.getElementById('busDeviceId')?.value.trim().toUpperCase();

    if (!plate)    { setFieldError(document.getElementById('busNumberPlate'), 'Required.'); return; }
    if (!deviceId) { setFieldError(document.getElementById('busDeviceId'),    'Required.'); return; }

    setButtonLoading(saveBtn, true, 'Saving changes...');

    // Check uniqueness only if changed
    if (deviceId !== window._ORIG_DEVICE_ID) {
      const ok = await checkUnique('buses', 'device_id', deviceId, EDIT_BUS_ID);
      if (!ok) { setButtonLoading(saveBtn, false); setFieldError(document.getElementById('busDeviceId'), 'Device ID taken'); return; }
    }
    if (plate !== window._ORIG_NUMBER_PLATE) {
      const ok = await checkUnique('buses', 'number_plate', plate, EDIT_BUS_ID);
      if (!ok) { setButtonLoading(saveBtn, false); setFieldError(document.getElementById('busNumberPlate'), 'Plate taken'); return; }
    }

    const get = id => document.getElementById(id)?.value?.trim() || null;

    const payload = {
      number_plate:      plate,
      device_id:         deviceId,
      bus_name:          get('busName'),
      bus_model:         get('busModel'),
      bus_type:          get('busType'),
      capacity:          parseInt(get('busCapacity')) || 40,
      status:            get('busStatus') || 'offline',
      route_id:          get('busRoute')  || null,
      driver_id:         get('busDriver') || null,
      camera_url_front:  get('camFront')  || null,
      camera_url_rear:   get('camRear')   || null,
      camera_url_cabin:  get('camCabin')  || null,
      camera_url_driver: get('camDriver') || null,
      updated_at:        new Date().toISOString(),
    };

    const { error } = await NAVBUS_DB.from('buses').update(payload).eq('id', EDIT_BUS_ID);

    setButtonLoading(saveBtn, false);

    if (error) {
      showFormAlert('error', error.message || 'Update failed.');
      return;
    }

    showFormAlert('success', `${plate} updated successfully!`);
    window.Toast?.success('Bus updated!');
    setTimeout(() => { window.location.href = 'buses.html'; }, 1400);
  });
}

// ── Field state helpers ───────────────────────────────────────
function setFieldChecking(input) {
  clearFieldState(input);
  const wrap = input.closest('.input-wrap') || input.parentElement;
  const s = document.createElement('span');
  s.className = 'input-checking';
  s.innerHTML = '<span class="input-spinner"></span>';
  s.dataset.state = 'checking';
  wrap.appendChild(s);
}

function setFieldValid(input, msg) {
  clearFieldState(input);
  input.classList.add('input-valid');
  const wrap = input.closest('.input-wrap') || input.parentElement;
  const i = document.createElement('span');
  i.className = 'input-checking';
  i.innerHTML = '<span class="input-check-ok">✓</span>';
  i.dataset.state = 'valid';
  wrap.appendChild(i);
  _setHint(input, msg, 'success');
}

function setFieldError(input, msg) {
  clearFieldState(input);
  input?.classList.add('input-error');
  _setHint(input, msg, 'error');
}

function clearFieldState(input) {
  if (!input) return;
  input.classList.remove('input-error', 'input-valid');
  const wrap = input.closest('.input-wrap') || input.parentElement;
  wrap?.querySelectorAll('[data-state]').forEach(el => el.remove());
  wrap?.parentElement?.querySelector('.field-feedback')?.remove();
}

function _setHint(input, msg, type) {
  if (!msg) return;
  const g = input?.closest('.form-group');
  if (!g) return;
  g.querySelector('.field-feedback')?.remove();
  const el = document.createElement('span');
  el.className   = 'field-feedback form-' + (type === 'error' ? 'error-text' : 'hint-text');
  el.textContent = msg;
  if (type === 'success') el.style.color = 'var(--success)';
  g.appendChild(el);
}

function showFormAlert(type, msg) {
  const el = document.getElementById('formAlert');
  if (!el) return;
  el.className = `form-alert show ${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✓' : '✕'}</span><span>${msg}</span>`;
}

function hideFormAlert() {
  const el = document.getElementById('formAlert');
  if (el) el.className = 'form-alert';
}

function setButtonLoading(btn, loading, text) {
  if (!btn) return;
  if (loading) {
    btn.dataset.orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner"></span><span>${text}</span>`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.orig || btn.innerHTML;
  }
}

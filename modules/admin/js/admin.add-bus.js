/* ============================================================
   NavBus — Add Bus Logic
   Form validation + Supabase insert
   FIX (Bug 5): Removed duplicate loadRoutesDropdown() and
   loadDriversDropdown() — these now live in admin.bus-form.shared.js.
   Make sure that file is loaded BEFORE this one in add-bus.html.
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  await loadRoutesDropdown();
  await loadDriversDropdown();
  initFormValidation();
  initFormSubmit();
});

// ── Real-time uniqueness validation ──────────────────────────
function initFormValidation() {

  // Device ID — check uniqueness on blur
  const deviceInput = document.getElementById('busDeviceId');
  deviceInput?.addEventListener('blur', async () => {
    const val = deviceInput.value.trim();
    if (!val) return;
    setFieldChecking(deviceInput);
    const unique = await checkUnique('buses', 'device_id', val);
    if (unique) {
      setFieldValid(deviceInput, 'Device ID is available');
    } else {
      setFieldError(deviceInput, 'This Device ID is already registered to another bus');
    }
  });

  deviceInput?.addEventListener('input', () => {
    // Auto-uppercase
    const cursor = deviceInput.selectionStart;
    deviceInput.value = deviceInput.value.toUpperCase();
    deviceInput.setSelectionRange(cursor, cursor);
    clearFieldState(deviceInput);
  });

  // Number plate — check uniqueness on blur
  const plateInput = document.getElementById('busNumberPlate');
  plateInput?.addEventListener('blur', async () => {
    const val = plateInput.value.trim().toUpperCase();
    plateInput.value = val;
    if (!val) return;
    setFieldChecking(plateInput);
    const unique = await checkUnique('buses', 'number_plate', val);
    if (unique) {
      setFieldValid(plateInput, 'Plate number is available');
    } else {
      setFieldError(plateInput, 'This number plate is already registered');
    }
  });

  plateInput?.addEventListener('input', () => {
    const cursor = plateInput.selectionStart;
    plateInput.value = plateInput.value.toUpperCase();
    plateInput.setSelectionRange(cursor, cursor);
    clearFieldState(plateInput);
  });

  // Camera URL preview button
  document.querySelectorAll('.camera-preview-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const inputId = btn.dataset.inputId;
      const url     = document.getElementById(inputId)?.value?.trim();
      if (!url) return Toast.warning('Enter a camera URL first.');
      openCameraPreview(url);
    });
  });
}

// ── Form submit ───────────────────────────────────────────────
function initFormSubmit() {
  const form    = document.getElementById('addBusForm');
  const saveBtn = document.getElementById('saveBusBtn');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!validateAllFields()) return;

    setButtonLoading(saveBtn, true, 'Registering bus...');
    hideFormAlert();

    const payload = buildPayload();

    // Final uniqueness check before insert (race condition guard)
    const [deviceOk, plateOk] = await Promise.all([
      checkUnique('buses', 'device_id',    payload.device_id),
      checkUnique('buses', 'number_plate', payload.number_plate),
    ]);

    if (!deviceOk) {
      setButtonLoading(saveBtn, false);
      setFieldError(document.getElementById('busDeviceId'), 'Device ID already taken');
      return;
    }
    if (!plateOk) {
      setButtonLoading(saveBtn, false);
      setFieldError(document.getElementById('busNumberPlate'), 'Number plate already registered');
      return;
    }

    const { data, error } = await NAVBUS_DB
      .from('buses')
      .insert([payload])
      .select()
      .single();

    setButtonLoading(saveBtn, false);

    if (error) {
      showFormAlert('error', error.message || 'Failed to register bus. Please try again.');
      return;
    }

    showFormAlert('success', `Bus ${payload.number_plate} registered successfully!`);
    Toast.success('Bus registered!');

    // Redirect to buses list after short delay
    setTimeout(() => { window.location.href = 'buses.html'; }, 1400);
  });
}

// ── Build Supabase payload ────────────────────────────────────
function buildPayload() {
  const get = id => document.getElementById(id)?.value?.trim() || null;

  return {
    number_plate:       get('busNumberPlate')?.toUpperCase(),
    device_id:          get('busDeviceId')?.toUpperCase(),
    bus_name:           get('busName'),
    bus_model:          get('busModel'),
    bus_type:           get('busType'),
    capacity:           parseInt(get('busCapacity')) || 40,
    route_id:           get('busRoute')    || null,
    driver_id:          get('busDriver')   || null,
    camera_url_front:   get('camFront')    || null,
    camera_url_rear:    get('camRear')     || null,
    camera_url_cabin:   get('camCabin')    || null,
    camera_url_driver:  get('camDriver')   || null,
    status:             'offline',
    is_active:          true,
  };
}

// ── Validate all required fields ──────────────────────────────
function validateAllFields() {
  let valid = true;

  const checks = [
    { id: 'busNumberPlate', msg: 'Number plate is required.'       },
    { id: 'busDeviceId',    msg: 'Device ID is required.'          },
    { id: 'busType',        msg: 'Bus type is required.'           },
    { id: 'busCapacity',    msg: 'Capacity is required.'           },
  ];

  checks.forEach(({ id, msg }) => {
    const el = document.getElementById(id);
    if (!el?.value?.trim()) {
      setFieldError(el, msg);
      valid = false;
    }
  });

  // Capacity range check
  const cap = parseInt(document.getElementById('busCapacity')?.value);
  if (cap && (cap < 1 || cap > 120)) {
    setFieldError(document.getElementById('busCapacity'), 'Capacity must be between 1 and 120.');
    valid = false;
  }

  return valid;
}

// ── Camera preview modal ──────────────────────────────────────
function openCameraPreview(url) {
  const modal = document.getElementById('cameraPreviewModal');
  const frame = document.getElementById('cameraPreviewFrame');
  if (!modal || !frame) return;

  if (url.match(/\.(jpg|jpeg|png|gif|mjpeg)(\?.*)?$/i)) {
    frame.src = url;
    frame.style.display = 'block';
    document.getElementById('cameraPreviewLink').style.display = 'none';
  } else {
    frame.style.display  = 'none';
    const linkEl = document.getElementById('cameraPreviewLink');
    if (linkEl) { linkEl.href = url; linkEl.style.display = 'block'; }
  }

  modal.style.display = 'flex';
}

// ── Field state helpers ───────────────────────────────────────
function setFieldChecking(input) {
  clearFieldState(input);
  const wrap = input.closest('.input-wrap') || input.parentElement;
  const spinner = document.createElement('span');
  spinner.className = 'input-checking';
  spinner.innerHTML = '<span class="input-spinner"></span>';
  spinner.dataset.state = 'checking';
  wrap.appendChild(spinner);
}

function setFieldValid(input, msg = '') {
  clearFieldState(input);
  input.classList.add('input-valid');
  const wrap = input.closest('.input-wrap') || input.parentElement;
  const icon = document.createElement('span');
  icon.className = 'input-checking';
  icon.innerHTML = '<span class="input-check-ok">✓</span>';
  icon.dataset.state = 'valid';
  wrap.appendChild(icon);
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
  const group = input?.closest('.form-group');
  if (!group) return;
  group.querySelector('.field-feedback')?.remove();
  const el = document.createElement('span');
  el.className    = 'field-feedback form-' + (type === 'error' ? 'error-text' : 'hint-text');
  el.textContent  = msg;
  if (type === 'success') el.style.color = 'var(--success)';
  group.appendChild(el);
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

function setButtonLoading(btn, loading, loadText = 'Saving...') {
  if (!btn) return;
  if (loading) {
    btn.dataset.orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner"></span><span>${loadText}</span>`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.orig || btn.innerHTML;
  }
}

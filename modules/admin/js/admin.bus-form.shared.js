/* ============================================================
   NavBus — Admin Bus Form Shared Utilities
   FIX (Bug 5): loadRoutesDropdown() and loadDriversDropdown()
   were duplicated in both admin.add-bus.js and admin.edit-bus.js.
   Extracted here to a single shared file to prevent
   "function already declared" JS errors if both files are loaded.

   Include this file BEFORE admin.add-bus.js or admin.edit-bus.js.
   ============================================================ */

// ── Populate routes dropdown ──────────────────────────────────
async function loadRoutesDropdown() {
  const el = document.getElementById('busRoute');
  if (!el) return;

  const { data } = await NAVBUS_DB
    .from('routes')
    .select('id, route_number, name')
    .eq('is_active', true)
    .order('route_number');

  if (data) {
    data.forEach(r => {
      const opt = document.createElement('option');
      opt.value       = r.id;
      opt.textContent = `${r.route_number} — ${r.name}`;
      el.appendChild(opt);
    });
  }
}

// ── Populate drivers dropdown ─────────────────────────────────
async function loadDriversDropdown() {
  const el = document.getElementById('busDriver');
  if (!el) return;

  const { data } = await NAVBUS_DB
    .from('drivers')
    .select('id, name, phone')
    .eq('is_active', true)
    .order('name');

  if (data) {
    data.forEach(d => {
      const opt = document.createElement('option');
      opt.value       = d.id;
      opt.textContent = `${d.name} (${d.phone})`;
      el.appendChild(opt);
    });
  }
}

// ── Check field uniqueness in Supabase ────────────────────────
async function checkUnique(table, column, value, excludeValue = null) {
  let query = NAVBUS_DB
    .from(table)
    .select('id')
    .eq(column, value);

  if (excludeValue) {
    query = query.neq(column, excludeValue);
  }

  const { data, error } = await query.maybeSingle();
  if (error) return true; // Assume unique on error to avoid blocking
  return !data; // true = unique, false = already exists
}

// ── Field state helpers ───────────────────────────────────────
function setFieldChecking(input) {
  clearFieldState(input);
  input.classList.add('field-checking');
}

function setFieldValid(input, message = '') {
  clearFieldState(input);
  input.classList.add('field-valid');
  const wrap = input.closest('.form-group');
  if (wrap && message) {
    const hint = document.createElement('span');
    hint.className   = 'form-hint-msg valid';
    hint.textContent = message;
    wrap.appendChild(hint);
  }
}

function setFieldError(input, message = '') {
  clearFieldState(input);
  input.classList.add('input-error');
  const wrap = input.closest('.form-group');
  if (wrap && message) {
    const err = document.createElement('span');
    err.className   = 'form-error-msg';
    err.textContent = message;
    wrap.appendChild(err);
  }
}

function clearFieldState(input) {
  input.classList.remove('field-checking', 'field-valid', 'input-error');
  const wrap = input.closest('.form-group');
  if (wrap) {
    wrap.querySelector('.form-hint-msg')?.remove();
    wrap.querySelector('.form-error-msg')?.remove();
  }
}

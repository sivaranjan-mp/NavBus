/* ============================================================
   NavBus — Admin Settings Module
   - Profile: loads from profiles table, saves name
   - Password: uses NAVBUS_DB.auth.updateUser()
   - Preferences: stored in localStorage
   - API keys: display-only (from config.js)
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  loadProfile();
  prefillApiPanel();
  loadPreferences();
  bindActions();
});

// ── Load admin profile from Supabase ─────────────────────────
async function loadProfile() {
  const { data: { session } } = await NAVBUS_DB.auth.getSession();
  if (!session) return;

  const userId = session.user.id;
  const email  = session.user.email;

  // Populate email field (always from auth)
  setVal('fProfileEmail', email);

  // Load name + phone from profiles table
  const { data: profile } = await NAVBUS_DB
    .from('profiles')
    .select('name, phone')
    .eq('id', userId)
    .single();

  if (profile) {
    setVal('fProfileName',  profile.name  || '');
    setVal('fProfilePhone', profile.phone || '');
  }

  // Store userId for save
  window._SETTINGS_USER_ID = userId;
}

// ── Save profile ──────────────────────────────────────────────
async function saveProfile() {
  const name  = getVal('fProfileName').trim();
  const phone = getVal('fProfilePhone').trim() || null;

  if (!name) {
    showMsg('profileMsg', 'Name is required.', 'error');
    return;
  }

  setBtnLoading('btnSaveProfile', true, 'Saving…', 'Save Profile');

  const { error } = await NAVBUS_DB
    .from('profiles')
    .update({ name, phone, updated_at: new Date().toISOString() })
    .eq('id', window._SETTINGS_USER_ID);

  setBtnLoading('btnSaveProfile', false, '', 'Save Profile');

  if (error) {
    showMsg('profileMsg', 'Save failed: ' + error.message, 'error');
    return;
  }

  // Also update sidebar user name
  const nameEl = document.getElementById('sidebarUserName');
  if (nameEl) nameEl.textContent = name;
  const avatarEl = document.getElementById('sidebarAvatar');
  if (avatarEl) avatarEl.textContent = name.slice(0, 2).toUpperCase();

  showMsg('profileMsg', 'Profile saved successfully.', 'success');
}
window.saveProfile = saveProfile;

// ── Change password ───────────────────────────────────────────
async function changePassword() {
  const current = getVal('fCurrentPwd');
  const newPwd  = getVal('fNewPwd');
  const confirm = getVal('fConfirmPwd');

  if (!current || !newPwd || !confirm) {
    showMsg('pwdMsg', 'All password fields are required.', 'error');
    return;
  }
  if (newPwd.length < 8) {
    showMsg('pwdMsg', 'New password must be at least 8 characters.', 'error');
    return;
  }
  if (newPwd !== confirm) {
    showMsg('pwdMsg', 'Passwords do not match.', 'error');
    return;
  }

  // Supabase doesn't expose a "verify current password" method on client SDK.
  // We re-authenticate to verify the current password before updating.
  const { data: { session } } = await NAVBUS_DB.auth.getSession();
  const email = session?.user?.email;
  if (!email) { showMsg('pwdMsg', 'Session expired. Please log in again.', 'error'); return; }

  // Verify current password by signing in
  setBtnLoading('btnChangePwd', true, 'Verifying…', 'Update Password');
  const { error: signInErr } = await NAVBUS_DB.auth.signInWithPassword({ email, password: current });

  if (signInErr) {
    setBtnLoading('btnChangePwd', false, '', 'Update Password');
    showMsg('pwdMsg', 'Current password is incorrect.', 'error');
    return;
  }

  setBtnLoading('btnChangePwd', true, 'Updating…', 'Update Password');
  const { error } = await NAVBUS_DB.auth.updateUser({ password: newPwd });
  setBtnLoading('btnChangePwd', false, '', 'Update Password');

  if (error) {
    showMsg('pwdMsg', 'Update failed: ' + error.message, 'error');
    return;
  }

  ['fCurrentPwd', 'fNewPwd', 'fConfirmPwd'].forEach(id => setVal(id, ''));
  showMsg('pwdMsg', 'Password updated successfully.', 'success');
}
window.changePassword = changePassword;

// ── Prefill API panel from config.js ─────────────────────────
function prefillApiPanel() {
  // config.js already defines SUPABASE_URL and SUPABASE_ANON_KEY globally
  if (typeof SUPABASE_URL !== 'undefined') {
    const urlEl = document.getElementById('fSupabaseUrl');
    if (urlEl) { urlEl.value = SUPABASE_URL; urlEl.readOnly = true; }
  }
  if (typeof SUPABASE_ANON_KEY !== 'undefined') {
    const keyEl = document.getElementById('fSupabaseKey');
    if (keyEl) { keyEl.value = SUPABASE_ANON_KEY; keyEl.readOnly = true; }
  }
}

// ── Preferences (localStorage) ────────────────────────────────
const PREFS_KEY = 'navbus_admin_prefs';

function loadPreferences() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    const checks = ['prefEmailAlert', 'prefSoundAlert', 'prefAutoRefresh', 'prefDarkMode'];
    checks.forEach(id => {
      const el = document.getElementById(id);
      if (el && id in prefs) el.checked = prefs[id];
    });
  } catch {}
}

function savePreferences() {
  const prefs = {};
  ['prefEmailAlert', 'prefSoundAlert', 'prefAutoRefresh', 'prefDarkMode'].forEach(id => {
    const el = document.getElementById(id);
    if (el) prefs[id] = el.checked;
  });
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  showMsg('prefsMsg', 'Preferences saved.', 'success');
}
window.savePreferences = savePreferences;

// ── Bind buttons ──────────────────────────────────────────────
function bindActions() {
  document.getElementById('btnSaveProfile')?.addEventListener('click', saveProfile);
  document.getElementById('btnChangePwd')?.addEventListener('click', changePassword);
  document.getElementById('btnSavePrefs')?.addEventListener('click', savePreferences);
}

// ── Helpers ───────────────────────────────────────────────────
function getVal(id) { return document.getElementById(id)?.value || ''; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

function showMsg(targetId, msg, type) {
  const el = document.getElementById(targetId);
  if (!el) {
    // Fallback toast if no dedicated message element
    showToast(msg, type);
    return;
  }
  el.textContent = msg;
  el.style.display   = 'block';
  el.style.color     = type === 'success' ? '#4ade80' : '#f87171';
  el.style.fontSize  = '0.8rem';
  el.style.marginTop = '8px';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function setBtnLoading(id, on, loadingText, defaultText) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled    = on;
  btn.textContent = on ? loadingText : defaultText;
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position:'fixed', bottom:'24px', right:'24px', padding:'12px 20px',
    background: type === 'success' ? '#4ade80' : '#f87171',
    color:'#000', borderRadius:'8px', fontWeight:'600', zIndex:'9999', transition:'opacity 0.3s',
  });
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 3500);
}

// Legacy stub — no longer a no-op
window.saved = () => showToast('Use the Save buttons in each section.', 'success');
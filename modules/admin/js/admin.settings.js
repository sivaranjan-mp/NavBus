/* ============================================================
   NavBus — Admin Settings Module
   - Profile:       loads/saves to public.users table
   - Password:      verifies current, updates via Supabase Auth
   - Notifications: persisted to localStorage (navbus_admin_prefs)
   - Tracking:      persisted to localStorage (navbus_admin_tracking)
   - Organisation:  persisted to localStorage (navbus_admin_org)
   - API panel:     display-only (from config.js globals)
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  await loadProfile();
  prefillApiPanel();
  loadPreferences();
  loadTrackingSettings();
  loadOrgSettings();
  bindActions();
});

// ── Load admin profile from Supabase ─────────────────────────
async function loadProfile() {
  const { data: { session } } = await NAVBUS_DB.auth.getSession();
  if (!session) return;

  const userId = session.user.id;
  const email  = session.user.email;

  setVal('fProfileEmail', email);

  const { data: profile } = await NAVBUS_DB
    .from('users')
    .select('name, phone')
    .eq('id', userId)
    .single();

  if (profile) {
    setVal('fProfileName',  profile.name  || '');
    setVal('fProfilePhone', profile.phone || '');
  }

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
    .from('users')
    .update({ name, phone })
    .eq('id', window._SETTINGS_USER_ID);

  setBtnLoading('btnSaveProfile', false, '', 'Save Profile');

  if (error) {
    showMsg('profileMsg', 'Save failed: ' + error.message, 'error');
    return;
  }

  // Update sidebar
  const nameEl   = document.getElementById('sidebarUserName');
  const avatarEl = document.getElementById('sidebarAvatar');
  if (nameEl)   nameEl.textContent   = name;
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

  const { data: { session } } = await NAVBUS_DB.auth.getSession();
  const email = session?.user?.email;
  if (!email) { showMsg('pwdMsg', 'Session expired. Please log in again.', 'error'); return; }

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
  if (typeof SUPABASE_URL !== 'undefined') {
    const urlEl = document.getElementById('fSupabaseUrl');
    if (urlEl) { urlEl.value = SUPABASE_URL; urlEl.readOnly = true; }
  }
  if (typeof SUPABASE_ANON_KEY !== 'undefined') {
    const keyEl = document.getElementById('fSupabaseKey');
    if (keyEl) { keyEl.value = SUPABASE_ANON_KEY; keyEl.readOnly = true; }
  }
}

// ── Notifications / Preferences (localStorage) ───────────────
const PREFS_KEY    = 'navbus_admin_prefs';
const TRACKING_KEY = 'navbus_admin_tracking';
const ORG_KEY      = 'navbus_admin_org';

const PREF_TOGGLES = [
  'prefGpsAlert', 'prefSoundAlert', 'prefCameraAlert',
  'prefAutoRefresh', 'prefEmailAlert',
];

function loadPreferences() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    PREF_TOGGLES.forEach(id => {
      const el = document.getElementById(id);
      if (el && id in prefs) el.checked = prefs[id];
    });
  } catch {}
}

function savePreferences() {
  const prefs = {};
  PREF_TOGGLES.forEach(id => {
    const el = document.getElementById(id);
    if (el) prefs[id] = el.checked;
  });
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  showMsg('prefsMsg', 'Preferences saved.', 'success');
}
window.savePreferences = savePreferences;

// ── Tracking settings (localStorage) ─────────────────────────
const TRACKING_FIELDS = [
  { id: 'fPollingInterval', key: 'pollingInterval', default: '10' },
  { id: 'fMaxSpeed',        key: 'maxSpeed',        default: '80' },
  { id: 'fGpsTimeout',      key: 'gpsTimeout',      default: '2'  },
  { id: 'fIdleTimeout',     key: 'idleTimeout',     default: '5'  },
];
const TRACKING_TOGGLES = [
  { id: 'prefRealtimeTracking', key: 'realtimeTracking', default: true },
  { id: 'prefTrackHistory',     key: 'trackHistory',     default: true },
];

function loadTrackingSettings() {
  try {
    const t = JSON.parse(localStorage.getItem(TRACKING_KEY) || '{}');
    TRACKING_FIELDS.forEach(f => {
      const el = document.getElementById(f.id);
      if (el) el.value = t[f.key] ?? f.default;
    });
    TRACKING_TOGGLES.forEach(f => {
      const el = document.getElementById(f.id);
      if (el) el.checked = f.key in t ? t[f.key] : f.default;
    });
  } catch {}
}

function saveTrackingSettings() {
  const t = {};
  TRACKING_FIELDS.forEach(f => {
    const el = document.getElementById(f.id);
    if (el) t[f.key] = el.value;
  });
  TRACKING_TOGGLES.forEach(f => {
    const el = document.getElementById(f.id);
    if (el) t[f.key] = el.checked;
  });
  localStorage.setItem(TRACKING_KEY, JSON.stringify(t));
  showMsg('trackingMsg', 'Tracking settings saved.', 'success');
}

function resetTrackingSettings() {
  localStorage.removeItem(TRACKING_KEY);
  loadTrackingSettings();
  showMsg('trackingMsg', 'Reset to defaults.', 'success');
}
window.saveTrackingSettings  = saveTrackingSettings;
window.resetTrackingSettings = resetTrackingSettings;

// ── Organisation settings (localStorage) ─────────────────────
const ORG_FIELDS = [
  { id: 'fOrgName',        key: 'orgName',        default: 'NavBus Transport Dept.'                },
  { id: 'fOrgEmail',       key: 'orgEmail',       default: 'admin@navbus.in'                       },
  { id: 'fTimezone',       key: 'timezone',       default: 'Asia/Kolkata (IST, UTC+5:30)'          },
  { id: 'fDateFormat',     key: 'dateFormat',     default: 'YYYY-MM-DD'                            },
  { id: 'fOrgDescription', key: 'orgDescription', default: 'Bus tracking and fleet management system for Ranipet district.' },
];

function loadOrgSettings() {
  try {
    const o = JSON.parse(localStorage.getItem(ORG_KEY) || '{}');
    ORG_FIELDS.forEach(f => {
      const el = document.getElementById(f.id);
      if (el && f.key in o) el.value = o[f.key];
    });
  } catch {}
}

function saveOrgSettings() {
  const o = {};
  ORG_FIELDS.forEach(f => {
    const el = document.getElementById(f.id);
    if (el) o[f.key] = el.value;
  });
  localStorage.setItem(ORG_KEY, JSON.stringify(o));
  showMsg('orgMsg', 'Organisation settings saved.', 'success');
}

function resetOrgSettings() {
  localStorage.removeItem(ORG_KEY);
  loadOrgSettings();
  showMsg('orgMsg', 'Reset to defaults.', 'success');
}
window.saveOrgSettings  = saveOrgSettings;
window.resetOrgSettings = resetOrgSettings;

// ── Bind buttons ──────────────────────────────────────────────
function bindActions() {
  document.getElementById('btnSaveProfile')?.addEventListener('click',   saveProfile);
  document.getElementById('btnChangePwd')?.addEventListener('click',     changePassword);
  document.getElementById('btnSavePrefs')?.addEventListener('click',     savePreferences);
  document.getElementById('btnSaveTracking')?.addEventListener('click',  saveTrackingSettings);
  document.getElementById('btnResetTracking')?.addEventListener('click', resetTrackingSettings);
  document.getElementById('btnSaveOrg')?.addEventListener('click',       saveOrgSettings);
  document.getElementById('btnResetOrg')?.addEventListener('click',      resetOrgSettings);
}

// ── Helpers ───────────────────────────────────────────────────
function getVal(id) { return document.getElementById(id)?.value || ''; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

function showMsg(targetId, msg, type) {
  const el = document.getElementById(targetId);
  if (!el) { showToast(msg, type); return; }
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

// Keep legacy stub working (used by API tab reset buttons for now)
window.saved = () => showToast('Changes saved.', 'success');

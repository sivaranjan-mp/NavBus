/* ============================================================
   NavBus — Auth Session Guard
   Protect pages that require authentication
   ============================================================ */

// FIX (Bug 2): Helper to resolve the correct path to the auth folder
// regardless of which page calls this file (auth pages, admin pages, user pages).
function _resolveAuthPath(filename) {
  const path = window.location.pathname;
  if (path.includes('/admin/'))         return '../../modules/auth/' + filename;
  if (path.includes('/user/'))          return '../modules/auth/' + filename;
  if (path.includes('/modules/auth/'))  return filename;
  // Default fallback (root-level pages)
  return 'modules/auth/' + filename;
}

function _resolveAppPath(role) {
  const path = window.location.pathname;
  if (role === 'admin') {
    if (path.includes('/modules/auth/')) return '../../admin/dashboard.html';
    if (path.includes('/user/'))         return '../admin/dashboard.html';
    return 'admin/dashboard.html';
  } else {
    if (path.includes('/modules/auth/')) return '../../user/home.html';
    if (path.includes('/admin/'))        return '../../user/home.html';
    return 'user/home.html';
  }
}

// ── Require any authenticated user ───────────────────────────
async function requireAuth() {
  const session = await authGetSession();
  if (!session) {
    window.location.href = _resolveAuthPath('login.html');
    return null;
  }
  return session;
}

// ── Require Admin role ────────────────────────────────────────
async function requireAdmin() {
  const session = await requireAuth();
  if (!session) return null;

  const role = await authGetUserRole(session.user);
  if (role !== 'admin') {
    window.location.href = _resolveAppPath('user');
    return null;
  }
  return session;
}

// ── Require User role ─────────────────────────────────────────
async function requireUser() {
  const session = await requireAuth();
  if (!session) return null;

  const role = await authGetUserRole(session.user);
  if (role !== 'user') {
    window.location.href = _resolveAppPath('admin');
    return null;
  }
  return session;
}

// ── Get logged-in user profile ────────────────────────────────
async function getLoggedInProfile() {
  const session = await authGetSession();
  if (!session) return null;

  const { data } = await NAVBUS_DB
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  return data;
}

// ── Listen for auth state changes ────────────────────────────
function onAuthStateChange(callback) {
  NAVBUS_DB.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

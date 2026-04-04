/* ============================================================
   NavBus — Admin Auth Guard
   Protects all admin pages — redirects non-admins
   ============================================================ */

(async function guardAdminPage() {
  // Get current session
  const { data: { session }, error } = await NAVBUS_DB.auth.getSession();

  if (!session) {
    // Not logged in → send to login
    // FIX (Bug 2): Use path relative to admin/ folder
    window.location.replace('../../modules/auth/login.html');
    return;
  }

  // Check role from user_metadata (fast) or DB fallback
  const metaRole = session.user?.user_metadata?.role;

  if (metaRole === 'admin') {
    // Populate header user info immediately
    _populateAdminUser(session.user);
    return;
  }

  // FIX (Bug 1): Changed from('users') → from('profiles') to match supabase/schema.sql
  const { data: profile } = await NAVBUS_DB
    .from('profiles')
    .select('role, name')
    .eq('id', session.user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    // Not an admin — redirect to user dashboard
    // FIX (Bug 2): Use path relative to admin/ folder
    window.location.replace('../../user/home.html');
    return;
  }

  _populateAdminUser(session.user, profile);
})();

function _populateAdminUser(user, profile = null) {
  const name  = profile?.name || user.user_metadata?.name || 'Admin';
  const email = user.email || '';

  // Sidebar user info
  const nameEl   = document.getElementById('sidebarUserName');
  const avatarEl = document.getElementById('sidebarAvatar');
  const emailEl  = document.getElementById('sidebarUserEmail');

  if (nameEl)   nameEl.textContent   = name;
  if (avatarEl) avatarEl.textContent = name.slice(0, 2).toUpperCase();
  if (emailEl)  emailEl.textContent  = email;

  // Store for use elsewhere
  window.NAVBUS_ADMIN = { id: user.id, name, email };
}

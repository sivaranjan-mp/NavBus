/* ============================================================
   NavBus — Admin Auth Guard
   Protects all admin pages — redirects non-admins
   ============================================================ */

(async function guardAdminPage() {
  const { data: { session } } = await NAVBUS_DB.auth.getSession();

  if (!session) {
    window.location.replace('../../modules/auth/login.html');
    return;
  }

  // Step 1: Check JWT metadata for a fast first decision
  const metaRole = session.user?.user_metadata?.role;

  // Step 2: Always attempt DB verification for stronger security,
  // but fall back to JWT if the DB call fails (network issue, RLS, etc.)
  // Only hard-redirect if DB explicitly returns a non-admin role.
  let dbRole = null;
  let dbName = null;
  try {
    const { data: profile, error: profileErr } = await NAVBUS_DB
      .from('users')
      .select('role, name')
      .eq('id', session.user.id)
      .single();

    if (!profileErr && profile) {
      dbRole = profile.role;
      dbName = profile.name;
    }
  } catch (_) {
    // DB unreachable — fall through to JWT fallback
  }

  // Determine effective role: DB wins if available, otherwise JWT
  const effectiveRole = dbRole ?? metaRole;

  if (effectiveRole !== 'admin') {
    // Confirmed non-admin or completely unknown — sign out and redirect
    await NAVBUS_DB.auth.signOut();
    window.location.replace('../../modules/auth/login.html');
    return;
  }

  // Populate sidebar with whichever source we have
  _populateAdminUser(session.user, dbName ? { name: dbName } : null);
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

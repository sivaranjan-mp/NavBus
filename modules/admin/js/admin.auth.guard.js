/* ============================================================
   NavBus — Admin Auth Guard
   Protects all admin pages — redirects non-admins
   ============================================================ */

(async function guardAdminPage() {
  // Get current session
  const { data: { session }, error } = await NAVBUS_DB.auth.getSession();

  if (!session) {
    window.location.replace('../../modules/auth/login.html');
    return;
  }

  // SECURITY: Always verify role from the database — never trust JWT metadata alone.
  // JWT user_metadata can be read/forged by a local attacker in DevTools.
  let verified = false;
  try {
    const { data: profile, error: profileErr } = await NAVBUS_DB
      .from('users')
      .select('role, name')
      .eq('id', session.user.id)
      .single();

    if (!profileErr && profile?.role === 'admin') {
      verified = true;
      _populateAdminUser(session.user, profile);
    }
  } catch (_) {
    // DB call failed — fail closed (deny access)
  }

  if (!verified) {
    // Not an admin — wipe session and redirect
    await NAVBUS_DB.auth.signOut();
    window.location.replace('../../modules/auth/login.html');
  }
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

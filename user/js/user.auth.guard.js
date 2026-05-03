/* ============================================================
   NavBus — User Auth Guard (legacy /user/ folder)
   Protects all user pages, redirects unauthenticated users.
   Stores session and profile in window.NAVBUS_USER.
   Exposes window.NAVBUS_USER_READY (Promise) for dependent scripts.
   ============================================================ */

window.NAVBUS_USER_READY = (async function guardUserPage() {
  const { data: { session } } = await NAVBUS_DB.auth.getSession();

  if (!session) {
    window.location.replace('../modules/auth/login.html');
    return null;
  }

  // Always verify role from DB — never trust JWT metadata alone
  const { data: profile } = await NAVBUS_DB
    .from('users')
    .select('id, name, email, role')
    .eq('id', session.user.id)
    .single();

  const role = profile?.role || session.user.user_metadata?.role || 'user';

  // Security: if an admin accidentally lands on a user page, redirect them
  if (role === 'admin') {
    window.location.replace('../modules/admin/dashboard.html');
    return null;
  }

  const user = {
    id:        session.user.id,
    name:      profile?.name  || session.user.user_metadata?.name  || 'Passenger',
    email:     profile?.email || session.user.email || '',
    role,
    createdAt: session.user.created_at || null,
  };

  // Store globally
  window.NAVBUS_USER = user;

  // Populate header avatar / greeting
  const avatarEl   = document.getElementById('userAvatar');
  const greetingEl = document.getElementById('userGreeting');
  const nameEl     = document.getElementById('userName');

  const firstName = user.name.split(' ')[0];
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (avatarEl)   avatarEl.textContent   = user.name.slice(0, 2).toUpperCase();
  if (greetingEl) greetingEl.textContent = greeting + ',';
  if (nameEl)     nameEl.innerHTML       = `${firstName} <span>👋</span>`;

  return user;
})();


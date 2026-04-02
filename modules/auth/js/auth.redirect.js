/* ============================================================
   NavBus — Auth Redirect
   Role-based routing after login
   ============================================================ */

// ── Redirect user based on their role ─────────────────────────
async function redirectByRole(user = null) {
  const role = await authGetUserRole(user);

  if (role === 'admin') {
    window.location.href = APP_ROUTES.adminDashboard;
  } else {
    window.location.href = APP_ROUTES.userHome;
  }
}

// ── Redirect if already authenticated ─────────────────────────
// Call this on auth pages to skip login if already logged in
async function redirectIfAuthenticated() {
  const session = await authGetSession();
  if (session) {
    await redirectByRole(session.user);
  }
}

/* ============================================================
   NavBus — Auth Core
   Core Supabase authentication functions
   ============================================================ */

// ── SIGN UP ──────────────────────────────────────────────────
async function authSignUp(name, email, password) {
  const role = isAdminEmail(email) ? 'admin' : 'user';

  const { data, error } = await NAVBUS_DB.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        name:  name.trim(),
        role:  role,
        email: email.trim().toLowerCase(),
      }
    }
  });

  if (error) return { error };

  // Supabase returns 200 with a fake user (no identities) when the email
  // is already registered and "Confirm email" is disabled.
  // Detect this and surface it as a proper error.
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { error: { message: 'already registered' } };
  }

  // Profile row is auto-created by Supabase trigger (see schema.sql).
  // Fallback: manually insert if trigger not set up yet.
  if (data?.user) {
    const { error: profileError } = await NAVBUS_DB
      .from('profiles')
      .upsert({
        id:    data.user.id,
        name:  name.trim(),
        email: email.trim().toLowerCase(),
        role:  role,
      }, { onConflict: 'id' });

    if (profileError) {
      console.warn('[NavBus] Profile upsert warning:', profileError.message);
    }
  }

  return { data, role, requiresOTP: !data?.session };
}

// ── VERIFY OTP (SIGNUP CONFIRMATION) ─────────────────────────
async function authVerifySignupOTP(email, token) {
  const { data, error } = await NAVBUS_DB.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type:  'signup',
  });
  if (error) return { error };
  return { data };
}

// ── SIGN IN ──────────────────────────────────────────────────
async function authSignIn(email, password) {
  const { data, error } = await NAVBUS_DB.auth.signInWithPassword({
    email:    email.trim().toLowerCase(),
    password,
  });
  if (error) return { error };
  return { data };
}

// ── SIGN OUT ─────────────────────────────────────────────────
async function authSignOut() {
  const { error } = await NAVBUS_DB.auth.signOut();
  if (error) console.error('[NavBus] Sign out error:', error.message);
  window.location.href = APP_ROUTES.login;
}

// ── GET CURRENT SESSION ──────────────────────────────────────
async function authGetSession() {
  const { data: { session }, error } = await NAVBUS_DB.auth.getSession();
  if (error) return null;
  return session;
}

// ── GET CURRENT USER ─────────────────────────────────────────
async function authGetUser() {
  const { data: { user }, error } = await NAVBUS_DB.auth.getUser();
  if (error) return null;
  return user;
}

// ── GET USER ROLE ─────────────────────────────────────────────
// Checks user_metadata first (fast), falls back to profiles table
async function authGetUserRole(user = null) {
  const currentUser = user || await authGetUser();
  if (!currentUser) return null;

  // 1. Check user_metadata (fastest — set at signup)
  const metaRole = currentUser.user_metadata?.role;
  if (metaRole && ['admin', 'user'].includes(metaRole)) return metaRole;

  // 2. Fallback: query profiles table
  const { data, error } = await NAVBUS_DB
    .from('profiles')
    .select('role')
    .eq('id', currentUser.id)
    .single();

  if (error || !data) return 'user'; // Default to user
  return data.role;
}

// ── SEND PASSWORD RESET EMAIL (OTP) ──────────────────────────
async function authSendPasswordReset(email) {
  const { error } = await NAVBUS_DB.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    {
      // Optional: override redirect URL
      // redirectTo: 'https://yoursite.com/modules/auth/reset-password.html'
    }
  );
  if (error) return { error };
  return { success: true };
}

// ── VERIFY RECOVERY OTP ───────────────────────────────────────
async function authVerifyRecoveryOTP(email, token) {
  const { data, error } = await NAVBUS_DB.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type:  'recovery',
  });
  if (error) return { error };
  return { data };
}

// ── UPDATE PASSWORD ───────────────────────────────────────────
async function authUpdatePassword(newPassword) {
  const { data, error } = await NAVBUS_DB.auth.updateUser({
    password: newPassword,
  });
  if (error) return { error };
  return { data };
}

// ── RESEND OTP ────────────────────────────────────────────────
async function authResendOTP(email, type = 'signup') {
  const { error } = await NAVBUS_DB.auth.resend({
    type,
    email: email.trim().toLowerCase(),
  });
  if (error) return { error };
  return { success: true };
}

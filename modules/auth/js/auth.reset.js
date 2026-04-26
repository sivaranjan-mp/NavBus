/* ============================================================
   NavBus — Password Reset Flow
   Handles forgot password + OTP + new password
   ============================================================ */

// Stored temporarily during reset flow (sessionStorage only)
let _resetEmail = '';

// ── STEP 1: Send reset OTP ────────────────────────────────────
async function handleForgotPassword(email) {
  if (!validateEmail(email)) {
    return { error: { message: 'Please enter a valid email address.' } };
  }

  const result = await authSendPasswordReset(email);
  if (result.error) return result;

  // Save email for OTP step
  sessionStorage.setItem('navbus_reset_email', email.trim().toLowerCase());
  return { success: true };
}

// ── STEP 2: Verify recovery OTP ──────────────────────────────
async function handleVerifyRecoveryOTP(email, token) {
  if (!email || !token || token.length < 6) {
    return { error: { message: 'Please enter the complete 6-digit code.' } };
  }

  const result = await authVerifyRecoveryOTP(email, token);
  if (result.error) return result;

  // Mark OTP as verified so reset page can proceed
  sessionStorage.setItem('navbus_otp_verified', '1');
  return { success: true };
}

// ── STEP 3: Update to new password ───────────────────────────
async function handleUpdatePassword(newPassword, confirmPassword) {
  if (!validatePassword(newPassword)) {
    return { error: { message: getPasswordRequirementHint() } };
  }
  if (newPassword !== confirmPassword) {
    return { error: { message: 'Passwords do not match.' } };
  }

  const result = await authUpdatePassword(newPassword);
  if (result.error) return result;

  // Clear reset session data
  sessionStorage.removeItem('navbus_reset_email');
  sessionStorage.removeItem('navbus_otp_verified');
  return { success: true };
}

// ── Get saved reset email ────────────────────────────────────
function getResetEmail() {
  return sessionStorage.getItem('navbus_reset_email') || '';
}

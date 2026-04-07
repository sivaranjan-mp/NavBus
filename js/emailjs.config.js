<<<<<<< HEAD
=======
/* ============================================================
   NavBus — EmailJS Configuration
   ✏️  Replace the placeholder values below with your real
       credentials from https://www.emailjs.com
   ============================================================ */

// ── Your EmailJS Credentials ─────────────────────────────────
<<<<<<< HEAD
const EMAILJS_PUBLIC_KEY  = 'iT9KnA4H6VqidKTRd';    // Account → API Keys
const EMAILJS_SERVICE_ID  = 'service_33ks6of';    // Email Services tab
const EMAILJS_TEMPLATE_ID = 'template_sxq7pcr';   // Email Templates tab
=======

// ── OTP Settings ─────────────────────────────────────────────
const OTP_EXPIRY_MINUTES = 10;
const OTP_STORAGE_KEY    = 'navbus_pending_otp';

// ── Initialize EmailJS ────────────────────────────────────────
function initEmailJS() {
  if (typeof emailjs === 'undefined') {
    console.error('[NavBus] EmailJS SDK not loaded.');
    return;
  }
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}

// ── Generate a secure 6-digit OTP ────────────────────────────
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Save OTP to sessionStorage with expiry ────────────────────
function storeOTP(email, code) {
  const payload = {
    email:  email.toLowerCase().trim(),
    code,
    expiry: Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
  };
  sessionStorage.setItem(OTP_STORAGE_KEY, JSON.stringify(payload));
}

// ── Verify OTP entered by user ────────────────────────────────
function verifyStoredOTP(email, enteredCode) {
  const raw = sessionStorage.getItem(OTP_STORAGE_KEY);
  if (!raw) return { valid: false, reason: 'No verification code found. Please request a new one.' };

  let payload;
  try { payload = JSON.parse(raw); }
  catch { return { valid: false, reason: 'Verification data corrupted. Please try again.' }; }

  if (payload.email !== email.toLowerCase().trim())
    return { valid: false, reason: 'Email mismatch. Please restart registration.' };

  if (Date.now() > payload.expiry) {
    sessionStorage.removeItem(OTP_STORAGE_KEY);
    return { valid: false, reason: 'Code has expired. Please request a new one.' };
  }

  if (payload.code !== enteredCode.trim())
    return { valid: false, reason: 'Invalid code. Please check and try again.' };

  sessionStorage.removeItem(OTP_STORAGE_KEY);
  return { valid: true };
}

// ── Send OTP email via EmailJS ────────────────────────────────
// Template variables (must match your EmailJS template exactly):
//   {{to_email}}   → recipient address
//   {{to_name}}    → recipient name
//   {{otp_code}}   → the 6-digit code
//   {{expiry_min}} → expiry in minutes
//   {{app_name}}   → NavBus
async function sendOTPEmail(toEmail, toName, otpCode) {
  if (typeof emailjs === 'undefined')
    return { error: 'Email service not available. Please refresh and try again.' };

  const templateParams = {
    to_email:   toEmail,
    to_name:    toName || 'NavBus User',
    otp_code:   otpCode,
    expiry_min: OTP_EXPIRY_MINUTES,
    app_name:   typeof APP_NAME !== 'undefined' ? APP_NAME : 'NavBus',
  };

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);
    return { success: true };
  } catch (err) {
    console.error('[NavBus] EmailJS send error:', err);
    return { error: err?.text || 'Failed to send verification email. Please try again.' };
  }
}

// ── Generate + Store + Send OTP in one call ───────────────────
async function generateAndSendOTP(email, name) {
  const code = generateOTP();
  storeOTP(email, code);
  const result = await sendOTPEmail(email, name, code);
  if (result.error) {
    sessionStorage.removeItem(OTP_STORAGE_KEY);
    return { error: result.error };
  }
  return { success: true };
}
>>>>>>> dbe7791c34be8eb89adb194f09248c49a182766d

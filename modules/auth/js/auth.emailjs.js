/* ============================================================
   NavBus — EmailJS OTP Sender
   Replaces Supabase email OTP with EmailJS.

   Setup (one-time):
   1. Go to https://www.emailjs.com → sign up free
   2. Email Services → Add Service → connect your Gmail/Outlook
   3. Email Templates → Create Template (see template format below)
   4. Account → API Keys → copy your Public Key
   5. Fill in EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID,
      EMAILJS_SIGNUP_TEMPLATE_ID, EMAILJS_RESET_TEMPLATE_ID below

   EmailJS Template variables used:
     {{to_email}}   — recipient email address
     {{to_name}}    — recipient name (for signup)
     {{otp_code}}   — the 6-digit OTP
     {{app_name}}   — "NavBus"
     {{expires_min}} — "10" (minutes)
   ============================================================ */

// ── ✏️  FILL THESE IN ────────────────────────────────────────
const EMAILJS_PUBLIC_KEY          = 'iT9KnA4H6VqidKTRd';
const EMAILJS_SERVICE_ID          = 'service_33ks6of';
const EMAILJS_SIGNUP_TEMPLATE_ID  = 'template_sxq7pcr';
const EMAILJS_RESET_TEMPLATE_ID   = 'template_sxq7pcr';
// ────────────────────────────────────────────────────────────

const OTP_EXPIRY_MS  = 10 * 60 * 1000; // 10 minutes
const OTP_STORE_KEY  = 'navbus_otp_store';

// ── OTP Store (sessionStorage — cleared on tab close) ────────
const OTPStore = {
  save(email, code) {
    const record = { code, email: email.toLowerCase(), ts: Date.now() };
    sessionStorage.setItem(OTP_STORE_KEY, JSON.stringify(record));
  },
  get() {
    try { return JSON.parse(sessionStorage.getItem(OTP_STORE_KEY)); }
    catch { return null; }
  },
  clear() { sessionStorage.removeItem(OTP_STORE_KEY); },
  isValid(email, code) {
    const r = this.get();
    if (!r) return { valid: false, reason: 'No code found. Please request a new one.' };
    if (r.email !== email.toLowerCase())
      return { valid: false, reason: 'Email mismatch. Please request a new code.' };
    if (Date.now() - r.ts > OTP_EXPIRY_MS)
      return { valid: false, reason: 'Code has expired. Please request a new one.' };
    if (r.code !== code.trim())
      return { valid: false, reason: 'Invalid code. Please check and try again.' };
    return { valid: true };
  },
};

// ── Generate a secure 6-digit OTP ────────────────────────────
function generateOTP() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1000000).padStart(6, '0');
}

// ── Send OTP via EmailJS ──────────────────────────────────────
async function _sendViaEmailJS(templateId, templateParams) {
  // Lazy-load EmailJS SDK if not already loaded
  if (typeof emailjs === 'undefined') {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  return emailjs.send(EMAILJS_SERVICE_ID, templateId, templateParams);
}

// ── Send Signup Verification OTP ─────────────────────────────
async function emailjsSendSignupOTP(name, email) {
  const code = generateOTP();
  OTPStore.save(email, code);

  try {
    await _sendViaEmailJS(EMAILJS_SIGNUP_TEMPLATE_ID, {
      to_email:    email,
      to_name:     name || 'User',
      otp_code:    code,
      app_name:    'NavBus',
      expires_min: '10',
    });
    return { success: true };
  } catch (err) {
    console.error('[EmailJS] Signup OTP send failed:', err);
    OTPStore.clear();
    return { error: { message: 'Failed to send verification email. Please try again.' } };
  }
}

// ── Send Password Reset OTP ───────────────────────────────────
async function emailjsSendResetOTP(email) {
  const code = generateOTP();
  OTPStore.save(email, code);

  try {
    await _sendViaEmailJS(EMAILJS_RESET_TEMPLATE_ID, {
      to_email:    email,
      otp_code:    code,
      app_name:    'NavBus',
      expires_min: '10',
    });
    return { success: true };
  } catch (err) {
    console.error('[EmailJS] Reset OTP send failed:', err);
    OTPStore.clear();
    return { error: { message: 'Failed to send reset email. Please try again.' } };
  }
}

// ── Verify OTP (works for both signup + reset) ────────────────
function emailjsVerifyOTP(email, code) {
  const result = OTPStore.isValid(email, code);
  if (result.valid) OTPStore.clear();
  return result;
}

// ── Resend OTP ────────────────────────────────────────────────
async function emailjsResendOTP(name, email, type = 'signup') {
  if (type === 'signup') return emailjsSendSignupOTP(name, email);
  return emailjsSendResetOTP(email);
}

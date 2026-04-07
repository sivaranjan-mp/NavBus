/* ============================================================
   NavBus — Global Configuration
   ✏️  Edit this file with your Supabase credentials
   ============================================================ */

// ── Supabase Credentials ─────────────────────────────────────
const SUPABASE_URL      = 'https://pgorofyjjlxifgoejvbv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnb3JvZnlqamx4aWZnb2VqdmJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMTg4MjgsImV4cCI6MjA5MDU5NDgyOH0.GKCYeE7Sc8TrCZkR58hfzqqKitXAYIh_po4ACbJm7GM';

// ── Initialize Supabase Client ───────────────────────────────
// Supabase must be loaded via CDN before this file
const NAVBUS_DB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Admin Restricted Emails ──────────────────────────────────
// Only these emails are allowed to register/login as Admin.
// Add your admin emails here.
const ADMIN_EMAILS = [
  'sivaranjanmp0@gmail.com',
  'superadmin@navbus.in',
  // 'yourname@company.com',  ← add more admins here
];

// ── App Routes (relative to modules/auth/) ──────────────────
const APP_ROUTES = {
  login:           'login.html',
  register:        'register.html',
  forgotPassword:  'forgot-password.html',
  resetPassword:   'reset-password.html',
  adminDashboard:  '../admin/dashboard.html',
  userHome:        '../user/home.html',
};

// ── App Constants ────────────────────────────────────────────
const APP_NAME    = 'NavBus';
const APP_VERSION = '1.0.0';

/* ── Supabase Setup Notes ────────────────────────────────────
   1. Go to your Supabase Dashboard → Authentication → Providers → Email
   2. Enable "Confirm email" = ON
   3. Go to Authentication → Email Templates
   4. In "Confirm signup" template, change the link to:
      Use {{ .Token }} so users get a 6-digit OTP instead of a link
      (Dashboard → Auth → URL Configuration → enable OTP)
   5. Run supabase/schema.sql to create the profiles table
   ──────────────────────────────────────────────────────────── */

/* ── EmailJS Configuration ───────────────────────────────────
   Used for OTP email delivery (signup verification + password reset).
   Replace the values below with your EmailJS credentials.

   Setup steps:
   1. https://www.emailjs.com → Create free account
   2. Email Services → Add Service (Gmail / Outlook / SMTP)
   3. Email Templates → create TWO templates:

   ── Template 1: Signup Verification ─────────────────────────
   Subject : Your NavBus Verification Code
   Body    :
     Hi {{to_name}},
     Your NavBus verification code is:

     {{otp_code}}

     This code expires in {{expires_min}} minutes.
     If you did not create an account, ignore this email.

     — {{app_name}} Team

   ── Template 2: Password Reset ───────────────────────────────
   Subject : NavBus Password Reset Code
   Body    :
     Your NavBus password reset code is:

     {{otp_code}}

     This code expires in {{expires_min}} minutes.
     If you did not request this, ignore this email.

     — {{app_name}} Team

   4. Account → API Keys → copy Public Key
   5. Paste your values in modules/auth/js/auth.emailjs.js

   ── Supabase: disable built-in email confirmation ────────────
   Dashboard → Authentication → Providers → Email
   → Turn OFF "Confirm email"
   This lets Supabase create accounts without sending its own
   email — NavBus handles OTP via EmailJS instead.
   ──────────────────────────────────────────────────────────── */

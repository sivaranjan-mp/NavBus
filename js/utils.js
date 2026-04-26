/* ============================================================
   NavBus — Global Utility Functions
   ============================================================ */

// ── Production Console Suppression ──────────────────────────
// Disable console output on deployed site to prevent info leakage
(function _suppressConsoleInProd() {
  const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
  if (!isLocal) {
    ['log', 'debug', 'info', 'warn', 'table', 'dir'].forEach(m => {
      console[m] = () => {};
    });
  }
})();

// ── Session Inactivity Timeout ────────────────────────────────
// Signs the user out automatically after inactivity
(function initSessionTimeout(inactiveMinutes = 60) {
  let _timer;
  const _reset = () => {
    clearTimeout(_timer);
    _timer = setTimeout(async () => {
      await NAVBUS_DB.auth.signOut();
      const path = window.location.pathname;
      if (path.includes('/admin/'))       window.location.replace('../../modules/auth/login.html');
      else if (path.includes('/user/'))   window.location.replace('../modules/auth/login.html');
      else if (path.includes('/modules/auth/')) return; // already on login
      else                                window.location.replace('modules/auth/login.html');
    }, inactiveMinutes * 60 * 1000);
  };
  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(e =>
    document.addEventListener(e, _reset, { passive: true })
  );
  _reset();
})();

// ── Toast Notification System ────────────────────────────────
const Toast = (() => {
  let container = null;

  function _getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.id = 'navbus-toast-container';
      container.style.cssText = `
        position: fixed; top: 24px; right: 24px; z-index: 9999;
        display: flex; flex-direction: column; gap: 10px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }
    return container;
  }

  function _show(message, type = 'info', duration = 4000) {
    const c = _getContainer();
    const colors = {
      success: { bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.35)',  text: '#4ade80',  icon: '✓' },
      error:   { bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.35)', text: '#f87171',  icon: '✕' },
      warning: { bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.35)',  text: '#fbbf24',  icon: '⚠' },
      info:    { bg: 'rgba(201,168,76,0.1)',   border: 'rgba(201,168,76,0.3)',   text: '#c9a84c',  icon: '●' },
    };
    const s = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.style.cssText = `
      display: flex; align-items: center; gap: 10px;
      padding: 12px 16px; border-radius: 10px; max-width: 360px;
      background: #0e0d09; border: 1px solid ${s.border};
      pointer-events: all; cursor: default;
      font-family: 'Barlow', sans-serif; font-size: 13px;
      color: #f0ebe0; line-height: 1.4;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      animation: toastSlideIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards;
      transform: translateX(120%); opacity: 0;
    `;
    toast.innerHTML = `
      <span style="color:${s.text};font-size:15px;flex-shrink:0;">${s.icon}</span>
      <span style="flex:1;">${message}</span>
      <span style="color:#6e6354;cursor:pointer;padding:2px 4px;flex-shrink:0;"
        onclick="this.parentElement.remove()">✕</span>
    `;

    if (!document.querySelector('#navbus-toast-style')) {
      const style = document.createElement('style');
      style.id = 'navbus-toast-style';
      style.textContent = `
        @keyframes toastSlideIn {
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes toastSlideOut {
          to { transform: translateX(120%); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    c.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastSlideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return {
    success: (msg, dur) => _show(msg, 'success', dur),
    error:   (msg, dur) => _show(msg, 'error',   dur),
    warning: (msg, dur) => _show(msg, 'warning',  dur),
    info:    (msg, dur) => _show(msg, 'info',     dur),
  };
})();

// ── Button Loading State ──────────────────────────────────────
function setButtonLoading(btn, loading, originalText = null) {
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `
      <span class="btn-spinner"></span>
      <span>${btn.dataset.loadingText || 'Please wait...'}</span>
    `;
    btn.style.opacity = '0.8';
  } else {
    btn.disabled = false;
    btn.innerHTML = originalText || btn.dataset.originalText || btn.innerHTML;
    btn.style.opacity = '1';
  }
}

// ── Form Error Display ────────────────────────────────────────
function showFieldError(fieldId, message) {
  const field   = document.getElementById(fieldId);
  const wrapper = field?.closest('.form-group');
  if (!wrapper) return;
  clearFieldError(fieldId);
  field.classList.add('input-error');
  const err = document.createElement('span');
  err.className = 'form-error-msg';
  err.textContent = message;
  wrapper.appendChild(err);
}

function clearFieldError(fieldId) {
  const field   = document.getElementById(fieldId);
  const wrapper = field?.closest('.form-group');
  if (!wrapper) return;
  field?.classList.remove('input-error');
  wrapper.querySelector('.form-error-msg')?.remove();
}

function clearAllErrors(formEl) {
  formEl.querySelectorAll('.form-error-msg').forEach(e => e.remove());
  formEl.querySelectorAll('.input-error').forEach(e => e.classList.remove('input-error'));
}

// ── Password Strength ─────────────────────────────────────────
function getPasswordStrength(password) {
  let score = 0;
  if (password.length >= 8)                    score++;
  if (password.length >= 12)                   score++;
  if (/[A-Z]/.test(password))                 score++;
  if (/[0-9]/.test(password))                 score++;
  if (/[^A-Za-z0-9]/.test(password))          score++;
  return score; // 0-5
}

function updatePasswordStrengthBar(password, barEl, labelEl) {
  const score = getPasswordStrength(password);
  const levels = [
    { label: '',        color: 'transparent',            pct: 0   },
    { label: 'Weak',    color: '#f87171',                pct: 20  },
    { label: 'Fair',    color: '#fbbf24',                pct: 40  },
    { label: 'Good',    color: '#c9a84c',                pct: 60  },
    { label: 'Strong',  color: '#4ade80',                pct: 80  },
    { label: 'Very Strong', color: '#4ade80',            pct: 100 },
  ];
  const l = levels[score] || levels[0];
  if (barEl) {
    barEl.style.width = l.pct + '%';
    barEl.style.background = l.color;
  }
  if (labelEl) {
    labelEl.textContent = l.label;
    labelEl.style.color = l.color;
  }
}

// ── Validators ───────────────────────────────────────────────
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  // Min 10 chars, at least one uppercase, one number
  if (password.length < 10)         return false;
  if (!/[A-Z]/.test(password))      return false;
  if (!/[0-9]/.test(password))      return false;
  return true;
}

// Password strength message for validation errors
function getPasswordRequirementHint() {
  return 'Password must be at least 10 characters with one uppercase letter and one number.';
}

// ── Helpers ──────────────────────────────────────────────────
function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

function getURLParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Input Sanitization ────────────────────────────────────────
// Strip HTML tags from user-supplied strings before rendering
function sanitizeInput(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Alias used in template literals
const escHtml = sanitizeInput;

/* ============================================================
   NavBus — Theme Manager
   Reads saved theme from localStorage and applies it to <html>
   BEFORE the page renders — zero flash.
   Include this as the FIRST script in <head> on all user pages.
   ============================================================ */

(function () {
  const STORAGE_KEY = 'navbus_theme';
  const saved = localStorage.getItem(STORAGE_KEY);
  // Default is dark; only override if user explicitly chose light
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

/* ── Public API ─────────────────────────────────────────────── */
const NavBusTheme = (() => {
  const STORAGE_KEY = 'navbus_theme';

  function get() {
    return localStorage.getItem(STORAGE_KEY) || 'dark';
  }

  function set(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    // Dispatch so any listening components can react
    window.dispatchEvent(new CustomEvent('navbus:theme_change', { detail: { theme } }));
  }

  function toggle() {
    set(get() === 'dark' ? 'light' : 'dark');
  }

  function isDark() { return get() === 'dark'; }

  return { get, set, toggle, isDark };
})();

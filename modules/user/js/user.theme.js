/* ============================================================
   NavBus — Theme Manager
   Handles Dark / Light mode toggle.
   Reads from localStorage and applies immediately (no flash).
   ============================================================ */

const NavBusTheme = (() => {

  const STORAGE_KEY = 'navbus_theme';
  const DARK  = 'dark';
  const LIGHT = 'light';

  // ── Apply theme to <html> ─────────────────────────────────
  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    // Sync any toggle switches on the page
    document.querySelectorAll('.theme-toggle-input').forEach(input => {
      input.checked = (theme === LIGHT);
    });
    // Dispatch event so all icons/labels on the page update
    window.dispatchEvent(new CustomEvent('navbus:theme_change', { detail: { theme } }));
  }

  // ── Read saved preference (default: dark) ────────────────
  function getSaved() {
    return localStorage.getItem(STORAGE_KEY) || DARK;
  }

  // ── Toggle between dark and light ────────────────────────
  function toggle() {
    const current = getSaved();
    apply(current === DARK ? LIGHT : DARK);
  }

  // ── Init (call ASAP — before paint) ──────────────────────
  function init() {
    apply(getSaved());
  }

  // ── Is light mode active? ─────────────────────────────────
  function isLight() { return getSaved() === LIGHT; }

  return { init, apply, toggle, getSaved, isLight, DARK, LIGHT };
})();

// Apply immediately to prevent flash
NavBusTheme.init();

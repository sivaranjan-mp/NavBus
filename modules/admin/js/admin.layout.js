/* ============================================================
   NavBus — Admin Layout JS
   Sidebar toggle, live clock, active links
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ── Sidebar mobile toggle ──────────────────────────────────
  const sidebar  = document.getElementById('adminSidebar');
  const overlay  = document.getElementById('sidebarOverlay');
  const menuBtn  = document.getElementById('headerMenuBtn');

  function openSidebar() {
    sidebar?.classList.add('open');
    overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('open');
    document.body.style.overflow = '';
  }

  menuBtn?.addEventListener('click', openSidebar);
  overlay?.addEventListener('click', closeSidebar);

  // Close on nav link click (mobile)
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth < 900) closeSidebar();
    });
  });

  // ── Active sidebar link ────────────────────────────────────
  const currentPath = window.location.pathname;
  document.querySelectorAll('.sidebar-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href && currentPath.includes(href.replace('../', '').replace('.html', ''))) {
      link.classList.add('active');
    }
  });

  // ── Live clock in header ───────────────────────────────────
  const clockEl = document.getElementById('headerClock');
  if (clockEl) {
    function tick() {
      const now = new Date();
      const h   = String(now.getHours()).padStart(2, '0');
      const m   = String(now.getMinutes()).padStart(2, '0');
      const s   = String(now.getSeconds()).padStart(2, '0');
      clockEl.textContent = `${h}:${m}:${s}`;
    }
    tick();
    setInterval(tick, 1000);
  }

  // ── Logout button ─────────────────────────────────────────
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await NAVBUS_DB.auth.signOut();
    window.location.replace('../../modules/auth/login.html');
  });

  // ── Keyboard: Escape closes sidebar ───────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });
});
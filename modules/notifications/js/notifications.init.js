/* ============================================================
   NavBus — Notification System Initializer
   Single entry point. Call NavBusNotifications.init()
   on any page that needs notifications.
   Works for BOTH admin and user pages.
   ============================================================ */

const NavBusNotifications = (() => {

  let _initialized = false;

  // ── Initialize the full system ────────────────────────────────
  async function init(options = {}) {
    if (_initialized) return;

    // Verify session (notifications only for authenticated users)
    const { data: { session } } = await NAVBUS_DB.auth.getSession();
    if (!session) {
      console.log('[NavBusNotifications] No session — notifications disabled');
      return;
    }

    _initialized = true;

    // Start engine (subscribes to Supabase Realtime)
    await NotificationEngine.start({
      watchDeviceIds: options.watchDeviceIds || [],  // empty = watch all buses
    });

    // Subscribe store to auto-update bell badges on any page
    NotificationStore.subscribe(() => {
      const count  = NotificationStore.getUnreadCount();
      const badges = document.querySelectorAll('.nb-bell-badge');
      badges.forEach(badge => {
        badge.textContent  = count > 99 ? '99+' : count;
        badge.style.display = count > 0 ? 'flex' : 'none';
      });
    });

    // Wire any existing bell buttons already in the DOM
    document.querySelectorAll('[data-nb-bell]').forEach(btn => {
      btn.addEventListener('click', () => NotificationHistory.toggle());
    });

    console.log('[NavBusNotifications] ✓ Initialized');
  }

  // ── Inject bell button into a container ───────────────────────
  function injectBell(containerId, position = 'append') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = NotificationHistory.buildBellButton({ id: 'nbBellBtn_' + containerId });

    if (position === 'prepend') container.prepend(wrapper.firstChild);
    else container.appendChild(wrapper.firstChild);
  }

  // ── Manually fire notifications (for testing + demo) ──────────

  // Test: fire an "arriving" notification for the first bus
  async function testArriving() {
    const { data } = await NAVBUS_DB.from('buses').select('id').eq('is_active', true).limit(1).single();
    if (data) NotificationEngine.triggerArriving(data.id, { eta_minutes: 2, stop_name: 'Gandhi Square' });
    else _testFallback('arriving');
  }

  // Test: fire a "delayed" notification
  async function testDelayed() {
    const { data } = await NAVBUS_DB.from('buses').select('id').eq('is_active', true).limit(1).single();
    if (data) NotificationEngine.triggerDelayed(data.id, 15);
    else _testFallback('delayed');
  }

  // Test: fire a "missed bus" notification
  async function testMissed() {
    const { data } = await NAVBUS_DB.from('buses').select('id').eq('is_active', true).limit(1).single();
    if (data) NotificationEngine.triggerMissed(data.id, 3);
    else _testFallback('missed');
  }

  // Fallback demo notification when no buses exist
  function _testFallback(type) {
    const demos = {
      arriving: {
        type: 'arriving', plate: 'TN01AB1234',
        route: '12A', routeName: 'Central → Airport',
        title: 'Bus TN01AB1234 arriving soon',
        message: 'Route 12A · Central → Airport',
        meta: { eta_minutes: 2, stop_name: 'Gandhi Square', stops_away: 2 },
      },
      delayed: {
        type: 'delayed', plate: 'TN02CD5678',
        route: '7B', routeName: 'Marina → Tambaram',
        title: 'Bus TN02CD5678 running late',
        message: 'Route 7B · Delayed ~15 minutes',
        meta: { delay_minutes: 15, original_time: '04:30 PM', new_time: '04:45 PM' },
      },
      missed: {
        type: 'missed', plate: 'TN03EF9012',
        route: '3C', routeName: 'Koyambedu → T. Nagar',
        title: 'You missed Bus TN03EF9012',
        message: 'Route 3C · Left 2 minutes ago',
        meta: { left_minutes_ago: 2, next_bus_minutes: 18 },
      },
    };

    const data = demos[type];
    if (!data) return;

    const notification = NotificationStore.add(data);
    NotificationToast.show(notification);
  }

  // ── Public API ────────────────────────────────────────────────
  function isInitialized() { return _initialized; }

  return {
    init,
    injectBell,
    testArriving,
    testDelayed,
    testMissed,
    isInitialized,
  };
})();
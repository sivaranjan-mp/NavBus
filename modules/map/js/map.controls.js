/* ============================================================
   NavBus — Map UI Controls
   Wires up custom zoom, tile layer, fit-all, and follow buttons
   ============================================================ */

const MapControls = (() => {

  function init() {
    // Zoom in / out
    document.getElementById('ctrlZoomIn')?.addEventListener('click', () => MapInit.zoomIn());
    document.getElementById('ctrlZoomOut')?.addEventListener('click', () => MapInit.zoomOut());

    // Fit all markers
    document.getElementById('ctrlFitAll')?.addEventListener('click', () => {
      TrackingMarker.fitAll();
    });

    // Follow selected bus toggle
    const followBtn = document.getElementById('ctrlFollow');
    let following   = false;

    followBtn?.addEventListener('click', () => {
      following = !following;
      followBtn.classList.toggle('active', following);
      followBtn.setAttribute('data-tooltip', following ? 'Stop Follow' : 'Follow Bus');

      if (following) {
        // Start interval to pan to selected bus
        window._followInterval = setInterval(() => {
          const selId = window.NAVBUS_SELECTED_BUS;
          if (selId) {
            const bus = BusState.getByDeviceId(selId);
            if (bus?.latitude) {
              MapInit.getInstance()?.panTo([bus.latitude, bus.longitude], { animate: true, duration: 0.5 });
            }
          }
        }, 3000);
      } else {
        clearInterval(window._followInterval);
      }
    });

    // When bus selection changes, reset follow
    window.addEventListener('navbus:bus_selected', () => {
      if (following) {
        clearInterval(window._followInterval);
        following = false;
        followBtn?.classList.remove('active');
      }
    });

    // Tile buttons
    document.querySelectorAll('.tile-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        MapInit.setTile(btn.dataset.tile);
      });
    });

    // Panel toggle (mobile)
    document.getElementById('ctrlTogglePanel')?.addEventListener('click', () => {
      const panel   = document.getElementById('trackingPanel');
      const overlay = document.getElementById('panelOverlay');
      panel?.classList.toggle('open');
      overlay?.classList.toggle('open');
    });

    document.getElementById('panelOverlay')?.addEventListener('click', () => {
      document.getElementById('trackingPanel')?.classList.remove('open');
      document.getElementById('panelOverlay')?.classList.remove('open');
    });
  }

  return { init };
})();

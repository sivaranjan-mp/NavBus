/* ============================================================
   NavBus — Map Marker Manager
   Creates, updates, and removes Leaflet markers per bus.
   Uses custom SVG icons. Depends on Leaflet being loaded.
   ============================================================ */

const TrackingMarker = (() => {

  // Map<device_id, L.Marker>
  const _markers = new Map();

  // Map<device_id, L.Popup>
  const _popups  = new Map();

  let _map = null;

  // ── Init with Leaflet map instance ───────────────────────────
  function init(mapInstance) {
    _map = mapInstance;
  }

  // ── Build custom bus icon ─────────────────────────────────────
  function _buildIcon(bus) {
    const status  = bus.status || 'offline';
    const speed   = bus.speed_kmh || 0;
    const heading = bus.heading_deg || 0;
    const isMoving = speed > 2;

    const colors = {
      online:      { ring: '#4ade80', glow: 'rgba(74,222,128,0.4)',  body: 'rgba(74,222,128,0.15)'  },
      offline:     { ring: '#475569', glow: 'transparent',           body: 'rgba(71,85,105,0.15)'  },
      maintenance: { ring: '#fbbf24', glow: 'rgba(251,191,36,0.3)',  body: 'rgba(251,191,36,0.12)' },
      alert:       { ring: '#f87171', glow: 'rgba(248,113,113,0.4)', body: 'rgba(248,113,113,0.12)' },
      warning:     { ring: '#fbbf24', glow: 'rgba(251,191,36,0.3)',  body: 'rgba(251,191,36,0.12)' },
    };

    const c = colors[status] || colors.offline;

    // Arrow direction for moving buses
    const arrowSvg = isMoving ? `
      <div style="
        position:absolute;top:-8px;left:50%;transform:translateX(-50%) rotate(${heading}deg);
        width:0;height:0;border-left:5px solid transparent;
        border-right:5px solid transparent;border-bottom:10px solid ${c.ring};
        filter:drop-shadow(0 0 3px ${c.ring});
      "></div>` : '';

    const pulseStyle = (status === 'online')
      ? `animation: markerPulse 2s ease-in-out infinite;` : '';

    const html = `
      <style>
        @keyframes markerPulse {
          0%,100% { box-shadow: 0 0 0 0 ${c.glow}; }
          50%      { box-shadow: 0 0 0 8px transparent; }
        }
      </style>
      <div style="position:relative;display:flex;align-items:center;justify-content:center;">
        ${arrowSvg}
        <div style="
          width:38px;height:38px;border-radius:50%;
          background:${c.body};
          border:2px solid ${c.ring};
          display:flex;align-items:center;justify-content:center;
          font-size:16px;
          box-shadow:0 0 14px ${c.glow}, 0 4px 12px rgba(0,0,0,0.5);
          ${pulseStyle}
          transition: all 0.4s ease;
          position: relative;
          z-index: 1;
        ">🚌</div>
        <div style="
          position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);
          background:rgba(8,8,6,0.88);border:1px solid ${c.ring};
          border-radius:4px;padding:1px 6px;
          font-family:'JetBrains Mono',monospace;font-size:9px;
          color:${c.ring};white-space:nowrap;letter-spacing:0.08em;
        ">${bus.number_plate || bus.device_id}</div>
      </div>`;

    return L.divIcon({
      className: '',
      html,
      iconSize:   [38, 58],
      iconAnchor: [19, 19],
      popupAnchor:[0, -24],
    });
  }

  // ── Build popup HTML ─────────────────────────────────────────
  function _buildPopupHTML(bus) {
    const speed = TrackingStatus.formatSpeed(bus.speed_kmh);
    const seen  = TrackingStatus.formatLastSeen(bus._lastPing);
    const coord = TrackingStatus.formatCoords(bus.latitude, bus.longitude);
    const statusColor = TrackingStatus.getStatusColor(bus.status);

    return `
      <div style="padding:14px 16px;min-width:220px;font-family:'Barlow',sans-serif;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <span style="font-family:'JetBrains Mono',monospace;font-size:0.9rem;font-weight:500;color:#f0ebe0;letter-spacing:0.1em;">
            ${bus.number_plate || '—'}
          </span>
          <span style="display:flex;align-items:center;gap:4px;font-size:0.65rem;font-family:'Barlow Condensed',sans-serif;
            letter-spacing:0.14em;text-transform:uppercase;color:${statusColor};font-weight:700;">
            <span style="width:5px;height:5px;border-radius:50%;background:${statusColor};display:inline-block;"></span>
            ${bus.status || 'offline'}
          </span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
          <div>
            <div style="font-size:0.55rem;letter-spacing:0.2em;color:rgba(201,168,76,0.5);text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;margin-bottom:2px;">Speed</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:0.82rem;color:#e2c97e;">${speed}</div>
          </div>
          <div>
            <div style="font-size:0.55rem;letter-spacing:0.2em;color:rgba(201,168,76,0.5);text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;margin-bottom:2px;">Last Ping</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:0.82rem;color:#b5a98a;">${seen}</div>
          </div>
          <div>
            <div style="font-size:0.55rem;letter-spacing:0.2em;color:rgba(201,168,76,0.5);text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;margin-bottom:2px;">Route</div>
            <div style="font-size:0.78rem;color:#b5a98a;">${bus.routes?.route_number || bus.route_number || '—'}</div>
          </div>
          <div>
            <div style="font-size:0.55rem;letter-spacing:0.2em;color:rgba(201,168,76,0.5);text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;margin-bottom:2px;">Heading</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:0.82rem;color:#b5a98a;">
              ${TrackingStatus.headingToCardinal(bus.heading_deg)} (${Math.round(bus.heading_deg || 0)}°)
            </div>
          </div>
        </div>
        <div style="font-size:0.65rem;font-family:'JetBrains Mono',monospace;color:#6e6354;border-top:1px solid rgba(201,168,76,0.1);padding-top:8px;">
          ${coord}
        </div>
      </div>`;
  }

  // ── Add or update a marker ─────────────────────────────────────
  function upsertMarker(bus) {
    if (!_map) return;
    if (bus.latitude == null || bus.longitude == null) return;

    const latlng = [bus.latitude, bus.longitude];
    const icon   = _buildIcon(bus);

    if (_markers.has(bus.device_id)) {
      // Update existing
      const marker = _markers.get(bus.device_id);
      marker.setLatLng(latlng);
      marker.setIcon(icon);

      // Update popup content
      const popup = _popups.get(bus.device_id);
      if (popup) popup.setContent(_buildPopupHTML(bus));

    } else {
      // Create new
      const popup = L.popup({ className: 'navbus-popup', offset: [0, -10] })
        .setContent(_buildPopupHTML(bus));

      const marker = L.marker(latlng, { icon })
        .bindPopup(popup)
        .addTo(_map);

      // Click → emit event for bus selection
      marker.on('click', () => {
        window.dispatchEvent(new CustomEvent('navbus:marker_click', {
          detail: { device_id: bus.device_id }
        }));
      });

      _markers.set(bus.device_id, marker);
      _popups.set(bus.device_id, popup);
    }
  }

  // ── Remove a marker (offline bus) ────────────────────────────
  function removeMarker(device_id) {
    if (!_map) return;
    const marker = _markers.get(device_id);
    if (marker) {
      marker.remove();
      _markers.delete(device_id);
      _popups.delete(device_id);
    }
  }

  // ── Fly map to a bus ─────────────────────────────────────────
  function flyTo(device_id, zoom = 15) {
    const marker = _markers.get(device_id);
    if (!marker || !_map) return;
    _map.flyTo(marker.getLatLng(), zoom, { duration: 1.2, easeLinearity: 0.3 });
  }

  // ── Open popup for a bus ─────────────────────────────────────
  function openPopup(device_id) {
    const marker = _markers.get(device_id);
    if (marker) marker.openPopup();
  }

  // ── Fit map to all visible markers ───────────────────────────
  function fitAll() {
    if (!_map || _markers.size === 0) return;
    const group = L.featureGroup(Array.from(_markers.values()));
    _map.fitBounds(group.getBounds().pad(0.1));
  }

  // ── Count active markers ─────────────────────────────────────
  function count() { return _markers.size; }

  return { init, upsertMarker, removeMarker, flyTo, openPopup, fitAll, count };
})();

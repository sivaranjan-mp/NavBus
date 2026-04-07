/* ============================================================
   NavBus — Map Marker Manager
   Creates, updates, and removes Leaflet markers per bus.
   - Uses rotated SVG bus icons when leaflet-rotatedmarker is loaded (admin)
   - Falls back to CSS-arrow divIcon otherwise (user/track pages)
   Depends on Leaflet being loaded.
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

  // ── Detect if leaflet-rotatedmarker plugin is available ──────
  const _hasRotation = () => typeof L !== 'undefined' && typeof L.Marker.prototype.setRotationAngle === 'function';

  // ── Status colour map ─────────────────────────────────────────
  const STATUS_COLORS = {
    online:      { ring: '#4ade80', glow: 'rgba(74,222,128,0.45)',  body: 'rgba(74,222,128,0.15)'  },
    offline:     { ring: '#475569', glow: 'transparent',            body: 'rgba(71,85,105,0.15)'   },
    maintenance: { ring: '#fbbf24', glow: 'rgba(251,191,36,0.3)',   body: 'rgba(251,191,36,0.12)'  },
    alert:       { ring: '#f87171', glow: 'rgba(248,113,113,0.45)', body: 'rgba(248,113,113,0.12)' },
    warning:     { ring: '#fbbf24', glow: 'rgba(251,191,36,0.3)',   body: 'rgba(251,191,36,0.12)'  },
  };

  // ── Build advanced SVG bus icon (used with rotatedmarker) ─────
  // The SVG nose points UP (north); rotationAngle rotates it to heading.
  function _buildSvgIcon(bus) {
    const c = STATUS_COLORS[bus.status] || STATUS_COLORS.offline;

    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="52" viewBox="0 0 36 52">
      <defs>
        <filter id="gf-${bus.device_id || 'x'}" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <!-- direction nose arrow at top -->
      <polygon points="18,1 24,13 18,10 12,13"
        fill="${c.ring}" opacity="0.95" filter="url(#gf-${bus.device_id || 'x'})"/>
      <!-- bus body -->
      <rect x="5" y="11" width="26" height="36" rx="5"
        fill="rgba(8,8,6,0.93)" stroke="${c.ring}" stroke-width="1.8"/>
      <!-- windshield -->
      <rect x="9" y="14" width="18" height="8" rx="2" fill="${c.ring}" opacity="0.22"/>
      <!-- window row 1 -->
      <rect x="8"  y="26" width="7" height="6" rx="1.5" fill="${c.ring}" opacity="0.32"/>
      <rect x="18" y="26" width="7" height="6" rx="1.5" fill="${c.ring}" opacity="0.32"/>
      <!-- window row 2 -->
      <rect x="8"  y="35" width="7" height="6" rx="1.5" fill="${c.ring}" opacity="0.22"/>
      <rect x="18" y="35" width="7" height="6" rx="1.5" fill="${c.ring}" opacity="0.22"/>
      <!-- wheels -->
      <rect x="2"  y="19" width="4" height="9" rx="2" fill="${c.ring}" opacity="0.55"/>
      <rect x="30" y="19" width="4" height="9" rx="2" fill="${c.ring}" opacity="0.55"/>
      <rect x="2"  y="34" width="4" height="9" rx="2" fill="${c.ring}" opacity="0.55"/>
      <rect x="30" y="34" width="4" height="9" rx="2" fill="${c.ring}" opacity="0.55"/>
      <!-- status glow ring (online only) -->
      ${bus.status === 'online'
        ? `<ellipse cx="18" cy="29" rx="14" ry="20" fill="none" stroke="${c.ring}" stroke-width="0.8" opacity="0.18"/>`
        : ''}
    </svg>`;

    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);

    return L.icon({
      iconUrl:    url,
      iconSize:   [36, 52],
      iconAnchor: [18, 26],
      popupAnchor:[0, -30],
    });
  }

  // ── Build CSS-animated divIcon (fallback, no plugin needed) ───
  function _buildDivIcon(bus) {
    const status   = bus.status || 'offline';
    const speed    = bus.speed_kmh || 0;
    const heading  = bus.heading_deg || 0;
    const isMoving = speed > 2;
    const c = STATUS_COLORS[status] || STATUS_COLORS.offline;

    const arrowSvg = isMoving ? `
      <div style="
        position:absolute;top:-8px;left:50%;transform:translateX(-50%) rotate(${heading}deg);
        width:0;height:0;border-left:5px solid transparent;
        border-right:5px solid transparent;border-bottom:10px solid ${c.ring};
        filter:drop-shadow(0 0 3px ${c.ring});
      "></div>` : '';

    const pulseStyle = status === 'online'
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
          position: relative; z-index: 1;
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
      className:  '',
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

    const latlng  = [bus.latitude, bus.longitude];
    const heading = bus.heading_deg || 0;
    const useRotated = _hasRotation();

    if (_markers.has(bus.device_id)) {
      // ── Update existing ──
      const marker = _markers.get(bus.device_id);
      marker.setLatLng(latlng);

      if (useRotated) {
        marker.setIcon(_buildSvgIcon(bus));
        marker.setRotationAngle(heading);
      } else {
        marker.setIcon(_buildDivIcon(bus));
      }

      // Update popup content
      const popup = _popups.get(bus.device_id);
      if (popup) popup.setContent(_buildPopupHTML(bus));

    } else {
      // ── Create new ──
      const popup = L.popup({ className: 'navbus-popup', offset: [0, -10] })
        .setContent(_buildPopupHTML(bus));

      let marker;
      if (useRotated) {
        marker = L.marker(latlng, {
          icon:              _buildSvgIcon(bus),
          rotationAngle:     heading,
          rotationOrigin:    'center center',
        });
      } else {
        marker = L.marker(latlng, { icon: _buildDivIcon(bus) });
      }

      marker.bindPopup(popup).addTo(_map);

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

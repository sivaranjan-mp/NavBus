/* ============================================================
   NavBus — Google Maps Marker Manager
   Custom SVG markers with smooth animated movement.
   Handles create, update (with interpolation), remove.
   ============================================================ */

const NavBusMarkers = (() => {

  // Map<device_id, { marker, infoWindow, prevPos, animFrame }>
  const _markers = new Map();

  let _map             = null;
  let _selectedId      = null;
  let _onSelectCallback = null;

  // ── Init ─────────────────────────────────────────────────────
  function init(mapInstance, onSelect) {
    _map             = mapInstance;
    _onSelectCallback = onSelect || null;
  }

  // ── Build custom SVG marker icon ─────────────────────────────
  function _buildIcon(bus, selected = false) {
    const isOnline = bus.status === 'online' || bus.is_live;
    const heading  = bus.heading_deg || 0;
    const speed    = Math.round(bus.speed_kmh || 0);
    const isMoving = speed > 2;

    // Colors
    const ringColor  = isOnline ? '#4ade80' : '#475569';
    const glowColor  = isOnline ? 'rgba(74,222,128,0.4)' : 'transparent';
    const bodyBg     = selected ? '#c9a84c' : (isOnline ? 'rgba(10,15,10,0.95)' : 'rgba(10,10,12,0.85)');
    const borderW    = selected ? 2.5 : 2;
    const scale      = selected ? 1.2 : 1;

    // Direction arrow (only when moving)
    const arrowSvg = isMoving ? `
      <div style="
        position:absolute;
        top:-11px;left:50%;
        transform:translateX(-50%) rotate(${heading}deg);
        width:0;height:0;
        border-left:5px solid transparent;
        border-right:5px solid transparent;
        border-bottom:11px solid ${ringColor};
        filter:drop-shadow(0 0 3px ${ringColor});
      "></div>` : '';

    // Pulse ring (online only)
    const pulseStyle = isOnline
      ? `animation:navbusPulse 2s ease-in-out infinite;`
      : '';

    const glowStyle  = `box-shadow:0 0 18px ${glowColor},0 6px 20px rgba(0,0,0,0.7);`;
    const scaleStyle = `transform:scale(${scale});`;

    const plate = (bus.number_plate || bus.device_id || '').slice(0, 8);

    const html = `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;${scaleStyle}">
        <style>
          @keyframes navbusPulse {
            0%,100% { box-shadow: 0 0 0 0 ${glowColor}, 0 6px 20px rgba(0,0,0,0.7); }
            60%      { box-shadow: 0 0 0 10px transparent, 0 6px 20px rgba(0,0,0,0.7); }
          }
        </style>
        ${arrowSvg}
        <div style="
          width:42px;height:42px;border-radius:50%;
          background:${bodyBg};
          border:${borderW}px solid ${ringColor};
          display:flex;align-items:center;justify-content:center;
          font-size:18px;
          ${glowStyle}
          ${pulseStyle}
          position:relative;z-index:1;
          transition:all 0.3s ease;
          cursor:pointer;
        ">🚌</div>
        <div style="
          position:absolute;bottom:-20px;left:50%;
          transform:translateX(-50%);
          background:rgba(8,8,6,0.94);
          border:1px solid ${selected ? '#c9a84c' : ringColor};
          border-radius:5px;padding:2px 7px;
          font-family:'JetBrains Mono',monospace;font-size:9.5px;
          color:${selected ? '#c9a84c' : ringColor};
          white-space:nowrap;letter-spacing:0.06em;
          box-shadow:0 2px 8px rgba(0,0,0,0.5);
        ">${plate}</div>
      </div>`;

    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><foreignObject width="1" height="1"><div xmlns="http://www.w3.org/1999/xhtml"/></foreignObject></svg>`
      ),
      // We'll use AdvancedMarkerElement via HTML — fall back to overlayView
      _html: html,
    };
  }

  // ── Build Google Maps InfoWindow content ──────────────────────
  function _buildInfoContent(bus) {
    const speed  = Math.round(bus.speed_kmh || 0);
    const head   = _headingToCardinal(bus.heading_deg || 0);
    const route  = bus.routes?.route_number
      ? `${bus.routes.route_number} — ${bus.routes.name || ''}`
      : (bus.bus_name || '—');
    const driver = bus.drivers?.name || '—';
    const status = bus.is_live || bus.status === 'online' ? 'Online' : 'Offline';
    const statusColor = bus.is_live || bus.status === 'online' ? '#4ade80' : '#475569';
    const coord  = bus.latitude ? `${bus.latitude.toFixed(5)}, ${bus.longitude.toFixed(5)}` : '—';

    return `
      <div style="
        font-family:'Barlow',sans-serif;
        background:rgba(10,9,6,0.98);
        border:1px solid rgba(201,168,76,0.22);
        border-radius:12px;
        overflow:hidden;
        min-width:240px;
        box-shadow:0 12px 40px rgba(0,0,0,0.7);
      ">
        <div style="height:1.5px;background:linear-gradient(90deg,transparent,#c9a84c 30%,#e2c97e 50%,#c9a84c 70%,transparent);"></div>
        <div style="padding:14px 16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <span style="font-family:'JetBrains Mono',monospace;font-size:0.95rem;font-weight:500;color:#f0ebe0;letter-spacing:0.1em;">
              ${bus.number_plate || '—'}
            </span>
            <span style="display:flex;align-items:center;gap:4px;font-family:'Barlow Condensed',sans-serif;font-size:0.6rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${statusColor};">
              <span style="width:5px;height:5px;border-radius:50%;background:${statusColor};display:inline-block;"></span>
              ${status}
            </span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
            <div>
              <div style="font-family:'Barlow Condensed',sans-serif;font-size:0.52rem;letter-spacing:0.2em;color:rgba(201,168,76,0.45);text-transform:uppercase;margin-bottom:2px;">Speed</div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:0.82rem;color:#e2c97e;">${speed} km/h</div>
            </div>
            <div>
              <div style="font-family:'Barlow Condensed',sans-serif;font-size:0.52rem;letter-spacing:0.2em;color:rgba(201,168,76,0.45);text-transform:uppercase;margin-bottom:2px;">Heading</div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:0.82rem;color:#b5a98a;">${head} (${Math.round(bus.heading_deg||0)}°)</div>
            </div>
            <div style="grid-column:span 2;">
              <div style="font-family:'Barlow Condensed',sans-serif;font-size:0.52rem;letter-spacing:0.2em;color:rgba(201,168,76,0.45);text-transform:uppercase;margin-bottom:2px;">Route</div>
              <div style="font-size:0.78rem;color:#b5a98a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${route}</div>
            </div>
            <div>
              <div style="font-family:'Barlow Condensed',sans-serif;font-size:0.52rem;letter-spacing:0.2em;color:rgba(201,168,76,0.45);text-transform:uppercase;margin-bottom:2px;">Driver</div>
              <div style="font-size:0.75rem;color:#b5a98a;">${driver}</div>
            </div>
          </div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:0.65rem;color:#3d3830;border-top:1px solid rgba(201,168,76,0.08);padding-top:8px;">${coord}</div>
        </div>
      </div>`;
  }

  // ── Create marker using OverlayView (no AdvancedMarker needed) ─
  function _createOverlayMarker(bus) {
    if (!_map || bus.latitude == null) return null;

    const position = new google.maps.LatLng(bus.latitude, bus.longitude);

    // Use a standard Marker with a transparent icon + DOM overlay
    const marker = new google.maps.Marker({
      position,
      map: _map,
      optimized:  false,
      icon: {
        path:          google.maps.SymbolPath.CIRCLE,
        scale:         0,
        fillColor:     'transparent',
        strokeColor:   'transparent',
        strokeWeight:  0,
      },
      zIndex: bus.status === 'online' ? 10 : 5,
    });

    // Build info window
    const infoWindow = new google.maps.InfoWindow({
      content:     _buildInfoContent(bus),
      pixelOffset: new google.maps.Size(0, -50),
      disableAutoPan: false,
    });

    // Create HTML overlay div
    const overlay = new google.maps.OverlayView();
    const div     = document.createElement('div');
    div.style.cssText = 'position:absolute;transform:translate(-50%,-50%);z-index:10;cursor:pointer;';
    div.innerHTML = _buildIcon(bus)._html;

    overlay.onAdd = function() {
      this.getPanes().overlayMouseTarget.appendChild(div);
    };

    overlay.draw = function() {
      const point = this.getProjection().fromLatLngToDivPixel(marker.getPosition());
      if (point) {
        div.style.left = point.x + 'px';
        div.style.top  = point.y + 'px';
      }
    };

    overlay.onRemove = function() {
      if (div.parentElement) div.parentElement.removeChild(div);
    };

    overlay.setMap(_map);

    // Click listener
    div.addEventListener('click', () => {
      _selectBus(bus.device_id, bus, infoWindow, marker, overlay, div);
    });

    return { marker, infoWindow, overlay, div, position };
  }

  // ── Select a bus ──────────────────────────────────────────────
  function _selectBus(deviceId, bus, infoWindow, marker, overlay, div) {
    // Deselect previous
    if (_selectedId && _selectedId !== deviceId) {
      deselectAll();
    }

    _selectedId = deviceId;

    // Highlight div
    div.querySelector('div > div:first-of-type') // bus circle
    const busCircle = div.querySelector('[style*="42px"]');
    if (busCircle) {
      busCircle.style.border = '2.5px solid #c9a84c';
      busCircle.style.boxShadow = '0 0 24px rgba(201,168,76,0.5), 0 6px 20px rgba(0,0,0,0.7)';
    }

    // Close other info windows
    _markers.forEach(m => {
      if (m.infoWindow) m.infoWindow.close();
    });

    // Open this info window
    infoWindow.setContent(_buildInfoContent(bus));
    infoWindow.open(_map, marker);

    // Callback to UI
    if (_onSelectCallback) _onSelectCallback(deviceId, bus);
  }

  // ── Deselect all ─────────────────────────────────────────────
  function deselectAll() {
    _markers.forEach(m => {
      if (m.infoWindow) m.infoWindow.close();
    });
    _selectedId = null;
  }

  // ── Add or update a marker ────────────────────────────────────
  function upsert(bus) {
    if (!_map || bus.latitude == null || bus.longitude == null) return;

    if (_markers.has(bus.device_id)) {
      _updateMarker(bus);
    } else {
      _addMarker(bus);
    }
  }

  // ── Add new marker ────────────────────────────────────────────
  function _addMarker(bus) {
    const m = _createOverlayMarker(bus);
    if (!m) return;

    _markers.set(bus.device_id, {
      ...m,
      prevLat: bus.latitude,
      prevLng: bus.longitude,
      animFrame: null,
      bus: { ...bus },
    });
  }

  // ── Update existing marker with smooth animation ───────────────
  function _updateMarker(bus) {
    const entry = _markers.get(bus.device_id);
    if (!entry) return;

    const newLat = bus.latitude;
    const newLng = bus.longitude;
    const oldLat = entry.prevLat;
    const oldLng = entry.prevLng;

    // Cancel any running animation
    if (entry.animFrame) cancelAnimationFrame(entry.animFrame);

    const DURATION   = 2500; // ms — smooth 2.5s interpolation
    const startTime  = performance.now();

    function animate(now) {
      const elapsed = now - startTime;
      const t       = Math.min(elapsed / DURATION, 1);
      // Ease out cubic
      const ease    = 1 - Math.pow(1 - t, 3);

      const lat = oldLat + (newLat - oldLat) * ease;
      const lng = oldLng + (newLng - oldLng) * ease;

      const latlng = new google.maps.LatLng(lat, lng);
      entry.marker.setPosition(latlng);
      entry.overlay.draw();

      if (t < 1) {
        entry.animFrame = requestAnimationFrame(animate);
      } else {
        entry.prevLat = newLat;
        entry.prevLng = newLng;
        entry.animFrame = null;
      }
    }

    entry.animFrame = requestAnimationFrame(animate);

    // Update icon if status changed
    const statusChanged = entry.bus.status !== bus.status;
    const selected      = _selectedId === bus.device_id;

    if (statusChanged || selected) {
      entry.div.innerHTML = _buildIcon(bus)._html;
      if (selected) {
        entry.div.querySelector('div > div')?.style.setProperty('border', '2.5px solid #c9a84c');
      }
    }

    // Re-attach click listener
    entry.div.onclick = () => {
      _selectBus(bus.device_id, bus, entry.infoWindow, entry.marker, entry.overlay, entry.div);
    };

    // Update info window if open
    if (selected) {
      entry.infoWindow.setContent(_buildInfoContent(bus));
    }

    entry.bus = { ...bus };
    entry.marker.setZIndex(bus.status === 'online' ? 10 : 5);
  }

  // ── Remove a marker ───────────────────────────────────────────
  function remove(deviceId) {
    const entry = _markers.get(deviceId);
    if (!entry) return;

    if (entry.animFrame)  cancelAnimationFrame(entry.animFrame);
    if (entry.infoWindow) entry.infoWindow.close();
    if (entry.overlay)    entry.overlay.setMap(null);
    if (entry.marker)     entry.marker.setMap(null);

    _markers.delete(deviceId);

    if (_selectedId === deviceId) _selectedId = null;
  }

  // ── Remove all markers ────────────────────────────────────────
  function clear() {
    _markers.forEach((_, id) => remove(id));
  }

  // ── Fly to a specific bus ────────────────────────────────────
  function focusBus(deviceId, zoom = 15) {
    const entry = _markers.get(deviceId);
    if (!entry) return;
    const pos = entry.marker.getPosition();
    NavBusGoogleMap.flyTo(pos.lat(), pos.lng(), zoom);
  }

  // ── Fit map to show all markers ───────────────────────────────
  function fitAll() {
    if (!_map || _markers.size === 0) return;
    const bounds = new google.maps.LatLngBounds();
    _markers.forEach(entry => {
      const pos = entry.marker.getPosition();
      if (pos) bounds.extend(pos);
    });
    _map.fitBounds(bounds, { top: 70, right: 80, bottom: 120, left: 20 });
  }

  // ── Count ─────────────────────────────────────────────────────
  function count()           { return _markers.size; }
  function getSelected()     { return _selectedId; }
  function has(deviceId)     { return _markers.has(deviceId); }

  // ── Helpers ───────────────────────────────────────────────────
  function _headingToCardinal(deg) {
    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
    return dirs[Math.round((deg || 0) / 45) % 8];
  }

  return {
    init,
    upsert,
    remove,
    clear,
    deselectAll,
    focusBus,
    fitAll,
    count,
    getSelected,
    has,
  };
})();
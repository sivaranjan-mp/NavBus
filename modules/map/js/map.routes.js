/* ============================================================
   NavBus — Route Highlight Manager (Google Maps)
   Draws route polylines, stop markers, and route labels.
   Loads route paths from Supabase stops table.
   ============================================================ */

const NavBusRoutes = (() => {

  let _map = null;

  // Active route overlays: Map<routeId, { polyline, stopMarkers, label }>
  const _routes = new Map();

  // Route color palette (cycles through on multiple routes)
  const ROUTE_COLORS = [
    { line: '#c9a84c', label: 'Gold',   glow: 'rgba(201,168,76,0.3)'   },
    { line: '#60a5fa', label: 'Blue',   glow: 'rgba(96,165,250,0.3)'   },
    { line: '#f472b6', label: 'Pink',   glow: 'rgba(244,114,182,0.3)'  },
    { line: '#34d399', label: 'Teal',   glow: 'rgba(52,211,153,0.3)'   },
    { line: '#fb923c', label: 'Orange', glow: 'rgba(251,146,60,0.3)'   },
    { line: '#a78bfa', label: 'Purple', glow: 'rgba(167,139,250,0.3)'  },
  ];

  let _colorIndex = 0;

  // ── Init ─────────────────────────────────────────────────────
  function init(mapInstance) {
    _map = mapInstance;
  }

  // ── Load and draw a route by route_id ────────────────────────
  async function drawRoute(routeId, options = {}) {
    if (!_map || _routes.has(routeId)) return;

    // Fetch stops ordered by sequence
    const { data: stops, error } = await NAVBUS_DB
      .from('stops')
      .select('id, name, latitude, longitude, sequence_order, landmark')
      .eq('route_id', routeId)
      .eq('is_active', true)
      .order('sequence_order', { ascending: true });

    if (error || !stops || stops.length < 2) {
      console.warn('[NavBusRoutes] Not enough stops for route:', routeId, error?.message);
      return;
    }

    // Fetch route meta
    const { data: route } = await NAVBUS_DB
      .from('routes')
      .select('id, route_number, name, origin, destination')
      .eq('id', routeId)
      .single();

    const color = ROUTE_COLORS[_colorIndex % ROUTE_COLORS.length];
    _colorIndex++;

    const path = stops.map(s => ({ lat: s.latitude, lng: s.longitude }));

    // ── Draw polyline ─────────────────────────────────────────
    // Outer glow line
    const glowLine = new google.maps.Polyline({
      path,
      map:           _map,
      strokeColor:   color.glow.replace('0.3', '0.15'),
      strokeOpacity: 1,
      strokeWeight:  10,
      zIndex:        1,
      clickable:     false,
    });

    // Main route line
    const mainLine = new google.maps.Polyline({
      path,
      map:           _map,
      strokeColor:   color.line,
      strokeOpacity: 0.85,
      strokeWeight:  3.5,
      zIndex:        2,
      icons: [{
        icon:   { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3, strokeColor: color.line },
        offset: '0',
        repeat: '20px',
      }],
      clickable: true,
    });

    // Animated dash overlay
    const animLine = new google.maps.Polyline({
      path,
      map:           _map,
      strokeColor:   '#ffffff',
      strokeOpacity: 0.2,
      strokeWeight:  1.5,
      zIndex:        3,
      icons: [{
        icon: {
          path:           'M 0,-1 0,1',
          strokeOpacity:  0.8,
          scale:          3,
          strokeColor:    color.line,
        },
        offset: '0',
        repeat: '25px',
      }],
      clickable: false,
    });

    // Animate the dashed line
    let offset = 0;
    const animInterval = setInterval(() => {
      offset = (offset + 1) % 25;
      const icons = animLine.get('icons');
      icons[0].offset = offset + 'px';
      animLine.set('icons', icons);
    }, 60);

    // Route click info window
    const routeInfoWindow = new google.maps.InfoWindow();
    mainLine.addListener('click', (e) => {
      routeInfoWindow.setContent(`
        <div style="font-family:'Barlow',sans-serif;background:rgba(10,9,6,0.98);border:1px solid rgba(201,168,76,0.22);border-radius:10px;padding:12px 14px;min-width:180px;">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:0.9rem;font-weight:700;color:${color.line};letter-spacing:0.1em;margin-bottom:4px;">
            Route ${route?.route_number || '—'}
          </div>
          <div style="font-size:0.78rem;color:#b5a98a;">${route?.name || '—'}</div>
          <div style="font-size:0.7rem;color:#6e6354;margin-top:6px;">${route?.origin || '—'} → ${route?.destination || '—'}</div>
          <div style="font-size:0.65rem;color:#3d3830;margin-top:4px;font-family:'JetBrains Mono',monospace;">${stops.length} stops</div>
        </div>`);
      routeInfoWindow.setPosition(e.latLng);
      routeInfoWindow.open(_map);
    });

    // ── Draw stop markers ─────────────────────────────────────
    const stopMarkers = stops.map((stop, index) => {
      const isTerminal = index === 0 || index === stops.length - 1;

      const stopIcon = {
        path:         google.maps.SymbolPath.CIRCLE,
        fillColor:    isTerminal ? color.line : 'rgba(8,8,6,0.9)',
        fillOpacity:  1,
        strokeColor:  color.line,
        strokeWeight: isTerminal ? 2 : 1.5,
        scale:        isTerminal ? 7 : 4.5,
      };

      const marker = new google.maps.Marker({
        position:    { lat: stop.latitude, lng: stop.longitude },
        map:         _map,
        icon:        stopIcon,
        title:       stop.name,
        zIndex:      isTerminal ? 8 : 4,
        optimized:   true,
      });

      // Stop info window
      const stopInfo = new google.maps.InfoWindow({
        content: `
          <div style="font-family:'Barlow',sans-serif;background:rgba(10,9,6,0.98);border:1px solid rgba(201,168,76,0.18);border-radius:8px;padding:10px 12px;min-width:150px;">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:0.7rem;font-weight:700;letter-spacing:0.18em;color:rgba(201,168,76,0.5);text-transform:uppercase;margin-bottom:4px;">
              Stop ${stop.sequence_order}${isTerminal ? (index === 0 ? ' · Origin' : ' · Destination') : ''}
            </div>
            <div style="font-size:0.84rem;color:#f0ebe0;font-weight:500;">${stop.name}</div>
            ${stop.landmark ? `<div style="font-size:0.7rem;color:#6e6354;margin-top:3px;">Near ${stop.landmark}</div>` : ''}
            ${stop.code ? `<div style="font-family:'JetBrains Mono',monospace;font-size:0.65rem;color:${color.line};margin-top:4px;">${stop.code}</div>` : ''}
          </div>`,
        pixelOffset: new google.maps.Size(0, -14),
      });

      marker.addListener('click', () => {
        // Close other stop infos
        stopMarkers?.forEach(m => m._info?.close());
        stopInfo.open(_map, marker);
      });

      marker._info = stopInfo;
      return marker;
    });

    // Store everything
    _routes.set(routeId, {
      glowLine,
      mainLine,
      animLine,
      animInterval,
      stopMarkers,
      routeInfoWindow,
      color,
      stops,
      route,
    });

    console.log(`[NavBusRoutes] Route ${route?.route_number} drawn with ${stops.length} stops`);
    return { color, stops, route };
  }

  // ── Remove a route ────────────────────────────────────────────
  function removeRoute(routeId) {
    const r = _routes.get(routeId);
    if (!r) return;

    clearInterval(r.animInterval);
    r.glowLine.setMap(null);
    r.mainLine.setMap(null);
    r.animLine.setMap(null);
    r.routeInfoWindow.close();
    r.stopMarkers.forEach(m => { m._info?.close(); m.setMap(null); });

    _routes.delete(routeId);
  }

  // ── Toggle route visibility ───────────────────────────────────
  function toggleRoute(routeId) {
    if (_routes.has(routeId)) {
      removeRoute(routeId);
      return false;
    } else {
      drawRoute(routeId);
      return true;
    }
  }

  // ── Clear all routes ──────────────────────────────────────────
  function clearAll() {
    _routes.forEach((_, id) => removeRoute(id));
    _colorIndex = 0;
  }

  // ── Get legend data for UI ────────────────────────────────────
  function getLegend() {
    const items = [];
    _routes.forEach((r) => {
      items.push({
        color:    r.color.line,
        label:    `${r.route?.route_number || '?'} — ${r.route?.name || '—'}`,
        stops:    r.stops.length,
      });
    });
    return items;
  }

  // ── Check if route is drawn ───────────────────────────────────
  function isActive(routeId) { return _routes.has(routeId); }

  // ── Fit map to a route's bounds ───────────────────────────────
  function fitRoute(routeId) {
    const r = _routes.get(routeId);
    if (!r || !_map) return;
    const bounds = new google.maps.LatLngBounds();
    r.stops.forEach(s => bounds.extend({ lat: s.latitude, lng: s.longitude }));
    _map.fitBounds(bounds, { top: 60, right: 60, bottom: 140, left: 20 });
  }

  return {
    init,
    drawRoute,
    removeRoute,
    toggleRoute,
    clearAll,
    getLegend,
    isActive,
    fitRoute,
  };
})();
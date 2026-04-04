/* ============================================================
   NavBus — Map Initializer
   Bootstrap the Leaflet map with dark tile layers.
   Returns the map instance.
   ============================================================ */

const MapInit = (() => {

  // Available tile layers
  const TILES = {
    dark: {
      url:   'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      label: 'Dark',
    },
    satellite: {
      url:   'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      label: 'Satellite',
    },
    streets: {
      url:   'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
      label: 'No Labels',
    },
  };

  let _map        = null;
  let _tileLayer  = null;
  let _currentTile = 'dark';

  // ── Create and return map ────────────────────────────────────
  function create(containerId, options = {}) {
    const defaultCenter = options.center || [20.5937, 78.9629]; // India
    const defaultZoom   = options.zoom   || 5;

    _map = L.map(containerId, {
      center:           defaultCenter,
      zoom:             defaultZoom,
      zoomControl:      false,
      attributionControl: false,
      preferCanvas:     true,
    });

    // Default dark tile
    _tileLayer = L.tileLayer(TILES.dark.url, {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(_map);

    // Scale control
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(_map);

    // Update zoom indicator on zoom
    _map.on('zoomend', _updateZoomIndicator);

    _updateZoomIndicator();

    console.log('[MapInit] Leaflet map created on #' + containerId);
    return _map;
  }

  // ── Switch tile layer ────────────────────────────────────────
  function setTile(name) {
    const t = TILES[name];
    if (!t || !_map) return;

    if (_tileLayer) _tileLayer.remove();
    _tileLayer = L.tileLayer(t.url, { maxZoom: 19, subdomains: 'abcd' }).addTo(_map);
    _currentTile = name;

    // Update tile buttons
    document.querySelectorAll('.tile-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tile === name);
    });
  }

  // ── Zoom in / out ─────────────────────────────────────────────
  function zoomIn()  { _map?.zoomIn();  }
  function zoomOut() { _map?.zoomOut(); }

  // ── Update zoom level indicator ───────────────────────────────
  function _updateZoomIndicator() {
    const el = document.getElementById('zoomIndicator');
    if (el && _map) el.textContent = `Z${_map.getZoom()}`;
  }

  // ── Get map instance ─────────────────────────────────────────
  function getInstance() { return _map; }

  // ── Fly to default overview ───────────────────────────────────
  function resetView(center, zoom = 10) {
    _map?.flyTo(center || [20.5937, 78.9629], zoom, { duration: 1.5 });
  }

  return { create, setTile, zoomIn, zoomOut, getInstance, resetView, TILES };
})();

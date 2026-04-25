/* ============================================================
   NavBus — Google Maps Core
   Tamil Nadu dark-styled map with all custom configuration.
   Call NavBusGoogleMap.init('elementId') to bootstrap.
   ============================================================ */

const NavBusGoogleMap = (() => {

  let _map  = null;
  let _zoom = 8;

  // ── Tamil Nadu center ────────────────────────────────────────
  const TN_CENTER = { lat: 11.1271, lng: 78.6569 };

  // ── Dark gold map style (custom JSON) ────────────────────────
  // Matches NavBus brand: dark canvas, gold roads, minimal labels
  const DARK_GOLD_STYLE = [
    { elementType: 'geometry',           stylers: [{ color: '#0a0908' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0908' }] },
    { elementType: 'labels.text.fill',   stylers: [{ color: '#5c5044' }] },

    { featureType: 'administrative',
      elementType: 'geometry',           stylers: [{ color: '#1a1610' }] },
    { featureType: 'administrative',
      elementType: 'labels.text.fill',   stylers: [{ color: '#8a7a60' }] },

    // State borders — gold
    { featureType: 'administrative.province',
      elementType: 'geometry.stroke',    stylers: [{ color: '#c9a84c' }, { weight: 1.2 }] },
    { featureType: 'administrative.country',
      elementType: 'geometry.stroke',    stylers: [{ color: '#8a6c28' }, { weight: 1.5 }] },

    // Roads — tiered gold shades
    { featureType: 'road',
      elementType: 'geometry',           stylers: [{ color: '#1c1810' }] },
    { featureType: 'road.highway',
      elementType: 'geometry',           stylers: [{ color: '#2c2415' }] },
    { featureType: 'road.highway',
      elementType: 'geometry.stroke',    stylers: [{ color: '#3d3218' }, { weight: 0.5 }] },
    { featureType: 'road.arterial',
      elementType: 'geometry',           stylers: [{ color: '#181410' }] },
    { featureType: 'road.local',
      elementType: 'geometry',           stylers: [{ color: '#121008' }] },
    { featureType: 'road',
      elementType: 'labels.text.fill',   stylers: [{ color: '#6e5e40' }] },
    { featureType: 'road',
      elementType: 'labels.icon',        stylers: [{ visibility: 'off' }] },

    // Water — very dark blue-grey
    { featureType: 'water',
      elementType: 'geometry',           stylers: [{ color: '#080c12' }] },
    { featureType: 'water',
      elementType: 'labels.text.fill',   stylers: [{ color: '#263040' }] },

    // Landscape
    { featureType: 'landscape',
      elementType: 'geometry',           stylers: [{ color: '#0d0b08' }] },
    { featureType: 'landscape.natural',
      elementType: 'geometry',           stylers: [{ color: '#0a0e08' }] },

    // Points of interest — minimal
    { featureType: 'poi',
      elementType: 'geometry',           stylers: [{ color: '#0f0d09' }] },
    { featureType: 'poi',
      elementType: 'labels',             stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park',
      elementType: 'geometry',           stylers: [{ color: '#080e06' }] },
    { featureType: 'poi.park',
      elementType: 'labels.text.fill',   stylers: [{ color: '#1a2614' }] },

    // Transit
    { featureType: 'transit',
      elementType: 'geometry',           stylers: [{ color: '#100e08' }] },
    { featureType: 'transit.station',
      elementType: 'labels.text.fill',   stylers: [{ color: '#6e5e40' }] },

    // City names
    { featureType: 'administrative.locality',
      elementType: 'labels.text.fill',   stylers: [{ color: '#8a7a60' }] },
    { featureType: 'administrative.neighborhood',
      elementType: 'labels.text.fill',   stylers: [{ color: '#4a3e2c' }] },
  ];

  // ── White / light map style ───────────────────────────────────────
  const WHITE_STYLE = [
    { elementType: 'geometry',           stylers: [{ color: '#f8f6f0' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
    { elementType: 'labels.text.fill',   stylers: [{ color: '#4a4035' }] },

    { featureType: 'administrative',
      elementType: 'geometry',           stylers: [{ color: '#e8e4da' }] },
    { featureType: 'administrative',
      elementType: 'labels.text.fill',   stylers: [{ color: '#5c5044' }] },

    { featureType: 'administrative.province',
      elementType: 'geometry.stroke',    stylers: [{ color: '#c9a84c' }, { weight: 1.2 }] },
    { featureType: 'administrative.country',
      elementType: 'geometry.stroke',    stylers: [{ color: '#8a6c28' }, { weight: 1.5 }] },

    { featureType: 'road',
      elementType: 'geometry',           stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.highway',
      elementType: 'geometry',           stylers: [{ color: '#fde68a' }] },
    { featureType: 'road.highway',
      elementType: 'geometry.stroke',    stylers: [{ color: '#e9c94c' }, { weight: 0.8 }] },
    { featureType: 'road.arterial',
      elementType: 'geometry',           stylers: [{ color: '#f5f0e8' }] },
    { featureType: 'road.local',
      elementType: 'geometry',           stylers: [{ color: '#ede8df' }] },
    { featureType: 'road',
      elementType: 'labels.text.fill',   stylers: [{ color: '#6b5e40' }] },
    { featureType: 'road',
      elementType: 'labels.icon',        stylers: [{ visibility: 'off' }] },

    { featureType: 'water',
      elementType: 'geometry',           stylers: [{ color: '#aed3ea' }] },
    { featureType: 'water',
      elementType: 'labels.text.fill',   stylers: [{ color: '#4a7a9b' }] },

    { featureType: 'landscape',
      elementType: 'geometry',           stylers: [{ color: '#f2ede5' }] },
    { featureType: 'landscape.natural',
      elementType: 'geometry',           stylers: [{ color: '#e8f0e0' }] },

    { featureType: 'poi',
      elementType: 'geometry',           stylers: [{ color: '#e8f0e0' }] },
    { featureType: 'poi',
      elementType: 'labels',             stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park',
      elementType: 'geometry',           stylers: [{ color: '#c8e0b8' }] },
    { featureType: 'poi.park',
      elementType: 'labels.text.fill',   stylers: [{ color: '#4a7035' }] },

    { featureType: 'transit',
      elementType: 'geometry',           stylers: [{ color: '#e8e2d8' }] },
    { featureType: 'transit.station',
      elementType: 'labels.text.fill',   stylers: [{ color: '#6b5e40' }] },

    { featureType: 'administrative.locality',
      elementType: 'labels.text.fill',   stylers: [{ color: '#4a3e2c' }] },
    { featureType: 'administrative.neighborhood',
      elementType: 'labels.text.fill',   stylers: [{ color: '#6b5e40' }] },
  ];

  // ── Satellite style (lighter overlay for comparison) ──────────
  const SATELLITE_STYLE = [];

  let _currentStyle = 'dark';

  // ── Init map ─────────────────────────────────────────────────
  function init(containerId, options = {}) {
    const center = options.center || TN_CENTER;
    const zoom   = options.zoom   || _zoom;

    _map = new google.maps.Map(document.getElementById(containerId), {
      center,
      zoom,
      styles:              DARK_GOLD_STYLE,
      disableDefaultUI:    true,
      gestureHandling:     'greedy',
      clickableIcons:      false,
      mapTypeControl:      false,
      streetViewControl:   false,
      fullscreenControl:   false,
      zoomControl:         false,
      scaleControl:        false,
      rotateControl:       false,
      backgroundColor:     '#080806',
      mapTypeId:           'roadmap',
      restriction: {
        // Restrict panning to India bounds (optional)
        latLngBounds: {
          north: 37.5,
          south: 5.0,
          east:  99.0,
          west:  65.0,
        },
        strictBounds: false,
      },
    });

    console.log('[NavBusGoogleMap] Map initialised — center: Tamil Nadu');
    return _map;
  }

  // ── Get map instance ─────────────────────────────────────────
  function getInstance() { return _map; }

  // ── Apply map style ──────────────────────────────────────────
  function setStyle(name) {
    if (!_map) return;
    if (name === 'satellite') {
      _map.setMapTypeId('hybrid');
      _map.setOptions({ styles: [] });
    } else if (name === 'roads') {
      _map.setMapTypeId('roadmap');
      _map.setOptions({ styles: [] });
    } else if (name === 'white') {
      _map.setMapTypeId('roadmap');
      _map.setOptions({ styles: WHITE_STYLE });
    } else {
      _map.setMapTypeId('roadmap');
      _map.setOptions({ styles: DARK_GOLD_STYLE });
    }
    _currentStyle = name;
  }

  // ── Zoom controls ────────────────────────────────────────────
  function zoomIn()  { if (_map) _map.setZoom(_map.getZoom() + 1); }
  function zoomOut() { if (_map) _map.setZoom(_map.getZoom() - 1); }

  // ── Fly to location with smooth animation ─────────────────────
  function flyTo(lat, lng, zoom = 14) {
    if (!_map) return;
    _map.panTo({ lat, lng });
    // Smooth zoom after pan
    const currentZoom = _map.getZoom();
    if (currentZoom !== zoom) {
      setTimeout(() => { _map.setZoom(zoom); }, 400);
    }
  }

  // ── Fit map to bounds of multiple locations ───────────────────
  function fitBounds(locations) {
    if (!_map || locations.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    locations.forEach(loc => bounds.extend(new google.maps.LatLng(loc.lat, loc.lng)));
    _map.fitBounds(bounds, { top: 60, right: 70, bottom: 100, left: 20 });
  }

  // ── Reset to Tamil Nadu overview ──────────────────────────────
  function resetToTamilNadu() {
    if (!_map) return;
    _map.panTo(TN_CENTER);
    setTimeout(() => _map.setZoom(8), 300);
  }

  // ── Map click listener ────────────────────────────────────────
  function onClick(callback) {
    if (!_map) return;
    _map.addListener('click', callback);
  }

  // ── Zoom changed listener ─────────────────────────────────────
  function onZoomChanged(callback) {
    if (!_map) return;
    _map.addListener('zoom_changed', callback);
  }

  return {
    TN_CENTER,
    DARK_GOLD_STYLE,
    WHITE_STYLE,
    init,
    getInstance,
    setStyle,
    zoomIn,
    zoomOut,
    flyTo,
    fitBounds,
    resetToTamilNadu,
    onClick,
    onZoomChanged,
  };
})();
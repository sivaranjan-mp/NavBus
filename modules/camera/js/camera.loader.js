/* ============================================================
   NavBus — Camera Loader
   Fetches all buses with camera URLs from Supabase.
   Determines stream type (HLS / MJPEG / MP4 / unknown).
   ============================================================ */

const CameraLoader = (() => {

  // Cache: Map<busId, busObject>
  const _cache = new Map();

  // ── Stream type detection ─────────────────────────────────────
  function detectStreamType(url) {
    if (!url) return 'none';
    const lower = url.toLowerCase();

    if (lower.includes('.m3u8'))        return 'hls';
    if (lower.includes('mjpeg')  ||
        lower.includes('/mjpg')  ||
        lower.includes('/video') ||
        lower.match(/\.(mjpeg|mjpg)(\?.*)?$/)) return 'mjpeg';
    if (lower.includes('/snap')  ||
        lower.match(/\.(jpg|jpeg|png)(\?.*)?$/)) return 'snapshot';
    if (lower.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/)) return 'video';
    if (lower.startsWith('rtsp://')) return 'rtsp'; // not directly playable in browser
    return 'unknown'; // treat as MJPEG img fallback
  }

  // ── Load all active buses with camera URLs ────────────────────
  async function loadBusesWithCameras() {
    const { data, error } = await NAVBUS_DB
      .from('buses')
      .select(`
        id, device_id, number_plate, bus_name, bus_model,
        bus_type, capacity, status, is_active,
        camera_url_front,
        camera_url_rear,
        camera_url_cabin,
        camera_url_driver,
        routes(id, route_number, name),
        drivers(id, name, phone)
      `)
      .eq('is_active', true)
      .order('number_plate');

    if (error) {
      console.error('[CameraLoader] Failed:', error.message);
      return { buses: [], error: error.message };
    }

    const buses = (data || []).map(bus => {
      const cameras = buildCameraList(bus);
      _cache.set(bus.id, { ...bus, cameras });
      return { ...bus, cameras };
    });

    return { buses, error: null };
  }

  // ── Load a single bus by ID ────────────────────────────────────
  async function loadBusById(busId) {
    // Return from cache if available
    if (_cache.has(busId)) return { bus: _cache.get(busId), error: null };

    const { data, error } = await NAVBUS_DB
      .from('buses')
      .select(`
        id, device_id, number_plate, bus_name, bus_model,
        bus_type, capacity, status, is_active,
        camera_url_front,
        camera_url_rear,
        camera_url_cabin,
        camera_url_driver,
        routes(id, route_number, name),
        drivers(id, name, phone)
      `)
      .eq('id', busId)
      .single();

    if (error) return { bus: null, error: error.message };

    const bus = { ...data, cameras: buildCameraList(data) };
    _cache.set(busId, bus);
    return { bus, error: null };
  }

  // ── Build structured camera list for a bus ────────────────────
  function buildCameraList(bus) {
    const positions = [
      { key: 'camera_url_front',  label: 'Front',  icon: '🔭', pos: 'front'  },
      { key: 'camera_url_rear',   label: 'Rear',   icon: '🔙', pos: 'rear'   },
      { key: 'camera_url_cabin',  label: 'Cabin',  icon: '🚌', pos: 'cabin'  },
      { key: 'camera_url_driver', label: 'Driver', icon: '👤', pos: 'driver' },
    ];

    return positions.map(p => ({
      position: p.pos,
      label:    p.label,
      icon:     p.icon,
      url:      bus[p.key] || null,
      type:     detectStreamType(bus[p.key]),
      hasUrl:   !!bus[p.key],
    }));
  }

  // ── Count cameras per bus ─────────────────────────────────────
  function countCameras(bus) {
    return [
      bus.camera_url_front,
      bus.camera_url_rear,
      bus.camera_url_cabin,
      bus.camera_url_driver,
    ].filter(Boolean).length;
  }

  // ── Invalidate cache for a bus ────────────────────────────────
  function invalidate(busId) { _cache.delete(busId); }

  // ── Clear all cache ───────────────────────────────────────────
  function clearCache() { _cache.clear(); }

  return {
    detectStreamType,
    loadBusesWithCameras,
    loadBusById,
    buildCameraList,
    countCameras,
    invalidate,
    clearCache,
  };
})();

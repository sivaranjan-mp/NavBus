/* ============================================================
   NavBus — Bus Status Utility
   Determines online/offline/stale state and formatting
   ============================================================ */

const TrackingStatus = (() => {

  // Thresholds
  const STALE_MS   = 90_000;  // 90 seconds without ping → stale/offline
  const WARNING_MS = 45_000;  // 45 seconds → show warning color

  // ── Determine status from last ping time ─────────────────────
  function getStatus(lastPingDate) {
    if (!lastPingDate) return 'offline';
    const age = Date.now() - new Date(lastPingDate).getTime();
    if (age > STALE_MS)   return 'offline';
    if (age > WARNING_MS) return 'warning';
    return 'online';
  }

  // ── CSS color var for a status ───────────────────────────────
  function getStatusColor(status) {
    switch (status) {
      case 'online':      return '#4ade80';
      case 'warning':     return '#fbbf24';
      case 'offline':     return '#475569';
      case 'maintenance': return '#fbbf24';
      case 'alert':       return '#f87171';
      default:            return '#475569';
    }
  }

  // ── Human-readable last-seen ─────────────────────────────────
  function formatLastSeen(lastPingDate) {
    if (!lastPingDate) return 'Never';
    const sec = Math.floor((Date.now() - new Date(lastPingDate).getTime()) / 1000);
    if (sec <  5)  return 'Just now';
    if (sec < 60)  return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60)  return `${min}m ago`;
    const hr  = Math.floor(min / 60);
    return `${hr}h ago`;
  }

  // ── Format speed ─────────────────────────────────────────────
  function formatSpeed(kmh) {
    if (kmh == null) return '— km/h';
    return `${Math.round(kmh)} km/h`;
  }

  // ── Format coordinates ───────────────────────────────────────
  function formatCoords(lat, lng) {
    if (lat == null || lng == null) return '—';
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  // ── Heading to compass cardinal ───────────────────────────────
  function headingToCardinal(deg) {
    if (deg == null) return '—';
    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
    return dirs[Math.round(deg / 45) % 8];
  }

  return {
    STALE_MS,
    WARNING_MS,
    getStatus,
    getStatusColor,
    formatLastSeen,
    formatSpeed,
    formatCoords,
    headingToCardinal,
  };
})();

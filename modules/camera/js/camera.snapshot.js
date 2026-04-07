/* ============================================================
   NavBus — Camera Snapshot
   Captures a frame from a live video/image feed using Canvas,
   then offers it as a PNG download and shows a preview toast.
   ============================================================ */

const CameraSnapshot = (() => {

  let _toastTimer = null;

  // ── Capture a frame ───────────────────────────────────────────
  async function capture(cellEl, busPlate, cameraPosition) {
    const media = CameraPlayer.getMediaElement(cellEl);

    if (!media) {
      _showToastError('No active stream to capture.');
      return null;
    }

    try {
      const canvas = document.createElement('canvas');

      if (media.tagName === 'VIDEO') {
        canvas.width  = media.videoWidth  || 1280;
        canvas.height = media.videoHeight || 720;
      } else {
        // img element
        canvas.width  = media.naturalWidth  || 1280;
        canvas.height = media.naturalHeight || 720;
      }

      const ctx = canvas.getContext('2d');

      // Draw frame
      ctx.drawImage(media, 0, 0, canvas.width, canvas.height);

      // Add NavBus watermark
      _drawWatermark(ctx, canvas.width, canvas.height, busPlate, cameraPosition);

      // Export as data URL
      const dataURL  = canvas.toDataURL('image/png', 0.92);
      const filename = _buildFilename(busPlate, cameraPosition);

      _showToast(dataURL, filename);
      return { dataURL, filename };

    } catch (err) {
      // Cross-origin streams may block canvas access
      if (err.name === 'SecurityError') {
        _showToastError('Cannot capture cross-origin stream. Check camera CORS settings.');
      } else {
        _showToastError('Snapshot failed: ' + err.message);
      }
      console.error('[Snapshot] Error:', err);
      return null;
    }
  }

  // ── Draw watermark on canvas ──────────────────────────────────
  function _drawWatermark(ctx, w, h, plate, position) {
    ctx.save();

    // Semi-transparent bar at bottom
    ctx.fillStyle = 'rgba(8,8,6,0.7)';
    ctx.fillRect(0, h - 36, w, 36);

    // NavBus logo text
    ctx.fillStyle = '#c9a84c';
    ctx.font      = `bold 12px "Barlow Condensed", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('NAVBUS', 12, h - 16);

    // Bus plate
    ctx.fillStyle = '#f0ebe0';
    ctx.font      = `500 12px "JetBrains Mono", monospace`;
    ctx.fillText(plate || '—', 80, h - 16);

    // Camera position
    ctx.fillStyle = '#6e6354';
    ctx.font      = `500 11px "Barlow Condensed", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(position?.toUpperCase() + ' CAM', w / 2, h - 16);

    // Timestamp
    ctx.fillStyle = 'rgba(201,168,76,0.6)';
    ctx.font      = `400 10px "JetBrains Mono", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(new Date().toLocaleString('en-IN'), w - 12, h - 16);

    ctx.restore();
  }

  // ── Build filename ────────────────────────────────────────────
  function _buildFilename(plate, position) {
    const clean = (plate || 'BUS').replace(/[^a-zA-Z0-9]/g, '_');
    const now   = new Date();
    const ts    = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
    return `NavBus_${clean}_${position || 'cam'}_${ts}.png`;
  }

  // ── Show preview toast ────────────────────────────────────────
  function _showToast(dataURL, filename) {
    _clearToast();

    const toast = document.createElement('div');
    toast.className = 'cam-snapshot-toast';
    toast.id        = 'camSnapshotToast';
    toast.innerHTML = `
      <div class="cam-snapshot-preview">
        <img src="${dataURL}" alt="Snapshot preview"/>
      </div>
      <div class="cam-snapshot-info">
        <span class="cam-snapshot-title">Snapshot Saved</span>
        <span class="cam-snapshot-name">${filename}</span>
      </div>
      <a class="cam-snapshot-dl" href="${dataURL}" download="${filename}">Download</a>`;

    document.body.appendChild(toast);

    // Auto-remove after 6s
    _toastTimer = setTimeout(_clearToast, 6000);
  }

  function _showToastError(msg) {
    _clearToast();
    const toast = document.createElement('div');
    toast.className = 'cam-snapshot-toast';
    toast.id        = 'camSnapshotToast';
    toast.style.borderColor = 'rgba(248,113,113,0.3)';
    toast.innerHTML = `
      <div style="font-size:1.4rem;">⚠️</div>
      <div class="cam-snapshot-info">
        <span class="cam-snapshot-title" style="color:#f87171;">Capture Failed</span>
        <span class="cam-snapshot-name">${msg}</span>
      </div>`;
    document.body.appendChild(toast);
    _toastTimer = setTimeout(_clearToast, 4000);
  }

  function _clearToast() {
    clearTimeout(_toastTimer);
    const existing = document.getElementById('camSnapshotToast');
    if (existing) {
      existing.style.transition = 'opacity 0.3s, transform 0.3s';
      existing.style.opacity    = '0';
      existing.style.transform  = 'translateX(100%)';
      setTimeout(() => existing.remove(), 300);
    }
  }

  return { capture };
})();

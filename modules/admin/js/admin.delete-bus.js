/* ============================================================
   NavBus — Delete Bus Logic
   Confirm modal + Supabase soft/hard delete
   ============================================================ */

let _pendingDeleteId    = null;
let _pendingDeletePlate = null;

// ── Open confirm modal ────────────────────────────────────────
function openDeleteModal(busId, numberPlate) {
  _pendingDeleteId    = busId;
  _pendingDeletePlate = numberPlate;

  const modal    = document.getElementById('deleteModal');
  const plateEl  = document.getElementById('deleteBusPlate');
  if (!modal) return;

  if (plateEl) plateEl.textContent = numberPlate;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Focus confirm button for keyboard UX
  setTimeout(() => document.getElementById('confirmDeleteBtn')?.focus(), 100);
}

// ── Close modal ───────────────────────────────────────────────
function closeDeleteModal() {
  const modal = document.getElementById('deleteModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow  = '';
  _pendingDeleteId    = null;
  _pendingDeletePlate = null;
}

// ── Confirm delete ────────────────────────────────────────────
async function confirmDelete() {
  if (!_pendingDeleteId) return;

  const btn = document.getElementById('confirmDeleteBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Removing...'; }

  // Soft delete: set is_active = false (recommended)
  const { error } = await NAVBUS_DB
    .from('buses')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', _pendingDeleteId);

  if (btn) { btn.disabled = false; btn.textContent = 'Yes, Remove'; }

  if (error) {
    window.Toast?.error('Failed to remove bus: ' + error.message);
    closeDeleteModal();
    return;
  }

  window.Toast?.success(`Bus ${_pendingDeletePlate} removed from fleet.`);
  closeDeleteModal();

  // Remove row from DOM without full reload
  const row = document.querySelector(`tr[data-bus-id="${_pendingDeleteId}"]`);
  if (row) {
    row.style.transition = 'opacity 0.3s, transform 0.3s';
    row.style.opacity    = '0';
    row.style.transform  = 'translateX(20px)';
    setTimeout(() => { row.remove(); }, 300);
  }

  // Also remove from ALL_BUSES
  if (window.ALL_BUSES) {
    window.ALL_BUSES = window.ALL_BUSES.filter(b => b.id !== _pendingDeleteId);
    updateStatCards(window.ALL_BUSES);
  }
}

// ── Event listeners ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('confirmDeleteBtn')?.addEventListener('click', confirmDelete);
  document.getElementById('cancelDeleteBtn')?.addEventListener('click', closeDeleteModal);
  document.getElementById('deleteModalOverlay')?.addEventListener('click', closeDeleteModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDeleteModal();
  });
});

/* ============================================================
   NavBus — Admin Users Module
   Reads from Supabase `users` table
   Actions: view, toggle active status, change role
   ============================================================ */

let ALL_USERS = [];

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindSearchFilter();
  loadUsers();
});

// ── Fetch all profiles ────────────────────────────────────────
async function loadUsers() {
  showSkeleton();

  const { data, error } = await NAVBUS_DB
    .from('users')
    .select('id, name, email, role, is_active, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    showError('Failed to load users: ' + error.message);
    return;
  }

  ALL_USERS = data || [];
  renderUsers(ALL_USERS);
  updateStats(ALL_USERS);
}

// ── Render table ─────────────────────────────────────────────
function renderUsers(list) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  const countEl = document.getElementById('resultsCount');
  if (countEl) countEl.textContent = list.length + ' user' + (list.length !== 1 ? 's' : '');

  if (!list.length) {
    tbody.innerHTML = `
      <tr><td colspan="6">
        <div style="text-align:center;padding:48px;color:var(--text-muted);">
          <div style="font-size:2rem;margin-bottom:8px;">👥</div>
          <p>No users match your search.</p>
        </div>
      </td></tr>`;
    return;
  }

  const roleMap = {
    admin:    'role-badge role-admin',
    operator: 'role-badge role-operator',
    viewer:   'role-badge role-viewer',
    user:     'role-badge role-viewer',
  };

  const meId = window.NAVBUS_ADMIN?.id || '';

  tbody.innerHTML = list.map(u => {
    const isMe    = u.id === meId;
    const active  = u.is_active !== false;
    const initls  = (u.name || u.email || '??').slice(0,2).toUpperCase();
    const lastUpd = u.updated_at ? relativeTime(u.updated_at) : 'Never';

    return `
      <tr>
        <td>
          <div class="user-name-cell">
            <div class="user-avatar">${escHtml(initls)}</div>
            <div>
              <span style="font-weight:600;color:var(--text-primary);display:block;">${escHtml(u.name || '—')}</span>
              ${isMe ? '<span style="font-size:0.62rem;color:var(--gold);">You</span>' : ''}
            </div>
          </div>
        </td>
        <td style="font-family:var(--font-mono);font-size:0.78rem;">${escHtml(u.email)}</td>
        <td>
          <select class="filter-select" style="font-size:0.72rem;padding:3px 8px;"
            onchange="changeRole('${u.id}', this.value)" ${isMe ? 'disabled' : ''}>
            <option value="admin"    ${u.role==='admin'    ?'selected':''}>Admin</option>
            <option value="user"     ${u.role==='user'     ?'selected':''}>User</option>
          </select>
        </td>
        <td style="color:var(--text-muted);font-size:0.8rem;">${lastUpd}</td>
        <td>
          <span class="${active ? 'status-active' : 'status-inactive'}">
            ${active ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-outline btn-sm"
              onclick="toggleActive('${u.id}', ${active})"
              ${isMe ? 'disabled' : ''}>
              ${active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ── Stats row ─────────────────────────────────────────────────
function updateStats(all) {
  const totalEl   = document.querySelector('#statTotal   .stat-value, .stat-card:nth-child(1) .stat-value');
  const adminEl   = document.querySelector('#statAdmins  .stat-value, .stat-card:nth-child(2) .stat-value');
  const activeEl  = document.querySelector('#statActive  .stat-value, .stat-card:nth-child(3) .stat-value');
  const pendingEl = document.querySelector('#statPending .stat-value, .stat-card:nth-child(4) .stat-value');

  if (totalEl)   totalEl.textContent   = all.length;
  if (adminEl)   adminEl.textContent   = all.filter(u => u.role === 'admin').length;
  if (activeEl)  activeEl.textContent  = all.filter(u => u.is_active !== false).length;
  if (pendingEl) pendingEl.textContent = all.filter(u => u.is_active === false).length;
}

// ── Change role ───────────────────────────────────────────────
async function changeRole(id, newRole) {
  const { error } = await NAVBUS_DB
    .from('users')
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    showToast('Role update failed: ' + error.message, 'error');
    await loadUsers();
    return;
  }
  const u = ALL_USERS.find(x => x.id === id);
  if (u) u.role = newRole;
  showToast('Role updated to ' + newRole + '.', 'success');
}
window.changeRole = changeRole;

// ── Toggle active ─────────────────────────────────────────────
async function toggleActive(id, currentlyActive) {
  const { error } = await NAVBUS_DB
    .from('users')
    .update({ is_active: !currentlyActive, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    showToast('Update failed: ' + error.message, 'error');
    return;
  }

  const u = ALL_USERS.find(x => x.id === id);
  if (u) u.is_active = !currentlyActive;

  applyFilter();
  showToast('User ' + (!currentlyActive ? 'activated' : 'deactivated') + '.', 'success');
}
window.toggleActive = toggleActive;

// ── Search / filter ───────────────────────────────────────────
function bindSearchFilter() {
  document.getElementById('userSearch')?.addEventListener('input', applyFilter);
  document.getElementById('roleFilter')?.addEventListener('change', applyFilter);
}

function applyFilter() {
  const q = (document.getElementById('userSearch')?.value || '').toLowerCase();
  const r = document.getElementById('roleFilter')?.value || 'all';
  const filtered = ALL_USERS.filter(u => {
    const mq = !q || (u.name||'').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const mr = r === 'all' || u.role === r;
    return mq && mr;
  });
  renderUsers(filtered);
}
window.filterUsers = applyFilter;

// ── Skeleton / error helpers ──────────────────────────────────
function showSkeleton() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  tbody.innerHTML = Array(4).fill('').map(() => `
    <tr>
      ${Array(6).fill('<td><div style="height:14px;background:var(--bg-tertiary);border-radius:4px;animation:pulse 1.4s ease-in-out infinite;"></div></td>').join('')}
    </tr>`).join('');
}

function showError(msg) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  tbody.innerHTML = `
    <tr><td colspan="6">
      <div style="text-align:center;padding:48px;color:var(--text-muted);">
        <div style="font-size:2rem;margin-bottom:8px;">⚠️</div>
        <p>${escHtml(msg)}</p>
        <button class="btn btn-outline btn-sm" onclick="loadUsers()">Retry</button>
      </div>
    </td></tr>`;
}

// ── Utility ───────────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function relativeTime(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)   return 'Just now';
  if (diff < 3600) return Math.floor(diff/60) + ' min ago';
  if (diff < 86400)return Math.floor(diff/3600) + ' hr ago';
  return Math.floor(diff/86400) + ' day' + (Math.floor(diff/86400)>1?'s':'') + ' ago';
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position:'fixed', bottom:'24px', right:'24px', padding:'12px 20px',
    background: type === 'success' ? '#4ade80' : '#f87171',
    color:'#000', borderRadius:'8px', fontWeight:'600', zIndex:'9999', transition:'opacity 0.3s',
  });
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 3000);
}
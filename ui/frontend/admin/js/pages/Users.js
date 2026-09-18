// ============================================================
// Admin Users — User Management
// ============================================================
import { getApiBase, adminFetch } from '../utils/api.js';

export async function renderUsers(container) {
    container.innerHTML = `
        <div class="section-title anim-in"><i data-lucide="users"></i> User Management</div>
        <div class="adm-card anim-in anim-d1" id="adm-users-table">
            <div style="color:var(--text-tertiary);font-size:12px;font-family:var(--font-mono);padding:16px;">Loading users…</div>
        </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    loadUsers();
}

async function loadUsers() {
    try {
        const res = await adminFetch(`${getApiBase()}/admin/users`);
        if (!res.ok) return;
        const d = await res.json();

        const el = document.getElementById('adm-users-table');
        if (!el) return;

        if (!d.users || d.users.length === 0) {
            el.innerHTML = '<div style="padding:16px;color:var(--text-tertiary);font-size:12px;font-family:var(--font-mono);">No users found.</div>';
            return;
        }

        el.innerHTML = `
            <table class="adm-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${d.users.map(u => `
                        <tr>
                            <td style="color:var(--text-primary);font-weight:600;">${u.full_name || u.username || '—'}</td>
                            <td>${u.email}</td>
                            <td><span class="badge ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}">${u.role}</span></td>
                            <td><span class="badge ${u.is_active ? 'badge-ok' : 'badge-fail'}">${u.is_active ? 'active' : 'inactive'}</span></td>
                            <td>${u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                            <td>
                                <button class="btn-admin" style="padding:4px 10px;font-size:10px;"
                                    onclick="window._toggleRole('${u.id}', '${u.role === 'admin' ? 'user' : 'admin'}')">
                                    ${u.role === 'admin' ? 'Demote' : 'Promote'}
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        console.error('Users load error:', e);
    }
}

window._toggleRole = async (userId, newRole) => {
    if (!confirm(`Change user role to "${newRole}"?`)) return;
    try {
        const res = await adminFetch(`${getApiBase()}/admin/users/${userId}/role?role=${newRole}`, { method: 'POST' });
        if (res.ok) {
            await loadUsers();
        } else {
            const d = await res.json().catch(() => ({}));
            alert(d.detail || 'Failed to update role');
        }
    } catch (e) {
        alert('Error: ' + e.message);
    }
};

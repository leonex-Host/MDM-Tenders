// ============================================================
// Admin Dashboard — Live System Overview
// ============================================================
import { getApiBase, adminFetch } from '../utils/api.js';

let refreshTimer = null;

export async function renderDashboard(container) {
    container.innerHTML = `
        <div class="section-title anim-in">System Overview</div>
        <div class="stat-grid anim-in anim-d1" id="adm-stats">
            ${statBox('dash-total-tenders', 'Total Tenders', '...', 'cyan')}
            ${statBox('dash-google-results', 'Google Results', '...', 'cyan')}
            ${statBox('dash-active-scrapers', 'Active Scrapers', '...', '')}
            ${statBox('dash-tenders-today', 'Tenders Today', '...', 'green')}
            ${statBox('dash-google-today', 'Google Today', '...', 'green')}
            ${statBox('dash-total-users', 'Total Users', '...', '')}
            ${statBox('dash-email-recipients', 'Email Recipients', '...', 'cyan')}
            ${statBox('dash-emails-today', 'Emails Sent', '...', 'green')}
            ${statBox('dash-last-report', 'Last Report', '...', '')}
        </div>

        <div class="section-title anim-in anim-d2">Tenders by Source</div>
        <div id="adm-source-grid" class="stat-grid anim-in anim-d2">
            ${statBox('dash-src-gem', 'GEM', '...', 'cyan')}
            ${statBox('dash-src-tender247', 'TENDER247', '...', 'cyan')}
            ${statBox('dash-src-tenderdetail', 'TENDERDETAIL', '...', 'cyan')}
            ${statBox('dash-src-tenderontime', 'TENDERONTIME', '...', 'cyan')}
            ${statBox('dash-src-biddetail', 'BIDDETAIL', '...', 'cyan')}
        </div>

        <div class="section-title anim-in anim-d3">Recent Activity</div>
        <div class="adm-card anim-in anim-d3" id="adm-recent-logs" style="background:var(--bg-card); border:1px solid var(--border-glass); border-radius:12px; overflow:hidden;">
            <table class="adm-table" style="margin-top:0;">
                <thead><tr><th>Source</th><th>Status</th><th>Found</th><th>Saved</th><th>Started</th></tr></thead>
                <tbody>
                    <tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-tertiary); font-family:var(--font-mono); font-size:12px;">Loading activity...</td></tr>
                </tbody>
            </table>
        </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    // Fire load in background — never block shell rendering
    loadDashboard();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(loadDashboard, 8000);

    // Stop polling when page changes
    const obs = new MutationObserver(() => {
        if (!document.getElementById('adm-stats')) {
            clearInterval(refreshTimer);
            obs.disconnect();
        }
    });
    obs.observe(document.body, { childList: true, subtree: true });
}

async function loadDashboard() {
    try {
        const res = await adminFetch(`${getApiBase()}/admin/dashboard`);
        if (!res.ok) return;
        const d = await res.json();

        updateStatVal('dash-total-tenders', d.counts?.tenders ?? 0);
        updateStatVal('dash-google-results', d.counts?.google_results ?? 0);
        updateStatVal('dash-active-scrapers', d.active_scrapers ?? 0, (d.active_scrapers || 0) > 0 ? 'green' : '');
        updateStatVal('dash-tenders-today', d.today?.tenders ?? 0);
        updateStatVal('dash-google-today', d.today?.google ?? 0);
        updateStatVal('dash-total-users', d.counts?.users ?? 0);
        updateStatVal('dash-email-recipients', d.counts?.email_recipients ?? 0);
        updateStatVal('dash-emails-today', d.today?.emails_sent ?? 0);

        let lastTime = 'Never';
        if (d.last_report_time) {
            const dt = new Date(d.last_report_time);
            lastTime = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        updateStatVal('dash-last-report', lastTime);

        const srcEl = document.getElementById('adm-source-grid');
        if (srcEl) {
            const entries = Object.entries(d.tenders_by_source || {});
            if (!entries.length) {
                if (!srcEl.querySelector('.no-data-msg')) srcEl.innerHTML = '<div class="no-data-msg" style="color:var(--text-tertiary);font-size:12px;font-family:var(--font-mono);padding:12px;">No source data</div>';
            } else {
                entries.forEach(([src, cnt]) => {
                    const safeId = 'dash-src-' + src.replace(/[^a-zA-Z0-9]/g, '');
                    const existing = document.getElementById(safeId);
                    if (existing) {
                        updateStatVal(safeId, cnt);
                    } else {
                        srcEl.insertAdjacentHTML('beforeend', statBox(safeId, src.toUpperCase(), cnt, 'cyan'));
                    }
                });
            }
        }

        const logsEl = document.getElementById('adm-recent-logs');
        if (logsEl) {
            const logs = d.recent_logs || [];
            if (logs.length === 0) {
                if (!logsEl.querySelector('.no-data-msg')) logsEl.innerHTML = '<div class="no-data-msg" style="padding:16px;color:var(--text-tertiary);font-size:12px;font-family:var(--font-mono);">No recent activity</div>';
            } else {
                // Table is complex to soft-update perfectly row by row quickly, but replacing tbody is better than whole card
                let tbody = logsEl.querySelector('tbody');
                if (!tbody) {
                    logsEl.innerHTML = `
                        <table class="adm-table" style="margin-top:0;">
                            <thead><tr><th>Source</th><th>Status</th><th>Found</th><th>Saved</th><th>Started</th></tr></thead>
                            <tbody></tbody>
                        </table>
                    `;
                    tbody = logsEl.querySelector('tbody');
                }

                const newRows = logs.map(l => `
                    <tr>
                        <td style="color:var(--neon-cyan);font-weight:600;">${l.source || '—'}</td>
                        <td><span class="badge ${l.status === 'completed' ? 'badge-ok' : l.status === 'running' ? 'badge-run' : 'badge-fail'}">${l.status}</span></td>
                        <td>${l.tenders_found || 0}</td>
                        <td>${l.tenders_saved || 0}</td>
                        <td>${l.started_at ? new Date(l.started_at).toLocaleString() : '—'}</td>
                    </tr>
                `).join('');

                if (tbody.innerHTML !== newRows) {
                    tbody.innerHTML = newRows;
                }
            }
        }
    } catch (e) {
        console.error('Dashboard load error:', e);
    }
}

function updateStatVal(id, value, fallbackClass = '') {
    const el = document.getElementById(id);
    if (el) {
        const valEl = el.querySelector('.stat-value');
        if (valEl) {
            valEl.innerText = (typeof value === 'number' ? value.toLocaleString() : value);
            if (fallbackClass !== undefined) {
                valEl.className = 'stat-value ' + fallbackClass;
            }
        }
    }
}

function statBox(id, label, value, colorClass = '') {
    return `
        <div class="stat-box" id="${id}">
            <div class="stat-label">${label}</div>
            <div class="stat-value ${colorClass}">${typeof value === 'number' ? value.toLocaleString() : value}</div>
        </div>
    `;
}



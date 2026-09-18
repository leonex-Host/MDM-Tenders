import { getApiBase, authFetch } from '../utils/api.js';
// ============================================
// LEONEX TENDER — Settings Page
// ============================================

export async function renderSettings(container) {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';

    // Fetch user info
    let user = { full_name: 'User', email: '...', role: 'user' };
    try {
        const res = await authFetch(`${getApiBase()}/auth/me`);
        if (res.ok) {
            user = await res.json();
        }
    } catch (e) {
        console.error("Failed to fetch user profile", e);
    }

    container.innerHTML = `
        <div class="page-header anim-in">
            <div class="page-header-text">
                <h1>Settings</h1>
                <p>Configure your dashboard preferences and data management</p>
            </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; max-width:900px;">

            <!-- Profile Section -->
            <div class="card glass-panel anim-in anim-d1" style="padding:28px; border-radius:20px; grid-column:span 2;">
                <div style="display:flex; align-items:center; gap:20px; margin-bottom:24px;">
                    <div style="width:64px; height:64px; border-radius:50%; overflow:hidden; border: 2px solid rgba(255,255,255,0.1); box-shadow: 0 4px 12px rgba(0,0,0,0.1); background: var(--bg-hover); display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:bold; color:var(--accent-purple);">
                        ${user.full_name ? user.full_name.charAt(0).toUpperCase() : (user.username ? user.username.charAt(0).toUpperCase() : 'U')}
                    </div>
                    <div>
                        <div style="font-size:20px; font-weight:700; color:var(--text-primary);">${user.full_name || user.username || 'User'}</div>
                        <div style="font-size:14px; color:var(--text-tertiary); margin-top:2px;">${user.email} · <span style="text-transform:capitalize;">${user.role}</span></div>
                    </div>
                    <button class="btn-secondary" style="margin-left:auto; border-radius:100px; padding:8px 20px; font-size:13px;">Edit Profile</button>
                </div>
            </div>

            <!-- Appearance -->
            <div class="card glass-panel anim-in anim-d2" style="padding:28px; border-radius:20px;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:24px;">
                    <i data-lucide="palette" style="width:20px;height:20px;color:var(--accent-purple);"></i>
                    <span style="font-size:16px; font-weight:600; color:var(--text-primary);">Appearance</span>
                </div>
                <div class="settings-row">
                    <div>
                        <div style="font-size:14px; font-weight:500; color:var(--text-primary);">Dark Mode</div>
                        <div style="font-size:12px; color:var(--text-tertiary); margin-top:2px;">Switch between light and dark themes</div>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="settings-theme-toggle" ${currentTheme === 'dark' ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="settings-row">
                    <div>
                        <div style="font-size:14px; font-weight:500; color:var(--text-primary);">Animations</div>
                        <div style="font-size:12px; color:var(--text-tertiary); margin-top:2px;">Enable smooth transitions and effects</div>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" checked>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>

            <!-- Notifications -->
            <div class="card glass-panel anim-in anim-d2" style="padding:28px; border-radius:20px;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:24px;">
                    <i data-lucide="bell" style="width:20px;height:20px;color:var(--accent-orange);"></i>
                    <span style="font-size:16px; font-weight:600; color:var(--text-primary);">Notifications</span>
                </div>
                <div class="settings-row">
                    <div>
                        <div style="font-size:14px; font-weight:500; color:var(--text-primary);">Scraper Alerts</div>
                        <div style="font-size:12px; color:var(--text-tertiary); margin-top:2px;">Notify when scrapers find new tenders</div>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" checked>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="settings-row">
                    <div>
                        <div style="font-size:14px; font-weight:500; color:var(--text-primary);">Error Reports</div>
                        <div style="font-size:12px; color:var(--text-tertiary); margin-top:2px;">Get notified when scrapers fail</div>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" checked>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>

            <!-- Data Management -->
            <div class="card glass-panel anim-in anim-d3" style="padding:28px; border-radius:20px; grid-column:span 2;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:24px;">
                    <i data-lucide="database" style="width:20px;height:20px;color:var(--accent-green);"></i>
                    <span style="font-size:16px; font-weight:600; color:var(--text-primary);">Data Management</span>
                </div>
                <div class="settings-row">
                    <div>
                        <div style="font-size:14px; font-weight:500; color:var(--text-primary);">Export All Data</div>
                        <div style="font-size:12px; color:var(--text-tertiary); margin-top:2px;">Download complete tender database as Excel</div>
                    </div>
                    <button class="btn-secondary" style="border-radius:100px; padding:8px 20px; font-size:13px;" id="settings-export">
                        <i data-lucide="download" style="width:14px;height:14px;"></i> Export
                    </button>
                </div>
                <div class="settings-row">
                    <div>
                        <div style="font-size:14px; font-weight:500; color:var(--text-primary);">API Endpoint</div>
                        <div style="font-size:12px; color:var(--text-tertiary); margin-top:2px;">Switch between Local and Render API</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="font-size:12px; color:var(--text-secondary);" id="settings-api-label">${getApiBase()}</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="settings-api-toggle" ${localStorage.getItem('api_backend') === 'local' ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="settings-row" style="border-bottom:none;">
                    <div>
                        <div style="font-size:14px; font-weight:500; color:#EF4444;">Clear All Data</div>
                        <div style="font-size:12px; color:var(--text-tertiary); margin-top:2px;">Permanently delete all scraped tender data</div>
                    </div>
                    <button class="btn-secondary" style="border-radius:100px; padding:8px 20px; font-size:13px; color:#EF4444; border-color:#EF4444;">
                        <i data-lucide="trash-2" style="width:14px;height:14px;"></i> Clear
                    </button>
                </div>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // Theme toggle
    const themeToggle = container.querySelector('#settings-theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('change', () => {
            const next = themeToggle.checked ? 'dark' : 'light';
            document.documentElement.classList.add('theme-transition');
            document.documentElement.setAttribute('data-theme', next);
            setTimeout(() => document.documentElement.classList.remove('theme-transition'), 500);
        });
    }

    // API toggle
    const apiToggle = container.querySelector('#settings-api-toggle');
    if (apiToggle) {
        apiToggle.addEventListener('change', async () => {
            const mode = apiToggle.checked ? 'local' : 'remote';
            // Important: we need to import setApiBackend dynamically or make sure it's available
            const { setApiBackend } = await import('../utils/api.js');
            setApiBackend(mode);
            
            // Reload page to apply changes everywhere instantly
            window.location.reload();
        });
    }

    // Export
    const exportBtn = container.querySelector('#settings-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            // Note: browser download via <a> doesn't easily support auth headers unless we fetch blob.
            // For simplicity, we can use a temporary token or just let it fail if endpoint is protected.
            // Since we protected /export, we need a way to pass the token.
            // One way is a query param token (less secure but works for links).
            // For now, let's use a blob fetch approach.
            _handleExport();
        });
    }
}

async function _handleExport() {
    try {
        const res = await authFetch(`${getApiBase()}/export`);
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tender_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (e) {
        alert("Export failed: " + e.message);
    }
}

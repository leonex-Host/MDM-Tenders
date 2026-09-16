// ============================================================
// Admin Portal — Main Entry Point (Robust Version)
// ============================================================
import { registerRoute, handleRoute, getCurrentRoute } from './router.js?v=3.0';
import { isLoggedIn, getApiBase, getApiMode, clearToken } from './utils/api.js?v=3.0';
import { renderLogin } from './pages/Login.js?v=3.0';
import { renderDashboard } from './pages/Dashboard.js?v=3.0';
import { renderScrapers } from './pages/Scrapers.js?v=3.0';
import { renderUsers } from './pages/Users.js?v=3.0';
import { renderTerminal } from './pages/Terminal.js?v=3.0';

console.log('[Main] Booting System...');

// ── Register Routes ──────────────────────────────────────────
registerRoute('/login', renderLogin);
registerRoute('/dashboard', renderDashboard);
registerRoute('/scrapers', renderScrapers);
registerRoute('/users', renderUsers);
registerRoute('/terminal', renderTerminal);

function initTheme() {
    try {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
    } catch (e) { console.warn('Theme init failed:', e); }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) { }
    renderTopbar();
}

function boot() {
    console.log('[Main] Initializing Boot Sequence...');
    initTheme();
    const app = document.getElementById('admin-app');
    if (!app) { console.error('[Main] #admin-app NOT FOUND!'); return; }

    try {
        const loggedIn = isLoggedIn();
        if (loggedIn) {
            app.classList.remove('logged-out');
            renderTopbar();
        } else {
            app.classList.add('logged-out');
            const topbar = document.getElementById('admin-topbar');
            if (topbar) topbar.innerHTML = '';
        }
    } catch (err) {
        console.error('[Main] Boot Error:', err);
    }

    handleRoute();
}

function renderTopbar() {
    const topbar = document.getElementById('admin-topbar');
    if (!topbar) return;

    try {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const mode = getApiMode();
        const isHeadless = localStorage.getItem('admin_headless') !== 'false';
        const isLocal = mode === 'local';

        const currentRoute = getCurrentRoute();
        const currentPath = currentRoute ? currentRoute.path : '#/dashboard';
        const isActive = (path) => currentPath.includes(path) ? 'active' : '';

        topbar.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; height:100%; padding:0 12px;">
                
                <!-- Left Side: Title & Status Controls -->
                <div style="display:flex; align-items:center; gap:24px;">
                    <span style="font-weight:900; font-size:16px; letter-spacing:1px; color:var(--text-primary);">LEONEX</span>


                </div>

                <!-- Right Side: Navigation & Theme -->
                <div style="display:flex; align-items:center; gap:12px;">
                    <button class="bb-theme-toggle" id="adm-theme-toggle" title="Toggle Theme" style="margin-right:8px; width:38px; height:38px; border-radius:10px; padding:0;">
                        <i data-lucide="${currentTheme === 'dark' ? 'moon' : 'sun'}" style="width:16px;height:16px;"></i>
                    </button>

                    <div class="bb-nav-group hide-on-mobile" style="background:var(--bg-card); border-radius:12px; border:1px solid var(--border-glass); padding:4px;">
                        <button class="bb-nav-item ${isActive('/dashboard')}" style="padding:6px 16px; font-weight:600; font-size:13px; border-radius:8px;" onclick="window.location.hash='#/dashboard'">Overview</button>
                        <button class="bb-nav-item ${isActive('/scrapers')}" style="padding:6px 16px; font-weight:600; font-size:13px; border-radius:8px;" onclick="window.location.hash='#/scrapers'">Scrapers</button>
                        <button class="bb-nav-item ${isActive('/users')}" style="padding:6px 16px; font-weight:600; font-size:13px; border-radius:8px;" onclick="window.location.hash='#/users'">Users</button>
                        <button class="bb-nav-item ${isActive('/terminal')}" style="padding:6px 16px; font-weight:600; font-size:13px; border-radius:8px;" onclick="window.location.hash='#/terminal'">System Logs</button>
                    </div>

                    <button class="bb-profile-bubble" id="adm-profile-btn" title="Logout" style="margin-left:8px;">AD</button>
                </div>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();

        // ── Event Listeners ───────────────

        // Theme Toggle click
        document.getElementById('adm-theme-toggle')?.addEventListener('click', toggleTheme);

        // Logout handling
        document.getElementById('adm-profile-btn')?.addEventListener('click', () => {
            if (confirm("Are you sure you want to log out?")) {
                clearToken();
                window.location.hash = '#/login';
                window.location.reload();
            }
        });
    } catch (e) {
        console.error('[Topbar] Render Error:', e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}


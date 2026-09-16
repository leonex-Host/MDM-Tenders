// ============================================================
// Admin Sidebar Component — Premium Reference Style
// ============================================================
import { navigate, getCurrentRoute } from '../router.js';
import { clearToken } from '../utils/api.js';

const logoSVG = `
<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 0L14.4 9.6L24 12L14.4 14.4L12 24L9.6 14.4L0 12L9.6 9.6L12 0Z"/>
</svg>`;

const navGroups = [
    {
        section: 'MAIN',
        items: [
            { icon: 'monitor-dot', label: 'Overview', route: '/dashboard' },
            { icon: 'scan-eye', label: 'Scrapers', route: '/scrapers', badgeId: 'sc-badge' },
            { icon: 'terminal', label: 'Live Logs', route: '/logs' },
            { icon: 'command', label: 'Terminal', route: '/terminal' }
        ]
    },
    {
        section: 'MANAGEMENT',
        items: [
            { icon: 'fingerprint', label: 'User Access', route: '/users' },
            { icon: 'component', label: 'Settings', route: '/settings' }
        ]
    }
];



export function renderAdminSidebar() {
    const sidebar = document.getElementById('admin-sidebar');
    if (!sidebar) return;

    const currentRoute = getCurrentRoute();
    const currentPath = currentRoute ? currentRoute.path : '#/dashboard';

    let navHTML = '';
    navGroups.forEach(group => {
        navHTML += `<div class="nav-section-title">${group.section}</div>`;
        group.items.forEach(item => {
            const isActive = currentPath.includes(item.route) ? 'active' : '';
            const badge = item.badgeId ? `<span class="nav-badge" id="${item.badgeId}">807</span>` : '';
            navHTML += `
                <button class="nav-item ${isActive}" onclick="window.location.hash='#${item.route}'">
                    <span class="nav-icon"><i data-lucide="${item.icon}"></i></span>
                    <span class="nav-label">${item.label}</span>
                    ${badge}
                </button>`;
        });
    });

    sidebar.innerHTML = `
        <div class="sidebar-header" style="margin-bottom: 12px;">
            <div class="sidebar-logo" style="display: flex; align-items: center; gap: 14px;">
                <div class="logo-icon" style="width:36px; height:36px; background:var(--bg-card); border:1px solid var(--border-glass); border-radius:10px; display:flex; align-items:center; justify-content:center; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                    <img src="favicon.png" style="width: 24px; height: 24px; object-fit: contain;">
                </div>
                <div class="logo-text" style="display:flex; flex-direction:column; justify-content:center;">
                    <span style="font-size:16px; font-weight:900; letter-spacing:1px; line-height:1;">LEONEX</span>
                    <span style="font-size:10px; font-weight:700; color:var(--text-tertiary); letter-spacing:2px; margin-top:2px; text-transform:uppercase;">System</span>
                </div>
            </div>
        </div>
        <nav class="sidebar-nav">
            ${navHTML}
        </nav>
        <div class="sidebar-footer">
            <button class="nav-item nav-item-logout" id="adm-logout-btn">
                <span class="nav-icon"><i data-lucide="log-out"></i></span>
                <span class="nav-label">Logout</span>
            </button>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    document.getElementById('adm-logout-btn')?.addEventListener('click', () => {
        clearToken();
        window.location.hash = '#/login';
        window.location.reload();
    });
}

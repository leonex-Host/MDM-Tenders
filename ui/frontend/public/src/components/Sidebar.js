import { getApiBase, clearTokens, authFetch } from '../utils/api.js';
import { navigate, getCurrentRoute } from '../router.js';
import { resetBookmarks } from '../utils/BookmarkStore.js';

const navItems = [
    {
        section: 'MAIN',
        items: [
            { icon: 'layout-grid', label: 'Overview', route: '/overview' },
            { icon: 'briefcase', label: 'Tenders', route: '/tenders', badgeId: 'tender-count' },
            { icon: 'database-backup', label: 'MDM Tenders', route: '/mdm-tenders' },
            { icon: 'bot-message-square', label: 'AI Insights', route: '/ai-overview' },
            { icon: 'star', label: 'Bookmarks', route: '/bookmarks' },
            { icon: 'search-code', label: 'Google', route: '/google' }

        ]
    },
    {
        section: 'SOURCES',
        items: [
            { icon: 'globe', label: 'GEM Portal', route: '/gem-portal' },
            { icon: 'bar-chart-2', label: 'TenderOnTime', route: '/tender-on-time' },
            { icon: 'file-text', label: 'TenderDetails', route: '/tender-detail' },
            { icon: 'clock', label: 'Tender247', route: '/tender-247' },
            { icon: 'briefcase', label: 'BidTenders', route: '/bid-tenders' }
        ]
    }
];

// Leonex Logo Image
const logoSVG = `<img src="favicon.png" style="width: 24px; height: 24px; object-fit: contain;">`;

export function renderSidebar() {
    const currentRoute = getCurrentRoute();

    let navHTML = '';
    navItems.forEach(group => {
        if (group.section) {
            navHTML += `<div class="nav-section-title">${group.section}</div>`;
        }
        group.items.forEach(item => {
            const isActive = (currentRoute.path === item.route) ? 'active' : '';
            const badge = item.badgeId
                ? `<span class="nav-badge" id="${item.badgeId}">…</span>`
                : (item.badge ? `<span class="nav-badge">${item.badge}</span>` : '');
            navHTML += `
                <button class="nav-item ${isActive}" data-route="${item.route}" id="nav-${item.route.slice(1)}">
                    <span class="nav-icon"><i data-lucide="${item.icon}"></i></span>
                    <span class="nav-label">${item.label}</span>
                    ${badge}
                </button>`;
        });
    });

    return `
        <div class="sidebar-inner">
            <div class="sidebar-header">
                <div class="sidebar-logo" id="sidebar-logo-home" style="cursor: pointer;">
                    <div class="logo-icon">${logoSVG}</div>
                    <div class="logo-text">Leonex</div>
                </div>
            </div>
            <nav class="sidebar-nav-scroll">
                ${navHTML}
            </nav>
            <div class="sidebar-footer">
                <button class="nav-item" id="nav-settings" data-route="/settings">
                    <span class="nav-icon"><i data-lucide="settings"></i></span>
                    <span class="nav-label">Settings</span>
                </button>
                <button class="nav-item" id="logout-btn">
                    <span class="nav-icon"><i data-lucide="log-out"></i></span>
                    <span class="nav-label">Logout</span>
                </button>
            </div>
        </div>
    `;
}

export function initSidebarEvents() {
    const closeSidebar = () => {
        document.querySelector('.sidebar')?.classList.remove('open');
        document.getElementById('sidebar-overlay')?.classList.remove('active');
    };

    document.querySelectorAll('.nav-item[data-route]').forEach(btn => {
        btn.addEventListener('click', () => {
            navigate(btn.getAttribute('data-route'));
            closeSidebar();
        });
    });

    const homeLogo = document.getElementById('sidebar-logo-home');
    if (homeLogo) {
        homeLogo.addEventListener('click', () => {
            navigate('/portal');
            closeSidebar();
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            clearTokens();
            resetBookmarks();
            navigate('/login');
        });
    }

    // Fetch live tender count for sidebar badge
    authFetch(`${getApiBase()}/stats`, { cache: "no-store" })
        .then(r => r.json())
        .then(data => {
            const badge = document.getElementById('tender-count');
            if (badge) badge.textContent = data.total_tenders || '0';
        })
        .catch(() => {
            const badge = document.getElementById('tender-count');
            if (badge) badge.textContent = '—';
        });
}

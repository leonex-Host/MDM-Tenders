import { navigate } from '../router.js';
import { getApiBackendMode, setApiBackend } from '../utils/api.js';

export function renderTopbar() {
    return `
        <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Menu">
            <i data-lucide="menu" style="width:20px;height:20px;"></i>
        </button>
        <div class="search-bar" id="search-bar">
            <span class="search-icon"><i data-lucide="search" style="width:16px;height:16px;"></i></span>
            <input type="text" placeholder="Search or type a command" id="search-input">
            <span class="search-shortcut">⌘F</span>
        </div>
        <div class="topbar-actions">
            <!-- Backend Switcher -->
            <div id="backend-switcher" title="Switch between local (visible browser) and Render server" style="display:flex;align-items:center;gap:6px;background:var(--surface-2,rgba(255,255,255,0.05));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:20px;padding:3px 4px;cursor:pointer;" onclick="(function(){
                const mode = localStorage.getItem('api_backend') === 'local' ? 'remote' : 'local';
                localStorage.setItem('api_backend', mode);
                document.getElementById('backend-dot').style.background = mode === 'local' ? '#22c55e' : '#f97316';
                document.getElementById('backend-label').textContent = mode === 'local' ? 'Local' : 'Render';
                document.getElementById('backend-icon').setAttribute('data-lucide', mode === 'local' ? 'monitor' : 'cloud');
                if(window.lucide) window.lucide.createIcons();
                window.location.reload();
            })()">
                <span id="backend-dot" style="width:8px;height:8px;border-radius:50%;background:${localStorage.getItem('api_backend') === 'local' ? '#22c55e' : '#f97316'};flex-shrink:0;"></span>
                <i id="backend-icon" data-lucide="${localStorage.getItem('api_backend') === 'local' ? 'monitor' : 'cloud'}" style="width:13px;height:13px;opacity:0.75;"></i>
                <span id="backend-label" style="font-size:11px;font-weight:600;letter-spacing:0.3px;color:var(--text-secondary);padding-right:4px;">${localStorage.getItem('api_backend') === 'local' ? 'Local' : 'Render'}</span>
            </div>
            <button class="theme-toggle" id="theme-btn" aria-label="Toggle Theme">
                <span class="icon-sun"><i data-lucide="sun" style="width:16px;height:16px;"></i></span>
                <span class="icon-moon"><i data-lucide="moon" style="width:16px;height:16px;"></i></span>
            </button>
            <button class="btn-primary" id="new-project-btn">
                <i data-lucide="plus" style="width:14px;height:14px;"></i> New Project
            </button>
            <div style="position:relative;">
                <button class="btn-icon notif-badge" id="notif-btn" aria-label="Notifications">
                    <i data-lucide="bell" style="width:18px;height:18px;"></i>
                    <span class="notif-dot"></span>
                </button>
                <!-- Notification Popup -->
                <div class="notif-popup" id="notif-popup" style="display:none;">
                    <div class="notif-popup-header">
                        <span style="font-size:15px; font-weight:700; color:var(--text-primary);">Notifications</span>
                        <button class="notif-clear-btn" id="notif-clear">Clear All</button>
                    </div>
                    <div class="notif-popup-list" id="notif-list">
                        <div class="notif-item unread">
                            <div class="notif-item-icon" style="background:var(--accent-green-dim); color:var(--accent-green);"><i data-lucide="check-circle" style="width:16px;height:16px;"></i></div>
                            <div class="notif-item-body">
                                <div class="notif-item-title">GEM Portal sync complete</div>
                                <div class="notif-item-desc">122 new tenders extracted successfully</div>
                                <div class="notif-item-time">2 minutes ago</div>
                            </div>
                        </div>
                        <div class="notif-item unread">
                            <div class="notif-item-icon" style="background:var(--accent-purple-dim); color:var(--accent-purple);"><i data-lucide="sparkles" style="width:16px;height:16px;"></i></div>
                            <div class="notif-item-body">
                                <div class="notif-item-title">AI Analysis ready</div>
                                <div class="notif-item-desc">MDM keyword matching found 34% surge in Data Center demand</div>
                                <div class="notif-item-time">15 minutes ago</div>
                            </div>
                        </div>
                        <div class="notif-item">
                            <div class="notif-item-icon" style="background:var(--accent-orange-dim); color:var(--accent-orange);"><i data-lucide="alert-triangle" style="width:16px;height:16px;"></i></div>
                            <div class="notif-item-body">
                                <div class="notif-item-title">TenderOnTime rate limited</div>
                                <div class="notif-item-desc">Scraper paused due to throttling. Will retry in 5 minutes.</div>
                                <div class="notif-item-time">1 hour ago</div>
                            </div>
                        </div>
                        <div class="notif-item">
                            <div class="notif-item-icon" style="background:var(--accent-blue-dim); color:var(--accent-blue);"><i data-lucide="download" style="width:16px;height:16px;"></i></div>
                            <div class="notif-item-body">
                                <div class="notif-item-title">Export completed</div>
                                <div class="notif-item-desc">Master data exported to tender_export.xlsx</div>
                                <div class="notif-item-time">3 hours ago</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="avatar" id="profile-btn" role="button" tabindex="0">
                <img src="src/assets/image.png" alt="Profile" onerror="this.onerror=null; this.parentNode.innerText='H';">
            </div>
        </div>
    `;
}

export function initTopbarEvents() {
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Use the proper toggleTheme() which applies the no-transition guard
            // to prevent glitches on ALL elements during theme swap
            import('../theme.js').then(({ toggleTheme }) => toggleTheme());
        });
    }

    // Mobile Menu Toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            const sidebar = document.querySelector('.sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            if (sidebar) sidebar.classList.add('open');
            if (overlay) overlay.classList.add('active');
        });
    }

    // New Project → Notes page
    const newProjectBtn = document.getElementById('new-project-btn');
    if (newProjectBtn) {
        newProjectBtn.addEventListener('click', () => {
            navigate('/notes');
        });
    }

    // Notification popup toggle
    const notifBtn = document.getElementById('notif-btn');
    const notifPopup = document.getElementById('notif-popup');
    if (notifBtn && notifPopup) {
        notifBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = notifPopup.style.display !== 'none';
            notifPopup.style.display = isVisible ? 'none' : 'flex';
            // Remove dot on open
            const dot = notifBtn.querySelector('.notif-dot');
            if (dot) dot.style.display = 'none';
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!notifPopup.contains(e.target) && e.target !== notifBtn) {
                notifPopup.style.display = 'none';
            }
        });

        // Clear all
        const clearBtn = document.getElementById('notif-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                const list = document.getElementById('notif-list');
                if (list) list.innerHTML = `
                    <div style="padding:40px 20px; text-align:center; color:var(--text-tertiary); font-size:13px;">
                        <i data-lucide="bell-off" style="width:28px;height:28px;opacity:0.3;display:block;margin:0 auto 10px;"></i>
                        No new notifications
                    </div>
                `;
                if (window.lucide) window.lucide.createIcons();
            });
        }
    }

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('search-input')?.focus();
        }
    });
}

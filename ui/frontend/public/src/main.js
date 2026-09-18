import { initTheme } from './theme.js';
import { registerRoute, initRouter, navigate, getCurrentRoute, isAuthenticated } from './router.js';
import { renderSidebar, initSidebarEvents } from './components/Sidebar.js';
import { renderTopbar, initTopbarEvents } from './components/Topbar.js';
import { renderLogin } from './pages/Login.js';
import { renderRegister } from './pages/Register.js';
import { renderForgotPassword } from './pages/ForgotPassword.js';
import { renderOverview } from './pages/Overview.js';
import { renderTenders } from './pages/Tenders.js';
import { renderMDMTenders } from './pages/MDMTenders.js';
import { renderAIOverview } from './pages/AIOverview.js';
import { renderGEMPortal } from './pages/GEMPortal.js';
import { renderTenderOnTime } from './pages/TenderOnTime.js';
import { renderTenderDetailPage } from './pages/TenderDetailPage.js';
import { renderTender247 } from './pages/Tender247.js';
import { renderBidTenders } from './pages/BidTenders.js';
import { renderSettings } from './pages/Settings.js';
import { renderNotes } from './pages/Notes.js';
import { renderBookmarks } from './pages/Bookmarks.js';
import { renderGoogle } from './pages/Google.js';
import { renderTenderView } from './pages/TenderView.js';
import { renderPortal } from './pages/Portal.js';
import { syncBookmarks } from './utils/BookmarkStore.js';

initTheme();

const app = document.getElementById('app');

function initIcons() {
    if (window.lucide) lucide.createIcons();
}

function withAuthLayout(renderFn) {
    return (container, query) => {
        container.innerHTML = '';
        renderFn(container, query);
        requestAnimationFrame(initIcons);
    };
}
function withAppLayout(renderFn) {
    return async (container, query) => {
        if (!isAuthenticated()) {
            navigate('/login');
            return;
        }

        // Sync bookmarks from backend
        await syncBookmarks();


        let pageContent = document.getElementById('page-content');
        
        if (!pageContent || !container.querySelector('.app-shell')) {
            container.innerHTML = `
                <div class="page-wrapper">
                    <div class="app-shell">
                        <div class="sidebar-overlay" id="sidebar-overlay"></div>
                        <aside class="sidebar glass-panel">
                            ${renderSidebar()}
                        </aside>
                        <div class="right-panel">
                            <header class="topbar glass-panel" id="topbar">
                                ${renderTopbar()}
                            </header>
                            <div class="content-scroll glass-panel" id="page-content"></div>
                        </div>
                    </div>
                </div>
            `;
            initSidebarEvents();
            initTopbarEvents();
            
            // Handle overlay click to close sidebar
            const overlay = document.getElementById('sidebar-overlay');
            if (overlay) {
                overlay.addEventListener('click', () => {
                    document.querySelector('.sidebar')?.classList.remove('open');
                    overlay.classList.remove('active');
                });
            }
            
            pageContent = document.getElementById('page-content');
        }

        pageContent.innerHTML = '';
        pageContent.className = 'content-scroll glass-panel';
        renderFn(pageContent, query);

        requestAnimationFrame(() => {
            initIcons();
            setTimeout(initIcons, 200);
        });
    };
}

// Routes
registerRoute('/login', withAuthLayout(renderLogin));
registerRoute('/register', withAuthLayout(renderRegister));
registerRoute('/forgot-password', withAuthLayout(renderForgotPassword));

registerRoute('/portal', withAppLayout(renderPortal));
registerRoute('/overview', withAppLayout(renderOverview));
registerRoute('/tenders', withAppLayout(renderTenders));
registerRoute('/mdm-tenders', withAppLayout(renderMDMTenders));
registerRoute('/ai-overview', withAppLayout(renderAIOverview));
registerRoute('/bookmarks', withAppLayout(renderBookmarks));
registerRoute('/google', withAppLayout(renderGoogle));
registerRoute('/gem-portal', withAppLayout(renderGEMPortal));
registerRoute('/tender-on-time', withAppLayout(renderTenderOnTime));
registerRoute('/tender-detail', withAppLayout(renderTenderDetailPage));
registerRoute('/tender-247', withAppLayout(renderTender247));
registerRoute('/bid-tenders', withAppLayout(renderBidTenders));
registerRoute('/tender-view', withAppLayout(renderTenderView));
registerRoute('/settings', withAppLayout(renderSettings));
registerRoute('/notes', withAppLayout(renderNotes));

initRouter(app);

if (!getCurrentRoute() || getCurrentRoute().path === '/') {
    navigate(isAuthenticated() ? '/portal' : '/login');
}


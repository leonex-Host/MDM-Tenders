// ============================================================
// Admin Portal — SPA Router (Robust Version)
// ============================================================
import { isLoggedIn } from './utils/api.js';

const routes = {};
const publicRoutes = ['/login'];

export function registerRoute(path, handler) {
    console.log('[Router] Registering:', path);
    routes[path] = handler;
}

export async function navigate(path) {
    window.location.hash = '#' + path;
}

export function getCurrentRoute() {
    try {
        const hash = window.location.hash.slice(1) || '';
        const path = hash.split('?')[0] || '/dashboard';
        return { path, handler: routes[path] };
    } catch (e) {
        return { path: '/dashboard', handler: routes['/dashboard'] };
    }
}

export async function handleRoute() {
    try {
        const hash = window.location.hash.slice(1) || '';
        let path = hash.split('?')[0] || '/dashboard';
        if (path === '' || path === '/') path = '/dashboard';

        console.log('[Router] Handling Route:', path);

        const loggedIn = isLoggedIn();
        if (!loggedIn && !publicRoutes.includes(path)) {
            console.log('[Router] Unauthenticated - Redirecting to /login');
            window.location.hash = '#/login';
            return;
        }
        if (loggedIn && path === '/login') {
            window.location.hash = '#/dashboard';
            return;
        }

        // Global Anti-Leak: Clear all intervals on every route change
        const highestId = window.setInterval(() => { }, 0);
        for (let i = 0; i <= highestId; i++) {
            window.clearInterval(i);
        }

        const handler = routes[path] || (loggedIn ? routes['/dashboard'] : routes['/login']);
        const content = document.getElementById('admin-content');

        if (content && handler) {
            try {
                content.innerHTML = '<div style="text-align:center; padding:100px; color:#555; font-family:sans-serif;">Loading system components...</div>';
                await handler(content);
            } catch (err) {
                console.error('[Router] Handler Error:', err);
                content.innerHTML = `<div style="padding:40px; background:#200; color:#f88; border-radius:12px; font-family:monospace;"><b>[HANDLER_ERROR]</b><br>${err.message}<br><br><small style="opacity:0.6;">Check console for stack trace</small></div>`;
            }
        } else if (!handler) {
            console.warn('[Router] No handler for:', path);
            if (loggedIn) window.location.hash = '#/dashboard';
            else window.location.hash = '#/login';
        }

        // Highlight active topbar nav pills
        document.querySelectorAll('.bb-nav-item').forEach(el => {
            const onClickAttr = el.getAttribute('onclick') || '';
            const isMatch = onClickAttr.includes(`'#${path}'`) || (path === '/dashboard' && onClickAttr.includes('Overview'));
            el.classList.toggle('active', isMatch);
        });
    } catch (err) {
        console.error('[Router] Fatal Error:', err);
        const content = document.getElementById('admin-content');
        if (content) content.innerHTML = `<div style="padding:40px;color:red;font-family:monospace;">ROUTING_ERROR: ${err.message}</div>`;
    }
}

window.addEventListener('hashchange', handleRoute);

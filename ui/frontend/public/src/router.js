// ============================================
// LEONEX TENDER — Hash-based SPA Router
// ============================================
import { isLoggedIn } from './utils/api.js';

const routes = {};
let currentCleanup = null;

export function registerRoute(path, handler) {
    routes[path] = handler;
}

export function navigate(path) {
    window.location.hash = path;
}

export function getCurrentRoute() {
    const raw = window.location.hash.slice(1) || '/login';
    const [path, query] = raw.split('?');
    return { path, query };
}

export function initRouter(container) {
    async function handleRoute() {
        let { path, query } = getCurrentRoute();
        
        const publicRoutes = ['/login', '/register', '/forgot-password', '/reset-password'];
        const isAuth = isLoggedIn();

        // 1. If not logged in and trying to access a private route -> Go to login
        if (!isAuth && !publicRoutes.includes(path)) {
            navigate('/login');
            return;
        }

        // 2. If already logged in and trying to access login/register -> Go to portal
        if (isAuth && (path === '/login' || path === '/register')) {
            navigate('/portal');
            return;
        }

        const handler = routes[path] || routes['/login'];

        // Cleanup previous page
        if (currentCleanup && typeof currentCleanup === 'function') {
            currentCleanup();
            currentCleanup = null;
        }

        if (handler) {
            container.classList.remove('page-enter-active');
            container.classList.add('page-enter');

            // Pass query to handler
            const cleanup = await handler(container, query);
            if (typeof cleanup === 'function') {
                currentCleanup = cleanup;
            }

            // Trigger page transition
            requestAnimationFrame(() => {
                container.classList.add('page-enter-active');
                container.classList.remove('page-enter');
            });
        }

        // Update sidebar active state
        document.querySelectorAll('.nav-item').forEach(item => {
            const href = item.getAttribute('data-route');
            if (href === path) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    window.addEventListener('hashchange', handleRoute);
    handleRoute();

    return () => window.removeEventListener('hashchange', handleRoute);
}

// Auth guard
export function isAuthenticated() {
    return isLoggedIn();
}

export function setAuthenticated(value) {
    // Legacy support
}

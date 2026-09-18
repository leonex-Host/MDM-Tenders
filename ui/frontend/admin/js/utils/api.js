// ============================================================
// Admin Portal — API Utilities (Robust Version)
// ============================================================

const REMOTE_URL = 'https://mdm-tenders-mo22.onrender.com/api';
const LOCAL_URL = 'http://localhost:8000/api';
const KEY = 'admin_api_backend';
const TOKEN_KEY = 'admin_token';

function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
function safeSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { }
}
function safeRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { }
}

export function getApiBase() {
    return safeGet(KEY) === 'local' ? LOCAL_URL : REMOTE_URL;
}
export function setApiBackend(mode) { safeSet(KEY, mode); }
export function getApiMode() { return safeGet(KEY) === 'local' ? 'local' : 'remote'; }

export function getToken() { return safeGet(TOKEN_KEY); }
export function setToken(t) { safeSet(TOKEN_KEY, t); }
export function clearToken() { safeRemove(TOKEN_KEY); }
export function isLoggedIn() { return !!getToken(); }

export async function adminFetch(url, opts = {}) {
    const token = getToken();
    const headers = { ...(opts.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(opts.body);
    }

    try {
        const res = await fetch(url, { ...opts, headers });
        if (res.status === 401 || res.status === 403) {
            // Only redirect if this failure happened on the PRIMARY backend we are logged into
            if (url.startsWith(getApiBase())) {
                clearToken();
                window.location.hash = '#/login';
            }
        }
        return res;
    } catch (e) {
        console.error('[adminFetch] Error:', e);
        // Do not use alert() here because background polling (setInterval) will cause an infinite loop of popups
        throw e;
    }
}

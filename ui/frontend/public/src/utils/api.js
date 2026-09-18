// ============================================
// API Base URL Manager + Auth Header Helper
// ============================================

const REMOTE_URL = 'https://mdm-tenders-mo22.onrender.com/api';
const LOCAL_URL = 'http://localhost:8000/api';
const KEY = 'api_backend';

// ── Backend switcher ──────────────────────────────────────────────────────────
export function getApiBase() {
    return localStorage.getItem(KEY) === 'local' ? LOCAL_URL : REMOTE_URL;
}

export function setApiBackend(mode) {
    localStorage.setItem(KEY, mode);
}

export function getApiBackendMode() {
    return localStorage.getItem(KEY) === 'local' ? 'local' : 'remote';
}

export function isLocalMode() {
    return localStorage.getItem(KEY) === 'local';
}

// ── Token storage ─────────────────────────────────────────────────────────────
const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';

export function saveTokens(accessToken, refreshToken) {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function getAccessToken() {
    return localStorage.getItem(ACCESS_KEY) || '';
}

export function getRefreshToken() {
    return localStorage.getItem(REFRESH_KEY) || '';
}

export function clearTokens() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
}

export function isLoggedIn() {
    return !!localStorage.getItem(ACCESS_KEY);
}

// ── Authenticated fetch ───────────────────────────────────────────────────────
/**
 * Drop-in replacement for fetch() that automatically adds:
 *   Authorization: Bearer <access_token>
 * and retries once with a refreshed token on 401.
 */
export async function authFetch(url, options = {}) {
    const token = getAccessToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };

    let res = await fetch(url, { ...options, headers });

    // If 401 — try to refresh once
    if (res.status === 401) {
        const refreshed = await _tryRefresh();
        if (refreshed) {
            headers['Authorization'] = `Bearer ${getAccessToken()}`;
            res = await fetch(url, { ...options, headers });
        } else {
            // Refresh also failed — force logout
            clearTokens();
            window.location.hash = '/login';
            throw new Error('Session expired. Please log in again.');
        }
    }

    return res;
}

async function _tryRefresh() {
    const refresh = getRefreshToken();
    if (!refresh) return false;
    try {
        const res = await fetch(`${getApiBase()}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        saveTokens(data.access_token, data.refresh_token);
        return true;
    } catch {
        return false;
    }
}

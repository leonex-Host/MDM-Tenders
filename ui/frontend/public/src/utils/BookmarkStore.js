import { authFetch, getApiBase } from './api.js';

const STORE_KEY = 'leonex_bookmarks';

let hasSynced = false;

// Sync bookmarks from backend on app load
export async function syncBookmarks(force = false) {
    if (hasSynced && !force) return;
    try {
        const res = await authFetch(`${getApiBase()}/bookmarks`);
        if (res.ok) {
            const data = await res.json();
            localStorage.setItem(STORE_KEY, JSON.stringify(data));
            hasSynced = true;
        }
    } catch(err) {
        console.error("Failed to sync bookmarks", err);
    }
}

export function resetBookmarks() {
    hasSynced = false;
    localStorage.removeItem(STORE_KEY);
}

export function getBookmarks() {
    try {
        const data = localStorage.getItem(STORE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (err) {
        console.error("Failed to parse bookmarks", err);
        return [];
    }
}

export function isBookmarked(identifier) {
    if (!identifier) return false;
    const bookmarks = getBookmarks();
    const idStr = String(identifier).trim();
    return bookmarks.some(b => {
        const bId = String(b.tender_id || b.link || '').trim();
        return bId === idStr;
    });
}

export function toggleBookmark(itemObj, typeStr = 'tender') {
    let bookmarks = getBookmarks();
    let state = false;
    
    if (!itemObj) return state;

    const identifier = itemObj.tender_id || itemObj.link;
    if (!identifier) {
        console.warn("Cannot bookmark item without tender_id or link:", itemObj);
        return state;
    }

    const idStr = String(identifier).trim();

    if (!itemObj._bookType) itemObj._bookType = typeStr;

    const idx = bookmarks.findIndex(b => {
        const bId = String(b.tender_id || b.link || '').trim();
        return bId === idStr;
    });

    if (idx !== -1) {
        bookmarks.splice(idx, 1);
        state = false;
    } else {
        bookmarks.unshift(itemObj);
        state = true;
    }
    
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify(bookmarks));
        // Also save to backend
        authFetch(`${getApiBase()}/bookmarks`, {
            method: 'POST',
            body: JSON.stringify(itemObj)
        }).catch(err => console.error("Backend bookmark save failed", err));
        
    } catch(err) {
        console.error("Failed to save bookmark locally", err);
    }
    
    return state;
}

import { getApiBase, authFetch } from '../utils/api.js';
// ============================================
// LEONEX — Google Search Results Page
// Displays scraped results stored in the DB
// ============================================

import { toggleBookmark, isBookmarked } from '../utils/BookmarkStore.js';

const API = `${getApiBase()}/google`;

export async function renderGoogle(container) {
    container.innerHTML = `
        <div class="page-header anim-in">
            <div class="page-header-text">
                <h1>Google Search</h1>
                <p>MDM keyword results scraped from Google — all results &amp; filtered results</p>
            </div>
            <div class="page-header-actions" style="display:flex; gap:12px; align-items:center;">
                <div id="goog-captcha-container"></div>
                <button class="goog-dl-btn" id="goog-refresh-btn" style="background:#000;color:#fff;border-color:#000;">
                    <i data-lucide="refresh-cw" style="width:13px;height:13px;"></i>
                    Refresh Data
                </button>
            </div>
        </div>

        <!-- ── Stat Cards ── -->
        <div class="goog-stats-grid anim-in anim-d1">
            ${statCard('goog-s1', 'Today — All Results', '—')}
            ${statCard('goog-s2', 'Today — Filtered', '—')}
            ${statCard('goog-s3', 'Total All Results', '—')}
            ${statCard('goog-s4', 'Total Filtered', '—')}
            ${statCard('goog-s5', 'Last Scrape', '—', true)}
        </div>

        <!-- ── Controls Card ── -->
        <div class="card goog-ctrl-card anim-in anim-d2" style="margin-bottom: 16px;">
            <!-- Row 1: Tabs & Dropdowns -->
            <div class="goog-ctrl-row" style="margin-bottom: 20px;">
                <div class="goog-tabs" id="goog-tabs">
                    <button class="goog-tab active" data-type="all">All Results</button>
                    <button class="goog-tab" data-type="filtered">Filtered Results</button>
                </div>
                
                <select id="goog-keyword-input" class="goog-inp" title="Filter by Keyword" style="margin-left:auto;">
                    <option value="">All Keywords</option>
                    <option value="material codification">Material Codification</option>
                    <option value="codification of material">Codification of Material</option>
                    <option value="master data management">Master Data Mgt (MDM)</option>
                    <option value="data cataloguing">Data Cataloguing</option>
                    <option value="data enrichment">Data Enrichment</option>
                    <option value="bill of material">Bill of Material</option>
                    <option value="asset verification">Asset Verification</option>
                    <option value="sap master data">SAP Master Data</option>
                </select>

                <select id="goog-sort-input" class="goog-inp" title="Sort Order">
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                </select>
            </div>
            
            <!-- Row 2: Dates & Buttons -->
            <div class="goog-ctrl-row">
                <!-- Date Filters (Inline Labels) -->
                <div class="goog-ctrl-dates">
                    <div class="goog-date-field" style="flex-direction: row; align-items: center;">
                        <label>Date From</label>
                        <input type="date" id="goog-date-from" class="goog-date-inp">
                    </div>
                    <div class="goog-date-field" style="flex-direction: row; align-items: center;">
                        <label>Date To</label>
                        <input type="date" id="goog-date-to" class="goog-date-inp">
                    </div>
                </div>
                
                <div class="goog-action-btns" style="display:flex;gap:8px; margin-left: 12px;">
                    <button class="goog-apply-btn" id="goog-apply-btn">Apply</button>
                    <button class="goog-clear-btn" id="goog-clear-btn">Clear</button>
                </div>

                <div class="goog-dl-btns" style="display:flex; gap:8px; margin-left: auto;">
                    <button class="goog-dl-btn" id="goog-dl-all" title="Export All Results matching filters">
                        <i data-lucide="download" style="width:13px;height:13px;"></i> All Excel
                    </button>
                    <button class="goog-dl-btn" id="goog-dl-filtered" title="Export Filtered Results matching filters">
                        <i data-lucide="download" style="width:13px;height:13px;"></i> Filtered Excel
                    </button>
                </div>
            </div>
        </div>

        <!-- ── Large Search Bar ── -->
        <div class="goog-big-search-wrapper anim-in anim-d2" style="margin-bottom: 24px; position:relative; max-width: 652px;">
            <i data-lucide="search" style="position:absolute; left:18px; top:50%; transform:translateY(-50%); color:var(--text-tertiary); width:18px; height:18px;"></i>
            <input type="text" id="goog-search-input" placeholder="Search across all scraped records..." class="goog-big-search-inp">
        </div>

        <!-- Result Count Inline -->
        <div class="goog-result-count" id="goog-result-count" style="margin-bottom: 16px;"></div>

        <!-- ── Results ── -->
        <div id="goog-results-area" class="anim-in anim-d3"></div>
    `;

    if (window.lucide) window.lucide.createIcons();

    let state = { type: 'all', dateFrom: '', dateTo: '', search: '', keyword: '', sort: 'newest' };

    // ── Refresh Data ───────────────────────────────────────────────────────
    document.getElementById('goog-refresh-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('goog-refresh-btn');
        btn.innerHTML = `<i data-lucide="loader" style="width:13px;height:13px;" class="goog-spin"></i> Refreshing…`;
        if (window.lucide) window.lucide.createIcons();
        
        await loadStats();
        await loadResults();
        
        btn.innerHTML = `<i data-lucide="refresh-cw" style="width:13px;height:13px;"></i> Refresh Data`;
        if (window.lucide) window.lucide.createIcons();
    });

    // ── Tabs ───────────────────────────────────────────────────────────────
    document.querySelectorAll('.goog-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.goog-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.type = tab.dataset.type;
            loadResults();
        });
    });

    // ── Filters & Actions ──────────────────────────────────────────────────
    
    function applyAllFilters() {
        state.dateFrom = document.getElementById('goog-date-from').value;
        state.dateTo   = document.getElementById('goog-date-to').value;
        state.search   = document.getElementById('goog-search-input').value.toLowerCase().trim();
        state.keyword  = document.getElementById('goog-keyword-input').value.toLowerCase();
        state.sort     = document.getElementById('goog-sort-input').value;
        loadResults();
    }

    // Instantly responsive search and filter dropdowns
    document.getElementById('goog-search-input')?.addEventListener('input', () => {
        state.search = document.getElementById('goog-search-input').value.toLowerCase().trim();
        loadResults();
    });
    document.getElementById('goog-keyword-input')?.addEventListener('change', () => {
        state.keyword = document.getElementById('goog-keyword-input').value.toLowerCase();
        loadResults();
    });
    document.getElementById('goog-sort-input')?.addEventListener('change', () => {
        state.sort = document.getElementById('goog-sort-input').value;
        loadResults();
    });
    document.getElementById('goog-date-from')?.addEventListener('change', applyAllFilters);
    document.getElementById('goog-date-to')?.addEventListener('change', applyAllFilters);

    document.getElementById('goog-apply-btn')?.addEventListener('click', applyAllFilters);
    
    document.getElementById('goog-clear-btn')?.addEventListener('click', () => {
        state.dateFrom = ''; state.dateTo = ''; state.search = ''; state.keyword = ''; state.sort = 'newest';
        document.getElementById('goog-date-from').value = '';
        document.getElementById('goog-date-to').value = '';
        document.getElementById('goog-search-input').value = '';
        document.getElementById('goog-keyword-input').value = '';
        document.getElementById('goog-sort-input').value = 'newest';
        loadResults();
    });

    // ── Excel download (Client-side CSV generator) ─────────────────────────
    
    async function exportAsCsv(targetType) {
        let url = `${API}/results?result_type=${targetType}`;
        const qs = buildDateQS(state);
        if (qs) url += `&${qs}`;
        
        try {
            const res = await authFetch(url, { cache: "no-store" });
            const d = await res.json();
            
            let allItems = [];
            Object.values(d.groups || {}).forEach(arr => allItems.push(...arr));

            if (state.search) {
                allItems = allItems.filter(r => 
                    (r.title || '').toLowerCase().includes(state.search) || 
                    (r.description || '').toLowerCase().includes(state.search) ||
                    (r.search_query || '').toLowerCase().includes(state.search)
                );
            }
            if (state.keyword) {
                allItems = allItems.filter(r => {
                    const kws = Array.isArray(r.keywords) ? r.keywords.map(k=>k.toLowerCase()) : [];
                    const q = (r.search_query || '').toLowerCase();
                    return kws.includes(state.keyword) || q.includes(state.keyword) || kws.some(k => k.includes(state.keyword));
                });
            }

            if (allItems.length === 0) {
                alert(`No ${targetType} data available matching your current filters.`);
                return;
            }

            const headers = ["Title", "Link", "Date Scraped", "Original Query", "Keywords", "Is PDF", "Description", "Page Excerpt"];
            let csvContent = "\uFEFF" 
                + headers.join(",") + "\n"
                + allItems.map(r => {
                    const title = `"${(r.title || "").replace(/"/g, '""')}"`;
                    const link = `"${(r.link || "").replace(/"/g, '""')}"`;
                    const date = `"${r.scraped_at ? r.scraped_at.split('T')[0] : 'Unknown'}"`;
                    const query = `"${(r.search_query || "").replace(/"/g, '""')}"`;
                    const kws = `"${Array.isArray(r.keywords) ? r.keywords.join("; ") : ""}"`;
                    const isPdf = r.is_pdf ? "Yes" : "No";
                    const desc = `"${(r.description || "").replace(/"/g, '""')}"`;
                    const exc = `"${(r.page_excerpt || "").replace(/"/g, '""')}"`;
                    return [title, link, date, query, kws, isPdf, desc, exc].join(",");
                }).join("\n");

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const blobUrl = URL.createObjectURL(blob);
            
            const linkTag = document.createElement("a");
            linkTag.setAttribute("href", blobUrl);
            linkTag.setAttribute("download", `google_${targetType}_results_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(linkTag);
            linkTag.click();
            document.body.removeChild(linkTag);
            
            setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        } catch (e) {
            console.error("Export error", e);
            alert("Failed to export data.");
        }
    }

    document.getElementById('goog-dl-all')?.addEventListener('click', () => exportAsCsv('all'));
    document.getElementById('goog-dl-filtered')?.addEventListener('click', () => exportAsCsv('filtered'));

    // ── Stats & Status Polling ─────────────────────────────────────────────
    
    // Create an audio player for the beep
    let _audioContext = null;
    function playBeep() {
        if (!_audioContext) {
            _audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (_audioContext.state === 'suspended') {
            _audioContext.resume();
        }
        const osc = _audioContext.createOscillator();
        const gainNode = _audioContext.createGain();
        osc.connect(gainNode);
        gainNode.connect(_audioContext.destination);
        osc.type = 'sine';
        osc.frequency.value = 800; // Hz
        gainNode.gain.setValueAtTime(0.1, _audioContext.currentTime);
        osc.start();
        osc.stop(_audioContext.currentTime + 0.5);
    }
    
    let isBeeping = false;
    let captchaJustCleared = false;  // Guard: blocks re-beep immediately after user clicks cleared

    async function loadStats() {
        try {
            const res = await authFetch(`${API}/stats`, { cache: "no-store" });
            const d = await res.json();
            setText('goog-s1', fmtNum(d.today_all));
            setText('goog-s2', fmtNum(d.today_filtered));
            setText('goog-s3', fmtNum(d.total_all));
            setText('goog-s4', fmtNum(d.total_filtered));
            setText('goog-s5', d.last_sync ? fmtDate(d.last_sync) : 'Never');
            
            checkCaptchaStatus(d.sync_status);
        } catch (e) { console.warn('Stats error', e); }
    }

    async function pollStatusOnly() {
        try {
            const res = await authFetch(`${API}/sync/status`, { cache: "no-store" });
            const st = await res.json();
            checkCaptchaStatus(st);
        } catch (e) { /* ignore network error on fast poll */ }
    }
    
    function stopBeep() {
        isBeeping = false;
        clearInterval(window._captchaInterval);
        window._captchaInterval = null;
        // Also stop AudioContext to kill any lingering sound immediately
        if (_audioContext && _audioContext.state !== 'closed') {
            try { _audioContext.suspend(); } catch(e) {}
        }
    }

    function checkCaptchaStatus(syncStatus) {
        if (!syncStatus) return;
        const cContainer = document.getElementById('goog-captcha-container');
        if (!cContainer) return;

        // If user already clicked "cleared", ignore stale backend status for 10 seconds
        if (captchaJustCleared) return;

        if (syncStatus.captcha_detected) {
            if (!isBeeping) {
                isBeeping = true;
                playBeep();
                window._captchaInterval = setInterval(playBeep, 5000);
            }
            // Only render the button if it doesn't already exist (prevents duplicate listeners)
            if (!document.getElementById('goog-clear-captcha-btn')) {
                cContainer.innerHTML = `
                    <button id="goog-clear-captcha-btn" class="goog-dl-btn anim-in" style="background:#ef4444; color:#fff; border-color:#dc2626; animation: pulse 2s infinite;">
                        <i data-lucide="alert-triangle" style="width:13px;height:13px;"></i>
                        Captcha Detected — Click Once Cleared
                    </button>
                `;
                if (window.lucide) window.lucide.createIcons();
                
                document.getElementById('goog-clear-captcha-btn').addEventListener('click', async (e) => {
                    const btn = e.currentTarget;
                    btn.disabled = true;  // prevent double-clicks
                    btn.innerHTML = `<i data-lucide="loader" style="width:13px;height:13px;" class="goog-spin"></i> Resuming...`;
                    if (window.lucide) window.lucide.createIcons();

                    // Immediately stop sound and set guard — don't wait for API
                    stopBeep();
                    captchaJustCleared = true;
                    cContainer.innerHTML = '';

                    try {
                        const res = await authFetch(`${API}/clear-captcha`, { cache: "no-store", method: 'POST' });
                        if (res.ok) {
                            setTimeout(loadStats, 1500);
                        }
                    } catch(e) { console.error(e); }

                    // Release guard after 10 seconds (enough time for backend to update)
                    setTimeout(() => { captchaJustCleared = false; }, 10000);
                });
            }
        } else {
            // Backend confirmed no captcha — safe to fully reset
            if (isBeeping) {
                stopBeep();
            }
            captchaJustCleared = false;
            cContainer.innerHTML = '';

        }
    }

    // Fast poll loop every 3 seconds to catch scraper blockages
    const statusPoller = setInterval(pollStatusOnly, 3000);
    // Bind interval clearing to cleanup if component unmounts (requires wrapper framework, but we can tie to document node removal as a hack)
    const observer = new MutationObserver((mutations) => {
        if (!document.body.contains(container)) {
            clearInterval(statusPoller);
            clearInterval(window._captchaInterval);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ── Results ────────────────────────────────────────────────────────────
    async function loadResults() {
        const area = document.getElementById('goog-results-area');
        area.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-tertiary);font-size:13px;">Loading…</div>`;
        let url = `${API}/results?result_type=${state.type}`;
        const qs = buildDateQS(state);
        if (qs) url += `&${qs}`;

        try {
            const res = await authFetch(url, { cache: "no-store" });
            const d = await res.json();
            
            // Re-flatten items to apply JS-side filters (search and keyword)
            let allItems = [];
            Object.values(d.groups || {}).forEach(arr => allItems.push(...arr));

            if (state.search) {
                allItems = allItems.filter(r => 
                    (r.title || '').toLowerCase().includes(state.search) || 
                    (r.description || '').toLowerCase().includes(state.search) ||
                    (r.search_query || '').toLowerCase().includes(state.search)
                );
            }
            
            if (state.keyword) {
                allItems = allItems.filter(r => {
                    const kws = Array.isArray(r.keywords) ? r.keywords.map(k=>k.toLowerCase()) : [];
                    const q = (r.search_query || '').toLowerCase();
                    return kws.includes(state.keyword) || q.includes(state.keyword) || kws.some(k => k.includes(state.keyword));
                });
            }
            
            // Attach data globally for Export Excel
            window.__currentGoogleData = allItems;

            const countEl = document.getElementById('goog-result-count');
            if (countEl) countEl.innerHTML = `Showing <strong>${allItems.length}</strong> ${state.type === 'filtered' ? 'filtered' : 'all'} results`;

            if (allItems.length === 0) {
                area.innerHTML = emptyState();
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            // Sort all items globally based on date
            allItems.sort((a, b) => {
                const da = a.scraped_at ? a.scraped_at : '';
                const db = b.scraped_at ? b.scraped_at : '';
                if (state.sort === 'newest') return db.localeCompare(da);
                return da.localeCompare(db);
            });

            area.innerHTML = `
                <div class="goog-cards-grid">
                    ${allItems.map(r => resultCard(r)).join('')}
                </div>
            `;
            
            if (window.lucide) window.lucide.createIcons();

            function bindActions() {
                const area = document.getElementById('goog-results-area');
                if (!area) return;

                // Bookmarks
                area.querySelectorAll('.bookmark-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const b = e.currentTarget;
                        const obj = JSON.parse(b.getAttribute('data-google'));
                        const saved = toggleBookmark(obj, 'google');
                        saved ? b.classList.add('active') : b.classList.remove('active');
                    });
                });

                // Deletes
                area.querySelectorAll('.delete-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const b = e.currentTarget;
                        const id = b.getAttribute('data-id');
                        if(!confirm("Are you sure you want to permanently delete this Google result from the database?")) return;
                        
                        const card = b.closest('.goog-result-card');
                        if (card) {
                            card.style.opacity = '0.5';
                            card.style.pointerEvents = 'none';
                        }

                        try {
                            const res = await authFetch(`${API}/results/${id}`, { cache: "no-store", method: 'DELETE' });
                            if (res.ok) {
                                if (card) card.remove();
                                // Optional: Unbookmark if it was saved
                                const relatedBmBtn = card.querySelector(`[data-google]`);
                                if(relatedBmBtn) {
                                    const objForStore = JSON.parse(relatedBmBtn.getAttribute('data-google'));
                                    if (isBookmarked(objForStore.link)) {
                                        toggleBookmark(objForStore, 'google');
                                    }
                                }
                                loadStats(); // Reload stats behind scenes
                            } else {
                                alert("Failed to delete record.");
                                if (card) { card.style.opacity = '1'; card.style.pointerEvents = 'auto'; }
                            }
                        } catch(err) {
                            console.error("Delete failed", err);
                            alert("Delete failed.");
                            if (card) { card.style.opacity = '1'; card.style.pointerEvents = 'auto'; }
                        }
                    });
                });
            }
            bindActions();
        } catch (e) {
            area.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-tertiary);font-size:13px;">Failed to load results.</div>`;
        }
    }

    await loadStats();
    await loadResults();
}

// ── Template helpers ──────────────────────────────────────────────────────────

function statCard(id, label, val, small = false) {
    return `
    <div class="card goog-stat-card">
        <div class="goog-stat-label">${label}</div>
        <div class="goog-stat-val${small ? ' goog-stat-val--sm' : ''}" id="${id}">${val}</div>
    </div>`;
}

function resultCard(r) {
    const kws = Array.isArray(r.keywords) ? r.keywords : [];
    let domain = '';
    try { domain = new URL(r.link).hostname.replace('www.', ''); } catch (e) { domain = 'google.com'; }
    
    const isActive = isBookmarked(r.link) ? 'active' : '';

    return `
    <div class="goog-result-card">
        <div style="display:flex; flex-direction:column; flex:1;">
            <a href="${r.link}" target="_blank" rel="noopener" class="goog-rc-wrapper-link" style="padding-bottom:12px;">
                <div class="goog-rc-breadcrumb">
                    <div class="goog-rc-favicon">
                       <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" alt="">
                    </div>
                    <div class="goog-rc-domain">
                       <div class="goog-rc-domain-name">${esc(domain)}</div>
                       <div class="goog-rc-domain-path">${esc(r.link)}</div>
                    </div>
                    <i data-lucide="external-link" style="width:14px;height:14px;margin-left:6px;opacity:0.5;"></i>
                </div>
                <h3 class="goog-rc-title">${esc(r.title || 'Untitled Result')}</h3>
            </a>
            <div class="goog-rc-desc">
                ${r.description ? esc(r.description) : esc(r.page_excerpt || 'No description available')}
            </div>
            
            <div class="goog-rc-bottom" style="margin-top:auto; display:flex; justify-content:space-between; align-items:center;">
                <div class="goog-rc-tags">
                    ${r.search_query ? `<span class="goog-rc-tag query">${esc(r.search_query)}</span>` : ''}
                    ${kws.slice(0, 3).map(k => `<span class="goog-rc-tag">${esc(k)}</span>`).join('')}
                    ${r.is_pdf ? `<span class="goog-rc-badge">PDF</span>` : ''}
                </div>
                
                <div style="display:flex; gap:8px;">
                    <button class="btn-icon view-btn" style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.05); color:var(--text-secondary); cursor:pointer;" onclick="window.open('${esc(r.link)}', '_blank')">
                        <i data-lucide="external-link" style="width:16px;height:16px;"></i>
                    </button>
                    <button class="btn-icon bookmark-btn ${isActive}" data-google='${JSON.stringify(r).replace(/'/g, "&#39;")}' style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.05); color:var(--text-secondary); cursor:pointer;" title="Bookmark">
                        <i data-lucide="bookmark" style="width:16px;height:16px;"></i>
                    </button>
                    ${r.id ? `
                    <button class="btn-icon delete-btn" data-id="${r.id}" title="Permanently Delete" style="background:rgba(255,50,50,0.1); color:var(--accent-red, #ef4444); cursor:pointer; width:36px;height:36px;border-radius:10px; border:none;">
                        <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
                    </button>` : ''}
                </div>
            </div>
        </div>
    </div>`;
}

function emptyState() {
    return `
    <div class="card" style="text-align:center;padding:80px 40px;color:var(--text-tertiary);">
        <i data-lucide="search-x" style="width:40px;height:40px;opacity:0.3;"></i>
        <p style="margin-top:16px;font-size:14px;font-weight:600;">No results found in Database.</p>
        <p style="font-size:13px;margin-top:6px;">Run 'python google.py' in your backend terminal to scrape data.</p>
    </div>`;
}

function buildDateQS(state) {
    const parts = [];
    if (state.dateFrom) parts.push(`date_from=${state.dateFrom}`);
    if (state.dateTo)   parts.push(`date_to=${state.dateTo}`);
    return parts.join('&');
}

function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}
function fmtNum(n) {
    return Number(n).toLocaleString();
}
function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateLabel(dk) {
    if (!dk || dk === 'unknown') return 'Unknown Date';
    const [y, m, d] = dk.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
}

// ============================================
// LEONEX TENDER — Generic Source Template
// Fetches REAL data from FastAPI backend
// Columns: Tender ID · Description · Start Date · End Date · Location · Link
// Export button → downloads Excel from API
// ============================================

import { toggleBookmark, isBookmarked } from '../utils/BookmarkStore.js';
import { getApiBase, authFetch } from '../utils/api.js';

export async function renderSourcePage(container, config) {
    // ── Loading state ─────────────────────────────────────────────────────
    container.innerHTML = `
        <div class="page-header anim-in">
            <div class="page-header-text">
                <h1>${config.name}</h1>
                <p>${config.description}</p>
            </div>
            <div class="page-header-actions">
                <button class="btn-primary" id="sp-export-btn">
                    <i data-lucide="download" style="width:14px;height:14px;"></i> Export Excel
                </button>
            </div>
        </div>

        <div class="metrics-row anim-in anim-d1" id="sp-stats-row">
            ${_statsSkeletons()}
        </div>

        <div class="table-card anim-in anim-d2" style="margin-top:32px;">
            <div class="table-header-filters" style="gap:16px;">
                <div class="search-box">
                    <i data-lucide="search" style="width:16px;height:16px;"></i>
                    <input type="text" id="sp-search" placeholder="Search ${config.name} tenders...">
                </div>
            </div>
            <div id="sp-table-area">
                ${_loadingSpinner()}
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // ── Fetch stats ────────────────────────────────────────────────────────
    _loadStats(container, config.source);

    // ── Fetch tenders ──────────────────────────────────────────────────────
    let allTenders = [];
    try {
        const res  = await authFetch(`${getApiBase()}/tenders?source=${config.source}&limit=500`, { cache: "no-store" });
        const data = await res.json();
        allTenders = data.results || [];
    } catch (err) {
        console.error('API error:', err);
    }
    _renderTable(container, allTenders, config);

    // ── Live search ─────────────────────────────────────────────────────────
    const searchInput = container.querySelector('#sp-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const q = searchInput.value.toLowerCase();
            const filtered = allTenders.filter(t =>
                (t.title || '').toLowerCase().includes(q) ||
                (t.description || '').toLowerCase().includes(q) ||
                (t.tender_id || '').toLowerCase().includes(q) ||
                (t.location || '').toLowerCase().includes(q)
            );
            _renderTable(container, filtered, config);
        });
    }



    // ── Export button ────────────────────────────────────────────────────────
    const exportBtn = container.querySelector('#sp-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            const url = `${getApiBase()}/export?source=${config.source}`;
            const a = document.createElement('a');
            a.href = url;
            a.download = `${config.source}_tenders.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    }
}


// ── Helpers ──────────────────────────────────────────────────────────────────
function _statsSkeletons() {
    return ['purple', 'green', 'orange', 'blue'].map(c => `
        <div class="stat-card card card-hover">
            <div class="stat-icon ${c}"><i data-lucide="loader"></i></div>
            <div class="stat-value">—</div>
            <div class="stat-label">Loading…</div>
        </div>`).join('');
}

function _loadingSpinner() {
    return `<div style="text-align:center;padding:60px;color:var(--text-tertiary);">
        <i data-lucide="loader" style="width:32px;height:32px;animation:spin 1s linear infinite;"></i>
        <p style="margin-top:12px;font-size:14px;">Fetching tenders from database…</p>
    </div>`;
}

async function _loadStats(container, source) {
    try {
        const res  = await authFetch(`${getApiBase()}/stats`, { cache: "no-store" });
        const data = await res.json();
        const total    = data.tenders_by_source?.[source] ?? 0;
        const allTotal = data.total_tenders ?? 0;
        const statsRow = container.querySelector('#sp-stats-row');
        if (!statsRow) return;
        statsRow.innerHTML = `
            <div class="stat-card card card-hover bg-palette-1" style="min-height:150px; justify-content:space-between; overflow:hidden;">
                <i data-lucide="file-text" style="color:currentColor; width:26px; height:26px;"></i>
                <div>
                    <div class="solid-text-value">${total}</div>
                    <div class="solid-text-label">Total Listings</div>
                </div>
            </div>
            <div class="stat-card card card-hover bg-palette-2" style="min-height:150px; justify-content:space-between; overflow:hidden;">
                <i data-lucide="database" style="color:currentColor; width:26px; height:26px;"></i>
                <div>
                    <div class="solid-text-value">${allTotal}</div>
                    <div class="solid-text-label">All Sources Total</div>
                </div>
            </div>
            <div class="stat-card card card-hover bg-palette-3" style="min-height:150px; justify-content:space-between; overflow:hidden;">
                <i data-lucide="clock" style="width:26px; height:26px;"></i>
                <div>
                    <div class="solid-text-value">${data.last_scraped ? _fmtDate(data.last_scraped) : '—'}</div>
                    <div class="solid-text-label">Last Scraped</div>
                </div>
            </div>
            <div class="stat-card card card-hover bg-palette-4" style="min-height:150px; justify-content:space-between; overflow:hidden;">
                <i data-lucide="zap" style="color:currentColor; width:26px; height:26px;"></i>
                <div>
                    <div class="solid-text-value">${Object.keys(data.tenders_by_source ?? {}).length}</div>
                    <div class="solid-text-label">Active Sources</div>
                </div>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
    } catch (e) {
        console.warn('Stats fetch failed:', e);
    }
}

function _renderTable(container, tenders, config) {
    const area = container.querySelector('#sp-table-area');
    if (!area) return;

    if (!tenders || tenders.length === 0) {
        area.innerHTML = `
            <div style="text-align:center;padding:60px;color:var(--text-tertiary);">
                <i data-lucide="inbox" style="width:40px;height:40px;opacity:0.4;"></i>
                <p style="margin-top:12px;font-size:14px;">No tenders found for this source. Scrapers are managed via the <strong>Admin Portal</strong>.</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    area.innerHTML = `
        <div class="tender-cards-grid">
            ${tenders.map(t => {
                const keyword = (t.keyword || t.matched_keyword || '—');
                const isActive = isBookmarked(t.tender_id) ? 'active' : '';
                return `
                <div class="tender-card">
                    <div class="tender-card-top">
                        <div class="tender-card-id">
                            <span class="tc-id-label">Tender ID :</span>
                            ${_esc(t.tender_id || '—')}
                        </div>
                        <div class="tender-card-dates">
                            <span class="tc-date"><i data-lucide="calendar" style="width:11px;height:11px;"></i> ${t.start_date || '—'}</span>
                            <span class="tc-date-sep">→</span>
                            <span class="tc-date end"><i data-lucide="clock" style="width:11px;height:11px;"></i> ${t.end_date || '—'}</span>
                        </div>
                    </div>
                    <div class="tender-card-desc">
                        ${_esc(t.title || t.description || '—')}
                    </div>
                    <div class="tender-card-bottom">
                        <div class="tender-card-tags">
                            <span class="tc-tag keyword"><i data-lucide="tag" style="width:10px;height:10px;"></i> ${_esc(keyword)}</span>
                            <span class="tc-tag source">${_esc((t.source||config.source||'').toUpperCase())}</span>
                            <span class="tc-tag location"><i data-lucide="map-pin" style="width:10px;height:10px;"></i> ${_esc(t.location || '—')}</span>
                        </div>
                        <div class="tender-card-link" style="display:flex; gap:8px; align-items:center;">
                            <button class="btn-icon bookmark-btn ${isActive}" data-tender='${JSON.stringify(t).replace(/'/g, "&#39;")}' title="Bookmark">
                                <i data-lucide="bookmark" style="width:18px;height:18px;"></i>
                            </button>
                            <button class="btn-icon delete-btn" data-id="${t.id}" title="Permanently Delete" style="background:rgba(255,50,50,0.1); color:var(--accent-red, #ef4444); cursor:pointer;">
                                <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
                            </button>
                            ${t.link
                                ? '<a href="' + t.link + '" target="_blank" rel="noopener" class="tc-link-btn"><i data-lucide="external-link" style="width:13px;height:13px;"></i> View</a>'
                                : '<span class="tc-no-link">—</span>'
                            }
                        </div>
                    </div>
                </div>`;
            }).join('')}
        </div>
        <div class="pagination-area" style="padding:16px 0;">
            <div class="pagination-info">Showing ${tenders.length} tender${tenders.length !== 1 ? 's' : ''}</div>
        </div>`;
    if (window.lucide) window.lucide.createIcons();

    const bmBtns = area.querySelectorAll('.bookmark-btn');
    bmBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const b = e.currentTarget;
            const tenderObj = JSON.parse(b.getAttribute('data-tender'));
            const isNowSaved = toggleBookmark(tenderObj);
            if (isNowSaved) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
    });

    const delBtns = area.querySelectorAll('.delete-btn');
    delBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const b = e.currentTarget;
            const id = b.getAttribute('data-id');
            if(!confirm("Are you sure you want to permanently delete this tender from the database?")) return;
            
            const card = b.closest('.tender-card');
            if (card) {
                card.style.opacity = '0.5';
                card.style.pointerEvents = 'none';
            }

            try {
                const res = await authFetch(`${getApiBase()}/tenders/${id}`, { cache: "no-store", method: 'DELETE' });
                if (res.ok) {
                    if (card) card.remove();
                } else {
                    alert("Failed to delete tender.");
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

function _esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

// ============================================
// LEONEX TENDER — All Tenders Page
// Fetches REAL data from FastAPI backend
// ============================================

import { toggleBookmark, isBookmarked } from '../utils/BookmarkStore.js';

import { getApiBase, authFetch } from '../utils/api.js';

export async function renderTenders(container) {
    container.innerHTML = `
        <div class="page-header anim-in" id="tenders-header">
            <div class="page-header-text">
                <div style="display:flex; align-items:center; gap:12px;">
                    <h1>All Tenders</h1>
                    <span id="total-tender-badge" class="count-badge">Calculating...</span>
                </div>
                <p>Browse and manage all tender opportunities across platforms</p>
            </div>
            <div class="page-header-actions">
                <button class="btn-secondary" id="all-refresh-btn"><i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> Refresh</button>
                <button class="btn-secondary" id="all-export-btn" style="gap:6px;"><i data-lucide="download" style="width:14px;height:14px;"></i> Export</button>
            </div>
        </div>

        <div class="table-card anim-in anim-d1" style="margin-top:24px;">
            <div class="table-header-filters" style="gap:20px; display:flex; align-items:center;">
                <div class="search-box" style="flex:2;">
                    <i data-lucide="search" style="width:18px;height:18px;"></i>
                    <input type="text" id="all-search" placeholder="Search across all tenders and sources..." style="padding:12px 16px 12px 42px; font-size:15px;">
                </div>
                <div class="advanced-filters" style="display:flex; gap:12px; flex-shrink:0;">
                    <select id="filter-keyword" class="premium-select">
                        <option value="ALL">All Keywords</option>
                    </select>
                    <select id="filter-source" class="premium-select">
                        <option value="ALL">All Sources</option>
                        <option value="GEM">GEM Portal</option>
                        <option value="TENDERONTIME">TenderOnTime</option>
                        <option value="TENDERDETAIL">TenderDetail</option>
                        <option value="TENDER247">Tender247</option>
                        <option value="BIDDETAIL">BidTenders</option>
                    </select>
                </div>
            </div>
            <div id="all-table-area">
                <div style="text-align:center;padding:60px;color:var(--text-tertiary);">
                    <i data-lucide="loader" style="width:32px;height:32px;animation:spin 1s linear infinite;"></i>
                    <p style="margin-top:12px;font-size:14px;">Loading database...</p>
                </div>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // Fetch data
    let allTenders = [];
    let currentLimit = 500;
    let currentOffset = 0;
    let totalAvailable = 0;
    const badge = container.querySelector('#total-tender-badge');

    async function loadData(append = false) {
        try {
            const res = await authFetch(`${getApiBase()}/tenders?limit=${currentLimit}&offset=${currentOffset}`, { cache: "no-store" });
            const data = await res.json();
            
            if (append) {
                allTenders = [...allTenders, ...(data.results || [])];
            } else {
                allTenders = data.results || [];
            }
            
            totalAvailable = data.total || 0;
            if (badge) {
                badge.textContent = totalAvailable.toLocaleString();
            }
            
            updateKeywordDropdown();
            applyFilters();
        } catch (err) {
            console.error('API error:', err);
            if (badge) badge.textContent = '—';
        }
    }

    const renderTable = (dataToRender) => {
        const area = container.querySelector('#all-table-area');
        if (!area) return;

        if (dataToRender.length === 0 && allTenders.length === 0) {
           area.innerHTML = `
               <div style="text-align:center;padding:60px;color:var(--text-tertiary);">
                   <i data-lucide="inbox" style="width:40px;height:40px;opacity:0.4;"></i>
                   <p style="margin-top:12px;font-size:14px;">No tenders found. Sync sources to begin.</p>
               </div>`;
           if (window.lucide) window.lucide.createIcons();
           return;
        }

        const hasMore = allTenders.length < totalAvailable;

        area.innerHTML = `
            <div class="tender-cards-grid">
                ${dataToRender.map(t => {
                    const keyword = (t.keyword || t.matched_keyword || '—');
                    const isActive = isBookmarked(t.tender_id) ? 'active' : '';
                    return `
                    <div class="tender-card">
                        <div class="tender-card-top">
                            <div class="tender-card-id">
                                <span class="tc-id-label">Tender ID :</span>
                                ${esc(t.tender_id || '—')}
                            </div>
                            <div class="tender-card-dates">
                                <span class="tc-date"><i data-lucide="calendar" style="width:11px;height:11px;"></i> ${t.start_date || '—'}</span>
                                <span class="tc-date-sep">→</span>
                                <span class="tc-date end"><i data-lucide="clock" style="width:11px;height:11px;"></i> ${t.end_date || '—'}</span>
                            </div>
                        </div>

                        <div class="tender-card-desc">
                            ${esc(t.title || t.description || '—')}
                        </div>

                        <div class="tender-card-bottom">
                            <div class="tender-card-tags">
                                <span class="tc-tag keyword"><i data-lucide="tag" style="width:10px;height:10px;"></i> ${esc(keyword)}</span>
                                <span class="tc-tag source">${esc((t.source||'').toUpperCase())}</span>
                                <span class="tc-tag location"><i data-lucide="map-pin" style="width:10px;height:10px;"></i> ${esc(t.location || '—')}</span>
                            </div>
                            <div class="tender-card-link" style="display:flex; gap:8px; align-items:center;">
                                <button class="btn-icon bookmark-btn ${isActive}" data-tender='${JSON.stringify(t).replace(/'/g, "&#39;")}' title="Bookmark">
                                    <i data-lucide="bookmark" style="width:18px;height:18px;"></i>
                                </button>
                                <button class="btn-icon delete-btn" data-id="${t.id}" title="Permanently Delete" style="background:rgba(255,50,50,0.1); color:var(--accent-red, #ef4444); cursor:pointer;">
                                    <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
                                </button>
                                <a href="#/tender-view?id=${t.id}" class="tc-link-btn secondary" style="background: rgba(255,255,255,0.05); color: var(--text-primary);">
                                    <i data-lucide="info" style="width:13px;height:13px;"></i> Details
                                </a>
                                ${t.link
                                    ? '<a href="' + t.link + '" target="_blank" rel="noopener" class="tc-link-btn"><i data-lucide="external-link" style="width:13px;height:13px;"></i> View</a>'
                                    : '<span class="tc-no-link">—</span>'
                                }
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
            <div class="pagination-area" style="padding:24px 0; display:flex; flex-direction:column; align-items:center; gap:12px;">
                <div class="pagination-info" style="color:var(--text-tertiary); font-size:13px;">Showing <strong>${dataToRender.length}</strong> of <strong>${totalAvailable}</strong> tenders</div>
                ${hasMore ? `
                    <button class="btn-secondary" id="load-more-btn" style="padding:10px 24px; font-weight:600;">
                        <i data-lucide="arrow-down-circle" style="width:16px;height:16px;"></i> Load More Results
                    </button>
                ` : ''}
            </div>`;
        if (window.lucide) window.lucide.createIcons();

        // Bind Load More
        container.querySelector('#load-more-btn')?.addEventListener('click', () => {
            currentOffset += currentLimit;
            loadData(true);
        });

        // Bind bookmark buttons
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

        // Bind delete buttons
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
                        allTenders = allTenders.filter(t => t.id !== id);
                        totalAvailable--;
                        if (badge) badge.textContent = totalAvailable.toLocaleString();
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
    };

    const searchInput = container.querySelector('#all-search');
    const filterSourceEl = container.querySelector('#filter-source');
    const keywordSelect = container.querySelector('#filter-keyword');
    
    let currentKeyword = 'ALL';

    function applyFilters() {
        let filtered = [...allTenders];
        
        if (currentKeyword !== 'ALL') {
            filtered = filtered.filter(t => {
                const tk = (t.keyword || t.matched_keyword || '').toLowerCase().trim();
                return tk === currentKeyword.toLowerCase();
            });
        }

        if (filterSourceEl && filterSourceEl.value !== 'ALL') {
            const src = filterSourceEl.value.toLowerCase();
            filtered = filtered.filter(t => (t.source || '').toLowerCase() === src);
        }
        
        if (searchInput && searchInput.value) {
            const q = searchInput.value.toLowerCase();
            filtered = filtered.filter(t => 
                (t.title || t.description || '').toLowerCase().includes(q) ||
                (t.tender_id || '').toLowerCase().includes(q) ||
                (t.source || '').toLowerCase().includes(q) ||
                (t.location || '').toLowerCase().includes(q)
            );
        }
        
        renderTable(filtered);
    }

    function updateKeywordDropdown() {
        if (!keywordSelect) return;
        const previousValue = keywordSelect.value;
        const uniqueKWs = [...new Set(
            allTenders
                .map(t => t.keyword || t.matched_keyword)
                .filter(k => k && k.trim() !== '')
                .map(k => k.trim())
        )].sort();

        keywordSelect.innerHTML = `
            <option value="ALL">All Keywords</option>
            ${uniqueKWs.map(kw => `<option value="${kw}">${kw}</option>`).join('')}
        `;
        // Restore selection if it still exists
        if (uniqueKWs.includes(previousValue)) {
            keywordSelect.value = previousValue;
        } else {
            keywordSelect.value = 'ALL';
            currentKeyword = 'ALL';
        }
    }

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (filterSourceEl) filterSourceEl.addEventListener('change', applyFilters);
    if (keywordSelect) {
        keywordSelect.addEventListener('change', (e) => {
            currentKeyword = e.target.value;
            applyFilters();
        });
    }

    const refreshBtn = container.querySelector('#all-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => { 
        currentOffset = 0;
        loadData(false); 
    });

    const exportBtn = container.querySelector('#all-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            window.open(`${getApiBase()}/export`, '_blank');
        });
    }

    // Initial load
    await loadData();
}

function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

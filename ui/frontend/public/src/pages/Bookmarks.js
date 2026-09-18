import { getApiBase, authFetch } from '../utils/api.js';
import { getBookmarks, toggleBookmark, isBookmarked } from '../utils/BookmarkStore.js';

export async function renderBookmarks(container) {
    container.innerHTML = `
        <div class="page-header anim-in" style="flex-direction:row; justify-content:space-between; align-items:flex-end;">
            <div class="page-header-text">
                <h1>Bookmarks</h1>
                <p>Manage and track your saved opportunities</p>
            </div>
            
            <div class="goog-tabs" id="bm-type-tabs" style="background:var(--bg-card); border:1px solid var(--border-glass);">
                <button class="goog-tab active" data-type="tender">
                    <i data-lucide="briefcase" style="width:14px;height:14px;"></i> Tenders
                </button>
                <button class="goog-tab" data-type="google">
                    <i data-lucide="globe" style="width:14px;height:14px;"></i> Google Results
                </button>
            </div>
        </div>

        <div class="table-card anim-in anim-d1" style="margin-top:24px;">
            <div class="table-header-filters" style="gap:20px; display:flex; align-items:center;">
                <div class="search-box" style="flex:2;">
                    <i data-lucide="search" style="width:18px;height:18px;"></i>
                    <input type="text" id="bm-search" placeholder="Search your saved items..." style="padding:12px 16px 12px 42px; font-size:15px;">
                </div>
                <div style="flex-shrink:0;">
                    <select id="bm-sort" class="goog-inp">
                        <option value="newest">Latest Date First</option>
                        <option value="oldest">Oldest Date First</option>
                    </select>
                </div>
            </div>
            <div id="bm-table-area" style="margin-top:20px;"></div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    let savedData = getBookmarks();
    let state = { type: 'tender', search: '', sort: 'newest' };

    // --- Tab Switcher ---
    const tabs = container.querySelectorAll('.goog-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.type = tab.dataset.type;
            applyFilters();
        });
    });

    // --- Filter Handlers ---
    const searchInput = container.querySelector('#bm-search');
    const sortInput = container.querySelector('#bm-sort');

    searchInput?.addEventListener('input', () => { state.search = searchInput.value.toLowerCase().trim(); applyFilters(); });
    sortInput?.addEventListener('change', () => { state.sort = sortInput.value; applyFilters(); });

    function applyFilters() {
        savedData = getBookmarks(); // always fresh
        
        // 1. Filter by Type
        let filtered = savedData.filter(item => {
            // Legacy items might not have _bookType, assume they are tenders
            const type = item._bookType || 'tender';
            return type === state.type;
        });

        // 2. Filter by Search Query
        if (state.search) {
            filtered = filtered.filter(t => 
                (t.title || '').toLowerCase().includes(state.search) ||
                (t.description || t.page_excerpt || '').toLowerCase().includes(state.search) ||
                (t.tender_id || '').toLowerCase().includes(state.search) ||
                (t.source || '').toLowerCase().includes(state.search) ||
                (t.location || '').toLowerCase().includes(state.search)
            );
        }

        // 3. Proper Date Sorting
        filtered.sort((a, b) => {
            // Find the most appropriate date field from the object
            const dateA = a.start_date || a.scraped_at || a.created_at || '';
            const dateB = b.start_date || b.scraped_at || b.created_at || '';
            
            if (state.sort === 'newest') {
                return dateB.localeCompare(dateA); // Newest descending
            } else {
                return dateA.localeCompare(dateB); // Oldest ascending
            }
        });

        renderTable(filtered);
    }

    function renderTable(dataToRender) {
        const area = container.querySelector('#bm-table-area');
        if (!area) return;

        if (dataToRender.length === 0) {
           area.innerHTML = `
               <div style="text-align:center;padding:60px;color:var(--text-tertiary);">
                   <i data-lucide="bookmark-minus" style="width:40px;height:40px;opacity:0.4;"></i>
                   <p style="margin-top:12px;font-size:14px;">No saved ${state.type === 'google' ? 'Google Results' : 'Tenders'} found.</p>
               </div>`;
           if (window.lucide) window.lucide.createIcons();
           return;
        }

        if (state.type === 'tender') {
            area.innerHTML = `
                <div class="tender-cards-grid">
                    ${dataToRender.map(t => renderTenderCard(t)).join('')}
                </div>`;
        } else {
            area.innerHTML = `
                <div class="goog-cards-grid">
                    ${dataToRender.map(r => renderGoogleCard(r)).join('')}
                </div>`;
        }

        if (window.lucide) window.lucide.createIcons();

        // Bind bookmark buttons for whatever just rendered
        const bmBtns = area.querySelectorAll('.bookmark-btn');
        bmBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const b = e.currentTarget;
                const attr = state.type === 'tender' ? 'data-tender' : 'data-google';
                const obj = JSON.parse(b.getAttribute(attr));
                toggleBookmark(obj, state.type);
                applyFilters(); // Re-render immediately
            });
        });

        // Bind delete buttons
        const delBtns = area.querySelectorAll('.delete-btn');
        delBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const b = e.currentTarget;
                const id = b.getAttribute('data-id');
                const dtype = b.getAttribute('data-type'); // 'tender' or 'google'
                
                if(!confirm(`Are you sure you want to permanently delete this ${dtype} from the database?`)) return;
                
                const card = b.closest('.tender-card') || b.closest('.goog-result-card');
                if (card) {
                    card.style.opacity = '0.5';
                    card.style.pointerEvents = 'none';
                }

                try {
                    const endpoint = dtype === 'google' 
                        ? `${getApiBase()}/google/results/${id}`
                        : `${getApiBase()}/tenders/${id}`;
                        
                    const res = await authFetch(endpoint, { cache: "no-store", method: 'DELETE' });
                    if (res.ok) {
                        // Also auto-unbookmark it locally so it permanently drops from view
                        const attrStr = dtype === 'google' ? 'data-google' : 'data-tender';
                        const relatedBmBtn = card.querySelector(`[${attrStr}]`);
                        if (relatedBmBtn) {
                            const objForStore = JSON.parse(relatedBmBtn.getAttribute(attrStr));
                            // If it's saved, toggle to remove it
                            if (isBookmarked(objForStore.tender_id || objForStore.link)) {
                                toggleBookmark(objForStore, dtype);
                            }
                        }
                        if (card) card.remove();
                        applyFilters();
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

    function renderTenderCard(t) {
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
                <div class="tender-card-link" style="display:flex; gap:12px; align-items:center;">
                    <span style="font-size:11px; color:var(--text-tertiary); margin-right:4px;">Scraped: ${formatScrapeDate(t.created_at || t.start_date)}</span>
                    <button class="btn-icon bookmark-btn ${isActive}" data-tender='${JSON.stringify(t).replace(/'/g, "&#39;")}' style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.05); color:var(--text-secondary); cursor:pointer;" title="Bookmark">
                        <i data-lucide="bookmark" style="width:18px;height:18px;"></i>
                    </button>
                    ${t.id ? `
                    <button class="btn-icon delete-btn" data-id="${t.id}" data-type="tender" title="Permanently Delete" style="background:rgba(255,50,50,0.1); color:var(--accent-red, #ef4444); cursor:pointer; width:36px;height:36px;border-radius:10px; border:none;">
                        <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
                    </button>` : ''}
                    ${t.link
                        ? '<a href="' + t.link + '" target="_blank" rel="noopener" class="tc-link-btn"><i data-lucide="external-link" style="width:13px;height:13px;"></i> View</a>'
                        : '<span class="tc-no-link">—</span>'
                    }
                </div>
            </div>
        </div>`;
    }

    function renderGoogleCard(r) {
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
                <div class="goog-rc-desc" style="padding:0 24px;">
                    ${r.description ? esc(r.description) : esc(r.page_excerpt || 'No description available')}
                </div>
                
                <div class="goog-rc-bottom" style="margin-top:auto; padding:16px 24px; display:flex; justify-content:space-between; align-items:center;">
                    <div class="goog-rc-tags">
                        ${r.search_query ? `<span class="goog-rc-tag query">${esc(r.search_query)}</span>` : ''}
                        ${kws.slice(0, 3).map(k => `<span class="goog-rc-tag">${esc(k)}</span>`).join('')}
                        ${r.is_pdf ? `<span class="goog-rc-badge">PDF</span>` : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="font-size:11px; color:var(--text-tertiary);">Scraped: ${formatScrapeDate(r.scraped_at)}</span>
                        <button class="btn-icon bookmark-btn ${isActive}" data-google='${JSON.stringify(r).replace(/'/g, "&#39;")}' style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.05); color:var(--text-secondary); cursor:pointer; flex-shrink:0; border:none;" title="Bookmark">
                            <i data-lucide="bookmark" style="width:16px;height:16px;"></i>
                        </button>
                        ${r.id ? `
                        <button class="btn-icon delete-btn" data-id="${r.id}" data-type="google" title="Permanently Delete" style="background:rgba(255,50,50,0.1); color:var(--accent-red, #ef4444); cursor:pointer; width:36px;height:36px;border-radius:10px; border:none; flex-shrink:0;">
                            <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
                        </button>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
    }

    // Initial load
    applyFilters();
}

function formatScrapeDate(iso) {
    if (!iso) return 'Unknown';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso; // fallback if it's already a string 
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

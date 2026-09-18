// ============================================
// LEONEX TENDER — MDM Tenders (Pro Filter UI)
// Single filter card + date-range export
// ============================================

import { toggleBookmark, isBookmarked } from '../utils/BookmarkStore.js';

import { getApiBase, authFetch } from '../utils/api.js';

export async function renderMDMTenders(container) {

    // ── State ──────────────────────────────────
    let allTenders = [];
    let state = {
        dateFrom      : '',
        dateTo        : '',
        selectedSource  : 'all',
        selectedKeyword : 'all',
        searchQuery     : '',
        tenderId        : '',
    };

    // ── Helpers ────────────────────────────────
    function esc(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function toLocalDateKey(isoStr) {
        if (!isoStr) return null;
        const d = new Date(isoStr);
        if (isNaN(d)) return null;
        return d.toISOString().slice(0, 10);
    }
    function fmtDateLabel(dateKey) {
        if (!dateKey) return '—';
        const [y, m, d] = dateKey.split('-');
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
    }

    function getFiltered() {
        return allTenders.filter(t => {
            const dk = toLocalDateKey(t.created_at || t.scraped_at) || '';
            if (state.dateFrom && dk && dk < state.dateFrom) return false;
            if (state.dateTo   && dk && dk > state.dateTo)   return false;
            if (state.selectedSource !== 'all') {
                if ((t.source || '').toLowerCase() !== state.selectedSource) return false;
            }
            if (state.selectedKeyword !== 'all') {
                const kw = (t.keyword || t.matched_keyword || '').toLowerCase();
                if (kw !== state.selectedKeyword) return false;
            }
            if (state.tenderId) {
                if (!(t.tender_id || '').toLowerCase().includes(state.tenderId.toLowerCase())) return false;
            }
            if (state.searchQuery) {
                const q = state.searchQuery.toLowerCase();
                const blob = `${t.title||''} ${t.description||''} ${t.tender_id||''}`.toLowerCase();
                if (!blob.includes(q)) return false;
            }
            return true;
        });
    }

    // ── Scaffold ───────────────────────────────
    container.innerHTML = `
        <div class="page-header anim-in">
            <div class="page-header-text">
                <h1>MDM Tenders</h1>
                <p>Filter, search and export Material Codification tenders.</p>
            </div>
        </div>

        <!-- FILTER CARD -->
        <div class="card anim-in anim-d1" style="padding:20px 24px 20px; margin-bottom:20px;">

            <!-- Row 1: Source + Search -->
            <div class="mdm-fr1">
                <div class="mdm-fc-field" style="flex:1;">
                    <label class="mdm-fl">Select Source of Tender</label>
                    <select id="mdm-source-sel" class="mdm-fsel">
                        <option value="all">All Sources</option>
                    </select>
                </div>
                <div class="mdm-fc-field" style="flex:2;">
                    <label class="mdm-fl">Search Tenders</label>
                    <input type="text" id="mdm-search-input" class="mdm-finp" placeholder="Search title, description, ID...">
                </div>
            </div>

            <!-- Row 2: Keyword, ID, From, To, Buttons -->
            <div class="mdm-fr2">
                <div class="mdm-fc-field">
                    <label class="mdm-fl">Select Keyword</label>
                    <select id="mdm-kw-sel" class="mdm-fsel">
                        <option value="all">All Keywords</option>
                    </select>
                </div>
                <div class="mdm-fc-field">
                    <label class="mdm-fl">Tender ID</label>
                    <input type="text" id="mdm-id-input" class="mdm-finp" placeholder="Enter Tender ID">
                </div>
                <div class="mdm-fc-field">
                    <label class="mdm-fl">Date From</label>
                    <input type="date" id="mdm-date-from" class="mdm-finp">
                </div>
                <div class="mdm-fc-field">
                    <label class="mdm-fl">Date To</label>
                    <input type="date" id="mdm-date-to" class="mdm-finp">
                </div>
                <div class="mdm-fc-field mdm-fc-btns">
                    <label class="mdm-fl">&nbsp;</label>
                    <div style="display:flex; gap:8px;">
                        <button id="mdm-search-btn" class="mdm-btn-search">Search</button>
                        <button id="mdm-export-btn" class="mdm-btn-export">Export</button>
                        <button id="mdm-clear-all" class="mdm-btn-clear">Clear</button>
                    </div>
                </div>
            </div>

            <div class="mdm-fc-res-row">
                <div id="mdm-result-count" class="mdm-fc-res-label"></div>
            </div>
        </div>

        <!-- TENDER LIST AREA -->
        <div class="anim-in anim-d2" style="margin-top: 20px;">
            <div id="mdm-table-area">
                <div style="text-align:center;padding:48px;color:var(--text-tertiary);">
                    <p style="font-size:14px;">Fetching MDM Tenders...</p>
                </div>
            </div>
        </div>
    `;


    if (window.lucide) window.lucide.createIcons();

    // ── Fetch Data ─────────────────────────────
    try {
        const r = await authFetch(`${getApiBase()}/tenders?limit=1000`, { cache: "no-store" });
        const d = await r.json();
        allTenders = d.results || [];
    } catch(e) { console.warn('Fetch error', e); }

    // Populate sources & keywords
    const sources  = [...new Set(allTenders.map(t => (t.source || '').trim().toLowerCase()).filter(Boolean))].sort();
    const keywords = [...new Set(allTenders.map(t => (t.keyword || t.matched_keyword || '').trim().toLowerCase()).filter(Boolean))].sort();

    const srcSel = container.querySelector('#mdm-source-sel');
    const kwSel  = container.querySelector('#mdm-kw-sel');

    sources.forEach(s => {
        const o = document.createElement('option');
        o.value = s; o.textContent = s.toUpperCase();
        srcSel.appendChild(o);
    });
    keywords.forEach(k => {
        if (!k) return;
        const o = document.createElement('option');
        o.value = k; o.textContent = k;
        kwSel.appendChild(o);
    });

    // ── Render ─────────────────────────────────
    function renderTenders() {
        const filtered = getFiltered();
        const countEl  = container.querySelector('#mdm-result-count');
        if (countEl) {
            countEl.innerHTML = `Found <strong>${filtered.length}</strong> tender${filtered.length !== 1 ? 's' : ''} matching search`;
        }

        const area = container.querySelector('#mdm-table-area');
        if (!area) return;

        if (filtered.length === 0) {
            area.innerHTML = `
                <div class="card" style="text-align:center;padding:60px;color:var(--text-tertiary);">
                    <i data-lucide="search-x" style="width:36px;height:36px;opacity:0.3;"></i>
                    <p style="margin-top:16px;font-size:14px;font-weight:600;">No tenders match your filters.</p>
                </div>`;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        // Group by date
        const groups = {};
        filtered.forEach(t => {
            const dk = toLocalDateKey(t.created_at || t.scraped_at) || 'Unknown';
            if (!groups[dk]) groups[dk] = [];
            groups[dk].push(t);
        });
        const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

        area.innerHTML = sortedKeys.map(dk => `
            <div class="mdm-date-group">
                <div class="mdm-date-group-header">
                    <i data-lucide="calendar" style="width:14px;height:14px;"></i>
                    ${dk === 'Unknown' ? 'Unknown Date' : fmtDateLabel(dk)}
                    <span class="mdm-group-count">${groups[dk].length}</span>
                </div>
                <div class="tender-cards-grid">
                    ${groups[dk].map(m => tenderCardHTML(m)).join('')}
                </div>
            </div>
        `).join('');

        if (window.lucide) window.lucide.createIcons();
        bindBookmarks(area);
    }

    function tenderCardHTML(m) {
        const keyword  = esc(m.keyword || m.matched_keyword || '—');
        const isActive = isBookmarked(m.tender_id) ? 'active' : '';
        const dk = toLocalDateKey(m.created_at || m.scraped_at);
        return `
        <div class="tender-card">
            <div class="tender-card-top">
                <div class="tender-card-id">
                    <span class="tc-id-label">Tender ID:</span>
                    ${esc(m.tender_id || '—')}
                </div>
                <div class="tender-card-dates">
                    <span class="tc-date"><i data-lucide="calendar" style="width:11px;height:11px;"></i> ${m.start_date || '—'}</span>
                    <span class="tc-date-sep">→</span>
                    <span class="tc-date end"><i data-lucide="clock" style="width:11px;height:11px;"></i> ${m.end_date || '—'}</span>
                </div>
            </div>
            <div class="tender-card-desc">${esc(m.title || m.description || '—')}</div>
            <div class="tender-card-bottom">
                <div class="tender-card-tags">
                    <span class="tc-tag keyword"><i data-lucide="tag" style="width:10px;height:10px;"></i> ${keyword}</span>
                    <span class="tc-tag source">${esc((m.source||'').toUpperCase())}</span>
                    ${dk ? `<span class="tc-tag scraped-date"><i data-lucide="calendar-check" style="width:10px;height:10px;"></i> ${fmtDateLabel(dk)}</span>` : ''}
                </div>
                <div class="tender-card-link" style="display:flex; gap:8px; align-items:center;">
                    <button class="btn-icon bookmark-btn ${isActive}" data-tender='${JSON.stringify(m).replace(/'/g, "&#39;")}' title="Bookmark">
                        <i data-lucide="bookmark" style="width:18px;height:18px;"></i>
                    </button>
                    <button class="btn-icon delete-btn" data-id="${m.id}" title="Permanently Delete" style="background:rgba(255,50,50,0.1); color:var(--accent-red, #ef4444); cursor:pointer;">
                        <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
                    </button>
                    ${m.link
                        ? `<a href="${m.link}" target="_blank" rel="noopener" class="tc-link-btn"><i data-lucide="external-link" style="width:13px;height:13px;"></i> View</a>`
                        : '<span class="tc-no-link">—</span>'
                    }
                </div>
            </div>
        </div>`;
    }

    function bindBookmarks(area) {
        area.querySelectorAll('.bookmark-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const b = e.currentTarget;
                const obj = JSON.parse(b.getAttribute('data-tender'));
                const saved = toggleBookmark(obj);
                saved ? b.classList.add('active') : b.classList.remove('active');
            });
        });

        area.querySelectorAll('.delete-btn').forEach(btn => {
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
                        renderTenders(); // Refresh counts globally
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

    // ── Export (filtered) ──────────────────────
    function exportFiltered() {
        const filtered = getFiltered();
        if (filtered.length === 0) { alert('No tenders to export with current filters.'); return; }
        const params = new URLSearchParams();
        if (state.dateFrom) params.set('from', state.dateFrom);
        if (state.dateTo)   params.set('to',   state.dateTo);
        if (state.selectedSource !== 'all') params.set('source', state.selectedSource);
        if (state.keyword)  params.set('keyword', state.keyword);
        // Fallback: build CSV in browser from filtered data
        const headers = ['Tender ID','Title','Source','Keyword','Start Date','End Date','Link','Scraped Date'];
        const rows = filtered.map(t => [
            t.tender_id || '',
            (t.title || t.description || '').replace(/,/g, ';'),
            t.source || '',
            t.keyword || t.matched_keyword || '',
            t.start_date || '',
            t.end_date   || '',
            t.link       || '',
            toLocalDateKey(t.created_at || t.scraped_at) || ''
        ]);
        const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        const label = state.dateFrom || state.dateTo
            ? `${state.dateFrom || 'start'}_to_${state.dateTo || 'end'}`
            : 'all';
        a.href = url; a.download = `MDM_Tenders_${label}.csv`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    }

    // Events
    let searchTimer;
    container.querySelector('#mdm-search-input')?.addEventListener('input', e => {
        state.searchQuery = e.target.value.trim();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderTenders, 400); 
    });
    container.querySelector('#mdm-search-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            clearTimeout(searchTimer);
            renderTenders();
        }
    });
    container.querySelector('#mdm-kw-sel')?.addEventListener('change', e => { state.selectedKeyword = e.target.value; renderTenders(); });
    container.querySelector('#mdm-id-input')?.addEventListener('input', e => { 
        state.tenderId = e.target.value.trim(); 
    });
    container.querySelector('#mdm-id-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') renderTenders();
    });
    container.querySelector('#mdm-source-sel')?.addEventListener('change', e => { state.selectedSource = e.target.value; renderTenders(); });
    container.querySelector('#mdm-date-from')?.addEventListener('change', e => { state.dateFrom = e.target.value; renderTenders(); });
    container.querySelector('#mdm-date-to')?.addEventListener('change',   e => { state.dateTo   = e.target.value; renderTenders(); });
    container.querySelector('#mdm-search-btn')?.addEventListener('click', renderTenders);
    container.querySelector('#mdm-export-btn')?.addEventListener('click', exportFiltered);
    container.querySelector('#mdm-clear-all')?.addEventListener('click', () => {
        state = { dateFrom:'', dateTo:'', selectedSource:'all', selectedKeyword:'all', searchQuery:'', tenderId:'' };
        container.querySelector('#mdm-search-input').value = '';
        container.querySelector('#mdm-kw-sel').value       = 'all';
        container.querySelector('#mdm-id-input').value     = '';
        container.querySelector('#mdm-source-sel').value   = 'all';
        container.querySelector('#mdm-date-from').value    = '';
        container.querySelector('#mdm-date-to').value      = '';
        renderTenders();
    });

    if (window.lucide) window.lucide.createIcons();
    renderTenders();
}

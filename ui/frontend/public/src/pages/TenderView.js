// ============================================
// LEONEX TENDER — Tender Detailed View Page
// Minimalist "Procurement Summary" Style
// ============================================

import { toggleBookmark, isBookmarked } from '../utils/BookmarkStore.js';

import { getApiBase, authFetch } from '../utils/api.js';

export async function renderTenderView(container, query) {
    const params = new URLSearchParams(query);
    const tenderUuid = params.get('id');

    if (!tenderUuid) {
        container.innerHTML = `
            <div style="text-align:center;padding:100px;color:var(--text-tertiary);">
                <i data-lucide="alert-circle" style="width:48px;height:48px;opacity:0.5;"></i>
                <h2 style="margin-top:20px;">No Tender Selected</h2>
                <button class="btn-secondary" onclick="window.history.back()" style="margin-top:16px;">Go Back</button>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    container.innerHTML = `
        <div class="tender-view-layout anim-in">
            <div class="tv-header">
                <div class="tv-header-left">
                    <button class="btn-back" onclick="window.history.back()">
                        <i data-lucide="arrow-left" style="width:16px;height:16px;"></i>
                    </button>
                    <div class="tv-breadcrumb">
                        <span>Tenders</span>
                        <i data-lucide="chevron-right" style="width:12px;height:12px;"></i>
                        <span class="active">Details</span>
                    </div>
                </div>
                <div class="tv-header-actions" id="tv-actions-area"></div>
            </div>

            <div id="tv-content-area">
                <div style="text-align:center;padding:80px;">
                    <i data-lucide="loader" style="width:30px;height:30px;animation:spin 1s linear infinite;color:var(--accent-purple);"></i>
                </div>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    try {
        const res = await authFetch(`${getApiBase()}/tenders/${tenderUuid}`, { cache: "no-store" });
        if (!res.ok) throw new Error('Not found');
        const tender = await res.json();
        renderTenderData(container, tender);
    } catch (err) {
        container.querySelector('#tv-content-area').innerHTML = `
            <div style="text-align:center;padding:60px;">
                <p>Unable to load tender details.</p>
                <button class="btn-secondary" onclick="window.history.back()">Go Back</button>
            </div>
        `;
    }
}

function renderTenderData(container, t) {
    const area = container.querySelector('#tv-content-area');
    const actions = container.querySelector('#tv-actions-area');

    const isSaved = isBookmarked(t.tender_id);
    actions.innerHTML = `
        <button class="btn-icon bookmark-btn ${isSaved ? 'active' : ''}" id="tv-bookmark-btn" style="width:40px;height:40px;">
            <i data-lucide="bookmark" style="width:20px;height:20px;"></i>
        </button>
        ${t.link ? `<a href="${t.link}" target="_blank" class="btn-primary" style="padding:0 20px;height:40px;display:flex;align-items:center;">Visit Original link</a>` : ''}
    `;

    area.innerHTML = `
        <div class="tv-simple-container anim-in anim-d1">
            <h2 class="tv-section-heading">Procurement Summary</h2>
            
            <div class="tv-detail-list">
                <div class="tv-detail-row">
                    <span class="label">Country:</span>
                    <span class="value"><strong>${esc(t.location || '—')}</strong></span>
                </div>
                
                <div class="tv-detail-row">
                    <span class="label">Summary:</span>
                    <span class="value"><strong>${esc(t.title || '—')}</strong></span>
                </div>

                <div class="tv-detail-row">
                    <span class="label">Deadline:</span>
                    <span class="value"><strong>${esc(t.end_date || '—')}</strong></span>
                </div>

                <div class="tv-detail-row">
                    <span class="label">Posting Date:</span>
                    <span class="value"><strong>${t.start_date || (t.created_at ? t.created_at.split('T')[0] : '—')}</strong></span>
                </div>
                
                <div class="tv-detail-row">
                    <span class="label">Tender ID:</span>
                    <span class="value"><strong>${esc(t.tender_id || '—')}</strong></span>
                </div>

                <div class="tv-detail-row">
                    <span class="label">Source:</span>
                    <span class="value"><strong>${esc((t.source||'').toUpperCase())}</strong></span>
                </div>
            </div>

            <div class="tv-desc-block">
                <h3 class="tv-section-heading" style="margin-top:40px; margin-bottom:20px; font-size:16px;">Detailed Description</h3>
                <div class="tv-description-text">
                    ${formatDescription(t.description)}
                </div>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    container.querySelector('#tv-bookmark-btn').addEventListener('click', (e) => {
        const now = toggleBookmark(t);
        e.currentTarget.classList.toggle('active', now);
    });
}

function formatDescription(text) {
    if (!text) return '<p>No further details available.</p>';
    return text.split('\n').filter(p => p.trim()).map(p => 
        `<p style="margin-bottom:12px; font-size:14px; line-height:1.6; color:var(--text-secondary);">${esc(p)}</p>`
    ).join('');
}

function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

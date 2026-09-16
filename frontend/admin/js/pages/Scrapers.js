// ============================================================
// Admin Scrapers — Premium Mission Control
// ============================================================
import { getApiBase, adminFetch } from '../utils/api.js';

let pollTimer = null;

export async function renderScrapers(container) {
    container.innerHTML = `
        <div class="section-header anim-in">
            <div class="section-title">
                Scraper Control Panel
            </div>
            <div class="scraper-actions" style="margin-bottom:0; display:flex; align-items:center; gap:10px;">
                <button class="btn-refresh" id="adm-refresh" style="background:rgba(255,255,255,0.05); color:var(--text-secondary); border:1px solid rgba(255,255,255,0.1); border-radius:999px; padding:6px 12px; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:6px;" title="Refresh Data">
                    Refresh
                </button>
                <button class="btn-stop-all" id="adm-stop-all" disabled>
                    Stop All Engines
                </button>
                <button class="btn-sync-all" id="adm-sync-all">
                    Sync All Sources
                </button>
            </div>
        </div>


        <div class="scraper-list anim-in anim-d2" id="adm-scraper-grid">
            <div style="grid-column: 1 / -1; padding: 32px; text-align:center; color:var(--text-tertiary); font-size:12px; font-family:var(--font-mono); border:1px dashed var(--border-glass); border-radius:12px;">Initializing scraping telemetry...</div>
        </div>

        <div class="section-title anim-in anim-d3">
            Google Research Scraper
        </div>
        <div class="adm-card anim-in anim-d3" id="adm-google-panel">
            <div style="padding: 32px; text-align:center; color:var(--text-tertiary); font-size:12px; font-family:var(--font-mono); border:1px dashed var(--border-glass); border-radius:12px;">Initializing google engine core...</div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    loadScraperStatus();
    if (pollTimer) clearInterval(pollTimer);
    // Auto-refresh disabled to improve UI performance

    const obs = new MutationObserver(() => {
        if (!document.getElementById('adm-scraper-grid')) {
            if (pollTimer) clearInterval(pollTimer);
            obs.disconnect();
        }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    container.querySelector('#adm-refresh')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const icon = btn.querySelector('i');
        if (icon) icon.classList.add('spin');
        await loadScraperStatus();
        if (icon) icon.classList.remove('spin');
    });

    container.querySelector('#adm-sync-all')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = 'Syncing...';
        if (window.lucide) window.lucide.createIcons();

        const isHeadless = localStorage.getItem('admin_headless') !== 'false';
        const baseUrl = getApiBase();
        const sources = ['gem', 'tender247', 'tenderdetail', 'tenderontime', 'biddetail'];

        try {
            await Promise.all(sources.map(src =>
                adminFetch(`${baseUrl}/admin/scrapers/start?source=${src}&headless=${isHeadless}`, { method: 'POST' })
            ));
        } catch (err) { console.error(err); }

        btn.innerHTML = originalHTML;
        btn.disabled = false;
        if (window.lucide) window.lucide.createIcons();
        await loadScraperStatus();
    });

    container.querySelector('#adm-stop-all')?.addEventListener('click', async () => {
        const isHeadless = localStorage.getItem('admin_headless') !== 'false';
        const baseUrl = getApiBase();
        try {
            await adminFetch(`${baseUrl}/admin/scrapers/stop?source=all`, { method: 'POST' });
        } catch (e) { console.error(e); }
        await loadScraperStatus();
    });
}

async function loadScraperStatus() {
    try {
        const isHeadless = localStorage.getItem('admin_headless') !== 'false';
        const baseUrl = getApiBase();

        let res = await adminFetch(`${baseUrl}/admin/scrapers/status`).catch(() => null);

        // Fallback: If local fetch failed or was unauthorized, try the primary backend
        if (!res || !res.ok) {
            res = await adminFetch(`${getApiBase()}/admin/scrapers/status`);
        }

        if (!res.ok) return;
        const d = await res.json();

        const tenderScrapers = d.scrapers || {};
        const anyRunning = Object.values(tenderScrapers).some(s => s.is_running);

        const syncAllBtn = document.getElementById('adm-sync-all');
        const stopAllBtn = document.getElementById('adm-stop-all');
        if (syncAllBtn) syncAllBtn.disabled = anyRunning;
        if (stopAllBtn) stopAllBtn.disabled = !anyRunning;

        const grid = document.getElementById('adm-scraper-grid');
        if (grid) {
            // First time render checker (if it only contains the placeholder or is empty)
            const isPlaceholder = grid.children.length === 1 && grid.firstElementChild.innerText.includes('Initializing');
            const requiresInitialRender = grid.children.length === 0 || isPlaceholder;

            let htmlBuffer = '';

            Object.entries(tenderScrapers).forEach(([name, info]) => {
                const isRunning = info.is_running;
                const statusColor = isRunning ? '#10b981' : 'var(--text-tertiary)';
                const statusText = isRunning ? 'ENGINE ACTIVE' : 'STANDBY';
                const pulseAnim = isRunning ? 'animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;' : '';

                const safeId = 'adm-sc-' + name.replace(/[^a-zA-Z0-9]/g, '');
                const existing = document.getElementById(safeId);

                if (existing) {
                    // Soft Update
                    existing.style.borderColor = isRunning ? 'rgba(16,185,129,0.4)' : 'var(--border-glass)';

                    const scanline = existing.querySelector('.soft-scanline');
                    if (isRunning && !scanline) {
                        existing.insertAdjacentHTML('afterbegin', `<div class="soft-scanline" style="position:absolute; top:0; left:0; width:100%; height:2px; background: linear-gradient(90deg, transparent, #10b981, transparent); animation: scanline 2s linear infinite;"></div>`);
                    } else if (!isRunning && scanline) {
                        scanline.remove();
                    }

                    const dot = existing.querySelector('.soft-dot');
                    if (dot) {
                        dot.style.background = statusColor;
                        dot.style.boxShadow = `0 0 8px ${statusColor}`;
                        dot.style.animation = isRunning ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : '';
                    }

                    const badge = existing.querySelector('.soft-badge');
                    if (badge) {
                        badge.innerText = statusText;
                        badge.style.color = statusColor;
                    }

                    const extCount = existing.querySelector('.soft-ext');
                    if (extCount) extCount.innerText = (info.total_tenders || 0).toLocaleString();

                    const kwd = existing.querySelector('.soft-kwd');
                    if (kwd) kwd.innerText = info.last_keyword || 'N/A';

                    const syncNode = existing.querySelector('.soft-sync');
                    if (syncNode) syncNode.innerText = 'Sync: ' + (info.last_run ? new Date(info.last_run).toLocaleTimeString() : 'Never');

                    const startBtn = existing.querySelector('.sc-start');
                    const stopBtn = existing.querySelector('.sc-stop');

                    if (startBtn && stopBtn) {
                        if (isRunning) {
                            startBtn.disabled = true;
                            startBtn.style.background = 'rgba(255,255,255,0.02)';
                            startBtn.style.color = 'var(--text-tertiary)';
                            startBtn.style.cursor = 'not-allowed';

                            stopBtn.disabled = false;
                            stopBtn.style.background = 'rgba(239,68,68,0.1)';
                            stopBtn.style.color = '#ef4444';
                            stopBtn.style.cursor = 'pointer';
                        } else {
                            startBtn.disabled = false;
                            startBtn.style.background = 'var(--accent-blue)';
                            startBtn.style.color = '#fff';
                            startBtn.style.boxShadow = '0 4px 14px var(--accent-blue-dim)';
                            startBtn.style.cursor = 'pointer';

                            stopBtn.disabled = true;
                            stopBtn.style.background = 'rgba(255,255,255,0.02)';
                            stopBtn.style.color = 'var(--text-tertiary)';
                            stopBtn.style.cursor = 'not-allowed';
                        }
                    }

                } else {
                    // Initial Render
                    htmlBuffer += `
                    <div id="${safeId}" class="scraper-item anim-in" style="display:flex; align-items:center; justify-content:space-between; padding:16px 24px; background:var(--bg-card); border:1px solid var(--border-glass); border-radius:12px; margin-bottom:8px; transition:all 0.2s;">
                        
                        <div style="display:flex; align-items:center; gap:16px; flex:1;">
                            <div class="soft-dot" style="width:10px; height:10px; border-radius:50%; background:${statusColor}; ${pulseAnim} box-shadow: 0 0 12px ${statusColor};"></div>
                            <span class="sc-name" style="font-size:14px; font-weight:600; color:var(--text-primary); text-transform:none; min-width:140px;">${name}</span>
                            <span class="soft-badge" style="font-size:10px; font-weight:700; color:${statusColor}; background:${statusColor}15; padding:6px 12px; border-radius:999px; min-width:90px; text-align:center;">${statusText}</span>
                        </div>

                        <div style="display:flex; align-items:center; gap:40px; flex:1;">
                            <div style="display:flex; flex-direction:column; min-width:80px;">
                                <div style="font-size:11px; color:var(--text-tertiary); margin-bottom:2px;">Extracted</div>
                                <div class="soft-ext" style="font-size:16px; font-weight:700; color:var(--text-primary);">${(info.total_tenders || 0).toLocaleString()}</div>
                            </div>
                            <div style="display:flex; flex-direction:column; min-width:120px;">
                                <div style="font-size:11px; color:var(--text-tertiary); margin-bottom:2px;">Target Keyword</div>
                                <div class="soft-kwd" style="font-size:13px; font-weight:500; color:var(--text-secondary);">${info.last_keyword || 'N/A'}</div>
                            </div>
                        </div>

                        <div class="sc-controls" style="display:flex; gap:12px; align-items:center; border:none; padding:0; margin:0;">
                            <button onclick="window._startScraper(event, '${name}')" class="sc-start" style="width:88px; height:36px; background:${isRunning ? 'var(--border-subtle)' : 'var(--accent-blue)'}; color:${isRunning ? 'var(--text-tertiary)' : 'var(--accent-blue-text)'}; border:none; border-radius:999px; font-size:12px; font-weight:600; cursor:${isRunning ? 'not-allowed' : 'pointer'}; transition:all 0.2s;" ${isRunning ? 'disabled' : ''}>Start</button>
                            <button onclick="window._stopScraper(event, '${name}')" class="sc-stop" style="width:88px; height:36px; background:${!isRunning ? 'var(--border-subtle)' : 'var(--accent-red)'}; color:${!isRunning ? 'var(--text-tertiary)' : 'var(--accent-red-text)'}; border:none; border-radius:999px; font-size:12px; font-weight:600; cursor:${!isRunning ? 'not-allowed' : 'pointer'}; transition:all 0.2s;" ${!isRunning ? 'disabled' : ''}>Abort</button>
                        </div>
                    </div>`;
                }
            });

            if (requiresInitialRender && htmlBuffer) {
                grid.innerHTML = htmlBuffer + `
                <style>
                    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
                    @keyframes scanline { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
                </style>`;
            }
        }

        const gPanel = document.getElementById('adm-google-panel');
        if (gPanel) {
            const g = d.google || {};
            const isCaptcha = !!g.captcha_detected;
            const isRunning = g.running;

            if (isCaptcha && !window._captchaSoundPlayed) {
                const beep = new Audio('https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg');
                beep.volume = 0.5;
                beep.play().catch(() => { });
                window._captchaSoundPlayed = true;
            } else if (!isCaptcha) {
                window._captchaSoundPlayed = false;
            }

            // For Google Panel, we can afford innerHTML rebuilds ONLY if the HTML content fundamentally changes (e.g. captcha state).
            // But soft updates are better. Let's do a simple full innerHTML only if it's strictly necessary.
            // Since it's a single block, doing a targeted update is trivial via a hidden data attribute.
            const currentStateId = gPanel.getAttribute('data-state-id');
            const newStateId = `${isRunning}-${isCaptcha}-${g.message}`;

            if (currentStateId !== newStateId) {
                const statusColor = isCaptcha ? '#f59e0b' : (isRunning ? '#10b981' : 'var(--text-tertiary)');
                const statusText = isCaptcha ? 'ACTION REQUIRED' : (isRunning ? 'ENGINE ACTIVE' : 'STANDBY');
                const pulseAnim = (isRunning || isCaptcha) ? 'animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;' : '';

                gPanel.setAttribute('data-state-id', newStateId);
                gPanel.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; border:1px solid ${isRunning ? (isCaptcha ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)') : 'var(--border-glass)'}; border-radius:12px; margin-bottom: 8px; padding:16px 24px; background:var(--bg-card);">
                    
                    <div style="display:flex; align-items:center; gap:16px;">
                        <div style="width:10px; height:10px; border-radius:50%; background:${statusColor}; ${pulseAnim} box-shadow: 0 0 12px ${statusColor};"></div>
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-weight:700; font-size:14px; color:var(--text-primary);">Google Search Agent</span>
                            <span style="font-size:11px; color:var(--text-secondary);">${g.message || 'Ready for broad spectrum querying'}</span>
                        </div>
                    </div>

                    ${(isCaptcha || isRunning) ? `
                        <div class="captcha-box anim-in" style="margin:0; background:${isCaptcha ? 'rgba(244, 63, 94, 0.1)' : 'transparent'}; border:1px solid ${isCaptcha ? 'rgba(244, 63, 94, 0.4)' : 'transparent'}; padding:4px 12px; border-radius:8px; ${isCaptcha ? 'animation: pulse 2s infinite;' : ''} display:flex; align-items:center; gap:12px;">
                            ${isCaptcha ? `<div style="color:#F43F5E; font-size:11px; font-weight:700; text-transform:uppercase;">⚠️ CAPTCHA DETECTED</div>` : ''}
                            ${isCaptcha ? `<button id="adm-clear-captcha-btn" onclick="window._submitCaptcha(event)" style="background:var(--accent-red); color:var(--accent-red-text); border:none; height:28px; padding:0 12px; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer;">Cleared</button>` : ''}
                        </div>
                    ` : ''}

                    <div style="display:flex; gap:12px;">
                        ${isRunning ? `
                            <button onclick="window._stopGoogle(event)" style="width:88px; height:36px; background:var(--accent-red); color:var(--accent-red-text); border:none; border-radius:999px; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.2s;">Abort</button>
                        ` : `
                            <button onclick="window._startGoogle(event)" style="width:88px; height:36px; background:var(--accent-blue); color:var(--accent-blue-text); border:none; border-radius:999px; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.2s;">Start</button>
                        `}
                    </div>
                </div>
                `;
            }
        }
        if (window.lucide) window.lucide.createIcons();
    } catch (e) { console.error(e); }
}

window._startScraper = async (event, source) => {
    const btn = event.currentTarget;
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '';
    if (window.lucide) window.lucide.createIcons();

    try {
        const isHeadless = localStorage.getItem('admin_headless') !== 'false';
        const baseUrl = getApiBase();
        const res = await adminFetch(`${baseUrl}/admin/scrapers/start?source=${source}&headless=${isHeadless}`, { method: 'POST' });
        if (!res.ok) {
            alert(`Could not start ${source} locally. Make sure the local server is running and you are logged in locally. (HTTP ${res.status})`);
        }
    } catch (e) { alert("Network Error: " + e.message); console.error(e); }

    setTimeout(async () => {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        if (window.lucide) window.lucide.createIcons();
        await loadScraperStatus();
    }, 1000);
};

window._stopScraper = async (event, source) => {
    const isHeadless = localStorage.getItem('admin_headless') !== 'false';
    const baseUrl = getApiBase();
    await adminFetch(`${baseUrl}/admin/scrapers/stop?source=${source}`, { method: 'POST' });
    await loadScraperStatus();
};

window._startGoogle = async (event) => {
    const btn = event.currentTarget;
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Launching...';
    if (window.lucide) window.lucide.createIcons();

    try {
        const isHeadless = localStorage.getItem('admin_headless') !== 'false';
        const baseUrl = getApiBase();
        const res = await adminFetch(`${baseUrl}/admin/scrapers/start?source=google&headless=${isHeadless}`, { method: 'POST' });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            alert('Launch Failed: ' + (d.detail || 'Internal Server Error'));
        }
    } catch (e) {
        alert('Launch Error: ' + e.message);
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        if (window.lucide) window.lucide.createIcons();
        await loadScraperStatus();
    }
};

window._stopGoogle = async (event) => {
    const btn = event.currentTarget;
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.innerHTML = '⏹ Stopping...';

    try {
        const isHeadless = localStorage.getItem('admin_headless') !== 'false';
        const baseUrl = getApiBase();
        await adminFetch(`${baseUrl}/admin/scrapers/stop?source=google`, { method: 'POST' });
    } catch (e) { console.error(e); }

    // Status should already be updated server-side; refresh UI immediately
    await loadScraperStatus();
};

window._submitCaptcha = async (event) => {
    const btn = event.currentTarget;
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Resuming...';

    const isHeadless = localStorage.getItem('admin_headless') !== 'false';
    const baseUrl = getApiBase();

    try {
        await adminFetch(`${baseUrl}/admin/scrapers/captcha`, {
            method: 'POST',
            body: { answer: 'manual_clear' }
        });
    } catch (e) {
        console.error(e);
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }

    // Give backend 1s to propagate state, then refresh panel and RESTORE button
    setTimeout(async () => {
        await loadScraperStatus();
        // Restore button just in case isCaptcha is still true (e.g. backend lag)
        const checkBtn = document.getElementById('adm-clear-captcha-btn');
        if (checkBtn) {
            checkBtn.disabled = false;
            checkBtn.innerHTML = originalHTML;
        }
    }, 1000);
};


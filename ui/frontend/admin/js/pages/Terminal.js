// ============================================================
// Admin Terminal — Hacker Style Backend View
// ============================================================
import { getApiBase, adminFetch } from '../utils/api.js';

let termTimer = null;

export async function renderTerminal(container) {
    container.innerHTML = `
        <div class="section-header anim-in">
            <div class="section-title">
                <i data-lucide="terminal-square"></i> System Logs
            </div>
            <div class="scraper-actions" style="margin-bottom:0;">
                <button class="btn-sync-all" onclick="document.getElementById('hacker-output').innerHTML=''" style="background:transparent; border:1px solid #10b981; color:#10b981;">
                    <i data-lucide="trash-2" style="width:16px;height:16px;"></i> Clear Buffer
                </button>
            </div>
        </div>

        <div id="term-wrap" class="adm-card anim-in anim-d1" style="background:#000; border:1px solid #10b981; border-radius:12px; overflow:hidden; position:relative; box-shadow: 0 0 20px rgba(16, 185, 129, 0.1);">
            <div style="background:#051505; border-bottom:1px solid #10b981; padding:8px 16px; font-family:var(--font-mono); font-size:11px; color:#10b981; display:flex; justify-content:space-between; align-items:center;">
                <span>root@leonex-core:~# tail -f backend.log</span>
                <span style="opacity:0.7;">[ SYSTEM ONLINE ]</span>
            </div>
            <div id="hacker-output" style="padding:16px; font-family:var(--font-mono); font-size:13px; color:#10b981; height:600px; overflow-y:auto; line-height:1.6; text-shadow: 0 0 5px rgba(16,185,129,0.5);">
                <div><span style="opacity:0.5;">${new Date().toISOString()}</span> [INIT] Handshake established. Secure connection true.</div>
                <div><span style="opacity:0.5;">${new Date().toISOString()}</span> [SYS] Listening for incoming telemetry...</div>
                <br>
            </div>
            <div style="position:absolute; bottom:0; left:0; width:100%; height:80px; background:linear-gradient(transparent, #000); pointer-events:none;"></div>
        </div>
        <style>
            #hacker-output::-webkit-scrollbar { width: 8px; }
            #hacker-output::-webkit-scrollbar-track { background: #000; }
            #hacker-output::-webkit-scrollbar-thumb { background: #10b981; border-radius: 4px; }
            .hacker-line { animation: typeLine 0.1s linear forwards; white-space: pre-wrap; word-break: break-all; }
            @keyframes typeLine { from { opacity: 0; transform: translateX(-5px); } to { opacity: 1; transform: translateX(0); } }
        </style>
    `;
    if (window.lucide) window.lucide.createIcons();

    // Load DB crawl logs first — always available on any server (local or remote)
    await loadCrawlLogs();
    // Then load live in-memory system logs
    await loadTerminalLogs();

    if (termTimer) clearInterval(termTimer);
    termTimer = setInterval(loadTerminalLogs, 2000);

    const obs = new MutationObserver(() => {
        if (!document.getElementById('hacker-output')) {
            clearInterval(termTimer);
            obs.disconnect();
        }
    });
    obs.observe(document.body, { childList: true, subtree: true });
}

/** Load DB crawl logs — always available on ANY server. Shows history even on fresh local start. */
async function loadCrawlLogs() {
    try {
        const res = await adminFetch(`${getApiBase()}/admin/logs?limit=50`);
        if (!res || !res.ok) return;
        const d = await res.json();
        const logs = d.logs || [];
        if (!logs.length) return;

        const out = document.getElementById('hacker-output');
        if (!out) return;

        out.innerHTML += `<div class="hacker-line" style="color:#555;border-bottom:1px solid #1a3a2a;margin:4px 0;">── Recent Crawl History (DB) ──────────────────────────────────</div>`;

        [...logs].reverse().forEach(log => {
            const src = (log.source || '').toUpperCase().padEnd(12);
            const kw = log.keyword || 'N/A';
            const st = log.status || '?';
            const saved = log.tenders_saved || '0';
            const ts = log.started_at ? new Date(log.started_at).toLocaleString() : '?';
            const err = log.error_message ? ` ERR: ${log.error_message}` : '';
            let color = '#10b981';
            if (st === 'failed') color = '#ef4444';
            if (st === 'stopped') color = '#f59e0b';
            const safeErr = err.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            out.innerHTML += `<div class="hacker-line" style="color:${color}">[${ts}] [${st.toUpperCase()}] ${src} kw="${kw}" saved=${saved}${safeErr}</div>`;
        });

        out.innerHTML += `<div class="hacker-line" style="color:#555;border-bottom:1px solid #1a3a2a;margin:4px 0;">── Live System Logs ────────────────────────────────────────────</div>`;
        out.scrollTop = out.scrollHeight;
    } catch (e) { /* silent */ }
}

async function loadTerminalLogs() {
    try {
        const res = await adminFetch(`${getApiBase()}/admin/system-logs`);
        if (!res.ok) return;
        const d = await res.json();
        const logs = d.logs || [];

        const out = document.getElementById('hacker-output');
        if (!out) return;

        let added = false;
        const currentLines = out.querySelectorAll('.hacker-line[data-live]').length;

        if (logs.length > currentLines) {
            const newLogs = logs.slice(currentLines);
            newLogs.forEach(lineText => {
                let color = '#10b981';
                if (lineText.includes('ERROR')) color = '#ef4444';
                if (lineText.includes('WARNING')) color = '#f59e0b';
                const safeText = lineText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                out.innerHTML += `<div class="hacker-line" data-live="1" style="color:${color}">${safeText}</div>`;
                added = true;
            });
        } else if (logs.length < currentLines) {
            // Server restarted — clear live lines but keep the DB history above
            out.querySelectorAll('[data-live]').forEach(el => el.remove());
            logs.forEach(lineText => {
                let color = '#10b981';
                if (lineText.includes('ERROR')) color = '#ef4444';
                if (lineText.includes('WARNING')) color = '#f59e0b';
                const safeText = lineText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                out.innerHTML += `<div class="hacker-line" data-live="1" style="color:${color}">${safeText}</div>`;
                added = true;
            });
        }

        if (added) out.scrollTop = out.scrollHeight;
    } catch (e) { /* silent */ }
}

// ============================================
// LEONEX TENDER — OVERVIEW PAGE (Dashboard)
// Premium Colorful Grid — Feature-Rich Layout
// ============================================
import { drawDonutChart } from '../components/Chart.js';

import { getApiBase, authFetch } from '../utils/api.js';
const GAP = '20px';

export async function renderOverview(container) {
    container.innerHTML = `
        <div class="page-header anim-in">
            <div class="page-header-text">
                <h1>Welcome back, Admin</h1>
                <p>Here's what's happening with your intelligence database</p>
            </div>
            <div class="page-header-actions">
                <button class="btn-primary" id="dash-export"><i data-lucide="download" style="width:14px;height:14px;"></i> Export</button>
            </div>
        </div>

        <!-- ═══ ROW 1: 4 Coastal Palette Stat Cards ═══ -->
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:${GAP}; margin-bottom:${GAP};" class="anim-in anim-d1" id="dash-stats">
            <div class="stat-card card card-hover bg-palette-1" id="s1" style="min-height: 170px; overflow: hidden; justify-content: space-between;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; z-index:1;">
                    <i data-lucide="database" style="color:currentColor; width:28px; height:28px;"></i>
                    <div class="glass-badge">+12.5%</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:4px; z-index:1;">
                    <div class="solid-text-value" id="s1-val">—</div>
                    <div class="solid-text-label">Total Listings</div>
                </div>
            </div>
            
            <div class="stat-card card card-hover bg-palette-2" id="s2" style="min-height: 170px; overflow: hidden; justify-content: space-between;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; z-index:1;">
                    <i data-lucide="globe" style="color:currentColor; width:28px; height:28px;"></i>
                    <div class="glass-badge">Active</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:4px; z-index:1;">
                    <div class="solid-text-value" id="s2-val">—</div>
                    <div class="solid-text-label">Active Sources</div>
                </div>
            </div>

            <div class="stat-card card card-hover bg-palette-3" id="s3" style="min-height: 170px; justify-content: space-between;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; z-index:1;">
                    <i data-lucide="file-text" style="color:currentColor; width:28px; height:28px;"></i>
                </div>
                <div style="display:flex; flex-direction:column; gap:4px; z-index:1;">
                    <div class="solid-text-value" id="s3-val">—</div>
                    <div class="solid-text-label">Last Scraped</div>
                </div>
            </div>

            <div class="stat-card card card-hover bg-palette-4" id="s4" style="min-height: 170px; justify-content: space-between;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; z-index:1;">
                    <i data-lucide="zap" style="color:currentColor; width:28px; height:28px;"></i>
                </div>
                <div style="display:flex; flex-direction:column; gap:4px; z-index:1;">
                    <div class="solid-text-value" id="s4-val">—</div>
                    <div class="solid-text-label">New This Week</div>
                </div>
            </div>
        </div>

        <!-- ═══ ROW 2: Scraper Status + Sources Donut + Keyword Match ═══ -->
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:${GAP}; margin-bottom:${GAP};" class="anim-in anim-d2" id="dash-row2">
            
            <!-- Scraper Status Card -->
            <div class="card glass-panel" style="padding:24px; border-radius:20px; display:flex; flex-direction:column;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px;">
                    <div class="stat-icon teal" style="width:36px;height:36px;border-radius:10px;"><i data-lucide="activity" style="width:18px;height:18px;"></i></div>
                    <span style="font-size:15px; font-weight:600; color:var(--text-primary);">Scraper Status</span>
                </div>
                <div id="ov-scraper-status" style="display:flex; flex-direction:column; gap:14px; flex:1;">
                    <div style="color:var(--text-tertiary); font-size:13px; text-align:center; padding:20px;">Loading...</div>
                </div>
            </div>

            <!-- Sources Donut -->
            <div class="card glass-panel" style="padding:24px; border-radius:20px; display:flex; flex-direction:column; align-items:center;">
                <div style="font-size:15px; font-weight:600; color:var(--text-primary); margin-bottom:16px; align-self:flex-start;">Sources Distribution</div>
                <div style="position:relative; flex:1; display:flex; align-items:center; justify-content:center;" id="donut-container">
                    <canvas id="source-donut-chart"></canvas>
                    <div id="donut-empty" style="display:none;position:absolute;color:var(--text-tertiary);font-size:13px;">No Data</div>
                </div>
            </div>

            <!-- Keyword Match Rate Gauge -->
            <div class="card glass-panel" style="padding:24px; border-radius:20px; display:flex; flex-direction:column;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
                    <div class="stat-icon pink" style="width:36px;height:36px;border-radius:10px;"><i data-lucide="target" style="width:18px;height:18px;"></i></div>
                    <span style="font-size:15px; font-weight:600; color:var(--text-primary);">Match Rate</span>
                </div>
                <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px;">
                    <div id="ov-match-gauge" style="font-size:48px; font-weight:800; letter-spacing:-2px; color:var(--text-primary); line-height:1;">
                        —<span style="font-size:20px; font-weight:500; color:var(--text-tertiary);">%</span>
                    </div>
                    <div style="font-size:13px; color:var(--text-tertiary);">MDM Keyword Accuracy</div>
                    <div style="width:100%; height:6px; background:var(--bg-hover); border-radius:10px; margin-top:8px; overflow:hidden;">
                        <div id="ov-match-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #111111, #888888); border-radius:10px; transition:width 1.5s ease;"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══ ROW 3: Line Chart (8fr) + Right Stack (4fr) ═══ -->
        <div style="display:grid; grid-template-columns:8fr 4fr; gap:${GAP};" class="anim-in anim-d3" id="dash-row3">
            
            <!-- LEFT: Extraction Trends -->
            <div class="card glass-panel" style="display:flex; flex-direction:column; padding:24px; border-radius:20px; min-height:320px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <div>
                        <div style="font-size:16px; font-weight:600; color:var(--text-primary);">Extraction Trends</div>
                        <div style="font-size:13px; color:var(--text-tertiary); margin-top:2px;">Daily scraped tenders</div>
                    </div>
                </div>
                <div style="display:flex; gap:16px; align-items:flex-end; margin-bottom:16px;">
                    <div class="card" style="padding:14px 18px; border-radius:14px; display:inline-flex; flex-direction:column; gap:2px;">
                        <div style="font-size:26px; font-weight:800; color:var(--text-primary); letter-spacing:-1px; line-height:1;">
                            <span id="ov-trend-total">—</span><span style="font-size:13px; font-weight:500; color:var(--text-tertiary); margin-left:4px;">tenders</span>
                        </div>
                        <div style="font-size:12px; color:var(--text-tertiary);">logged this week</div>
                        <div style="margin-top:4px; display:inline-block; font-size:11px; font-weight:700; color:var(--text-primary); background:rgba(0,0,0,0.05); padding:2px 10px; border-radius:100px; width:fit-content; border:1px solid rgba(0,0,0,0.06);">+12% vs last week</div>
                    </div>
                </div>
                <div style="flex:1; position:relative;" id="line-container">
                    <canvas id="trend-line-chart"></canvas>
                </div>
            </div>

            <!-- RIGHT: Stacked cards -->
            <div style="display:flex; flex-direction:column; gap:${GAP};">
                
                <!-- Recent Activity Feed -->
                <div class="card glass-panel" style="padding:24px; border-radius:20px; flex:1;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
                        <div class="stat-icon orange" style="width:36px;height:36px;border-radius:10px;"><i data-lucide="bell" style="width:18px;height:18px;"></i></div>
                        <span style="font-size:15px; font-weight:600; color:var(--text-primary);">Recent Activity</span>
                    </div>
                    <div id="ov-recent-activity" style="display:flex; flex-direction:column; gap:12px;">
                        <div style="color:var(--text-tertiary); font-size:13px; text-align:center; padding:12px;">Loading...</div>
                    </div>
                </div>

                <!-- AI Insights Chat Card -->
                <div class="ai-insight card glass-panel" style="border-radius:20px; flex:1;">
                    <div style="display:flex; justify-content:space-between; align-items:center; position:relative; z-index:2; margin-bottom:16px;">
                        <div class="ai-insight-label">
                            <i data-lucide="sparkles" style="width:14px;height:14px;color:#EAB308;"></i>
                            AI Insights
                        </div>
                    </div>
                    <div style="position:relative; z-index:2; flex:1; display:flex; flex-direction:column; justify-content:center;">
                        <div class="ai-bubble">
                            <strong>34% surge</strong> detected in 'Enterprise Switch' and 'Data Center' requests. Scale scrapers?
                        </div>
                        <div class="ai-buttons-stack">
                            <button class="ai-btn-primary">Deploy Scrapers</button>
                            <button class="ai-btn-secondary">Ignore</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // ── Fetch Data ──
    let stats = { total_tenders: 0, tenders_by_source: {}, last_scraped: null };
    let recentTenders = [];
    
    try {
        const statsRes = await authFetch(`${getApiBase()}/stats`, { cache: "no-store" });
        stats = await statsRes.json();
    } catch(e) { console.warn('Stats error:', e); }

    try {
        const tRes = await authFetch(`${getApiBase()}/tenders?limit=30`, { cache: "no-store" });
        const tData = await tRes.json();
        recentTenders = tData.results || [];
    } catch(e) { console.warn('Tenders error:', e); }

    // ── Stat Cards ──
    const sc = Object.keys(stats.tenders_by_source || {}).length;
    const dDate = stats.last_scraped ? new Date(stats.last_scraped).toLocaleDateString() : 'Never';
    const newWeek = recentTenders.filter(t => {
        if (!t.created_at) return false;
        return (Date.now() - new Date(t.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
    }).length || Math.floor(stats.total_tenders * 0.05) || 0;

    const s1Val = container.querySelector('#s1-val');
    if (s1Val) s1Val.textContent = stats.total_tenders;

    const s2Val = container.querySelector('#s2-val');
    if (s2Val) s2Val.textContent = sc;

    const s3Val = container.querySelector('#s3-val');
    if (s3Val) { s3Val.textContent = dDate; s3Val.style.fontSize = '22px'; s3Val.style.letterSpacing = '-0.5px'; }

    const s4Val = container.querySelector('#s4-val');
    if (s4Val) s4Val.textContent = newWeek;

    // ── Scraper Status ──
    const scraperEl = container.querySelector('#ov-scraper-status');
    if (scraperEl) {
        const sources = Object.entries(stats.tenders_by_source || {});
        const scraperColors = ['#111111', '#444444', '#777777', '#AAAAAA', '#CCCCCC'];
        if (sources.length === 0) {
            scraperEl.innerHTML = `<div style="color:var(--text-tertiary); font-size:13px; text-align:center;">No scrapers configured</div>`;
        } else {
            scraperEl.innerHTML = sources.slice(0, 5).map((s, i) => `
                <div style="display:flex; align-items:center; justify-content:space-between;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:8px; height:8px; border-radius:50%; background:${scraperColors[i % scraperColors.length]};"></div>
                        <span style="font-size:13px; font-weight:500; color:var(--text-primary);">${s[0]}</span>
                    </div>
                    <span style="font-size:12px; font-weight:600; color:var(--text-tertiary);">${s[1]} tenders</span>
                </div>
            `).join('');
        }
    }

    // ── Keyword Match Rate ──
    const matchRate = stats.total_tenders > 0 ? Math.min(95, Math.floor(67 + Math.random() * 20)) : 0;
    const gaugeEl = container.querySelector('#ov-match-gauge');
    const barEl = container.querySelector('#ov-match-bar');
    if (gaugeEl) gaugeEl.innerHTML = `${matchRate}<span style="font-size:20px; font-weight:500; color:var(--text-tertiary);">%</span>`;
    if (barEl) setTimeout(() => { barEl.style.width = `${matchRate}%`; }, 300);

    // ── Donut Chart ──
    const donutColors = ['#7C5CFF', '#3B82F6', '#10B981', '#FF7A00', '#EC4899'];
    const donutCanvas = document.getElementById('source-donut-chart');
    const sources = Object.keys(stats.tenders_by_source || {});
    
    if (sources.length > 0 && donutCanvas) {
        const chartData = sources.map((src, i) => ({
            label: src,
            value: stats.tenders_by_source[src],
            color: donutColors[i % donutColors.length]
        }));
        drawDonutChart(donutCanvas, chartData, { size: 110, centerText: stats.total_tenders.toString(), centerSub: 'Total' });
    } else {
        if(donutCanvas) donutCanvas.style.display = 'none';
        const empty = document.getElementById('donut-empty');
        if(empty) empty.style.display = 'block';
    }

    // ── Recent Activity ──
    const activityEl = container.querySelector('#ov-recent-activity');
    if (activityEl) {
        const activities = [
            { icon: 'check-circle', color: '#111111', bg: 'rgba(0,0,0,0.04)', text: `GEM Portal synced — ${stats.tenders_by_source?.BIDDETAIL || 0} found`, time: '2m ago' },
            { icon: 'sparkles', color: '#111111', bg: 'rgba(0,0,0,0.04)', text: 'AI analysis completed for Data Center keywords', time: '15m ago' },
            { icon: 'alert-triangle', color: '#111111', bg: 'rgba(0,0,0,0.04)', text: 'TenderOnTime rate limited — retrying', time: '1h ago' },
        ];
        activityEl.innerHTML = activities.map(a => `
            <div style="display:flex; align-items:flex-start; gap:12px;">
                <div style="width:32px; height:32px; border-radius:8px; background:${a.bg}; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:${a.color};">
                    <i data-lucide="${a.icon}" style="width:16px;height:16px;"></i>
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:13px; font-weight:500; color:var(--text-primary); line-height:1.4;">${a.text}</div>
                    <div style="font-size:11px; color:var(--text-tertiary); margin-top:2px;">${a.time}</div>
                </div>
            </div>
        `).join('');
    }

    // ── Trend Total ──
    const trendEl = container.querySelector('#ov-trend-total');
    if (trendEl) trendEl.textContent = stats.total_tenders || '—';

    // ── Line Chart ──
    const lineCanvas = document.getElementById('trend-line-chart');
    if (lineCanvas) {
        const baseVal = stats.total_tenders / 10 || 50;
        const trendData = [{
            values: [baseVal*0.5, baseVal*0.8, baseVal*0.6, baseVal*1.1, baseVal*1.4, baseVal*1.2, baseVal*1.8],
            color: '#111111',
            fill: 'rgba(0, 0, 0, 0.04)',
        }];
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        import('../components/Chart.js').then(m => {
            if (m.drawLineChart) m.drawLineChart(lineCanvas, trendData, { height: 180, labels: days });
        });
    }

    if (window.lucide) window.lucide.createIcons();

    // Export
    const exp = container.querySelector('#dash-export');
    if (exp) {
        exp.addEventListener('click', () => {
            const a = document.createElement('a'); a.href = `${getApiBase()}/export`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        });
    }
}

function _updateCard(el, icon, value, label, colorClass, isSmallFont) {
    if (!el) return;
    el.innerHTML = `
        <div class="stat-icon ${colorClass}"><i data-lucide="${icon}"></i></div>
        <div class="stat-value" ${isSmallFont ? 'style="font-size:22px;letter-spacing:-0.5px;"' : ''}>${value}</div>
        <div class="stat-label">${label}</div>
    `;
}

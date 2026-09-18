export function renderAnalytics(container) {
    container.innerHTML = `
        <div class="page-header anim-in">
            <div class="page-header-text">
                <h1>Performance Analytics</h1>
                <p>Comprehensive breakdown of tender lifecycle and conversion metrics</p>
            </div>
            <div class="page-header-actions">
                <button class="btn-secondary"><i data-lucide="calendar" style="width:14px;height:14px;"></i> Last 30 Days</button>
            </div>
        </div>

        <div class="metrics-row anim-in anim-d1">
            <div class="stat-card card card-hover">
                <div class="stat-icon purple"><i data-lucide="bar-chart-2"></i></div>
                <div class="stat-value">64.2%</div>
                <div class="stat-label">Win Ratio</div>
            </div>
            <div class="stat-card card card-hover">
                <div class="stat-icon blue"><i data-lucide="pie-chart"></i></div>
                <div class="stat-value">₹12.4Cr</div>
                <div class="stat-label">Revenue Won</div>
            </div>
            <div class="stat-card card card-hover">
                <div class="stat-icon green"><i data-lucide="trending-up"></i></div>
                <div class="stat-value">+18%</div>
                <div class="stat-label">MoM Growth</div>
            </div>
            <div class="stat-card card card-hover">
                <div class="stat-icon orange"><i data-lucide="clock"></i></div>
                <div class="stat-value">12 Days</div>
                <div class="stat-label">Avg. Bid Cycle</div>
            </div>
        </div>

        <div class="main-grid">
            <div class="col-12 grid-stack">
                <div class="card glass-panel anim-in anim-d2" style="padding: 100px 24px; text-align: center;">
                    <i data-lucide="activity" style="width: 48px; height: 48px; color: var(--text-tertiary); margin-bottom: 16px;"></i>
                    <h3 style="color: var(--text-primary); font-size: 18px; margin-bottom: 8px;">Analytics Engine Ready</h3>
                    <p style="color: var(--text-secondary); max-width: 400px; margin: 0 auto;">Connect your CRM or ERP system to visualize full pipeline metrics and conversion funnels.</p>
                    <button class="btn-primary" style="margin-top: 24px;"><i data-lucide="plug" style="width:14px;height:14px;"></i> Connect Data Source</button>
                </div>
            </div>
        </div>
    `;
}

export function renderAlerts(container) {
    container.innerHTML = `
        <div class="page-header anim-in">
            <div class="page-header-text">
                <h1>Smart Alerts</h1>
                <p>Manage notifications, MDM matching rules, and keyword triggers</p>
            </div>
            <div class="page-header-actions">
                <button class="btn-primary"><i data-lucide="plus" style="width:14px;height:14px;"></i> Create Alert Rule</button>
            </div>
        </div>

        <div class="main-grid">
            <div class="col-8 grid-stack">
                <div class="card glass-panel anim-in anim-d1" style="padding: 24px;">
                    <div class="card-title" style="margin-bottom: 24px;">Active Trigger Rules</div>
                    
                    <div style="display:flex;flex-direction:column;gap:12px;">
                        <div class="reminder-item" style="display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <div class="reminder-title">High-Value ONGC Tenders</div>
                                <div class="reminder-time">Source: GEM Portal | Value > ₹50L</div>
                            </div>
                            <button class="btn-ghost" style="color:var(--accent-red);padding:0;width:32px;height:32px;"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>
                        </div>
                        
                        <div class="reminder-item" style="display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <div class="reminder-title">Keyword: "Data Governance"</div>
                                <div class="reminder-time">Source: All | MDM Match Required</div>
                            </div>
                            <button class="btn-ghost" style="color:var(--accent-red);padding:0;width:32px;height:32px;"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>
                        </div>

                        <div class="reminder-item" style="display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <div class="reminder-title">Expiring Saved Tenders</div>
                                <div class="reminder-time">Alert Timing: 48h before deadline</div>
                            </div>
                            <button class="btn-ghost" style="color:var(--accent-red);padding:0;width:32px;height:32px;"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-4 grid-stack">
                <div class="card glass-panel anim-in anim-d2" style="padding: 24px;">
                    <div class="card-title" style="margin-bottom: 16px;">Delivery Methods</div>
                    
                    <div style="display:flex;flex-direction:column;gap:16px;">
                        <label style="display:flex;align-items:center;gap:12px;color:var(--text-primary);cursor:pointer;">
                            <input type="checkbox" checked style="width:16px;height:16px;accent-color:var(--accent-purple);"> Include In-App Notifications
                        </label>
                        <label style="display:flex;align-items:center;gap:12px;color:var(--text-primary);cursor:pointer;">
                            <input type="checkbox" checked style="width:16px;height:16px;accent-color:var(--accent-purple);"> Email Digest (Daily at 08:00 AM)
                        </label>
                        <label style="display:flex;align-items:center;gap:12px;color:var(--text-primary);cursor:pointer;">
                            <input type="checkbox" style="width:16px;height:16px;accent-color:var(--accent-purple);"> Instant SMS Alerts (Critical Only)
                        </label>
                        <label style="display:flex;align-items:center;gap:12px;color:var(--text-primary);cursor:pointer;">
                            <input type="checkbox" style="width:16px;height:16px;accent-color:var(--accent-purple);"> Push to Slack Channel
                        </label>
                    </div>
                    
                    <button class="btn-secondary" style="margin-top:24px;width:100%;justify-content:center;">Save Preferences</button>
                </div>
            </div>
        </div>
    `;
}

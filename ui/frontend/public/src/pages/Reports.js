export function renderReports(container) {
    container.innerHTML = `
        <div class="page-header anim-in">
            <div class="page-header-text">
                <h1>Custom Reports</h1>
                <p>Generate, save, and automate regular data exports</p>
            </div>
            <div class="page-header-actions">
                <button class="btn-primary"><i data-lucide="plus" style="width:14px;height:14px;"></i> New Report</button>
            </div>
        </div>

        <div class="main-grid">
            <div class="col-12 grid-stack">
                <div class="table-card card glass-panel anim-in anim-d1">
                    <div class="card-header" style="padding: 24px; border-bottom: 1px solid var(--border-glass);">
                        <div class="card-title">Scheduled Reports</div>
                    </div>
                    <div class="data-table-wrap">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Report Name</th>
                                    <th>Frequency</th>
                                    <th>Format</th>
                                    <th>Last Run</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td class="td-title">Weekly MDM Matches</td>
                                    <td>Every Monday</td>
                                    <td>Excel (.xlsx)</td>
                                    <td style="font-size:13px;">Yesterday, 08:00 AM</td>
                                    <td><span class="badge badge-active">Active</span></td>
                                    <td><button class="btn-ghost" style="padding:0;width:32px;height:32px;"><i data-lucide="download" style="width:16px;height:16px;"></i></button></td>
                                </tr>
                                <tr>
                                    <td class="td-title">Monthly Win/Loss Summary</td>
                                    <td>1st of Month</td>
                                    <td>PDF</td>
                                    <td style="font-size:13px;">01 Mar 2026</td>
                                    <td><span class="badge badge-active">Active</span></td>
                                    <td><button class="btn-ghost" style="padding:0;width:32px;height:32px;"><i data-lucide="download" style="width:16px;height:16px;"></i></button></td>
                                </tr>
                                <tr>
                                    <td class="td-title">Q1 Executive Brief</td>
                                    <td>Quarterly</td>
                                    <td>PowerPoint</td>
                                    <td style="font-size:13px;">Never</td>
                                    <td><span class="badge badge-upcoming">Scheduled</span></td>
                                    <td><button class="btn-ghost" style="padding:0;width:32px;height:32px;"><i data-lucide="download" style="width:16px;height:16px;"></i></button></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
}

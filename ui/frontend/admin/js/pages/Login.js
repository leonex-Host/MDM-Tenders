// ============================================================
// Admin Login Page — Premium Unified Style
// ============================================================
import { getApiBase, setToken } from '../utils/api.js';

export async function renderLogin(container) {
    const app = document.getElementById('admin-app');
    app.classList.add('logged-out');

    container.innerHTML = `
        <div class="admin-login-wrap">
            <div class="admin-login-box anim-in">
                <div class="login-brand">
                    <div class="brand-icon"><i data-lucide="shield-check"></i></div>
                    <span>Leonex Admin</span>
                </div>
                
                <div style="text-align:center; margin-bottom:28px;">
                    <h2 style="font-size:22px; font-weight:800; color:var(--text-primary); letter-spacing:-0.02em;">Mission Control</h2>
                    <p style="color:var(--text-tertiary); font-size:14px; margin-top:4px; font-weight:500;">Authorized personnel authentication</p>
                </div>

                <div id="adm-login-error" style="display:none; background:var(--accent-red-dim); border:1px solid var(--accent-red); color:var(--accent-red); padding:12px; border-radius:12px; font-size:13px; margin-bottom:20px; text-align:center; font-weight:600;"></div>

                <form id="admin-login-form">
                    <div class="field">
                        <label for="adm-email">Admin Email</label>
                        <input type="email" id="adm-email" placeholder="admin@leonex.net" autocomplete="email" required style="font-size:14px;">
                    </div>
                    <div class="field">
                        <label for="adm-pass">Password</label>
                        <input type="password" id="adm-pass" placeholder="••••••••" autocomplete="current-password" required style="font-size:14px;">
                    </div>
                    <button type="submit" class="login-btn" id="adm-login-btn">Authenticate Access</button>
                </form>

                <div style="margin-top:28px; text-align:center;">
                    <a href="../#/" style="color:var(--text-tertiary); font-size:13px; text-decoration:none; font-weight:600; transition:color 0.2s;" onmouseover="this.style.color='var(--text-primary)'" onmouseout="this.style.color='var(--text-tertiary)'">
                        ← Back to User Portal
                    </a>
                </div>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    const form = document.getElementById('admin-login-form');
    const btn = document.getElementById('adm-login-btn');
    const errEl = document.getElementById('adm-login-error');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errEl.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Authenticating...';

        const email = document.getElementById('adm-email').value.trim();
        const pass  = document.getElementById('adm-pass').value;

        try {
            const res = await fetch(`${getApiBase()}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password: pass }),
            });

            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.detail || 'Access Denied: Invalid Credentials');
            }

            const data = await res.json();

            // Verify admin role
            const meRes = await fetch(`${getApiBase()}/auth/me`, {
                headers: { 'Authorization': `Bearer ${data.access_token}` },
            });
            if (!meRes.ok) throw new Error('Verification Failed');
            const me = await meRes.json();

            if (me.role !== 'admin') {
                throw new Error('Access Denied: Admin privileges required');
            }

            setToken(data.access_token);
            app.classList.remove('logged-out');
            window.location.hash = '#/dashboard';
            window.location.reload();
        } catch (err) {
            errEl.textContent = err.message;
            errEl.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Authenticate Access';
        }
    });
}


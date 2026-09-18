import { navigate } from '../router.js';
import { getApiBase } from '../utils/api.js';

export function renderForgotPassword(container) {
    container.innerHTML = `
        <div class="auth-wrapper" style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; background: var(--bg-primary);">
            <div class="auth-card" style="width: 100%; max-width: 420px; padding: 32px; border: 1px solid var(--border-color); border-radius: 12px; text-align: left; box-sizing: border-box;">
                
                <div style="margin-bottom: 32px;">
                    <h1 style="font-size: 26px; font-weight: 800; color: var(--text-primary); margin-bottom: 6px; letter-spacing: -0.03em;">Reset password</h1>
                    <p style="color: var(--text-secondary); font-size: 13px;">We'll send you a recovery link.</p>
                </div>
                
                <div id="reset-error" style="display:none; background:#ff3b3b22; border:1px solid #ff3b3b55; color:#ff6b6b; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:16px;"></div>
                <div id="reset-success" style="display:none; background:#22c55e22; border:1px solid #22c55e55; color:#4ade80; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:16px;"></div>

                <form id="reset-form" style="display: flex; flex-direction: column; gap: 20px;">
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Email address</label>
                        <input type="email" id="reset-email" class="input auth-input" placeholder="admin@leonex.net" required style="width: 100%; height: 42px; background: transparent; border: 1px solid var(--border-color); color: var(--text-primary); padding: 0 14px; border-radius: 8px; font-size: 14px; outline: none; transition: all 0.2s;">
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                        <button type="submit" id="reset-btn" class="auth-btn" style="width: 100%; height: 44px; background: var(--text-primary); color: var(--bg-primary); border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity 0.2s;">
                            Send reset link
                        </button>
                        <button type="button" id="back-to-login" class="auth-btn-ghost" style="width: 100%; height: 44px; background: transparent; color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s;">
                            Back to log in
                        </button>
                    </div>
                </form>
            </div>
            
            <style>
                .auth-card { background: #000000; }
                html[data-theme="light"] .auth-card { background: #ffffff; }
                .auth-input { width: 100%; box-sizing: border-box !important; }
                .auth-btn, .auth-btn-ghost { width: 100%; box-sizing: border-box !important; }
                .auth-btn { background: #ffffff !important; color: #000000 !important; }
                html[data-theme="light"] .auth-btn { background: #000000 !important; color: #ffffff !important; }
                .auth-input:focus { border-color: var(--text-primary) !important; box-shadow: 0 0 0 1px var(--text-primary); }
                .auth-btn:hover { opacity: 0.8 !important; }
                .auth-btn-ghost:hover { background: rgba(128,128,128,0.1) !important; }
                .auth-btn:disabled { opacity: 0.5 !important; cursor: not-allowed !important; }
            </style>
        </div>
    `;

    const form = document.getElementById('reset-form');
    const errBox = document.getElementById('reset-error');
    const successBox = document.getElementById('reset-success');
    const btn = document.getElementById('reset-btn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.style.display = 'none';
        successBox.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Processing...';

        const email = document.getElementById('reset-email').value.trim();

        try {
            const res = await fetch(`${getApiBase()}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();

            if (!res.ok) {
                errBox.textContent = data.detail || 'Failed to process request';
                errBox.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Send reset link';
                return;
            }

            successBox.textContent = data.message;
            successBox.style.display = 'block';
            
            // In a real app, we wouldn't show the token, but for this demo:
            if (data.reset_token) {
                console.log("Reset Token (Demo Only):", data.reset_token);
            }

            setTimeout(() => navigate('/login'), 3000);

        } catch (err) {
            errBox.textContent = 'Connection error. Please try again.';
            errBox.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Send reset link';
        }
    });

    document.getElementById('back-to-login').addEventListener('click', () => {
        navigate('/login');
    });
}

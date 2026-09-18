import { navigate } from '../router.js';
import { saveTokens, getApiBase } from '../utils/api.js';

export function renderLogin(container) {
    container.innerHTML = `
        <div class="auth-wrapper" style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; background: var(--bg-primary);">
            <div class="auth-card" style="width: 100%; max-width: 420px; padding: 32px; border: 1px solid var(--border-color); border-radius: 12px; text-align: left; box-sizing: border-box;">
                
                <div style="margin-bottom: 32px;">
                    <h1 style="font-size: 26px; font-weight: 800; color: var(--text-primary); margin-bottom: 6px; letter-spacing: -0.03em;">Log in</h1>
                    <p style="color: var(--text-secondary); font-size: 13px;">Access your intelligence platform.</p>
                </div>
                
                <div id="login-error" style="display:none; background:#ff3b3b22; border:1px solid #ff3b3b55; color:#ff6b6b; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:16px;"></div>

                <form id="login-form" style="display: flex; flex-direction: column; gap: 20px;">
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Email address</label>
                        <input type="email" id="login-email" class="input auth-input" placeholder="admin@leonex.net" required style="width: 100%; height: 42px; background: transparent; border: 1px solid var(--border-color); color: var(--text-primary); padding: 0 14px; border-radius: 8px; font-size: 14px; outline: none; transition: all 0.2s;">
                    </div>
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <label style="font-size: 12px; font-weight: 600; color: var(--text-primary);">Password</label>
                            <a href="#/forgot-password" style="font-size: 12px; color: var(--text-secondary); text-decoration: none; font-weight: 500; transition: color 0.2s;" class="auth-link">Forgot password?</a>
                        </div>
                        <div style="position: relative;">
                            <input type="password" id="login-password" class="input auth-input" placeholder="••••••••" required style="width: 100%; height: 42px; background: transparent; border: 1px solid var(--border-color); color: var(--text-primary); padding: 0 40px 0 14px; border-radius: 8px; font-size: 14px; outline: none; transition: all 0.2s;">
                            <button type="button" id="toggle-password" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-tertiary); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px; transition: color 0.2s;">
                                <i data-lucide="eye" id="eye-icon" style="width: 18px; height: 18px;"></i>
                            </button>
                        </div>
                    </div>
                    <button type="submit" id="login-btn" class="auth-btn" style="width: 100%; height: 44px; background: var(--text-primary); color: var(--bg-primary); border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px; transition: opacity 0.2s;">
                        Continue
                    </button>
                </form>
                
                <div style="margin-top: 32px; font-size: 13px; color: var(--text-secondary); text-align: center;">
                    Don't have an account? <a href="#/register" style="color: var(--text-primary); font-weight: 600; text-decoration: none;" class="auth-link">Sign up</a>
                </div>
            </div>
            
            <style>
                .auth-card { background: #000000; }
                html[data-theme="light"] .auth-card { background: #ffffff; }
                .auth-input { width: 100%; box-sizing: border-box !important; }
                .auth-btn { width: 100%; box-sizing: border-box !important; background: #ffffff !important; color: #000000 !important; }
                html[data-theme="light"] .auth-btn { background: #000000 !important; color: #ffffff !important; }
                .auth-input:focus { border-color: var(--text-primary) !important; box-shadow: 0 0 0 1px var(--text-primary); }
                .auth-btn:hover { opacity: 0.8 !important; }
                .auth-link:hover { color: var(--text-primary) !important; }
                .auth-btn:disabled { opacity: 0.5 !important; cursor: not-allowed !important; }
                #toggle-password:hover { color: var(--text-primary) !important; }
            </style>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    const form      = document.getElementById('login-form');
    const errBox    = document.getElementById('login-error');
    const btn       = document.getElementById('login-btn');
    const passInput = document.getElementById('login-password');
    const toggleBtn = document.getElementById('toggle-password');
    const eyeIcon   = document.getElementById('eye-icon');

    // Toggle Password Visibility
    toggleBtn.addEventListener('click', () => {
        const isPassword = passInput.type === 'password';
        passInput.type = isPassword ? 'text' : 'password';
        
        // Update Icon
        eyeIcon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
        if (window.lucide) window.lucide.createIcons();
    });

    function showError(msg) {
        errBox.textContent = msg;
        errBox.style.display = 'block';
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.style.display = 'none';
        btn.disabled    = true;
        btn.textContent = 'Signing in...';

        const email    = document.getElementById('login-email').value.trim();
        const password = passInput.value;

        try {
            const res = await fetch(`${getApiBase()}/auth/login`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                showError(data.detail || 'Login failed. Please check your credentials.');
                btn.disabled    = false;
                btn.textContent = 'Continue';
                return;
            }

            // Store tokens and navigate
            saveTokens(data.access_token, data.refresh_token);
            navigate('/portal');

        } catch (err) {
            showError('Cannot connect to server. Make sure the backend is running.');
            btn.disabled    = false;
            btn.textContent = 'Continue';
        }
    });
}

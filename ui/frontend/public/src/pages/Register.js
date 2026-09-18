import { navigate } from '../router.js';
import { saveTokens, getApiBase } from '../utils/api.js';

export function renderRegister(container) {
    container.innerHTML = `
        <div class="auth-wrapper" style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; background: var(--bg-primary);">
            <div class="auth-card" style="width: 100%; max-width: 420px; padding: 32px; border: 1px solid var(--border-color); border-radius: 12px; text-align: left; box-sizing: border-box;">
                
                <div style="margin-bottom: 32px;">
                    <h1 style="font-size: 26px; font-weight: 800; color: var(--text-primary); margin-bottom: 6px; letter-spacing: -0.03em;">Create account</h1>
                    <p style="color: var(--text-secondary); font-size: 13px;">Start winning more tenders.</p>
                </div>

                <div id="reg-error" style="display:none; background:#ff3b3b22; border:1px solid #ff3b3b55; color:#ff6b6b; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:16px;"></div>
                <div id="reg-success" style="display:none; background:#22c55e22; border:1px solid #22c55e55; color:#4ade80; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:16px;"></div>
                
                <form id="register-form" style="display: flex; flex-direction: column; gap: 18px;">
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Full Name</label>
                        <input type="text" id="reg-fullname" class="input auth-input" placeholder="Alex Carter" style="width: 100%; height: 42px; background: transparent; border: 1px solid var(--border-color); color: var(--text-primary); padding: 0 14px; border-radius: 8px; font-size: 14px; outline: none; transition: all 0.2s;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Username</label>
                        <input type="text" id="reg-username" class="input auth-input" placeholder="alexcarter" required style="width: 100%; height: 42px; background: transparent; border: 1px solid var(--border-color); color: var(--text-primary); padding: 0 14px; border-radius: 8px; font-size: 14px; outline: none; transition: all 0.2s;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Email address</label>
                        <input type="email" id="reg-email" class="input auth-input" placeholder="alex@company.com" required style="width: 100%; height: 42px; background: transparent; border: 1px solid var(--border-color); color: var(--text-primary); padding: 0 14px; border-radius: 8px; font-size: 14px; outline: none; transition: all 0.2s;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Password <span style="font-weight:400; color:var(--text-tertiary);">(8+ chars, 1 uppercase, 1 digit)</span></label>
                        <div style="position: relative;">
                            <input type="password" id="reg-password" class="input auth-input" placeholder="••••••••" required style="width: 100%; height: 42px; background: transparent; border: 1px solid var(--border-color); color: var(--text-primary); padding: 0 40px 0 14px; border-radius: 8px; font-size: 14px; outline: none; transition: all 0.2s;">
                            <button type="button" id="toggle-reg-password" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-tertiary); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px; transition: color 0.2s;">
                                <i data-lucide="eye" id="eye-icon-reg" style="width: 18px; height: 18px;"></i>
                            </button>
                        </div>
                    </div>
                    <button type="submit" id="reg-btn" class="auth-btn" style="width: 100%; height: 44px; background: var(--text-primary); color: var(--bg-primary); border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px; transition: opacity 0.2s;">
                        Create account
                    </button>
                </form>
                
                <div style="margin-top: 32px; font-size: 13px; color: var(--text-secondary); text-align: center;">
                    Already have an account? <a href="#/login" style="color: var(--text-primary); font-weight: 600; text-decoration: none;" class="auth-link">Log in</a>
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
                #toggle-reg-password:hover { color: var(--text-primary) !important; }
            </style>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    const form      = document.getElementById('register-form');
    const errBox    = document.getElementById('reg-error');
    const successBox = document.getElementById('reg-success');
    const btn       = document.getElementById('reg-btn');
    const passInput = document.getElementById('reg-password');
    const toggleBtn = document.getElementById('toggle-reg-password');
    const eyeIcon   = document.getElementById('eye-icon-reg');

    // Toggle Password Visibility
    toggleBtn.addEventListener('click', () => {
        const isPassword = passInput.type === 'password';
        passInput.type = isPassword ? 'text' : 'password';
        
        // Update Icon
        eyeIcon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
        if (window.lucide) window.lucide.createIcons();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.style.display     = 'none';
        successBox.style.display = 'none';
        btn.disabled    = true;
        btn.textContent = 'Creating account...';

        const body = {
            full_name: document.getElementById('reg-fullname').value.trim() || null,
            username:  document.getElementById('reg-username').value.trim(),
            email:     document.getElementById('reg-email').value.trim(),
            password:  passInput.value,
        };

        try {
            const res  = await fetch(`${getApiBase()}/auth/register`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
            });
            const data = await res.json();

            if (!res.ok) {
                const msg = Array.isArray(data.detail)
                    ? data.detail.map(d => d.msg).join(', ')
                    : (data.detail || 'Registration failed');
                errBox.textContent = msg;
                errBox.style.display = 'block';
                btn.disabled    = false;
                btn.textContent = 'Create account';
                return;
            }

            // Auto-login after successful registration
            const loginRes  = await fetch(`${getApiBase()}/auth/login`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ email: body.email, password: body.password }),
            });
            if (loginRes.ok) {
                const loginData = await loginRes.json();
                saveTokens(loginData.access_token, loginData.refresh_token);
                navigate('/portal');
            } else {
                successBox.textContent = 'Account created! Please log in.';
                successBox.style.display = 'block';
                setTimeout(() => navigate('/login'), 1500);
            }

        } catch (err) {
            errBox.textContent = 'Cannot connect to server. Make sure the backend is running.';
            errBox.style.display = 'block';
            btn.disabled    = false;
            btn.textContent = 'Create account';
        }
    });
}

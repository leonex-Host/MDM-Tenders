import { navigate } from '../router.js';

export function renderPortal(container) {
    container.innerHTML = `
        <div class="portal-container fade-in" style="height: 100%; display: flex; flex-direction: column; justify-content: center; position: relative; box-sizing: border-box; width: 100%; padding: 20px;">
            <div style="max-width: 1200px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; justify-content: center; height: 100%;">
                
                <div style="font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #a1a1a1; margin-bottom: 32px; display: flex; align-items: center; gap: 8px;">
                    <div style="width: 8px; height: 8px; background: #f95f26;"></div>
                    TENDER INTELLIGENCE PLATFORM
                </div>

                <h1 class="portal-title" style="font-size: clamp(2.5rem, 6vw, 5.5rem); font-weight: 800; line-height: 1.05; letter-spacing: -0.04em; color: var(--text-primary); margin-bottom: 24px; max-width: 1100px;">
                    Leonex Tenders,<br/>
                    intelligently sourced.
                </h1>

                <p class="portal-desc" style="font-size: clamp(1rem, 1.8vw, 1.3rem); line-height: 1.6; color: var(--text-secondary); max-width: 800px; margin-bottom: 48px;">
                    One platform, multiple sources. Navigate enterprise master data management tenders, leverage deeply integrated AI insights, and effortlessly automate your discovery pipeline — while you focus on what matters.
                </p>

                <!-- Primary Action Buttons (Simplified) & Social Icons -->
                <div class="portal-grid" style="display: flex; flex-wrap: wrap; gap: 16px; align-items: center; max-width: 1000px;">
                    <button id="portal-btn-mdm" class="portal-card" style="background: var(--panel-bg); border: 1px solid var(--border-color); padding: 16px 32px; border-radius: 12px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); font-size: 16px; font-weight: 600; color: var(--text-primary);">
                        MDM Tenders
                    </button>

                    <button id="portal-btn-google" class="portal-card" style="background: var(--panel-bg); border: 1px solid var(--border-color); padding: 16px 32px; border-radius: 12px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); font-size: 16px; font-weight: 600; color: var(--text-primary);">
                        Google MDM Tenders
                    </button>

                    <button id="portal-btn-ai" class="portal-card" style="background: var(--panel-bg); border: 1px solid var(--border-color); padding: 16px 32px; border-radius: 12px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); font-size: 16px; font-weight: 600; color: var(--text-primary);">
                        Leonex AI
                    </button>

                    <!-- Icon Only Links (Website & LinkedIn) -->
                    <div style="display: flex; gap: 16px; align-items: center; margin-left: 8px;">
                        <a href="https://leonex.net/" target="_blank" class="portal-link" style="display: flex; align-items: center; color: var(--text-secondary); transition: color 0.2s ease; padding: 12px; border-radius: 50%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);" title="Official Website">
                            <i data-lucide="globe" style="width: 18px; height: 18px;"></i>
                        </a>
                        <a href="https://www.linkedin.com/company/leonex-systems-pvt-ltd/?originalSubdomain=in" target="_blank" class="portal-link" style="display: flex; align-items: center; color: var(--text-secondary); transition: color 0.2s ease; padding: 12px; border-radius: 50%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);" title="LinkedIn">
                            <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: currentColor;"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                        </a>
                    </div>
                </div>

            </div>
        </div>
        
        <style>
        <style>
            .portal-container {
                background: transparent; 
            }
            
            /* Responsive height handling */
            @media (max-width: 768px) {
                .portal-title { max-width: 100%; font-size: clamp(2.2rem, 8vw, 3rem) !important; margin-bottom: 20px !important; }
                .portal-desc { max-width: 100%; font-size: clamp(1rem, 4vw, 1.2rem) !important; margin-bottom: 32px !important; }
                .portal-grid { flex-direction: column; }
            }
            @media (max-height: 750px) {
                .portal-title { font-size: clamp(2rem, 5vw, 3.5rem) !important; margin-bottom: 12px !important; }
                .portal-desc { font-size: clamp(0.9rem, 1.5vw, 1.1rem) !important; margin-bottom: 24px !important; }
            }
            .portal-card {
                outline: none;
            }
            .portal-card:hover {
                transform: translateY(-2px);
                border-color: var(--text-secondary) !important;
                background: rgba(255,255,255,0.05) !important;
            }
            html[data-theme="light"] .portal-card:hover {
                background: rgba(0,0,0,0.03) !important;
            }
            .portal-link:hover {
                color: var(--text-primary) !important;
            }
            .portal-link:hover .portal-logo-hover {
                filter: grayscale(0%) !important;
                opacity: 1 !important;
            }
        </style>
    `;

    // Event Listeners
    document.getElementById('portal-btn-mdm')?.addEventListener('click', () => {
        navigate('/mdm-tenders');
    });

    document.getElementById('portal-btn-google')?.addEventListener('click', () => {
        navigate('/google');
    });

    document.getElementById('portal-btn-ai')?.addEventListener('click', () => {
        navigate('/ai-overview');
    });

    // Icons
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

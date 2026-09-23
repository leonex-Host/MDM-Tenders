import re

CSS_FILE = r'c:\Users\LEONEX\Desktop\UI\frontend\public\src\styles\components.css'

with open(CSS_FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the skeleton section start and cut everything after it
marker = '\n/* \u2500\u2500 SKELETON LOADERS & PAGINATION \u2500\u2500 */'
cut = content.find(marker)
if cut == -1:
    print('Marker not found, appending at end')
    base = content
else:
    base = content[:cut]

new_css = """

/* \u2500\u2500 SKELETON LOADERS & PAGINATION \u2500\u2500 */

@keyframes skeletonPulseDark {
    0%   { background-color: rgba(255,255,255,0.04); }
    50%  { background-color: rgba(255,255,255,0.12); }
    100% { background-color: rgba(255,255,255,0.04); }
}

@keyframes skeletonPulseLight {
    0%   { background-color: rgba(0,0,0,0.05); }
    50%  { background-color: rgba(0,0,0,0.11); }
    100% { background-color: rgba(0,0,0,0.05); }
}

/* Default (dark mode) skeleton card */
.skeleton-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 12px;
    padding: 22px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 170px;
    width: 100%;
    box-sizing: border-box;
}

/* Light mode override */
[data-theme="light"] .skeleton-card {
    background: #f2f3f5;
    border-color: rgba(0,0,0,0.06);
}

.skeleton-block {
    border-radius: 6px;
    background-color: rgba(255,255,255,0.07);
    animation: skeletonPulseDark 1.6s ease-in-out infinite;
}

[data-theme="light"] .skeleton-block {
    background-color: rgba(0,0,0,0.08);
    animation: skeletonPulseLight 1.6s ease-in-out infinite;
}

.skeleton-title  { height: 20px; width: 70%; }
.skeleton-desc   { height: 13px; width: 100%; }
.skeleton-desc.w60 { width: 60%; }
.skeleton-desc.w80 { width: 80%; }

.skeleton-tags {
    display: flex;
    gap: 8px;
    margin-top: auto;
    padding-top: 8px;
}

.skeleton-tag {
    height: 24px;
    width: 64px;
    border-radius: 20px;
}

/* \u2500\u2500 LOAD MORE BUTTON \u2500\u2500 */
.load-more-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 36px 0 20px;
}

.load-more-info {
    font-size: 12px;
    color: var(--text-tertiary, rgba(128,128,128,0.8));
    letter-spacing: 0.03em;
}

.btn-load-more {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 11px 28px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    color: var(--text-primary, #fff);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease, transform 0.12s ease;
    font-family: inherit;
}

[data-theme="light"] .btn-load-more {
    background: rgba(0,0,0,0.04);
    border-color: rgba(0,0,0,0.12);
    color: #111;
}

.btn-load-more:hover {
    background: rgba(255,255,255,0.11);
    border-color: rgba(255,255,255,0.22);
    transform: translateY(-1px);
}

[data-theme="light"] .btn-load-more:hover {
    background: rgba(0,0,0,0.08);
    border-color: rgba(0,0,0,0.2);
}

.btn-load-more:active {
    transform: translateY(0);
}

.btn-load-more .lm-count {
    font-size: 12px;
    opacity: 0.5;
    font-weight: 400;
}

/* skeleton-grid is a transparent wrapper - inherits parent layout */
.skeleton-grid {
    display: contents;
}
"""

with open(CSS_FILE, 'w', encoding='utf-8') as f:
    f.write(base + new_css)

print('CSS written OK')

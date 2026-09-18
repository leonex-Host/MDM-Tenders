// ============================================
// LEONEX — Canvas Charts
// ============================================

function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function drawBarChart(canvas, data, options = {}) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = rect.width;
    const height = options.height || 220;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    const pad = { top: 20, right: 16, bottom: 36, left: 44 };
    const cW = width - pad.left - pad.right;
    const cH = height - pad.top - pad.bottom;
    const maxVal = Math.max(...data.map(d => d.value)) * 1.2;
    const barW = Math.min(cW / data.length * 0.5, 32);
    const gap = (cW - barW * data.length) / (data.length + 1);

    const gridColor = css('--border-color') || 'rgba(255,255,255,0.06)';
    const textColor = css('--text-tertiary') || '#6B7280';

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (cH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
        const label = Math.round(maxVal - (maxVal / 4) * i);
        ctx.fillStyle = textColor;
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(label, pad.left - 8, y + 3);
    }
    ctx.setLineDash([]);

    // Bars
    data.forEach((d, i) => {
        const x = pad.left + gap + (barW + gap) * i;
        const barH = (d.value / maxVal) * cH;
        const y = pad.top + cH - barH;
        const r = Math.min(barW / 2, 6);

        // Rounded bar path
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, pad.top + cH);
        ctx.lineTo(x, pad.top + cH);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();

        // Gradient
        const grad = ctx.createLinearGradient(x, y, x, y + barH);
        const colors = d.colors || ['#7C5CFF', '#5E3DE6'];
        grad.addColorStop(0, colors[0]);
        grad.addColorStop(1, colors[1]);
        ctx.fillStyle = grad;
        ctx.fill();

        // Stripes on highlighted bar
        if (d.highlight) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + barW - r, y);
            ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
            ctx.lineTo(x + barW, pad.top + cH);
            ctx.lineTo(x, pad.top + cH);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
            ctx.clip();
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1.5;
            for (let sy = y - barW; sy < pad.top + cH; sy += 5) {
                ctx.beginPath();
                ctx.moveTo(x, sy);
                ctx.lineTo(x + barW, sy - barW);
                ctx.stroke();
            }
            ctx.restore();
        }

        // X label
        ctx.fillStyle = d.highlight ? css('--accent-orange') || '#FF7A00' : textColor;
        ctx.font = d.highlight ? '600 11px Inter' : '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.label, x + barW / 2, height - pad.bottom + 18);

        // Value badge on highlighted
        if (d.highlight && d.badgeText) {
            const bx = x + barW / 2;
            const by = y - 14;
            const tw = ctx.measureText(d.badgeText).width + 12;
            ctx.fillStyle = css('--accent-green') || '#10B981';
            ctx.beginPath();
            ctx.roundRect(bx - tw / 2, by - 8, tw, 18, 9);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '600 10px Inter';
            ctx.fillText(d.badgeText, bx, by + 4);
        }
    });
}

export function drawDonutChart(canvas, segments, options = {}) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = options.size || 140;

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const outerR = size / 2 - 4;
    const innerR = outerR * 0.6;
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    const segGap = 0.04;

    let startAngle = -Math.PI / 2;
    segments.forEach(seg => {
        const sweep = (seg.value / total) * Math.PI * 2 - segGap;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, startAngle + sweep);
        ctx.arc(cx, cy, innerR, startAngle + sweep, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = seg.color;
        ctx.fill();
        startAngle += sweep + segGap;
    });

    // Center text
    if (options.centerText) {
        ctx.fillStyle = css('--text-primary') || '#fff';
        ctx.font = 'bold 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(options.centerText, cx, cy - 4);
        if (options.centerSub) {
            ctx.fillStyle = css('--text-tertiary') || '#6B7280';
            ctx.font = '10px Inter, sans-serif';
            ctx.fillText(options.centerSub, cx, cy + 12);
        }
    }
}

export function drawLineChart(canvas, data, options = {}) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = rect.width;
    const height = options.height || 200;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    const pad = { top: 16, right: 16, bottom: 32, left: 44 };
    const cW = width - pad.left - pad.right;
    const cH = height - pad.top - pad.bottom;
    const allVals = data.flatMap(s => s.values);
    const maxVal = Math.max(...allVals) * 1.15;

    const gridColor = css('--border-color') || 'rgba(255,255,255,0.06)';
    const textColor = css('--text-tertiary') || '#6B7280';

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (cH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // X labels
    (options.labels || []).forEach((lbl, i, arr) => {
        const x = pad.left + (cW / (arr.length - 1)) * i;
        ctx.fillStyle = textColor;
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(lbl, x, height - pad.bottom + 16);
    });

    // Lines
    data.forEach(series => {
        const pts = series.values.map((v, i) => ({
            x: pad.left + (cW / (series.values.length - 1)) * i,
            y: pad.top + cH - (v / maxVal) * cH
        }));

        if (series.fill) {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pad.top + cH);
            pts.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.lineTo(pts[pts.length - 1].x, pad.top + cH);
            ctx.closePath();
            const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
            grad.addColorStop(0, series.fill);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fill();
        }

        ctx.beginPath();
        ctx.strokeStyle = series.color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();

        pts.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = series.color;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = css('--bg-card') || '#161A1F';
            ctx.fill();
        });
    });
}

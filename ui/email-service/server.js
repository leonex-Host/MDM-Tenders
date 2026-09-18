/**
 * Leonex Mailer — Node.js Nodemailer Microservice
 * ================================================
 * A lightweight Express server that accepts POST requests
 * and delivers emails via Gmail SMTP using Nodemailer.
 *
 * Endpoints:
 *   POST /send       — Send a single email
 *   POST /send-report — Send tender report to all recipients
 *   GET  /health    — Health check
 */

require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// ── Nodemailer Transporter ──────────────────────────────────────────────────
// This is the core "Nodemailer concept" — create a reusable transporter
// object using Gmail SMTP with your App Password.
const transporter = nodemailer.createTransport({
    service: 'gmail',             // Uses Gmail's well-known SMTP config automatically
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS, // 16-char Google App Password (no spaces)
    },
});

// Verify connection at startup
transporter.verify((error, success) => {
    if (error) {
        console.error('[Mailer] ❌ SMTP connection failed:', error.message);
    } else {
        console.log('[Mailer] ✅ SMTP connection established. Ready to send.');
    }
});

// ── Helpers ────────────────────────────────────────────────────────────────
function buildTenderHtml(tenders, dateStr) {
    const rows = tenders.map(t => `
    <div style="margin-bottom:25px;">
      <p style="margin:0 0 5px 0;"><strong>Tender ID:</strong> ${t.tender_id || 'N/A'}</p>
      <p style="margin:0 0 5px 0;font-size:14px;"><strong>Description:</strong> ${t.description || t.title || 'No description'}</p>
      <p style="margin:0 0 5px 0;font-size:12px;color:#555;">
        <strong>Keyword:</strong> ${t.keyword || 'N/A'} |
        <strong>Source:</strong> ${(t.source || '').toUpperCase()}
      </p>
      <p style="margin:0 0 5px 0;font-size:12px;color:#555;">
        <strong>Start:</strong> ${t.start_date || 'N/A'} |
        <strong>End:</strong> ${t.end_date || 'N/A'}
      </p>
      <p style="margin:0 0 15px 0;font-size:12px;">
        <strong>Link:</strong>
        <a href="${t.link || '#'}" style="color:#000;text-decoration:underline;">${t.link || '#'}</a>
      </p>
      <hr style="border:0;border-top:1px solid #eee;margin:0;">
    </div>
  `).join('');

    const body = rows || '<p style="text-align:center;color:#888;padding:40px;">No new tenders found for this period.</p>';

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#000;margin:0;padding:40px;background:#fff;">
  <div style="max-width:600px;margin:0 auto;">
    <div style="border-left:4px solid #000;padding-left:20px;margin-bottom:40px;">
      <p style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#888;margin:0;">Automated Distribution</p>
      <h2 style="font-size:28px;font-weight:900;margin:5px 0 0 0;letter-spacing:-0.5px;">Tender Intelligence Report</h2>
    </div>
    <p>Hello Team,</p>
    <p>Please find the consolidated tender collection for <strong>${dateStr}</strong> below.</p>
    <div style="margin-top:40px;">${body}</div>
    <p style="font-size:11px;color:#aaa;margin-top:60px;text-align:center;">
      Authorized by Leonex Tender Intelligence Platform.
    </p>
  </div>
</body></html>`;
}

// ── Routes ─────────────────────────────────────────────────────────────────

/** GET /health — used by Python backend to check if mailer is alive */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'leonex-mailer' });
});

/**
 * POST /send
 * Body: { to: string, subject: string, html: string, fromName?: string }
 */
app.post('/send', async (req, res) => {
    const { to, subject, html, fromName = 'Tender Intelligence' } = req.body;

    if (!to || !subject || !html) {
        return res.status(400).json({ error: 'Missing required fields: to, subject, html' });
    }

    const mailOptions = {
        from: `"${fromName}" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[Mailer] ✅ Sent to ${to} — messageId: ${info.messageId}`);
        res.json({ success: true, messageId: info.messageId });
    } catch (err) {
        console.error(`[Mailer] ❌ Failed to send to ${to}:`, err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /send-report
 * Body: {
 *   recipients: [{ email: string, name: string }],
 *   tenders: [...],
 *   date: string      // e.g. "12 Jun 2026"
 * }
 */
app.post('/send-report', async (req, res) => {
    const { recipients = [], tenders = [], date = new Date().toLocaleDateString() } = req.body;

    if (!recipients.length) {
        return res.status(400).json({ error: 'No recipients provided' });
    }

    const html = buildTenderHtml(tenders, date);
    const subject = `Tender Intelligence Report – ${date}`;
    const results = [];

    for (const r of recipients) {
        const mailOptions = {
            from: `"Tender Intelligence" <${process.env.SMTP_USER}>`,
            to: r.email,
            subject,
            html,
        };

        try {
            const info = await transporter.sendMail(mailOptions);
            console.log(`[Mailer] ✅ Report sent to ${r.email} — ${info.messageId}`);
            results.push({ email: r.email, status: 'sent', messageId: info.messageId });
        } catch (err) {
            console.error(`[Mailer] ❌ Failed: ${r.email} — ${err.message}`);
            results.push({ email: r.email, status: 'failed', error: err.message });
        }
    }

    res.json({ results });
});

// ── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`[Mailer] 🚀 Nodemailer service running on port ${PORT}`);
});

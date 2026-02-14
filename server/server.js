require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db/database');
const { sendEmail, brandedHTML, isLocalUrl } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const SALT_ROUNDS = 10;

// ---- Directories ----
const uploadsDir = path.join(__dirname, '..', 'uploads');
const invoicesDir = path.join(__dirname, '..', 'invoices');
const backupsDir = path.join(__dirname, '..', 'backups');
[uploadsDir, invoicesDir, backupsDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ---- Auto-create admin user from .env on first run ----
(async () => {
    if (db.adminUserCount() === 0) {
        const u = process.env.ADMIN_USER || 'admin';
        const p = process.env.ADMIN_PASS || 'studio2025';
        const hash = await bcrypt.hash(p, SALT_ROUNDS);
        db.createAdminUser(u, hash);
        console.log(`✅ Default admin created: ${u}`);
    }
})();

// ---- Multer + Sharp image compression ----
const tmpDir = path.join(__dirname, '..', 'uploads', 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (r, f, cb) => cb(null, tmpDir),
    filename: (r, f, cb) => {
        const ext = path.extname(f.originalname);
        const name = f.originalname.replace(ext, '').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
        cb(null, name + '-' + Date.now() + ext);
    },
});
const upload = multer({
    storage, limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (r, f, cb) => {
        const ok = /jpeg|jpg|png|gif|webp|svg|ico/.test(path.extname(f.originalname).toLowerCase());
        cb(ok ? null : new Error('Images only'), ok);
    }
});

async function compressImage(tmpPath, filename) {
    try {
        const sharp = require('sharp');
        const ext = path.extname(filename).toLowerCase();
        const outName = filename.replace(ext, '') + '.webp';
        const outPath = path.join(uploadsDir, outName);

        if (['.svg', '.ico', '.gif'].includes(ext)) {
            // Don't compress SVG/ICO/GIF — just move
            const finalPath = path.join(uploadsDir, filename);
            fs.renameSync(tmpPath, finalPath);
            return `/uploads/${filename}`;
        }

        await sharp(tmpPath)
            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(outPath);

        // Remove temp file
        try { fs.unlinkSync(tmpPath); } catch(e) {}
        return `/uploads/${outName}`;
    } catch (err) {
        // If sharp fails (not installed), just move the file
        console.warn('Sharp not available, skipping compression:', err.message);
        const finalPath = path.join(uploadsDir, filename);
        fs.renameSync(tmpPath, finalPath);
        return `/uploads/${filename}`;
    }
}

// ---- PDF Invoice Generation ----
async function generateInvoice(booking, statusOverride) {
    try {
        const PDFDocument = require('pdfkit');
        const settings = db.getAllSettings();
        const company = settings.company_name || 'CreativeStudio';
        const navy = settings.color_primary || '#1a2744';
        const accent = settings.color_accent || '#c4854c';
        const ref = booking.reference;
        const status = statusOverride || booking.status || 'pending';
        const fileName = `invoice-${ref}.pdf`;
        const filePath = path.join(invoicesDir, fileName);

        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const stream = fs.createWriteStream(filePath);
            doc.pipe(stream);

            // Header — company info
            doc.fontSize(24).font('Helvetica-Bold').fillColor(navy).text(company, 50, 50);
            doc.fontSize(9).font('Helvetica').fillColor('#6b7080');
            let headerY = 80;
            if (settings.email) { doc.text(settings.email, 50, headerY); headerY += 14; }
            if (settings.phone) { doc.text(settings.phone, 50, headerY); headerY += 14; }
            if (settings.address) { doc.text(settings.address, 50, headerY); headerY += 14; }

            // Invoice title + ref
            doc.fontSize(28).font('Helvetica-Bold').fillColor(navy).text('INVOICE', 350, 50, { align: 'right' });
            doc.fontSize(10).font('Helvetica').fillColor('#6b7080')
                .text(`Ref: ${ref}`, 350, 85, { align: 'right' })
                .text(`Date: ${new Date(booking.created_at).toLocaleDateString()}`, 350, 100, { align: 'right' });

            // Header note (admin-editable)
            const pdfHeaderNote = settings.pdf_header_note || '';
            let dividerY = 140;
            if (pdfHeaderNote) {
                doc.fontSize(9).font('Helvetica-Oblique').fillColor('#6b7080').text(pdfHeaderNote, 50, 135, { width: 495 });
                dividerY = doc.y + 10;
            }

            // Divider
            doc.moveTo(50, dividerY).lineTo(545, dividerY).strokeColor('#e0e0e0').stroke();

            // Bill to
            const billY = dividerY + 20;
            doc.fontSize(10).font('Helvetica-Bold').fillColor(navy).text('BILL TO', 50, billY);
            doc.fontSize(10).font('Helvetica').fillColor('#2c3040');
            let clientY = billY + 18;
            doc.text(booking.name, 50, clientY); clientY += 15;
            doc.text(booking.email, 50, clientY); clientY += 15;
            if (booking.phone) { doc.text(booking.phone, 50, clientY); clientY += 15; }

            // Table header
            const tY = clientY + 20;
            doc.rect(50, tY, 495, 28).fillColor(navy).fill();
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff')
                .text('ITEM', 60, tY + 8)
                .text('AMOUNT', 440, tY + 8, { align: 'right' });

            // Service line
            let y = tY + 38;
            doc.fontSize(10).font('Helvetica').fillColor('#2c3040')
                .text(booking.service || 'Service', 60, y)
                .text(`$${booking.base_price || booking.total_amount || 0}`, 440, y, { align: 'right' });

            // Addons
            let addons = [];
            try { addons = JSON.parse(booking.addons || '[]'); } catch(e) {}
            addons.forEach(a => {
                y += 22;
                doc.text(`  + ${a.name || a}`, 60, y)
                    .text(a.price ? `$${a.price}` : '', 440, y, { align: 'right' });
            });

            // Total
            y += 40;
            doc.moveTo(300, y).lineTo(545, y).strokeColor('#e0e0e0').stroke();
            y += 12;
            doc.fontSize(14).font('Helvetica-Bold').fillColor(navy)
                .text('TOTAL', 300, y)
                .text(`$${booking.total_amount || 0}`, 440, y, { align: 'right' });

            // Status badge
            y += 40;
            const statusColors = { pending:'#c4854c', confirmed:'#1e64c8', 'in-progress':'#1e64c8', completed:'#228b54', delivered:'#228b54' };
            const sColor = statusColors[status] || accent;
            doc.fontSize(11).font('Helvetica-Bold').fillColor(sColor)
                .text(`Status: ${status.toUpperCase()}`, 50, y);

            // Footer — admin-editable notes
            const footerNote = settings.pdf_footer_note || settings.invoice_notes || 'Thank you for your business!';
            doc.fontSize(9).font('Helvetica').fillColor('#9399a8')
                .text(footerNote, 50, 710, { align: 'center', width: 495 })
                .text(`Thank you for choosing ${company}!`, 50, 730, { align: 'center' })
                .text('This invoice was generated automatically.', 50, 745, { align: 'center' });

            // Accent bar at bottom
            doc.rect(50, 770, 495, 3).fillColor(accent).fill();

            doc.end();
            stream.on('finish', () => resolve({ filePath, fileName, url: `/invoices/${fileName}` }));
            stream.on('error', reject);
        });
    } catch (err) {
        console.warn('Invoice generation failed:', err.message);
        return null;
    }
}

// ---- Middleware ----
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(uploadsDir));
app.use('/invoices', express.static(invoicesDir));

// ---- JWT Auth Middleware ----
function adminAuth(req, res, next) {
    const a = req.headers.authorization;
    if (!a) return res.status(401).json({ error: 'Auth required' });

    // Support both JWT Bearer and legacy Basic auth
    if (a.startsWith('Bearer ')) {
        try {
            const decoded = jwt.verify(a.split(' ')[1], JWT_SECRET);
            req.adminUser = decoded.username;
            return next();
        } catch(e) {
            return res.status(401).json({ error: 'Invalid token' });
        }
    }

    // Legacy Basic auth fallback (for transition)
    if (a.startsWith('Basic ')) {
        const [u, p] = Buffer.from(a.split(' ')[1], 'base64').toString().split(':');
        const user = db.getAdminUser(u);
        if (user) {
            try {
                // bcrypt.compareSync for Basic auth fallback
                if (bcrypt.compareSync(p, user.password_hash)) {
                    req.adminUser = u;
                    return next();
                }
            } catch(e) {}
        }
    }

    res.status(401).json({ error: 'Invalid credentials' });
}

// ============================= PUBLIC =============================

app.get('/api/health', (r, s) => s.json({ status: 'ok', time: new Date().toISOString() }));

// JWT Login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

        const user = db.getAdminUser(username);
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ username, id: user.id }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ ok: true, token });
    } catch(e) {
        console.error('Login error:', e);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Settings (public)
app.get('/api/settings', (r, s) => s.json(db.getAllSettings()));
app.get('/api/config', (r, s) => s.json({ paystackKey: process.env.PAYSTACK_PUBLIC_KEY || '' }));

// Pages (public)
app.get('/api/pages/:slug', (req, res) => {
    const page = db.getPage(req.params.slug);
    if (!page) return res.status(404).json({ error: 'Page not found' });
    res.json(page);
});

// Contact
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        if (!name || !email || !message) return res.status(400).json({ error: 'Name, email, message required.' });
        const id = db.saveContact({ name, email, subject, message });
        const settings = db.getAllSettings();

        // Notify admin
        try {
            const navy = settings.color_primary || '#1a2744';
            const accent = settings.color_accent || '#c4854c';
            const adminUrl = getSiteUrl(settings);
            const viewBtn = adminUrl && !isLocalUrl(adminUrl) ? `<p style="margin:20px 0 0"><a href="${adminUrl}/admin" style="display:inline-block;background:${navy};color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">View in Admin</a></p>` : '';
            await sendEmail({
                to: process.env.NOTIFY_EMAIL || settings.email || '',
                subject: `New Contact: ${subject || 'No subject'} from ${name}`,
                html: brandedHTML(`
                    <h2 style="color:${navy};margin:0 0 16px;font-size:1.3rem">📩 New Message</h2>
                    <div style="background:#faf8f5;padding:16px 20px;border-radius:8px;margin-bottom:16px">
                        <p style="margin:4px 0"><strong>From:</strong> ${name}</p>
                        <p style="margin:4px 0"><strong>Email:</strong> <a href="mailto:${email}" style="color:${accent}">${email}</a></p>
                        <p style="margin:4px 0"><strong>Subject:</strong> ${subject || '—'}</p>
                    </div>
                    <div style="padding:16px 0;border-top:1px solid #eee">
                        <p style="margin:0;white-space:pre-wrap">${message}</p>
                    </div>
                    ${viewBtn}
                `, settings),
                replyTo: email,
                settings
            });
        } catch(e) { console.warn('Email failed:', e.message); }
        res.json({ ok: true, id });
    } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

// Newsletter (with unsubscribe token)
app.post('/api/newsletter', (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required.' });
        if (db.getSubscriber(email)) return res.json({ ok: true });
        const token = crypto.randomBytes(24).toString('hex');
        db.saveSubscriber(email, token);
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

// Newsletter Unsubscribe
app.get('/api/newsletter/unsubscribe/:token', (req, res) => {
    const sub = db.getSubscriberByToken(req.params.token);
    if (!sub) {
        return res.send(renderUnsubPage('Not Found', 'This unsubscribe link is invalid or has already been used.'));
    }
    db.deleteSubscriberByToken(req.params.token);
    res.send(renderUnsubPage('Unsubscribed', `You've been successfully unsubscribed. You won't receive further emails from us.`));
});

function renderUnsubPage(title, msg) {
    const s = db.getAllSettings();
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Source Sans 3',sans-serif;background:${s.color_background||'#faf8f5'};min-height:100vh;display:flex;align-items:center;justify-content:center}
.box{text-align:center;padding:3rem;max-width:460px}.box h1{color:${s.color_primary||'#1a2744'};font-size:1.8rem;margin-bottom:1rem}.box p{color:#6b7080;line-height:1.7;margin-bottom:2rem}
a{color:${s.color_accent||'#c4854c'};text-decoration:none;font-weight:600}</style></head>
<body><div class="box"><h1>${title}</h1><p>${msg}</p><a href="/">← Back to ${s.company_name||'CreativeStudio'}</a></div></body></html>`;
}

// ---- Template processor: merge tags → HTML ----
function processTemplate(template, data) {
    let text = (template || '')
        .replace(/\{\{name\}\}/g, data.name || '')
        .replace(/\{\{service\}\}/g, data.service || '')
        .replace(/\{\{amount\}\}/g, data.amount || '')
        .replace(/\{\{reference\}\}/g, data.reference || '')
        .replace(/\{\{company\}\}/g, data.company || '')
        .replace(/\{\{status\}\}/g, data.status || '');

    // Convert markdown bold and list syntax to HTML
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .split('\n').map(line => {
            if (line.match(/^[•●]\s/)) return `<li style="padding:2px 0;margin-left:20px">${line.replace(/^[•●]\s/, '')}</li>`;
            if (line.match(/^\d+\.\s/)) return `<li style="padding:2px 0;margin-left:20px">${line.replace(/^\d+\.\s/, '')}</li>`;
            if (!line.trim()) return '<br>';
            return `<p style="margin:6px 0">${line}</p>`;
        }).join('');
}

// ---- Build booking details card for emails ----
function buildDetailsCard(opts) {
    const { reference, service, amount, addons, status, navy } = opts;
    const clr = navy || '#1a2744';

    const row = (label, value, isLast) => `
        <tr>
            <td style="padding:12px 24px;color:#6b7080;font-size:14px;${isLast ? '' : 'border-bottom:1px solid #f0ece6;'}vertical-align:middle">${label}</td>
            <td style="padding:12px 24px;text-align:right;font-size:14px;font-weight:600;color:#2c3040;${isLast ? '' : 'border-bottom:1px solid #f0ece6;'}vertical-align:middle">${value}</td>
        </tr>`;

    let rows = '';
    rows += row('Reference', `<span style="font-family:'Courier New',Courier,monospace;font-size:13px;background:#f0ece6;padding:3px 8px;border-radius:4px">#${reference}</span>`, false);
    rows += row('Service', service, false);
    if (status) {
        const statusColors = { pending:'#c4854c', confirmed:'#1e64c8', 'in-progress':'#1e64c8', completed:'#228b54', delivered:'#228b54' };
        const sClr = statusColors[status] || '#c4854c';
        const displayStatus = status.charAt(0).toUpperCase() + status.slice(1).replace(/-/g, ' ');
        rows += row('Status', `<span style="color:${sClr};font-weight:700">${displayStatus}</span>`, false);
    }

    // Addons rows (if any)
    let addonRows = '';
    if (addons && addons.length) {
        addonRows = `<tr><td colspan="2" style="padding:10px 24px 4px;border-bottom:none"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:0 0 6px;font-size:11px;font-weight:700;color:#6b7080;text-transform:uppercase;letter-spacing:0.5px">Add-ons</td></tr>
            ${addons.map(a => `<tr><td style="padding:3px 0;color:#2c3040;font-size:13px">+ ${a.name || a}</td><td style="padding:3px 0;text-align:right;color:#6b7080;font-size:13px">${a.price ? `$${a.price}` : ''}</td></tr>`).join('')}
        </table></td></tr>`;
    }

    // Total row
    const totalRow = `
        <tr>
            <td style="padding:16px 24px;border-top:2px solid ${clr}22;font-weight:700;font-size:17px;color:${clr};vertical-align:middle">Total</td>
            <td style="padding:16px 24px;border-top:2px solid ${clr}22;text-align:right;font-weight:700;font-size:17px;color:${clr};vertical-align:middle">${amount}</td>
        </tr>`;

    return `
    <!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px 0"><![endif]-->
    <div style="margin:24px 0;border-radius:8px;overflow:hidden;border:1px solid #e8e4df">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5">
            ${rows}
            ${addonRows}
            ${totalRow}
        </table>
    </div>
    <!--[if mso]></td></tr></table><![endif]-->`;
}

// ---- Build CTA button for emails ----
function buildCTAButton(text, url, color) {
    // Don't show button if URL is localhost or empty
    if (!url || isLocalUrl(url)) return '';
    return `<div style="text-align:center;margin:28px 0 16px"><a href="${url}" style="display:inline-block;background:${color || '#1a2744'};color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;mso-padding-alt:0;text-align:center"><!--[if mso]><i style="letter-spacing:36px;mso-font-width:-100%;mso-text-raise:21pt">&nbsp;</i><![endif]--><span style="mso-text-raise:10pt">${text}</span><!--[if mso]><i style="letter-spacing:36px;mso-font-width:-100%">&nbsp;</i><![endif]--></a></div>`;
}

function getSiteUrl(settings) {
    return settings.site_url || process.env.SITE_URL || '';
}

// Bookings
app.post('/api/bookings', async (req, res) => {
    try {
        const d = req.body;
        const id = db.saveBooking({ ...d, addons: JSON.stringify(d.addons || []) });

        // Generate invoice
        const booking = db.getBookingByRef(d.reference);
        let invoiceResult = null;
        if (booking) {
            invoiceResult = await generateInvoice(booking);
            if (invoiceResult) db.setBookingInvoice(d.reference, invoiceResult.url);
        }

        // Get settings for branding
        const settings = db.getAllSettings();
        const companyName = settings.company_name || 'CreativeStudio';
        const adminEmail = settings.email || process.env.NOTIFY_EMAIL || process.env.SMTP_USER || '';
        const siteUrl = getSiteUrl(settings);
        const invoiceNotes = settings.invoice_notes || '';
        const navy = settings.color_primary || '#1a2744';

        // Email subject from template (with merge tags)
        const mergeData = { name: d.name, service: d.service, amount: `$${d.totalAmount}`, reference: d.reference, company: companyName };
        const subjectTpl = settings.email_subject_booking || 'Booking Confirmed — #{{reference}}';
        const emailSubject = subjectTpl
            .replace(/\{\{name\}\}/g, d.name).replace(/\{\{service\}\}/g, d.service)
            .replace(/\{\{amount\}\}/g, `$${d.totalAmount}`).replace(/\{\{reference\}\}/g, d.reference);

        // Email body from template
        const bodyTpl = settings.email_body_booking || `Hi {{name}}!\n\nThank you for choosing us! Your booking has been confirmed.`;
        const bodyHTML = processTemplate(bodyTpl, mergeData);

        // Confirmation email to CLIENT with invoice
        const invoiceNote = invoiceResult
            ? '<p style="margin:20px 0 0;font-size:13px;color:#999;text-align:center">📎 Your invoice is attached to this email.</p>'
            : '';
        const emailOpts = {
            to: d.email,
            subject: emailSubject,
            html: brandedHTML(`
                ${bodyHTML}
                ${buildDetailsCard({ reference: d.reference, service: d.service, amount: `$${d.totalAmount}`, addons: d.addons || [], navy })}
                ${buildCTAButton('Track Your Booking', siteUrl + '/#tracker', navy)}
                ${invoiceNotes ? `<div style="margin:20px 0 0;padding:16px;background:#faf8f5;border-radius:6px;font-size:13px;color:#6b7080;text-align:center">${invoiceNotes}</div>` : ''}
                ${invoiceNote}
                <p style="margin:12px 0 0;font-size:13px;color:#bbb;text-align:center">Reply to this email if you have any questions.</p>
            `, settings),
            replyTo: adminEmail,
            settings
        };
        if (invoiceResult) emailOpts.attachments = [{ filename: invoiceResult.fileName, path: invoiceResult.filePath }];

        try { await sendEmail(emailOpts); console.log('✅ Confirmation email sent to', d.email); } catch(e) { console.error('❌ Client email FAILED:', e.message, e.stack); }

        // Notification to ADMIN
        try {
            const adminViewBtn = !isLocalUrl(siteUrl) && siteUrl ? `<p style="margin:20px 0 0"><a href="${siteUrl}/admin" style="display:inline-block;background:${navy};color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">View in Admin</a></p>` : '';
            await sendEmail({
                to: process.env.NOTIFY_EMAIL || adminEmail,
                subject: `💰 New Booking! ${d.service} — $${d.totalAmount}`,
                html: brandedHTML(`
                    <h2 style="color:${navy};margin:0 0 16px;font-size:1.3rem">🎉 New Booking Received</h2>
                    <div style="background:#faf8f5;padding:16px 20px;border-radius:8px">
                        <p style="margin:4px 0"><strong>Client:</strong> ${d.name} (<a href="mailto:${d.email}" style="color:${settings.color_accent || '#c4854c'}">${d.email}</a>)</p>
                        <p style="margin:4px 0"><strong>Service:</strong> ${d.service}</p>
                        <p style="margin:4px 0"><strong>Amount:</strong> <span style="font-size:1.2rem;font-weight:700;color:${navy}">$${d.totalAmount}</span></p>
                        <p style="margin:4px 0"><strong>Reference:</strong> <code>${d.reference}</code></p>
                        ${d.phone ? `<p style="margin:4px 0"><strong>Phone:</strong> ${d.phone}</p>` : ''}
                    </div>
                    ${adminViewBtn}
                `, settings),
                replyTo: d.email,
                settings
            });
        } catch(e) {}

        res.json({ ok: true, id, invoice: invoiceResult?.url });
    } catch(e) { console.error('Booking error:', e); res.status(500).json({ error: 'Failed.' }); }
});

// Booking tracker (public)
app.get('/api/bookings/track/:ref', (req, res) => {
    const b = db.getBookingByRef(req.params.ref);
    if (!b) return res.status(404).json({ error: 'Booking not found. Check your reference code.' });
    res.json({
        reference: b.reference, service: b.service, status: b.status,
        total_amount: b.total_amount, created_at: b.created_at,
        name: b.name
    });
});

// Portfolio (public)
app.get('/api/portfolio', (r, s) => s.json(db.getVisiblePortfolio().map(i => ({ ...i, tags: JSON.parse(i.tags || '[]') }))));

// Reviews (public)
app.get('/api/reviews', (r, s) => s.json(db.getApprovedReviews()));
app.post('/api/reviews', async (req, res) => {
    try {
        const d = req.body;
        if (!d.name || !d.email || !d.text) return res.status(400).json({ error: 'Name, email, review required.' });
        const id = db.saveReview(d);
        const settings = db.getAllSettings();
        const siteUrl = getSiteUrl(settings);
        const navy = settings.color_primary || '#1a2744';
        const accent = settings.color_accent || '#c4854c';
        const stars = '★'.repeat(d.rating) + '☆'.repeat(5 - d.rating);
        const reviewAdminBtn = siteUrl && !isLocalUrl(siteUrl) ? `<p style="margin:12px 0 0"><a href="${siteUrl}/admin" style="display:inline-block;background:${navy};color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Review in Admin</a></p>` : '';
        try {
            await sendEmail({
                to: process.env.NOTIFY_EMAIL || settings.email || '',
                subject: `⭐ New Review from ${d.name} — ${d.rating}★`,
                html: brandedHTML(`
                    <h2 style="color:${navy};margin:0 0 16px;font-size:1.3rem">⭐ New Review Submitted</h2>
                    <div style="background:#faf8f5;padding:16px 20px;border-radius:8px;margin-bottom:16px">
                        <p style="margin:0 0 8px;font-size:1.2rem;color:${accent};letter-spacing:2px">${stars}</p>
                        <p style="margin:0;font-style:italic;color:#2c3040;line-height:1.7">"${d.text}"</p>
                    </div>
                    <p style="margin:4px 0"><strong>Client:</strong> ${d.name} (<a href="mailto:${d.email}" style="color:${accent}">${d.email}</a>)</p>
                    ${d.service_used ? `<p style="margin:4px 0"><strong>Service:</strong> ${d.service_used}</p>` : ''}
                    <p style="margin:20px 0 0;font-size:13px;color:#999">This review needs your approval before it appears on the site.</p>
                    ${reviewAdminBtn}
                `, settings),
                settings
            });
        } catch(e) {}
        res.json({ ok: true, id });
    } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

// Paystack webhook
app.post('/api/paystack/webhook', (req, res) => {
    try {
        const sec = process.env.PAYSTACK_SECRET_KEY;
        if (sec) { const h = crypto.createHmac('sha512', sec).update(JSON.stringify(req.body)).digest('hex'); if (h !== req.headers['x-paystack-signature']) return res.status(401).end(); }
        if (req.body.event === 'charge.success') db.updateBookingStatus(req.body.data.reference, 'confirmed');
        res.sendStatus(200);
    } catch(e) { res.sendStatus(500); }
});

// ============================= ADMIN =============================

app.get('/api/admin/stats', adminAuth, (r, s) => s.json(db.getStats()));

// Settings
app.get('/api/admin/settings', adminAuth, (r, s) => s.json(db.getAllSettings()));
app.put('/api/admin/settings', adminAuth, (req, res) => {
    try { db.setSettings(req.body); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

// Pages
app.get('/api/admin/pages', adminAuth, (r, s) => s.json(db.getAllPages()));
app.get('/api/admin/pages/:slug', adminAuth, (req, res) => { const p = db.getPage(req.params.slug); if (!p) return res.status(404).json({ error: 'Not found' }); res.json(p); });
app.put('/api/admin/pages/:slug', adminAuth, (req, res) => { try { db.savePage(req.params.slug, req.body.title, req.body.content); res.json({ ok: true }); } catch(e) { res.status(500).json({ error: 'Failed.' }); } });

// Portfolio
app.get('/api/admin/portfolio', adminAuth, (r, s) => s.json(db.getAllPortfolio().map(i => ({ ...i, tags: JSON.parse(i.tags || '[]') }))));
app.post('/api/admin/portfolio', adminAuth, (req, res) => { try { const d = req.body; if (!d.title || !d.category || !d.image_url) return res.status(400).json({ error: 'Required fields missing.' }); res.json({ ok: true, id: db.addPortfolioItem(d) }); } catch(e) { res.status(500).json({ error: 'Failed.' }); } });
app.put('/api/admin/portfolio/:id', adminAuth, (req, res) => { try { db.updatePortfolioItem(+req.params.id, req.body); res.json({ ok: true }); } catch(e) { res.status(500).json({ error: 'Failed.' }); } });
app.delete('/api/admin/portfolio/:id', adminAuth, (req, res) => { try { db.deletePortfolioItem(+req.params.id); res.json({ ok: true }); } catch(e) { res.status(500).json({ error: 'Failed.' }); } });
app.patch('/api/admin/portfolio/:id/toggle', adminAuth, (req, res) => { try { db.togglePortfolioVisibility(+req.params.id); res.json({ ok: true }); } catch(e) { res.status(500).json({ error: 'Failed.' }); } });

// Upload (with sharp compression)
app.post('/api/admin/upload', adminAuth, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file.' });
    try {
        const url = await compressImage(req.file.path, req.file.filename);
        res.json({ ok: true, url });
    } catch(e) {
        console.error('Upload error:', e);
        res.status(500).json({ error: 'Upload failed.' });
    }
});

// Contacts
app.get('/api/admin/contacts', adminAuth, (r, s) => s.json(db.getAllContacts()));
app.patch('/api/admin/contacts/:id/read', adminAuth, (req, res) => { db.markContactRead(+req.params.id); res.json({ ok: true }); });
app.delete('/api/admin/contacts/:id', adminAuth, (req, res) => { db.deleteContact(+req.params.id); res.json({ ok: true }); });

// Bookings (with status update → email + PDF)
app.get('/api/admin/bookings', adminAuth, (r, s) => s.json(db.getAllBookings()));
app.patch('/api/admin/bookings/:ref/status', adminAuth, async (req, res) => {
    try {
        const ref = req.params.ref;
        const newStatus = req.body.status;
        db.updateBookingStatus(ref, newStatus);

        // Get full booking data
        const booking = db.getBookingByRef(ref);
        if (!booking) return res.json({ ok: true });

        const settings = db.getAllSettings();
        const companyName = settings.company_name || 'CreativeStudio';
        const adminEmail = settings.email || process.env.NOTIFY_EMAIL || process.env.SMTP_USER || '';
        const siteUrl = getSiteUrl(settings);

        // Regenerate invoice PDF with new status
        let invoiceResult = null;
        try {
            invoiceResult = await generateInvoice(booking, newStatus);
            if (invoiceResult) db.setBookingInvoice(ref, invoiceResult.url);
        } catch(e) { console.warn('Invoice regen failed:', e.message); }

        // Build merge data
        const mergeData = {
            name: booking.name, service: booking.service || '',
            amount: `$${booking.total_amount || 0}`, reference: ref,
            company: companyName, status: newStatus
        };

        // Get the email template for this status
        const statusKey = newStatus.replace(/-/g, '_'); // "in-progress" → "in_progress"
        const subjectTpl = settings[`email_subject_${statusKey}`] || '';
        const bodyTpl = settings[`email_body_${statusKey}`] || '';

        // Only send if there's a template for this status
        if (subjectTpl && bodyTpl) {
            const subject = subjectTpl
                .replace(/\{\{name\}\}/g, booking.name).replace(/\{\{service\}\}/g, booking.service || '')
                .replace(/\{\{amount\}\}/g, `$${booking.total_amount || 0}`).replace(/\{\{reference\}\}/g, ref)
                .replace(/\{\{status\}\}/g, newStatus);
            const bodyHTML = processTemplate(bodyTpl, mergeData);
            const navy = settings.color_primary || '#1a2744';

            let addonsParsed = [];
            try { addonsParsed = JSON.parse(booking.addons || '[]'); } catch(e) {}

            const statusInvoiceNote = invoiceResult
                ? '<p style="margin:20px 0 0;font-size:13px;color:#999;text-align:center">📎 Your updated invoice is attached.</p>'
                : '';
            const emailOpts = {
                to: booking.email,
                subject,
                html: brandedHTML(`
                    ${bodyHTML}
                    ${buildDetailsCard({ reference: ref, service: booking.service || '', amount: `$${booking.total_amount || 0}`, addons: addonsParsed, status: newStatus, navy })}
                    ${buildCTAButton('Track Your Booking', siteUrl + '/#tracker', navy)}
                    ${statusInvoiceNote}
                    <p style="margin:12px 0 0;font-size:13px;color:#bbb;text-align:center">Reply to this email if you have any questions.</p>
                `, settings),
                replyTo: adminEmail,
                settings
            };
            if (invoiceResult) emailOpts.attachments = [{ filename: invoiceResult.fileName, path: invoiceResult.filePath }];

            try { await sendEmail(emailOpts); console.log(`✅ Status update email sent to ${booking.email} (${newStatus})`); }
            catch(e) { console.error('❌ Status email failed:', e.message); }
        }

        res.json({ ok: true, emailSent: !!(subjectTpl && bodyTpl) });
    } catch(e) { console.error('Status update error:', e); res.status(500).json({ error: 'Failed.' }); }
});
app.delete('/api/admin/bookings/:id', adminAuth, (req, res) => {
    try { db.deleteBooking(+req.params.id); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: 'Failed.' }); }
});
app.delete('/api/admin/bookings', adminAuth, (req, res) => {
    try { db.clearAllBookings(); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

// Revenue offset
app.put('/api/admin/revenue-offset', adminAuth, (req, res) => {
    try {
        const val = parseInt(req.body.offset) || 0;
        db.setSetting('revenue_offset', String(val));
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

// Send message to client (from admin)
app.post('/api/admin/send-message', adminAuth, async (req, res) => {
    try {
        const { to, subject, message } = req.body;
        if (!to || !subject || !message) return res.status(400).json({ error: 'To, subject, and message required.' });

        const settings = db.getAllSettings();
        const adminEmail = settings.email || process.env.SMTP_USER || process.env.SMTP_USER || '';

        const bodyHTML = message.split('\n').map(line =>
            line.trim() ? `<p style="margin:6px 0">${line}</p>` : '<br>'
        ).join('');

        await sendEmail({
            to,
            subject,
            html: brandedHTML(`
                ${bodyHTML}
                <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee">
                    <p style="margin:0;font-size:13px;color:#999">Reply to this email to respond directly.</p>
                </div>
            `, settings),
            replyTo: adminEmail,
            settings
        });

        res.json({ ok: true });
    } catch(e) {
        console.error('Send message error:', e);
        res.status(500).json({ error: 'Failed to send message.' });
    }
});

// Subscribers
app.get('/api/admin/subscribers', adminAuth, (r, s) => s.json(db.getAllSubscribers()));
app.delete('/api/admin/subscribers/:id', adminAuth, (req, res) => { db.deleteSubscriber(+req.params.id); res.json({ ok: true }); });

// Reviews
app.get('/api/admin/reviews', adminAuth, (r, s) => s.json(db.getAllReviews()));
app.patch('/api/admin/reviews/:id/approve', adminAuth, (req, res) => { db.updateReviewStatus(+req.params.id, 'approved'); res.json({ ok: true }); });
app.patch('/api/admin/reviews/:id/reject', adminAuth, (req, res) => { db.updateReviewStatus(+req.params.id, 'rejected'); res.json({ ok: true }); });
app.delete('/api/admin/reviews/:id', adminAuth, (req, res) => { db.deleteReview(+req.params.id); res.json({ ok: true }); });

// Backup
app.post('/api/admin/backup', adminAuth, (req, res) => {
    try {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const dest = path.join(backupsDir, `backup-${ts}.db`);
        db.db.backup(dest).then(() => res.json({ ok: true, file: dest }));
    } catch(e) { res.status(500).json({ error: 'Backup failed: ' + e.message }); }
});

// Serve legal pages
app.get('/terms', (req, res) => { res.send(renderLegalPage(db.getPage('terms'), db.getAllSettings())); });
app.get('/privacy', (req, res) => { res.send(renderLegalPage(db.getPage('privacy'), db.getAllSettings())); });

function renderLegalPage(page, s) {
    if (!page) return '<h1>Page not found</h1>';
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${page.title} — ${s.company_name || 'CreativeStudio'}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Source+Sans+3:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>:root{--navy:${s.color_primary || '#1a2744'};--warm:${s.color_accent || '#c4854c'};--bg:${s.color_background || '#faf8f5'};}
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Source Sans 3',sans-serif;background:var(--bg);color:#2c3040;line-height:1.8}
.header{background:var(--navy);padding:1.5rem 0;text-align:center}.header a{color:#fff;text-decoration:none;font-size:1.2rem;font-weight:700;font-family:'Playfair Display',serif}.header a span{color:var(--warm)}
.content{max-width:800px;margin:0 auto;padding:3rem 2rem}h2{font-family:'Playfair Display',serif;color:var(--navy);font-size:2rem;margin-bottom:1.5rem}h3{color:var(--navy);margin:2rem 0 .8rem;font-size:1.15rem}p{margin-bottom:1rem;color:#6b7080}
.footer{text-align:center;padding:2rem;font-size:.82rem;color:#9399a8;border-top:1px solid rgba(26,39,68,.08)}</style></head>
<body><div class="header"><a href="/">${s.company_name || 'Creative'}<span>.</span>${s.company_name ? '' : 'Studio'}</a></div>
<div class="content">${page.content}</div>
<div class="footer"><p>&copy; ${new Date().getFullYear()} ${s.company_name || 'CreativeStudio'}. All rights reserved. <a href="/" style="color:var(--warm);text-decoration:none">Back to site</a></p></div></body></html>`;
}

app.listen(PORT, () => { console.log(`\n🚀 Server: http://localhost:${PORT}\n🔧 Admin:  http://localhost:${PORT}/admin\n`); });

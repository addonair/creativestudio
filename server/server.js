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

// ---- Delivery file uploads ----
const deliveriesDir = path.join(__dirname, '..', 'deliveries');
if (!fs.existsSync(deliveriesDir)) fs.mkdirSync(deliveriesDir, { recursive: true });
const deliveryStorage = multer.diskStorage({
    destination: (r, f, cb) => cb(null, deliveriesDir),
    filename: (r, f, cb) => cb(null, Date.now() + '-' + f.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')),
});
const deliveryUpload = multer({ storage: deliveryStorage, limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB

// ---- Scheduled backup interval (every 24h) ----
setInterval(() => {
    try {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const dest = path.join(backupsDir, `auto-backup-${ts}.db`);
        db.db.backup(dest).then(() => {
            console.log('✅ Auto-backup created:', dest);
            // Keep only last 7 auto-backups
            const files = fs.readdirSync(backupsDir).filter(f => f.startsWith('auto-backup-')).sort();
            while (files.length > 7) { try { fs.unlinkSync(path.join(backupsDir, files.shift())); } catch(e) {} }
        });
    } catch(e) { console.warn('Auto-backup failed:', e.message); }
}, 24 * 60 * 60 * 1000);

// ---- Caching headers for static assets ----
app.use('/css', (req, res, next) => { res.set('Cache-Control', 'public, max-age=86400'); next(); });
app.use('/js', (req, res, next) => { res.set('Cache-Control', 'public, max-age=86400'); next(); });
app.use('/uploads', (req, res, next) => { res.set('Cache-Control', 'public, max-age=604800'); next(); });
app.use('/icons', (req, res, next) => { res.set('Cache-Control', 'public, max-age=604800'); next(); });

// ============================= PUBLIC =============================

app.get('/api/health', (r, s) => s.json({ status: 'ok', time: new Date().toISOString() }));

// JWT Login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const cleanUser = (username || '').trim().toLowerCase();
        const cleanPass = (password || '').trim();
        if (!cleanUser || !cleanPass) return res.status(400).json({ error: 'Username and password required' });

        const user = db.getAdminUser(cleanUser);
        if (!user) { console.log(`Login failed: user "${cleanUser}" not found`); return res.status(401).json({ error: 'Invalid credentials' }); }

        const match = await bcrypt.compare(cleanPass, user.password_hash);
        if (!match) { console.log(`Login failed: wrong password for "${cleanUser}"`); return res.status(401).json({ error: 'Invalid credentials' }); }

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

// ============================= NEW FEATURES =============================

// --- Page View Tracking (Analytics) ---
app.post('/api/track', (req, res) => {
    try {
        const { page } = req.body;
        if (!page) return res.status(400).json({ error: 'Page required' });
        const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';
        const ipHash = crypto.createHash('sha256').update(ip + new Date().toDateString()).digest('hex').slice(0, 16);
        db.trackPageView(page, req.headers.referer || '', (req.headers['user-agent'] || '').slice(0, 200), ipHash);
        res.json({ ok: true });
    } catch(e) { res.json({ ok: true }); }
});

// --- Sitemap.xml ---
app.get('/sitemap.xml', (req, res) => {
    const settings = db.getAllSettings();
    const siteUrl = getSiteUrl(settings) || 'https://example.com';
    const posts = db.getPublishedPosts();
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    xml += `  <url><loc>${siteUrl}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n`;
    xml += `  <url><loc>${siteUrl}/terms</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>\n`;
    xml += `  <url><loc>${siteUrl}/privacy</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>\n`;
    xml += `  <url><loc>${siteUrl}/blog</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>\n`;
    posts.forEach(p => { xml += `  <url><loc>${siteUrl}/blog/${p.slug}</loc><lastmod>${p.updated_at?.split(' ')[0] || ''}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>\n`; });
    xml += `</urlset>`;
    res.set('Content-Type', 'application/xml');
    res.send(xml);
});

// --- Blog (Public) ---
app.get('/api/blog', (r, s) => s.json(db.getPublishedPosts().map(p => ({ ...p, tags: JSON.parse(p.tags || '[]') }))));
app.get('/api/blog/:slug', (req, res) => {
    const post = db.getBlogPost(req.params.slug);
    if (!post || post.status !== 'published') return res.status(404).json({ error: 'Post not found' });
    db.incrementPostViews(req.params.slug);
    res.json({ ...post, tags: JSON.parse(post.tags || '[]') });
});

// --- FAQ (Public) ---
app.get('/api/faqs', (r, s) => s.json(db.getVisibleFAQs()));

// --- Discount Code Validation (Public) ---
app.post('/api/discount/validate', (req, res) => {
    try {
        const { code, amount } = req.body;
        if (!code) return res.status(400).json({ error: 'Code required' });
        const disc = db.getDiscountByCode(code);
        if (!disc) return res.status(404).json({ error: 'Invalid discount code' });
        if (disc.expires_at && new Date(disc.expires_at) < new Date()) return res.status(400).json({ error: 'Code has expired' });
        if (disc.max_uses > 0 && disc.used_count >= disc.max_uses) return res.status(400).json({ error: 'Code usage limit reached' });
        if (disc.min_order > 0 && (amount || 0) < disc.min_order) return res.status(400).json({ error: `Minimum order $${disc.min_order} required` });
        const discount = disc.type === 'percentage' ? Math.round((amount || 0) * disc.value / 100) : disc.value;
        res.json({ ok: true, discount, type: disc.type, value: disc.value, code: disc.code });
    } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// --- Referral Validation (Public) ---
app.post('/api/referral/validate', (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Code required' });
        const ref = db.getReferralByCode(code);
        if (!ref) return res.status(404).json({ error: 'Invalid referral code' });
        res.json({ ok: true, discount_percent: ref.discount_percent, referrer_name: ref.referrer_name });
    } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// --- Client Portal Login ---
app.post('/api/client/login', (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });
        const bookings = db.getAllBookings().filter(b => b.email === email);
        if (!bookings.length) return res.status(404).json({ error: 'No bookings found for this email' });
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        db.createClientSession(email, token, expires);
        // Send login link via email
        const settings = db.getAllSettings();
        const siteUrl = getSiteUrl(settings);
        const loginUrl = siteUrl ? `${siteUrl}/client?token=${token}` : '';
        try {
            sendEmail({
                to: email,
                subject: `Your ${settings.company_name || 'CreativeStudio'} Portal Access`,
                html: brandedHTML(`
                    <h2 style="color:${settings.color_primary || '#1a2744'};margin:0 0 16px">Your Client Portal Access</h2>
                    <p>You requested access to view your bookings. Use the link below to log in:</p>
                    ${loginUrl ? `<div style="text-align:center;margin:24px 0"><a href="${loginUrl}" style="display:inline-block;background:${settings.color_primary || '#1a2744'};color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600">Access My Portal</a></div>` : `<p><strong>Your access token:</strong> <code>${token}</code></p>`}
                    <p style="font-size:13px;color:#999">This link expires in 24 hours.</p>
                `, settings),
                settings
            });
        } catch(e) { console.warn('Client login email failed:', e.message); }
        res.json({ ok: true, message: 'Check your email for the login link' });
    } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/client/portal', (req, res) => {
    try {
        const token = req.headers['x-client-token'] || req.query.token;
        if (!token) return res.status(401).json({ error: 'Token required' });
        const session = db.getClientSession(token);
        if (!session) return res.status(401).json({ error: 'Invalid or expired token' });
        const bookings = db.getAllBookings().filter(b => b.email === session.email).map(b => ({
            reference: b.reference, service: b.service, status: b.status,
            total_amount: b.total_amount, created_at: b.created_at, name: b.name,
            invoice_path: b.invoice_path,
            deliveries: db.getDeliveriesByRef(b.reference).map(d => ({
                original_name: d.original_name, file_size: d.file_size,
                download_url: `/api/delivery/download/${d.download_token}`, created_at: d.created_at
            }))
        }));
        res.json({ email: session.email, bookings });
    } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// --- File Delivery Download (Public with token) ---
app.get('/api/delivery/download/:token', (req, res) => {
    try {
        const d = db.getDeliveryByToken(req.params.token);
        if (!d) return res.status(404).json({ error: 'File not found' });
        db.incrementDownload(d.id);
        const filePath = path.join(deliveriesDir, d.filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File no longer available' });
        res.download(filePath, d.original_name);
    } catch(e) { res.status(500).json({ error: 'Download failed' }); }
});

// --- Blog page (public HTML) ---
app.get('/blog', (req, res) => {
    const settings = db.getAllSettings();
    const posts = db.getPublishedPosts();
    res.send(renderBlogListPage(posts, settings));
});
app.get('/blog/:slug', (req, res) => {
    const post = db.getBlogPost(req.params.slug);
    if (!post || post.status !== 'published') return res.status(404).send('<h1>Post not found</h1>');
    db.incrementPostViews(req.params.slug);
    const settings = db.getAllSettings();
    res.send(renderBlogPostPage(post, settings));
});

function renderBlogListPage(posts, s) {
    const cards = posts.map(p => {
        const tags = JSON.parse(p.tags || '[]');
        return `<article style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06);transition:transform .3s">
            ${p.cover_image ? `<img src="${p.cover_image}" alt="${p.title}" style="width:100%;height:200px;object-fit:cover">` : ''}
            <div style="padding:1.5rem">
                <div style="display:flex;gap:.5rem;margin-bottom:.75rem;flex-wrap:wrap">
                    <span style="font-size:.7rem;background:${s.color_accent || '#c4854c'}22;color:${s.color_accent || '#c4854c'};padding:2px 10px;border-radius:20px">${p.category}</span>
                    ${tags.map(t => `<span style="font-size:.7rem;background:#f0f0f0;padding:2px 8px;border-radius:20px">${t}</span>`).join('')}
                </div>
                <h3 style="margin:0 0 .5rem;font-size:1.15rem"><a href="/blog/${p.slug}" style="color:${s.color_primary || '#1a2744'};text-decoration:none">${p.title}</a></h3>
                <p style="color:#6b7080;font-size:.9rem;line-height:1.6">${p.excerpt || p.content.replace(/<[^>]+>/g, '').slice(0, 150) + '...'}</p>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem;font-size:.8rem;color:#999">
                    <span>${new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span>${p.views || 0} views</span>
                </div>
            </div>
        </article>`;
    }).join('');
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Blog — ${s.company_name || 'CreativeStudio'}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Source+Sans+3:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>:root{--navy:${s.color_primary || '#1a2744'};--warm:${s.color_accent || '#c4854c'};--bg:${s.color_background || '#faf8f5'};}
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Source Sans 3',sans-serif;background:var(--bg);color:#2c3040;line-height:1.8}
.header{background:var(--navy);padding:1.5rem 0;text-align:center}.header a{color:#fff;text-decoration:none;font-size:1.2rem;font-weight:700;font-family:'Playfair Display',serif}.header a span{color:var(--warm)}
.content{max-width:1100px;margin:0 auto;padding:3rem 2rem}h1{font-family:'Playfair Display',serif;color:var(--navy);font-size:2.2rem;margin-bottom:2rem;text-align:center}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:2rem}
.footer{text-align:center;padding:2rem;font-size:.82rem;color:#9399a8;border-top:1px solid rgba(26,39,68,.08)}</style></head>
<body><div class="header"><a href="/">${s.company_name || 'Creative'}<span>.</span>${s.company_name ? '' : 'Studio'}</a></div>
<div class="content"><h1>Blog</h1>${posts.length ? `<div class="grid">${cards}</div>` : '<p style="text-align:center;color:#999">No posts yet. Check back soon!</p>'}
</div><div class="footer"><p>&copy; ${new Date().getFullYear()} ${s.company_name || 'CreativeStudio'}. <a href="/" style="color:var(--warm);text-decoration:none">Back to site</a></p></div></body></html>`;
}

function renderBlogPostPage(post, s) {
    const tags = JSON.parse(post.tags || '[]');
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${post.title} — ${s.company_name || 'CreativeStudio'}</title>
<meta name="description" content="${(post.excerpt || post.content.replace(/<[^>]+>/g, '').slice(0, 160)).replace(/"/g, '&quot;')}">
<meta property="og:title" content="${post.title}"><meta property="og:type" content="article">
${post.cover_image ? `<meta property="og:image" content="${post.cover_image}">` : ''}
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Source+Sans+3:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>:root{--navy:${s.color_primary || '#1a2744'};--warm:${s.color_accent || '#c4854c'};--bg:${s.color_background || '#faf8f5'};}
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Source Sans 3',sans-serif;background:var(--bg);color:#2c3040;line-height:1.8}
.header{background:var(--navy);padding:1.5rem 0;text-align:center}.header a{color:#fff;text-decoration:none;font-size:1.2rem;font-weight:700;font-family:'Playfair Display',serif}.header a span{color:var(--warm)}
.content{max-width:800px;margin:0 auto;padding:3rem 2rem}h1{font-family:'Playfair Display',serif;color:var(--navy);font-size:2rem;margin-bottom:1rem}
.meta{color:#999;font-size:.85rem;margin-bottom:2rem;display:flex;gap:1rem;flex-wrap:wrap;align-items:center}.tag{font-size:.7rem;background:${s.color_accent || '#c4854c'}22;color:${s.color_accent || '#c4854c'};padding:2px 10px;border-radius:20px}
.body{line-height:1.9;font-size:1.05rem}.body h2,.body h3{color:var(--navy);margin:2rem 0 1rem}.body p{margin-bottom:1rem}.body img{max-width:100%;border-radius:8px;margin:1rem 0}
.footer{text-align:center;padding:2rem;font-size:.82rem;color:#9399a8;border-top:1px solid rgba(26,39,68,.08)}</style></head>
<body><div class="header"><a href="/">${s.company_name || 'Creative'}<span>.</span>${s.company_name ? '' : 'Studio'}</a></div>
<div class="content">
${post.cover_image ? `<img src="${post.cover_image}" alt="${post.title}" style="width:100%;max-height:400px;object-fit:cover;border-radius:12px;margin-bottom:2rem">` : ''}
<h1>${post.title}</h1>
<div class="meta"><span>By ${post.author}</span><span>${new Date(post.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span><span>${post.views || 0} views</span>${tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
<div class="body">${post.content}</div>
<div style="margin-top:3rem;padding-top:2rem;border-top:1px solid #eee"><a href="/blog" style="color:var(--warm);text-decoration:none;font-weight:600">← Back to Blog</a></div>
</div><div class="footer"><p>&copy; ${new Date().getFullYear()} ${s.company_name || 'CreativeStudio'}. <a href="/" style="color:var(--warm);text-decoration:none">Back to site</a></p></div></body></html>`;
}

// --- Client Portal Page ---
app.get('/client', (req, res) => {
    const settings = db.getAllSettings();
    res.send(renderClientPortalPage(settings));
});

function renderClientPortalPage(s) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Client Portal — ${s.company_name || 'CreativeStudio'}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Source+Sans+3:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>:root{--navy:${s.color_primary||'#1a2744'};--warm:${s.color_accent||'#c4854c'};--bg:${s.color_background||'#faf8f5'}}
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Source Sans 3',sans-serif;background:var(--bg);color:#2c3040;line-height:1.6;min-height:100vh}
.header{background:var(--navy);padding:1.5rem 0;text-align:center}.header a{color:#fff;text-decoration:none;font-size:1.2rem;font-weight:700;font-family:'Playfair Display',serif}.header a span{color:var(--warm)}
.wrap{max-width:900px;margin:0 auto;padding:2rem}h1{font-family:'Playfair Display',serif;color:var(--navy);font-size:1.8rem;margin-bottom:1.5rem}
.login-box{max-width:420px;margin:4rem auto;background:#fff;padding:2.5rem;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.login-box h2{color:var(--navy);margin-bottom:.5rem;font-family:'Playfair Display',serif}.login-box p{color:#6b7080;margin-bottom:1.5rem;font-size:.9rem}
input[type=email]{width:100%;padding:.7rem 1rem;border:1.5px solid #ddd;border-radius:8px;font-size:1rem;margin-bottom:1rem}
.btn{display:inline-block;padding:.7rem 1.5rem;border:none;border-radius:8px;font-size:.9rem;font-weight:600;cursor:pointer;text-decoration:none}
.btn-primary{background:var(--navy);color:#fff;width:100%}.btn-primary:hover{opacity:.9}
.card{background:#fff;border-radius:10px;padding:1.5rem;margin-bottom:1rem;box-shadow:0 2px 8px rgba(0,0,0,.05);border:1px solid #eee}
.badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:.75rem;font-weight:600}
.badge-pending{background:#fef3e2;color:#c4854c}.badge-confirmed{background:#e3f2fd;color:#1e64c8}
.badge-in-progress{background:#e3f2fd;color:#1e64c8}.badge-completed{background:#e8f5e9;color:#228b54}.badge-delivered{background:#e8f5e9;color:#228b54}
.msg{padding:1rem;border-radius:8px;margin-bottom:1rem;font-size:.9rem}.msg-success{background:#e8f5e9;color:#228b54}.msg-error{background:#fbe9e7;color:#c83232}
.dl-link{display:inline-flex;align-items:center;gap:.4rem;padding:.4rem .8rem;background:var(--warm);color:#fff;border-radius:6px;text-decoration:none;font-size:.8rem;font-weight:600;margin:.3rem .3rem 0 0}
.footer{text-align:center;padding:2rem;font-size:.82rem;color:#9399a8}
</style></head><body>
<div class="header"><a href="/">${s.company_name||'Creative'}<span>.</span>${s.company_name?'':'Studio'}</a></div>
<div class="wrap">
<div id="loginView">
<div class="login-box"><h2>Client Portal</h2><p>Enter your email to access your bookings, invoices, and deliverables.</p>
<div id="loginMsg"></div>
<form onsubmit="clientLogin(event)"><input type="email" id="clientEmail" placeholder="your@email.com" required><button type="submit" class="btn btn-primary">Access My Portal</button></form></div></div>
<div id="portalView" style="display:none">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem"><h1>My Bookings</h1><button onclick="clientLogout()" class="btn" style="background:#eee;color:#666;font-size:.8rem">Logout</button></div>
<div id="bookingsList"></div>
</div>
</div>
<div class="footer"><p>&copy; ${new Date().getFullYear()} ${s.company_name||'CreativeStudio'}. <a href="/" style="color:var(--warm);text-decoration:none">Back to site</a></p></div>
<script>
const token=new URLSearchParams(location.search).get('token')||localStorage.getItem('client_token');
if(token){localStorage.setItem('client_token',token);loadPortal(token);}
async function clientLogin(e){e.preventDefault();const email=document.getElementById('clientEmail').value;
const r=await fetch('/api/client/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
const d=await r.json();document.getElementById('loginMsg').innerHTML=r.ok?'<div class="msg msg-success">'+d.message+'</div>':'<div class="msg msg-error">'+d.error+'</div>';}
async function loadPortal(t){
try{const r=await fetch('/api/client/portal',{headers:{'x-client-token':t}});if(!r.ok){localStorage.removeItem('client_token');return;}
const d=await r.json();document.getElementById('loginView').style.display='none';document.getElementById('portalView').style.display='block';
const statusColors={pending:'pending',confirmed:'confirmed','in-progress':'in-progress',completed:'completed',delivered:'delivered'};
document.getElementById('bookingsList').innerHTML=d.bookings.length?d.bookings.map(b=>'<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem"><strong>'+b.service+'</strong><span class="badge badge-'+(statusColors[b.status]||'pending')+'">'+b.status+'</span></div>'
+'<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;font-size:.85rem;color:#6b7080;margin-bottom:.8rem"><span>Ref: <code>'+b.reference+'</code></span><span>Amount: <strong style="color:#2c3040">$'+b.total_amount+'</strong></span><span>Date: '+new Date(b.created_at).toLocaleDateString()+'</span></div>'
+(b.invoice_path?'<a href="'+b.invoice_path+'" target="_blank" class="dl-link"><i class="fas fa-file-pdf"></i> Invoice</a>':'')
+(b.deliveries&&b.deliveries.length?'<div style="margin-top:.6rem"><strong style="font-size:.8rem">Deliverables:</strong><div>'+b.deliveries.map(f=>'<a href="'+f.download_url+'" class="dl-link"><i class="fas fa-download"></i> '+f.original_name+'</a>').join('')+'</div></div>':'')
+'</div>').join(''):'<div class="card" style="text-align:center;color:#999"><i class="fas fa-folder-open" style="font-size:2rem;margin-bottom:.5rem;display:block"></i>No bookings found.</div>';
}catch(e){localStorage.removeItem('client_token');}}
function clientLogout(){localStorage.removeItem('client_token');location.href='/client';}
</script></body></html>`;
}

// ============================= ADMIN (continued) =============================

// --- Analytics ---
app.get('/api/admin/analytics', adminAuth, (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const pvStats = db.getPageViewStats(days);
        const monthlyRevenue = db.getRevenueByMonth();
        const popularServices = db.getPopularServices();
        const bookingsByStatus = db.getBookingsByStatus();
        const recentBookings = bookingsByStatus.reduce((s, b) => s + b.count, 0);
        const recentRevenue = monthlyRevenue.length ? monthlyRevenue[0].revenue || 0 : 0;
        res.json({
            pageViews: pvStats.total,
            uniqueVisitors: pvStats.unique,
            recentBookings,
            recentRevenue,
            topPages: pvStats.views.map(v => ({ page: v.page, views: v.count })),
            popularServices,
            monthlyRevenue,
            dailyViews: pvStats.daily,
            bookingsByStatus
        });
    } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// --- Blog (Admin) ---
app.get('/api/admin/blog', adminAuth, (r, s) => s.json(db.getAllBlogPosts().map(p => ({ ...p, tags: JSON.parse(p.tags || '[]') }))));
app.post('/api/admin/blog', adminAuth, (req, res) => {
    try {
        const d = req.body;
        if (!d.title || !d.content) return res.status(400).json({ error: 'Title and content required' });
        if (!d.slug) d.slug = d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const id = db.createBlogPost(d);
        db.logActivity('blog_create', `Created post: ${d.title}`, req.adminUser);
        res.json({ ok: true, id });
    } catch(e) { res.status(500).json({ error: e.message.includes('UNIQUE') ? 'Slug already exists' : 'Failed' }); }
});
app.put('/api/admin/blog/:id', adminAuth, (req, res) => {
    try { db.updateBlogPost(+req.params.id, req.body); db.logActivity('blog_update', `Updated post #${req.params.id}`, req.adminUser); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: 'Failed' }); }
});
app.delete('/api/admin/blog/:id', adminAuth, (req, res) => {
    try { db.deleteBlogPost(+req.params.id); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// --- FAQs (Admin) ---
app.get('/api/admin/faqs', adminAuth, (r, s) => s.json(db.getAllFAQs()));
app.post('/api/admin/faqs', adminAuth, (req, res) => {
    try {
        const d = req.body;
        if (!d.question || !d.answer) return res.status(400).json({ error: 'Question and answer required' });
        const id = db.createFAQ(d);
        db.logActivity('faq_create', `Created FAQ: ${d.question.slice(0, 50)}`, req.adminUser);
        res.json({ ok: true, id });
    } catch(e) { res.status(500).json({ error: 'Failed' }); }
});
app.put('/api/admin/faqs/:id', adminAuth, (req, res) => {
    try { db.updateFAQ(+req.params.id, req.body); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: 'Failed' }); }
});
app.delete('/api/admin/faqs/:id', adminAuth, (req, res) => {
    try { db.deleteFAQ(+req.params.id); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// --- Discount Codes (Admin) ---
app.get('/api/admin/discounts', adminAuth, (r, s) => s.json(db.getAllDiscounts()));
app.post('/api/admin/discounts', adminAuth, (req, res) => {
    try {
        const d = req.body;
        if (!d.code || !d.value) return res.status(400).json({ error: 'Code and value required' });
        const id = db.createDiscount(d);
        db.logActivity('discount_create', `Created code: ${d.code}`, req.adminUser);
        res.json({ ok: true, id });
    } catch(e) { res.status(500).json({ error: e.message.includes('UNIQUE') ? 'Code already exists' : 'Failed' }); }
});
app.put('/api/admin/discounts/:id', adminAuth, (req, res) => {
    try { db.updateDiscount(+req.params.id, req.body); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: 'Failed' }); }
});
app.patch('/api/admin/discounts/:id/toggle', adminAuth, (req, res) => {
    try { db.toggleDiscount(+req.params.id, req.body.is_active); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: 'Failed' }); }
});
app.delete('/api/admin/discounts/:id', adminAuth, (req, res) => {
    try { db.deleteDiscount(+req.params.id); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// --- Referrals (Admin) ---
app.get('/api/admin/referrals', adminAuth, (r, s) => {
    const refs = db.getAllReferrals().map(r => ({ ...r, code: r.referral_code }));
    s.json(refs);
});
app.post('/api/admin/referrals', adminAuth, (req, res) => {
    try {
        const d = req.body;
        d.referral_code = d.code || d.referral_code || 'REF-' + crypto.randomBytes(4).toString('hex').toUpperCase();
        d.referrer_email = d.referrer_email || '';
        d.referrer_name = d.referrer_name || '';
        const id = db.createReferral(d);
        db.logActivity('referral_create', `Created referral: ${d.referral_code}`, req.adminUser);
        res.json({ ok: true, id, code: d.referral_code });
    } catch(e) { res.status(500).json({ error: e.message.includes('UNIQUE') ? 'Code already exists' : 'Failed' }); }
});
app.put('/api/admin/referrals/:id', adminAuth, (req, res) => {
    try {
        const d = req.body;
        d.referral_code = d.code || d.referral_code;
        db.updateReferral(+req.params.id, d);
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: 'Failed' }); }
});
app.delete('/api/admin/referrals/:id', adminAuth, (req, res) => {
    try { db.deleteReferral(+req.params.id); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// --- Booking Notes (Admin) ---
app.get('/api/admin/bookings/:ref/notes', adminAuth, (req, res) => {
    try { res.json(db.getBookingNotes(req.params.ref)); }
    catch(e) { res.status(500).json({ error: 'Failed' }); }
});
app.post('/api/admin/bookings/:ref/notes', adminAuth, (req, res) => {
    try {
        const { note } = req.body;
        if (!note) return res.status(400).json({ error: 'Note required' });
        const id = db.addBookingNote(req.params.ref, note, req.adminUser);
        res.json({ ok: true, id });
    } catch(e) { res.status(500).json({ error: 'Failed' }); }
});
app.delete('/api/admin/notes/:id', adminAuth, (req, res) => {
    try { db.deleteBookingNote(+req.params.id); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// --- Activity Log (Admin) ---
app.get('/api/admin/activity', adminAuth, (req, res) => {
    try { res.json(db.getActivityLog(parseInt(req.query.limit) || 50)); }
    catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// --- File Delivery (Admin) ---
app.get('/api/admin/deliveries', adminAuth, (req, res) => {
    try { res.json(db.getAllDeliveries()); }
    catch(e) { res.status(500).json({ error: 'Failed' }); }
});
app.get('/api/admin/deliveries/:ref', adminAuth, (req, res) => {
    try { res.json(db.getDeliveriesByRef(req.params.ref)); }
    catch(e) { res.status(500).json({ error: 'Failed' }); }
});
app.post('/api/admin/deliveries/:ref', adminAuth, deliveryUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    try {
        const token = crypto.randomBytes(24).toString('hex');
        const id = db.addDelivery({
            booking_ref: req.params.ref,
            filename: req.file.filename,
            original_name: req.file.originalname,
            file_size: req.file.size,
            download_token: token,
            uploaded_by: req.adminUser
        });
        db.logActivity('delivery_upload', `Uploaded file for ${req.params.ref}: ${req.file.originalname}`, req.adminUser);

        // Notify client about new delivery
        const booking = db.getBookingByRef(req.params.ref);
        if (booking) {
            const settings = db.getAllSettings();
            const siteUrl = getSiteUrl(settings);
            const downloadUrl = siteUrl ? `${siteUrl}/api/delivery/download/${token}` : '';
            try {
                sendEmail({
                    to: booking.email,
                    subject: `New file available — ${req.file.originalname}`,
                    html: brandedHTML(`
                        <h2 style="color:${settings.color_primary || '#1a2744'};margin:0 0 16px">New File Available</h2>
                        <p>Hi ${booking.name},</p>
                        <p>A new file has been uploaded for your project <strong>${booking.service}</strong> (Ref: ${req.params.ref}):</p>
                        <div style="background:#faf8f5;padding:16px 20px;border-radius:8px;margin:16px 0">
                            <p style="margin:0"><strong>${req.file.originalname}</strong></p>
                            <p style="margin:4px 0 0;font-size:.85rem;color:#6b7080">${(req.file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        ${downloadUrl ? `<div style="text-align:center;margin:24px 0"><a href="${downloadUrl}" style="display:inline-block;background:${settings.color_accent || '#c4854c'};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Download File</a></div>` : ''}
                        ${siteUrl ? `<p style="font-size:.85rem;color:#999">You can also view all your files in the <a href="${siteUrl}/client" style="color:${settings.color_accent || '#c4854c'}">Client Portal</a>.</p>` : ''}
                    `, settings),
                    settings
                });
            } catch(e) { console.warn('Delivery notification failed:', e.message); }
        }
        res.json({ ok: true, id, token, download_url: `/api/delivery/download/${token}` });
    } catch(e) { res.status(500).json({ error: 'Failed' }); }
});
app.delete('/api/admin/deliveries/file/:id', adminAuth, (req, res) => {
    try { db.deleteDelivery(+req.params.id); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// --- CSV Export (Admin) ---
app.get('/api/admin/export/:type', adminAuth, (req, res) => {
    try {
        const type = req.params.type;
        let rows = [], headers = [];
        if (type === 'bookings') {
            headers = ['Reference','Name','Email','Phone','Service','Amount','Status','Date'];
            rows = db.getAllBookings().map(b => [b.reference, b.name, b.email, b.phone, b.service, b.total_amount, b.status, b.created_at]);
        } else if (type === 'contacts') {
            headers = ['Name','Email','Subject','Message','Read','Date'];
            rows = db.getAllContacts().map(c => [c.name, c.email, c.subject, c.message.replace(/[\n\r]+/g, ' '), c.is_read ? 'Yes' : 'No', c.created_at]);
        } else if (type === 'subscribers') {
            headers = ['Email','Date'];
            rows = db.getAllSubscribers().map(s => [s.email, s.subscribed_at]);
        } else if (type === 'reviews') {
            headers = ['Name','Email','Rating','Review','Service','Status','Date'];
            rows = db.getAllReviews().map(r => [r.name, r.email, r.rating, r.text.replace(/[\n\r]+/g, ' '), r.service_used, r.status, r.created_at]);
        } else {
            return res.status(400).json({ error: 'Invalid export type' });
        }
        const csvEscape = v => `"${String(v || '').replace(/"/g, '""')}"`;
        const csv = [headers.join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
        res.set('Content-Type', 'text/csv');
        res.set('Content-Disposition', `attachment; filename="${type}-export-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csv);
    } catch(e) { res.status(500).json({ error: 'Export failed' }); }
});

// --- Multi-Admin Management ---
app.get('/api/admin/users', adminAuth, (req, res) => {
    try { res.json(db.getAllAdminUsers()); }
    catch(e) { res.status(500).json({ error: 'Failed' }); }
});
app.post('/api/admin/users', adminAuth, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        const id = db.createAdminUser(username, hash);
        if (role) db.updateAdminRole(id, role);
        db.logActivity('admin_create', `Created admin user: ${username} (${role || 'admin'})`, req.adminUser);
        res.json({ ok: true, id });
    } catch(e) { res.status(500).json({ error: e.message.includes('UNIQUE') ? 'Username already exists' : 'Failed' }); }
});
app.put('/api/admin/users/:id/role', adminAuth, (req, res) => {
    try { db.updateAdminRole(+req.params.id, req.body.role); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: 'Failed' }); }
});
app.delete('/api/admin/users/:id', adminAuth, (req, res) => {
    try {
        if (db.adminUserCount() <= 1) return res.status(400).json({ error: 'Cannot delete the last admin user' });
        db.deleteAdminUser(+req.params.id);
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// --- Bulk Newsletter ---
app.post('/api/admin/newsletter/send', adminAuth, async (req, res) => {
    try {
        const { subject, message } = req.body;
        if (!subject || !message) return res.status(400).json({ error: 'Subject and message required' });
        const subscribers = db.getAllSubscribers();
        const settings = db.getAllSettings();
        let sent = 0, failed = 0;
        for (const sub of subscribers) {
            try {
                const unsubUrl = getSiteUrl(settings) + `/api/newsletter/unsubscribe/${sub.unsub_token}`;
                const bodyHTML = message.split('\n').map(line => line.trim() ? `<p style="margin:6px 0">${line}</p>` : '<br>').join('');
                await sendEmail({
                    to: sub.email,
                    subject,
                    html: brandedHTML(`${bodyHTML}<div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;text-align:center"><a href="${unsubUrl}" style="color:#999;font-size:12px;text-decoration:underline">Unsubscribe</a></div>`, settings),
                    settings
                });
                sent++;
            } catch(e) { failed++; }
        }
        db.logActivity('newsletter_send', `Sent newsletter to ${sent}/${subscribers.length} subscribers`, req.adminUser);
        res.json({ ok: true, sent, failed, total: subscribers.length });
    } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// --- Portfolio Reorder ---
app.put('/api/admin/portfolio/reorder', adminAuth, (req, res) => {
    try {
        const { items } = req.body;
        if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'Items array required' });
        db.reorderPortfolio(items);
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// --- Batch Upload (multiple images) ---
app.post('/api/admin/upload/batch', adminAuth, upload.array('images', 20), async (req, res) => {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files' });
    try {
        const urls = [];
        for (const file of req.files) {
            const url = await compressImage(file.path, file.filename);
            urls.push(url);
        }
        res.json({ ok: true, urls });
    } catch(e) { res.status(500).json({ error: 'Upload failed' }); }
});

// --- Automated Reminders Check ---
app.post('/api/admin/send-reminders', adminAuth, async (req, res) => {
    try {
        const settings = db.getAllSettings();
        const bookings = db.getAllBookings();
        const now = new Date();
        let sent = 0;
        for (const b of bookings) {
            if (!b.deadline || b.status === 'completed' || b.status === 'delivered') continue;
            const deadline = new Date(b.deadline);
            const daysUntil = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
            // Remind admin about bookings due within 3 days
            if (daysUntil <= 3 && daysUntil >= 0) {
                try {
                    await sendEmail({
                        to: process.env.NOTIFY_EMAIL || settings.email || '',
                        subject: `⏰ Deadline Reminder: ${b.service} for ${b.name} — ${daysUntil === 0 ? 'TODAY' : `in ${daysUntil} day(s)`}`,
                        html: brandedHTML(`
                            <h2 style="color:${settings.color_primary || '#1a2744'};margin:0 0 16px">⏰ Deadline Reminder</h2>
                            <p><strong>${b.service}</strong> for ${b.name} is due <strong>${daysUntil === 0 ? 'today' : `in ${daysUntil} day(s)`}</strong>.</p>
                            <div style="background:#faf8f5;padding:12px 16px;border-radius:8px;margin:12px 0">
                                <p style="margin:4px 0"><strong>Ref:</strong> ${b.reference}</p>
                                <p style="margin:4px 0"><strong>Status:</strong> ${b.status}</p>
                                <p style="margin:4px 0"><strong>Deadline:</strong> ${deadline.toLocaleDateString()}</p>
                            </div>
                        `, settings),
                        settings
                    });
                    sent++;
                } catch(e) {}
            }
        }
        db.logActivity('reminders_sent', `Sent ${sent} deadline reminders`, req.adminUser);
        res.json({ ok: true, sent });
    } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

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

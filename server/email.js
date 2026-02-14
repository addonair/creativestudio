// ============================================================
// EMAIL — Nodemailer with branded templates
// ============================================================

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
        console.warn('⚠️  Email not configured. Set SMTP variables in .env.');
        return null;
    }
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    return transporter;
}

// Social platform display — email-safe icons (no font-awesome in emails)
const socialMeta = {
    facebook:  { label: 'Facebook',    icon: 'f',  bg: '#1877F2' },
    instagram: { label: 'Instagram',   icon: 'IG', bg: '#E4405F' },
    twitter:   { label: 'X',           icon: '𝕏',  bg: '#000000' },
    tiktok:    { label: 'TikTok',      icon: '♪',  bg: '#000000' },
    youtube:   { label: 'YouTube',     icon: '▶',  bg: '#FF0000' },
    linkedin:  { label: 'LinkedIn',    icon: 'in', bg: '#0A66C2' },
    behance:   { label: 'Behance',     icon: 'Bē', bg: '#1769FF' },
    dribbble:  { label: 'Dribbble',    icon: '●',  bg: '#EA4C89' },
    pinterest: { label: 'Pinterest',   icon: 'P',  bg: '#BD081C' },
    snapchat:  { label: 'Snapchat',    icon: '👻', bg: '#FFFC00' },
    whatsapp:  { label: 'WhatsApp',    icon: '✆',  bg: '#25D366' },
    telegram:  { label: 'Telegram',    icon: '✈',  bg: '#26A5E4' },
    github:    { label: 'GitHub',      icon: '◆',  bg: '#333333' },
    vimeo:     { label: 'Vimeo',       icon: 'V',  bg: '#1AB7EA' },
    spotify:   { label: 'Spotify',     icon: '♫',  bg: '#1DB954' },
    threads:   { label: 'Threads',     icon: '@',  bg: '#000000' },
    website:   { label: 'Website',     icon: '◎',  bg: '#555555' },
};

function isLocalUrl(url) {
    if (!url) return true;
    return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url);
}


/**
 * Build a branded HTML email wrapper
 * @param {string} bodyHTML — the inner content
 * @param {Object} settings — company settings from DB
 * @returns {string} full HTML email
 */
function brandedHTML(bodyHTML, settings = {}) {
    const name = settings.company_name || 'CreativeStudio';
    const logo = settings.logo_url || '';
    const email = settings.email || '';
    const phone = settings.phone || '';
    const address = settings.address || '';
    const accent = settings.color_accent || '#c4854c';
    const navy = settings.color_primary || '#1a2744';
    const siteUrl = settings.site_url || process.env.SITE_URL || '';
    const isLocal = isLocalUrl(siteUrl);

    // Logo — only reference image if we have a real (non-localhost) URL
    const logoSrc = logo && !logo.startsWith('http') ? (isLocal ? '' : siteUrl + logo) : logo;
    const headerContent = logoSrc
        ? `<img src="${logoSrc}" alt="${name}" style="max-height:44px;max-width:200px">`
        : `<span style="font-size:1.4rem;font-weight:700;color:#fff;letter-spacing:-0.5px">${name}<span style="color:${accent}">.</span></span>`;

    // Social icons for footer — each platform gets its real brand color
    let socialHTML = '';
    try {
        const socials = JSON.parse(settings.socials || '[]');
        const valid = socials.filter(s => s.url && s.url.trim());
        if (valid.length) {
            const links = valid.map(s => {
                const meta = socialMeta[s.platform] || { label: s.platform || 'Link', icon: '●', bg: navy };
                const textColor = s.platform === 'snapchat' ? '#000' : '#fff';
                const fontSize = meta.icon.length > 1 ? '10' : '13';
                return `<a href="${s.url}" title="${meta.label}" target="_blank" style="display:inline-block;width:30px;height:30px;border-radius:50%;background:${meta.bg};color:${textColor};text-align:center;line-height:30px;margin:0 4px;text-decoration:none;font-size:${fontSize}px;font-weight:700">${meta.icon}</a>`;
            }).join('');
            socialHTML = `<div style="margin:14px 0 6px">${links}</div>`;
        }
    } catch(e) {}

    // Contact info line
    const contactParts = [];
    if (email) contactParts.push(`<a href="mailto:${email}" style="color:${accent};text-decoration:none">${email}</a>`);
    if (phone) contactParts.push(phone);
    const contactLine = contactParts.length
        ? `<p style="margin:0 0 4px">${contactParts.join(' &nbsp;·&nbsp; ')}</p>` : '';

    // Website link — hidden when localhost
    const websiteLink = !isLocal && siteUrl
        ? `<p style="margin:8px 0 0"><a href="${siteUrl}" style="color:${accent};text-decoration:none;font-weight:600">${siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a></p>` : '';

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f3f0;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3f0">
<tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

    <!-- HEADER -->
    <tr><td style="background:${navy};padding:24px 32px;border-radius:12px 12px 0 0">
        ${headerContent}
    </td></tr>

    <!-- BODY -->
    <tr><td style="background:#ffffff;padding:32px;border-left:1px solid #eee;border-right:1px solid #eee;line-height:1.7;color:#2c3040;font-size:15px">
        ${bodyHTML}
    </td></tr>

    <!-- FOOTER -->
    <tr><td style="background:#faf8f5;padding:24px 32px;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#999">
        <p style="margin:0 0 6px;font-weight:700;color:#555;font-size:13px">${name}</p>
        ${contactLine}
        ${address ? `<p style="margin:0 0 4px">${address}</p>` : ''}
        ${socialHTML}
        ${websiteLink}
    </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}


/**
 * Send an email
 * @param {Object} options - { to, subject, html, replyTo?, attachments?, settings? }
 */
async function sendEmail({ to, subject, html, replyTo, attachments, settings }) {
    const transport = getTransporter();
    if (!transport) {
        console.log(`📧 [EMAIL SKIPPED] To: ${to} | Subject: ${subject}`);
        return { skipped: true };
    }

    // Always use company name from settings — never the hardcoded SMTP_FROM
    const companyName = (settings && settings.company_name) || 'CreativeStudio';
    const fromField = `"${companyName}" <${process.env.SMTP_USER}>`;

    const mailOpts = {
        from: fromField,
        to, subject, html,
    };
    if (replyTo) mailOpts.replyTo = replyTo;
    if (attachments && attachments.length) mailOpts.attachments = attachments;

    const result = await transport.sendMail(mailOpts);
    console.log(`📧 Email sent to ${to}: ${result.messageId}`);
    return result;
}


module.exports = { sendEmail, brandedHTML, isLocalUrl };

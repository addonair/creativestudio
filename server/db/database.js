// ============================================================
// DATABASE — SQLite via better-sqlite3
// Tables: contacts, newsletter, bookings, portfolio, reviews,
//         settings, pages, admin_users
// ============================================================

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'creativestudio.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// ---- Create tables ----
db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT,
        message TEXT NOT NULL, is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS newsletter (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL, unsub_token TEXT,
        subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
        service TEXT, service_type TEXT, description TEXT, deadline TEXT,
        base_price INTEGER DEFAULT 0, addons_price INTEGER DEFAULT 0,
        total_amount INTEGER DEFAULT 0, addons TEXT DEFAULT '[]',
        reference TEXT UNIQUE, status TEXT DEFAULT 'pending',
        invoice_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS portfolio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, category TEXT NOT NULL, tags TEXT DEFAULT '[]',
        image_url TEXT NOT NULL, video_url TEXT DEFAULT '',
        description TEXT, is_visible INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, email TEXT NOT NULL, company TEXT, role TEXT,
        rating INTEGER DEFAULT 5, text TEXT NOT NULL, service_used TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS pages (
        slug TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// ---- Safe migrations for existing DBs ----
const m = (sql) => { try { db.exec(sql); } catch(e) {} };
m("ALTER TABLE contacts ADD COLUMN is_read INTEGER DEFAULT 0");
m("ALTER TABLE portfolio ADD COLUMN video_url TEXT DEFAULT ''");
m("ALTER TABLE newsletter ADD COLUMN unsub_token TEXT");
m("ALTER TABLE bookings ADD COLUMN invoice_path TEXT");

// ---- Default settings ----
const defaults = {
    company_name:'CreativeStudio', tagline:'Design & Motion Services',
    logo_url:'', about_image_url:'', favicon_url:'',
    email:'hello@creativestudio.com', phone:'+233 (0) 00 000 0000',
    address:'Accra, Ghana — Available Worldwide',
    social_behance:'#', social_dribbble:'#', social_instagram:'#',
    social_linkedin:'#', social_twitter:'', social_youtube:'',
    color_primary:'#1a2744', color_primary_light:'#2d4163',
    color_accent:'#c4854c', color_background:'#faf8f5',
    color_text:'#2c3040', color_text_muted:'#6b7080',
    font_headings:'Playfair Display', font_body:'Source Sans 3', font_accent:'IBM Plex Mono',
    border_radius:'8', border_radius_large:'12', btn_radius:'8',
    section_spacing:'normal', shadow_style:'normal',
    hero_title:'Transform Your Vision Into <em>Stunning</em> Visuals',
    hero_subtitle:'Professional graphic design and video editing services that elevate your brand and captivate your audience.',
    hero_badge:'Available for new projects',
    stat_projects:'150', stat_clients:'80', stat_turnaround:'48',
    cta_title:'Ready to Elevate Your Brand?',
    cta_subtitle:"Let's create something remarkable together.",
    footer_text:'Professional design and video editing services that help businesses stand out.',
    currency_rate:'15.5',
    about_title:'Creative Professional with a Passion for Excellence',
    about_text_1:'With years of experience in the creative industry, I specialize in transforming ideas into visually stunning realities. My approach combines artistic vision with technical expertise.',
    about_text_2:"I've worked with startups, established brands, and agencies across various industries, helping them communicate effectively through design and motion.",
    about_years:'5+',
    about_years_label:'Years Exp.',
    skills: JSON.stringify([
        { name:'Graphic Design', percent:95 },
        { name:'Motion Graphics', percent:90 },
        { name:'Video Editing', percent:88 },
        { name:'Branding', percent:92 }
    ]),
    tools: JSON.stringify([
        { name:'Photoshop', icon:'fab fa-adobe' },
        { name:'Figma', icon:'fab fa-figma' },
        { name:'Illustrator', icon:'fas fa-pen-nib' },
        { name:'After Effects', icon:'fas fa-magic' },
        { name:'Premiere Pro', icon:'fas fa-cut' },
        { name:'Cinema 4D', icon:'fas fa-cube' }
    ]),
    invoice_notes:'Thank you for your business! Payment is due upon receipt.',
    revenue_offset:'0',
    email_subject_booking:'Booking Confirmed — #{{reference}}',
    email_body_booking:`Hi {{name}}!

Thank you for choosing us! Your booking has been confirmed and your project is now in our queue.

**Booking Details:**
• Service: {{service}}
• Amount: {{amount}}
• Reference: #{{reference}}

**What happens next:**
1. We'll review your project details within 24 hours
2. You'll receive a message to discuss specifics
3. Work begins once we're aligned on the details

Your invoice is attached to this email. If you have any questions, just reply to this email.`,
    email_subject_confirmed:'Your Project is Confirmed — #{{reference}}',
    email_body_confirmed:`Hi {{name}},

Great news! Your project has been officially confirmed and we're getting everything ready to start.

**Project:** {{service}}
**Reference:** #{{reference}}

We'll be in touch shortly with next steps. If you have any questions or additional details to share, just reply to this email.`,
    email_subject_in_progress:'Work Has Started on Your Project — #{{reference}}',
    email_body_in_progress:`Hi {{name}},

Exciting update — we've started working on your project!

**Project:** {{service}}
**Reference:** #{{reference}}

We'll keep you updated on the progress. If you need to share any feedback or additional materials, just reply to this email.`,
    email_subject_completed:'Your Project is Complete! — #{{reference}}',
    email_body_completed:`Hi {{name}},

Your project is complete! We're happy with how it turned out and we hope you will be too.

**Project:** {{service}}
**Reference:** #{{reference}}

Please review the deliverables and let us know if you'd like any adjustments. Your updated invoice is attached.

Thank you for choosing {{company}} — we'd love to work with you again!`,
    email_subject_delivered:'Project Delivered — #{{reference}}',
    email_body_delivered:`Hi {{name}},

Your project has been delivered! All final files have been sent.

**Project:** {{service}}
**Reference:** #{{reference}}

If everything looks good, we'd really appreciate it if you could leave us a quick review on our website. It helps us grow!

Thank you for your business, and we hope to work together again soon.`,
    pdf_header_note:'',
    pdf_footer_note:'Thank you for your business!',
    services: JSON.stringify([
        { id:'graphic', icon:'fa-palette', name:'Graphic Design', desc:'Professional designs that communicate your brand\'s message.', features:['Logo & Brand Identity','Social Media Graphics','Print Materials','Marketing Collateral'], price:199 },
        { id:'motion', icon:'fa-film', name:'Motion Graphics', desc:'Engaging animations that bring your ideas to life.', features:['Explainer Videos','Animated Logos','Kinetic Typography','Product Demos'], price:349 },
        { id:'video', icon:'fa-video', name:'Video Editing', desc:'Professional editing that transforms raw footage into stories.', features:['Long-form Editing','Color Grading','Sound Design','Special Effects'], price:249 },
        { id:'branding', icon:'fa-crown', name:'Branding Packages', desc:'Complete brand identity for a cohesive presence.', features:['Logo Design','Color Palette','Typography System','Brand Guidelines'], price:599 }
    ]),
    addons: JSON.stringify([
        { name:'Rush Delivery', desc:'Get your project 50% faster', price:49 },
        { name:'Source Files', desc:'Full editable source files', price:79 },
        { name:'Extra Revisions', desc:'3 additional rounds', price:29 },
        { name:'Social Media Kit', desc:'Assets for all platforms', price:99 }
    ]),
};

const ins = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
db.transaction(() => { for (const [k,v] of Object.entries(defaults)) ins.run(k,v); })();

// Default pages
const insPg = db.prepare('INSERT OR IGNORE INTO pages (slug,title,content) VALUES (?,?,?)');
insPg.run('terms','Terms & Conditions',`<h2>Terms & Conditions</h2><p><strong>Last updated:</strong> ${new Date().toLocaleDateString()}</p><h3>1. Services</h3><p>CreativeStudio provides graphic design, video editing, motion graphics, and branding services. All work is subject to the terms outlined in this agreement.</p><h3>2. Payments</h3><p>All payments are processed securely via Paystack. Payment is required before work begins. Prices are listed on our website and are subject to change.</p><h3>3. Revisions</h3><p>Each project includes 2 rounds of revisions. Additional revisions can be purchased as an add-on.</p><h3>4. Delivery</h3><p>Standard delivery is within the agreed timeline. Rush delivery is available for an additional fee.</p><h3>5. Intellectual Property</h3><p>Upon full payment, the client receives full rights to the final deliverables. Source files are available as an add-on purchase.</p><h3>6. Refund Policy</h3><p>Refunds may be issued at our discretion if work has not yet begun. Once work is in progress, no refunds will be provided.</p><h3>7. Contact</h3><p>For questions about these terms, contact us at hello@creativestudio.com.</p>`);
insPg.run('privacy','Privacy Policy',`<h2>Privacy Policy</h2><p><strong>Last updated:</strong> ${new Date().toLocaleDateString()}</p><h3>1. Information We Collect</h3><p>We collect information you provide when using our services: name, email, phone number, and project details submitted through our forms.</p><h3>2. How We Use Your Information</h3><p>Your information is used to: process your orders, communicate about your projects, send booking confirmations, and respond to your inquiries.</p><h3>3. Payment Security</h3><p>Payments are processed by Paystack. We do not store your card details.</p><h3>4. Newsletter</h3><p>If you subscribe to our newsletter, we store your email address. You can unsubscribe at any time via the link in our emails.</p><h3>5. Data Storage</h3><p>Your data is stored securely on our servers. We do not sell or share your personal information with third parties.</p><h3>6. Your Rights</h3><p>You may request access to, correction of, or deletion of your personal data by contacting us.</p><h3>7. Contact</h3><p>For privacy concerns, email us at hello@creativestudio.com.</p>`);

module.exports = {
    db, dbPath,

    // --- Contacts ---
    saveContact(d) { return db.prepare('INSERT INTO contacts (name,email,subject,message) VALUES (?,?,?,?)').run(d.name, d.email, d.subject||'', d.message).lastInsertRowid; },
    getAllContacts() { return db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all(); },
    markContactRead(id) { db.prepare('UPDATE contacts SET is_read=1 WHERE id=?').run(id); },
    deleteContact(id) { db.prepare('DELETE FROM contacts WHERE id=?').run(id); },

    // --- Newsletter ---
    saveSubscriber(email, token) { return db.prepare('INSERT OR IGNORE INTO newsletter (email,unsub_token) VALUES (?,?)').run(email, token).lastInsertRowid; },
    getSubscriber(email) { return db.prepare('SELECT * FROM newsletter WHERE email=?').get(email); },
    getSubscriberByToken(t) { return db.prepare('SELECT * FROM newsletter WHERE unsub_token=?').get(t); },
    getAllSubscribers() { return db.prepare('SELECT * FROM newsletter ORDER BY subscribed_at DESC').all(); },
    deleteSubscriber(id) { db.prepare('DELETE FROM newsletter WHERE id=?').run(id); },
    deleteSubscriberByToken(t) { return db.prepare('DELETE FROM newsletter WHERE unsub_token=?').run(t); },

    // --- Bookings ---
    saveBooking(d) {
        return db.prepare('INSERT INTO bookings (name,email,phone,service,service_type,description,deadline,base_price,addons_price,total_amount,addons,reference,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
            d.name, d.email, d.phone||'', d.service, d.serviceType||'', d.description||'',
            d.deadline||'', d.basePrice||0, d.addonsPrice||0, d.totalAmount||0,
            d.addons||'[]', d.reference, d.status||'pending'
        ).lastInsertRowid;
    },
    updateBookingStatus(ref, status) { db.prepare('UPDATE bookings SET status=? WHERE reference=?').run(status, ref); },
    setBookingInvoice(ref, p) { db.prepare('UPDATE bookings SET invoice_path=? WHERE reference=?').run(p, ref); },
    getBookingByRef(ref) { return db.prepare('SELECT * FROM bookings WHERE reference=?').get(ref); },
    getAllBookings() { return db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all(); },
    deleteBooking(id) { db.prepare('DELETE FROM bookings WHERE id=?').run(id); },
    clearAllBookings() { db.prepare('DELETE FROM bookings').run(); },

    // --- Portfolio ---
    addPortfolioItem(d) { return db.prepare('INSERT INTO portfolio (title,category,tags,image_url,video_url,description,is_visible,sort_order) VALUES (?,?,?,?,?,?,?,?)').run(d.title, d.category, JSON.stringify(d.tags||[]), d.image_url, d.video_url||'', d.description||'', d.is_visible!==undefined?d.is_visible:1, d.sort_order||0).lastInsertRowid; },
    updatePortfolioItem(id, d) { db.prepare('UPDATE portfolio SET title=?,category=?,tags=?,image_url=?,video_url=?,description=?,is_visible=?,sort_order=? WHERE id=?').run(d.title, d.category, JSON.stringify(d.tags||[]), d.image_url, d.video_url||'', d.description||'', d.is_visible!==undefined?d.is_visible:1, d.sort_order||0, id); },
    deletePortfolioItem(id) { db.prepare('DELETE FROM portfolio WHERE id=?').run(id); },
    togglePortfolioVisibility(id) { db.prepare('UPDATE portfolio SET is_visible=CASE WHEN is_visible=1 THEN 0 ELSE 1 END WHERE id=?').run(id); },
    getAllPortfolio() { return db.prepare('SELECT * FROM portfolio ORDER BY sort_order ASC, created_at DESC').all(); },
    getVisiblePortfolio() { return db.prepare("SELECT * FROM portfolio WHERE is_visible=1 ORDER BY sort_order ASC, created_at DESC").all(); },

    // --- Reviews ---
    saveReview(d) { return db.prepare('INSERT INTO reviews (name,email,company,role,rating,text,service_used) VALUES (?,?,?,?,?,?,?)').run(d.name, d.email, d.company||'', d.role||'', d.rating||5, d.text, d.service_used||'').lastInsertRowid; },
    getAllReviews() { return db.prepare('SELECT * FROM reviews ORDER BY created_at DESC').all(); },
    getApprovedReviews() { return db.prepare("SELECT * FROM reviews WHERE status='approved' ORDER BY created_at DESC").all(); },
    updateReviewStatus(id, s) { db.prepare('UPDATE reviews SET status=? WHERE id=?').run(s, id); },
    deleteReview(id) { db.prepare('DELETE FROM reviews WHERE id=?').run(id); },

    // --- Settings ---
    getSetting(k) { const r=db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r?r.value:null; },
    getAllSettings() { const rows=db.prepare('SELECT key,value FROM settings').all(); const o={}; rows.forEach(r=>o[r.key]=r.value); return o; },
    setSetting(k,v) { db.prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').run(k,v); },
    setSettings(obj) { const s=db.prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP'); db.transaction(()=>{for(const[k,v]of Object.entries(obj))s.run(k,v);})(); },

    // --- Pages ---
    getPage(slug) { return db.prepare('SELECT * FROM pages WHERE slug=?').get(slug); },
    getAllPages() { return db.prepare('SELECT slug,title,updated_at FROM pages ORDER BY slug').all(); },
    savePage(slug,title,content) { db.prepare('INSERT INTO pages (slug,title,content,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(slug) DO UPDATE SET title=excluded.title,content=excluded.content,updated_at=CURRENT_TIMESTAMP').run(slug,title,content); },

    // --- Admin Users (bcrypt) ---
    getAdminUser(username) { return db.prepare('SELECT * FROM admin_users WHERE username=?').get(username); },
    createAdminUser(username, hash) { return db.prepare('INSERT INTO admin_users (username,password_hash) VALUES (?,?)').run(username, hash).lastInsertRowid; },
    adminUserCount() { return db.prepare('SELECT COUNT(*) as c FROM admin_users').get().c; },

    // --- Stats ---
    getStats() {
        const b=db.prepare('SELECT COUNT(*) as c, COALESCE(SUM(total_amount),0) as r FROM bookings').get();
        const u=db.prepare('SELECT COUNT(*) as c FROM contacts WHERE is_read=0').get();
        const s=db.prepare('SELECT COUNT(*) as c FROM newsletter').get();
        const p=db.prepare('SELECT COUNT(*) as c FROM portfolio').get();
        const pr=db.prepare("SELECT COUNT(*) as c FROM reviews WHERE status='pending'").get();
        const offset=parseInt(db.prepare("SELECT value FROM settings WHERE key='revenue_offset'").get()?.value || '0') || 0;
        return { totalBookings:b.c, totalRevenue:b.r + offset, rawRevenue:b.r, revenueOffset:offset, unreadMessages:u.c, totalSubscribers:s.c, portfolioItems:p.c, pendingReviews:pr.c };
    },
};

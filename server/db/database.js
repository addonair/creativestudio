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
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS blog_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
        excerpt TEXT DEFAULT '', content TEXT NOT NULL,
        cover_image TEXT DEFAULT '', category TEXT DEFAULT 'general',
        tags TEXT DEFAULT '[]', author TEXT DEFAULT 'Admin',
        status TEXT DEFAULT 'draft',
        views INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS faqs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL, answer TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        sort_order INTEGER DEFAULT 0,
        is_visible INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS discount_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        type TEXT DEFAULT 'percentage',
        value REAL DEFAULT 0,
        min_order REAL DEFAULT 0,
        max_uses INTEGER DEFAULT 0,
        used_count INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS referrals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referrer_email TEXT NOT NULL,
        referrer_name TEXT DEFAULT '',
        referral_code TEXT UNIQUE NOT NULL,
        discount_percent REAL DEFAULT 10,
        uses INTEGER DEFAULT 0,
        earnings REAL DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS page_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page TEXT NOT NULL,
        referrer TEXT DEFAULT '',
        user_agent TEXT DEFAULT '',
        ip_hash TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS booking_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_ref TEXT NOT NULL,
        note TEXT NOT NULL,
        author TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        details TEXT DEFAULT '',
        user TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_ref TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        download_token TEXT UNIQUE NOT NULL,
        download_count INTEGER DEFAULT 0,
        uploaded_by TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS client_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// ---- Safe migrations for existing DBs ----
const m = (sql) => { try { db.exec(sql); } catch(e) {} };
m("ALTER TABLE contacts ADD COLUMN is_read INTEGER DEFAULT 0");
m("ALTER TABLE portfolio ADD COLUMN video_url TEXT DEFAULT ''");
m("ALTER TABLE newsletter ADD COLUMN unsub_token TEXT");
m("ALTER TABLE bookings ADD COLUMN invoice_path TEXT");
m("ALTER TABLE bookings ADD COLUMN discount_code TEXT DEFAULT ''");
m("ALTER TABLE bookings ADD COLUMN discount_amount REAL DEFAULT 0");
m("ALTER TABLE admin_users ADD COLUMN role TEXT DEFAULT 'admin'");

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

    // --- Blog ---
    createBlogPost(d) { return db.prepare('INSERT INTO blog_posts (title,slug,excerpt,content,cover_image,category,tags,author,status) VALUES (?,?,?,?,?,?,?,?,?)').run(d.title, d.slug, d.excerpt||'', d.content, d.cover_image||'', d.category||'general', JSON.stringify(d.tags||[]), d.author||'Admin', d.status||'draft').lastInsertRowid; },
    updateBlogPost(id, d) { db.prepare('UPDATE blog_posts SET title=?,slug=?,excerpt=?,content=?,cover_image=?,category=?,tags=?,author=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(d.title, d.slug, d.excerpt||'', d.content, d.cover_image||'', d.category||'general', JSON.stringify(d.tags||[]), d.author||'Admin', d.status||'draft', id); },
    deleteBlogPost(id) { db.prepare('DELETE FROM blog_posts WHERE id=?').run(id); },
    getBlogPost(slug) { return db.prepare('SELECT * FROM blog_posts WHERE slug=?').get(slug); },
    getBlogPostById(id) { return db.prepare('SELECT * FROM blog_posts WHERE id=?').get(id); },
    getPublishedPosts() { return db.prepare("SELECT * FROM blog_posts WHERE status='published' ORDER BY created_at DESC").all(); },
    getAllBlogPosts() { return db.prepare('SELECT * FROM blog_posts ORDER BY created_at DESC').all(); },
    incrementPostViews(slug) { db.prepare('UPDATE blog_posts SET views=views+1 WHERE slug=?').run(slug); },

    // --- FAQs ---
    createFAQ(d) { return db.prepare('INSERT INTO faqs (question,answer,category,sort_order,is_visible) VALUES (?,?,?,?,?)').run(d.question, d.answer, d.category||'general', d.sort_order||0, d.is_visible!==undefined?d.is_visible:1).lastInsertRowid; },
    updateFAQ(id, d) { db.prepare('UPDATE faqs SET question=?,answer=?,category=?,sort_order=?,is_visible=? WHERE id=?').run(d.question, d.answer, d.category||'general', d.sort_order||0, d.is_visible!==undefined?d.is_visible:1, id); },
    deleteFAQ(id) { db.prepare('DELETE FROM faqs WHERE id=?').run(id); },
    getAllFAQs() { return db.prepare('SELECT * FROM faqs ORDER BY sort_order ASC, id ASC').all(); },
    getVisibleFAQs() { return db.prepare('SELECT * FROM faqs WHERE is_visible=1 ORDER BY sort_order ASC, id ASC').all(); },

    // --- Discount Codes ---
    createDiscount(d) { return db.prepare('INSERT INTO discount_codes (code,type,value,min_order,max_uses,is_active,expires_at) VALUES (?,?,?,?,?,?,?)').run(d.code.toUpperCase(), d.type||'percentage', d.value||0, d.min_order||0, d.max_uses||0, d.is_active!==undefined?d.is_active:1, d.expires_at||null).lastInsertRowid; },
    updateDiscount(id, d) { db.prepare('UPDATE discount_codes SET code=?,type=?,value=?,min_order=?,max_uses=?,is_active=?,expires_at=? WHERE id=?').run(d.code.toUpperCase(), d.type||'percentage', d.value||0, d.min_order||0, d.max_uses||0, d.is_active!==undefined?d.is_active:1, d.expires_at||null, id); },
    toggleDiscount(id, isActive) { db.prepare('UPDATE discount_codes SET is_active=? WHERE id=?').run(isActive ? 1 : 0, id); },
    deleteDiscount(id) { db.prepare('DELETE FROM discount_codes WHERE id=?').run(id); },
    getDiscountByCode(code) { return db.prepare('SELECT * FROM discount_codes WHERE code=? AND is_active=1').get(code.toUpperCase()); },
    getAllDiscounts() { return db.prepare('SELECT * FROM discount_codes ORDER BY created_at DESC').all(); },
    incrementDiscountUse(id) { db.prepare('UPDATE discount_codes SET used_count=used_count+1 WHERE id=?').run(id); },

    // --- Referrals ---
    createReferral(d) { return db.prepare('INSERT INTO referrals (referrer_email,referrer_name,referral_code,discount_percent) VALUES (?,?,?,?)').run(d.referrer_email, d.referrer_name||'', d.referral_code, d.discount_percent||10).lastInsertRowid; },
    getReferralByCode(code) { return db.prepare('SELECT * FROM referrals WHERE referral_code=? AND is_active=1').get(code); },
    getAllReferrals() { return db.prepare('SELECT * FROM referrals ORDER BY created_at DESC').all(); },
    updateReferral(id, d) { db.prepare('UPDATE referrals SET referral_code=?,referrer_name=?,referrer_email=?,discount_percent=? WHERE id=?').run(d.referral_code||d.code, d.referrer_name||'', d.referrer_email||'', d.discount_percent||10, id); },
    incrementReferralUse(id, amount) { db.prepare('UPDATE referrals SET uses=uses+1,earnings=earnings+? WHERE id=?').run(amount||0, id); },
    deleteReferral(id) { db.prepare('DELETE FROM referrals WHERE id=?').run(id); },

    // --- Page Views / Analytics ---
    trackPageView(page, referrer, ua, ipHash) { db.prepare('INSERT INTO page_views (page,referrer,user_agent,ip_hash) VALUES (?,?,?,?)').run(page, referrer||'', ua||'', ipHash||''); },
    getPageViewStats(days) {
        const d = days || 30;
        const views = db.prepare(`SELECT page, COUNT(*) as count FROM page_views WHERE created_at >= datetime('now', '-${d} days') GROUP BY page ORDER BY count DESC`).all();
        const daily = db.prepare(`SELECT date(created_at) as day, COUNT(*) as count FROM page_views WHERE created_at >= datetime('now', '-${d} days') GROUP BY date(created_at) ORDER BY day`).all();
        const total = db.prepare(`SELECT COUNT(*) as c FROM page_views WHERE created_at >= datetime('now', '-${d} days')`).get();
        const unique = db.prepare(`SELECT COUNT(DISTINCT ip_hash) as c FROM page_views WHERE created_at >= datetime('now', '-${d} days')`).get();
        return { views, daily, total: total.c, unique: unique.c };
    },
    getRevenueByMonth() {
        return db.prepare("SELECT strftime('%Y-%m', created_at) as month, SUM(total_amount) as revenue, COUNT(*) as count FROM bookings GROUP BY strftime('%Y-%m', created_at) ORDER BY month DESC LIMIT 12").all();
    },
    getPopularServices() {
        return db.prepare('SELECT service, COUNT(*) as count, SUM(total_amount) as revenue FROM bookings GROUP BY service ORDER BY count DESC').all();
    },
    getBookingsByStatus() {
        return db.prepare('SELECT status, COUNT(*) as count FROM bookings GROUP BY status').all();
    },

    // --- Booking Notes ---
    addBookingNote(ref, note, author) { return db.prepare('INSERT INTO booking_notes (booking_ref,note,author) VALUES (?,?,?)').run(ref, note, author||'admin').lastInsertRowid; },
    getBookingNotes(ref) { return db.prepare('SELECT * FROM booking_notes WHERE booking_ref=? ORDER BY created_at DESC').all(ref); },
    deleteBookingNote(id) { db.prepare('DELETE FROM booking_notes WHERE id=?').run(id); },

    // --- Activity Log ---
    logActivity(action, details, user) { db.prepare('INSERT INTO activity_log (action,details,user) VALUES (?,?,?)').run(action, details||'', user||'admin'); },
    getActivityLog(limit) { return db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').all(limit||50); },

    // --- File Deliveries ---
    addDelivery(d) { return db.prepare('INSERT INTO deliveries (booking_ref,filename,original_name,file_size,download_token,uploaded_by) VALUES (?,?,?,?,?,?)').run(d.booking_ref, d.filename, d.original_name, d.file_size||0, d.download_token, d.uploaded_by||'admin').lastInsertRowid; },
    getAllDeliveries() { return db.prepare('SELECT * FROM deliveries ORDER BY created_at DESC').all(); },
    getDeliveriesByRef(ref) { return db.prepare('SELECT * FROM deliveries WHERE booking_ref=? ORDER BY created_at DESC').all(ref); },
    getDeliveryByToken(token) { return db.prepare('SELECT * FROM deliveries WHERE download_token=?').get(token); },
    incrementDownload(id) { db.prepare('UPDATE deliveries SET download_count=download_count+1 WHERE id=?').run(id); },
    deleteDelivery(id) { db.prepare('DELETE FROM deliveries WHERE id=?').run(id); },

    // --- Client Sessions ---
    createClientSession(email, token, expiresAt) { return db.prepare('INSERT INTO client_sessions (email,token,expires_at) VALUES (?,?,?)').run(email, token, expiresAt).lastInsertRowid; },
    getClientSession(token) { return db.prepare("SELECT * FROM client_sessions WHERE token=? AND expires_at > datetime('now')").get(token); },
    deleteExpiredSessions() { db.prepare("DELETE FROM client_sessions WHERE expires_at <= datetime('now')").run(); },
    deleteClientSession(token) { db.prepare('DELETE FROM client_sessions WHERE token=?').run(token); },

    // --- Multi-Admin ---
    getAllAdminUsers() { return db.prepare('SELECT id,username,role,created_at FROM admin_users ORDER BY created_at').all(); },
    updateAdminRole(id, role) { db.prepare('UPDATE admin_users SET role=? WHERE id=?').run(role, id); },
    deleteAdminUser(id) { db.prepare('DELETE FROM admin_users WHERE id=?').run(id); },
    updateAdminPassword(id, hash) { db.prepare('UPDATE admin_users SET password_hash=? WHERE id=?').run(hash, id); },

    // --- Portfolio Reorder ---
    reorderPortfolio(items) {
        const stmt = db.prepare('UPDATE portfolio SET sort_order=? WHERE id=?');
        db.transaction(() => { items.forEach((item, i) => stmt.run(i, item.id)); })();
    },
};

# CreativeStudio — Project Instructions for Claude

## OVERVIEW
Professional creative studio website for a design/video editing business in Accra, Ghana. Has a public website, admin dashboard with full site control, and backend API. Actively being built.

## TECH STACK
- **Frontend:** HTML, CSS, vanilla JavaScript (no frameworks)
- **Backend:** Node.js, Express.js
- **Database:** SQLite via `better-sqlite3`
- **Payments:** Paystack (Ghana-based gateway) — popup checkout
- **Email:** Nodemailer with Gmail SMTP (port 465, secure: true)
- **File uploads:** Multer (portfolio images, logo)
- **No build tools** — plain files served by Express

## PROJECT STRUCTURE
```
creativestudio/
├── index.html              ← Main public website (single page)
├── css/styles.css          ← All styling
├── js/main.js              ← Frontend logic (booking, payments, forms, reviews, dynamic settings)
├── uploads/                ← Uploaded images (auto-created)
├── admin/
│   └── index.html          ← Admin dashboard (full site control)
├── server/
│   ├── server.js           ← Express backend (all API routes)
│   ├── email.js            ← Nodemailer email helper
│   ├── package.json        ← Dependencies: express, better-sqlite3, cors, dotenv, nodemailer, multer
│   ├── .env                ← Secret keys (not in repo)
│   ├── .env.example        ← Template for .env
│   └── db/
│       ├── database.js     ← SQLite setup + queries + default settings
│       └── creativestudio.db ← Database file (auto-created)
└── .gitignore
```

## DESIGN DECISIONS (already made)
- **Color scheme:** Clean light theme — white/cream + navy + warm golden-brown — ALL customizable from admin
- **Typography:** Playfair Display / Source Sans 3 / IBM Plex Mono — ALL changeable from admin
- **Style:** Professional, friendly, editorial luxury aesthetic
- **No dark theme** — user chose light/clean
- **Currency:** GHS displayed as $ — configurable in CONFIG

## DATABASE TABLES
1. **contacts** — name, email, subject, message, is_read, created_at
2. **newsletter** — email (unique), subscribed_at
3. **bookings** — name, email, phone, service, description, deadline, prices, addons (JSON), reference, status, created_at
4. **portfolio** — title, category, tags (JSON), image_url, description, is_visible, sort_order, created_at
5. **reviews** — name, email, company, role, rating (1-5), text, service_used, status (pending/approved/rejected), created_at
6. **settings** — key/value store for ALL site config (colors, fonts, content, social links, services, addons)
7. **pages** — slug, title, content (HTML) — Terms & Conditions, Privacy Policy

## SETTINGS SYSTEM (key-value in settings table)
- **Branding:** company_name, tagline, logo_url, about_image_url, footer_text
- **Contact:** email, phone, address
- **Social:** social_behance, social_dribbble, social_instagram, social_linkedin, social_twitter, social_youtube
- **Colors:** color_primary, color_primary_light, color_accent, color_background, color_text, color_text_muted
- **Fonts:** font_headings, font_body, font_accent
- **Shapes:** border_radius, border_radius_large
- **Hero:** hero_title, hero_subtitle, hero_badge, stat_projects, stat_clients, stat_turnaround, cta_title, cta_subtitle
- **Services:** JSON array of {id, icon, name, desc, features[], price}
- **Addons:** JSON array of {name, desc, price}

Frontend loads settings via GET /api/settings and applies CSS variables + content dynamically.

## ADMIN DASHBOARD SECTIONS (at /admin)
1. **Dashboard** — Stats + recent bookings
2. **Portfolio** — CRUD, image upload, show/hide, ordering
3. **Reviews** — View/filter/approve/reject/delete
4. **Pages** — Edit Terms & Conditions, Privacy Policy (HTML editor)
5. **Messages** — View, mark read, reply via email, delete
6. **Bookings** — All bookings with refs, amounts, status
7. **Subscribers** — Newsletter list, remove
8. **Site Settings** — Branding, Contact/Social, Hero content, Services/Pricing, Add-ons
9. **Appearance** — 6 color pickers, 3 font selectors, border radius controls

## CURRENT STATUS
- Gmail SMTP working (port 465, App Password)
- Paystack TEST keys configured (not yet live)
- Admin credentials in .env
- All features functional locally at localhost:3000
- Not yet deployed to production

## IMPORTANT NOTES FOR CLAUDE
- Only provide files that changed — don't regenerate unchanged files
- Server runs with `cd server && npm start` at http://localhost:3000
- Admin at http://localhost:3000/admin
- User is in Accra, Ghana — consider for location suggestions
- User prefers step-by-step guidance
- Database has existing data — use migrations with try/catch, NEVER DROP tables
- Settings use INSERT OR IGNORE — safe for existing databases

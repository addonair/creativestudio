// ============================================================
// CREATIVE STUDIO — Main Frontend JavaScript
// ============================================================

const CONFIG = {
    PAYSTACK_PUBLIC_KEY: 'pk_test_470b83423c7e6e5c7338a82721a538d13ade7ca1',
    API_URL: '/api',
    CURRENCY: 'GHS',
};

// Global state
let siteSettings = {};
let currentCurrency = 'USD';
let ghsRate = 15.5;


// ============================================================
// LOAD SITE SETTINGS — the heart of dynamic rendering
// ============================================================
async function loadSiteSettings() {
    try {
        const res = await fetch(`${CONFIG.API_URL}/settings`);
        if (!res.ok) return;
        const s = await res.json();
        siteSettings = s;

        if (s.currency_rate) ghsRate = parseFloat(s.currency_rate) || 15.5;

        // Load Paystack key from server
        try {
            const cfgRes = await fetch(`${CONFIG.API_URL}/config`);
            if (cfgRes.ok) { const cfg = await cfgRes.json(); if (cfg.paystackKey) CONFIG.PAYSTACK_PUBLIC_KEY = cfg.paystackKey; }
        } catch(e) {}

        // ---- CSS Custom Properties ----
        const root = document.documentElement.style;
        if (s.color_primary) {
            root.setProperty('--navy', s.color_primary);
            root.setProperty('--navy-deep', s.color_primary);
            // Derive lighter version
            const pl = s.color_primary_light || lightenColor(s.color_primary, 30);
            root.setProperty('--navy-light', pl);
        }
        if (s.color_primary_light) root.setProperty('--navy-light', s.color_primary_light);
        if (s.color_accent) {
            root.setProperty('--warm', s.color_accent);
            root.setProperty('--warm-light', s.color_accent + '1a');
            root.setProperty('--warm-hover', darkenColor(s.color_accent, 15));
        }
        if (s.color_background) {
            root.setProperty('--cream', s.color_background);
            root.setProperty('--cream-dark', darkenColor(s.color_background, 5));
        }
        if (s.color_text) root.setProperty('--text', s.color_text);
        if (s.color_text_muted) {
            root.setProperty('--text-muted', s.color_text_muted);
            root.setProperty('--text-light', lightenColor(s.color_text_muted, 20));
        }
        if (s.border_radius !== undefined && s.border_radius !== '') root.setProperty('--radius', s.border_radius + 'px');
        if (s.border_radius_large !== undefined && s.border_radius_large !== '') root.setProperty('--radius-lg', s.border_radius_large + 'px');
        if (s.btn_radius !== undefined && s.btn_radius !== '') root.setProperty('--btn-radius', s.btn_radius + 'px');
        if (s.section_spacing) {
            const spacing = { compact: '4.5rem', normal: '7rem', spacious: '9rem' };
            root.setProperty('--section-padding', spacing[s.section_spacing] || '7rem');
        }
        if (s.shadow_style) {
            const shadows = {
                none: { sm: 'none', md: 'none', lg: 'none' },
                subtle: { sm: '0 1px 2px rgba(0,0,0,0.03)', md: '0 4px 15px rgba(0,0,0,0.04)', lg: '0 10px 30px rgba(0,0,0,0.06)' },
                normal: { sm: '0 1px 3px rgba(0,0,0,0.05)', md: '0 8px 30px rgba(0,0,0,0.07)', lg: '0 20px 50px rgba(0,0,0,0.09)' },
                bold: { sm: '0 2px 6px rgba(0,0,0,0.08)', md: '0 12px 40px rgba(0,0,0,0.12)', lg: '0 25px 60px rgba(0,0,0,0.15)' }
            };
            const sh = shadows[s.shadow_style] || shadows.normal;
            root.setProperty('--shadow-sm', sh.sm);
            root.setProperty('--shadow-md', sh.md);
            root.setProperty('--shadow-lg', sh.lg);
        }

        // ---- Dynamic Font Loading ----
        const defaultFonts = ['Playfair Display', 'Source Sans 3', 'IBM Plex Mono'];
        const fontsToLoad = [];
        if (s.font_headings && !defaultFonts.includes(s.font_headings)) fontsToLoad.push(s.font_headings);
        if (s.font_body && !defaultFonts.includes(s.font_body)) fontsToLoad.push(s.font_body);
        if (s.font_accent && !defaultFonts.includes(s.font_accent)) fontsToLoad.push(s.font_accent);
        if (fontsToLoad.length) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=' + fontsToLoad.map(f => f.replace(/ /g, '+') + ':wght@400;500;600;700').join('&family=') + '&display=swap';
            document.head.appendChild(link);
        }
        if (s.font_headings) document.querySelectorAll('h1,h2,h3,.logo,.stat-number,.testimonial-avatar,.about-badge .num').forEach(el => el.style.fontFamily = `'${s.font_headings}', serif`);
        if (s.font_body) document.body.style.fontFamily = `'${s.font_body}', sans-serif`;
        if (s.font_accent) document.querySelectorAll('.section-tag,.stat-label,.step-label,.payment-ref,.addon-price,.total-row.total span:last-child,.skill-header span:last-child').forEach(el => el.style.fontFamily = `'${s.font_accent}', monospace`);

        // ---- Company Name & Logo EVERYWHERE ----
        const companyName = s.company_name || 'CreativeStudio';
        const nameHTML = companyName.replace(/\.$/, '') + '<span style="color:var(--warm)">.</span>';

        // Header logo
        const headerLogo = document.querySelector('#header .logo');
        if (headerLogo) {
            headerLogo.innerHTML = s.logo_url
                ? `<img src="${s.logo_url}" alt="${companyName}" style="height:36px">`
                : nameHTML;
        }

        // Footer logo
        const footerH3 = document.querySelector('footer .footer-column:first-child > h3');
        if (footerH3) {
            footerH3.innerHTML = s.logo_url
                ? `<img src="${s.logo_url}" alt="${companyName}" style="height:32px">`
                : nameHTML;
        }

        // Page title
        document.title = `${companyName} | ${s.tagline || 'Design & Motion Services'}`;

        // ---- Hero Section ----
        if (s.hero_badge) { const el = document.querySelector('.hero-label'); if (el) el.innerHTML = `<span class="dot"></span> ${s.hero_badge}`; }
        if (s.hero_title) { const el = document.querySelector('.hero h1'); if (el) el.innerHTML = s.hero_title; }
        if (s.hero_subtitle) { const el = document.querySelector('.hero-content > p'); if (el) el.textContent = s.hero_subtitle; }

        // ---- Contact Info ----
        if (s.email) document.querySelectorAll('a[href^="mailto:"]').forEach(a => { a.href = 'mailto:' + s.email; a.textContent = s.email; });
        if (s.phone) document.querySelectorAll('a[href^="tel:"]').forEach(a => { a.href = 'tel:' + s.phone.replace(/\s/g, ''); a.textContent = s.phone; });
        if (s.address) document.querySelectorAll('.address-text').forEach(el => el.textContent = s.address);

        // ---- Social Links (from JSON) ----
        const socialIconMap = {facebook:'fa-facebook-f',instagram:'fa-instagram',twitter:'fa-twitter',tiktok:'fa-tiktok',youtube:'fa-youtube',linkedin:'fa-linkedin-in',behance:'fa-behance',dribbble:'fa-dribbble',pinterest:'fa-pinterest-p',snapchat:'fa-snapchat-ghost',whatsapp:'fa-whatsapp',telegram:'fa-telegram-plane',github:'fa-github',vimeo:'fa-vimeo-v',spotify:'fa-spotify',threads:'fa-threads',website:'fa-globe'};
        try {
            const socials = JSON.parse(s.socials || '[]');
            document.querySelectorAll('.social-links').forEach(container => {
                if (!socials.length) return;
                container.innerHTML = socials.filter(sc => sc.url && sc.url.trim()).map(sc => {
                    const icon = socialIconMap[sc.platform] || 'fa-link';
                    return `<a href="${sc.url}" class="social-link" target="_blank" rel="noopener" title="${sc.platform}"><i class="fab ${icon}"></i></a>`;
                }).join('');
            });
        } catch(e) {
            // Fallback: try old social_ format
            const socialMap = { behance:'fa-behance', dribbble:'fa-dribbble', instagram:'fa-instagram', linkedin:'fa-linkedin-in', twitter:'fa-twitter', youtube:'fa-youtube' };
            document.querySelectorAll('.social-links').forEach(container => {
                let html = '';
                for (const [key, icon] of Object.entries(socialMap)) {
                    const url = s['social_' + key];
                    if (url && url !== '#' && url.trim()) html += `<a href="${url}" class="social-link" target="_blank" rel="noopener"><i class="fab ${icon}"></i></a>`;
                }
                if (html) container.innerHTML = html;
            });
        }

        // Footer text
        if (s.footer_text) { const el = document.querySelector('footer .footer-column:first-child > p'); if (el) el.textContent = s.footer_text; }

        // CTA Banner
        if (s.cta_title) { const el = document.querySelector('.cta-banner h2'); if (el) el.innerHTML = s.cta_title; }
        if (s.cta_subtitle) { const el = document.querySelector('.cta-banner p'); if (el) el.textContent = s.cta_subtitle; }

        // ---- DYNAMIC SERVICES ----
        renderServicesFromSettings(s);

        // ---- DYNAMIC ADDONS ----
        renderAddonsFromSettings(s);

        // ---- DYNAMIC ABOUT SECTION ----
        renderAboutFromSettings(s);

        // ---- HERO STATS targets ----
        window._statTargets = {
            projects: parseInt(s.stat_projects) || 150,
            clients: parseInt(s.stat_clients) || 80,
            turnaround: parseInt(s.stat_turnaround) || 48,
        };

    } catch (err) { console.log('Settings API not available, using defaults'); }
}


// ============================================================
// RENDER SERVICES FROM SETTINGS — cards + booking dropdown + footer
// ============================================================
function renderServicesFromSettings(s) {
    let services = [];
    try { services = JSON.parse(s.services || '[]'); } catch(e) { console.warn('Failed to parse services:', e); }
    if (!services.length) { console.log('No services in settings, keeping static HTML'); return; }

    console.log('Rendering', services.length, 'services from admin settings');

    // 1. Service cards — carousel if 5+, grid if 4 or fewer
    const grid = document.querySelector('.services-grid');
    if (grid) {
        const cardsHTML = services.map(svc => `
            <div class="service-card reveal visible">
                <div class="service-icon-wrap"><i class="fas ${svc.icon || 'fa-star'}"></i></div>
                <h3>${svc.name}</h3>
                <p>${svc.desc || ''}</p>
                <ul class="service-features">${(svc.features || []).map(f => `<li>${f}</li>`).join('')}</ul>
                <div class="price-tag service-price" data-usd="${svc.price}">From $${svc.price}</div>
                <a href="#booking" class="btn btn-outline">Get Started</a>
            </div>
        `).join('');

        if (services.length > 4) {
            grid.classList.add('services-carousel');
            grid.innerHTML = `<div class="services-track">${cardsHTML}</div>`;
            // Add navigation arrows
            const parent = grid.parentElement;
            if (!parent.querySelector('.svc-nav')) {
                const nav = document.createElement('div');
                nav.className = 'svc-nav';
                nav.innerHTML = `<button class="svc-arrow svc-prev" aria-label="Previous"><i class="fas fa-chevron-left"></i></button>
                    <button class="svc-arrow svc-next" aria-label="Next"><i class="fas fa-chevron-right"></i></button>`;
                parent.appendChild(nav);
                const track = grid.querySelector('.services-track');
                nav.querySelector('.svc-prev').addEventListener('click', () => track.scrollBy({ left: -320, behavior: 'smooth' }));
                nav.querySelector('.svc-next').addEventListener('click', () => track.scrollBy({ left: 320, behavior: 'smooth' }));
            }
        } else {
            grid.classList.remove('services-carousel');
            grid.innerHTML = cardsHTML;
        }
    }

    // 2. Booking dropdown — replace options
    const sel = document.getElementById('service-type');
    if (sel) {
        sel.innerHTML = '<option value="">Select a service...</option>' +
            services.map(svc => `<option value="${svc.id || svc.name}" data-price="${svc.price}">${svc.name} — $${svc.price}</option>`).join('');
    }

    // 3. Review form service options
    const revSel = document.getElementById('review-service');
    if (revSel) {
        revSel.innerHTML = '<option value="">Select...</option>' +
            services.map(svc => `<option value="${svc.name}">${svc.name}</option>`).join('');
    }

    // 4. Footer services list
    const footerList = document.querySelector('footer .footer-column:nth-child(3) .footer-links');
    if (footerList) {
        footerList.innerHTML = services.map(svc => `<li><a href="#services">${svc.name}</a></li>`).join('') +
            '<li><a href="#booking">Book a Project</a></li><li><a href="/terms">Terms & Conditions</a></li><li><a href="/privacy">Privacy Policy</a></li>';
    }
}


// ============================================================
// RENDER ADDONS FROM SETTINGS
// ============================================================
function renderAddonsFromSettings(s) {
    let addons = [];
    try { addons = JSON.parse(s.addons || '[]'); } catch(e) {}
    if (!addons.length) return;

    const list = document.querySelector('.addons-list');
    if (list) {
        list.innerHTML = addons.map(a => `
            <div class="addon-item" data-price="${a.price}">
                <div class="addon-info"><div class="addon-checkbox"></div><div><h4>${a.name}</h4><p>${a.desc || ''}</p></div></div>
                <div class="addon-price" data-usd="${a.price}">+$${a.price}</div>
            </div>
        `).join('');
    }
}


// ============================================================
// RENDER ABOUT SECTION FROM SETTINGS
// ============================================================
function renderAboutFromSettings(s) {
    // About title
    if (s.about_title) {
        const el = document.querySelector('.about-text h3');
        if (el) el.textContent = s.about_title;
    }

    // About paragraphs
    const textContainer = document.querySelector('.about-text');
    if (textContainer) {
        const p1 = textContainer.querySelector('#about-p1');
        const p2 = textContainer.querySelector('#about-p2');
        if (p1 && s.about_text_1) p1.textContent = s.about_text_1;
        if (p2 && s.about_text_2) p2.textContent = s.about_text_2;
    }

    // Years badge
    if (s.about_years) {
        const numEl = document.querySelector('.about-badge .num');
        if (numEl) numEl.textContent = s.about_years;
    }
    if (s.about_years_label) {
        const lblEl = document.querySelector('.about-badge .lbl');
        if (lblEl) lblEl.textContent = s.about_years_label;
    }

    // About image
    if (s.about_image_url) {
        const imgDiv = document.querySelector('.about-image');
        if (imgDiv) {
            imgDiv.style.background = 'none';
            imgDiv.innerHTML = `<img src="${s.about_image_url}" alt="About" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-lg);cursor:pointer" onclick="openLightbox('${s.about_image_url}','About')">`;
        }
    }

    // Skills bars — from settings JSON
    let skills = [];
    try { skills = JSON.parse(s.skills || '[]'); } catch(e) {}
    if (skills.length) {
        const skillsList = document.querySelector('.skills-list');
        if (skillsList) {
            skillsList.innerHTML = skills.map(sk => `
                <div class="skill-item">
                    <div class="skill-header"><span>${sk.name}</span><span>${sk.percent}%</span></div>
                    <div class="skill-bar"><div class="skill-progress" data-width="${sk.percent}"></div></div>
                </div>
            `).join('');
        }
    }

    // Tools chips — from settings JSON
    let tools = [];
    try { tools = JSON.parse(s.tools || '[]'); } catch(e) {}
    if (tools.length) {
        const toolsGrid = document.querySelector('.tools-grid');
        if (toolsGrid) {
            toolsGrid.innerHTML = tools.map(t =>
                `<div class="tool-chip"><i class="${t.icon || 'fas fa-star'}"></i> ${t.name}</div>`
            ).join('');
        }
    }
}


// ============================================================
// TOAST SYSTEM
// ============================================================
const Toast = {
    container: null,
    init() { this.container = document.createElement('div'); this.container.className = 'toast-container'; document.body.appendChild(this.container); },
    show(message, type = 'info', duration = 4000) {
        const icons = { success:'fa-check-circle', error:'fa-exclamation-circle', info:'fa-info-circle' };
        const toast = document.createElement('div'); toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fas ${icons[type]}"></i><span>${message}</span><button class="toast-close" onclick="this.parentElement.remove()">&times;</button>`;
        this.container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(30px)'; toast.style.transition = 'all 0.3s'; setTimeout(() => toast.remove(), 300); }, duration);
    },
    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error', 5000); },
    info(msg) { this.show(msg, 'info'); },
};

const API = {
    async post(endpoint, data) {
        try {
            const res = await fetch(`${CONFIG.API_URL}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Something went wrong');
            return json;
        } catch (err) {
            if (err.message === 'Failed to fetch') return { ok: false, offline: true };
            throw err;
        }
    },
};


// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    Toast.init();
    await loadSiteSettings();
    initHeader();
    initMobileMenu();
    initCounters();
    initScrollReveal();
    initSkillBars();
    initPortfolioFilter();
    loadDynamicPortfolio();
    initSmoothScroll();
    initContactForm();
    initNewsletterForm();
    initBookingSystem();
    initReviewForm();
    loadApprovedReviews();
    initLightbox();
    initCurrencyToggle();
    initBookingTracker();
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
});


// ============================================================
// HEADER
// ============================================================
function initHeader() {
    const header = document.getElementById('header');
    const scrollTop = document.getElementById('scrollTop');
    window.addEventListener('scroll', () => {
        header.classList.toggle('scrolled', window.scrollY > 50);
        if (scrollTop) scrollTop.classList.toggle('visible', window.scrollY > 500);
    });
    if (scrollTop) scrollTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function initMobileMenu() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.getElementById('navMenu');
    const backdrop = document.getElementById('navBackdrop');
    function closeMenu() {
        navMenu.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
        document.body.style.overflow = '';
    }
    function openMenu() {
        navMenu.classList.add('active');
        if (backdrop) backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    if (hamburger) hamburger.addEventListener('click', () => {
        navMenu.classList.contains('active') ? closeMenu() : openMenu();
    });
    if (backdrop) backdrop.addEventListener('click', closeMenu);
    document.querySelectorAll('.nav-links a').forEach(link => link.addEventListener('click', closeMenu));
}


// ============================================================
// ANIMATED COUNTERS — uses admin settings values
// ============================================================
function initCounters() {
    function animateCounter(id, target, duration = 2000) {
        const el = document.getElementById(id);
        if (!el) return;
        const inc = target / (duration / 16);
        let current = 0;
        const timer = setInterval(() => {
            current += inc;
            if (current >= target) { el.textContent = Math.ceil(target); clearInterval(timer); }
            else el.textContent = Math.ceil(current);
        }, 16);
    }
    const heroStats = document.querySelector('.stats');
    if (!heroStats) return;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const t = window._statTargets || { projects: 150, clients: 80, turnaround: 48 };
                animateCounter('projectCount', t.projects);
                animateCounter('clientCount', t.clients);
                animateCounter('turnaroundTime', t.turnaround);
                observer.disconnect();
            }
        });
    }, { threshold: 0.5 });
    observer.observe(heroStats);
}


// ============================================================
// SCROLL REVEAL + SKILL BARS
// ============================================================
function initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

function initSkillBars() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) e.target.querySelectorAll('.skill-progress').forEach(bar => bar.style.width = bar.dataset.width + '%');
        });
    }, { threshold: 0.3 });
    document.querySelectorAll('.skills-list').forEach(el => observer.observe(el));
}


// ============================================================
// PORTFOLIO — filter + dynamic load from API
// ============================================================
function initPortfolioFilter() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const filter = this.dataset.filter;
            document.querySelectorAll('.portfolio-item').forEach(item => {
                if (filter === 'all' || item.dataset.category === filter) {
                    item.style.display = 'block'; setTimeout(() => item.style.opacity = '1', 10);
                } else {
                    item.style.opacity = '0'; setTimeout(() => item.style.display = 'none', 400);
                }
            });
        });
    });
}

async function loadDynamicPortfolio() {
    try {
        const res = await fetch(`${CONFIG.API_URL}/portfolio`);
        if (!res.ok) return;
        const items = await res.json();
        if (!items.length) return;
        const grid = document.querySelector('.portfolio-grid');
        if (!grid) return;

        const cats = [...new Set(items.map(i => i.category))];
        const filterWrap = document.querySelector('.portfolio-filters');
        if (filterWrap) {
            // Build category names from services settings
            let catNames = { graphic:'Graphic Design', motion:'Motion Graphics', video:'Video Editing', branding:'Branding' };
            try {
                const svcs = JSON.parse(siteSettings.services || '[]');
                if (svcs.length) {
                    catNames = {};
                    svcs.forEach(s => { catNames[s.id || s.name.toLowerCase().replace(/\s+/g,'-')] = s.name; });
                }
            } catch(e) {}
            filterWrap.innerHTML = `<button class="filter-btn active" data-filter="all">All Work</button>` +
                cats.map(c => `<button class="filter-btn" data-filter="${c}">${catNames[c] || c}</button>`).join('');
            initPortfolioFilter();
        }

        grid.innerHTML = items.map(i => {
            const tags = (i.tags || []).map(t => `<span class="portfolio-tag">${t}</span>`).join('');
            const vid = (i.video_url || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const hasVideo = vid && getEmbedUrl(i.video_url);
            const safeTitle = (i.title || '').replace(/'/g, "\\'");
            return `<div class="portfolio-item" data-category="${i.category}" onclick="openLightbox('${i.image_url}','${safeTitle}','${vid}')">
                <img src="${i.image_url}" alt="${i.title}" loading="lazy">
                ${hasVideo ? '<div class="video-badge"><i class="fas fa-play"></i></div>' : ''}
                <div class="portfolio-overlay"><div class="portfolio-tags">${tags}</div><h3>${i.title}</h3></div>
            </div>`;
        }).join('');
    } catch (err) { console.log('Portfolio API not available'); }
}


// ============================================================
// SMOOTH SCROLL
// ============================================================
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
        });
    });
}


// ============================================================
// FORM VALIDATION — highlights empty fields with red border
// ============================================================
function validateField(el, message) {
    if (!el) return false;
    if (!el.value.trim()) {
        el.classList.add('field-error');
        el.addEventListener('input', () => el.classList.remove('field-error'), { once: true });
        el.addEventListener('change', () => el.classList.remove('field-error'), { once: true });
        if (message) Toast.error(message);
        el.focus();
        return false;
    }
    el.classList.remove('field-error');
    return true;
}

function validateEmail(el) {
    const v = (el.value || '').trim();
    if (!v || !v.includes('@') || !v.includes('.')) {
        el.classList.add('field-error');
        el.addEventListener('input', () => el.classList.remove('field-error'), { once: true });
        Toast.error('Please enter a valid email address.');
        el.focus();
        return false;
    }
    return true;
}

function validatePhone() {
    const phoneEl = document.getElementById('client-phone');
    const codeEl = document.getElementById('phone-code');
    if (!phoneEl) return true;
    const phone = phoneEl.value.replace(/[\s\-()]/g, '');
    if (!phone) return true; // optional

    const code = codeEl ? codeEl.value : '+233';
    if (code === '+233') {
        const clean = phone.replace(/^0/, '');
        if (!/^\d{9}$/.test(clean)) {
            phoneEl.classList.add('field-error');
            phoneEl.addEventListener('input', () => phoneEl.classList.remove('field-error'), { once: true });
            Toast.error('Ghana phone numbers must be 10 digits (e.g. 024 123 4567).');
            phoneEl.focus();
            return false;
        }
    } else {
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 6 || digits.length > 15) {
            phoneEl.classList.add('field-error');
            phoneEl.addEventListener('input', () => phoneEl.classList.remove('field-error'), { once: true });
            Toast.error('Please enter a valid phone number.');
            phoneEl.focus();
            return false;
        }
    }
    return true;
}


// ============================================================
// CONTACT FORM
// ============================================================
function initContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const origHTML = btn.innerHTML;
        const nameEl = form.querySelector('[name="name"]');
        const emailEl = form.querySelector('[name="email"]');
        const msgEl = form.querySelector('[name="message"]');
        if (!validateField(nameEl, 'Please enter your name.')) return;
        if (!validateEmail(emailEl)) return;
        if (!validateField(msgEl, 'Please enter a message.')) return;
        const data = { name: nameEl.value.trim(), email: emailEl.value.trim(), subject: form.querySelector('[name="subject"]').value.trim(), message: msgEl.value.trim() };
        btn.innerHTML = '<span class="spinner"></span>'; btn.classList.add('loading'); btn.disabled = true;
        try {
            const result = await API.post('/contact', data);
            if (result.offline) Toast.info('Message noted! Backend is offline.');
            else Toast.success('Message sent! We\'ll get back to you within 24 hours.');
            form.reset();
        } catch (err) { Toast.error(err.message || 'Failed to send.'); }
        finally { btn.innerHTML = origHTML; btn.classList.remove('loading'); btn.disabled = false; }
    });
}


// ============================================================
// NEWSLETTER
// ============================================================
function initNewsletterForm() {
    const form = document.querySelector('.newsletter-form');
    if (!form) return;
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const input = form.querySelector('.newsletter-input');
        const email = input.value.trim();
        if (!email || !email.includes('@')) {
            input.classList.add('field-error');
            input.addEventListener('input', () => input.classList.remove('field-error'), { once: true });
            Toast.error('Please enter a valid email.');
            return;
        }
        try {
            const result = await API.post('/newsletter', { email });
            if (result.offline) Toast.info('Thanks! Backend offline.');
            else Toast.success('Subscribed! You\'ll receive our updates.');
            input.value = '';
        } catch (err) { Toast.error(err.message || 'Subscription failed.'); }
    });
}


// ============================================================
// BOOKING SYSTEM
// ============================================================
function initBookingSystem() {
    let currentStep = 1;
    let basePrice = 0;
    let addonsPrice = 0;

    // Next step with validation
    document.querySelectorAll('.next-step').forEach(btn => {
        btn.addEventListener('click', function() {
            if (currentStep === 1) {
                const sel = document.getElementById('service-type');
                if (!validateField(sel, 'Please select a service.')) return;
            }
            if (currentStep === 2) {
                if (!validateField(document.getElementById('client-name'), 'Please enter your name.')) return;
                if (!validateEmail(document.getElementById('client-email'))) return;
                if (!validatePhone()) return;
            }
            goToStep(parseInt(this.dataset.next));
        });
    });

    document.querySelectorAll('.prev-step').forEach(btn => {
        btn.addEventListener('click', function() { goToStep(parseInt(this.dataset.prev)); });
    });

    function goToStep(step) {
        document.querySelectorAll('.booking-step').forEach(s => s.classList.remove('active'));
        document.getElementById('step-' + step).classList.add('active');
        document.querySelectorAll('.step').forEach(s => {
            const n = parseInt(s.dataset.step);
            s.classList.remove('active', 'completed');
            if (n === step) s.classList.add('active');
            else if (n < step) s.classList.add('completed');
        });
        currentStep = step;
        if (step === 4) {
            const sel = document.getElementById('service-type');
            document.getElementById('summary-service').textContent = sel.selectedOptions[0]?.text || '—';
            document.getElementById('summary-addons').textContent = fmtCur(addonsPrice);
            document.getElementById('summary-total').textContent = fmtCur(basePrice + addonsPrice);
        }
    }

    // Service selection
    const serviceSelect = document.getElementById('service-type');
    if (serviceSelect) {
        serviceSelect.addEventListener('change', function() {
            basePrice = parseInt(this.selectedOptions[0]?.dataset.price) || 0;
            recalcTotals();
        });
    }

    // Addon clicks (delegated for dynamic addons)
    document.querySelector('.addons-list')?.addEventListener('click', function(e) {
        const item = e.target.closest('.addon-item');
        if (!item) return;
        item.classList.toggle('selected');
        recalcTotals();
    });

    function recalcTotals() {
        addonsPrice = 0;
        document.querySelectorAll('.addon-item.selected').forEach(a => addonsPrice += parseInt(a.dataset.price) || 0);
        document.getElementById('base-price').textContent = fmtCur(basePrice);
        document.getElementById('addons-total').textContent = fmtCur(addonsPrice);
        document.getElementById('grand-total').textContent = fmtCur(basePrice + addonsPrice);
    }

    function fmtCur(amount) {
        if (currentCurrency === 'GHS') return `GH₵${Math.round(amount * ghsRate)}`;
        return `$${amount}`;
    }

    // Paystack
    const payBtn = document.getElementById('pay-btn');
    if (payBtn) payBtn.addEventListener('click', handlePayment);

    async function handlePayment() {
        if (!document.getElementById('agree-terms').checked) { Toast.error('Please agree to the Terms & Conditions.'); return; }
        const totalAmount = basePrice + addonsPrice;
        if (totalAmount <= 0) { Toast.error('Please select a service first.'); return; }

        const phoneCode = document.getElementById('phone-code')?.value || '+233';
        const phoneNum = document.getElementById('client-phone').value.trim().replace(/^0/, '');
        const fullPhone = phoneNum ? `${phoneCode} ${phoneNum}` : '';

        const bookingData = {
            email: document.getElementById('client-email').value.trim(),
            name: document.getElementById('client-name').value.trim(),
            phone: fullPhone,
            service: document.getElementById('service-type').selectedOptions[0]?.text || '',
            serviceType: document.getElementById('service-type').value,
            description: document.getElementById('project-desc').value.trim(),
            deadline: document.getElementById('client-deadline').value,
            basePrice, addonsPrice, totalAmount,
            addons: getSelectedAddons(),
        };

        const reference = 'CS-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
        if (typeof PaystackPop === 'undefined') { Toast.error('Payment system not loaded. Please refresh.'); return; }

        const handler = PaystackPop.setup({
            key: CONFIG.PAYSTACK_PUBLIC_KEY, email: bookingData.email,
            amount: totalAmount * 100, currency: CONFIG.CURRENCY, ref: reference,
            metadata: { custom_fields: [
                { display_name: 'Client Name', variable_name: 'client_name', value: bookingData.name },
                { display_name: 'Phone', variable_name: 'phone', value: fullPhone },
                { display_name: 'Service', variable_name: 'service', value: bookingData.service },
            ]},
            callback: async function(response) {
                showPaymentStatus('success', response.reference);
                try { await API.post('/bookings', { ...bookingData, reference: response.reference, status: 'paid' }); } catch (err) { console.warn('Save failed:', err); }
            },
            onClose: function() { showPaymentStatus('error'); },
        });
        handler.openIframe();
    }

    function getSelectedAddons() {
        const addons = [];
        document.querySelectorAll('.addon-item.selected').forEach(item => {
            addons.push({ name: item.querySelector('h4').textContent, price: parseInt(item.dataset.price) });
        });
        return addons;
    }

    function showPaymentStatus(type, reference = '') {
        document.getElementById('stepsIndicator').style.display = 'none';
        document.querySelectorAll('.booking-step').forEach(s => s.classList.remove('active'));
        if (type === 'success') {
            document.getElementById('payment-success').classList.add('show');
            document.getElementById('payment-ref').textContent = 'Ref: ' + reference;
            Toast.success('Payment successful! Check your email for confirmation & invoice.');
        } else {
            document.getElementById('payment-error').classList.add('show');
            Toast.error('Payment was cancelled.');
        }
    }

    window.resetBooking = function() {
        document.getElementById('payment-error').classList.remove('show');
        document.getElementById('payment-success').classList.remove('show');
        document.getElementById('stepsIndicator').style.display = 'flex';
        goToStep(1);
    };
}


// ============================================================
// REVIEW FORM
// ============================================================
function initReviewForm() {
    const form = document.getElementById('review-form');
    if (!form) return;
    const starBtns = form.querySelectorAll('.star-btn');
    const ratingInput = document.getElementById('review-rating');

    starBtns.forEach(btn => {
        btn.addEventListener('click', function() { const v = parseInt(this.dataset.value); ratingInput.value = v; starBtns.forEach(s => s.classList.toggle('active', parseInt(s.dataset.value) <= v)); });
        btn.addEventListener('mouseenter', function() { const v = parseInt(this.dataset.value); starBtns.forEach(s => s.classList.toggle('hover', parseInt(s.dataset.value) <= v)); });
        btn.addEventListener('mouseleave', () => starBtns.forEach(s => s.classList.remove('hover')));
    });

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const origHTML = btn.innerHTML;
        if (!validateField(document.getElementById('review-name'), 'Please enter your name.')) return;
        if (!validateEmail(document.getElementById('review-email'))) return;
        if (!validateField(document.getElementById('review-text'), 'Please write your review.')) return;
        const data = {
            name: document.getElementById('review-name').value.trim(),
            email: document.getElementById('review-email').value.trim(),
            company: document.getElementById('review-company').value.trim(),
            role: document.getElementById('review-role').value.trim(),
            rating: parseInt(ratingInput.value) || 5,
            text: document.getElementById('review-text').value.trim(),
            service_used: document.getElementById('review-service').value,
        };
        btn.innerHTML = '<span class="spinner"></span>'; btn.classList.add('loading'); btn.disabled = true;
        try {
            const result = await API.post('/reviews', data);
            if (result.offline) Toast.info('Review noted! Backend offline.');
            else Toast.success('Thank you! Your review will appear after approval.');
            form.reset(); ratingInput.value = 5; starBtns.forEach(s => s.classList.add('active'));
        } catch (err) { Toast.error(err.message || 'Failed to submit.'); }
        finally { btn.innerHTML = origHTML; btn.classList.remove('loading'); btn.disabled = false; }
    });
}

async function loadApprovedReviews() {
    try {
        const res = await fetch(`${CONFIG.API_URL}/reviews`);
        if (!res.ok) return;
        const reviews = await res.json();
        if (!reviews.length) return;
        const grid = document.querySelector('.testimonials-grid');
        if (!grid) return;
        grid.innerHTML = reviews.map(r => {
            const initial = r.name.charAt(0).toUpperCase();
            return `<div class="testimonial-card reveal visible">
                <div class="testimonial-stars">${Array(r.rating).fill('<i class="fas fa-star"></i>').join('')}</div>
                <div class="testimonial-text">"${r.text}"</div>
                <div class="testimonial-author-row"><div class="testimonial-avatar">${initial}</div><div><div class="testimonial-author">${r.name}</div><div class="testimonial-role">${[r.role, r.company].filter(Boolean).join(', ') || 'Client'}</div></div></div>
            </div>`;
        }).join('');
    } catch (err) {}
}


// ============================================================
// LIGHTBOX
// ============================================================
function initLightbox() {
    const overlay = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    const videoWrap = document.getElementById('lightbox-video');
    const caption = document.getElementById('lightbox-caption');
    const closeBtn = document.getElementById('lightboxClose');
    if (!overlay) return;

    closeBtn.addEventListener('click', closeLB);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLB(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLB(); });

    function closeLB() {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        if (videoWrap) { videoWrap.innerHTML = ''; videoWrap.style.display = 'none'; }
        if (img) img.style.display = '';
    }

    window.openLightbox = function(src, title, videoUrl) {
        if (videoUrl && videoUrl.trim()) {
            const embedUrl = getEmbedUrl(videoUrl);
            if (embedUrl) {
                img.style.display = 'none';
                videoWrap.style.display = 'flex';
                videoWrap.innerHTML = `<iframe src="${embedUrl}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
            } else {
                img.src = src; img.style.display = ''; videoWrap.style.display = 'none';
            }
        } else {
            img.src = src; img.style.display = ''; videoWrap.style.display = 'none'; videoWrap.innerHTML = '';
        }
        caption.textContent = title || '';
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    };
}

function getEmbedUrl(url) {
    if (!url) return null;
    let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
    if (m) return `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0`;
    m = url.match(/vimeo\.com\/(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}?autoplay=1`;
    return null;
}


// ============================================================
// CURRENCY TOGGLE — USD / GHS (ALL prices site-wide)
// ============================================================
function initCurrencyToggle() {
    const btn = document.getElementById('currencyToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
        currentCurrency = currentCurrency === 'USD' ? 'GHS' : 'USD';
        const spans = btn.querySelectorAll('span');
        spans.forEach(s => s.classList.remove('cur-active'));
        if (currentCurrency === 'USD') spans[0].classList.add('cur-active');
        else spans[1].classList.add('cur-active');
        updateAllPrices();
    });
}

function updateAllPrices() {
    const sym = currentCurrency === 'GHS' ? 'GH₵' : '$';
    const rate = currentCurrency === 'GHS' ? ghsRate : 1;

    // 1. Service cards — look for BOTH .service-price AND .price-tag
    document.querySelectorAll('.service-price, .price-tag').forEach(el => {
        let usd = parseFloat(el.dataset.usd);
        // Fallback: parse from text if data-usd is missing
        if (isNaN(usd)) {
            const match = el.textContent.match(/[\d,.]+/);
            if (match) {
                usd = parseFloat(match[0].replace(',', ''));
                // If currently showing GHS, convert back to USD first
                if (currentCurrency === 'USD' && el.textContent.includes('GH')) {
                    usd = usd / ghsRate;
                }
                el.dataset.usd = Math.round(usd); // Store for future toggles
            }
        }
        if (!isNaN(usd)) el.textContent = `From ${sym}${Math.round(usd * rate)}`;
    });

    // 2. Booking dropdown options
    document.querySelectorAll('#service-type option').forEach(opt => {
        const price = parseInt(opt.dataset.price);
        if (!price) return;
        const name = opt.textContent.split('—')[0].trim();
        opt.textContent = `${name} — ${sym}${Math.round(price * rate)}`;
    });

    // 3. Addon prices
    document.querySelectorAll('.addon-price').forEach(el => {
        let usd = parseFloat(el.dataset.usd);
        // Fallback: parse from text
        if (isNaN(usd)) {
            const match = el.textContent.match(/[\d,.]+/);
            if (match) {
                usd = parseFloat(match[0].replace(',', ''));
                if (currentCurrency === 'USD' && el.textContent.includes('GH')) usd = usd / ghsRate;
                el.dataset.usd = Math.round(usd);
            }
        }
        if (!isNaN(usd)) el.textContent = `+${sym}${Math.round(usd * rate)}`;
    });

    // 4. Recalculate totals from base USD values
    const sel = document.getElementById('service-type');
    const baseUSD = parseInt(sel?.selectedOptions[0]?.dataset.price) || 0;
    let addonsUSD = 0;
    document.querySelectorAll('.addon-item.selected').forEach(a => addonsUSD += parseInt(a.dataset.price) || 0);
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = `${sym}${Math.round(val * rate)}`; };
    setEl('base-price', baseUSD);
    setEl('addons-total', addonsUSD);
    setEl('grand-total', baseUSD + addonsUSD);
    setEl('summary-addons', addonsUSD);
    setEl('summary-total', baseUSD + addonsUSD);
}


// ============================================================
// BOOKING TRACKER
// ============================================================
function initBookingTracker() {
    const input = document.getElementById('tracker-ref');
    if (!input) return;
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') trackBooking(); });
}

async function trackBooking() {
    const ref = document.getElementById('tracker-ref').value.trim();
    const result = document.getElementById('tracker-result');
    if (!ref) { result.innerHTML = '<div class="tracker-error"><i class="fas fa-exclamation-circle"></i> Please enter your booking reference.</div>'; result.style.display = 'block'; return; }
    result.innerHTML = '<p style="color:var(--text-muted);text-align:center"><i class="fas fa-spinner fa-spin"></i> Searching...</p>';
    result.style.display = 'block';
    try {
        const res = await fetch(`${CONFIG.API_URL}/bookings/track/${encodeURIComponent(ref)}`);
        if (!res.ok) { const err = await res.json(); result.innerHTML = `<div class="tracker-error"><i class="fas fa-exclamation-circle"></i> ${err.error || 'Booking not found.'}</div>`; return; }
        const b = await res.json();
        const sc = (b.status || 'pending').replace(/\s/g, '-');
        result.innerHTML = `<div class="tracker-result-card">
            <h4><i class="fas fa-check-circle" style="color:var(--success);margin-right:.5rem"></i> Booking Found</h4>
            <div class="tracker-row"><span class="label">Reference</span><span class="value" style="font-family:'IBM Plex Mono',monospace">${b.reference}</span></div>
            <div class="tracker-row"><span class="label">Client</span><span class="value">${b.name}</span></div>
            <div class="tracker-row"><span class="label">Service</span><span class="value">${b.service || '—'}</span></div>
            <div class="tracker-row"><span class="label">Amount</span><span class="value">$${b.total_amount || 0}</span></div>
            <div class="tracker-row"><span class="label">Status</span><span class="tracker-status ${sc}">${(b.status||'pending').charAt(0).toUpperCase()+(b.status||'pending').slice(1)}</span></div>
            <div class="tracker-row"><span class="label">Booked</span><span class="value">${new Date(b.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</span></div>
        </div>`;
    } catch (err) { result.innerHTML = '<div class="tracker-error"><i class="fas fa-exclamation-circle"></i> Could not connect to server.</div>'; }
}
window.trackBooking = trackBooking;

// ---- Color Utility Functions ----
function hexToRGB(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16) };
}
function rgbToHex(r, g, b) {
    return '#' + [r,g,b].map(x => Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('');
}
function lightenColor(hex, percent) {
    const {r,g,b} = hexToRGB(hex);
    const amt = percent / 100;
    return rgbToHex(r + (255-r)*amt, g + (255-g)*amt, b + (255-b)*amt);
}
function darkenColor(hex, percent) {
    const {r,g,b} = hexToRGB(hex);
    const amt = 1 - percent/100;
    return rgbToHex(r*amt, g*amt, b*amt);
}

// ============================================================
// DARK MODE
// ============================================================
function initDarkMode() {
    const toggle = document.getElementById('darkModeToggle');
    if (!toggle) return;
    // Check saved preference
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
    }
    toggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
    });
}
initDarkMode();

// ============================================================
// FAQ — Load from API + Toggle
// ============================================================
async function loadFAQs() {
    try {
        const res = await fetch(`${CONFIG.API_URL}/faqs`);
        if (!res.ok) return;
        const faqs = await res.json();
        if (!faqs.length) return;
        const list = document.getElementById('faq-list');
        if (!list) return;
        list.innerHTML = faqs.map(f => `
            <div class="faq-item">
                <button class="faq-question" onclick="toggleFAQ(this)">
                    <span>${f.question}</span><i class="fas fa-chevron-down"></i>
                </button>
                <div class="faq-answer"><p>${f.answer}</p></div>
            </div>
        `).join('');
    } catch(e) {}
}
function toggleFAQ(btn) {
    const item = btn.closest('.faq-item');
    const wasActive = item.classList.contains('active');
    // Close all
    document.querySelectorAll('.faq-item.active').forEach(i => i.classList.remove('active'));
    // Toggle clicked
    if (!wasActive) item.classList.add('active');
}
window.toggleFAQ = toggleFAQ;
loadFAQs();

// ============================================================
// DISCOUNT / PROMO CODES
// ============================================================
let appliedDiscount = null;

async function applyDiscount() {
    const codeInput = document.getElementById('discount-code');
    const msg = document.getElementById('discount-msg');
    const code = (codeInput?.value || '').trim();
    if (!code) { msg.textContent = 'Enter a code'; msg.className = 'error'; return; }

    // First try discount code
    try {
        const totalEl = document.getElementById('grand-total');
        const currentTotal = parseFloat(totalEl?.textContent.replace(/[^0-9.]/g, '')) || 0;

        let res = await fetch(`${CONFIG.API_URL}/discount/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, amount: currentTotal })
        });

        if (res.ok) {
            const d = await res.json();
            appliedDiscount = { code: d.code, amount: d.discount, type: d.type, value: d.value };
            msg.textContent = `${d.type === 'percentage' ? d.value + '%' : '$' + d.value} discount applied!`;
            msg.className = 'success';
            updateTotals();
            return;
        }

        // Try referral code
        res = await fetch(`${CONFIG.API_URL}/referral/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });

        if (res.ok) {
            const r = await res.json();
            appliedDiscount = { code, amount: 0, type: 'percentage', value: r.discount_percent, isReferral: true };
            msg.textContent = `${r.discount_percent}% referral discount from ${r.referrer_name || 'a friend'}!`;
            msg.className = 'success';
            updateTotals();
            return;
        }

        msg.textContent = 'Invalid code';
        msg.className = 'error';
        appliedDiscount = null;
        updateTotals();
    } catch(e) {
        msg.textContent = 'Could not validate code';
        msg.className = 'error';
    }
}
window.applyDiscount = applyDiscount;

function updateTotals() {
    const basePrice = parseInt(document.getElementById('service-type')?.selectedOptions[0]?.dataset.price) || 0;
    let addonsTotal = 0;
    document.querySelectorAll('.addon-item.selected').forEach(item => {
        addonsTotal += parseInt(item.dataset.price) || 0;
    });
    let total = basePrice + addonsTotal;

    // Apply discount
    const discountRow = document.getElementById('discount-row');
    const discountAmountEl = document.getElementById('discount-amount');
    if (appliedDiscount && total > 0) {
        let disc = appliedDiscount.type === 'percentage' ? Math.round(total * appliedDiscount.value / 100) : appliedDiscount.value;
        disc = Math.min(disc, total);
        appliedDiscount.amount = disc;
        if (discountRow) discountRow.style.display = 'flex';
        if (discountAmountEl) discountAmountEl.textContent = currentCurrency === 'GHS' ? `-GH₵${Math.round(disc * ghsRate)}` : `-$${disc}`;
        total -= disc;
    } else {
        if (discountRow) discountRow.style.display = 'none';
    }

    const prefix = currentCurrency === 'GHS' ? 'GH₵' : '$';
    const rate = currentCurrency === 'GHS' ? ghsRate : 1;
    if (document.getElementById('base-price')) document.getElementById('base-price').textContent = `${prefix}${Math.round(basePrice * rate)}`;
    if (document.getElementById('addons-total')) document.getElementById('addons-total').textContent = `${prefix}${Math.round(addonsTotal * rate)}`;
    if (document.getElementById('grand-total')) document.getElementById('grand-total').textContent = `${prefix}${Math.round(total * rate)}`;
    if (document.getElementById('summary-total')) document.getElementById('summary-total').textContent = `${prefix}${Math.round(total * rate)}`;
}

// ============================================================
// ANALYTICS — Track Page Views
// ============================================================
(function trackPage() {
    try {
        fetch(`${CONFIG.API_URL}/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: location.pathname + location.hash })
        }).catch(() => {});
    } catch(e) {}
})();

// ============================================================
// WHATSAPP WIDGET
// ============================================================
function initWhatsApp() {
    const widget = document.getElementById('whatsappWidget');
    if (!widget || !siteSettings.phone) return;
    // Extract phone number digits
    const phone = (siteSettings.social_whatsapp || siteSettings.phone || '').replace(/[^0-9+]/g, '');
    if (!phone || phone === '+233000000000') return;
    const cleanPhone = phone.replace(/^\+/, '');
    widget.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent('Hi! I\'m interested in your creative services.')}`;
    widget.style.display = 'flex';
}

// ============================================================
// MULTI-LANGUAGE (i18n) — English / French / Twi
// ============================================================
const translations = {
    en: {},
    fr: {
        faq_tag: 'Questions fréquentes',
        faq_title: 'Questions Fréquemment Posées',
    },
    tw: {
        faq_tag: 'Nsɛmmisa a wɔbisa no daa',
        faq_title: 'Nsɛmmisa a Wɔbisa No Daa',
    }
};

function setLanguage(lang) {
    localStorage.setItem('lang', lang);
    const t = translations[lang] || {};
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (t[key]) el.textContent = t[key];
    });
}

function initLanguage() {
    const switcher = document.getElementById('langSwitcher');
    if (!switcher) return;
    const saved = localStorage.getItem('lang') || 'en';
    switcher.value = saved;
    if (saved !== 'en') setLanguage(saved);
    switcher.addEventListener('change', (e) => setLanguage(e.target.value));
}
initLanguage();

// Sync mobile nav duplicates with desktop controls
(function syncMobileNav() {
    // Currency toggle (mobile)
    const mobCur = document.getElementById('currencyToggleMob');
    if (mobCur) {
        mobCur.addEventListener('click', () => {
            const btn = document.getElementById('currencyToggle');
            if (btn) btn.click();
            // Mirror active state
            const spans = mobCur.querySelectorAll('span');
            spans.forEach(s => s.classList.remove('cur-active'));
            if (currentCurrency === 'USD') spans[0].classList.add('cur-active');
            else spans[1].classList.add('cur-active');
        });
    }
    // Language switcher (mobile)
    const mobLang = document.getElementById('langSwitcherMob');
    if (mobLang) {
        const saved = localStorage.getItem('lang') || 'en';
        mobLang.value = saved;
        mobLang.addEventListener('change', (e) => {
            setLanguage(e.target.value);
            const desk = document.getElementById('langSwitcher');
            if (desk) desk.value = e.target.value;
        });
    }
    // Also sync desktop lang -> mobile
    const deskLang = document.getElementById('langSwitcher');
    if (deskLang && mobLang) {
        deskLang.addEventListener('change', () => { mobLang.value = deskLang.value; });
    }
})();

// Call WhatsApp init after settings load
const origLoadSettings = loadSiteSettings;
loadSiteSettings = async function() {
    await origLoadSettings();
    initWhatsApp();
};

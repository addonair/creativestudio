// CreativeStudio Service Worker — PWA + Offline Support
const CACHE_NAME = 'creativestudio-v3';
const STATIC_ASSETS = [
    '/',
    '/css/styles.css',
    '/js/main.js',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install — cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch — network first, cache fallback for navigation; cache first for static assets
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip API requests and admin panel
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

    // For navigation requests (HTML pages), try network first
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                return response;
            }).catch(() => caches.match(request) || caches.match('/'))
        );
        return;
    }

    // For static assets, try cache first then network
    if (STATIC_ASSETS.some(a => url.pathname === a || request.url === a)) {
        event.respondWith(
            caches.match(request).then(cached => {
                const networkFetch = fetch(request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    return response;
                });
                return cached || networkFetch;
            })
        );
        return;
    }

    // For images — cache on first load
    if (request.destination === 'image') {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;
                return fetch(request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    return response;
                });
            })
        );
    }
});

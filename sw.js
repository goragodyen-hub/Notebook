/**
 * Service Worker for Kiosk Dashboard PWA
 * Strategy: Network-first for data, Cache-first for static assets
 */

const CACHE_NAME = 'kiosk-dashboard-v1';
const STATIC_CACHE = 'kiosk-static-v1';

// Static assets to pre-cache on install
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './logo.png',
    './manifest.json',
    // External CDN resources
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install: Pre-cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker...');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Pre-caching static assets');
                return cache.addAll(PRECACHE_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch((err) => {
                console.warn('[SW] Pre-cache failed for some assets:', err);
                // Don't block install if some CDN resources fail
                return self.skipWaiting();
            })
    );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE)
                    .map((name) => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Network-first for API/data, Cache-first for static
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Google Sheets / Apps Script = Network only (real-time data)
    if (url.hostname.includes('docs.google.com') || 
        url.hostname.includes('script.google.com') ||
        url.hostname.includes('sheets.googleapis.com')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                // Return a simple offline response for data requests
                return new Response(JSON.stringify({ offline: true }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // Google Fonts CSS & woff2 files - Cache first, network fallback
    if (url.hostname.includes('fonts.googleapis.com') || 
        url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return fetch(event.request).then((response) => {
                    const cloned = response.clone();
                    caches.open(STATIC_CACHE).then((cache) => {
                        cache.put(event.request, cloned);
                    });
                    return response;
                });
            })
        );
        return;
    }

    // CDN resources (Font Awesome, PapaParse) - Cache first
    if (url.hostname.includes('cdnjs.cloudflare.com')) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return fetch(event.request).then((response) => {
                    const cloned = response.clone();
                    caches.open(STATIC_CACHE).then((cache) => {
                        cache.put(event.request, cloned);
                    });
                    return response;
                });
            })
        );
        return;
    }

    // Local static assets - Stale while revalidate
    event.respondWith(
        caches.match(event.request).then((cached) => {
            const fetchPromise = fetch(event.request).then((response) => {
                // Update cache in background
                const cloned = response.clone();
                caches.open(STATIC_CACHE).then((cache) => {
                    cache.put(event.request, cloned);
                });
                return response;
            }).catch(() => {
                // If offline and not in cache, return offline page
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });

            return cached || fetchPromise;
        })
    );
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

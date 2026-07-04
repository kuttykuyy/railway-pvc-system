// Service Worker for IR-PVC PWA
// Bump CACHE_VERSION on every release to force clients to drop old cached assets
// and pull the new build (stale cache was serving old app code after deploys).
const CACHE_VERSION = '1.1.7';
const CACHE_NAME = `railway-pvc-${CACHE_VERSION}`;

const urlsToCache = [
  '/',
  '/offline',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Install event - cache offline essentials and activate immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v' + CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching offline essentials');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Listen for skip waiting message from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }
});

// Fetch event - Network-First for HTML, Cache-First for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-http(s) requests (chrome-extension, data URIs, etc.)
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Only GET requests are cacheable — Cache.put() throws on POST/PUT/DELETE
  // (server actions, form submissions), so let the browser handle them natively.
  if (request.method !== 'GET') {
    return;
  }

  // Only manage same-origin requests. Cross-origin resources (YouTube video
  // thumbnails, Google fonts/ads/analytics, etc.) must go straight to the
  // network: re-fetching them here is subject to the page CSP connect-src and
  // fails for hosts not on that allow-list, after which the image handler below
  // would serve an empty 204 and the picture would appear broken. Letting the
  // browser load them natively uses img-src ('https:'), which is allowed.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-Only for API calls and dynamic content
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Cache-First for static Next.js assets (hashed filenames)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        });
      })
    );
    return;
  }

  // Cache-First for PWA icons and images
  if (request.destination === 'image' || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        }).catch(() => {
          // Fallback to a simple offline response for images
          return new Response('', { status: 204 });
        });
      })
    );
    return;
  }

  // Network-First for HTML pages
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match('/offline') || new Response('You are offline', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
        })
    );
    return;
  }

  // Default: try network, fall back to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone);
        });
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Activate event - clean up old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v' + CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Claiming clients...');
      return self.clients.claim();
    })
  );
});

// Push event for notifications
self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data ? event.data.json() : { title: 'IR-PVC', body: 'New notification' };
  } catch {
    payload = { title: 'IR-PVC', body: event.data ? event.data.text() : 'New notification' };
  }

  const title = payload.title || 'IR-PVC';
  const options = {
    body: payload.body || 'New notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: payload.data || { url: '/' },
    actions: [
      {
        action: 'open',
        title: 'Open App'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open' || event.action === 'explore') {
    const urlToOpen = event.notification.data?.url || '/';
    event.waitUntil(clients.openWindow(urlToOpen));
  }
});

// Background sync placeholder
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

function doBackgroundSync() {
  return new Promise((resolve) => {
    console.log('[SW] Background sync completed');
    resolve();
  });
}

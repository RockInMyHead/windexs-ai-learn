/**
 * Service Worker for Offline Mode & Advanced Caching
 * Progressive Web App functionality with intelligent caching strategies
 */

const CACHE_NAME = 'teacher-app-v3.0.0';
const CACHE_EXPIRY_DAYS = 7;

// Cache configurations for different resource types
const CACHE_STRATEGIES = {
  // Static assets - Cache First (with fallback to network)
  static: {
    cacheName: `${CACHE_NAME}-static`,
    patterns: [
      /\.(?:png|jpg|jpeg|gif|svg|ico|webp)$/,
      /\.(?:css|js)$/,
      /\.(?:woff|woff2|ttf|eot)$/,
      /\/static\//
    ],
    strategy: 'cache-first'
  },

  // API responses - Network First (with cache fallback)
  api: {
    cacheName: `${CACHE_NAME}-api`,
    patterns: [
      /\/api\//,
      /https:\/\/teacher\.windexs\.ru\/api\//
    ],
    strategy: 'network-first',
    maxAge: 5 * 60 * 1000 // 5 minutes
  },

  // Pages - Network First (with offline fallback)
  pages: {
    cacheName: `${CACHE_NAME}-pages`,
    patterns: [
      /^\/$/,
      /^\/[^/?]+\.?[^/?]*$/, // Simple routes like /chat, /profile
      /\/voice-chat/,
      /\/course-chat/,
      /\/homework/
    ],
    strategy: 'network-first'
  },

  // Audio/Video content - Cache First (with background sync)
  media: {
    cacheName: `${CACHE_NAME}-media`,
    patterns: [
      /\.(?:mp3|wav|ogg|m4a)$/,
      /\.(?:mp4|webm|avi)$/,
      /\/audio\//,
      /\/video\//
    ],
    strategy: 'cache-first',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

// Offline fallback page
const OFFLINE_FALLBACK = '/offline.html';

// Background sync tags
const SYNC_TAGS = {
  AUDIO_UPLOAD: 'audio-upload-sync',
  CHAT_MESSAGE: 'chat-message-sync',
  PROGRESS_UPDATE: 'progress-update-sync'
};

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  console.log('📦 Service Worker installing...');

  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(CACHE_STRATEGIES.static.cacheName).then(cache => {
        return cache.addAll([
          '/',
          '/offline.html',
          '/manifest.json',
          '/favicon.ico',
          // Add critical assets here
        ]).catch(error => {
          console.warn('Failed to cache some static assets:', error);
        });
      }),

      // Skip waiting to activate immediately
      self.skipWaiting()
    ])
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker activating...');

  event.waitUntil(
    Promise.all([
      // Clean up old caches
      cleanupOldCaches(),

      // Take control of all clients
      self.clients.claim(),

      // Initialize background sync
      initializeBackgroundSync()
    ])
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip browser extensions and external requests (except API)
  if (url.protocol === 'chrome-extension:' ||
      (url.origin !== self.location.origin && !url.origin.includes('teacher.windexs.ru'))) {
    return;
  }

  // Determine cache strategy
  const strategy = getCacheStrategy(request);

  // Apply caching strategy
  switch (strategy.strategy) {
    case 'cache-first':
      event.respondWith(cacheFirstStrategy(request, strategy));
      break;

    case 'network-first':
      event.respondWith(networkFirstStrategy(request, strategy));
      break;

    case 'stale-while-revalidate':
      event.respondWith(staleWhileRevalidateStrategy(request, strategy));
      break;

    default:
      // Default network request
      break;
  }
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('🔄 Background sync triggered:', event.tag);

  switch (event.tag) {
    case SYNC_TAGS.AUDIO_UPLOAD:
      event.waitUntil(syncAudioUploads());
      break;

    case SYNC_TAGS.CHAT_MESSAGE:
      event.waitUntil(syncChatMessages());
      break;

    case SYNC_TAGS.PROGRESS_UPDATE:
      event.waitUntil(syncProgressUpdates());
      break;

    default:
      console.warn('Unknown sync tag:', event.tag);
  }
});

// Push notifications (future feature)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  console.log('📨 Push notification received:', data);

  const options = {
    body: data.body,
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    data: data.url,
    actions: [
      { action: 'open', title: 'Открыть' },
      { action: 'dismiss', title: 'Закрыть' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      self.clients.openWindow(event.notification.data || '/')
    );
  }
});

// Message handler for communication with main thread
self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CACHE_RESOURCE':
      cacheResource(data.url, data.cacheName);
      break;

    case 'CLEAR_CACHE':
      clearCache(data.cacheName);
      break;

    case 'GET_CACHE_INFO':
      getCacheInfo().then(info => {
        event.ports[0].postMessage({ type: 'CACHE_INFO', data: info });
      });
      break;

    default:
      console.warn('Unknown message type:', type);
  }
});

// Cache strategies implementation

async function cacheFirstStrategy(request, strategy) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Check if cache entry is still valid
      if (!isExpired(cachedResponse, strategy.maxAge)) {
        return cachedResponse;
      }
    }

    // Fetch and cache
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(strategy.cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.warn('Cache-first strategy failed:', error);
    return caches.match(OFFLINE_FALLBACK);
  }
}

async function networkFirstStrategy(request, strategy) {
  try {
    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(strategy.cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.warn('Network-first strategy failed:', error);

    // Try cache fallback
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_FALLBACK);
    }

    throw error;
  }
}

async function staleWhileRevalidateStrategy(request, strategy) {
  const cache = await caches.open(strategy.cacheName);
  const cachedResponse = await caches.match(request);

  // Return cached version immediately if available
  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(error => {
    console.warn('Background fetch failed:', error);
    return null;
  });

  return cachedResponse || fetchPromise;
}

// Helper functions

function getCacheStrategy(request) {
  const url = request.url;

  for (const [key, strategy] of Object.entries(CACHE_STRATEGIES)) {
    for (const pattern of strategy.patterns) {
      if (pattern.test(url)) {
        return strategy;
      }
    }
  }

  // Default strategy
  return {
    cacheName: `${CACHE_NAME}-default`,
    strategy: 'network-first'
  };
}

function isExpired(response, maxAge) {
  if (!maxAge) return false;

  const cacheTime = new Date(response.headers.get('sw-cache-time') || 0).getTime();
  const now = Date.now();

  return (now - cacheTime) > maxAge;
}

async function cleanupOldCaches() {
  const cacheNames = await caches.keys();
  const validCacheNames = Object.values(CACHE_STRATEGIES).map(s => s.cacheName);

  await Promise.all(
    cacheNames
      .filter(name => !validCacheNames.includes(name) && name.startsWith('teacher-app-'))
      .map(name => caches.delete(name))
  );

  // Clean expired entries
  for (const strategy of Object.values(CACHE_STRATEGIES)) {
    const cache = await caches.open(strategy.cacheName);
    const keys = await cache.keys();

    await Promise.all(
      keys.map(async (request) => {
        const response = await cache.match(request);
        if (response && isExpired(response, strategy.maxAge)) {
          await cache.delete(request);
        }
      })
    );
  }

  console.log('🧹 Old caches cleaned up');
}

async function initializeBackgroundSync() {
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    console.log('🔄 Background sync supported');
  }
}

async function syncAudioUploads() {
  console.log('🔄 Syncing audio uploads...');
  // Implementation for syncing offline audio uploads
}

async function syncChatMessages() {
  console.log('🔄 Syncing chat messages...');
  // Implementation for syncing offline chat messages
}

async function syncProgressUpdates() {
  console.log('🔄 Syncing progress updates...');
  // Implementation for syncing offline progress updates
}

async function cacheResource(url, cacheName = CACHE_STRATEGIES.static.cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const response = await fetch(url);
    if (response.ok) {
      await cache.put(url, response);
      console.log('📦 Resource cached:', url);
    }
  } catch (error) {
    console.warn('Failed to cache resource:', url, error);
  }
}

async function clearCache(cacheName) {
  if (cacheName) {
    await caches.delete(cacheName);
    console.log('🗑️ Cache cleared:', cacheName);
  } else {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log('🗑️ All caches cleared');
  }
}

async function getCacheInfo() {
  const cacheNames = await caches.keys();
  const cacheInfo = {};

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    cacheInfo[cacheName] = {
      entries: keys.length,
      urls: keys.map(request => request.url)
    };
  }

  return cacheInfo;
}

// Periodic cache cleanup
setInterval(cleanupOldCaches, 24 * 60 * 60 * 1000); // Daily cleanup

console.log('🎯 Service Worker loaded and ready');

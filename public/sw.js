// Minimal service worker (audit: "Mobile App / PWA — No manifest, no
// service worker"). Scope is deliberately small: cache-first for static
// assets Next.js fingerprints (JS/CSS chunks, fonts, icons), and
// network-first for everything else (HTML pages, API routes) so users
// always see live CRM data when online, with a basic offline fallback
// only for previously-visited pages when they aren't.

const CACHE_NAME = 'kawman-exact-shell-v1'
const PRECACHE_URLS = ['/dashboard', '/manifest.json', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {
      // Precaching is best-effort — a failed fetch here (e.g. first
      // install while offline) shouldn't block the service worker from
      // activating.
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const isStaticAsset = url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/_next/image')

  if (isStaticAsset) {
    // Cache-first: these URLs are content-hashed by Next.js, so a cached
    // copy is never stale.
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((res) => {
        const clone = res.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        return res
      }))
    )
    return
  }

  // Network-first for pages/API calls: try the network so data is always
  // current, fall back to a cached copy only when the network fails
  // (i.e. actually offline).
  event.respondWith(
    fetch(request)
      .then((res) => {
        const clone = res.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        return res
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match('/dashboard')))
  )
})

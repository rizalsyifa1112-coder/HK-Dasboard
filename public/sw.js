// Service worker minimal untuk HK Manager.
// Hanya untuk syarat "installable PWA". Tidak ada caching.
// POST, /api/, dan domain lain (Supabase) langsung ke jaringan.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.origin !== self.location.origin
  ) {
    return; // biarkan browser menangani langsung
  }

  event.respondWith(fetch(event.request));
});

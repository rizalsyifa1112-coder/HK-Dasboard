// Service worker minimal untuk HK Manager.
// Tujuannya HANYA memenuhi syarat teknis "installable PWA" di Chrome/Android
// (Chrome mewajibkan ada service worker dengan fetch handler terdaftar
// sebelum mau menawarkan opsi "Instal aplikasi").
//
// SENGAJA tidak melakukan caching apa pun — semua request tetap langsung
// ke jaringan seperti biasa. Ini penting karena aplikasi ini banyak
// bergantung pada data real-time (Supabase), jadi kita tidak mau ada
// data lama/basi ke-cache dan bikin bingung staff/supervisor.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network passthrough — tidak ada caching, tidak ada mode offline.
  event.respondWith(fetch(event.request));
});

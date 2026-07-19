'use client';

import { useEffect } from 'react';

// ⬅️ BARU: daftarkan service worker (public/sw.js) saat aplikasi dibuka di
// browser. Ini yang membuat Chrome/Android mau menawarkan opsi
// "Instal aplikasi" / "Tambahkan ke Layar Utama" sebagai PWA sungguhan —
// tanpa ini, Chrome cuma anggap situs biasa meski manifest sudah lengkap.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('Service worker registration failed:', err);
      });
    }
  }, []);

  return null;
}

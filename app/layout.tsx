import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/lib/theme-provider';
import { AuthProvider } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';
import { ServiceWorkerRegister } from '@/components/service-worker-register';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Hotel Housekeeping Management System',
  description: 'Comprehensive hotel housekeeping operations management platform',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
};

// ⬅️ BARU: viewport terpisah dari metadata (aturan Next.js versi baru),
// mengatur warna tema browser (address bar di HP) + PWA jadi tidak bisa di-zoom sembarangan
export const viewport = {
  themeColor: '#c9a35a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ServiceWorkerRegister />
        <ThemeProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

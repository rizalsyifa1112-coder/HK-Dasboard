'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-provider';
import { supabase } from '@/lib/supabase';
import { canAccess, type ModuleKey } from '@/lib/permissions';
import { ROLE_LABELS, ROLE_COLORS, type Notification } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard, BedDouble, ClipboardList, CheckSquare, Shirt,
  Layers, PackageOpen, HandCoins, FileBarChart, History,
  DoorOpen, Building2, KeySquare, Grid3x3, Sparkles, Users,
  Moon, Sun, LogOut, Menu, Bell, Hotel, ScanText, Table2,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

interface NavItem {
  key: ModuleKey;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'Overview' },
  { key: 'room-status', label: 'Room Status', href: '/room-status', icon: BedDouble, group: 'Operations' },
  { key: 'assignments', label: 'Assignments', href: '/assignments', icon: ClipboardList, group: 'Operations' },
  { key: 'inspection', label: 'Inspection', href: '/inspection', icon: CheckSquare, group: 'Operations' },
  { key: 'laundry', label: 'Guest Laundry', href: '/laundry', icon: Shirt, group: 'Operations' },
  { key: 'laundry-guest', label: 'Laundry Guest', href: '/laundry-guest', icon: Shirt, group: 'Operations' },
  { key: 'general-laundry', label: 'Linen Laundry', href: '/general-laundry', icon: Shirt, group: 'Operations' },
  { key: 'linen-tracking', label: 'BT/BM Tracking', href: '/linen-tracking', icon: Layers, group: 'Operations' },
  { key: 'linen-general', label: 'Linen General', href: '/linen-general', icon: Layers, group: 'Operations' },
  { key: 'store-request', label: 'Store Request', href: '/store-request', icon: PackageOpen, group: 'Operations' },
  { key: 'loan-management', label: 'Loan Management', href: '/loan-management', icon: HandCoins, group: 'Operations' },
  { key: 'ai-vision', label: 'AI Vision OCR', href: '/ai-vision', icon: ScanText, group: 'Operations' },
  { key: 'reports', label: 'Reports', href: '/reports', icon: FileBarChart, group: 'Analytics' },
  { key: 'activity-logs', label: 'Activity Logs', href: '/activity-logs', icon: History, group: 'Analytics' },
  { key: 'rooms', label: 'Rooms', href: '/master-data/rooms', icon: DoorOpen, group: 'Master Data' },
  { key: 'floors', label: 'Floors', href: '/master-data/floors', icon: Building2, group: 'Master Data' },
  { key: 'room-types', label: 'Room Types', href: '/master-data/room-types', icon: KeySquare, group: 'Master Data' },
  { key: 'sections', label: 'Sections', href: '/master-data/sections', icon: Grid3x3, group: 'Master Data' },
  { key: 'amenities', label: 'Amenities', href: '/master-data/amenities', icon: Sparkles, group: 'Master Data' },
  { key: 'spreadsheet-templates', label: 'Spreadsheet Templates', href: '/spreadsheet-templates', icon: Table2, group: 'System' },
  { key: 'users', label: 'User Management', href: '/users', icon: Users, group: 'System' },
];

const GROUP_ORDER = ['Overview', 'Operations', 'Analytics', 'Master Data', 'System'];

// ⬅️ BARU: bunyi notifikasi pakai Web Audio API, tidak perlu file audio eksternal
function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.error('Notification sound failed:', e);
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // ⬅️ BARU: state notifikasi
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const isAuthPage = pathname === '/login' || pathname === '/signup';

  useEffect(() => {
    if (!loading && !user && !isAuthPage) {
      router.push('/login');
      return;
    }
    if (!loading && user && isAuthPage) {
      const roleForRedirect = profile?.role ?? 'housekeeping';
      const firstItem = NAV_ITEMS.find((i) => canAccess(roleForRedirect, i.key));
      router.push(firstItem?.href ?? '/dashboard');
      return;
    }
    if (!loading && user && !isAuthPage) {
      const roleForRedirect = profile?.role ?? 'housekeeping';
      const matchedItem = NAV_ITEMS.find(
        (i) => pathname === i.href || pathname.startsWith(i.href + '/')
      );
      if (matchedItem && !canAccess(roleForRedirect, matchedItem.key)) {
        const firstItem = NAV_ITEMS.find((i) => canAccess(roleForRedirect, i.key));
        router.push(firstItem?.href ?? '/login');
      }
    }
  }, [user, loading, isAuthPage, router, profile, pathname]);

  // ⬅️ BARU: ambil notifikasi awal
  const fetchNotifications = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20);
    const list = (data as Notification[]) || [];
    setNotifications(list);
    setUnreadCount(list.filter((n) => !n.read).length);
  }, [profile?.id]);

  // ⬅️ BARU: subscribe realtime — notifikasi baru langsung bunyi + toast + update badge
  useEffect(() => {
    if (!profile?.id) return;
    fetchNotifications();

    const channel = supabase
      .channel(`notifications-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev].slice(0, 20));
          setUnreadCount((prev) => prev + 1);
          playNotificationSound();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, fetchNotifications]);

  // ⬅️ BARU: tandai satu notifikasi terbaca + navigasi ke link-nya
  const handleNotificationClick = async (n: Notification) => {
    if (!n.read) {
      await supabase.from('notifications').update({ read: true }).eq('id', n.id);
      setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    if (n.link) router.push(n.link);
  };

  // ⬅️ BARU: tandai semua terbaca
  const handleMarkAllRead = async () => {
    if (!profile?.id) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id).eq('read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  if (isAuthPage) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Hotel className="h-10 w-10 animate-pulse text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const role = profile?.role ?? 'housekeeping';
  const visibleItems = NAV_ITEMS.filter((item) => canAccess(role, item.key));
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: visibleItems.filter((i) => i.group === group),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 border-r border-sidebar-foreground/10',
          sidebarOpen ? 'w-64' : 'w-16'
        )}
      >
        <div className="flex items-center gap-2 px-4 h-16 border-b border-sidebar-foreground/10">
          <Hotel className="h-7 w-7 text-primary shrink-0" />
          {sidebarOpen && (
            <span className="font-semibold text-sm whitespace-nowrap">HK Manager</span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto scrollbar-thin py-3">
          {grouped.map(({ group, items }) => (
            <div key={group} className="mb-4">
              {sidebarOpen && (
                <p className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  {group}
                </p>
              )}
              {items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2 text-sm transition-colors relative group',
                      isActive
                        ? 'text-primary bg-primary/10'
                        : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-foreground/5'
                    )}
                    title={!sidebarOpen ? item.label : undefined}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full" />
                    )}
                    <Icon className="h-4 w-4 shrink-0" />
                    {sidebarOpen && <span className="whitespace-nowrap">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex items-center justify-center h-10 border-t border-sidebar-foreground/10 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-foreground/5 transition-colors"
        >
          {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-sidebar text-sidebar-foreground flex flex-col animate-fade-in">
            <div className="flex items-center gap-2 px-4 h-16 border-b border-sidebar-foreground/10">
              <Hotel className="h-7 w-7 text-primary" />
              <span className="font-semibold text-sm">HK Manager</span>
            </div>
            <nav className="flex-1 overflow-y-auto scrollbar-thin py-3">
              {grouped.map(({ group, items }) => (
                <div key={group} className="mb-4">
                  <p className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                    {group}
                  </p>
                  {items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2 text-sm transition-colors relative',
                          isActive
                            ? 'text-primary bg-primary/10'
                            : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-foreground/5'
                        )}
                      >
                        {isActive && <span className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full" />}
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="whitespace-nowrap">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-between h-16 px-4 md:px-6 border-b bg-card/50 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-base md:text-lg font-semibold capitalize">
              {NAV_ITEMS.find((i) => pathname.startsWith(i.href))?.label ?? 'Dashboard'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-9 w-9">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {/* ⬅️ BARU: Bell jadi dropdown notifikasi asli */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-9 w-9">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 h-4 min-w-4 px-0.5 rounded-full bg-red-500 text-[10px] leading-4 text-white flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                  <span>Notifikasi</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs text-primary hover:underline font-normal"
                    >
                      Tandai semua dibaca
                    </button>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 && (
                    <p className="px-3 py-6 text-xs text-muted-foreground text-center">
                      Belum ada notifikasi
                    </p>
                  )}
                  {notifications.map((n) => (
                    <DropdownMenuItem
                      key={n.id}
                      className={cn(
                        'flex flex-col items-start gap-0.5 whitespace-normal cursor-pointer py-2',
                        !n.read && 'bg-primary/5'
                      )}
                      onClick={() => handleNotificationClick(n)}
                    >
                      <span className="text-xs font-medium">{n.title}</span>
                      {n.message && (
                        <span className="text-[11px] text-muted-foreground">{n.message}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground/70">
                        {new Date(n.created_at).toLocaleString('id-ID', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 h-9 px-2">
                  <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-semibold">
                    {profile?.full_name?.charAt(0).toUpperCase() ?? 'U'}
                  </div>
                  <div className="hidden md:flex flex-col items-start leading-tight">
                    <span className="text-xs font-medium">{profile?.full_name ?? 'User'}</span>
                    <Badge
                      variant="outline"
                      className={cn('h-4 px-1.5 text-[10px] leading-none', ROLE_COLORS[role])}
                    >
                      {ROLE_LABELS[role]}
                    </Badge>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{profile?.full_name}</p>
                    <p className="text-xs text-muted-foreground">{profile?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={toggleTheme}>
                  {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                  Toggle Theme
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut().then(() => router.push('/login'))} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

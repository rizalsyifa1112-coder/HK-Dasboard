'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-provider';
import { canAccess, type ModuleKey } from '@/lib/permissions';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/types';
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAuthPage = pathname === '/login' || pathname === '/signup';

  useEffect(() => {
    if (!loading && !user && !isAuthPage) {
      router.push('/login');
      return;
    }
    if (!loading && user && isAuthPage) {
      // ⬅️ BARU: arahkan ke modul pertama yang boleh diakses role ini, bukan selalu /dashboard
      const roleForRedirect = profile?.role ?? 'housekeeping';
      const firstItem = NAV_ITEMS.find((i) => canAccess(roleForRedirect, i.key));
      router.push(firstItem?.href ?? '/dashboard');
      return;
    }
    // ⬅️ BARU: kalau sudah login tapi buka URL halaman yang tidak diizinkan untuk role-nya, tendang ke halaman yang boleh
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

            <Button variant="ghost" size="icon" className="relative h-9 w-9">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
            </Button>

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

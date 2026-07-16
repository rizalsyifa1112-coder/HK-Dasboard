'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  Search, RefreshCw, FileSpreadsheet, History, Loader2, ChevronDown,
  User, Activity as ActivityIcon, CalendarClock,
} from 'lucide-react';
import type { ActivityLog } from '@/lib/types';

const PAGE_SIZE = 50;

// Relative time formatter (e.g. "2 hours ago")
function timeAgo(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk} week${wk === 1 ? '' : 's'} ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'} ago`;
  const yr = Math.floor(day / 365);
  return `${yr} year${yr === 1 ? '' : 's'} ago`;
}

function formatDetails(details: Record<string, unknown> | null | undefined): string {
  if (!details) return '-';
  try {
    const entries = Object.entries(details);
    if (entries.length === 0) return '-';
    return entries
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(', ');
  } catch {
    return '-';
  }
}

export default function ActivityLogsPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [hasMore, setHasMore] = useState(true);

  const buildQuery = useCallback((offset: number) => {
    let query = supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    return query;
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await buildQuery(0);
      if (error) throw error;
      const rows = (data as ActivityLog[]) || [];
      setLogs(rows);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      console.error('Error fetching activity logs:', err);
      toast({
        title: 'Error',
        description: 'Failed to load activity logs',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [buildQuery, toast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { data, error } = await buildQuery(logs.length);
      if (error) throw error;
      const rows = (data as ActivityLog[]) || [];
      setLogs((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      console.error('Error loading more logs:', err);
      toast({
        title: 'Error',
        description: 'Failed to load more logs',
        variant: 'destructive',
      });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSync = () => {
    toast({
      title: 'Sync queued',
      description: 'Activity logs will be synced to the spreadsheet (demo).',
    });
  };

  // Client-side filtering (search + date) on the loaded page of logs
  const filtered = logs.filter((l) => {
    const q = search.toLowerCase().trim();
    const matchSearch =
      !q ||
      (l.action?.toLowerCase().includes(q) ?? false) ||
      (l.user_name?.toLowerCase().includes(q) ?? false) ||
      (l.entity_type?.toLowerCase().includes(q) ?? false);
    if (!matchSearch) return false;

    if (dateFilter === 'all') return true;
    const created = new Date(l.created_at).getTime();
    const now = Date.now();
    if (dateFilter === 'today') return now - created < 24 * 60 * 60 * 1000;
    if (dateFilter === 'week') return now - created < 7 * 24 * 60 * 60 * 1000;
    if (dateFilter === 'month') return now - created < 30 * 24 * 60 * 60 * 1000;
    return true;
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Activity Logs"
        description="Audit trail of all system actions"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
              <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleSync}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Sync Spreadsheet
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by action, user, or entity…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[160px]">
            <CalendarClock className="mr-2 h-4 w-4" />
            <SelectValue placeholder="All time" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="today">Last 24 hours</SelectItem>
            <SelectItem value="week">Last 7 days</SelectItem>
            <SelectItem value="month">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <History className="h-10 w-10 mb-2 opacity-40" />
            <p className="text-sm">No activity logs found</p>
            <p className="text-xs mt-1">Try adjusting your search or date filter</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">User</TableHead>
                <TableHead className="w-[180px]">Action</TableHead>
                <TableHead className="w-[140px]">Entity</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="w-[180px] text-right">Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
                        {log.user_name ? log.user_name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {log.user_name ?? 'System'}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-mono">
                      <ActivityIcon className="mr-1 h-3 w-3" />
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {log.entity_type ? (
                      <span className="text-xs text-muted-foreground capitalize">
                        {log.entity_type.replace(/_/g, ' ')}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <p className="text-xs text-muted-foreground max-w-md truncate">
                      {formatDetails(log.details)}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-medium" title={new Date(log.created_at).toLocaleString()}>
                        {timeAgo(log.created_at)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(log.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Load more */}
      {!loading && filtered.length > 0 && (
        <div className="flex justify-center">
          {hasMore ? (
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
                </>
              ) : (
                <>
                  <ChevronDown className="mr-2 h-4 w-4" /> Load More
                </>
              )}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">No more logs to load</p>
          )}
        </div>
      )}

      {/* Summary footer */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {filtered.length} of {logs.length} loaded log{logs.length === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}

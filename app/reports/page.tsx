'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import {
  RefreshCw, Download, FileSpreadsheet, FileText, BedDouble,
  CheckCircle2, ClipboardCheck, Shirt, Layers, TrendingUp,
  Sparkles, CalendarRange, Timer,
} from 'lucide-react';
import {
  HOUSEKEEPING_STATUS_LABELS,
  type Room, type Assignment, type Inspection, type LaundryOrder, type LinenInventory, type Profile,
} from '@/lib/types';

type RangeKey = 'today' | 'week' | 'month';

const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
};

const PIE_COLORS = ['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#64748b', '#71717a'];

// ⬅️ BARU: ambang batas warna batang performance (dalam menit rata-rata per kamar).
// Di bawah 30 menit = cepat (hijau), 30-45 = sedang (amber), di atas 45 = lambat (merah).
const PERF_FAST_THRESHOLD = 30;
const PERF_SLOW_THRESHOLD = 45;

interface ReportStats {
  totalRooms: number;
  occupiedCount: number;
  occupancyRate: number;
  cleaningCompletionRate: number;
  inspectionPassRate: number;
  laundryTurnaroundHours: number;
  linenParCompliance: number;
}

type AssignmentWithStaff = Assignment & { staff?: Profile | null };

export default function ReportsPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [range, setRange] = useState<RangeKey>('week');
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithStaff[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [laundry, setLaundry] = useState<LaundryOrder[]>([]);
  const [linen, setLinen] = useState<LinenInventory[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [roomsRes, assignmentsRes, inspectionsRes, laundryRes, linenRes] = await Promise.all([
        supabase.from('rooms').select('*'),
        // ⬅️ BARU: join ke staff (profiles) supaya nama staff tersedia untuk chart performance
        supabase
          .from('assignments')
          .select('*, staff:profiles(*)')
          .order('created_at', { ascending: false }),
        supabase.from('inspections').select('*').order('created_at', { ascending: false }),
        supabase.from('laundry_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('linen_inventory').select('*'),
      ]);

      setRooms((roomsRes.data as Room[]) || []);
      setAssignments((assignmentsRes.data as AssignmentWithStaff[]) || []);
      setInspections((inspectionsRes.data as Inspection[]) || []);
      setLaundry((laundryRes.data as LaundryOrder[]) || []);
      setLinen((linenRes.data as LinenInventory[]) || []);
    } catch (err) {
      console.error('Reports fetch error:', err);
      toast({
        title: 'Error',
        description: 'Failed to load report data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter records by selected range
  const rangeStart = useMemo(() => {
    const now = new Date();
    if (range === 'today') {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d.getTime();
    }
    if (range === 'week') return now.getTime() - 7 * 24 * 60 * 60 * 1000;
    return now.getTime() - 30 * 24 * 60 * 60 * 1000;
  }, [range]);

  const inRange = (iso: string | null) => {
    if (!iso) return false;
    return new Date(iso).getTime() >= rangeStart;
  };

  const rangeAssignments = assignments.filter((a) => inRange(a.created_at));
  const rangeInspections = inspections.filter((i) => inRange(i.created_at));
  const rangeLaundry = laundry.filter((l) => inRange(l.created_at));

  const stats: ReportStats = useMemo(() => {
    const totalRooms = rooms.length;
    const occupiedCount = rooms.filter((r) => r.occupancy_status === 'occupied').length;
    const occupancyRate = totalRooms ? (occupiedCount / totalRooms) * 100 : 0;

    const completedAssign = rangeAssignments.filter((a) => a.status === 'completed').length;
    const totalAssign = rangeAssignments.length;
    const cleaningCompletionRate = totalAssign ? (completedAssign / totalAssign) * 100 : 0;

    const passedIns = rangeInspections.filter((i) => i.status === 'passed').length;
    const totalIns = rangeInspections.length;
    const inspectionPassRate = totalIns ? (passedIns / totalIns) * 100 : 0;

    // Laundry turnaround: avg hours from created_at to delivered/ready
    const finishedLaundry = rangeLaundry.filter(
      (l) => l.status === 'delivered' || l.status === 'ready'
    );
    let laundryTurnaroundHours = 0;
    if (finishedLaundry.length) {
      const totalHours = finishedLaundry.reduce((sum, l) => {
        const start = new Date(l.created_at).getTime();
        // use updated_at as a proxy for completion time
        const end = new Date(l.updated_at).getTime();
        return sum + Math.max(0, (end - start) / (1000 * 60 * 60));
      }, 0);
      laundryTurnaroundHours = totalHours / finishedLaundry.length;
    }

    const linenCompliant = linen.filter((l) => l.quantity_in_stock >= l.par_level).length;
    const linenParCompliance = linen.length ? (linenCompliant / linen.length) * 100 : 0;

    return {
      totalRooms,
      occupiedCount,
      occupancyRate,
      cleaningCompletionRate,
      inspectionPassRate,
      laundryTurnaroundHours,
      linenParCompliance,
    };
  }, [rooms, rangeAssignments, rangeInspections, rangeLaundry, linen]);

  const statusChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.keys(HOUSEKEEPING_STATUS_LABELS).forEach((k) => (counts[k] = 0));
    rooms.forEach((r) => {
      counts[r.housekeeping_status] = (counts[r.housekeeping_status] || 0) + 1;
    });
    return (Object.keys(HOUSEKEEPING_STATUS_LABELS) as (keyof typeof HOUSEKEEPING_STATUS_LABELS)[]).map(
      (k) => ({
        name: HOUSEKEEPING_STATUS_LABELS[k],
        value: counts[k] || 0,
      })
    );
  }, [rooms]);

  const assignmentTrendData = useMemo(() => {
    // Group assignments by day within range
    const buckets: Record<string, { name: string; Completed: number; Pending: number; InProgress: number }> = {};
    rangeAssignments.forEach((a) => {
      const d = new Date(a.created_at);
      const key = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      if (!buckets[key]) buckets[key] = { name: key, Completed: 0, Pending: 0, InProgress: 0 };
      if (a.status === 'completed') buckets[key].Completed++;
      else if (a.status === 'in_progress') buckets[key].InProgress++;
      else if (a.status === 'pending') buckets[key].Pending++;
    });
    return Object.values(buckets);
  }, [rangeAssignments]);

  // ⬅️ BARU: Housekeeping Performance — rata-rata durasi pengerjaan (menit) per staff,
  // dihitung dari started_at ke completed_at, hanya assignment yang sudah completed,
  // dan hanya dalam rentang tanggal yang dipilih (ikut bertambah/berubah tiap hari
  // sesuai filter This Week/This Month di atas). Batang paling tinggi = staff paling lambat.
  const performanceData = useMemo(() => {
    const byStaff: Record<string, { name: string; totalMinutes: number; roomCount: number }> = {};

    rangeAssignments.forEach((a) => {
      if (a.status !== 'completed' || !a.started_at || !a.completed_at || !a.staff_id) return;
      const start = new Date(a.started_at).getTime();
      const end = new Date(a.completed_at).getTime();
      const minutes = Math.max(0, (end - start) / (1000 * 60));

      const staffName = a.staff?.full_name ?? 'Unknown';
      if (!byStaff[a.staff_id]) {
        byStaff[a.staff_id] = { name: staffName, totalMinutes: 0, roomCount: 0 };
      }
      byStaff[a.staff_id].totalMinutes += minutes;
      byStaff[a.staff_id].roomCount += 1;
    });

    return Object.values(byStaff)
      .map((s) => ({
        name: s.name,
        AvgMinutes: Math.round(s.totalMinutes / s.roomCount),
        Rooms: s.roomCount,
      }))
      // ⬅️ urut dari yang paling lambat (batang tertinggi) ke paling cepat
      .sort((a, b) => b.AvgMinutes - a.AvgMinutes);
  }, [rangeAssignments]);

  const performanceBarColor = (minutes: number) => {
    if (minutes <= PERF_FAST_THRESHOLD) return '#10b981'; // hijau — cepat
    if (minutes <= PERF_SLOW_THRESHOLD) return '#f59e0b'; // amber — sedang
    return '#ef4444'; // merah — lambat
  };

  const handleExport = (format: 'csv' | 'excel' | 'sheets') => {
    toast({
      title: 'Export queued',
      description: `Exporting report as ${format.toUpperCase()} (demo).`,
    });
  };

  const summaryCards = [
    {
      label: 'Total Rooms',
      value: stats.totalRooms.toString(),
      sub: `${stats.occupiedCount} occupied`,
      icon: BedDouble,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Occupancy Rate',
      value: `${stats.occupancyRate.toFixed(1)}%`,
      sub: `${stats.occupiedCount}/${stats.totalRooms} rooms`,
      icon: TrendingUp,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      label: 'Cleaning Completion',
      value: `${stats.cleaningCompletionRate.toFixed(1)}%`,
      sub: `${rangeAssignments.filter((a) => a.status === 'completed').length} done`,
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Inspection Pass Rate',
      value: `${stats.inspectionPassRate.toFixed(1)}%`,
      sub: `${rangeInspections.filter((i) => i.status === 'passed').length} passed`,
      icon: ClipboardCheck,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Laundry Turnaround',
      value: stats.laundryTurnaroundHours
        ? `${stats.laundryTurnaroundHours.toFixed(1)}h`
        : '—',
      sub: `${rangeLaundry.length} orders`,
      icon: Shirt,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
    {
      label: 'Linen Par Compliance',
      value: `${stats.linenParCompliance.toFixed(1)}%`,
      sub: `${linen.filter((l) => l.quantity_in_stock >= l.par_level).length}/${linen.length} items`,
      icon: Layers,
      color: 'text-violet-500',
      bg: 'bg-violet-500/10',
    },
  ];

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    fontSize: '12px',
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Reports & Analytics"
        description="Housekeeping performance metrics and trends"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('sheets')}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Sheets
            </Button>
          </div>
        }
      />

      {/* Filters + export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(RANGE_LABELS) as RangeKey[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {RANGE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <FileText className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>
            <Download className="mr-2 h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{card.label}</p>
                      <p className="text-xl font-bold mt-1">{card.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {card.sub}
                      </p>
                    </div>
                    <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', card.bg)}>
                      <Icon className={cn('h-4 w-4', card.color)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Charts row 1 */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-72 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Room status pie */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Room Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {rooms.length === 0 ? (
                <EmptyChart label="No rooms data" />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={statusChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={50}
                        paddingAngle={2}
                      >
                        {statusChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-2 justify-center mt-2">
                    {statusChartData.map((entry, i) => (
                      <div key={entry.name} className="flex items-center gap-1.5">
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {entry.name}: {entry.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Assignment completion trend */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Assignment Completion Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {assignmentTrendData.length === 0 ? (
                <EmptyChart label="No assignments in range" />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={assignmentTrendData}>
                    <defs>
                      <linearGradient id="cCompleted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="cProgress" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="cPending" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="Completed" stroke="#10b981" fill="url(#cCompleted)" strokeWidth={2} />
                    <Area type="monotone" dataKey="InProgress" stroke="#3b82f6" fill="url(#cProgress)" strokeWidth={2} />
                    <Area type="monotone" dataKey="Pending" stroke="#f59e0b" fill="url(#cPending)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts row 2 — ⬅️ BARU: Housekeeping Performance menggantikan Inspection Scores & Linen Inventory Status */}
      {loading ? (
        <div className="h-80 rounded-lg bg-muted animate-pulse" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              Housekeeping Performance
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Rata-rata waktu pengerjaan per kamar (menit) untuk setiap staff — batang paling tinggi = paling lambat.
              Data mengikuti rentang tanggal ({RANGE_LABELS[range]}) dan bertambah otomatis setiap hari.
            </p>
          </CardHeader>
          <CardContent>
            {performanceData.length === 0 ? (
              <EmptyChart label="Belum ada assignment yang selesai dalam rentang ini" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      stroke="hsl(var(--muted-foreground))"
                      label={{ value: 'Menit', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number, name: string, item: any) => {
                        if (name === 'AvgMinutes') {
                          return [`${value} menit/kamar (${item.payload.Rooms} kamar)`, 'Rata-rata durasi'];
                        }
                        return [value, name];
                      }}
                    />
                    <Bar dataKey="AvgMinutes" radius={[4, 4, 0, 0]}>
                      {performanceData.map((entry, index) => (
                        <Cell key={`perf-cell-${index}`} fill={performanceBarColor(entry.AvgMinutes)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 justify-center mt-3">
                  <Legend color="#10b981" label={`Cepat (≤${PERF_FAST_THRESHOLD} menit)`} />
                  <Legend color="#f59e0b" label={`Sedang (${PERF_FAST_THRESHOLD}-${PERF_SLOW_THRESHOLD} menit)`} />
                  <Legend color="#ef4444" label={`Lambat (>${PERF_SLOW_THRESHOLD} menit)`} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Footer note */}
      {!loading && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          <span>
            Showing data for {RANGE_LABELS[range].toLowerCase()} · Signed in as {profile?.full_name ?? 'user'}
          </span>
        </div>
      )}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[240px] text-muted-foreground">
      <Sparkles className="h-8 w-8 mb-2 opacity-40" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

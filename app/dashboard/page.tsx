'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  BedDouble, CheckCircle2, AlertCircle, DoorOpen, Users,
  Shirt, Layers, TrendingUp, Clock, Sparkles, Download, Percent, LogOut,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  type Room, type Assignment, type LinenInventory,
} from '@/lib/types';

interface Stats {
  totalRooms: number;
  vacantDirty: number;
  vacantCleanUnchecked: number;
  vacantClean: number;
  vacantCleanInspected: number;
  occupiedClean: number;
  occupiedDirty: number;
  expectedDeparture: number;
  outOfOrder: number;
  offMarket: number;
  totalDirty: number;
  occupiedCount: number;
  vacantCount: number;
  occupancyRate: number;
  pendingAssignments: number;
  completedAssignments: number;
  inProgressAssignments: number;
  laundryReceived: number;
  laundryReady: number;
  linenLowStock: number;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentAssignments, setRecentAssignments] = useState<Assignment[]>([]);
  const [linenData, setLinenData] = useState<LinenInventory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [roomsRes, assignmentsRes, laundryRes, linenRes] = await Promise.all([
        supabase.from('rooms').select('*'),
        supabase.from('assignments').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('laundry_orders').select('*'),
        supabase.from('linen_inventory').select('*'),
      ]);

      const rooms = (roomsRes.data as Room[]) || [];
      const assignments = (assignmentsRes.data as Assignment[]) || [];
      const laundry = laundryRes.data || [];
      const linen = (linenRes.data as LinenInventory[]) || [];

      const vacantDirty = rooms.filter((r) => r.housekeeping_status === 'vacant_dirty').length;
      const occupiedDirty = rooms.filter((r) => r.housekeeping_status === 'occupied_dirty').length;
      const totalDirty = vacantDirty + occupiedDirty;
      const totalRoomsCount = rooms.length;
      // Occupancy = dirty rooms / total available rooms x 100
      const occupancyRate = totalRoomsCount > 0
        ? Math.round((totalDirty / totalRoomsCount) * 1000) / 10
        : 0;

      const s: Stats = {
        totalRooms: totalRoomsCount,
        vacantDirty,
        vacantCleanUnchecked: rooms.filter((r) => r.housekeeping_status === 'vacant_clean_unchecked').length,
        vacantClean: rooms.filter((r) => r.housekeeping_status === 'vacant_clean').length,
        vacantCleanInspected: rooms.filter((r) => r.housekeeping_status === 'vacant_clean_inspected').length,
        occupiedClean: rooms.filter((r) => r.housekeeping_status === 'occupied_clean').length,
        occupiedDirty,
        expectedDeparture: rooms.filter((r) => r.housekeeping_status === 'expected_departure').length,
        outOfOrder: rooms.filter((r) => r.housekeeping_status === 'out_of_order').length,
        offMarket: rooms.filter((r) => r.housekeeping_status === 'off_market').length,
        totalDirty,
        occupiedCount: rooms.filter((r) => r.occupancy_status === 'occupied').length,
        vacantCount: rooms.filter((r) => r.occupancy_status === 'vacant').length,
        occupancyRate,
        pendingAssignments: assignments.filter((a) => a.status === 'pending').length,
        completedAssignments: assignments.filter((a) => a.status === 'completed').length,
        inProgressAssignments: assignments.filter((a) => a.status === 'in_progress').length,
        laundryReceived: laundry.filter((l) => l.status === 'received' || l.status === 'washing').length,
        laundryReady: laundry.filter((l) => l.status === 'ready' || l.status === 'delivered').length,
        linenLowStock: linen.filter((l) => l.quantity_in_stock < l.par_level).length,
      };

      setStats(s);
      setRecentAssignments(assignments);
      setLinenData(linen);
    } catch (err) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const statusChartData = stats
    ? [
        { name: 'Vacant Dirty', value: stats.vacantDirty, color: '#ef4444' },
        { name: 'Vacant Clean Uncheck', value: stats.vacantCleanUnchecked, color: '#f97316' },
        { name: 'Vacant Clean', value: stats.vacantClean, color: '#10b981' },
        { name: 'Vacant Inspected', value: stats.vacantCleanInspected, color: '#3b82f6' },
        { name: 'Occupied Clean', value: stats.occupiedClean, color: '#14b8a6' },
        { name: 'Occupied Dirty', value: stats.occupiedDirty, color: '#f59e0b' },
        { name: 'Expected Departure', value: stats.expectedDeparture, color: '#6366f1' },
        { name: 'O/O', value: stats.outOfOrder, color: '#71717a' },
        { name: 'Off Market', value: stats.offMarket, color: '#a855f7' },
      ]
    : [];

  const assignmentChartData = stats
    ? [
        { name: 'Pending', value: stats.pendingAssignments },
        { name: 'In Progress', value: stats.inProgressAssignments },
        { name: 'Completed', value: stats.completedAssignments },
      ]
    : [];

  const linenChartData = linenData.slice(0, 6).map((l) => ({
    name: l.item_name.length > 12 ? l.item_name.slice(0, 10) + '...' : l.item_name,
    InStock: l.quantity_in_stock,
    InUse: l.quantity_in_use,
    Dirty: l.quantity_dirty,
  }));

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const occupancyRate = stats?.occupancyRate ?? 0;
  const occupancyLevel =
    occupancyRate >= 70 ? 'high' : occupancyRate >= 40 ? 'medium' : 'low';
  const occupancyColor = {
    high: { text: 'text-red-500', bg: 'bg-red-500/10', bar: 'bg-red-500' },
    medium: { text: 'text-amber-500', bg: 'bg-amber-500/10', bar: 'bg-amber-500' },
    low: { text: 'text-emerald-500', bg: 'bg-emerald-500/10', bar: 'bg-emerald-500' },
  }[occupancyLevel];

  const statCards = [
    { label: 'Total Rooms', value: stats?.totalRooms ?? 0, icon: BedDouble, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Vacant Dirty', value: stats?.vacantDirty ?? 0, icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
    { label: 'Vacant Clean Uncheck', value: stats?.vacantCleanUnchecked ?? 0, icon: Sparkles, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { label: 'Vacant Clean', value: stats?.vacantClean ?? 0, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Vacant Inspected', value: stats?.vacantCleanInspected ?? 0, icon: CheckCircle2, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Occupied Clean', value: stats?.occupiedClean ?? 0, icon: Users, color: 'text-teal-500', bg: 'bg-teal-500/10' },
    { label: 'Occupied Dirty', value: stats?.occupiedDirty ?? 0, icon: Users, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'Expected Departure', value: stats?.expectedDeparture ?? 0, icon: LogOut, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { label: 'Out Of Order', value: stats?.outOfOrder ?? 0, icon: DoorOpen, color: 'text-zinc-500', bg: 'bg-zinc-500/10' },
    { label: 'Off Market', value: stats?.offMarket ?? 0, icon: DoorOpen, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { label: 'Pending Tasks', value: stats?.pendingAssignments ?? 0, icon: Clock, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { label: 'Completed', value: stats?.completedAssignments ?? 0, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${profile?.full_name ?? 'User'}`}
        actions={
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Sync Spreadsheet
          </Button>
        }
      />

      {/* Occupancy Highlight Card */}
      <Card className="overflow-hidden">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center shrink-0', occupancyColor.bg)}>
                <Percent className={cn('h-6 w-6', occupancyColor.text)} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Occupancy (Dirty Rooms)</p>
                <div className="flex items-baseline gap-2">
                  <p className={cn('text-3xl font-bold', occupancyColor.text)}>
                    {occupancyRate}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {stats?.totalDirty ?? 0} of {stats?.totalRooms ?? 0} rooms dirty
                  </p>
                </div>
              </div>
            </div>
            <div className="w-full md:w-64">
              <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', occupancyColor.bar)}
                  style={{ width: `${Math.min(occupancyRate, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 text-right">
                Synced from latest PMS screenshot via AI Vision OCR
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                    <p className="text-2xl font-bold mt-1">{card.value}</p>
                  </div>
                  <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', card.bg)}>
                    <Icon className={cn('h-5 w-5', card.color)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Room Status Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Room Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
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
                  {statusChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {statusChartData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-xs text-muted-foreground">{entry.name}: {entry.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Assignments Bar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignment Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={assignmentChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Laundry & Linen Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Laundry & Linen Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Shirt className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Laundry In Process</p>
                  <p className="text-xs text-muted-foreground">Received / Washing</p>
                </div>
              </div>
              <span className="text-xl font-bold">{stats?.laundryReceived ?? 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Laundry Ready</p>
                  <p className="text-xs text-muted-foreground">Ready / Delivered</p>
                </div>
              </div>
              <span className="text-xl font-bold">{stats?.laundryReady ?? 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <Layers className="h-4 w-4 text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Linen Low Stock</p>
                  <p className="text-xs text-muted-foreground">Below par level</p>
                </div>
              </div>
              <span className="text-xl font-bold text-red-500">{stats?.linenLowStock ?? 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Linen Chart + Recent Assignments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Linen Inventory Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={linenChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" angle={-15} />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="InStock" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="InUse" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Dirty" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 justify-center mt-2">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                <span className="text-xs text-muted-foreground">In Stock</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span className="text-xs text-muted-foreground">In Use</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                <span className="text-xs text-muted-foreground">Dirty</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAssignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Sparkles className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No recent assignments</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentAssignments.slice(0, 6).map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'h-8 w-8 rounded-lg flex items-center justify-center text-xs font-semibold',
                        a.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                        a.status === 'in_progress' ? 'bg-blue-500/10 text-blue-500' :
                        'bg-amber-500/10 text-amber-500'
                      )}>
                        {a.task_type.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium capitalize">{a.task_type}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={cn(
                      'text-xs capitalize',
                      a.status === 'completed' ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400' :
                      a.status === 'in_progress' ? 'border-blue-500/30 text-blue-600 dark:text-blue-400' :
                      'border-amber-500/30 text-amber-600 dark:text-amber-400'
                    )}>
                      {a.status.replace('_', ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

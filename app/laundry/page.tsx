'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  Search, RefreshCw, Download, Plus, Filter, Shirt, Loader2,
} from 'lucide-react';
import { type LaundryOrder, type Room } from '@/lib/types';

const LAUNDRY_STATUS_LABELS: Record<LaundryOrder['status'], string> = {
  received: 'Received',
  washing: 'Washing',
  drying: 'Drying',
  folding: 'Folding',
  ready: 'Ready',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const LAUNDRY_STATUS_COLORS: Record<LaundryOrder['status'], string> = {
  received: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  washing: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  drying: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  folding: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  ready: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  delivered: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30',
};

const LAUNDRY_PRIORITY_LABELS: Record<LaundryOrder['priority'], string> = {
  express: 'Express',
  normal: 'Normal',
};

const LAUNDRY_PRIORITY_COLORS: Record<LaundryOrder['priority'], string> = {
  express: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  normal: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30',
};

export default function LaundryPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    room_id: '',
    guest_name: '',
    priority: 'normal' as LaundryOrder['priority'],
    total_items: '',
    notes: '',
  });

  const canEdit = profile?.role === 'admin' || profile?.role === 'supervisor' || profile?.role === 'order_taker';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordRes, roomsRes] = await Promise.all([
        supabase
          .from('laundry_orders')
          .select('*, room:rooms(*)')
          .order('created_at', { ascending: false }),
        supabase.from('rooms').select('*').order('number'),
      ]);

      setOrders((ordRes.data as LaundryOrder[]) || []);
      setRooms((roomsRes.data as Room[]) || []);
    } catch (err) {
      console.error('Error fetching laundry orders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = orders.filter((o) => {
    const matchSearch =
      (o.order_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (o.guest_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (o.room?.number ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleCreate = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('laundry_orders').insert({
        room_id: form.room_id || null,
        guest_name: form.guest_name || null,
        priority: form.priority,
        total_items: form.total_items ? parseInt(form.total_items, 10) : 0,
        notes: form.notes || null,
        status: 'received',
        order_taker_id: profile?.id ?? null,
      });
      if (error) throw error;
      toast({ title: 'Created', description: 'Laundry order created successfully' });
      setDialogOpen(false);
      setForm({ room_id: '', guest_name: '', priority: 'normal', total_items: '', notes: '' });
      fetchData();
    } catch (err) {
      console.error('Create error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (order: LaundryOrder, newStatus: LaundryOrder['status']) => {
    setUpdatingId(order.id);
    try {
      const { error } = await supabase.from('laundry_orders').update({ status: newStatus }).eq('id', order.id);
      if (error) throw error;
      toast({ title: 'Updated', description: 'Order status updated' });
      fetchData();
    } catch (err) {
      console.error('Update error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Laundry Orders"
        description="Manage guest laundry orders and tracking"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" /> Sync Spreadsheet
            </Button>
            {canEdit && (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> New Order
              </Button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search order, room, or guest..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {(Object.keys(LAUNDRY_STATUS_LABELS) as LaundryOrder['status'][]).map((s) => (
              <SelectItem key={s} value={s}>{LAUNDRY_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Shirt className="h-10 w-10 mb-2 opacity-40" />
            <p>No laundry orders found matching your filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.order_number ?? '-'}</TableCell>
                  <TableCell>{o.room?.number ?? '-'}</TableCell>
                  <TableCell>{o.guest_name ?? '-'}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn('text-xs', LAUNDRY_PRIORITY_COLORS[o.priority])}
                    >
                      {LAUNDRY_PRIORITY_LABELS[o.priority]}
                    </Badge>
                  </TableCell>
                  <TableCell>{o.total_items}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn('text-xs', LAUNDRY_STATUS_COLORS[o.status])}
                    >
                      {LAUNDRY_STATUS_LABELS[o.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString()}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {(Object.keys(LAUNDRY_STATUS_LABELS) as LaundryOrder['status'][]).map((s) => (
                          <Button
                            key={s}
                            variant={o.status === s ? 'default' : 'outline'}
                            size="sm"
                            disabled={updatingId === o.id}
                            onClick={() => handleStatusChange(o, s)}
                            className={cn('text-xs h-7', o.status !== s && LAUNDRY_STATUS_COLORS[s])}
                          >
                            {updatingId === o.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            {LAUNDRY_STATUS_LABELS[s]}
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Laundry Order</DialogTitle>
            <DialogDescription>Create a new guest laundry order</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Room</Label>
              <Select value={form.room_id} onValueChange={(v) => setForm({ ...form, room_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guest_name">Guest Name</Label>
              <Input
                id="guest_name"
                value={form.guest_name}
                onChange={(e) => setForm({ ...form, guest_name: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm({ ...form, priority: v as LaundryOrder['priority'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LAUNDRY_PRIORITY_LABELS) as LaundryOrder['priority'][]).map((p) => (
                    <SelectItem key={p} value={p}>{LAUNDRY_PRIORITY_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="total_items">Total Items</Label>
              <Input
                id="total_items"
                type="number"
                min={0}
                value={form.total_items}
                onChange={(e) => setForm({ ...form, total_items: e.target.value })}
                placeholder="5"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Special instructions..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

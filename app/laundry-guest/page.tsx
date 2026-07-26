'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
  Search, RefreshCw, Download, Plus, Filter, Shirt, Loader2, CloudUpload,
} from 'lucide-react';
import { type Room } from '@/lib/types';

// ── Types khusus fitur ini (tidak menyentuh lib/types.ts yang sudah ada) ──
type GuestLaundryStatus =
  | 'received' | 'washing' | 'drying' | 'folding' | 'ready' | 'delivered' | 'cancelled';
type GuestLaundryPriority = 'express' | 'normal';

interface GuestLaundryItem {
  id: string;
  name: string;
  category: 'pria' | 'wanita';
  price: number;
  sheet_row: number;
  sort_order: number;
}

interface GuestLaundryOrderItem {
  id: string;
  item_id: string;
  qty: number;
  item?: GuestLaundryItem;
}

interface GuestLaundryOrder {
  id: string;
  order_number: string | null;
  room_id: string | null;
  room?: Room;
  guest_name: string | null;
  priority: GuestLaundryPriority;
  status: GuestLaundryStatus;
  notes: string | null;
  send_date: string;
  synced_at: string | null;
  created_at: string;
  items?: GuestLaundryOrderItem[];
}

const STATUS_LABELS: Record<GuestLaundryStatus, string> = {
  received: 'Received',
  washing: 'Washing',
  drying: 'Drying',
  folding: 'Folding',
  ready: 'Ready',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<GuestLaundryStatus, string> = {
  received: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  washing: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  drying: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  folding: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  ready: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  delivered: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30',
};

const PRIORITY_LABELS: Record<GuestLaundryPriority, string> = {
  express: 'Express',
  normal: 'Normal',
};

const PRIORITY_COLORS: Record<GuestLaundryPriority, string> = {
  express: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  normal: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30',
};

export default function LaundryGuestPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<GuestLaundryOrder[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [items, setItems] = useState<GuestLaundryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const [form, setForm] = useState({
    room_id: '',
    guest_name: '',
    priority: 'normal' as GuestLaundryPriority,
    notes: '',
  });
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});

  const canEdit = profile?.role === 'admin' || profile?.role === 'supervisor' || profile?.role === 'order_taker';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordRes, roomsRes, itemsRes] = await Promise.all([
        supabase
          .from('laundry_guest_orders')
          .select('*, room:rooms(*), items:laundry_guest_order_items(*, item:laundry_guest_items(*))')
          .order('created_at', { ascending: false }),
        supabase.from('rooms').select('*').order('number'),
        supabase.from('laundry_guest_items').select('*').order('sort_order'),
      ]);

      setOrders((ordRes.data as GuestLaundryOrder[]) || []);
      setRooms((roomsRes.data as Room[]) || []);
      setItems((itemsRes.data as GuestLaundryItem[]) || []);
    } catch (err) {
      console.error('Error fetching guest laundry orders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const itemsByCategory = useMemo(() => ({
    pria: items.filter((i) => i.category === 'pria'),
    wanita: items.filter((i) => i.category === 'wanita'),
  }), [items]);

  const totalQty = useMemo(
    () => Object.values(qtyMap).reduce((sum, q) => sum + (q || 0), 0),
    [qtyMap]
  );

  const filtered = orders.filter((o) => {
    const matchSearch =
      (o.order_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (o.guest_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (o.room?.number ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const orderTotalItems = (o: GuestLaundryOrder) =>
    (o.items ?? []).reduce((sum, oi) => sum + (oi.qty || 0), 0);

  const resetForm = () => {
    setForm({ room_id: '', guest_name: '', priority: 'normal', notes: '' });
    setQtyMap({});
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const { data: newOrder, error } = await supabase
        .from('laundry_guest_orders')
        .insert({
          order_number: `GL${Date.now().toString().slice(-8)}`,
          room_id: form.room_id || null,
          guest_name: form.guest_name || null,
          priority: form.priority,
          notes: form.notes || null,
          status: 'received',
          send_date: new Date().toISOString().slice(0, 10),
          order_taker_id: profile?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      const itemRows = Object.entries(qtyMap)
        .filter(([, qty]) => qty > 0)
        .map(([item_id, qty]) => ({ order_id: newOrder.id, item_id, qty }));

      if (itemRows.length > 0) {
        const { error: itemsError } = await supabase.from('laundry_guest_order_items').insert(itemRows);
        if (itemsError) throw itemsError;
      }

      toast({ title: 'Created', description: 'Guest laundry order created successfully' });
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      console.error('Create error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (order: GuestLaundryOrder, newStatus: GuestLaundryStatus) => {
    setUpdatingId(order.id);
    try {
      const { error } = await supabase.from('laundry_guest_orders').update({ status: newStatus }).eq('id', order.id);
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

  const syncOrder = async (orderId: string) => {
    const res = await fetch('/api/sync-laundry-guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sync failed');
    return data;
  };

  const handleSyncOne = async (order: GuestLaundryOrder) => {
    setSyncingId(order.id);
    try {
      await syncOrder(order.id);
      toast({ title: 'Synced', description: `Order ${order.order_number ?? ''} synced to spreadsheet` });
      fetchData();
    } catch (err) {
      console.error('Sync error:', err);
      toast({ title: 'Sync failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    const pending = filtered.filter((o) => !o.synced_at);
    if (pending.length === 0) {
      toast({ title: 'Nothing to sync', description: 'All visible orders are already synced' });
      return;
    }
    setSyncingAll(true);
    let ok = 0;
    let failed = 0;
    for (const order of pending) {
      try {
        await syncOrder(order.id);
        ok += 1;
      } catch (err) {
        console.error('Sync error for', order.id, err);
        failed += 1;
      }
    }
    setSyncingAll(false);
    toast({
      title: 'Sync finished',
      description: `${ok} order synced${failed > 0 ? `, ${failed} failed` : ''}`,
      variant: failed > 0 ? 'destructive' : undefined,
    });
    fetchData();
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Laundry Guest"
        description="Manage guest laundry orders with itemized baku items and spreadsheet sync"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleSyncAll} disabled={syncingAll}>
              {syncingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Sync Spreadsheet
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
            {(Object.keys(STATUS_LABELS) as GuestLaundryStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
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
            <p>No guest laundry orders found matching your filters</p>
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
                <TableHead>Synced</TableHead>
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
                    <Badge variant="outline" className={cn('text-xs', PRIORITY_COLORS[o.priority])}>
                      {PRIORITY_LABELS[o.priority]}
                    </Badge>
                  </TableCell>
                  <TableCell>{orderTotalItems(o)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-xs', STATUS_COLORS[o.status])}>
                      {STATUS_LABELS[o.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {o.synced_at ? new Date(o.synced_at).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString()}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={syncingId === o.id}
                          onClick={() => handleSyncOne(o)}
                          className="text-xs h-7"
                        >
                          {syncingId === o.id
                            ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            : <CloudUpload className="mr-1 h-3 w-3" />}
                          Sync
                        </Button>
                        {(Object.keys(STATUS_LABELS) as GuestLaundryStatus[]).map((s) => (
                          <Button
                            key={s}
                            variant={o.status === s ? 'default' : 'outline'}
                            size="sm"
                            disabled={updatingId === o.id}
                            onClick={() => handleStatusChange(o, s)}
                            className={cn('text-xs h-7', o.status !== s && STATUS_COLORS[s])}
                          >
                            {updatingId === o.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            {STATUS_LABELS[s]}
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
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Guest Laundry Order</DialogTitle>
            <DialogDescription>Create a new guest laundry order with itemized items</DialogDescription>
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
                onValueChange={(v) => setForm({ ...form, priority: v as GuestLaundryPriority })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORITY_LABELS) as GuestLaundryPriority[]).map((p) => (
                    <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Item baku PRIA */}
            <div className="space-y-1.5">
              <Label>Pria / Gentlemen</Label>
              <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                {itemsByCategory.pria.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs truncate" title={it.name}>{it.name}</span>
                    <Input
                      type="number"
                      min={0}
                      className="w-16 h-7 text-xs"
                      value={qtyMap[it.id] ?? ''}
                      onChange={(e) =>
                        setQtyMap({ ...qtyMap, [it.id]: parseInt(e.target.value || '0', 10) })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Item baku WANITA */}
            <div className="space-y-1.5">
              <Label>Wanita / Ladies</Label>
              <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                {itemsByCategory.wanita.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs truncate" title={it.name}>{it.name}</span>
                    <Input
                      type="number"
                      min={0}
                      className="w-16 h-7 text-xs"
                      value={qtyMap[it.id] ?? ''}
                      onChange={(e) =>
                        setQtyMap({ ...qtyMap, [it.id]: parseInt(e.target.value || '0', 10) })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Total items: {totalQty}</p>

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

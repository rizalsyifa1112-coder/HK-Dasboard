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
  Search, RefreshCw, Plus, Filter, Shirt, Loader2, Pencil, X,
} from 'lucide-react';
import { type Room } from '@/lib/types';

// ── Types khusus fitur ini (tidak menyentuh lib/types.ts yang sudah ada) ──
type GuestLaundryStatus =
  | 'received' | 'washing' | 'drying' | 'folding' | 'ready' | 'delivered' | 'cancelled';
type GuestLaundryPriority = 'express' | 'normal';

interface GuestLaundryItem {
  id: string;
  name: string;
  category: 'pria' | 'wanita' | 'paket';
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

const formatRupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n || 0);

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
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    room_id: '',
    notes: '',
    status: 'received' as GuestLaundryStatus,
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
    paket: items.filter((i) => i.category === 'paket'),
  }), [items]);

  const totalQty = useMemo(
    () => Object.values(qtyMap).reduce((sum, q) => sum + (q || 0), 0),
    [qtyMap]
  );

  const totalPrice = useMemo(
    () => Object.entries(qtyMap).reduce((sum, [itemId, qty]) => {
      const item = items.find((i) => i.id === itemId);
      return sum + (item ? item.price * (qty || 0) : 0);
    }, 0),
    [qtyMap, items]
  );

  const filtered = orders.filter((o) => {
    const matchSearch =
      (o.order_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (o.room?.number ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const orderTotalItems = (o: GuestLaundryOrder) =>
    (o.items ?? []).reduce((sum, oi) => sum + (oi.qty || 0), 0);

  const orderTotalPrice = (o: GuestLaundryOrder) =>
    (o.items ?? []).reduce((sum, oi) => sum + ((oi.item?.price ?? 0) * (oi.qty || 0)), 0);

  const resetForm = () => {
    setForm({ room_id: '', notes: '', status: 'received' });
    setQtyMap({});
    setEditingOrderId(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogMode('create');
    setDialogOpen(true);
  };

  const openEditDialog = (order: GuestLaundryOrder) => {
    setDialogMode('edit');
    setEditingOrderId(order.id);
    setForm({
      room_id: order.room_id ?? '',
      notes: order.notes ?? '',
      status: order.status,
    });
    const nextQtyMap: Record<string, number> = {};
    (order.items ?? []).forEach((oi) => {
      nextQtyMap[oi.item_id] = oi.qty;
    });
    setQtyMap(nextQtyMap);
    setDialogOpen(true);
  };

  // ⬅️ Sync otomatis ke Google Sheets, dipanggil diam-diam setelah create/edit berhasil
  const syncOrder = async (orderId: string) => {
    try {
      const res = await fetch('/api/sync-laundry-guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      return data;
    } catch (err) {
      console.error('Auto-sync error:', err);
      toast({
        title: 'Sync ke spreadsheet gagal',
        description: (err as Error).message,
        variant: 'destructive',
      });
      return null;
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (dialogMode === 'create') {
        const { data: newOrder, error } = await supabase
          .from('laundry_guest_orders')
          .insert({
            order_number: `GL${Date.now().toString().slice(-8)}`,
            room_id: form.room_id || null,
            guest_name: null,
            priority: 'normal' as GuestLaundryPriority,
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

        toast({ title: 'Created', description: 'Guest laundry order created, syncing to spreadsheet...' });
        setDialogOpen(false);
        resetForm();
        await syncOrder(newOrder.id);
        fetchData();
      } else if (dialogMode === 'edit' && editingOrderId) {
        const { error: updateError } = await supabase
          .from('laundry_guest_orders')
          .update({
            room_id: form.room_id || null,
            notes: form.notes || null,
            status: form.status,
          })
          .eq('id', editingOrderId);
        if (updateError) throw updateError;

        // Ganti seluruh item order dengan qty terbaru dari form
        const { error: deleteItemsError } = await supabase
          .from('laundry_guest_order_items')
          .delete()
          .eq('order_id', editingOrderId);
        if (deleteItemsError) throw deleteItemsError;

        const itemRows = Object.entries(qtyMap)
          .filter(([, qty]) => qty > 0)
          .map(([item_id, qty]) => ({ order_id: editingOrderId, item_id, qty }));

        if (itemRows.length > 0) {
          const { error: itemsError } = await supabase.from('laundry_guest_order_items').insert(itemRows);
          if (itemsError) throw itemsError;
        }

        toast({ title: 'Updated', description: 'Order updated, re-syncing to spreadsheet...' });
        setDialogOpen(false);
        resetForm();
        await syncOrder(editingOrderId);
        fetchData();
      }
    } catch (err) {
      console.error('Submit error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (order: GuestLaundryOrder) => {
    const confirmed = window.confirm(
      `Hapus order ${order.order_number ?? ''}? Tindakan ini tidak bisa dibatalkan.`
    );
    if (!confirmed) return;

    setDeletingId(order.id);
    try {
      const { error: deleteItemsError } = await supabase
        .from('laundry_guest_order_items')
        .delete()
        .eq('order_id', order.id);
      if (deleteItemsError) throw deleteItemsError;

      const { error: deleteOrderError } = await supabase
        .from('laundry_guest_orders')
        .delete()
        .eq('id', order.id);
      if (deleteOrderError) throw deleteOrderError;

      toast({ title: 'Deleted', description: `Order ${order.order_number ?? ''} dihapus` });
      fetchData();
    } catch (err) {
      console.error('Delete error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const renderItemGrid = (categoryItems: GuestLaundryItem[]) => (
    <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
      {categoryItems.map((it) => (
        <div key={it.id} className="flex items-center justify-between gap-2">
          <div className="flex flex-col min-w-0">
            <span className="text-xs truncate" title={it.name}>{it.name}</span>
            <span className="text-[10px] text-muted-foreground">{formatRupiah(it.price)}</span>
          </div>
          <Input
            type="number"
            min={0}
            className="w-16 h-7 text-xs shrink-0"
            value={qtyMap[it.id] ?? ''}
            onChange={(e) =>
              setQtyMap({ ...qtyMap, [it.id]: parseInt(e.target.value || '0', 10) })
            }
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Laundry Guest"
        description="Manage guest laundry orders with itemized baku items and automatic spreadsheet sync"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            {canEdit && (
              <Button size="sm" onClick={openCreateDialog}>
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
            placeholder="Search order or room..."
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
                <TableHead>Items</TableHead>
                <TableHead>Total Price</TableHead>
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
                  <TableCell>{orderTotalItems(o)}</TableCell>
                  <TableCell className="font-medium">{formatRupiah(orderTotalPrice(o))}</TableCell>
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
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditDialog(o)}
                          title="Edit order"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          disabled={deletingId === o.id}
                          onClick={() => handleDelete(o)}
                          title="Delete order"
                        >
                          {deletingId === o.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <X className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'create' ? 'New Guest Laundry Order' : 'Edit Guest Laundry Order'}</DialogTitle>
            <DialogDescription>
              {dialogMode === 'create'
                ? 'Create a new guest laundry order with itemized items'
                : 'Update this order — resubmitting will re-sync corrected data to the spreadsheet'}
            </DialogDescription>
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

            {dialogMode === 'edit' && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as GuestLaundryStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as GuestLaundryStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Item baku PRIA */}
            {itemsByCategory.pria.length > 0 && (
              <div className="space-y-1.5">
                <Label>Pria / Gentlemen</Label>
                {renderItemGrid(itemsByCategory.pria)}
              </div>
            )}

            {/* Item baku WANITA */}
            {itemsByCategory.wanita.length > 0 && (
              <div className="space-y-1.5">
                <Label>Wanita / Ladies</Label>
                {renderItemGrid(itemsByCategory.wanita)}
              </div>
            )}

            {/* Item baku PAKET */}
            {itemsByCategory.paket.length > 0 && (
              <div className="space-y-1.5">
                <Label>Paket</Label>
                {renderItemGrid(itemsByCategory.paket)}
              </div>
            )}

            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <span className="text-xs text-muted-foreground">Total items: {totalQty}</span>
              <span className="text-sm font-semibold">{formatRupiah(totalPrice)}</span>
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
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

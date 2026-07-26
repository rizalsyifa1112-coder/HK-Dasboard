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
  Search, RefreshCw, Download, Plus, Package, Loader2, CloudUpload, AlertTriangle,
} from 'lucide-react';
import {
  PRIORITY_LABELS, PRIORITY_COLORS,
  type StoreRequest, type StoreRequestItem, type Profile, type Priority,
} from '@/lib/types';

const STORE_STATUS_LABELS: Record<StoreRequest['status'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  fulfilled: 'Fulfilled',
  rejected: 'Rejected',
};

const STORE_STATUS_COLORS: Record<StoreRequest['status'], string> = {
  pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  approved: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  fulfilled: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  rejected: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
};

function formatRupiah(n: number | null | undefined) {
  if (n == null) return '-';
  return `Rp ${n.toLocaleString('id-ID')}`;
}

export default function StoreRequestPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<StoreRequest[]>([]);
  const [masterItems, setMasterItems] = useState<StoreRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [form, setForm] = useState({
    item_name: '',
    category: '',
    quantity: '',
    unit: '',
    price: '',
    priority: 'normal' as Priority,
    notes: '',
  });

  const canEdit = profile?.role === 'admin' || profile?.role === 'supervisor' || profile?.role === 'order_taker';
  const canApprove = profile?.role === 'admin' || profile?.role === 'supervisor';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: reqData, error: reqErr }, { data: itemData, error: itemErr }] = await Promise.all([
        supabase
          .from('store_requests')
          .select('*, requester:profiles(*), item:store_request_items(*)')
          .order('created_at', { ascending: false }),
        supabase
          .from('store_request_items')
          .select('*')
          .eq('active', true)
          .order('name', { ascending: true }),
      ]);
      if (reqErr) throw reqErr;
      if (itemErr) throw itemErr;
      setRequests((reqData as StoreRequest[]) || []);
      setMasterItems((itemData as StoreRequestItem[]) || []);
    } catch (err) {
      console.error('Error fetching store requests:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const matchedItem = useMemo(() => {
    const name = form.item_name.trim().toLowerCase();
    if (!name) return null;
    return masterItems.find((i) => i.name.trim().toLowerCase() === name) || null;
  }, [form.item_name, masterItems]);

  // Auto-fill category/unit/price when the typed name matches an existing master item.
  useEffect(() => {
    if (matchedItem) {
      setForm((f) => ({
        ...f,
        category: matchedItem.category,
        unit: matchedItem.unit,
        price: String(matchedItem.price),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedItem?.id]);

  const filtered = requests.filter((r) => {
    const matchSearch =
      r.item_name.toLowerCase().includes(search.toLowerCase()) ||
      r.request_number?.toLowerCase().includes(search.toLowerCase()) ||
      r.requester?.full_name?.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const handleCreate = async () => {
    if (!form.item_name) {
      toast({ title: 'Validation', description: 'Item name is required', variant: 'destructive' });
      return;
    }
    if (!matchedItem && !form.price) {
      toast({ title: 'Validation', description: 'Price is required for a new item', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      let itemId = matchedItem?.id ?? null;

      // Item belum ada di master -> buat baru (sheet_row null, perlu di-set manual nanti)
      if (!itemId) {
        const { data: newItem, error: newItemErr } = await supabase
          .from('store_request_items')
          .insert({
            name: form.item_name.trim(),
            category: form.category || 'general',
            unit: form.unit || 'pcs',
            price: parseFloat(form.price) || 0,
          })
          .select()
          .single();
        if (newItemErr) throw newItemErr;
        itemId = newItem.id;
      }

      const { error } = await supabase.from('store_requests').insert({
        item_id: itemId,
        item_name: form.item_name,
        category: form.category || 'general',
        quantity: parseInt(form.quantity, 10) || 1,
        unit: form.unit || 'pcs',
        price: matchedItem ? matchedItem.price : parseFloat(form.price) || 0,
        priority: form.priority,
        notes: form.notes || null,
        status: 'pending',
        requested_by: profile?.id ?? null,
      });
      if (error) throw error;
      toast({ title: 'Created', description: 'Store request created successfully' });
      setDialogOpen(false);
      setForm({ item_name: '', category: '', quantity: '', unit: '', price: '', priority: 'normal', notes: '' });
      fetchData();
    } catch (err) {
      console.error('Create error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (req: StoreRequest, newStatus: StoreRequest['status']) => {
    setUpdatingId(req.id);
    try {
      const { error } = await supabase.from('store_requests').update({ status: newStatus }).eq('id', req.id);
      if (error) throw error;
      toast({ title: 'Updated', description: 'Request status updated' });
      fetchData();
    } catch (err) {
      console.error('Update error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  };

  const syncOne = async (req: StoreRequest, { silent }: { silent?: boolean } = {}) => {
    const res = await fetch('/api/sync-store-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: req.id }),
    });
    const data = await res.json();
    if (!silent) {
      if (data.needsReview) {
        toast({ title: 'Perlu review manual', description: data.message, variant: 'destructive' });
      } else if (data.success) {
        toast({ title: 'Synced', description: `Tersimpan di tab "${data.tabName}"` });
        fetchData();
      } else {
        toast({ title: 'Error', description: data.error || 'Sync gagal', variant: 'destructive' });
      }
    }
    return data;
  };

  const handleSyncOne = async (req: StoreRequest) => {
    setSyncingId(req.id);
    try {
      await syncOne(req);
    } catch (err) {
      console.error('Sync error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    const pending = requests.filter((r) => !r.synced_at);
    if (pending.length === 0) {
      toast({ title: 'Sudah sinkron', description: 'Tidak ada request yang perlu di-sync' });
      return;
    }
    setSyncingAll(true);
    try {
      let ok = 0;
      let needsReview = 0;
      for (const req of pending) {
        const data = await syncOne(req, { silent: true });
        if (data.success) ok += 1;
        else if (data.needsReview) needsReview += 1;
      }
      toast({
        title: 'Sync selesai',
        description: `${ok} berhasil disinkron, ${needsReview} perlu review manual (item belum di master data / belum ada sheet_row).`,
      });
      fetchData();
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Store Requests"
        description="Manage inventory and supply requests"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            {canApprove && (
              <Button variant="outline" size="sm" onClick={handleSyncAll} disabled={syncingAll}>
                {syncingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Sync Spreadsheet
              </Button>
            )}
            {canEdit && (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> New Request
              </Button>
            )}
          </div>
        }
      />

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search item, request #, or requester..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
            <Package className="h-10 w-10 mb-2 opacity-40" />
            <p>No store requests found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request #</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sync</TableHead>
                {canApprove && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.request_number ?? '-'}</TableCell>
                  <TableCell>{r.requester?.full_name ?? '-'}</TableCell>
                  <TableCell>{r.item_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.category}</TableCell>
                  <TableCell className="text-right">{r.quantity} {r.unit}</TableCell>
                  <TableCell className="text-right">{formatRupiah(r.item?.price ?? r.price)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-xs', PRIORITY_COLORS[r.priority])}>
                      {PRIORITY_LABELS[r.priority]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-xs', STORE_STATUS_COLORS[r.status])}>
                      {STORE_STATUS_LABELS[r.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.synced_at ? (
                      <Badge variant="outline" className="text-xs bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                        Synced
                      </Badge>
                    ) : !r.item_id || r.item?.sheet_row == null ? (
                      <Badge variant="outline" className="text-xs bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30">
                        <AlertTriangle className="mr-1 h-3 w-3" /> Needs review
                      </Badge>
                    ) : (
                      canApprove && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={syncingId === r.id}
                          onClick={() => handleSyncOne(r)}
                        >
                          {syncingId === r.id
                            ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            : <CloudUpload className="mr-1 h-3 w-3" />}
                          Sync
                        </Button>
                      )
                    )}
                  </TableCell>
                  {canApprove && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {(Object.keys(STORE_STATUS_LABELS) as StoreRequest['status'][]).map((s) => (
                          <Button
                            key={s}
                            variant={r.status === s ? 'default' : 'outline'}
                            size="sm"
                            disabled={updatingId === r.id}
                            onClick={() => handleStatusChange(r, s)}
                            className={cn('text-xs h-7', r.status !== s && STORE_STATUS_COLORS[s])}
                          >
                            {updatingId === r.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            {STORE_STATUS_LABELS[s]}
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
            <DialogTitle>New Store Request</DialogTitle>
            <DialogDescription>Create a new inventory or supply request</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="item_name">Item Name</Label>
              <Input
                id="item_name"
                list="store-request-item-options"
                value={form.item_name}
                onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                placeholder="Cleaning Solution"
              />
              <datalist id="store-request-item-options">
                {masterItems.map((i) => (
                  <option key={i.id} value={i.name} />
                ))}
              </datalist>
              {matchedItem && (
                <p className="text-xs text-muted-foreground">
                  Item sudah ada di master data — kategori, unit, dan harga otomatis terisi dari data yang sudah ada.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Cleaning Supplies"
                  disabled={!!matchedItem}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v as Priority })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                      <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="bottles"
                  disabled={!!matchedItem}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="price">
                  Price (per unit){matchedItem && ' — sudah ada di master data'}
                </Label>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="90000"
                  disabled={!!matchedItem}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Additional details..."
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

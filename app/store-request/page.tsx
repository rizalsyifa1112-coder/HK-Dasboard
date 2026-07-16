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
  Search, RefreshCw, Download, Plus, Package, Loader2,
} from 'lucide-react';
import {
  PRIORITY_LABELS, PRIORITY_COLORS,
  type StoreRequest, type Profile, type Priority,
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

export default function StoreRequestPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<StoreRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    item_name: '',
    category: '',
    quantity: '',
    unit: '',
    priority: 'normal' as Priority,
    notes: '',
  });

  const canEdit = profile?.role === 'admin' || profile?.role === 'supervisor' || profile?.role === 'order_taker';
  const canApprove = profile?.role === 'admin' || profile?.role === 'supervisor';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('store_requests')
        .select('*, requester:profiles(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRequests((data as StoreRequest[]) || []);
    } catch (err) {
      console.error('Error fetching store requests:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
    setSaving(true);
    try {
      const { error } = await supabase.from('store_requests').insert({
        item_name: form.item_name,
        category: form.category || 'general',
        quantity: parseInt(form.quantity, 10) || 1,
        unit: form.unit || 'pcs',
        priority: form.priority,
        notes: form.notes || null,
        status: 'pending',
        requested_by: profile?.id ?? null,
      });
      if (error) throw error;
      toast({ title: 'Created', description: 'Store request created successfully' });
      setDialogOpen(false);
      setForm({ item_name: '', category: '', quantity: '', unit: '', priority: 'normal', notes: '' });
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
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" /> Sync Spreadsheet
            </Button>
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
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
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
                value={form.item_name}
                onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                placeholder="Cleaning Solution"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Cleaning Supplies"
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

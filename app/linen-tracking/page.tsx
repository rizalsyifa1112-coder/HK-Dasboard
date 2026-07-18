'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Search, RefreshCw, Plus, Filter, Layers, Loader2, Pencil, Undo2 } from 'lucide-react';
import type { LinenItem } from '@/lib/types';

const STATUS_LABELS: Record<LinenItem['status'], string> = {
  available: 'Available',
  sent_to_laundry: 'Sent to Laundry',
  returned: 'Returned',
  lost: 'Lost',
};

const STATUS_COLORS: Record<LinenItem['status'], string> = {
  available: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  sent_to_laundry: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  returned: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  lost: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
};

const emptyForm = {
  code: '',
  item_type: 'BT' as LinenItem['item_type'],
  status: 'available' as LinenItem['status'],
  notes: '',
};

export default function LinenTrackingPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<LinenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LinenItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  // ⬅️ BARU: state loading khusus untuk tombol quick-action (Return) per baris
  const [quickUpdatingId, setQuickUpdatingId] = useState<string | null>(null);

  const canEdit = profile?.role === 'admin' || profile?.role === 'order_taker';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('linen_items')
        .select('*')
        .order('item_type')
        .order('code');
      if (error) throw error;
      setItems((data as LinenItem[]) || []);
    } catch (err) {
      console.error('Error fetching linen items:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = items.filter((i) => {
    const matchSearch = i.code.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || i.item_type === typeFilter;
    const matchStatus = statusFilter === 'all' || i.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  const btCount = items.filter((i) => i.item_type === 'BT').length;
  const bmCount = items.filter((i) => i.item_type === 'BM').length;
  const lostCount = items.filter((i) => i.status === 'lost').length;
  const sentCount = items.filter((i) => i.status === 'sent_to_laundry').length;

  const openCreate = () => {
    setEditingItem(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (item: LinenItem) => {
    setEditingItem(item);
    setForm({
      code: item.code,
      item_type: item.item_type,
      status: item.status,
      notes: item.notes ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim()) {
      toast({ title: 'Validation', description: 'Code is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        item_type: form.item_type,
        status: form.status,
        notes: form.notes || null,
        created_by: profile?.id ?? null,
      };
      if (editingItem) {
        const { error } = await supabase.from('linen_items').update(payload).eq('id', editingItem.id);
        if (error) throw error;
        toast({ title: 'Updated', description: 'Item updated successfully' });
      } else {
        const { error } = await supabase.from('linen_items').insert(payload);
        if (error) throw error;
        toast({ title: 'Created', description: 'Item added successfully' });
      }
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ⬅️ BARU: tombol cepat "Return" — langsung set status jadi "returned"
  // tanpa perlu buka dialog Edit. Hanya tampil kalau status saat ini "sent_to_laundry".
  const handleQuickReturn = async (item: LinenItem) => {
    setQuickUpdatingId(item.id);
    try {
      const { error } = await supabase
        .from('linen_items')
        .update({ status: 'returned' })
        .eq('id', item.id);
      if (error) throw error;
      toast({ title: 'Returned', description: `${item.code} ditandai sudah kembali dari laundry` });
      fetchData();
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setQuickUpdatingId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="BT/BM Tracking"
        description="Track numbered Bath Towel and Bath Mat items sent to laundry vendor"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            {canEdit && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> Add Item
              </Button>
            )}
          </div>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Bath Towel (BT)', value: btCount, color: 'text-primary' },
          { label: 'Bath Mat (BM)', value: bmCount, color: 'text-blue-500' },
          { label: 'Sent to Laundry', value: sentCount, color: 'text-amber-500' },
          { label: 'Lost', value: lostCount, color: 'text-red-500' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn('text-2xl font-bold mt-1', s.color)}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search code..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="BT">Bath Towel (BT)</SelectItem>
            <SelectItem value="BM">Bath Mat (BM)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {(Object.keys(STATUS_LABELS) as LinenItem['status'][]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Layers className="h-10 w-10 mb-2 opacity-40" />
            <p>No items found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono font-semibold">{item.code}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {item.item_type === 'BT' ? 'Bath Towel' : 'Bath Mat'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-xs', STATUS_COLORS[item.status])}>
                      {STATUS_LABELS[item.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.notes ?? '-'}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {item.status === 'sent_to_laundry' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={quickUpdatingId === item.id}
                            onClick={() => handleQuickReturn(item)}
                          >
                            {quickUpdatingId === item.id ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Undo2 className="mr-1 h-3 w-3" />
                            )}
                            Return
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                          <Pencil className="mr-1 h-3 w-3" /> Edit
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Item' : 'Add BT/BM Item'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Update item details' : 'Register a new numbered item'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Item Type</Label>
              <Select
                value={form.item_type}
                onValueChange={(v) => setForm({ ...form, item_type: v as LinenItem['item_type'], code: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BT">Bath Towel (BT)</SelectItem>
                  <SelectItem value="BM">Bath Mat (BM)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">Code (e.g. BT001)</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="BT001"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as LinenItem['status'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as LinenItem['status'][]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingItem ? 'Update' : 'Add Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  Search, RefreshCw, Loader2, CloudUpload, AlertTriangle, Pencil, X, Check,
} from 'lucide-react';
import type { StoreRequest, StoreRequestItem } from '@/lib/types';

function formatRupiah(n: number | null | undefined) {
  if (n == null) return '-';
  return `Rp ${n.toLocaleString('id-ID')}`;
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayLabel() {
  return new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function StoreRequestPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<StoreRequestItem[]>([]);
  const [todaysEntries, setTodaysEntries] = useState<Record<string, StoreRequest>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canEdit = profile?.role === 'admin' || profile?.role === 'supervisor' || profile?.role === 'order_taker';
  const today = todayStr();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: itemData, error: itemErr }, { data: entryData, error: entryErr }] = await Promise.all([
        supabase
          .from('store_request_items')
          .select('*')
          .eq('active', true)
          .order('category', { ascending: true })
          .order('name', { ascending: true }),
        supabase
          .from('store_requests')
          .select('*, item:store_request_items(*)')
          .eq('request_date', today),
      ]);
      if (itemErr) throw itemErr;
      if (entryErr) throw entryErr;
      setItems((itemData as StoreRequestItem[]) || []);
      const map: Record<string, StoreRequest> = {};
      ((entryData as StoreRequest[]) || []).forEach((e) => {
        if (e.item_id) map[e.item_id] = e;
      });
      setTodaysEntries(map);
    } catch (err) {
      console.error('Error fetching store requests:', err);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredItems = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  const grouped = useMemo(() => {
    const groups: Record<string, StoreRequestItem[]> = {};
    filteredItems.forEach((i) => {
      if (!groups[i.category]) groups[i.category] = [];
      groups[i.category].push(i);
    });
    return groups;
  }, [filteredItems]);

  const syncRequest = async (requestId: string) => {
    const res = await fetch('/api/sync-store-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId }),
    });
    return res.json();
  };

  const handleSave = async (item: StoreRequestItem) => {
    const raw = inputValues[item.id];
    const qty = parseInt(raw, 10);
    if (!raw || isNaN(qty) || qty <= 0) {
      toast({ title: 'Validation', description: 'Isi jumlah yang valid (lebih dari 0)', variant: 'destructive' });
      return;
    }
    setSavingId(item.id);
    try {
      const existing = todaysEntries[item.id];
      let requestId: string;

      if (existing) {
        const { error } = await supabase
          .from('store_requests')
          .update({ quantity: qty })
          .eq('id', existing.id);
        if (error) throw error;
        requestId = existing.id;
      } else {
        const { data, error } = await supabase
          .from('store_requests')
          .insert({
            item_id: item.id,
            item_name: item.name,
            category: item.category,
            quantity: qty,
            unit: item.unit,
            price: item.price,
            priority: 'normal',
            status: 'fulfilled',
            request_date: today,
            requested_by: profile?.id ?? null,
          })
          .select()
          .single();
        if (error) throw error;
        requestId = data.id;
      }

      const syncResult = await syncRequest(requestId);
      if (syncResult.needsReview) {
        toast({ title: 'Tersimpan, tapi belum sync', description: syncResult.message, variant: 'destructive' });
      } else if (syncResult.success) {
        toast({ title: 'Tersimpan & tersinkron', description: `${item.name}: ${qty} ${item.unit}` });
      } else {
        toast({ title: 'Tersimpan, sync gagal', description: syncResult.error, variant: 'destructive' });
      }

      setEditingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      fetchData();
    } catch (err) {
      console.error('Save error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  const handleEdit = (item: StoreRequestItem) => {
    const existing = todaysEntries[item.id];
    setInputValues((prev) => ({ ...prev, [item.id]: existing ? String(existing.quantity) : '' }));
    setEditingIds((prev) => new Set(prev).add(item.id));
  };

  const handleCancelEdit = (item: StoreRequestItem) => {
    setEditingIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  };

  const handleDelete = async (item: StoreRequestItem) => {
    const existing = todaysEntries[item.id];
    if (!existing) return;
    if (!window.confirm(`Hapus entry "${item.name}" hari ini? Sel di spreadsheet juga akan dikosongkan (0).`)) return;
    setDeletingId(item.id);
    try {
      const { error } = await supabase.from('store_requests').delete().eq('id', existing.id);
      if (error) throw error;

      if (item.sheet_row != null && existing.synced_at) {
        await fetch('/api/clear-store-request-cell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sheetRow: item.sheet_row, date: existing.request_date }),
        });
      }

      toast({ title: 'Dihapus', description: `Entry "${item.name}" hari ini dihapus` });
      fetchData();
    } catch (err) {
      console.error('Delete error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Store Requests"
        description={`Input pemakaian barang untuk hari ini — ${todayLabel()}`}
        actions={
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari item..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 rounded bg-muted animate-pulse" />
          ))}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p>Tidak ada item ditemukan</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Qty Hari Ini</TableHead>
                <TableHead>Sync</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(grouped).map(([category, catItems]) => (
                <>
                  <TableRow key={`cat-${category}`} className="bg-muted/50">
                    <TableCell colSpan={canEdit ? 6 : 5} className="font-semibold text-xs uppercase tracking-wide">
                      {category}
                    </TableCell>
                  </TableRow>
                  {catItems.map((item) => {
                    const existing = todaysEntries[item.id];
                    const isEditing = editingIds.has(item.id) || !existing;
                    const needsReview = item.sheet_row == null;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.unit}</TableCell>
                        <TableCell className="text-right">{formatRupiah(item.price)}</TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <Input
                              type="number"
                              min={1}
                              className="w-24 ml-auto text-right"
                              value={inputValues[item.id] ?? ''}
                              onChange={(e) => setInputValues((prev) => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder="0"
                              disabled={!canEdit}
                            />
                          ) : (
                            <span className="font-medium">{existing.quantity}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {needsReview ? (
                            <Badge variant="outline" className="text-xs bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30">
                              <AlertTriangle className="mr-1 h-3 w-3" /> Needs review
                            </Badge>
                          ) : existing?.synced_at ? (
                            <Badge variant="outline" className="text-xs bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                              <CloudUpload className="mr-1 h-3 w-3" /> Synced
                            </Badge>
                          ) : existing ? (
                            <Badge variant="outline" className="text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                              Belum sync
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {isEditing ? (
                                <>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={savingId === item.id}
                                    onClick={() => handleSave(item)}
                                  >
                                    {savingId === item.id
                                      ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                      : <Check className="mr-1 h-3 w-3" />}
                                    Save
                                  </Button>
                                  {existing && (
                                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleCancelEdit(item)}>
                                      Cancel
                                    </Button>
                                  )}
                                </>
                              ) : (
                                <>
                                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleEdit(item)}>
                                    <Pencil className="mr-1 h-3 w-3" /> Edit
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs text-red-600 dark:text-red-400"
                                    disabled={deletingId === item.id}
                                    onClick={() => handleDelete(item)}
                                  >
                                    {deletingId === item.id
                                      ? <Loader2 className="h-3 w-3 animate-spin" />
                                      : <X className="h-3 w-3" />}
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

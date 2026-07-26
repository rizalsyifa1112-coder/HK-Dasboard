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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  Search, RefreshCw, Plus, Package, Loader2, ChevronDown, ChevronUp,
  Pencil, Trash2, AlertTriangle, Filter, X, Check,
} from 'lucide-react';
import type { StoreRequest, StoreRequestItem } from '@/lib/types';

type EntryWithItem = StoreRequest & { item: StoreRequestItem | null };

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

function formatDateLabel(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

const CATEGORY_FILTER_ALL = 'all';

export default function StoreRequestPage() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [masterItems, setMasterItems] = useState<StoreRequestItem[]>([]);
  const [entries, setEntries] = useState<EntryWithItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  // Inline edit state (per item, per date) inside an expanded card
  const [editingKey, setEditingKey] = useState<string | null>(null); // `${date}__${itemId}`
  const [inlineValue, setInlineValue] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  // Dialog (New / Edit Record) state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState(todayStr());
  const [isEditingExistingDate, setIsEditingExistingDate] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(CATEGORY_FILTER_ALL);
  const [formQty, setFormQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const canEdit = profile?.role === 'admin' || profile?.role === 'supervisor' || profile?.role === 'order_taker';

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
          .order('request_date', { ascending: false }),
      ]);
      if (itemErr) throw itemErr;
      if (entryErr) throw entryErr;
      setMasterItems((itemData as StoreRequestItem[]) || []);
      setEntries((entryData as EntryWithItem[]) || []);
    } catch (err) {
      console.error('Error fetching store requests:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const categoryOptions = useMemo(() => {
    const set = new Set(masterItems.map((i) => i.category));
    return Array.from(set);
  }, [masterItems]);

  // Group entries by request_date -> list of entries
  const recordsByDate = useMemo(() => {
    const map: Record<string, EntryWithItem[]> = {};
    entries.forEach((e) => {
      if (!map[e.request_date]) map[e.request_date] = [];
      map[e.request_date].push(e);
    });
    return map;
  }, [entries]);

  const sortedDates = useMemo(() => {
    return Object.keys(recordsByDate)
      .filter((d) => {
        if (!search) return true;
        const label = formatDateLabel(d).toLowerCase();
        const matchDate = label.includes(search.toLowerCase()) || d.includes(search);
        const matchItem = recordsByDate[d].some((e) =>
          (e.item_name ?? '').toLowerCase().includes(search.toLowerCase())
        );
        return matchDate || matchItem;
      })
      .sort((a, b) => (a < b ? 1 : -1));
  }, [recordsByDate, search]);

  // Group a date's entries by category
  const groupByCategory = (list: EntryWithItem[]) => {
    const groups: Record<string, EntryWithItem[]> = {};
    list.forEach((e) => {
      const cat = e.category || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(e);
    });
    return groups;
  };

  const visibleMasterItems = useMemo(() => {
    if (categoryFilter === CATEGORY_FILTER_ALL) return masterItems;
    return masterItems.filter((i) => i.category === categoryFilter);
  }, [masterItems, categoryFilter]);

  // --- Sync helpers ---
  const syncRequest = async (requestId: string) => {
    const res = await fetch('/api/sync-store-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId }),
    });
    return res.json();
  };

  const clearCell = async (sheetRow: number, date: string) => {
    await fetch('/api/clear-store-request-cell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetRow, date }),
    });
  };

  // --- Inline edit (single item, single date) inside expanded card ---
  const startInlineEdit = (date: string, item: StoreRequestItem, existing?: EntryWithItem) => {
    setEditingKey(`${date}__${item.id}`);
    setInlineValue(existing ? String(existing.quantity) : '');
  };

  const cancelInlineEdit = () => {
    setEditingKey(null);
    setInlineValue('');
  };

  const saveInlineEdit = async (date: string, item: StoreRequestItem, existing?: EntryWithItem) => {
    const qty = parseInt(inlineValue, 10);
    if (!inlineValue || isNaN(qty) || qty <= 0) {
      toast({ title: 'Validation', description: 'Isi jumlah yang valid (lebih dari 0)', variant: 'destructive' });
      return;
    }
    const key = `${date}__${item.id}`;
    setSavingKey(key);
    try {
      let requestId: string;
      if (existing) {
        const { error } = await supabase.from('store_requests').update({ quantity: qty }).eq('id', existing.id);
        if (error) throw error;
        requestId = existing.id;
      } else {
        const { data, error } = await supabase
          .from('store_requests')
          .insert({
            request_number: `SR-${Date.now()}`,
            item_id: item.id,
            item_name: item.name,
            category: item.category,
            quantity: qty,
            unit: item.unit,
            price: item.price,
            priority: 'normal',
            status: 'fulfilled',
            request_date: date,
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

      cancelInlineEdit();
      fetchData();
    } catch (err) {
      console.error('Save error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSavingKey(null);
    }
  };

  const deleteInlineEntry = async (date: string, item: StoreRequestItem, existing: EntryWithItem) => {
    if (!window.confirm(`Hapus entry "${item.name}" tanggal ${formatDateLabel(date)}? Sel di spreadsheet juga akan dikosongkan (0).`)) return;
    const key = `${date}__${item.id}`;
    setDeletingKey(key);
    try {
      const { error } = await supabase.from('store_requests').delete().eq('id', existing.id);
      if (error) throw error;
      if (item.sheet_row != null && existing.synced_at) {
        await clearCell(item.sheet_row, date);
      }
      toast({ title: 'Dihapus', description: `Entry "${item.name}" tanggal ${formatDateLabel(date)} dihapus` });
      fetchData();
    } catch (err) {
      console.error('Delete error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setDeletingKey(null);
    }
  };

  // --- Dialog: New / Edit Record for a date ---
  const openCreateDialog = () => {
    setIsEditingExistingDate(false);
    setDialogDate(todayStr());
    setCategoryFilter(CATEGORY_FILTER_ALL);
    setFormQty({});
    setDialogOpen(true);
  };

  const openEditDialogForDate = (date: string) => {
    setIsEditingExistingDate(true);
    setDialogDate(date);
    setCategoryFilter(CATEGORY_FILTER_ALL);
    const vals: Record<string, string> = {};
    (recordsByDate[date] || []).forEach((e) => {
      if (e.item_id) vals[e.item_id] = String(e.quantity);
    });
    setFormQty(vals);
    setDialogOpen(true);
  };

  const handleDialogSave = async () => {
    setSaving(true);
    try {
      const existingForDate = recordsByDate[dialogDate] || [];
      const existingByItemId: Record<string, EntryWithItem> = {};
      existingForDate.forEach((e) => {
        if (e.item_id) existingByItemId[e.item_id] = e;
      });

      const toUpsert: { item: StoreRequestItem; qty: number; existing?: EntryWithItem }[] = [];
      const toDelete: EntryWithItem[] = [];

      masterItems.forEach((item) => {
        const raw = formQty[item.id];
        const qty = raw ? parseInt(raw, 10) : 0;
        const existing = existingByItemId[item.id];
        if (qty > 0) {
          if (!existing || existing.quantity !== qty) {
            toUpsert.push({ item, qty, existing });
          }
        } else if (existing) {
          toDelete.push(existing);
        }
      });

      if (toUpsert.length === 0 && toDelete.length === 0) {
        toast({ title: 'Tidak ada perubahan', description: 'Isi minimal satu qty item' });
        setSaving(false);
        return;
      }

      let successCount = 0;
      let reviewCount = 0;
      let failCount = 0;

      for (const { item, qty, existing } of toUpsert) {
        try {
          let requestId: string;
          if (existing) {
            const { error } = await supabase.from('store_requests').update({ quantity: qty }).eq('id', existing.id);
            if (error) throw error;
            requestId = existing.id;
          } else {
            const { data, error } = await supabase
              .from('store_requests')
              .insert({
                request_number: `SR-${Date.now()}-${item.id.slice(0, 4)}`,
                item_id: item.id,
                item_name: item.name,
                category: item.category,
                quantity: qty,
                unit: item.unit,
                price: item.price,
                priority: 'normal',
                status: 'fulfilled',
                request_date: dialogDate,
                requested_by: profile?.id ?? null,
              })
              .select()
              .single();
            if (error) throw error;
            requestId = data.id;
          }
          const syncResult = await syncRequest(requestId);
          if (syncResult.needsReview) reviewCount += 1;
          else if (syncResult.success) successCount += 1;
          else failCount += 1;
        } catch (err) {
          console.error('Upsert item error:', item.name, err);
          failCount += 1;
        }
      }

      for (const existing of toDelete) {
        try {
          const { error } = await supabase.from('store_requests').delete().eq('id', existing.id);
          if (error) throw error;
          if (existing.item?.sheet_row != null && existing.synced_at) {
            await clearCell(existing.item.sheet_row, dialogDate);
          }
        } catch (err) {
          console.error('Delete item error:', existing.item_name, err);
        }
      }

      toast({
        title: 'Selesai',
        description: `${successCount} tersinkron, ${reviewCount} perlu review, ${failCount} gagal sync${toDelete.length ? `, ${toDelete.length} dihapus` : ''}`,
        variant: failCount > 0 ? 'destructive' : undefined,
      });

      setDialogOpen(false);
      fetchData();
    } catch (err) {
      console.error('Dialog save error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWholeRecord = async (date: string) => {
    const list = recordsByDate[date] || [];
    if (!window.confirm(`Hapus semua entry Store Request tanggal ${formatDateLabel(date)}? (${list.length} item)`)) return;
    try {
      const ids = list.map((e) => e.id);
      const { error } = await supabase.from('store_requests').delete().in('id', ids);
      if (error) throw error;
      await Promise.all(
        list.map((e) => (e.item?.sheet_row != null && e.synced_at ? clearCell(e.item.sheet_row, date) : Promise.resolve()))
      );
      toast({ title: 'Dihapus', description: `Semua entry tanggal ${formatDateLabel(date)} dihapus` });
      fetchData();
    } catch (err) {
      console.error('Delete record error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Store Requests"
        description="Riwayat input pemakaian barang harian, dikelompokkan per kategori"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            {canEdit && (
              <Button size="sm" onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" /> New Store Request
              </Button>
            )}
          </div>
        }
      />

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari tanggal atau item..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded bg-muted animate-pulse" />
          ))}
        </div>
      ) : sortedDates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Package className="h-10 w-10 mb-2 opacity-40" />
            <p>Belum ada Store Request yang tercatat</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedDates.map((date) => {
            const list = recordsByDate[date];
            const totalQty = list.reduce((s, e) => s + e.quantity, 0);
            const totalCost = list.reduce((s, e) => s + e.quantity * (e.price ?? 0), 0);
            const needsReviewCount = list.filter((e) => !e.item || e.item.sheet_row == null).length;
            const syncedCount = list.filter((e) => e.synced_at).length;
            const isExpanded = expandedDate === date;
            const catGroups = groupByCategory(list);

            return (
              <Card key={date}>
                <CardContent className="p-0">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors rounded-lg"
                    onClick={() => setExpandedDate(isExpanded ? null : date)}
                  >
                    <div className="flex items-center gap-4 flex-wrap">
                      <p className="font-medium text-sm">{formatDateLabel(date)}</p>
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">Items: {list.length}</Badge>
                        <Badge variant="outline" className="text-xs">Qty: {totalQty}</Badge>
                        <Badge variant="outline" className="text-xs">{formatRupiah(totalCost)}</Badge>
                        {needsReviewCount > 0 && (
                          <Badge variant="outline" className="text-xs bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30">
                            <AlertTriangle className="mr-1 h-3 w-3" /> Review: {needsReviewCount}
                          </Badge>
                        )}
                        {syncedCount === list.length && needsReviewCount === 0 ? (
                          <Badge variant="outline" className="text-xs bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                            Synced
                          </Badge>
                        ) : needsReviewCount === 0 ? (
                          <Badge variant="outline" className="text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                            {syncedCount}/{list.length} synced
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canEdit && (
                        <>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEditDialogForDate(date); }} title="Edit qty tanggal ini">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteWholeRecord(date); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t px-4 pb-4">
                      <div className="rounded-md border mt-3 overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Item</TableHead>
                              <TableHead>Unit</TableHead>
                              <TableHead className="text-right">Price</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead>Sync</TableHead>
                              {canEdit && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Object.entries(catGroups).map(([category, catEntries]) => (
                              <>
                                <TableRow key={`${date}-cat-${category}`} className="bg-muted/50">
                                  <TableCell colSpan={canEdit ? 6 : 5} className="font-semibold text-xs uppercase tracking-wide">
                                    {category}
                                  </TableCell>
                                </TableRow>
                                {catEntries.map((entry) => {
                                  const item = entry.item;
                                  const key = `${date}__${entry.item_id}`;
                                  const isEditing = editingKey === key;
                                  const needsReview = !item || item.sheet_row == null;
                                  return (
                                    <TableRow key={entry.id}>
                                      <TableCell>{entry.item_name}</TableCell>
                                      <TableCell className="text-sm text-muted-foreground">{entry.unit}</TableCell>
                                      <TableCell className="text-right">{formatRupiah(entry.price)}</TableCell>
                                      <TableCell className="text-right">
                                        {isEditing ? (
                                          <Input
                                            type="number"
                                            min={1}
                                            className="w-24 ml-auto text-right"
                                            value={inlineValue}
                                            onChange={(e) => setInlineValue(e.target.value)}
                                            placeholder="0"
                                          />
                                        ) : (
                                          <span className="font-medium">{entry.quantity}</span>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        {needsReview ? (
                                          <Badge variant="outline" className="text-xs bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30">
                                            <AlertTriangle className="mr-1 h-3 w-3" /> Needs review
                                          </Badge>
                                        ) : entry.synced_at ? (
                                          <Badge variant="outline" className="text-xs bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                                            Synced
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                                            Belum sync
                                          </Badge>
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
                                                  disabled={savingKey === key}
                                                  onClick={() => item && saveInlineEdit(date, item, entry)}
                                                >
                                                  {savingKey === key
                                                    ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                                    : <Check className="mr-1 h-3 w-3" />}
                                                  Save
                                                </Button>
                                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={cancelInlineEdit}>
                                                  Cancel
                                                </Button>
                                              </>
                                            ) : (
                                              <>
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-7 text-xs"
                                                  onClick={() => item && startInlineEdit(date, item, entry)}
                                                >
                                                  <Pencil className="mr-1 h-3 w-3" /> Edit
                                                </Button>
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-7 text-xs text-red-600 dark:text-red-400"
                                                  disabled={deletingKey === key}
                                                  onClick={() => item && deleteInlineEntry(date, item, entry)}
                                                >
                                                  {deletingKey === key
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
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New / Edit Record Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{isEditingExistingDate ? 'Edit Store Request' : 'New Store Request'}</DialogTitle>
            <DialogDescription>Isi jumlah pemakaian barang per item untuk tanggal yang dipilih</DialogDescription>
          </DialogHeader>

          <div className="flex gap-3 mb-2">
            <div className="space-y-1.5 flex-1">
              <label className="text-sm font-medium">Tanggal</label>
              <Input
                type="date"
                value={dialogDate}
                onChange={(e) => setDialogDate(e.target.value)}
                disabled={isEditingExistingDate}
              />
            </div>
          </div>

          <div className="space-y-1.5 mb-2">
            <label className="text-sm font-medium">Category</label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[220px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CATEGORY_FILTER_ALL}>All Categories</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right w-[100px]">Price</TableHead>
                  <TableHead className="text-right w-[110px]">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMasterItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm">{item.name}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{formatRupiah(item.price)}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={formQty[item.id] ?? ''}
                        onChange={(e) => setFormQty((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        className="h-8 text-right w-full"
                        placeholder="0"
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {visibleMasterItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground text-sm">
                      No items in this category
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleDialogSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditingExistingDate ? 'Update Record' : 'Save Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

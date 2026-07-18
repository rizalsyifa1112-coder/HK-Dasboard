'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  Search, RefreshCw, Plus, Shirt, Loader2, ChevronDown, ChevronUp,
  Pencil, Trash2, AlertTriangle, Filter, Check,
} from 'lucide-react';
import type { GeneralLaundryRecord, GeneralLaundryItem, GeneralLaundryRecordItem } from '@/lib/types';

type RecordItemWithLaundry = GeneralLaundryRecordItem & { laundry_item: GeneralLaundryItem };
type RecordWithItems = GeneralLaundryRecord & {
  items: RecordItemWithLaundry[];
};

// ⬅️ BARU: label & opsi untuk filter kategori di dalam dialog input
const CATEGORY_FILTER_OPTIONS = [
  { label: 'All Categories', value: 'all' },
  { label: 'Linen Room', value: 'room' },
  { label: 'Linen F&B', value: 'fnb' },
];

export default function GeneralLaundryPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [records, setRecords] = useState<RecordWithItems[]>([]);
  const [laundryItems, setLaundryItems] = useState<GeneralLaundryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RecordWithItems | null>(null);
  const [saving, setSaving] = useState(false);
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<Record<string, { qty_sent: number; qty_returned: number; price: number }>>({});
  const [categoryFilter, setCategoryFilter] = useState('all');

  // ⬅️ BARU: state khusus untuk input "Returned" inline di tabel utama (di luar dialog).
  // Draft ketikan disimpan per record-item id, dikirim ke database saat blur.
  const [returnDrafts, setReturnDrafts] = useState<Record<string, string>>({});
  const [savingReturnId, setSavingReturnId] = useState<string | null>(null);

  const canEdit = profile?.role === 'order_taker' || profile?.role === 'supervisor' || profile?.role === 'admin';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [recordsRes, itemsRes] = await Promise.all([
        supabase
          .from('general_laundry_records')
          .select('*, items:general_laundry_record_items(*, laundry_item:general_laundry_items(*))')
          .order('send_date', { ascending: false }),
        supabase.from('general_laundry_items').select('*').eq('active', true).order('name'),
      ]);
      setRecords((recordsRes.data as RecordWithItems[]) || []);
      setLaundryItems((itemsRes.data as GeneralLaundryItem[]) || []);
    } catch (err) {
      console.error('Error fetching general laundry:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const visibleLaundryItems = useMemo(() => {
    if (categoryFilter === 'all') return laundryItems;
    return laundryItems.filter((i) => i.category === categoryFilter);
  }, [laundryItems, categoryFilter]);

  const openCreate = () => {
    setEditingRecord(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormNotes('');
    setCategoryFilter('all');
    const defaults: Record<string, { qty_sent: number; qty_returned: number; price: number }> = {};
    laundryItems.forEach((i) => {
      defaults[i.id] = { qty_sent: 0, qty_returned: 0, price: i.default_price };
    });
    setFormItems(defaults);
    setDialogOpen(true);
  };

  const openEdit = (record: RecordWithItems) => {
    setEditingRecord(record);
    setFormDate(record.send_date);
    setFormNotes(record.notes ?? '');
    setCategoryFilter('all');
    const vals: Record<string, { qty_sent: number; qty_returned: number; price: number }> = {};
    laundryItems.forEach((i) => {
      const existing = record.items.find((ri) => ri.laundry_item_id === i.id);
      vals[i.id] = {
        qty_sent: existing?.qty_sent ?? 0,
        qty_returned: existing?.qty_returned ?? 0,
        price: existing?.price_per_item ?? i.default_price,
      };
    });
    setFormItems(vals);
    setDialogOpen(true);
  };

  const handleDelete = async (record: RecordWithItems) => {
    if (!confirm('Delete this laundry record?')) return;
    try {
      const { error } = await supabase.from('general_laundry_records').delete().eq('id', record.id);
      if (error) throw error;
      toast({ title: 'Deleted', description: 'Record deleted successfully' });
      fetchData();
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const activeItems = Object.entries(formItems).filter(([, v]) => v.qty_sent > 0);
      if (activeItems.length === 0) {
        toast({ title: 'Validation', description: 'Enter at least one item qty sent', variant: 'destructive' });
        setSaving(false);
        return;
      }

      let recordId: string;
      if (editingRecord) {
        const { error } = await supabase
          .from('general_laundry_records')
          .update({ send_date: formDate, notes: formNotes || null })
          .eq('id', editingRecord.id);
        if (error) throw error;
        await supabase.from('general_laundry_record_items').delete().eq('record_id', editingRecord.id);
        recordId = editingRecord.id;
      } else {
        const recNum = `GL-${Date.now()}`;
        const { data, error } = await supabase
          .from('general_laundry_records')
          .insert({ record_number: recNum, send_date: formDate, notes: formNotes || null, created_by: profile?.id ?? null })
          .select()
          .single();
        if (error) throw error;
        recordId = data.id;
      }

      const rows = activeItems.map(([laundry_item_id, v]) => ({
        record_id: recordId,
        laundry_item_id,
        qty_sent: v.qty_sent,
        qty_returned: v.qty_returned,
        price_per_item: v.price,
      }));
      const { error: itemsError } = await supabase.from('general_laundry_record_items').insert(rows);
      if (itemsError) throw itemsError;

      toast({ title: editingRecord ? 'Updated' : 'Created', description: 'Laundry record saved successfully' });
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      console.error('Save error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ⬅️ BARU: simpan qty returned langsung dari tabel utama (tanpa buka dialog Edit).
  // Update optimistic ke state lokal dulu (biar Missing & Subtotal langsung kerecalculate),
  // baru kirim ke database saat input di-blur.
  //
  // ⬅️ FIXED: `.map()` diberi anotasi tipe eksplisit `(r): RecordWithItems =>` dan
  // `(ri): RecordItemWithLaundry =>` supaya object literal hasil spread dicek langsung
  // terhadap target type. Tanpa ini, TypeScript salah menyimpulkan `laundry_item` jadi
  // nullable lagi (quirk pada spread dari intersection type), sehingga build gagal.
  const commitReturnQty = async (record: RecordWithItems, recordItem: RecordItemWithLaundry, rawValue: string) => {
    const newQty = Math.max(0, parseInt(rawValue, 10) || 0);

    // Bersihkan draft supaya tampilan kembali mengikuti data asli (yang sudah di-update)
    setReturnDrafts((prev) => {
      const next = { ...prev };
      delete next[recordItem.id];
      return next;
    });

    if (newQty === recordItem.qty_returned) return; // tidak berubah, tidak perlu simpan

    setSavingReturnId(recordItem.id);

    // Optimistic update ke state lokal
    setRecords((prev) =>
      prev.map((r): RecordWithItems =>
        r.id !== record.id
          ? r
          : {
              ...r,
              items: r.items.map((ri): RecordItemWithLaundry =>
                ri.id === recordItem.id ? { ...ri, qty_returned: newQty } : ri
              ),
            }
      )
    );

    try {
      const { error } = await supabase
        .from('general_laundry_record_items')
        .update({ qty_returned: newQty })
        .eq('id', recordItem.id);
      if (error) throw error;
    } catch (err) {
      console.error('Update returned qty error:', err);
      toast({ title: 'Error', description: 'Gagal menyimpan qty returned, silakan coba lagi', variant: 'destructive' });
      // Rollback optimistic update
      setRecords((prev) =>
        prev.map((r): RecordWithItems =>
          r.id !== record.id
            ? r
            : {
                ...r,
                items: r.items.map((ri): RecordItemWithLaundry =>
                  ri.id === recordItem.id ? { ...ri, qty_returned: recordItem.qty_returned } : ri
                ),
              }
        )
      );
    } finally {
      setSavingReturnId(null);
    }
  };

  const filtered = records.filter((r) =>
    r.record_number.toLowerCase().includes(search.toLowerCase()) ||
    r.send_date.includes(search)
  );

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

  const filledCountOutsideFilter = useMemo(() => {
    if (categoryFilter === 'all') return 0;
    return laundryItems.filter((i) => i.category !== categoryFilter && (formItems[i.id]?.qty_sent ?? 0) > 0).length;
  }, [laundryItems, categoryFilter, formItems]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Linen Laundry"
        description="Record linen items sent to and returned from laundry vendor"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            {canEdit && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> New Record
              </Button>
            )}
          </div>
        }
      />

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search record or date..."
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
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Shirt className="h-10 w-10 mb-2 opacity-40" />
            <p>No laundry records found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((record) => {
            const totalSent = record.items.reduce((s, i) => s + i.qty_sent, 0);
            const totalReturned = record.items.reduce((s, i) => s + i.qty_returned, 0);
            const totalMissing = totalSent - totalReturned;
            const totalCost = record.items.reduce((s, i) => s + i.qty_sent * i.price_per_item, 0);
            const isExpanded = expandedId === record.id;

            return (
              <Card key={record.id}>
                <CardContent className="p-0">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors rounded-lg"
                    onClick={() => setExpandedId(isExpanded ? null : record.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-medium text-sm">{new Date(record.send_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        <p className="text-xs text-muted-foreground font-mono">{record.record_number}</p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs">Sent: {totalSent}</Badge>
                        <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Returned: {totalReturned}</Badge>
                        {totalMissing > 0 && (
                          <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 border-red-500/30">
                            <AlertTriangle className="mr-1 h-3 w-3" /> Missing: {totalMissing}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">{formatCurrency(totalCost)}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canEdit && (
                        <>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(record); }} title="Edit lengkap (qty sent, tanggal, dll)">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(record); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t px-4 pb-4">
                      {record.notes && (
                        <p className="text-xs text-muted-foreground mt-3 mb-2 italic">{record.notes}</p>
                      )}
                      {canEdit && (
                        <p className="text-xs text-muted-foreground mt-3 mb-1">
                          Isi kolom <span className="font-medium">Returned</span> langsung di sini saat barang laundry kembali dari vendor.
                        </p>
                      )}
                      <div className="rounded-md border mt-1 overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Item</TableHead>
                              <TableHead className="text-right">Sent</TableHead>
                              <TableHead className="text-right w-[130px]">Returned</TableHead>
                              <TableHead className="text-right">Missing</TableHead>
                              <TableHead className="text-right">Price/Item</TableHead>
                              <TableHead className="text-right">Subtotal</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {record.items.map((ri) => {
                              const missing = ri.qty_sent - ri.qty_returned;
                              const draftValue = returnDrafts[ri.id];
                              const displayValue = draftValue !== undefined ? draftValue : String(ri.qty_returned || '');
                              return (
                                <TableRow key={ri.id}>
                                  <TableCell className="text-sm">{ri.laundry_item?.name ?? '-'}</TableCell>
                                  <TableCell className="text-right">{ri.qty_sent}</TableCell>
                                  <TableCell className="text-right">
                                    {canEdit ? (
                                      <div className="flex items-center justify-end gap-1.5">
                                        <Input
                                          type="number"
                                          min={0}
                                          value={displayValue}
                                          onChange={(e) =>
                                            setReturnDrafts((prev) => ({ ...prev, [ri.id]: e.target.value }))
                                          }
                                          onBlur={(e) => commitReturnQty(record, ri, e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                          }}
                                          className="h-8 text-right w-20"
                                          placeholder="0"
                                        />
                                        {savingReturnId === ri.id ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                        ) : (
                                          <Check className="h-3.5 w-3.5 text-transparent" />
                                        )}
                                      </div>
                                    ) : (
                                      ri.qty_returned
                                    )}
                                  </TableCell>
                                  <TableCell className={cn('text-right font-medium', missing > 0 && 'text-red-500')}>
                                    {missing > 0 ? `-${missing}` : '0'}
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground text-xs">{formatCurrency(ri.price_per_item)}</TableCell>
                                  <TableCell className="text-right text-sm font-medium">{formatCurrency(ri.qty_sent * ri.price_per_item)}</TableCell>
                                </TableRow>
                              );
                            })}
                            <TableRow className="bg-muted/30">
                              <TableCell colSpan={5} className="text-right font-semibold text-sm">Total</TableCell>
                              <TableCell className="text-right font-bold">{formatCurrency(totalCost)}</TableCell>
                            </TableRow>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingRecord ? 'Edit Laundry Record' : 'New Laundry Record'}</DialogTitle>
            <DialogDescription>Enter quantities sent and returned for each linen item</DialogDescription>
          </DialogHeader>

          <div className="flex gap-3 mb-2">
            <div className="space-y-1.5 flex-1">
              <Label>Send Date</Label>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label>Notes (optional)</Label>
              <Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>

          <div className="space-y-1.5 mb-2">
            <Label>Category</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[220px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_FILTER_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filledCountOutsideFilter > 0 && (
              <p className="text-xs text-amber-500">
                {filledCountOutsideFilter} item di kategori lain sudah diisi qty — tidak akan hilang saat disimpan.
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right w-[80px]">Price</TableHead>
                  <TableHead className="text-right w-[100px]">Qty Sent</TableHead>
                  <TableHead className="text-right w-[110px]">Qty Returned</TableHead>
                  <TableHead className="text-right w-[80px]">Missing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleLaundryItems.map((item) => {
                  const v = formItems[item.id] ?? { qty_sent: 0, qty_returned: 0, price: item.default_price };
                  const missing = v.qty_sent - v.qty_returned;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm">{item.name}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatCurrency(v.price)}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={v.qty_sent || ''}
                          onChange={(e) => setFormItems((prev) => ({
                            ...prev,
                            [item.id]: { ...v, qty_sent: parseInt(e.target.value, 10) || 0 },
                          }))}
                          className="h-8 text-right w-full"
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={v.qty_returned || ''}
                          onChange={(e) => setFormItems((prev) => ({
                            ...prev,
                            [item.id]: { ...v, qty_returned: parseInt(e.target.value, 10) || 0 },
                          }))}
                          className="h-8 text-right w-full"
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell className={cn('text-right font-medium text-sm', missing > 0 && v.qty_sent > 0 && 'text-red-500')}>
                        {v.qty_sent > 0 && missing > 0 ? `-${missing}` : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {visibleLaundryItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                      No items in this category
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingRecord ? 'Update' : 'Save Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

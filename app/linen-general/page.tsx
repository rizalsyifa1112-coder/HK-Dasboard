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
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Search, RefreshCw, Plus, Layers, Loader2, Pencil, Trash2 } from 'lucide-react';
import type { GeneralLaundryItem } from '@/lib/types';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

const CATEGORY_OPTIONS = [
  { label: 'Linen Room', value: 'room' },
  { label: 'Linen F&B', value: 'fnb' },
];

export default function LinenGeneralPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<GeneralLaundryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GeneralLaundryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', unit: 'pcs', default_price: '', category: 'room' });

  const canEdit = profile?.role === 'admin';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('general_laundry_items').select('*').order('name');
      if (error) throw error;
      setItems((data as GeneralLaundryItem[]) || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.code.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditingItem(null);
    setForm({ name: '', code: '', unit: 'pcs', default_price: '', category: 'room' });
    setDialogOpen(true);
  };

  const openEdit = (item: GeneralLaundryItem) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      code: item.code,
      unit: item.unit,
      default_price: String(item.default_price),
      category: 'room',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (item: GeneralLaundryItem) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    try {
      const { error } = await supabase.from('general_laundry_items').delete().eq('id', item.id);
      if (error) throw error;
      toast({ title: 'Deleted' });
      fetchData();
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.code) {
      toast({ title: 'Validation', description: 'Name and Code are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        code: form.code.toUpperCase(),
        unit: form.unit,
        default_price: parseFloat(form.default_price) || 0,
      };
      if (editingItem) {
        const { error } = await supabase.from('general_laundry_items').update(payload).eq('id', editingItem.id);
        if (error) throw error;
        toast({ title: 'Updated' });
      } else {
        const { error } = await supabase.from('general_laundry_items').insert(payload);
        if (error) throw error;
        toast({ title: 'Created' });
      }
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Linen General"
        description="Master data for all linen items used in General Laundry"
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

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search item..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Default Price</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="font-mono text-sm">{item.code}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.default_price)}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(item)}>
                          <Trash2 className="h-3.5 w-3.5" />
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
            <DialogTitle>{editingItem ? 'Edit Item' : 'Add Linen Item'}</DialogTitle>
            <DialogDescription>Master data for General Laundry</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bath Towel" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input id="code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="LR-BT" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="unit">Unit</Label>
                <Input id="unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price">Default Price (IDR)</Label>
                <Input id="price" type="number" min={0} value={form.default_price} onChange={(e) => setForm({ ...form, default_price: e.target.value })} placeholder="3250" />
              </div>
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

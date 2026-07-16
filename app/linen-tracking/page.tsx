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
import {
  Search, RefreshCw, Download, Plus, Filter, Layers, Loader2, Pencil,
} from 'lucide-react';
import { type LinenInventory } from '@/lib/types';

const LINEN_CATEGORY_LABELS: Record<LinenInventory['category'], string> = {
  bed_linen: 'Bed Linen',
  bath_linen: 'Bath Linen',
  table_linen: 'Table Linen',
  uniform: 'Uniform',
  other: 'Other',
};

const LINEN_CATEGORY_COLORS: Record<LinenInventory['category'], string> = {
  bed_linen: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  bath_linen: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  table_linen: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  uniform: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
  other: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30',
};

const emptyForm = {
  item_name: '',
  category: 'bed_linen' as LinenInventory['category'],
  quantity_in_stock: '',
  quantity_in_use: '',
  quantity_dirty: '',
  quantity_damaged: '',
  par_level: '',
  unit: 'pcs',
};

export default function LinenTrackingPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<LinenInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LinenInventory | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const canEdit = profile?.role === 'admin' || profile?.role === 'supervisor';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('linen_inventory')
        .select('*')
        .order('item_name');
      if (error) throw error;
      setItems((data as LinenInventory[]) || []);
    } catch (err) {
      console.error('Error fetching linen inventory:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = items.filter((i) => {
    const matchSearch = i.item_name.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === 'all' || i.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const lowStockCount = items.filter((i) => i.quantity_in_stock < i.par_level).length;

  const openCreate = () => {
    setEditingItem(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (item: LinenInventory) => {
    setEditingItem(item);
    setForm({
      item_name: item.item_name,
      category: item.category,
      quantity_in_stock: String(item.quantity_in_stock),
      quantity_in_use: String(item.quantity_in_use),
      quantity_dirty: String(item.quantity_dirty),
      quantity_damaged: String(item.quantity_damaged),
      par_level: String(item.par_level),
      unit: item.unit,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.item_name) {
      toast({ title: 'Validation', description: 'Item name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        item_name: form.item_name,
        category: form.category,
        quantity_in_stock: parseInt(form.quantity_in_stock, 10) || 0,
        quantity_in_use: parseInt(form.quantity_in_use, 10) || 0,
        quantity_dirty: parseInt(form.quantity_dirty, 10) || 0,
        quantity_damaged: parseInt(form.quantity_damaged, 10) || 0,
        par_level: parseInt(form.par_level, 10) || 0,
        unit: form.unit,
      };
      if (editingItem) {
        const { error } = await supabase.from('linen_inventory').update(payload).eq('id', editingItem.id);
        if (error) throw error;
        toast({ title: 'Updated', description: 'Linen item updated successfully' });
      } else {
        const { error } = await supabase.from('linen_inventory').insert(payload);
        if (error) throw error;
        toast({ title: 'Created', description: 'Linen item created successfully' });
      }
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      console.error('Save error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Linen Tracking"
        description="Track linen inventory levels and par levels"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" /> Sync Spreadsheet
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
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="px-3 py-1.5 text-xs">
          Total Items: {items.length}
        </Badge>
        <Badge
          variant="outline"
          className={cn('px-3 py-1.5 text-xs', lowStockCount > 0 && 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30')}
        >
          Low Stock: {lowStockCount}
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search item name..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {(Object.keys(LINEN_CATEGORY_LABELS) as LinenInventory['category'][]).map((c) => (
              <SelectItem key={c} value={c}>{LINEN_CATEGORY_LABELS[c]}</SelectItem>
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
            <Layers className="h-10 w-10 mb-2 opacity-40" />
            <p>No linen items found matching your filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">In Stock</TableHead>
                <TableHead className="text-right">In Use</TableHead>
                <TableHead className="text-right">Dirty</TableHead>
                <TableHead className="text-right">Damaged</TableHead>
                <TableHead className="text-right">Par Level</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((i) => {
                const isLow = i.quantity_in_stock < i.par_level;
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.item_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-xs', LINEN_CATEGORY_COLORS[i.category])}>
                        {LINEN_CATEGORY_LABELS[i.category]}
                      </Badge>
                    </TableCell>
                    <TableCell className={cn('text-right font-medium', isLow && 'text-red-600 dark:text-red-400')}>
                      {i.quantity_in_stock}
                    </TableCell>
                    <TableCell className="text-right">{i.quantity_in_use}</TableCell>
                    <TableCell className="text-right">{i.quantity_dirty}</TableCell>
                    <TableCell className="text-right">{i.quantity_damaged}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{i.par_level}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{i.unit}</TableCell>
                    <TableCell>
                      {isLow ? (
                        <Badge variant="outline" className="text-xs bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30">
                          Low Stock
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                          OK
                        </Badge>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(i)}>
                          <Pencil className="mr-1 h-3 w-3" /> Edit
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Linen Item' : 'Add Linen Item'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Update linen inventory details' : 'Create a new linen inventory item'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="item_name">Item Name</Label>
              <Input
                id="item_name"
                value={form.item_name}
                onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                placeholder="King Bed Sheets"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v as LinenInventory['category'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LINEN_CATEGORY_LABELS) as LinenInventory['category'][]).map((c) => (
                    <SelectItem key={c} value={c}>{LINEN_CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="quantity_in_stock">In Stock</Label>
                <Input
                  id="quantity_in_stock"
                  type="number"
                  min={0}
                  value={form.quantity_in_stock}
                  onChange={(e) => setForm({ ...form, quantity_in_stock: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quantity_in_use">In Use</Label>
                <Input
                  id="quantity_in_use"
                  type="number"
                  min={0}
                  value={form.quantity_in_use}
                  onChange={(e) => setForm({ ...form, quantity_in_use: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quantity_dirty">Dirty</Label>
                <Input
                  id="quantity_dirty"
                  type="number"
                  min={0}
                  value={form.quantity_dirty}
                  onChange={(e) => setForm({ ...form, quantity_dirty: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quantity_damaged">Damaged</Label>
                <Input
                  id="quantity_damaged"
                  type="number"
                  min={0}
                  value={form.quantity_damaged}
                  onChange={(e) => setForm({ ...form, quantity_damaged: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="par_level">Par Level</Label>
                <Input
                  id="par_level"
                  type="number"
                  min={0}
                  value={form.par_level}
                  onChange={(e) => setForm({ ...form, par_level: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="pcs"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingItem ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

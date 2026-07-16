'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Pencil, Trash2, Search, Download, Loader2 } from 'lucide-react';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea';
  required?: boolean;
  options?: { label: string; value: string }[];
  placeholder?: string;
  defaultValue?: string | number;
}

interface CrudTableProps<T extends { id: string }> {
  tableName: string;
  title: string;
  description: string;
  columns: Column<T>[];
  fields: FieldDef[];
  data: T[];
  loading: boolean;
  onRefresh: () => void;
  canEdit?: boolean;
  searchKeys?: (keyof T)[];
}

export function CrudTable<T extends { id: string }>({
  tableName, title, description, columns, fields, data, loading, onRefresh, canEdit = true, searchKeys = [],
}: CrudTableProps<T>) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string | number>>({});

  const openCreate = () => {
    const defaults: Record<string, string | number> = {};
    fields.forEach((f) => { if (f.defaultValue !== undefined) defaults[f.key] = f.defaultValue; });
    setForm(defaults);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (row: T) => {
    const values: Record<string, string | number> = {};
    fields.forEach((f) => {
      const val = (row as Record<string, unknown>)[f.key];
      values[f.key] = (typeof val === 'number' ? val : (val as string) ?? '') as string | number;
    });
    setForm(values);
    setEditingId(row.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      fields.forEach((f) => {
        const val = form[f.key];
        if (f.type === 'number') {
          payload[f.key] = val === '' ? null : Number(val);
        } else {
          payload[f.key] = val || null;
        }
      });

      if (editingId) {
        const { error } = await supabase.from(tableName).update(payload).eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Updated', description: `${title} updated successfully` });
      } else {
        const { error } = await supabase.from(tableName).insert(payload);
        if (error) throw error;
        toast({ title: 'Created', description: `${title} created successfully` });
      }
      setDialogOpen(false);
      onRefresh();
    } catch (err) {
      console.error('Save error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: T) => {
    if (!confirm(`Delete this ${title.toLowerCase()}?`)) return;
    try {
      const { error } = await supabase.from(tableName).delete().eq('id', row.id);
      if (error) throw error;
      toast({ title: 'Deleted', description: `${title} deleted successfully` });
      onRefresh();
    } catch (err) {
      console.error('Delete error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const filtered = search && searchKeys.length > 0
    ? data.filter((row) =>
        searchKeys.some((key) =>
          String(row[key] ?? '').toLowerCase().includes(search.toLowerCase())
        )
      )
    : data;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" /> Sync
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Add {title.replace(/s$/, '')}
            </Button>
          </div>
        )}
      </div>

      {searchKeys.length > 0 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            <p>No data found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.key} className={col.className}>{col.label}</TableHead>
                ))}
                {canEdit && <TableHead className="w-[80px] text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '-')}
                    </TableCell>
                  ))}
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(row)}>
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
            <DialogTitle>{editingId ? `Edit ${title.replace(/s$/, '')}` : `Add ${title.replace(/s$/, '')}`}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update the details below' : 'Fill in the details below'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={field.key}>{field.label}</Label>
                {field.type === 'textarea' ? (
                  <textarea
                    id={field.key}
                    className="flex h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={String(form[field.key] ?? '')}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                  />
                ) : field.type === 'select' ? (
                  <select
                    id={field.key}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={String(form[field.key] ?? '')}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={field.key}
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={String(form[field.key] ?? '')}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    required={field.required}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

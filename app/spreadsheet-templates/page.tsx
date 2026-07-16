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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  Search, RefreshCw, Loader2, ShieldAlert, Plus, Pencil, Trash2,
  FileSpreadsheet, Clock, CheckCircle2, Table2,
} from 'lucide-react';
import type { SpreadsheetTemplate } from '@/lib/types';

const MODULES = [
  'dashboard', 'room-status', 'assignments', 'inspection', 'laundry',
  'linen-tracking', 'store-request', 'loan-management', 'reports', 'activity-logs',
] as const;
type ModuleKey = (typeof MODULES)[number];

const FORMATS = ['google_sheets', 'excel_online', 'csv', 'xlsx'] as const;
type FormatKey = (typeof FORMATS)[number];

const SCHEDULES = ['hourly', 'daily', 'weekly', 'manual'] as const;
type ScheduleKey = (typeof SCHEDULES)[number];

const FORMAT_LABELS: Record<FormatKey, string> = {
  google_sheets: 'Google Sheets',
  excel_online: 'Excel Online',
  csv: 'CSV',
  xlsx: 'XLSX',
};

const FORMAT_BADGE: Record<FormatKey, string> = {
  google_sheets: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
  excel_online: 'border-blue-500/30 text-blue-600 dark:text-blue-400',
  csv: 'border-slate-500/30 text-slate-600 dark:text-slate-400',
  xlsx: 'border-amber-500/30 text-amber-600 dark:text-amber-400',
};

const SCHEDULE_LABELS: Record<ScheduleKey, string> = {
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
  manual: 'Manual',
};

interface FormState {
  name: string;
  module: ModuleKey;
  format: FormatKey;
  sync_schedule: ScheduleKey;
  config: string; // raw JSON string
}

const EMPTY_FORM: FormState = {
  name: '',
  module: 'dashboard',
  format: 'google_sheets',
  sync_schedule: 'manual',
  config: '{\n  "columns": []\n}',
};

export default function SpreadsheetTemplatesPage() {
  const { profile: currentUser } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<SpreadsheetTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SpreadsheetTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<SpreadsheetTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('spreadsheet_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTemplates((data as SpreadsheetTemplate[]) || []);
    } catch (err) {
      console.error('Error fetching templates:', err);
      toast({
        title: 'Error',
        description: 'Failed to load spreadsheet templates',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Admin-only guard (same pattern as users page)
  if (currentUser?.role !== 'admin') {
    return (
      <div className="p-4 md:p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ShieldAlert className="h-12 w-12 text-destructive mb-3" />
            <h3 className="text-lg font-semibold">Access Denied</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Only administrators can manage spreadsheet templates.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filtered = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase().trim()) ||
      t.module.toLowerCase().includes(search.toLowerCase().trim())
  );

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (tpl: SpreadsheetTemplate) => {
    setEditing(tpl);
    setForm({
      name: tpl.name,
      module: (MODULES as readonly string[]).includes(tpl.module)
        ? (tpl.module as ModuleKey)
        : 'dashboard',
      format: (FORMATS as readonly string[]).includes(tpl.format)
        ? (tpl.format as FormatKey)
        : 'google_sheets',
      sync_schedule: tpl.sync_schedule && (SCHEDULES as readonly string[]).includes(tpl.sync_schedule)
        ? (tpl.sync_schedule as ScheduleKey)
        : 'manual',
      config: tpl.config ? JSON.stringify(tpl.config, null, 2) : EMPTY_FORM.config,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Validation', description: 'Name is required', variant: 'destructive' });
      return;
    }
    // Validate JSON config
    let parsedConfig: Record<string, unknown> = {};
    if (form.config.trim()) {
      try {
        parsedConfig = JSON.parse(form.config);
      } catch {
        toast({
          title: 'Invalid JSON',
          description: 'Config must be valid JSON',
          variant: 'destructive',
        });
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        module: form.module,
        format: form.format,
        sync_schedule: form.sync_schedule,
        config: parsedConfig,
      };

      if (editing) {
        const { error } = await supabase
          .from('spreadsheet_templates')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Updated', description: 'Template updated successfully' });
      } else {
        const { error } = await supabase
          .from('spreadsheet_templates')
          .insert({ ...payload, created_by: currentUser?.id ?? null });
        if (error) throw error;
        toast({ title: 'Created', description: 'Template created successfully' });
      }

      setDialogOpen(false);
      fetchTemplates();
    } catch (err) {
      console.error('Save error:', err);
      toast({
        title: 'Error',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('spreadsheet_templates')
        .delete()
        .eq('id', deleteTarget.id);
      if (error) throw error;
      toast({ title: 'Deleted', description: 'Template deleted successfully' });
      setDeleteTarget(null);
      fetchTemplates();
    } catch (err) {
      console.error('Delete error:', err);
      toast({
        title: 'Error',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleSync = (tpl: SpreadsheetTemplate) => {
    toast({
      title: 'Sync queued',
      description: `Syncing "${tpl.name}" to ${FORMAT_LABELS[tpl.format]} (demo).`,
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Spreadsheet Templates"
        description="Configure spreadsheet sync templates for each module"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchTemplates} disabled={loading}>
              <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Add Template
            </Button>
          </div>
        }
      />

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search templates…"
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileSpreadsheet className="h-10 w-10 mb-2 opacity-40" />
            <p className="text-sm">No spreadsheet templates found</p>
            <p className="text-xs mt-1">Create a template to start syncing data</p>
            <Button size="sm" className="mt-3" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Add Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Sync Schedule</TableHead>
                <TableHead>Last Synced</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tpl) => {
                const formatKey = (FORMATS as readonly string[]).includes(tpl.format)
                  ? (tpl.format as FormatKey)
                  : 'csv';
                const scheduleKey =
                  tpl.sync_schedule && (SCHEDULES as readonly string[]).includes(tpl.sync_schedule)
                    ? (tpl.sync_schedule as ScheduleKey)
                    : 'manual';
                return (
                  <TableRow key={tpl.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Table2 className="h-4 w-4 text-primary" />
                        </div>
                        {tpl.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground capitalize">
                        {tpl.module.replace(/-/g, ' ')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-xs', FORMAT_BADGE[formatKey])}>
                        {FORMAT_LABELS[formatKey]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {SCHEDULE_LABELS[scheduleKey]}
                      </div>
                    </TableCell>
                    <TableCell>
                      {tpl.last_synced_at ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          {new Date(tpl.last_synced_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleSync(tpl)}>
                          Sync
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(tpl)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(tpl)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Template' : 'Add Template'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update spreadsheet sync template configuration'
                : 'Create a new spreadsheet sync template'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Daily Room Status Sync"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Module</Label>
                <Select
                  value={form.module}
                  onValueChange={(v) => setForm({ ...form, module: v as ModuleKey })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODULES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m.replace(/-/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Format</Label>
                <Select
                  value={form.format}
                  onValueChange={(v) => setForm({ ...form, format: v as FormatKey })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMATS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {FORMAT_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Sync Schedule</Label>
              <Select
                value={form.sync_schedule}
                onValueChange={(v) => setForm({ ...form, sync_schedule: v as ScheduleKey })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SCHEDULE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-config">Config (JSON)</Label>
              <Textarea
                id="tpl-config"
                value={form.config}
                onChange={(e) => setForm({ ...form, config: e.target.value })}
                rows={6}
                className="font-mono text-xs"
                placeholder={'{\n  "columns": ["number", "status"],\n  "column_names": { "number": "Room" }\n}'}
              />
              <p className="text-xs text-muted-foreground">
                Stored as-is. Must be valid JSON.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the template
              {deleteTarget ? ` "${deleteTarget.name}"` : ''}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className={cn(deleting && 'opacity-70')}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

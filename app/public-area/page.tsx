'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import {
  PUBLIC_AREA_STATUS_LABELS,
  PUBLIC_AREA_STATUS_COLORS,
  type PublicAreaTask,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  ClipboardCheck, Plus, RefreshCw, ChevronLeft, ChevronRight, Loader2,
} from 'lucide-react';

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, delta: number) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default function PublicAreaPage() {
  const { profile } = useAuth();
  const role = profile?.role;
  const isManager = role === 'admin' || role === 'supervisor';

  const [date, setDate] = useState(todayStr());
  const [tasks, setTasks] = useState<PublicAreaTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ kategori: '', zone: '', item_pekerjaan: '' });
  const [savingManual, setSavingManual] = useState(false);

  const loadTasks = useCallback(async (targetDate: string) => {
    setLoading(true);
    try {
      // pastikan task hasil generate otomatis sudah ada untuk tanggal ini
      await supabase.rpc('generate_public_area_tasks', { p_date: targetDate });

      const { data, error } = await supabase
        .from('public_area_tasks')
        .select('*, staff:profiles!staff_id(*)')
        .eq('task_date', targetDate)
        .order('kategori', { ascending: true })
        .order('zone', { ascending: true });

      if (error) throw error;
      setTasks((data as PublicAreaTask[]) || []);
    } catch (err) {
      console.error('Failed to load public area tasks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks(date);
  }, [date, loadTasks]);

  const grouped = useMemo(() => {
    const map = new Map<string, PublicAreaTask[]>();
    for (const t of tasks) {
      const list = map.get(t.kategori) ?? [];
      list.push(t);
      map.set(t.kategori, list);
    }
    return Array.from(map.entries());
  }, [tasks]);

  const summary = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'completed').length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    return { total, done, inProgress, pending: total - done - inProgress };
  }, [tasks]);

  async function claimTask(task: PublicAreaTask) {
    if (!profile) return;
    setSavingId(task.id);
    try {
      const { error } = await supabase
        .from('public_area_tasks')
        .update({ status: 'in_progress', staff_id: profile.id, claimed_at: new Date().toISOString() })
        .eq('id', task.id);
      if (error) throw error;
      await loadTasks(date);
    } catch (err) {
      console.error('Failed to claim task:', err);
    } finally {
      setSavingId(null);
    }
  }

  async function completeTask(task: PublicAreaTask) {
    setSavingId(task.id);
    try {
      const { error } = await supabase
        .from('public_area_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          notes: noteDraft[task.id] ?? task.notes,
        })
        .eq('id', task.id);
      if (error) throw error;
      await loadTasks(date);
    } catch (err) {
      console.error('Failed to complete task:', err);
    } finally {
      setSavingId(null);
    }
  }

  async function resetTask(task: PublicAreaTask) {
    if (!isManager) return;
    setSavingId(task.id);
    try {
      const { error } = await supabase
        .from('public_area_tasks')
        .update({ status: 'pending', staff_id: null, claimed_at: null, completed_at: null })
        .eq('id', task.id);
      if (error) throw error;
      await loadTasks(date);
    } catch (err) {
      console.error('Failed to reset task:', err);
    } finally {
      setSavingId(null);
    }
  }

  async function addManualTask() {
    if (!profile || !manualForm.kategori || !manualForm.zone || !manualForm.item_pekerjaan) return;
    setSavingManual(true);
    try {
      const { error } = await supabase.from('public_area_tasks').insert({
        task_date: date,
        kategori: manualForm.kategori,
        zone: manualForm.zone,
        item_pekerjaan: manualForm.item_pekerjaan,
        status: 'pending',
        is_manual: true,
        created_by: profile.id,
      });
      if (error) throw error;
      setManualForm({ kategori: '', zone: '', item_pekerjaan: '' });
      setManualOpen(false);
      await loadTasks(date);
    } catch (err) {
      console.error('Failed to add manual task:', err);
    } finally {
      setSavingManual(false);
    }
  }

  async function syncToSheet() {
    setSyncing(true);
    try {
      const res = await fetch('/api/public-area/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadTasks(date);
    } catch (err) {
      console.error('Failed to sync spreadsheet:', err);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Public Area Task</h2>
          <p className="text-sm text-muted-foreground">
            Daftar pekerjaan Public Area untuk tanggal terpilih
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isManager && (
            <Button variant="outline" onClick={syncToSheet} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sync Spreadsheet
            </Button>
          )}
          {isManager && (
            <Dialog open={manualOpen} onOpenChange={setManualOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Task Manual
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Tambah Task Manual</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <Input
                    placeholder="Kategori (mis. Taman & Garden)"
                    value={manualForm.kategori}
                    onChange={(e) => setManualForm((f) => ({ ...f, kategori: e.target.value }))}
                  />
                  <Input
                    placeholder="Zone (mis. Lobby & Sakecca)"
                    value={manualForm.zone}
                    onChange={(e) => setManualForm((f) => ({ ...f, zone: e.target.value }))}
                  />
                  <Textarea
                    placeholder="Item pekerjaan"
                    value={manualForm.item_pekerjaan}
                    onChange={(e) => setManualForm((f) => ({ ...f, item_pekerjaan: e.target.value }))}
                  />
                </div>
                <DialogFooter>
                  <Button onClick={addManualTask} disabled={savingManual}>
                    {savingManual && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Simpan
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Date navigator */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setDate((d) => addDays(d, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
        />
        <Button variant="outline" size="icon" onClick={() => setDate((d) => addDays(d, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {date !== todayStr() && (
          <Button variant="ghost" size="sm" onClick={() => setDate(todayStr())}>
            Hari ini
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Task</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{summary.total}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Belum Dikerjakan</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{summary.pending}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Sedang Dikerjakan</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{summary.inProgress}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Selesai</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{summary.done}</CardContent></Card>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Memuat task...
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ClipboardCheck className="h-10 w-10 mb-2 opacity-40" />
          <p>Tidak ada task untuk tanggal ini</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([kategori, items]) => (
            <div key={kategori}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">{kategori}</h3>
              <div className="space-y-2">
                {items.map((task) => {
                  const isMine = task.staff_id === profile?.id;
                  const canClaim = task.status === 'pending';
                  const canComplete = task.status === 'in_progress' && (isMine || isManager);
                  return (
                    <Card key={task.id} className="p-4">
                      <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{task.zone}</Badge>
                            <Badge variant="outline" className={cn('text-[10px]', PUBLIC_AREA_STATUS_COLORS[task.status])}>
                              {PUBLIC_AREA_STATUS_LABELS[task.status]}
                            </Badge>
                            {task.is_manual && <Badge variant="outline" className="text-[10px]">Manual</Badge>}
                          </div>
                          <p className="text-sm mt-1">{task.item_pekerjaan}</p>
                          {task.staff?.full_name && (
                            <p className="text-xs text-muted-foreground mt-1">
                              PIC: {task.staff.full_name}
                            </p>
                          )}
                          {task.status === 'in_progress' && (isMine || isManager) && (
                            <Textarea
                              placeholder="Catatan (opsional)"
                              defaultValue={task.notes ?? ''}
                              onChange={(e) => setNoteDraft((d) => ({ ...d, [task.id]: e.target.value }))}
                              className="mt-2 text-xs"
                              rows={2}
                            />
                          )}
                          {task.status === 'completed' && task.notes && (
                            <p className="text-xs text-muted-foreground mt-1 italic">"{task.notes}"</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {canClaim && (
                            <Button size="sm" onClick={() => claimTask(task)} disabled={savingId === task.id}>
                              {savingId === task.id && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                              Ambil & Mulai
                            </Button>
                          )}
                          {canComplete && (
                            <Button size="sm" variant="default" onClick={() => completeTask(task)} disabled={savingId === task.id}>
                              {savingId === task.id && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                              Tandai Selesai
                            </Button>
                          )}
                          {isManager && task.status !== 'pending' && (
                            <Button size="sm" variant="ghost" onClick={() => resetTask(task)} disabled={savingId === task.id}>
                              Reset
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

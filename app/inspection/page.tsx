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
  Search, RefreshCw, Download, Plus, ClipboardCheck, Loader2, CheckCircle2,
} from 'lucide-react';
import { type Inspection, type Room, type Profile } from '@/lib/types';

// ⬅️ BARU: helper untuk hitung batas "hari ini" berdasarkan zona waktu WIB (UTC+7),
// sama persis seperti di halaman Assignments — supaya panel Inspection juga
// "reset" otomatis tiap ganti hari jam 00:00 WIB, bukan ikut jam server (UTC).
// Data lama TIDAK dihapus, cuma tidak ditampilkan — tetap bisa ditelusuri per
// tanggal langsung dari database kapan pun dibutuhkan (mis. laporan bulanan).
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function getTodayRangeWIB() {
  const nowWIB = new Date(Date.now() + WIB_OFFSET_MS);
  const y = nowWIB.getUTCFullYear();
  const m = nowWIB.getUTCMonth();
  const d = nowWIB.getUTCDate();

  const todayStart = new Date(Date.UTC(y, m, d, 0, 0, 0) - WIB_OFFSET_MS);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  return { todayStart, todayEnd };
}

const INSPECTION_STATUS_LABELS: Record<Inspection['status'], string> = {
  pending: 'Pending',
  passed: 'Passed',
  failed: 'Failed',
  needs_attention: 'Needs Attention',
};

const INSPECTION_STATUS_COLORS: Record<Inspection['status'], string> = {
  pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  passed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  failed: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  needs_attention: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
};

export default function InspectionPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [inspectors, setInspectors] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    room_id: '',
    status: 'pending' as Inspection['status'],
    score: '',
    notes: '',
  });

  const canEdit = profile?.role === 'admin' || profile?.role === 'supervisor';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // ⬅️ BARU: hanya inspeksi hari ini (WIB)
      const { todayStart, todayEnd } = getTodayRangeWIB();

      const [inspRes, roomsRes, profRes] = await Promise.all([
        supabase
          .from('inspections')
          .select('*, room:rooms(*), inspector:profiles(*)')
          .gte('created_at', todayStart.toISOString())
          .lt('created_at', todayEnd.toISOString())
          .order('created_at', { ascending: false }),
        supabase.from('rooms').select('*').order('number'),
        supabase.from('profiles').select('*').eq('active', true).order('full_name'),
      ]);

      setInspections((inspRes.data as Inspection[]) || []);
      setRooms((roomsRes.data as Room[]) || []);
      setInspectors((profRes.data as Profile[]) || []);
    } catch (err) {
      console.error('Error fetching inspections:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = inspections.filter((i) => {
    const roomNum = i.room?.number ?? '';
    const inspectorName = i.inspector?.full_name ?? '';
    return (
      roomNum.toLowerCase().includes(search.toLowerCase()) ||
      inspectorName.toLowerCase().includes(search.toLowerCase())
    );
  });

  const handleCreate = async () => {
    if (!form.room_id) {
      toast({ title: 'Validation', description: 'Please select a room', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const score = form.score ? parseInt(form.score, 10) : null;
      if (score !== null && (score < 0 || score > 100)) {
        toast({ title: 'Validation', description: 'Score must be between 0 and 100', variant: 'destructive' });
        setSaving(false);
        return;
      }
      const { error } = await supabase.from('inspections').insert({
        room_id: form.room_id,
        inspector_id: profile?.id ?? null,
        status: form.status,
        score,
        notes: form.notes || null,
        checklist: {},
        inspected_at: form.status !== 'pending' ? new Date().toISOString() : null,
      });
      if (error) throw error;
      toast({ title: 'Created', description: 'Inspection created successfully' });
      setDialogOpen(false);
      setForm({ room_id: '', status: 'pending', score: '', notes: '' });
      fetchData();
    } catch (err) {
      console.error('Create error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // 1 tombol untuk approve inspeksi pending + finalisasi status kamar
  const handleRelease = async (inspection: Inspection) => {
    setReleasingId(inspection.id);
    try {
      const { error: inspErr } = await supabase
        .from('inspections')
        .update({
          status: 'passed',
          inspector_id: profile?.id ?? null,
          inspected_at: new Date().toISOString(),
        })
        .eq('id', inspection.id);
      if (inspErr) throw inspErr;

      const { error: roomErr } = await supabase
        .from('rooms')
        .update({ housekeeping_status: 'vacant_clean' })
        .eq('id', inspection.room_id);
      if (roomErr) throw roomErr;

      // ⬅️ BARU: cari assignment yang menghasilkan inspeksi pending ini — yaitu
      // assignment completed terakhir untuk kamar ini yang status finalnya masih
      // "vacant_clean_unchecked" (VCU, belum final). Lalu update status finalnya
      // jadi "vacant_clean" (VC) dan re-sync ke spreadsheet supaya baris yang
      // sudah pernah ditulis saat Finish Cleaning ikut ter-update — bukan malah
      // menambah baris duplikat baru.
      const { data: relatedAssignment, error: findErr } = await supabase
        .from('assignments')
        .select('*')
        .eq('room_id', inspection.room_id)
        .eq('status', 'completed')
        .eq('hk_status_final', 'vacant_clean_unchecked')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findErr) {
        console.error('Failed to find related assignment for sync:', findErr);
      }

      if (relatedAssignment) {
        const { error: updateAssignErr } = await supabase
          .from('assignments')
          .update({ hk_status_final: 'vacant_clean' })
          .eq('id', relatedAssignment.id);

        if (updateAssignErr) {
          console.error('Failed to update assignment hk_status_final:', updateAssignErr);
        } else {
          try {
            await fetch('/api/sync-assignment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ assignmentId: relatedAssignment.id }),
            });
          } catch (syncErr) {
            console.error('Re-sync to sheet failed:', syncErr);
            toast({
              title: 'Sync gagal',
              description: 'Status tersimpan, tapi sync ulang ke spreadsheet gagal. Coba Sync Spreadsheet manual nanti.',
              variant: 'destructive',
            });
          }
        }
      }

      toast({
        title: 'Released',
        description: `Room ${inspection.room?.number ?? '-'} released to dashboard as Vacant Clean`,
      });
      fetchData();
    } catch (err) {
      console.error('Release error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setReleasingId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Inspections"
        description="Room quality inspections and scoring"
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
                <Plus className="mr-2 h-4 w-4" /> New Inspection
              </Button>
            )}
          </div>
        }
      />

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search room or inspector..."
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
            <ClipboardCheck className="h-10 w-10 mb-2 opacity-40" />
            <p>No inspections found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Room</TableHead>
                <TableHead>Inspector</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Date</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.room?.number ?? '-'}</TableCell>
                  <TableCell>{i.inspector?.full_name ?? '-'}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn('text-xs', INSPECTION_STATUS_COLORS[i.status])}
                    >
                      {INSPECTION_STATUS_LABELS[i.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {i.score !== null ? (
                      <span className={cn(
                        'font-semibold',
                        i.score >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
                        i.score >= 60 ? 'text-amber-600 dark:text-amber-400' :
                        'text-red-600 dark:text-red-400'
                      )}>
                        {i.score}/100
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {i.inspected_at
                      ? new Date(i.inspected_at).toLocaleDateString()
                      : new Date(i.created_at).toLocaleDateString()}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      {i.status === 'pending' && (
                        <Button
                          size="sm"
                          onClick={() => handleRelease(i)}
                          disabled={releasingId === i.id}
                        >
                          {releasingId === i.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                          )}
                          Release to Dashboard
                        </Button>
                      )}
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
            <DialogTitle>New Inspection</DialogTitle>
            <DialogDescription>Record a new room inspection</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Room</Label>
              <Select value={form.room_id} onValueChange={(v) => setForm({ ...form, room_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as Inspection['status'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(INSPECTION_STATUS_LABELS) as Inspection['status'][]).map((s) => (
                    <SelectItem key={s} value={s}>{INSPECTION_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="score">Score (0-100)</Label>
              <Input
                id="score"
                type="number"
                min={0}
                max={100}
                value={form.score}
                onChange={(e) => setForm({ ...form, score: e.target.value })}
                placeholder="85"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Inspection notes..."
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

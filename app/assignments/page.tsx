'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  Search, RefreshCw, Download, Plus, Filter, ClipboardList, Loader2,
  CheckCircle2, PlayCircle, Pencil, X,
} from 'lucide-react';
import {
  HOUSEKEEPING_STATUS_LABELS, HOUSEKEEPING_STATUS_COLORS,
  type Assignment, type Room, type Profile, type Floor, type RoomType,
} from '@/lib/types';

const ASSIGNMENT_STATUS_LABELS: Record<Assignment['status'], string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const ASSIGNMENT_STATUS_COLORS: Record<Assignment['status'], string> = {
  pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  in_progress: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  completed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30',
};

// ⬅️ BARU: helper untuk hitung batas "hari ini" berdasarkan zona waktu WIB (UTC+7),
// bukan zona waktu server. Server (Vercel) jalan di UTC, jadi kalau dihitung pakai
// new Date().setHours(0,0,0,0) langsung, "hari baru" versi server baru mulai jam
// 07:00 pagi WIB — bukan tengah malam WIB. Fungsi ini memaksa batas hari selalu
// jam 00:00 WIB, di mana pun server dijalankan.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function getTodayRangeWIB() {
  const nowWIB = new Date(Date.now() + WIB_OFFSET_MS);
  const y = nowWIB.getUTCFullYear();
  const m = nowWIB.getUTCMonth();
  const d = nowWIB.getUTCDate();

  // Jam 00:00 WIB pada tanggal (y, m, d), dikonversi balik ke UTC untuk query
  const todayStart = new Date(Date.UTC(y, m, d, 0, 0, 0) - WIB_OFFSET_MS);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  return { todayStart, todayEnd };
}

type RoomWithMeta = Room & {
  floor: Floor | null;
  room_type: RoomType | null;
};

export default function AssignmentsPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [rooms, setRooms] = useState<RoomWithMeta[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Bulk-assign table state: roomId -> selected staffId
  const [roomAssignments, setRoomAssignments] = useState<Record<string, string>>({});
  const [tableSearch, setTableSearch] = useState('');

  // State untuk edit assignment
  const [editTarget, setEditTarget] = useState<Assignment | null>(null);
  const [editRoomId, setEditRoomId] = useState('');
  const [editStaffId, setEditStaffId] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // State untuk cancel/delete assignment
  const [cancelTarget, setCancelTarget] = useState<Assignment | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const canManage = profile?.role === 'admin' || profile?.role === 'supervisor';
  const isHousekeeping = profile?.role === 'housekeeping';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // ⬅️ BARU: hanya assignment hari ini (WIB) — "reset" otomatis tiap ganti hari jam 00:00 WIB
      const { todayStart, todayEnd } = getTodayRangeWIB();

      let assignQuery = supabase
        .from('assignments')
        .select('*, room:rooms(*), staff:profiles(*)')
        .gte('assigned_at', todayStart.toISOString())
        .lt('assigned_at', todayEnd.toISOString())
        .order('assigned_at', { ascending: false });

      if (isHousekeeping && profile?.id) {
        assignQuery = assignQuery.eq('staff_id', profile.id);
      }

      const [assignRes, roomsRes, staffRes] = await Promise.all([
        assignQuery,
        supabase
          .from('rooms')
          .select('*, floor:floors(*), room_type:room_types(*)')
          .order('number'),
        supabase.from('profiles').select('*').eq('role', 'housekeeping').eq('active', true).order('full_name'),
      ]);

      setAssignments((assignRes.data as Assignment[]) || []);
      setRooms((roomsRes.data as RoomWithMeta[]) || []);
      setStaff((staffRes.data as Profile[]) || []);
    } catch (err) {
      console.error('Error fetching assignments:', err);
    } finally {
      setLoading(false);
    }
  }, [isHousekeeping, profile?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ⬅️ BARU: dengarkan perubahan status kamar secara realtime, supaya panel
  // staff & supervisor otomatis update begitu status kamar berubah di halaman
  // Room Status (tanpa perlu klik Refresh manual).
  useEffect(() => {
    const channel = supabase
      .channel('room-status-sync-assignments')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms' },
        (payload) => {
          const updatedRoom = payload.new as Room;

          setRooms((prev) =>
            prev.map((r) => (r.id === updatedRoom.id ? { ...r, ...updatedRoom } : r))
          );

          setAssignments((prev) =>
            prev.map((a) =>
              a.room_id === updatedRoom.id
                ? { ...a, room: a.room ? { ...a.room, ...updatedRoom } : a.room }
                : a
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = assignments.filter((a) => {
    // ⬅️ Opsi A: assignment cancelled tidak pernah ditampilkan sama sekali,
    // baik untuk staff maupun supervisor/admin. Data tetap aman di database.
    if (a.status === 'cancelled') return false;

    const roomNum = a.room?.number ?? '';
    const staffName = a.staff?.full_name ?? '';
    const matchSearch =
      roomNum.toLowerCase().includes(search.toLowerCase()) ||
      staffName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const roomsByFloor = useMemo(() => {
    const q = tableSearch.toLowerCase();
    const filteredRooms = rooms.filter((r) => {
      if (!q) return true;
      return (
        r.number.toLowerCase().includes(q) ||
        (r.room_type?.name ?? '').toLowerCase().includes(q) ||
        (r.floor?.name ?? '').toLowerCase().includes(q)
      );
    });

    const floorMap = new Map<string, { floor: Floor | null; rooms: RoomWithMeta[] }>();
    for (const r of filteredRooms) {
      const key = r.floor?.id ?? 'no-floor';
      if (!floorMap.has(key)) {
        floorMap.set(key, { floor: r.floor, rooms: [] });
      }
      floorMap.get(key)!.rooms.push(r);
    }
    return Array.from(floorMap.values()).sort((a, b) => {
      const so = (a.floor?.sort_order ?? 0) - (b.floor?.sort_order ?? 0);
      return so;
    }).map((g) => ({
      ...g,
      rooms: g.rooms.sort((a, b) => a.number.localeCompare(b.number)),
    }));
  }, [rooms, tableSearch]);

  // ⬅️ BARU: kamar yang sudah punya assignment aktif hari ini (bukan cancelled)
  // tidak boleh di-assign ulang lewat dialog New Assignment — cegah dobel-assign.
  // Revisi/koreksi assignment yang sudah ada dilakukan lewat panel utama
  // (tombol edit/cancel), bukan lewat dialog ini.
  const activeAssignmentByRoom = useMemo(() => {
    const map = new Map<string, Assignment>();
    for (const a of assignments) {
      if (a.status === 'cancelled') continue;
      map.set(a.room_id, a);
    }
    return map;
  }, [assignments]);

  const openBulkDialog = () => {
    setRoomAssignments({});
    setTableSearch('');
    setDialogOpen(true);
  };

  const selectedCount = Object.values(roomAssignments).filter(Boolean).length;

  const handleBulkCreate = async () => {
    const entries = Object.entries(roomAssignments).filter(([, staffId]) => !!staffId);
    if (entries.length === 0) {
      toast({ title: 'Validation', description: 'Select at least one staff for a room', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const inserts = entries.map(([roomId, staffId]) => {
        const room = rooms.find((r) => r.id === roomId);
        return {
          room_id: roomId,
          staff_id: staffId,
          task_type: 'cleaning' as const,
          priority: 'normal' as const,
          status: 'pending' as const,
          fo_status: room?.housekeeping_status ?? null,
          // ⬅️ BARU: set eksplisit supaya pasti masuk hitungan "hari ini" (WIB),
          // tidak bergantung pada default value kolom di database
          assigned_at: new Date().toISOString(),
        };
      });
      const { error } = await supabase.from('assignments').insert(inserts);
      if (error) throw error;
      toast({ title: 'Created', description: `${inserts.length} assignment(s) created successfully` });
      setDialogOpen(false);
      setRoomAssignments({});
      fetchData();
    } catch (err) {
      console.error('Bulk create error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (assignment: Assignment, newStatus: Assignment['status']) => {
    setUpdatingId(assignment.id);
    try {
      const updates: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'in_progress') updates.started_at = new Date().toISOString();
      if (newStatus === 'completed') updates.completed_at = new Date().toISOString();

      const { error } = await supabase.from('assignments').update(updates).eq('id', assignment.id);
      if (error) throw error;
      toast({ title: 'Updated', description: 'Assignment status updated' });
      fetchData();
    } catch (err) {
      console.error('Update error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const completed = assignments.filter((a) => a.status === 'completed');
      if (completed.length === 0) {
        toast({ title: 'Tidak ada data', description: 'Belum ada assignment yang completed' });
        return;
      }
      for (const a of completed) {
        await fetch('/api/sync-assignment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignmentId: a.id }),
        });
      }
      toast({ title: 'Synced', description: `${completed.length} assignment berhasil disync ulang` });
    } catch (err) {
      console.error('Manual sync error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  // Buka dialog edit, isi form dengan data assignment saat ini
  const openEdit = (a: Assignment) => {
    setEditTarget(a);
    setEditRoomId(a.room_id);
    setEditStaffId(a.staff_id ?? '');
  };

  // Simpan perubahan room/staff assignment
  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!editRoomId || !editStaffId) {
      toast({ title: 'Validation', description: 'Room dan staff harus dipilih', variant: 'destructive' });
      return;
    }
    setEditSaving(true);
    try {
      const { error } = await supabase
        .from('assignments')
        .update({ room_id: editRoomId, staff_id: editStaffId })
        .eq('id', editTarget.id);
      if (error) throw error;
      toast({ title: 'Updated', description: 'Assignment berhasil diperbarui' });
      setEditTarget(null);
      fetchData();
    } catch (err) {
      console.error('Edit error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setEditSaving(false);
    }
  };

  // Batalkan assignment (set status jadi cancelled)
  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const { error } = await supabase
        .from('assignments')
        .update({ status: 'cancelled' })
        .eq('id', cancelTarget.id);
      if (error) throw error;
      toast({ title: 'Cancelled', description: 'Assignment dibatalkan' });
      setCancelTarget(null);
      fetchData();
    } catch (err) {
      console.error('Cancel error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Assignments"
        description={
          isHousekeeping
            ? 'Your assigned rooms'
            : 'Track and manage housekeeping assignments'
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            {canManage && (
              <Button variant="outline" size="sm" onClick={handleManualSync} disabled={syncing}>
                {syncing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Sync Spreadsheet
              </Button>
            )}
            {canManage && (
              <Button size="sm" onClick={openBulkDialog}>
                <Plus className="mr-2 h-4 w-4" /> New Assignment
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search room or staff..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {(Object.keys(ASSIGNMENT_STATUS_LABELS) as Assignment['status'][])
              .filter((s) => s !== 'cancelled')
              .map((s) => (
                <SelectItem key={s} value={s}>{ASSIGNMENT_STATUS_LABELS[s]}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ClipboardList className="h-10 w-10 mb-2 opacity-40" />
            <p>
              {isHousekeeping
                ? 'No rooms assigned to you yet'
                : 'No assignments found matching your filters'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Room</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Room Status</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.room?.number ?? '-'}</TableCell>
                  <TableCell>{a.staff?.full_name ?? 'Unassigned'}</TableCell>
                  <TableCell>
                    {a.room ? (
                      <Badge
                        variant="outline"
                        className={cn('text-xs', HOUSEKEEPING_STATUS_COLORS[a.room.housekeeping_status])}
                      >
                        {HOUSEKEEPING_STATUS_LABELS[a.room.housekeeping_status]}
                      </Badge>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn('text-xs', ASSIGNMENT_STATUS_COLORS[a.status])}
                    >
                      {ASSIGNMENT_STATUS_LABELS[a.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.assigned_at ? new Date(a.assigned_at).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {isHousekeeping && (a.status === 'pending' || a.status === 'in_progress') && (
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={() => router.push(`/assignments/${a.id}`)}
                          className="text-xs h-7"
                        >
                          {a.status === 'pending' ? (
                            <>
                              <PlayCircle className="mr-1 h-3 w-3" /> Start Cleaning
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="mr-1 h-3 w-3" /> Finish Cleaning
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                    {isHousekeeping && a.status === 'completed' && (
                      <span className="text-xs text-muted-foreground">No action</span>
                    )}
                    {canManage && (
                      <div className="flex justify-end gap-1 flex-wrap items-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/assignments/${a.id}`)}
                          className="text-xs h-7"
                        >
                          View
                        </Button>
                        {a.status !== 'completed' && (
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEdit(a)}
                            title="Edit assignment"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {a.status !== 'completed' && (
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setCancelTarget(a)}
                            title="Cancel assignment"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {(Object.keys(ASSIGNMENT_STATUS_LABELS) as Assignment['status'][])
                          .filter((s) => s !== 'cancelled')
                          .map((s) => (
                            <Button
                              key={s}
                              variant={a.status === s ? 'default' : 'outline'}
                              size="sm"
                              disabled={updatingId === a.id}
                              onClick={() => handleStatusChange(a, s)}
                              className={cn('text-xs h-7', a.status !== s && ASSIGNMENT_STATUS_COLORS[s])}
                            >
                              {updatingId === a.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                              {ASSIGNMENT_STATUS_LABELS[s]}
                            </Button>
                          ))}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Bulk Assignment Dialog */}
      {canManage && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>New Assignment</DialogTitle>
              <DialogDescription>
                Assign staff to rooms below. Only rooms with a selected staff will be created.
                {selectedCount > 0 && (
                  <span className="ml-1 font-medium text-primary">{selectedCount} room(s) selected</span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search room, type, or floor..."
                className="pl-8"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Room</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Current Status</TableHead>
                    <TableHead>Assign To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roomsByFloor.map(({ floor, rooms: floorRooms }) => (
                    <>
                      <TableRow key={`floor-${floor?.id ?? 'none'}`} className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={4} className="font-semibold text-xs uppercase tracking-wide py-1.5">
                          {floor?.name ?? 'Unassigned Floor'}
                        </TableCell>
                      </TableRow>
                      {floorRooms.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono font-medium">{r.number}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.room_type?.name ?? '-'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn('text-xs', HOUSEKEEPING_STATUS_COLORS[r.housekeeping_status])}
                            >
                              {HOUSEKEEPING_STATUS_LABELS[r.housekeeping_status]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {activeAssignmentByRoom.has(r.id) ? (
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="text-muted-foreground">Sudah di-assign:</span>
                                <span className="font-medium">
                                  {activeAssignmentByRoom.get(r.id)!.staff?.full_name ?? 'Unassigned'}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[10px] px-1.5 py-0',
                                    ASSIGNMENT_STATUS_COLORS[activeAssignmentByRoom.get(r.id)!.status]
                                  )}
                                >
                                  {ASSIGNMENT_STATUS_LABELS[activeAssignmentByRoom.get(r.id)!.status]}
                                </Badge>
                              </div>
                            ) : (
                              <Select
                                value={roomAssignments[r.id] ?? ''}
                                onValueChange={(v) =>
                                  setRoomAssignments((prev) => ({ ...prev, [r.id]: v }))
                                }
                              >
                                <SelectTrigger className="h-8 w-[170px] text-xs">
                                  <SelectValue placeholder="Unassigned" />
                                </SelectTrigger>
                                <SelectContent>
                                  {staff.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  ))}
                  {roomsByFloor.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                        No rooms found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <DialogFooter className="mt-3">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleBulkCreate} disabled={saving || selectedCount === 0}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create {selectedCount > 0 ? `(${selectedCount})` : ''} Assignment{selectedCount === 1 ? '' : 's'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Assignment Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Edit Assignment</DialogTitle>
            <DialogDescription>
              Ubah kamar atau staff untuk assignment ini.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Room</p>
              <Select value={editRoomId} onValueChange={setEditRoomId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.number} {r.floor?.name ? `— ${r.floor.name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Staff</p>
              <Select value={editStaffId} onValueChange={setEditStaffId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan assignment ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Assignment untuk kamar {cancelTarget?.room?.number ?? '-'} akan ditandai sebagai cancelled
              dan langsung disembunyikan dari daftar (baik untuk Anda maupun staff terkait).
              Data tidak dihapus dari database — tetap bisa ditelusuri untuk laporan/audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelConfirm} disabled={cancelling}>
              {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ya, Batalkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

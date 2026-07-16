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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  Search, RefreshCw, Download, Plus, Filter, ClipboardList, Loader2, CheckCircle2, PlayCircle,
} from 'lucide-react';
import {
  PRIORITY_LABELS, PRIORITY_COLORS,
  HOUSEKEEPING_STATUS_LABELS, HOUSEKEEPING_STATUS_COLORS,
  type Assignment, type Room, type Profile, type Priority, type Floor, type RoomType,
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

const TASK_TYPE_LABELS: Record<Assignment['task_type'], string> = {
  cleaning: 'Cleaning',
  turndown: 'Turndown',
  deep_clean: 'Deep Clean',
  checkout: 'Checkout',
  vacant: 'Vacant',
};

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

  // Bulk-assign table state: roomId -> selected staffId
  const [roomAssignments, setRoomAssignments] = useState<Record<string, string>>({});
  const [tableSearch, setTableSearch] = useState('');

  const canManage = profile?.role === 'admin' || profile?.role === 'supervisor';
  const isHousekeeping = profile?.role === 'housekeeping';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let assignQuery = supabase
        .from('assignments')
        .select('*, room:rooms(*), staff:profiles(*)')
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

  const filtered = assignments.filter((a) => {
    const roomNum = a.room?.number ?? '';
    const staffName = a.staff?.full_name ?? '';
    const matchSearch =
      roomNum.toLowerCase().includes(search.toLowerCase()) ||
      staffName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Group rooms by floor for the bulk assignment table
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
      const inserts = entries.map(([roomId, staffId]) => ({
        room_id: roomId,
        staff_id: staffId,
        task_type: 'cleaning' as const,
        priority: 'normal' as const,
        status: 'pending' as const,
      }));
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
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" /> Sync Spreadsheet
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

      {/* Filters */}
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
            {(Object.keys(ASSIGNMENT_STATUS_LABELS) as Assignment['status'][]).map((s) => (
              <SelectItem key={s} value={s}>{ASSIGNMENT_STATUS_LABELS[s]}</SelectItem>
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
                <TableHead>Task Type</TableHead>
                <TableHead>Priority</TableHead>
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
                    <Badge variant="outline" className="text-xs">
                      {TASK_TYPE_LABELS[a.task_type]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn('text-xs', PRIORITY_COLORS[a.priority])}
                    >
                      {PRIORITY_LABELS[a.priority]}
                    </Badge>
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
                    {isHousekeeping && (a.status === 'completed' || a.status === 'cancelled') && (
                      <span className="text-xs text-muted-foreground">No action</span>
                    )}
                    {canManage && (
                      <div className="flex justify-end gap-1 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/assignments/${a.id}`)}
                          className="text-xs h-7"
                        >
                          View
                        </Button>
                        {(Object.keys(ASSIGNMENT_STATUS_LABELS) as Assignment['status'][]).map((s) => (
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

      {/* Bulk Assignment Dialog: all rooms grouped by floor, with staff select per room */}
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
    </div>
  );
}

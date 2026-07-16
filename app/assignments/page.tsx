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
  Search, RefreshCw, Download, Plus, Filter, ClipboardList, Loader2, CheckCircle2,
} from 'lucide-react';
import {
  PRIORITY_LABELS, PRIORITY_COLORS,
  type Assignment, type Room, type Profile, type Priority,
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

export default function AssignmentsPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    room_id: '',
    staff_id: '',
    task_type: 'cleaning' as Assignment['task_type'],
    priority: 'normal' as Priority,
    notes: '',
  });

  // Admin/Supervisor can create assignments and change status freely.
  const canManage = profile?.role === 'admin' || profile?.role === 'supervisor';
  // Housekeeping staff can only view their own assignments and mark them done.
  const isHousekeeping = profile?.role === 'housekeeping';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let assignQuery = supabase
        .from('assignments')
        .select('*, room:rooms(*), staff:profiles(*)')
        .order('assigned_at', { ascending: false });

      // Housekeeping staff only see assignments given to them
      if (isHousekeeping && profile?.id) {
        assignQuery = assignQuery.eq('staff_id', profile.id);
      }

      const [assignRes, roomsRes, staffRes] = await Promise.all([
        assignQuery,
        supabase.from('rooms').select('*').order('number'),
        supabase.from('profiles').select('*').eq('role', 'housekeeping').eq('active', true).order('full_name'),
      ]);

      setAssignments((assignRes.data as Assignment[]) || []);
      setRooms((roomsRes.data as Room[]) || []);
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

  const handleCreate = async () => {
    if (!form.room_id) {
      toast({ title: 'Validation', description: 'Please select a room', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('assignments').insert({
        room_id: form.room_id,
        staff_id: form.staff_id || null,
        task_type: form.task_type,
        priority: form.priority,
        notes: form.notes || null,
        status: 'pending',
      });
      if (error) throw error;
      toast({ title: 'Created', description: 'Assignment created successfully' });
      setDialogOpen(false);
      setForm({ room_id: '', staff_id: '', task_type: 'cleaning', priority: 'normal', notes: '' });
      fetchData();
    } catch (err) {
      console.error('Create error:', err);
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

  // Housekeeping staff: mark an in-progress/pending task as completed only.
  const handleMarkCompleted = async (assignment: Assignment) => {
    await handleStatusChange(assignment, 'completed');
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
              <Button size="sm" onClick={() => setDialogOpen(true)}>
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
                    {canManage && (
                      <div className="flex justify-end gap-1 flex-wrap">
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
                    {isHousekeeping && a.status !== 'completed' && a.status !== 'cancelled' && (
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          disabled={updatingId === a.id}
                          onClick={() => handleMarkCompleted(a)}
                          className="text-xs h-7"
                        >
                          {updatingId === a.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                          )}
                          Mark as Done
                        </Button>
                      </div>
                    )}
                    {isHousekeeping && (a.status === 'completed' || a.status === 'cancelled') && (
                      <span className="text-xs text-muted-foreground">No action</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog — only rendered/openable for admin/supervisor via canManage buttons above */}
      {canManage && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Assignment</DialogTitle>
              <DialogDescription>Create a new housekeeping assignment</DialogDescription>
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
                <Label>Staff</Label>
                <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Task Type</Label>
                <Select
                  value={form.task_type}
                  onValueChange={(v) => setForm({ ...form, task_type: v as Assignment['task_type'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TASK_TYPE_LABELS) as Assignment['task_type'][]).map((t) => (
                      <SelectItem key={t} value={t}>{TASK_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v as Priority })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                      <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional instructions..."
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
      )}
    </div>
  );
}

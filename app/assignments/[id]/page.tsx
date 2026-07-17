'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Clock, PlayCircle, CheckCircle2, Loader2,
  Sparkles, Layers, BedDouble,
} from 'lucide-react';
import {
  HOUSEKEEPING_STATUS_LABELS, HOUSEKEEPING_STATUS_COLORS,
  type Assignment, type Amenity, type LinenInventory,
  type AssignmentAmenityUsage, type AssignmentLinenUsage,
} from '@/lib/types';

// ⬅️ BARU: tipe untuk qty in/out per linen item
type LinenQtyMap = Record<string, { in: number; out: number }>;

export default function AssignmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const { toast } = useToast();
  const assignmentId = params?.id as string;

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [linenItems, setLinenItems] = useState<LinenInventory[]>([]);
  const [amenityQty, setAmenityQty] = useState<Record<string, number>>({});
  const [linenQty, setLinenQty] = useState<LinenQtyMap>({}); // ⬅️ UBAH: dulu Record<string, number>
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [now, setNow] = useState(new Date());

  const canManage = profile?.role === 'admin' || profile?.role === 'supervisor';
  const isOwner = assignment?.staff_id === profile?.id;
  const canAct = canManage || isOwner;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [assignRes, amenitiesRes, linenRes] = await Promise.all([
        supabase
          .from('assignments')
          .select('*, room:rooms(*), staff:profiles(*)')
          .eq('id', assignmentId)
          .maybeSingle(),
        supabase.from('amenities').select('*').order('category').order('name'),
        supabase.from('linen_inventory').select('*').order('category').order('item_name'),
      ]);

      if (assignRes.error) throw assignRes.error;
      setAssignment(assignRes.data as Assignment);
      setAmenities((amenitiesRes.data as Amenity[]) || []);
      setLinenItems((linenRes.data as LinenInventory[]) || []);

      const [amenityUsageRes, linenUsageRes] = await Promise.all([
        supabase.from('assignment_amenity_usage').select('*').eq('assignment_id', assignmentId),
        supabase.from('assignment_linen_usage').select('*').eq('assignment_id', assignmentId),
      ]);

      const aQty: Record<string, number> = {};
      ((amenityUsageRes.data as AssignmentAmenityUsage[]) || []).forEach((u) => {
        aQty[u.amenity_id] = u.quantity;
      });
      setAmenityQty(aQty);

      // ⬅️ UBAH: baca quantity_in & quantity_out, bukan quantity
      const lQty: LinenQtyMap = {};
      ((linenUsageRes.data as AssignmentLinenUsage[]) || []).forEach((u) => {
        lQty[u.linen_item_id] = {
          in: u.quantity_in ?? 0,
          out: u.quantity_out ?? 0,
        };
      });
      setLinenQty(lQty);
    } catch (err) {
      console.error('Error loading assignment detail:', err);
      toast({ title: 'Error', description: 'Failed to load assignment', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [assignmentId, toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (assignment?.status !== 'in_progress') return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [assignment?.status]);

  const handleStart = async () => {
    if (!assignment) return;
    setStarting(true);
    try {
      const { error } = await supabase
        .from('assignments')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
          hk_status_in: assignment.room?.housekeeping_status ?? null,
        })
        .eq('id', assignment.id);
      if (error) throw error;
      toast({ title: 'Started', description: 'Cleaning started — timer is running' });
      fetchAll();
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setStarting(false);
    }
  };

  const handleFinish = async () => {
    if (!assignment) return;
    setFinishing(true);
    try {
      const amenityRows = Object.entries(amenityQty)
        .filter(([, qty]) => qty > 0)
        .map(([amenity_id, quantity]) => ({
          assignment_id: assignment.id,
          amenity_id,
          quantity,
          recorded_by: profile?.id ?? null,
        }));

      // ⬅️ UBAH: kirim quantity_in & quantity_out, hanya baris yang salah satunya > 0
      const linenRows = Object.entries(linenQty)
        .filter(([, qty]) => qty.in > 0 || qty.out > 0)
        .map(([linen_item_id, qty]) => ({
          assignment_id: assignment.id,
          linen_item_id,
          quantity_in: qty.in,
          quantity_out: qty.out,
          recorded_by: profile?.id ?? null,
        }));

      if (amenityRows.length > 0) {
        const { error } = await supabase
          .from('assignment_amenity_usage')
          .upsert(amenityRows, { onConflict: 'assignment_id,amenity_id' });
        if (error) throw error;
      }
      if (linenRows.length > 0) {
        const { error } = await supabase
          .from('assignment_linen_usage')
          .upsert(linenRows, { onConflict: 'assignment_id,linen_item_id' });
        if (error) throw error;
      }

      const { error: finishError } = await supabase
        .from('assignments')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          hk_status_final: assignment.room?.housekeeping_status ?? null,
        })
        .eq('id', assignment.id);
      if (finishError) throw finishError;

      try {
        await fetch('/api/sync-assignment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignmentId: assignment.id }),
        });
      } catch (syncErr) {
        console.error('Sync to sheet failed:', syncErr);
        toast({
          title: 'Sync gagal',
          description: 'Data tersimpan, tapi sync ke spreadsheet gagal. Coba Sync manual nanti.',
          variant: 'destructive',
        });
      }

      toast({ title: 'Completed', description: 'Room cleaning finished and usage recorded' });
      router.push('/assignments');
    } catch (err) {
      console.error('Finish error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setFinishing(false);
    }
  };

  const formatElapsed = () => {
    if (!assignment?.started_at) return '00:00:00';
    const start = new Date(assignment.started_at).getTime();
    const diff = Math.max(0, now.getTime() - start);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  };

  const amenityGroups = amenities.reduce<Record<string, Amenity[]>>((acc, a) => {
    (acc[a.category] ||= []).push(a);
    return acc;
  }, {});

  const linenGroups = linenItems.reduce<Record<string, LinenInventory[]>>((acc, l) => {
    (acc[l.category] ||= []).push(l);
    return acc;
  }, {});

  // ⬅️ BARU: helper update salah satu sisi (in/out) linen tanpa menimpa sisi lain
  const updateLinenQty = (itemId: string, side: 'in' | 'out', value: number) => {
    setLinenQty((prev) => ({
      ...prev,
      [itemId]: {
        in: side === 'in' ? value : prev[itemId]?.in ?? 0,
        out: side === 'out' ? value : prev[itemId]?.out ?? 0,
      },
    }));
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="h-8 w-40 rounded bg-muted animate-pulse" />
        <div className="h-40 rounded-lg bg-muted animate-pulse" />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="p-4 md:p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Assignment not found.
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={() => router.push('/assignments')}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Assignments
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/assignments')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={`Room ${assignment.room?.number ?? '-'}`}
          description={assignment.staff?.full_name ? `Assigned to ${assignment.staff.full_name}` : 'Unassigned'}
        />
      </div>

      <Card>
        <CardContent className="p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <BedDouble className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Room Status</p>
              <Badge
                variant="outline"
                className={cn('text-xs mt-1', HOUSEKEEPING_STATUS_COLORS[assignment.room?.housekeeping_status ?? 'vacant_clean'])}
              >
                {HOUSEKEEPING_STATUS_LABELS[assignment.room?.housekeeping_status ?? 'vacant_clean']}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
              <Clock className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {assignment.status === 'completed' ? 'Total Time' : 'Elapsed Time'}
              </p>
              <p className="text-2xl font-bold font-mono">
                {assignment.status === 'in_progress'
                  ? formatElapsed()
                  : assignment.started_at && assignment.completed_at
                  ? (() => {
                      const diff = new Date(assignment.completed_at!).getTime() - new Date(assignment.started_at!).getTime();
                      const h = Math.floor(diff / 3600000);
                      const m = Math.floor((diff % 3600000) / 60000);
                      const s = Math.floor((diff % 60000) / 1000);
                      return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
                    })()
                  : '00:00:00'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Started At</p>
            <p className="text-sm font-medium mt-1">
              {assignment.started_at ? new Date(assignment.started_at).toLocaleString() : 'Not started yet'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Finished At</p>
            <p className="text-sm font-medium mt-1">
              {assignment.completed_at ? new Date(assignment.completed_at).toLocaleString() : 'Not finished yet'}
            </p>
          </CardContent>
        </Card>
      </div>

      {assignment.status === 'pending' && (
        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center gap-3">
            <PlayCircle className="h-10 w-10 text-primary" />
            <p className="text-sm text-muted-foreground max-w-sm">
              Start cleaning to begin the timer. You&apos;ll be able to log amenities and linen
              used once cleaning is in progress.
            </p>
            {canAct ? (
              <Button onClick={handleStart} disabled={starting}>
                {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <PlayCircle className="mr-2 h-4 w-4" /> Start Cleaning
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Only the assigned staff can start this task.</p>
            )}
          </CardContent>
        </Card>
      )}

      {assignment.status === 'in_progress' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Amenities Used
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {Object.entries(amenityGroups).map(([category, items]) => (
                <div key={category}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {category}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {items.map((a) => (
                      <div key={a.id} className="space-y-1">
                        <Label htmlFor={`amenity-${a.id}`} className="text-xs">
                          {a.name} <span className="text-muted-foreground">({a.unit})</span>
                        </Label>
                        <Input
                          id={`amenity-${a.id}`}
                          type="number"
                          min={0}
                          value={amenityQty[a.id] ?? 0}
                          disabled={!canAct}
                          onChange={(e) =>
                            setAmenityQty((prev) => ({
                              ...prev,
                              [a.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                            }))
                          }
                          className="h-9"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {amenities.length === 0 && (
                <p className="text-sm text-muted-foreground">No amenities configured yet.</p>
              )}
            </CardContent>
          </Card>

          {/* ⬅️ UBAH: Linen sekarang 2 input (IN & OUT) per item */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4" /> Linen Used
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {Object.entries(linenGroups).map(([category, items]) => (
                <div key={category}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {category.replace('_', ' ')}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {items.map((l) => (
                      <div key={l.id} className="space-y-1.5 rounded-md border p-2.5">
                        <p className="text-xs font-medium">
                          {l.item_name} <span className="text-muted-foreground">({l.unit})</span>
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label htmlFor={`linen-in-${l.id}`} className="text-[10px] text-muted-foreground">
                              IN
                            </Label>
                            <Input
                              id={`linen-in-${l.id}`}
                              type="number"
                              min={0}
                              value={linenQty[l.id]?.in ?? 0}
                              disabled={!canAct}
                              onChange={(e) =>
                                updateLinenQty(l.id, 'in', Math.max(0, parseInt(e.target.value, 10) || 0))
                              }
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`linen-out-${l.id}`} className="text-[10px] text-muted-foreground">
                              OUT
                            </Label>
                            <Input
                              id={`linen-out-${l.id}`}
                              type="number"
                              min={0}
                              value={linenQty[l.id]?.out ?? 0}
                              disabled={!canAct}
                              onChange={(e) =>
                                updateLinenQty(l.id, 'out', Math.max(0, parseInt(e.target.value, 10) || 0))
                              }
                              className="h-9"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {linenItems.length === 0 && (
                <p className="text-sm text-muted-foreground">No linen items configured yet.</p>
              )}
            </CardContent>
          </Card>

          {canAct && (
            <div className="flex justify-end">
              <Button onClick={handleFinish} disabled={finishing} size="lg">
                {finishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <CheckCircle2 className="mr-2 h-4 w-4" /> Finish Cleaning
              </Button>
            </div>
          )}
        </>
      )}

      {assignment.status === 'completed' && (
        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center gap-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="font-medium">Cleaning completed</p>
            <p className="text-sm text-muted-foreground">
              Amenities and linen usage for this room have been recorded.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

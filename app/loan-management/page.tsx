'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
  Search, RefreshCw, Download, Plus, HandCoins, Loader2,
} from 'lucide-react';
import { type Loan, type Profile, type LoanItem, type LoanUnit, type Room } from '@/lib/types';

const LOAN_STATUS_LABELS: Record<Loan['status'], string> = {
  active: 'Dipinjam',
  returned: 'Dikembalikan',
  lost: 'Hilang',
  damaged: 'Rusak',
};

const LOAN_STATUS_COLORS: Record<Loan['status'], string> = {
  active: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  returned: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  lost: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  damaged: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
};

const UNIT_STATUS_LABELS: Record<LoanUnit['status'], string> = {
  available: 'Tersedia',
  on_loan: 'Sedang Dipinjam',
  lost: 'Hilang',
  damaged: 'Rusak',
};

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function LoanManagementPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loanItems, setLoanItems] = useState<LoanItem[]>([]);
  const [loanUnits, setLoanUnits] = useState<LoanUnit[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [roomInput, setRoomInput] = useState('');
  const [form, setForm] = useState({
    staff_id: '',
    loan_item_id: '', // kategori/jenis barang yang dipilih dulu
    loan_unit_id: '',
    room_id: '',
    notes: '',
  });

  const canEdit = profile?.role === 'admin' || profile?.role === 'supervisor' || profile?.role === 'order_taker' || profile?.role === 'evening_shift';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [loanRes, staffRes, itemRes, unitRes, roomRes] = await Promise.all([
        supabase
          .from('loans')
          .select('*, staff:profiles(*), loan_item:loan_items(*), loan_unit:loan_units(*), room:rooms(*)')
          .order('loaned_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('active', true).order('full_name'),
        supabase.from('loan_items').select('*').eq('active', true).order('name'),
        supabase.from('loan_units').select('*').order('unit_number'),
        supabase.from('rooms').select('*').order('number'),
      ]);

      setLoans((loanRes.data as Loan[]) || []);
      setStaff((staffRes.data as Profile[]) || []);
      setLoanItems((itemRes.data as LoanItem[]) || []);
      setLoanUnits((unitRes.data as LoanUnit[]) || []);
      setRooms((roomRes.data as Room[]) || []);
    } catch (err) {
      console.error('Error fetching loans:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = loans.filter((l) => {
    const matchSearch =
      (l.loan_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      l.item_name.toLowerCase().includes(search.toLowerCase()) ||
      (l.staff?.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (l.room?.number ?? '').toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  // Unit-unit di bawah kategori (loan_item) yang sedang dipilih di step 1
  const unitsForSelectedItem = useMemo(
    () => loanUnits.filter((u) => u.loan_item_id === form.loan_item_id).sort((a, b) => a.unit_number - b.unit_number),
    [loanUnits, form.loan_item_id]
  );

  const availableCountByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of loanUnits) {
      if (u.status === 'available') {
        map.set(u.loan_item_id, (map.get(u.loan_item_id) ?? 0) + 1);
      }
    }
    return map;
  }, [loanUnits]);

  const selectedUnit = loanUnits.find((u) => u.id === form.loan_unit_id);
  const selectedItem = loanItems.find((li) => li.id === form.loan_item_id);

  const matchedRoom = rooms.find((r) => r.number.toLowerCase() === roomInput.trim().toLowerCase());
  const roomNotFound = roomInput.trim().length > 0 && !matchedRoom;

  const handleRoomInputChange = (value: string) => {
    setRoomInput(value);
    const match = rooms.find((r) => r.number.toLowerCase() === value.trim().toLowerCase());
    setForm((f) => ({ ...f, room_id: match ? match.id : '' }));
  };

  const handleItemChange = (loanItemId: string) => {
    // Ganti kategori -> reset pilihan nomor unit (supaya tidak nyangkut
    // ke unit kategori sebelumnya)
    setForm((f) => ({ ...f, loan_item_id: loanItemId, loan_unit_id: '' }));
  };

  const resetForm = () => {
    setForm({ staff_id: '', loan_item_id: '', loan_unit_id: '', room_id: '', notes: '' });
    setRoomInput('');
  };

  const handleCreate = async () => {
    if (!form.staff_id) {
      toast({ title: 'Validasi', description: 'Pilih staff yang meminjamkan', variant: 'destructive' });
      return;
    }
    if (!form.loan_item_id) {
      toast({ title: 'Validasi', description: 'Pilih kategori barang', variant: 'destructive' });
      return;
    }
    if (!form.loan_unit_id) {
      toast({ title: 'Validasi', description: 'Pilih nomor barang', variant: 'destructive' });
      return;
    }
    if (roomInput.trim() && !matchedRoom) {
      toast({ title: 'Validasi', description: 'Nomor kamar tidak ditemukan di data kamar', variant: 'destructive' });
      return;
    }
    if (!selectedUnit || selectedUnit.status !== 'available') {
      toast({ title: 'Validasi', description: 'Barang ini sedang tidak tersedia', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const itemLabel = `${selectedItem?.name ?? ''} - Nomor ${selectedUnit.unit_number}`;

      const { error } = await supabase.from('loans').insert({
        staff_id: form.staff_id,
        loan_item_id: selectedUnit.loan_item_id,
        loan_unit_id: selectedUnit.id,
        room_id: form.room_id || null,
        item_name: itemLabel,
        quantity: 1,
        notes: form.notes || null,
        status: 'active',
        loaned_at: new Date().toISOString(),
      });
      if (error) throw error;

      const { error: unitError } = await supabase
        .from('loan_units')
        .update({ status: 'on_loan' })
        .eq('id', selectedUnit.id);
      if (unitError) {
        console.error('Unit status update error:', unitError);
        toast({ title: 'Peringatan', description: 'Loan tercatat, tapi status barang gagal diupdate. Cek manual.', variant: 'destructive' });
      }

      toast({ title: 'Berhasil', description: 'Barang dicatat sebagai dipinjam' });
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      console.error('Create error:', err);
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (loan: Loan, newStatus: Loan['status']) => {
    setUpdatingId(loan.id);
    try {
      const updates: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'returned' || newStatus === 'lost' || newStatus === 'damaged') {
        updates.returned_at = new Date().toISOString();
      } else if (newStatus === 'active') {
        updates.returned_at = null;
      }
      const { error } = await supabase.from('loans').update(updates).eq('id', loan.id);
      if (error) throw error;

      if (loan.loan_unit_id && newStatus !== loan.status) {
        const unitStatusMap: Record<Loan['status'], LoanUnit['status']> = {
          active: 'on_loan',
          returned: 'available',
          lost: 'lost',
          damaged: 'damaged',
        };
        const { error: unitError } = await supabase
          .from('loan_units')
          .update({ status: unitStatusMap[newStatus] })
          .eq('id', loan.loan_unit_id);
        if (unitError) {
          console.error('Unit status sync error:', unitError);
        }
      }

      toast({
        title: 'Berhasil',
        description: newStatus === 'returned' ? 'Barang dicatat sudah dikembalikan' : 'Status peminjaman diperbarui',
      });
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
        title="Loan Management"
        description="Track items loaned to staff members"
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
                <Plus className="mr-2 h-4 w-4" /> New Loan
              </Button>
            )}
          </div>
        }
      />

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari loan #, barang, staff, atau kamar..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
            <HandCoins className="h-10 w-10 mb-2 opacity-40" />
            <p>No loans found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loan #</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Kamar</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Dipinjam</TableHead>
                <TableHead>Dikembalikan</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.loan_number ?? '-'}</TableCell>
                  <TableCell>{l.staff?.full_name ?? '-'}</TableCell>
                  <TableCell>
                    {l.room?.number ? (
                      <Badge variant="outline" className="text-xs">
                        {l.room.number}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {l.item_name}
                    {l.loan_unit && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({l.loan_unit.code})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-xs', LOAN_STATUS_COLORS[l.status])}>
                      {LOAN_STATUS_LABELS[l.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDateTime(l.loaned_at)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDateTime(l.returned_at)}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {(Object.keys(LOAN_STATUS_LABELS) as Loan['status'][]).map((s) => (
                          <Button
                            key={s}
                            variant={l.status === s ? 'default' : 'outline'}
                            size="sm"
                            disabled={updatingId === l.id}
                            onClick={() => handleStatusChange(l, s)}
                            className={cn('text-xs h-7', l.status !== s && LOAN_STATUS_COLORS[s])}
                          >
                            {updatingId === l.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            {LOAN_STATUS_LABELS[s]}
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Loan</DialogTitle>
            <DialogDescription>Catat barang yang dipinjamkan ke kamar tamu</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Staff Member</Label>
              <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih staff" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="room_number">Nomor Kamar</Label>
              <Input
                id="room_number"
                list="room-options"
                value={roomInput}
                onChange={(e) => handleRoomInputChange(e.target.value)}
                placeholder="Ketik nomor kamar, misal 204"
                className={cn(roomNotFound && 'border-destructive focus-visible:ring-destructive')}
              />
              <datalist id="room-options">
                {rooms.map((r) => (
                  <option key={r.id} value={r.number} />
                ))}
              </datalist>
              {roomNotFound && (
                <p className="text-xs text-destructive">
                  Nomor kamar tidak ditemukan. Cek kembali daftar kamar.
                </p>
              )}
            </div>

            {/* STEP 1: pilih kategori barang */}
            <div className="space-y-1.5">
              <Label>Kategori Barang</Label>
              <Select value={form.loan_item_id} onValueChange={handleItemChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kategori barang" />
                </SelectTrigger>
                <SelectContent>
                  {loanItems.map((li) => {
                    const avail = availableCountByItem.get(li.id) ?? 0;
                    return (
                      <SelectItem key={li.id} value={li.id} disabled={avail === 0}>
                        {li.name} ({li.code}) — {avail} tersedia
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {loanItems.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Belum ada data barang. Tambahkan dulu di Loan Master Data.
                </p>
              )}
            </div>

            {/* STEP 2: pilih nomor unit, cuma muncul setelah kategori dipilih */}
            {form.loan_item_id && (
              <div className="space-y-1.5">
                <Label>Nomor Barang</Label>
                <Select value={form.loan_unit_id} onValueChange={(v) => setForm({ ...form, loan_unit_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih nomor" />
                  </SelectTrigger>
                  <SelectContent>
                    {unitsForSelectedItem.map((u) => (
                      <SelectItem key={u.id} value={u.id} disabled={u.status !== 'available'}>
                        Nomor {u.unit_number}
                        {u.status !== 'available' && ` (${UNIT_STATUS_LABELS[u.status]})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Detail tambahan..."
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

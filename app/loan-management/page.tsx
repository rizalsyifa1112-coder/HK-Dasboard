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
  Search, RefreshCw, Download, Plus, HandCoins, Loader2,
} from 'lucide-react';
import { type Loan, type Profile, type LoanItem } from '@/lib/types';

const LOAN_STATUS_LABELS: Record<Loan['status'], string> = {
  active: 'Active',
  returned: 'Returned',
  lost: 'Lost',
  damaged: 'Damaged',
};

const LOAN_STATUS_COLORS: Record<Loan['status'], string> = {
  active: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  returned: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  lost: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  damaged: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
};

export default function LoanManagementPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loanItems, setLoanItems] = useState<LoanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    staff_id: '',
    loan_item_id: '',
    quantity: '',
    notes: '',
  });

  const canEdit = profile?.role === 'admin' || profile?.role === 'supervisor' || profile?.role === 'order_taker';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [loanRes, staffRes, loanItemRes] = await Promise.all([
        supabase
          .from('loans')
          .select('*, staff:profiles(*), loan_item:loan_items(*)')
          .order('loaned_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('active', true).order('full_name'),
        supabase.from('loan_items').select('*').eq('active', true).order('name'),
      ]);

      setLoans((loanRes.data as Loan[]) || []);
      setStaff((staffRes.data as Profile[]) || []);
      setLoanItems((loanItemRes.data as LoanItem[]) || []);
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
      (l.staff?.full_name ?? '').toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const selectedLoanItem = loanItems.find((li) => li.id === form.loan_item_id);
  const requestedQty = parseInt(form.quantity, 10) || 1;
  const insufficientStock = !!selectedLoanItem && requestedQty > selectedLoanItem.stock;

  const handleCreate = async () => {
    if (!form.staff_id) {
      toast({ title: 'Validation', description: 'Please select a staff member', variant: 'destructive' });
      return;
    }
    if (!form.loan_item_id) {
      toast({ title: 'Validation', description: 'Please select an item', variant: 'destructive' });
      return;
    }
    if (insufficientStock) {
      toast({ title: 'Validation', description: 'Requested quantity exceeds available stock', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('loans').insert({
        staff_id: form.staff_id,
        loan_item_id: form.loan_item_id,
        item_name: selectedLoanItem?.name ?? '',
        quantity: requestedQty,
        notes: form.notes || null,
        status: 'active',
        loaned_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast({ title: 'Created', description: 'Loan recorded successfully' });
      setDialogOpen(false);
      setForm({ staff_id: '', loan_item_id: '', quantity: '', notes: '' });
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
      }
      const { error } = await supabase.from('loans').update(updates).eq('id', loan.id);
      if (error) throw error;
      toast({ title: 'Updated', description: 'Loan status updated' });
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

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search loan #, item, or staff..."
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
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Loaned</TableHead>
                <TableHead>Returned</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.loan_number ?? '-'}</TableCell>
                  <TableCell>{l.staff?.full_name ?? '-'}</TableCell>
                  <TableCell>
                    {l.item_name}
                    {l.loan_item && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({l.loan_item.code})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{l.quantity}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-xs', LOAN_STATUS_COLORS[l.status])}>
                      {LOAN_STATUS_LABELS[l.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {l.loaned_at ? new Date(l.loaned_at).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {l.returned_at ? new Date(l.returned_at).toLocaleDateString() : '-'}
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

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Loan</DialogTitle>
            <DialogDescription>Record an item loaned to a staff member</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Staff Member</Label>
              <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v })}>
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
            <div className="space-y-1.5">
              <Label>Item</Label>
              <Select value={form.loan_item_id} onValueChange={(v) => setForm({ ...form, loan_item_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select item" />
                </SelectTrigger>
                <SelectContent>
                  {loanItems.map((li) => (
                    <SelectItem key={li.id} value={li.id} disabled={li.stock <= 0}>
                      {li.name} ({li.code}) — stock: {li.stock} {li.unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {loanItems.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No loan items found. Add items in Loan Master Data first.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                max={selectedLoanItem?.stock}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                placeholder="1"
              />
              {insufficientStock && (
                <p className="text-xs text-destructive">
                  Only {selectedLoanItem?.stock} {selectedLoanItem?.unit} available.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Additional details..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || insufficientStock}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { canApproveAI } from '@/lib/permissions';
import {
  HOUSEKEEPING_STATUS_LABELS, HOUSEKEEPING_STATUS_COLORS,
  type Room, type HousekeepingStatus,
} from '@/lib/types';
import {
  Upload, Image as ImageIcon, ScanEye, CheckCircle2, XCircle,
  RefreshCw, Loader2, ShieldAlert, FileCheck2, Database, Pencil,
  AlertTriangle, Sparkles, ArrowRight, RotateCcw,
} from 'lucide-react';

type DetectedRow = {
  roomNumber: string;
  pmsStatus: HousekeepingStatus;
  dbStatus: HousekeepingStatus | null;
  dbRoomId: string | null;
  matched: boolean;
};

const STEPS = [
  { n: 1, label: 'Upload', icon: Upload },
  { n: 2, label: 'Read Rooms', icon: ScanEye },
  { n: 3, label: 'Read Status', icon: FileCheck2 },
  { n: 4, label: 'Compare', icon: Database },
  { n: 5, label: 'Preview', icon: Pencil },
  { n: 6, label: 'Approve', icon: ShieldAlert },
  { n: 7, label: 'Update', icon: CheckCircle2 },
];

const STATUS_VALUES = Object.keys(HOUSEKEEPING_STATUS_LABELS) as HousekeepingStatus[];

export default function AIVisionPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState(1);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [manualText, setManualText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [detectedRows, setDetectedRows] = useState<DetectedRow[]>([]);
  const [dbRooms, setDbRooms] = useState<Room[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const canApprove = canApproveAI(profile?.role);

  // Fetch DB rooms up front so comparison is ready after detection
  const fetchDbRooms = useCallback(async () => {
    setLoadingDb(true);
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .order('number');
      if (error) throw error;
      setDbRooms((data as Room[]) || []);
    } catch (err) {
      console.error('Error fetching rooms:', err);
      toast({
        title: 'Error',
        description: 'Failed to load rooms from database',
        variant: 'destructive',
      });
    } finally {
      setLoadingDb(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchDbRooms();
  }, [fetchDbRooms]);

  const reset = () => {
    setCurrentStep(1);
    setImagePreview(null);
    setFileName('');
    setManualText('');
    setDetectedRows([]);
    setApplied(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        description: 'Please upload an image file (PNG, JPG, etc.)',
        variant: 'destructive',
      });
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    setApplied(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        description: 'Please drop an image file (PNG, JPG, etc.)',
        variant: 'destructive',
      });
      return;
    }
    setFileName(file.name);
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
    }
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    setApplied(false);
  };

  // Parse the manual text area: one "roomNumber status" per line
  const parseManualText = (): { roomNumber: string; status: HousekeepingStatus }[] => {
    const lines = manualText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed: { roomNumber: string; status: HousekeepingStatus }[] = [];
    for (const line of lines) {
      // accept "101 dirty", "101: dirty", "101,dirty", "101 - dirty"
      const parts = line.split(/[\s,:|\t]+| - /).filter(Boolean);
      if (parts.length < 2) continue;
      const roomNumber = parts[0];
      const statusRaw = parts[1].toLowerCase();
      const status = STATUS_VALUES.find((s) => s === statusRaw);
      if (!status) continue;
      parsed.push({ roomNumber, status });
    }
    return parsed;
  };

  // Simulate the AI OCR detection + comparison
  const runDetection = async () => {
    setProcessing(true);
    setApplied(false);
    try {
      // Simulate processing latency for the "AI Vision" step
      await new Promise((r) => setTimeout(r, 900));

      let detected: { roomNumber: string; status: HousekeepingStatus }[] = [];

      if (manualText.trim()) {
        detected = parseManualText();
      }

      // If no manual text, simulate detection by sampling DB rooms and
      // randomly assigning some statuses (so the demo still produces data).
      if (detected.length === 0 && dbRooms.length > 0) {
        const sample = dbRooms.slice(0, Math.min(10, dbRooms.length));
        detected = sample.map((r) => ({
          roomNumber: r.number,
          status: STATUS_VALUES[Math.floor(Math.random() * STATUS_VALUES.length)],
        }));
      }

      if (detected.length === 0) {
        toast({
          title: 'Nothing detected',
          description:
            'No room data found. Paste room numbers + statuses (e.g. "101 dirty") or ensure rooms exist in the database.',
          variant: 'destructive',
        });
        setProcessing(false);
        return;
      }

      // Build comparison rows against DB rooms
      const rows: DetectedRow[] = detected.map((d) => {
        const dbRoom = dbRooms.find((r) => r.number === d.roomNumber);
        return {
          roomNumber: d.roomNumber,
          pmsStatus: d.status,
          dbStatus: dbRoom?.housekeeping_status ?? null,
          dbRoomId: dbRoom?.id ?? null,
          matched: dbRoom ? dbRoom.housekeeping_status === d.status : false,
        };
      });

      setDetectedRows(rows);
      setCurrentStep(6); // jump to preview/approve (steps 2-5 visualized via the data)
      toast({
        title: 'Detection complete',
        description: `${rows.length} rooms read from PMS screenshot.`,
      });
    } catch (err) {
      console.error('Detection error:', err);
      toast({
        title: 'Error',
        description: 'Failed to process screenshot',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const updateRowStatus = (index: number, status: HousekeepingStatus) => {
    setDetectedRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const matched = row.dbStatus !== null && row.dbStatus === status;
        return { ...row, pmsStatus: status, matched };
      })
    );
  };

  const applyUpdate = async () => {
    if (!canApprove) return;
    const validRows = detectedRows.filter((r) => r.dbRoomId);
    if (validRows.length === 0) {
      toast({
        title: 'Nothing to update',
        description: 'No detected rooms match existing database rooms.',
        variant: 'destructive',
      });
      return;
    }
    setApplying(true);
    try {
      // Update each room. (Small batch; fine for a demo. Could be a bulk RPC.)
      let ok = 0;
      let fail = 0;
      for (const row of validRows) {
        const updates: Record<string, unknown> = {
          housekeeping_status: row.pmsStatus,
        };
        if (row.pmsStatus === 'clean' || row.pmsStatus === 'inspected') {
          updates.last_cleaned_at = new Date().toISOString();
        }
        if (row.pmsStatus === 'occupied') updates.occupancy_status = 'occupied';
        if (row.pmsStatus === 'vacant') updates.occupancy_status = 'vacant';

        const { error } = await supabase
          .from('rooms')
          .update(updates)
          .eq('id', row.dbRoomId);
        if (error) {
          fail++;
        } else {
          ok++;
        }
      }

      // Log the activity
      await supabase.from('activity_logs').insert({
        user_id: profile?.id ?? null,
        user_name: profile?.full_name ?? null,
        action: 'ai_vision_sync',
        entity_type: 'rooms',
        details: {
          rooms_updated: ok,
          rooms_failed: fail,
          source: fileName || 'manual',
        },
      });

      if (fail > 0 && ok === 0) {
        toast({
          title: 'Update failed',
          description: `Failed to update ${fail} rooms.`,
          variant: 'destructive',
        });
      } else {
        setApplied(true);
        setCurrentStep(7);
        toast({
          title: 'Database updated',
          description: `${ok} room${ok === 1 ? '' : 's'} synced from PMS.${fail ? ` (${fail} failed)` : ''}`,
        });
        await fetchDbRooms();
      }
    } catch (err) {
      console.error('Apply error:', err);
      toast({
        title: 'Error',
        description: 'Failed to update database',
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  const mismatchCount = detectedRows.filter((r) => !r.matched && r.dbRoomId).length;
  const noDbMatchCount = detectedRows.filter((r) => !r.dbRoomId).length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="AI Vision OCR"
        description="Upload a PMS screenshot to sync room statuses with the database"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchDbRooms} disabled={loadingDb}>
              <RefreshCw className={cn('mr-2 h-4 w-4', loadingDb && 'animate-spin')} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reset
            </Button>
          </div>
        }
      />

      {/* Simulation note */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
        <Sparkles className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-amber-700 dark:text-amber-400">
            AI Vision OCR simulation
          </p>
          <p className="text-muted-foreground mt-0.5">
            In production this would call an AI vision API to read the screenshot. For now,
            upload an image for reference and paste the room data (one per line, e.g.
            <span className="font-mono mx-1">101 dirty</span>) or click Process to
            auto-generate sample data from the database.
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const active = currentStep === step.n;
          const done = currentStep > step.n;
          return (
            <div key={step.n} className="flex items-center">
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  active && 'border-primary bg-primary/10 text-primary',
                  done && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                  !active && !done && 'border-border text-muted-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                    active && 'bg-primary text-primary-foreground',
                    done && 'bg-emerald-500 text-white',
                    !active && !done && 'bg-muted text-muted-foreground'
                  )}
                >
                  {done ? <CheckCircle2 className="h-3 w-3" /> : step.n}
                </span>
                <Icon className="h-3 w-3 hidden sm:block" />
                <span className="hidden md:inline">{step.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <ArrowRight className="h-3 w-3 text-muted-foreground mx-0.5 hidden sm:block" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> Step 1 — Upload PMS Screenshot
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-6 text-center cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30',
              imagePreview && 'border-solid'
            )}
          >
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreview}
                alt="PMS screenshot preview"
                className="max-h-64 rounded-md object-contain"
              />
            ) : (
              <>
                <ImageIcon className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Drag & drop a screenshot here</p>
                <p className="text-xs text-muted-foreground mt-1">
                  or click to browse — PNG, JPG, WEBP
                </p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          {fileName && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileCheck2 className="h-4 w-4 text-emerald-500" />
              <span className="font-mono">{fileName}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Steps 2-3: Read room data */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScanEye className="h-4 w-4" /> Steps 2 & 3 — Detected Room Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="manualText">Room data (one per line: <span className="font-mono">roomNumber status</span>)</Label>
            <Textarea
              id="manualText"
              value={manualText}
              onChange={(e) => {
                setManualText(e.target.value);
                setApplied(false);
              }}
              placeholder={'101 dirty\n102 clean\n103 inspected\n201 occupied\n202 vacant'}
              rows={6}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Valid statuses: {STATUS_VALUES.join(', ')}. Leave empty to auto-generate
              sample data from the database on Process.
            </p>
          </div>
          <Button onClick={runDetection} disabled={processing || loadingDb}>
            {processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…
              </>
            ) : (
              <>
                <ScanEye className="mr-2 h-4 w-4" /> Process Screenshot
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Steps 4-5: Comparison + editable preview */}
      {detectedRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" /> Steps 4 & 5 — Compare & Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">
                Detected: {detectedRows.length}
              </Badge>
              <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mr-1 h-3 w-3" /> Mismatches: {mismatchCount}
              </Badge>
              {noDbMatchCount > 0 && (
                <Badge variant="outline" className="text-xs border-red-500/30 text-red-600 dark:text-red-400">
                  No DB match: {noDbMatchCount}
                </Badge>
              )}
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room</TableHead>
                    <TableHead>PMS Status</TableHead>
                    <TableHead>DB Status</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Adjust</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detectedRows.map((row, i) => (
                    <TableRow key={`${row.roomNumber}-${i}`}>
                      <TableCell className="font-mono font-semibold">{row.roomNumber}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn('text-xs', HOUSEKEEPING_STATUS_COLORS[row.pmsStatus])}
                        >
                          {HOUSEKEEPING_STATUS_LABELS[row.pmsStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.dbStatus ? (
                          <Badge
                            variant="outline"
                            className={cn('text-xs', HOUSEKEEPING_STATUS_COLORS[row.dbStatus])}
                          >
                            {HOUSEKEEPING_STATUS_LABELS[row.dbStatus]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not in DB</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!row.dbRoomId ? (
                          <span className="text-xs text-red-500">N/A</span>
                        ) : row.matched ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.pmsStatus}
                          onValueChange={(v) => updateRowStatus(i, v as HousekeepingStatus)}
                        >
                          <SelectTrigger className="h-8 w-[150px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_VALUES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {HOUSEKEEPING_STATUS_LABELS[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 6: Approve */}
      {detectedRows.length > 0 && !applied && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" /> Step 6 — Supervisor / Admin Approval
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canApprove ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Review the comparison above, adjust any statuses, then approve to update
                  the database.
                </p>
                <Button onClick={applyUpdate} disabled={applying} size="sm">
                  {applying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Approve & Update Database
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    Approval required
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    Only supervisors and administrators can approve AI Vision syncs. Ask an
                    admin to review and apply the update.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 7: Result */}
      {applied && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Step 7 — Database Updated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="font-medium">Sync complete</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {detectedRows.filter((r) => r.dbRoomId).length} rooms were updated from the
                  PMS screenshot. The room status board now reflects the latest PMS data.
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={reset}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Start New Sync
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton for DB rooms while initial load */}
      {loadingDb && detectedRows.length === 0 && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-muted animate-pulse" />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  AlertTriangle, ArrowRight, RotateCcw, Brain, X,
} from 'lucide-react';

type DetectedRow = {
  roomNumber: string;
  pmsStatus: HousekeepingStatus;
  dbStatus: HousekeepingStatus | null;
  dbRoomId: string | null;
  matched: boolean;
};

type UploadedImage = {
  base64: string;
  mime: string;
  name: string;
  preview: string;
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

const PMS_STATUS_MAP: Record<string, HousekeepingStatus> = {
  'vac. dirty': 'vacant_dirty',
  'vacant dirty': 'vacant_dirty',
  'vac dirty': 'vacant_dirty',
  'dirty': 'vacant_dirty',
  'vac. clean unchecked': 'vacant_clean_unchecked',
  'vacant clean unchecked': 'vacant_clean_unchecked',
  'vac clean unchecked': 'vacant_clean_unchecked',
  'vac. clean uncheck': 'vacant_clean_unchecked',
  'vacant clean uncheck': 'vacant_clean_unchecked',
  'vac clean uncheck': 'vacant_clean_unchecked',
  'clean uncheck': 'vacant_clean_unchecked',
  'clean unchecked': 'vacant_clean_unchecked',
  'vac. clean': 'vacant_clean',
  'vacant clean': 'vacant_clean',
  'clean': 'vacant_clean',
  'vacant': 'vacant_clean',
  'vac. clean checked': 'vacant_clean_inspected',
  'vacant clean checked': 'vacant_clean_inspected',
  'vac clean checked': 'vacant_clean_inspected',
  'inspected': 'vacant_clean_inspected',
  'occupied cleaned': 'occupied_clean',
  'occupied clean': 'occupied_clean',
  'occupied dirty': 'occupied_dirty',
  'occupied': 'occupied_dirty',
  'expected departure': 'expected_departure',
  'expected departure do': 'expected_departure',
  'exp. departure': 'expected_departure',
  'exp departure': 'expected_departure',
  'out of order': 'out_of_order',
  'oo': 'out_of_order',
  'ooo': 'out_of_order',
  'off market': 'off_market',
  'off_market': 'off_market',
  'om': 'off_market',
};

export default function AIVisionPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [manualText, setManualText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [detectedRows, setDetectedRows] = useState<DetectedRow[]>([]);
  const [dbRooms, setDbRooms] = useState<Room[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [aiMode, setAiMode] = useState(false);

  const canApprove = canApproveAI(profile?.role);

  const fetchDbRooms = useCallback(async () => {
    setLoadingDb(true);
    try {
      const { data, error } = await supabase.from('rooms').select('*').order('number');
      if (error) throw error;
      setDbRooms((data as Room[]) || []);
    } catch (err) {
      console.error('Error fetching rooms:', err);
      toast({ title: 'Error', description: 'Failed to load rooms from database', variant: 'destructive' });
    } finally {
      setLoadingDb(false);
    }
  }, [toast]);

  useEffect(() => { fetchDbRooms(); }, [fetchDbRooms]);

  const reset = () => {
    setCurrentStep(1);
    setImages([]);
    setManualText('');
    setDetectedRows([]);
    setApplied(false);
    setAiMode(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const readFileAsBase64 = (file: File): Promise<UploadedImage> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve({ base64, mime: file.type, name: file.name, preview: result });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) {
      toast({ title: 'Invalid file', description: 'Please upload image files (PNG, JPG, etc.)', variant: 'destructive' });
      return;
    }
    try {
      const uploaded = await Promise.all(files.map(readFileAsBase64));
      setImages((prev) => [...prev, ...uploaded]);
      setApplied(false);
    } catch (err) {
      console.error('Error reading files:', err);
      toast({ title: 'Error', description: 'Failed to read one or more images', variant: 'destructive' });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) processFiles(files);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) processFiles(files);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setApplied(false);
  };

  // Call server API route for each uploaded image, then merge results
  const readImagesWithAI = async (): Promise<{ roomNumber: string; status: HousekeepingStatus }[]> => {
    if (images.length === 0) return [];

    const merged = new Map<string, HousekeepingStatus>();

    for (const img of images) {
      const response = await fetch('/api/ai-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: img.base64, imageMime: img.mime }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(`${img.name}: ${err?.error ?? 'AI Vision API error'}`);
      }

      const data = await response.json();
      const parsed = data.rooms as { roomNumber: string; status: string }[];

      for (const r of parsed) {
        if (r.roomNumber && STATUS_VALUES.includes(r.status as HousekeepingStatus)) {
          // Later images override earlier ones for the same room number
          merged.set(String(r.roomNumber), r.status as HousekeepingStatus);
        }
      }
    }

    return Array.from(merged.entries()).map(([roomNumber, status]) => ({ roomNumber, status }));
  };

  const parseManualText = (): { roomNumber: string; status: HousekeepingStatus }[] => {
    const lines = manualText.split('\n').map((l) => l.trim()).filter(Boolean);
    const parsed: { roomNumber: string; status: HousekeepingStatus }[] = [];
    for (const line of lines) {
      const parts = line.split(/[\s,:|\t]+| - /).filter(Boolean);
      if (parts.length < 2) continue;
      const roomNumber = parts[0];
      const statusRaw = parts.slice(1).join(' ').toLowerCase().trim();
      let status = STATUS_VALUES.find((s) => s === statusRaw);
      if (!status) status = PMS_STATUS_MAP[statusRaw];
      if (!status) continue;
      parsed.push({ roomNumber, status });
    }
    return parsed;
  };

  const runDetection = async () => {
    setProcessing(true);
    setApplied(false);
    setAiMode(false);
    try {
      let detected: { roomNumber: string; status: HousekeepingStatus }[] = [];

      if (images.length > 0) {
        try {
          toast({
            title: 'Reading images...',
            description: `AI is analyzing ${images.length} PMS screenshot${images.length > 1 ? 's' : ''}`,
          });
          detected = await readImagesWithAI();
          setAiMode(true);
          if (detected.length === 0) {
            toast({
              title: 'No rooms detected',
              description: 'AI could not find room data. Try the manual text box below.',
              variant: 'destructive',
            });
          }
        } catch (aiErr) {
          console.error('AI reading failed:', aiErr);
          toast({
            title: 'AI reading failed',
            description: String(aiErr instanceof Error ? aiErr.message : aiErr),
            variant: 'destructive',
          });
        }
      }

      if (detected.length === 0 && manualText.trim()) {
        detected = parseManualText();
        setAiMode(false);
      }

      if (detected.length === 0) {
        toast({
          title: 'Nothing detected',
          description: 'AI could not read the screenshot(s) and no manual data was entered. Please check your Gemini API key/quota, or try the manual text box.',
          variant: 'destructive',
        });
        setProcessing(false);
        return;
      }

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
      setCurrentStep(6);
      toast({
        title: 'Detection complete',
        description: `${rows.length} rooms read from ${images.length > 0 ? `${images.length} screenshot${images.length > 1 ? 's' : ''}` : 'manual input'}${aiMode ? ' by AI' : ''}.`,
      });
    } catch (err) {
      console.error('Detection error:', err);
      toast({ title: 'Error', description: 'Failed to process screenshot(s)', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const updateRowStatus = (index: number, status: HousekeepingStatus) => {
    setDetectedRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        return { ...row, pmsStatus: status, matched: row.dbStatus !== null && row.dbStatus === status };
      })
    );
  };

  const applyUpdate = async () => {
    if (!canApprove) return;
    const validRows = detectedRows.filter((r) => r.dbRoomId);
    if (validRows.length === 0) {
      toast({ title: 'Nothing to update', description: 'No detected rooms match existing database rooms.', variant: 'destructive' });
      return;
    }
    setApplying(true);
    try {
      let ok = 0;
      let fail = 0;
      for (const row of validRows) {
        const updates: Record<string, unknown> = { housekeeping_status: row.pmsStatus };
        if (['vacant_clean_unchecked', 'vacant_clean', 'vacant_clean_inspected', 'occupied_clean'].includes(row.pmsStatus)) {
  updates.last_cleaned_at = new Date().toISOString();
}
        if (['occupied_clean', 'occupied_dirty', 'expected_departure'].includes(row.pmsStatus)) {
          updates.occupancy_status = 'occupied';
        }
       if (['vacant_dirty', 'vacant_clean_unchecked', 'vacant_clean', 'vacant_clean_inspected'].includes(row.pmsStatus)) {
  updates.occupancy_status = 'vacant';
}
        const { error } = await supabase.from('rooms').update(updates).eq('id', row.dbRoomId);
        if (error) { fail++; } else { ok++; }
      }
      await supabase.from('activity_logs').insert({
        user_id: profile?.id ?? null,
        user_name: profile?.full_name ?? null,
        action: 'ai_vision_sync',
        entity_type: 'rooms',
        details: { rooms_updated: ok, rooms_failed: fail, source: images.map((i) => i.name).join(', ') || 'manual', ai_read: aiMode },
      });
      if (fail > 0 && ok === 0) {
        toast({ title: 'Update failed', description: `Failed to update ${fail} rooms.`, variant: 'destructive' });
      } else {
        setApplied(true);
        setCurrentStep(7);
        toast({ title: 'Database updated', description: `${ok} room${ok === 1 ? '' : 's'} synced from PMS.${fail ? ` (${fail} failed)` : ''}` });
        await fetchDbRooms();
      }
    } catch (err) {
      console.error('Apply error:', err);
      toast({ title: 'Error', description: 'Failed to update database', variant: 'destructive' });
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
        description="Upload one or more PMS screenshots — AI will automatically read and sync room statuses"
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

      <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
        <Brain className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-blue-700 dark:text-blue-400">AI Vision OCR</p>
          <p className="text-muted-foreground mt-0.5">
            Upload one or more PMS screenshots and click <strong>Process Screenshot</strong> — AI will
            automatically read all room numbers and statuses across every image, then map them to the
            correct system format. No manual typing needed.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const active = currentStep === step.n;
          const done = currentStep > step.n;
          return (
            <div key={step.n} className="flex items-center">
              <div className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                active && 'border-primary bg-primary/10 text-primary',
                done && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                !active && !done && 'border-border text-muted-foreground'
              )}>
                <span className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                  active && 'bg-primary text-primary-foreground',
                  done && 'bg-emerald-500 text-white',
                  !active && !done && 'bg-muted text-muted-foreground'
                )}>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> Step 1 — Upload PMS Screenshot(s)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-6 text-center cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30',
              images.length > 0 && 'border-solid'
            )}
          >
            {images.length > 0 ? (
              <div className="flex flex-wrap gap-3 justify-center">
                {images.map((img, i) => (
                  <div key={i} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.preview} alt={img.name} className="h-32 rounded-md object-contain border border-border" />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-90 hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <p className="text-[10px] text-muted-foreground mt-1 max-w-[128px] truncate">{img.name}</p>
                  </div>
                ))}
                <div className="flex flex-col items-center justify-center h-32 w-32 rounded-md border-2 border-dashed border-border text-muted-foreground">
                  <ImageIcon className="h-6 w-6 mb-1" />
                  <span className="text-[10px]">Add more</span>
                </div>
              </div>
            ) : (
              <>
                <ImageIcon className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Drag & drop one or more screenshots here</p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse — PNG, JPG, WEBP (multiple files supported)</p>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
          {images.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileCheck2 className="h-4 w-4 text-emerald-500" />
              <span>{images.length} image{images.length > 1 ? 's' : ''} ready</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" /> Steps 2 & 3 — AI reads your PMS screenshot(s)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-muted bg-muted/30 p-3 text-sm text-muted-foreground">
            <p>If you have uploaded image(s) above, click <strong>Process Screenshot</strong> — AI will read all of them automatically and merge the results.</p>
            <p className="mt-1">Or paste room data manually below as fallback (one per line: <span className="font-mono">roomNumber status</span>):</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manualText">Manual override (optional)</Label>
            <Textarea
              id="manualText"
              value={manualText}
              onChange={(e) => { setManualText(e.target.value); setApplied(false); }}
              placeholder={'101 vacant_dirty\n102 vacant_clean\n103 vacant_clean_inspected'}
              rows={4}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Valid statuses: {STATUS_VALUES.join(', ')}. Also accepts PMS formats like "Vac. Clean Unchecked".
            </p>
          </div>
          <Button onClick={runDetection} disabled={processing || loadingDb} size="lg">
            {processing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reading with AI…</>
            ) : (
              <><Brain className="mr-2 h-4 w-4" /> Process Screenshot{images.length > 1 ? 's' : ''}</>
            )}
          </Button>
        </CardContent>
      </Card>

      {detectedRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" /> Steps 4 & 5 — Compare & Preview
              {aiMode && (
                <Badge variant="outline" className="text-xs ml-2 bg-blue-500/10 text-blue-600 border-blue-500/30">
                  <Brain className="mr-1 h-3 w-3" /> Read by AI
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">Detected: {detectedRows.length}</Badge>
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
                        <Badge variant="outline" className={cn('text-xs', HOUSEKEEPING_STATUS_COLORS[row.pmsStatus])}>
                          {HOUSEKEEPING_STATUS_LABELS[row.pmsStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.dbStatus ? (
                          <Badge variant="outline" className={cn('text-xs', HOUSEKEEPING_STATUS_COLORS[row.dbStatus])}>
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
                        <Select value={row.pmsStatus} onValueChange={(v) => updateRowStatus(i, v as HousekeepingStatus)}>
                          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUS_VALUES.map((s) => (
                              <SelectItem key={s} value={s}>{HOUSEKEEPING_STATUS_LABELS[s]}</SelectItem>
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

      {detectedRows.length > 0 && !applied && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" /> Step 6 — Supervisor / Admin Approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            {canApprove ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Review the comparison above, adjust any statuses if needed, then approve to update the database.
                </p>
                <Button onClick={applyUpdate} disabled={applying} size="sm">
                  {applying ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating…</>
                  ) : (
                    <><CheckCircle2 className="mr-2 h-4 w-4" /> Approve & Update Database</>
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="font-medium text-amber-700 dark:text-amber-400">Approval required</p>
                  <p className="text-muted-foreground mt-0.5">Only supervisors and administrators can approve AI Vision syncs.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                  {detectedRows.filter((r) => r.dbRoomId).length} rooms were updated from the PMS screenshot(s).
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={reset}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Start New Sync
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

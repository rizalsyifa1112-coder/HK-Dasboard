import { readRange, writeRange, appendRows, findTabByName, duplicateTemplateTab } from '@/lib/google-sheets';
import { createClient } from '@supabase/supabase-js';

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Nama tab dibuat per-bulan, contoh: "Public Area - Agustus 2026", supaya
// data tiap bulan tidak menumpuk di 1 tab dan gampang dihitung summary-nya.
// Tab baru dibuat otomatis (duplikat dari tab TEMPLATE) kalau bulan itu
// belum punya tab.
function getMonthTabName(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `Public Area - ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

const TITLE_ROW = ['JADWAL GABUNGAN PER TANGGAL — PUBLIC AREA (SYNC OTOMATIS DARI WEBSITE)'];
const DESC_ROW = ["Auto-sync dari website. Kolom PIC (Staff), Status & Catatan terisi otomatis sesuai progres staff. Kolom 'ID' (paling kanan) jangan diubah/dihapus — dipakai sistem untuk mencocokkan baris."];
const HEADER_ROW = ['No', 'Tanggal', 'Hari', 'Frequency', 'No Asal', 'Kategori', 'Zone', 'Item Pekerjaan', 'PIC (Staff)', 'Status', 'Catatan', 'ID'];

const DATA_START_ROW = 4; // baris 1=judul, 2=deskripsi, 3=header, data mulai baris 4

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  '3day': '3-Hari Sekali',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

const HARI_ID: Record<number, string> = {
  0: 'Minggu', 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis', 5: 'Jumat', 6: 'Sabtu',
};

const BULAN_ID: Record<number, string> = {
  0: 'Januari', 1: 'Februari', 2: 'Maret', 3: 'April', 4: 'Mei', 5: 'Juni',
  6: 'Juli', 7: 'Agustus', 8: 'September', 9: 'Oktober', 10: 'November', 11: 'Desember',
};

// Ditulis sebagai TEKS ("29 Juli 2026"), bukan tanggal Sheets asli — supaya
// tampilannya selalu benar apa pun setting locale/format spreadsheet-nya,
// dan tidak berubah jadi angka serial (46232, dst) di baris hasil sync.
function tanggalIndonesia(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function hariIndonesia(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return HARI_ID[d.getDay()];
}

/**
 * Sync 1 tanggal ke sheet Public Area, mengikuti format sheet master
 * (judul + deskripsi + 11 kolom seperti "Jadwal Gabungan Per Tanggal").
 * - Task yang sudah pernah disync (dicocokkan lewat kolom ID tersembunyi)
 *   di-UPDATE di baris yang sama.
 * - Task baru ditambahkan ke BAWAH data yang sudah ada.
 */
export async function syncPublicAreaTasksToSheet(date: string) {
  const spreadsheetId = process.env.PUBLIC_AREA_SHEET_ID;
  if (!spreadsheetId) {
    throw new Error('PUBLIC_AREA_SHEET_ID belum di-set di environment variables');
  }

  // 0) Tab bulanan sesuai tanggal task, contoh "Public Area - Agustus 2026".
  //    Kalau tab bulan itu belum ada, buat otomatis dengan duplikat tab
  //    TEMPLATE (PUBLIC_AREA_TEMPLATE_SHEET_ID = sheetId/gid tab template,
  //    bukan nama tab).
  const tabName = getMonthTabName(date);
  const existingTabId = await findTabByName(spreadsheetId, tabName);
  if (!existingTabId) {
    const templateSheetIdRaw = process.env.PUBLIC_AREA_TEMPLATE_SHEET_ID;
    if (!templateSheetIdRaw) {
      throw new Error('PUBLIC_AREA_TEMPLATE_SHEET_ID belum di-set di environment variables (perlu untuk membuat tab bulan baru)');
    }
    await duplicateTemplateTab(spreadsheetId, Number(templateSheetIdRaw), tabName);
  }

  const supabase = getServiceSupabase();
  const { data: tasks, error } = await supabase
    .from('public_area_tasks')
    .select('*, staff:profiles!staff_id(full_name), template:public_area_task_templates(frequency, no_asal)')
    .eq('task_date', date)
    .order('kategori', { ascending: true })
    .order('zone', { ascending: true });

  if (error) throw error;

  // 1) Pastikan judul + deskripsi + header sudah ada (cuma ditulis kalau
  //    sheet memang masih benar-benar kosong)
  const existingTitle = await readRange(spreadsheetId, `${tabName}!A1:A1`);
  if (existingTitle.length === 0 || !existingTitle[0]?.[0]) {
    await writeRange(spreadsheetId, `${tabName}!A1:A1`, [TITLE_ROW]);
    await writeRange(spreadsheetId, `${tabName}!A2:A2`, [DESC_ROW]);
    await writeRange(spreadsheetId, `${tabName}!A3:L3`, [HEADER_ROW]);
  }

  // 2) Baca semua baris data yang sudah ada (mulai baris 4), cari kolom ID
  //    (kolom L / index ke-11) untuk tahu task mana yang sudah punya baris
  const existingRows = await readRange(spreadsheetId, `${tabName}!A${DATA_START_ROW}:L100000`);
  const rowNumberByTaskId = new Map<string, number>();
  let lastRowNumber = DATA_START_ROW - 1;
  existingRows.forEach((row, idx) => {
    const sheetRowNum = DATA_START_ROW + idx;
    const taskId = row[11]; // kolom L (index 11)
    const hasAnyData = row.some((cell) => cell);
    if (hasAnyData) lastRowNumber = sheetRowNum;
    if (taskId) rowNumberByTaskId.set(taskId, sheetRowNum);
  });

  const rowsToAppend: (string | number)[][] = [];
  const updates: { range: string; values: (string | number)[][] }[] = [];
  let nextNo = lastRowNumber - (DATA_START_ROW - 1) + 1; // lanjutkan nomor urut "No"

  for (const t of tasks ?? []) {
    const existingRowNum = rowNumberByTaskId.get(t.id);

    if (existingRowNum) {
      // Sudah ada barisnya -> update kolom yang bisa berubah saja
      // (PIC, Status, Catatan), kolom lain dibiarkan supaya urutan &
      // data statis (tanggal, hari, dst) tidak keubah tiap sync.
      updates.push({
        range: `${tabName}!I${existingRowNum}:K${existingRowNum}`,
        values: [[t.staff?.full_name ?? '', STATUS_LABELS[t.status] ?? t.status, t.notes ?? '']],
      });
    } else {
      // Task baru -> baris baru, lengkap 12 kolom (termasuk ID di kolom L)
      rowsToAppend.push([
        nextNo,
        tanggalIndonesia(t.task_date),
        hariIndonesia(t.task_date),
        t.template?.frequency ? (FREQUENCY_LABELS[t.template.frequency] ?? t.template.frequency) : '',
        t.template?.no_asal ?? '',
        t.kategori,
        t.zone,
        t.item_pekerjaan,
        t.staff?.full_name ?? '',
        STATUS_LABELS[t.status] ?? t.status,
        t.notes ?? '',
        t.id,
      ]);
      nextNo += 1;
    }
  }

  for (const u of updates) {
    await writeRange(spreadsheetId, u.range, u.values);
  }

  if (rowsToAppend.length > 0) {
    await appendRows(spreadsheetId, `${tabName}!A3:L3`, rowsToAppend);
  }

  await supabase
    .from('public_area_tasks')
    .update({ synced_at: new Date().toISOString() })
    .eq('task_date', date);

  // 4) Update tab Summary (akumulasi all-time, dari 59 master project).
  //    Dibungkus try/catch sendiri supaya kalau ada masalah di sini
  //    (mis. tab "Summary" belum dibuat), sync utama tetap dianggap
  //    berhasil dan tidak melempar error ke pemanggil.
  try {
    await updatePublicAreaSummary(spreadsheetId, supabase);
  } catch (err) {
    console.error('Update summary Public Area gagal:', err);
  }

  return { updated: updates.length, appended: rowsToAppend.length, tabName };
}

const SUMMARY_TAB_NAME = 'Summary';

/**
 * Hitung pencapaian akumulasi (all-time) dari seluruh master project
 * Public Area: dari total master project (public_area_task_templates),
 * berapa yang SUDAH PERNAH selesai minimal 1x (status completed di
 * public_area_tasks, kapan pun tanggalnya) — lalu tulis ke tab "Summary".
 * Tab "Summary" harus sudah ada (dibuat manual sekali, kosong juga tidak
 * masalah, tab ini ditulis penuh oleh fungsi ini setiap kali sync jalan).
 */
export async function updatePublicAreaSummary(
  spreadsheetId: string,
  supabase: ReturnType<typeof getServiceSupabase>
) {
  const { data: templates, error: templatesError } = await supabase
    .from('public_area_task_templates')
    .select('id, no_asal, kategori')
    .order('no_asal', { ascending: true });
  if (templatesError) throw templatesError;

  const { data: completedTasks, error: completedError } = await supabase
    .from('public_area_tasks')
    .select('template_id')
    .eq('status', 'completed')
    .not('template_id', 'is', null);
  if (completedError) throw completedError;

  const achievedIds = new Set((completedTasks ?? []).map((t) => t.template_id));

  const totalMaster = templates?.length ?? 0;
  const achievedMaster = (templates ?? []).filter((tpl) => achievedIds.has(tpl.id)).length;
  const persen = totalMaster > 0 ? (achievedMaster / totalMaster) * 100 : 0;

  // Breakdown per kategori, urutan sesuai kemunculan pertama di master list
  const kategoriOrder: string[] = [];
  const kategoriStats = new Map<string, { total: number; achieved: number }>();
  for (const tpl of templates ?? []) {
    const kat = tpl.kategori ?? '(Tanpa Kategori)';
    if (!kategoriStats.has(kat)) {
      kategoriStats.set(kat, { total: 0, achieved: 0 });
      kategoriOrder.push(kat);
    }
    const stat = kategoriStats.get(kat)!;
    stat.total += 1;
    if (achievedIds.has(tpl.id)) stat.achieved += 1;
  }

  // Breakdown per bulan: dari semua task yang pernah dibuat (task_date apa
  // pun), berapa % yang berstatus completed di bulan itu. Ini beda dari
  // stat di atas (yang "pernah selesai minimal 1x" per master project) —
  // ini murni volume task per bulan.
  const { data: allTasks, error: allTasksError } = await supabase
    .from('public_area_tasks')
    .select('task_date, status');
  if (allTasksError) throw allTasksError;

  const monthStats = new Map<string, { total: number; completed: number; label: string; sortKey: string }>();
  for (const t of allTasks ?? []) {
    if (!t.task_date) continue;
    const [yStr, mStr] = String(t.task_date).split('-');
    const y = Number(yStr);
    const m = Number(mStr) - 1;
    if (!yStr || Number.isNaN(y) || Number.isNaN(m)) continue;
    const key = `${yStr}-${mStr}`;
    if (!monthStats.has(key)) {
      monthStats.set(key, { total: 0, completed: 0, label: `${BULAN_ID[m]} ${y}`, sortKey: key });
    }
    const stat = monthStats.get(key)!;
    stat.total += 1;
    if (t.status === 'completed') stat.completed += 1;
  }
  const monthRows = Array.from(monthStats.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const now = new Date();
  const rows: (string | number)[][] = [
    ['SUMMARY PENCAPAIAN PUBLIC AREA — AKUMULASI ALL TIME'],
    [`Auto-update setiap kali ada sync. Terakhir diperbarui: ${now.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`],
    [],
    ['Total Master Project', totalMaster],
    ['Sudah Pernah Selesai (≥1x)', achievedMaster],
    ['Persentase Pencapaian', `${persen.toFixed(1)}%`],
    [],
    ['Kategori', 'Total', 'Selesai', 'Persentase'],
    ...kategoriOrder.map((kat) => {
      const s = kategoriStats.get(kat)!;
      const p = s.total > 0 ? (s.achieved / s.total) * 100 : 0;
      return [kat, s.total, s.achieved, `${p.toFixed(1)}%`];
    }),
    [],
    ['Pencapaian Per Bulan', '', '', ''],
    ['Bulan', 'Total Task', 'Selesai', 'Persentase'],
    ...monthRows.map((s) => {
      const p = s.total > 0 ? (s.completed / s.total) * 100 : 0;
      return [s.label, s.total, s.completed, `${p.toFixed(1)}%`];
    }),
  ];

  // Bersihkan isi lama dulu (kalau kategori/bulan berkurang, baris sisa
  // tidak nyangkut), baru tulis ulang penuh.
  await writeRange(spreadsheetId, `${SUMMARY_TAB_NAME}!A1:D300`, Array.from({ length: 300 }, () => ['', '', '', '']));
  await writeRange(spreadsheetId, `${SUMMARY_TAB_NAME}!A1:D${rows.length}`, rows.map((r) => {
    const padded = [...r];
    while (padded.length < 4) padded.push('');
    return padded as (string | number)[];
  }));
}

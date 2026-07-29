import { readRange, writeRange, appendRows } from '@/lib/google-sheets';
import { createClient } from '@supabase/supabase-js';

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const SHEET_TAB_NAME = 'Public Area';

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

function dayNameEn(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
}

/**
 * Sync 1 tanggal ke sheet Public Area, mengikuti format PERSIS sheet master
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
  const existingTitle = await readRange(spreadsheetId, `${SHEET_TAB_NAME}!A1:A1`);
  if (existingTitle.length === 0 || !existingTitle[0]?.[0]) {
    await writeRange(spreadsheetId, `${SHEET_TAB_NAME}!A1:A1`, [TITLE_ROW]);
    await writeRange(spreadsheetId, `${SHEET_TAB_NAME}!A2:A2`, [DESC_ROW]);
    await writeRange(spreadsheetId, `${SHEET_TAB_NAME}!A3:L3`, [HEADER_ROW]);
  }

  // 2) Baca semua baris data yang sudah ada (mulai baris 4), cari kolom ID
  //    (kolom L / index ke-11) untuk tahu task mana yang sudah punya baris
  const existingRows = await readRange(spreadsheetId, `${SHEET_TAB_NAME}!A${DATA_START_ROW}:L100000`);
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
      // (PIC, Status, Catatan), kolom lain (No/Tanggal/Hari/dst) dibiarkan
      // supaya urutan & data statis tidak keubah tiap sync.
      updates.push({
        range: `${SHEET_TAB_NAME}!I${existingRowNum}:K${existingRowNum}`,
        values: [[t.staff?.full_name ?? '', STATUS_LABELS[t.status] ?? t.status, t.notes ?? '']],
      });
    } else {
      // Task baru -> baris baru, lengkap 12 kolom (termasuk ID di kolom L)
      rowsToAppend.push([
        nextNo,
        t.task_date,
        dayNameEn(t.task_date),
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
    await appendRows(spreadsheetId, `${SHEET_TAB_NAME}!A3:L3`, rowsToAppend);
  }

  await supabase
    .from('public_area_tasks')
    .update({ synced_at: new Date().toISOString() })
    .eq('task_date', date);

  return { updated: updates.length, appended: rowsToAppend.length };
}

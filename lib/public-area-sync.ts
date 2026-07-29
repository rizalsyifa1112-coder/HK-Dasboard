import { readRange, writeRange, appendRows } from '@/lib/google-sheets';
import { createClient } from '@supabase/supabase-js';

// Gunakan service role key di server (API route), bukan anon key,
// supaya sync tidak terbentur RLS dan bisa baca semua task apa pun rolenya.
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const SHEET_TAB_NAME = 'Public Area'; // nama tab di spreadsheet baru
const HEADER = ['Tanggal', 'Kategori', 'Zone', 'Item Pekerjaan', 'Status', 'PIC', 'Catatan', 'Selesai Pada'];

// Kunci unik 1 baris: tanggal + kategori + zone + item. Dipakai untuk
// mendeteksi "ini baris yang sama, tinggal update" vs "ini baris baru".
function rowKey(tanggal: string, kategori: string, zone: string, item: string) {
  return `${tanggal}|||${kategori}|||${zone}|||${item}`;
}

/**
 * Sync 1 tanggal ke sheet Public Area:
 * - Baris yang SUDAH ADA di sheet untuk task yang sama di-UPDATE di tempatnya
 *   (misal status berubah dari Belum -> Selesai).
 * - Task yang BELUM ADA baris-nya di sheet ditambahkan ke BAWAH data yang
 *   sudah ada (tidak menimpa baris tanggal lain).
 */
export async function syncPublicAreaTasksToSheet(date: string) {
  const spreadsheetId = process.env.PUBLIC_AREA_SHEET_ID;
  if (!spreadsheetId) {
    throw new Error('PUBLIC_AREA_SHEET_ID belum di-set di environment variables');
  }

  const supabase = getServiceSupabase();
  const { data: tasks, error } = await supabase
    .from('public_area_tasks')
    .select('*, staff:profiles!staff_id(full_name)')
    .eq('task_date', date)
    .order('kategori', { ascending: true })
    .order('zone', { ascending: true });

  if (error) throw error;

  // 1) Pastikan header ada di baris 1 (cuma ditulis kalau memang masih kosong)
  const existingHeader = await readRange(spreadsheetId, `${SHEET_TAB_NAME}!A1:H1`);
  if (existingHeader.length === 0 || !existingHeader[0]?.[0]) {
    await writeRange(spreadsheetId, `${SHEET_TAB_NAME}!A1:H1`, [HEADER]);
  }

  // 2) Baca SEMUA baris data yang sudah ada (baris 2 ke bawah) untuk tahu
  //    mana yang perlu di-update vs mana yang baris baru
  const existingRows = await readRange(spreadsheetId, `${SHEET_TAB_NAME}!A2:H100000`);
  const rowIndexByKey = new Map<string, number>(); // key -> nomor baris asli di sheet (2-based)
  existingRows.forEach((row, idx) => {
    const [tanggal, kategori, zone, item] = row;
    if (!tanggal) return;
    rowIndexByKey.set(rowKey(tanggal, kategori ?? '', zone ?? '', item ?? ''), idx + 2);
  });

  const rowsToAppend: (string | number)[][] = [];
  const updates: { range: string; values: (string | number)[][] }[] = [];

  for (const t of tasks ?? []) {
    const rowValues = [
      t.task_date,
      t.kategori,
      t.zone,
      t.item_pekerjaan,
      t.status,
      t.staff?.full_name ?? '',
      t.notes ?? '',
      t.completed_at ?? '',
    ];
    const key = rowKey(t.task_date, t.kategori, t.zone, t.item_pekerjaan);
    const existingRowNum = rowIndexByKey.get(key);

    if (existingRowNum) {
      // Task ini sudah ada baris-nya -> update di tempat yang sama
      updates.push({ range: `${SHEET_TAB_NAME}!A${existingRowNum}:H${existingRowNum}`, values: [rowValues] });
    } else {
      // Task baru -> masuk antrian untuk ditambahkan ke bawah
      rowsToAppend.push(rowValues);
    }
  }

  // 3) Jalankan semua update baris yang sudah ada
  for (const u of updates) {
    await writeRange(spreadsheetId, u.range, u.values);
  }

  // 4) Tambahkan baris-baris baru ke BAWAH data yang sudah ada (tidak menimpa)
  if (rowsToAppend.length > 0) {
    await appendRows(spreadsheetId, `${SHEET_TAB_NAME}!A1:H1`, rowsToAppend);
  }

  await supabase
    .from('public_area_tasks')
    .update({ synced_at: new Date().toISOString() })
    .eq('task_date', date);

  return { updated: updates.length, appended: rowsToAppend.length };
}

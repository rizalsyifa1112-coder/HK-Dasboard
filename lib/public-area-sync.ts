import { writeRange } from '@/lib/google-sheets';
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

/**
 * Tulis ulang seluruh baris task untuk 1 tanggal ke sheet Public Area.
 * Dipanggil dari API route /api/public-area/sync.
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

  const rows = (tasks ?? []).map((t: any) => [
    t.task_date,
    t.kategori,
    t.zone,
    t.item_pekerjaan,
    t.status,
    t.staff?.full_name ?? '',
    t.notes ?? '',
    t.completed_at ?? '',
  ]);

  // Baris 1 = header, data mulai baris 2. Ini menimpa isi lama untuk range
  // yang dipakai; kalau volume task per hari berubah-ubah, sheet perlu
  // cukup baris kosong di bawahnya atau pertimbangkan clear range dulu.
  await writeRange(spreadsheetId, `${SHEET_TAB_NAME}!A1:H1`, [HEADER]);
  if (rows.length > 0) {
    await writeRange(spreadsheetId, `${SHEET_TAB_NAME}!A2:H${rows.length + 1}`, rows);
  }

  await supabase
    .from('public_area_tasks')
    .update({ synced_at: new Date().toISOString() })
    .eq('task_date', date);

  return { synced: rows.length };
}

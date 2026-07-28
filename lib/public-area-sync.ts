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

// PENTING: nama tab harus persis sama dengan nama tab di spreadsheet
// (hasil duplicate dari "Jadwal Gabungan Per Tanggal"). Cek dulu nama
// tab-nya di Google Sheets sebelum deploy — kalau beda, ganti di sini.
const SHEET_TAB_NAME = 'Public Area';

// Data mulai di baris 4 karena baris 1-3 adalah judul, subjudul, dan
// header kolom yang sudah ada bawaan dari hasil duplicate template.
const FIRST_DATA_ROW = 4;
const LAST_COLUMN = 'K'; // No, Tanggal, Hari, Frequency, No Asal, Kategori, Zone, Item Pekerjaan, PIC, Status, Catatan

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];

// Mapping status internal -> label yang mau ditampilkan di sheet.
// Sesuaikan kalau label yang diinginkan di sheet berbeda.
function mapStatus(status: string) {
  switch (status) {
    case 'completed':
      return 'Selesai';
    case 'in_progress':
      return 'Sedang Dikerjakan';
    default:
      return 'Belum Dikerjakan';
  }
}

function namaHari(dateStr: string) {
  // dateStr formatnya 'YYYY-MM-DD'; parse manual supaya tidak kena
  // pergeseran timezone dari `new Date('YYYY-MM-DD')`.
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return HARI_ID[dt.getDay()];
}

/**
 * Tulis ulang seluruh baris task untuk 1 tanggal ke sheet Public Area,
 * mengikuti struktur kolom yang sama dengan tab "Jadwal Gabungan Per Tanggal":
 * No | Tanggal | Hari | Frequency | No Asal | Kategori | Zone | Item Pekerjaan | PIC (Staff) | Status | Catatan
 *
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
    .select(
      `*,
      staff:profiles!staff_id(full_name),
      template:public_area_task_templates!template_id(no_asal, frequency)`
    )
    .eq('task_date', date)
    .order('kategori', { ascending: true })
    .order('zone', { ascending: true });

  if (error) throw error;

  const rows = (tasks ?? []).map((t: any, idx: number) => [
    idx + 1, // No
    t.task_date, // Tanggal
    namaHari(t.task_date), // Hari
    t.template?.frequency ?? '', // Frequency
    t.template?.no_asal ?? '', // No Asal
    t.kategori, // Kategori
    t.zone, // Zone
    t.item_pekerjaan, // Item Pekerjaan
    t.staff?.full_name ?? '', // PIC (Staff)
    mapStatus(t.status), // Status
    t.notes ?? '', // Catatan
  ]);

  // Header (baris 1-3) tidak ditulis ulang di sini karena sudah ada
  // bawaan dari hasil duplicate tab template. Data ditulis mulai baris 4.
  //
  // Catatan: kalau jumlah task per tanggal berubah-ubah (lebih sedikit
  // dari sync sebelumnya), baris sisa di bawahnya tidak otomatis
  // terhapus. Kalau itu jadi masalah, tambahkan langkah "clear range"
  // dulu sebelum menulis data baru.
  if (rows.length > 0) {
    const lastRow = FIRST_DATA_ROW + rows.length - 1;
    await writeRange(
      spreadsheetId,
      `${SHEET_TAB_NAME}!A${FIRST_DATA_ROW}:${LAST_COLUMN}${lastRow}`,
      rows
    );
  }

  await supabase
    .from('public_area_tasks')
    .update({ synced_at: new Date().toISOString() })
    .eq('task_date', date);

  return { synced: rows.length };
}

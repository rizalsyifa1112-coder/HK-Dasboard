// lib/laundry-sheet-map.ts
// Helper khusus untuk sync Daily Laundry ke Google Sheets.
// Berbeda dari sheet-column-map.ts (yang dipakai Room Attendant, model row-per-kamar),
// di sini modelnya row-tetap-per-item x kolom-tanggal (1-30/31 = kolom B-AE / B-AF).

const MONTH_NAMES_ID = [
  'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
  'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER',
];

/**
 * Nama tab bulanan, contoh: 18 Juli 2026 -> "JULI 2026" (pakai spasi, sesuai tab asli)
 * Sesuaikan lagi di sini kalau format tab kamu ternyata beda.
 */
export function getMonthTabName(date: Date): string {
  const monthName = MONTH_NAMES_ID[date.getMonth()];
  return `${monthName} ${date.getFullYear()}`;
}

/**
 * Konversi nomor hari (1-31) jadi huruf kolom, dengan hari 1 = kolom B.
 * day=1 -> B, day=2 -> C, ... day=30 -> AE, day=31 -> AF
 */
export function dayToColumnLetter(day: number): string {
  const colIndex = day + 1; // B = index 2 (1-based: A=1,B=2,...)
  let result = '';
  let n = colIndex;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/**
 * Bangun referensi sel A1 lengkap untuk sebuah item pada tanggal tertentu.
 * contoh: buildCellRef('APRIL2026', 16, 18) -> "APRIL2026!R16"  (hari ke-18 -> kolom R)
 */
export function buildCellRef(tabName: string, sheetRow: number, day: number): string {
  const col = dayToColumnLetter(day);
  return `${tabName}!${col}${sheetRow}`;
}

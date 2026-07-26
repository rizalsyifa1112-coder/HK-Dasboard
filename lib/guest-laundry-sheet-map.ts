// lib/guest-laundry-sheet-map.ts
// Helper khusus untuk sync fitur "Laundry Guest" (baru) ke Google Sheets.
// BEDA dari lib/laundry-sheet-map.ts (punya fitur Linen General):
//  - nama tab pakai format Inggris, contoh "July 2026" (bukan "JULI 2026")
//  - hari ke-1 mulai di kolom C (bukan B), karena kolom A = nama item,
//    kolom B kosong/spacer di template Guest Laundry.

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Nama tab bulanan, contoh: 18 Juli 2026 -> "July 2026"
 */
export function getMonthTabName(date: Date): string {
  const monthName = MONTH_NAMES_EN[date.getMonth()];
  return `${monthName} ${date.getFullYear()}`;
}

/**
 * Konversi nomor hari (1-31) jadi huruf kolom, dengan hari 1 = kolom C.
 * day=1 -> C, day=2 -> D, ... day=26 -> AB, day=28 -> AD
 */
export function dayToColumnLetter(day: number): string {
  const colIndex = day + 2; // C = index 3 (1-based: A=1,B=2,C=3,...)
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
 * contoh: buildCellRef('July 2026', 9, 18) -> "July 2026!T9" (hari ke-18 -> kolom T)
 */
export function buildCellRef(tabName: string, sheetRow: number, day: number): string {
  const col = dayToColumnLetter(day);
  // Nama tab ada spasi -> perlu dibungkus tanda kutip tunggal sesuai aturan A1 notation
  return `'${tabName}'!${col}${sheetRow}`;
}

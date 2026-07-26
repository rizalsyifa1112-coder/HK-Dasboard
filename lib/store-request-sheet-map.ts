// lib/store-request-sheet-map.ts
//
// File terpisah khusus untuk Store Request — TIDAK menyentuh
// lib/guest-laundry-sheet-map.ts milik fitur laundry.
//
// Struktur tab "TEMPLATE SR" (dari TEMPLATE_STORE_REQUEST.xlsx):
//   Kolom C     = PRICE (harga satuan, per baris item)
//   WEEK 1: kolom F-L  = tanggal 1-7
//   WEEK 2: kolom O-U  = tanggal 8-14
//   WEEK 3: kolom X-AD = tanggal 15-21
//   WEEK 4: kolom AG-AP = tanggal 22-31
//
// Baris (row) tiap item mengikuti kolom `sheet_row` di tabel
// store_request_items (lihat migration SQL).

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Contoh: 2026-07-15 -> "SR July 2026" */
export function getStoreRequestTabName(date: Date): string {
  const month = MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();
  return `SR ${month} ${year}`;
}

/** Konversi nomor kolom (1-indexed) ke huruf kolom spreadsheet, mis. 6 -> "F", 33 -> "AG" */
function columnNumberToLetter(colNum: number): string {
  let letter = '';
  let n = colNum;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/**
 * Tanggal dalam bulan (1-31) -> nomor kolom di tab TEMPLATE SR.
 * Melempar error kalau day di luar 1-31.
 */
export function dayToColumnNumber(day: number): number {
  if (day >= 1 && day <= 7) return 6 + (day - 1); // F=6 .. L=12
  if (day >= 8 && day <= 14) return 15 + (day - 8); // O=15 .. U=21
  if (day >= 15 && day <= 21) return 24 + (day - 15); // X=24 .. AD=30
  if (day >= 22 && day <= 31) return 33 + (day - 22); // AG=33 .. AP=42
  throw new Error(`Tanggal tidak valid untuk sheet Store Request: ${day}`);
}

/**
 * Bangun referensi cell A1-notation untuk qty item pada tanggal tertentu.
 * Contoh: buildStoreRequestCellRef('SR July 2026', 5, 15) -> "'SR July 2026'!X5"
 */
export function buildStoreRequestCellRef(
  tabName: string,
  sheetRow: number,
  day: number
): string {
  const colNum = dayToColumnNumber(day);
  const colLetter = columnNumberToLetter(colNum);
  return `'${tabName}'!${colLetter}${sheetRow}`;
}

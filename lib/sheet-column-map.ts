// Kolom H-W: 8 item linen, urutan sesuai template (masing² IN lalu OUT)
export const LINEN_COLUMN_ORDER = [
  'King Bed Sheet',      // → SHEET KING
  'Queen Bed Sheet',     // → SHEET TWIN
  'Duver Cover King',    // → DUVET COVER KING
  'Duve Cover Twin',     // → DUVET COVER TWIN
  'Bath Towel',
  'Hand Towel',
  'Bath Mat',
  'Pillow Case',
] as const;

// Kolom X-AQ: guest supplies & condiment, urutan sesuai template (1 angka saja)
// ⚠️ Beberapa nama sengaja ditulis sesuai typo yang ada di database Anda
// supaya tetap ke-match (matching di kode ini case-insensitive, tapi ejaan
// harus tetap sama persis huruf-nya)
export const AMENITY_COLUMN_ORDER = [
  'Tissue Roll',
  'Hand Soap',      // ⚠️ belum ada di database Anda, akan selalu 0
  'Shampoo',        // ⚠️ belum ada di database Anda, akan selalu 0
  'Shower Gel',      // ⚠️ belum ada di database Anda, akan selalu 0
  'Dental Kit',      // ⬅️ dipetakan ke slot "Tooth Brush" di template
  'Sterer',
  'Shower Cap',
  'Sliper',          // ⚠️ typo di database, sengaja ditulis begini
  'Laundry Bag',
  'Laundry List',
  'Memo Pad',
  'Pecil',           // ⚠️ typo di database, sengaja ditulis begini
  'Guest Comment',   // ⚠️ belum ada di database Anda, akan selalu 0
  'Plastic Bin',
  'Tissue Facial',
  'Coffe',           // ⚠️ typo di database, sengaja ditulis begini
  'Sugar',
  'Tea',
  'Creamer',
  'Mineral Water',
] as const;

const norm = (s: string) => s.trim().toLowerCase();

export function buildRoomRow(params: {
  no: number;
  roomNumber: string;
  foStatus: string;
  hkStatusIn: string;
  hkStatusFinal: string;
  timeIn: string;
  timeOut: string;
  linenUsage: { itemName: string; qtyIn: number; qtyOut: number }[];
  amenityUsage: { itemName: string; quantity: number }[];
}): (string | number)[] {
  const row: (string | number)[] = [
    params.no,
    params.roomNumber,
    params.foStatus ?? '',
    params.hkStatusIn ?? '',
    params.hkStatusFinal ?? '',
    params.timeIn ?? '',
    params.timeOut ?? '',
  ];

  for (const item of LINEN_COLUMN_ORDER) {
    const match = params.linenUsage.find((u) => norm(u.itemName) === norm(item));
    row.push(match?.qtyIn ?? 0, match?.qtyOut ?? 0);
  }

  for (const item of AMENITY_COLUMN_ORDER) {
    const match = params.amenityUsage.find((u) => norm(u.itemName) === norm(item));
    row.push(match?.quantity ?? 0);
  }

  return row;
}

// Kolom H-W: 8 item linen, urutan sesuai template (masing² IN lalu OUT)
export const LINEN_COLUMN_ORDER = [
  'Sheet King',
  'Sheet Twin',
  'Duver Cover King',
  'Duve Cover Twin',
  'Bath Towel',
  'Hand Towel',
  'Bath Mat',
  'Pillow Case',
] as const;

// Kolom X-AQ: guest supplies & condiment, urutan sesuai template (1 angka saja)
// ⚠️ Beberapa nama sengaja ditulis sesuai typo yang ada di database Anda
export const AMENITY_COLUMN_ORDER = [
  'Tissue Roll',
  'Hand Soap',
  'Shampoo',
  'Shower Gel',
  'Dental Kit',
  'Sterer',
  'Shower Cap',
  'Sliper',
  'Laundry Bag',
  'Laundry List',
  'Memo Pad',
  'Pecil',
  'Guest Comment',
  'Plastic Bin',
  'Tissue Facial',
  'Coffe',
  'Sugar',
  'Tea',
  'Creamer',
  'Mineral Water',
] as const;

// Singkatan status housekeeping/FO — dipakai untuk kolom FO, HK IN, HK OUT di sheet
const STATUS_ABBR: Record<string, string> = {
  vacant_dirty: 'VD',
  vacant_clean_unchecked: 'VCU',
  vacant_clean: 'VC',
  vacant_clean_inspected: 'VCI',
  occupied_clean: 'OC',
  occupied_dirty: 'OD',
  expected_departure: 'ED',
  out_of_order: 'OOO',
  off_market: 'OM',
};

function abbrStatus(status: string | null | undefined): string {
  if (!status) return '';
  const key = status.trim().toLowerCase();
  return STATUS_ABBR[key] ?? status; // fallback: tampilkan apa adanya kalau tidak dikenali
}

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
    abbrStatus(params.foStatus),
    abbrStatus(params.hkStatusIn),
    abbrStatus(params.hkStatusFinal),
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

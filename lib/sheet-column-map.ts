// Kolom A-G statis (NO, NO OF ROOM, FO, HK1, HK2, TIME IN, TIME OUT)
// Kolom H-W: 8 item linen, masing-masing IN lalu OUT
export const LINEN_COLUMN_ORDER = [
  'Sheet Double',
  'Sheet Single',
  'Duvet Cover',        // varian pertama (L-M)
  'Duvet Cover Single',  // varian kedua (N-O)
  'Bath Towel',
  'Hand Towel',
  'Bath Mat',
  'Pillow Case',
] as const;

// Kolom X-AQ: guest supplies & condiment, masing-masing 1 angka saja
export const AMENITY_COLUMN_ORDER = [
  'Tissue Roll',
  'Hand Soap',
  'Shampoo',
  'Shower Gel',
  'Tooth Brush',
  'Sterer',
  'Shower Cap',
  'Slipper',
  'Laundry Bag',
  'Laundry List',
  'Memo Pad',
  'Pencil',
  'Guest Comment',
  'Plastic Bin',
  'Tisue',
  'Coffee',
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

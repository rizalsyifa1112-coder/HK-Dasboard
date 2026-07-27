import { google } from 'googleapis';

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export async function getSheetsClient() {
  const auth = getAuth();
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client as any });
}

/** Duplicates the master TEMPLATE tab and renames it for a staff+date. */
export async function duplicateTemplateTab(
  spreadsheetId: string,
  templateSheetId: number,
  newTabName: string
) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          duplicateSheet: {
            sourceSheetId: templateSheetId,
            newSheetName: newTabName,
          },
        },
      ],
    },
  });
  return res.data.replies?.[0]?.duplicateSheet?.properties?.sheetId;
}

export async function findTabByName(spreadsheetId: string, tabName: string) {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  return meta.data.sheets?.find((s) => s.properties?.title === tabName)?.properties?.sheetId ?? null;
}

export async function writeRange(
  spreadsheetId: string,
  range: string,
  values: (string | number)[][]
) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

/**
 * Baca banyak sel sekaligus (1 sel per range), dikembalikan sebagai
 * map { range: nilai_angka }. Sel kosong / non-angka dianggap 0.
 * Dipakai untuk fitur Guest Laundry: sebelum menulis qty baru,
 * kita perlu tahu qty yang sudah ada di sel supaya bisa dijumlahkan.
 */
export async function batchReadCells(
  spreadsheetId: string,
  ranges: string[]
): Promise<Record<string, number>> {
  if (ranges.length === 0) return {};
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
  });
  const result: Record<string, number> = {};
  (res.data.valueRanges ?? []).forEach((vr, idx) => {
    const raw = vr.values?.[0]?.[0];
    const num = typeof raw === 'string' ? parseFloat(raw) : raw;
    result[ranges[idx]] = Number.isFinite(num) ? Number(num) : 0;
  });
  return result;
}

/**
 * Tulis banyak sel sekaligus dalam satu request batchUpdate.
 * Dipakai untuk fitur Guest Laundry setelah nilai lama + delta dihitung.
 */
export async function batchWriteCells(
  spreadsheetId: string,
  writes: { range: string; value: number }[]
) {
  if (writes.length === 0) return;
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: writes.map((w) => ({ range: w.range, values: [[w.value]] })),
    },
  });
}

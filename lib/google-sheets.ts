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

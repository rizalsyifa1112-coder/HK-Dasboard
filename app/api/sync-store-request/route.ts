// app/api/clear-store-request-cell/route.ts
//
// Dipanggil saat entry Store Request dihapus (tombol X) di website.
// Menulis 0 ke cell spreadsheet yang sebelumnya menyimpan qty entry itu,
// supaya spreadsheet tidak menyisakan angka "hantu" dari entry yang
// sudah dihapus.
import { NextRequest, NextResponse } from 'next/server';
import { findTabByName } from '@/lib/google-sheets';
import { getStoreRequestTabName, buildStoreRequestCellRef } from '@/lib/store-request-sheet-map';
import { createClient } from '@supabase/supabase-js';
import { writeRange } from '@/lib/google-sheets';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { sheetRow, date } = await req.json();
    if (sheetRow == null || !date) throw new Error('sheetRow and date are required');

    const { data: template } = await supabaseAdmin
      .from('spreadsheet_templates')
      .select('*')
      .eq('module', 'store_request')
      .eq('format', 'google_sheets')
      .maybeSingle();
    if (!template?.config?.spreadsheet_id) {
      // Config belum di-set — tidak ada yang perlu dibersihkan di spreadsheet.
      return NextResponse.json({ success: true, cleared: false });
    }
    const spreadsheetId: string = template.config.spreadsheet_id;

    const entryDate = new Date(date);
    const tabName = getStoreRequestTabName(entryDate);
    const existingTabId = await findTabByName(spreadsheetId, tabName);
    if (!existingTabId) {
      // Tab bulan itu belum pernah dibuat -> tidak ada cell untuk dibersihkan.
      return NextResponse.json({ success: true, cleared: false });
    }

    const day = entryDate.getDate();
    const cellRef = buildStoreRequestCellRef(tabName, sheetRow, day);
    await writeRange(spreadsheetId, cellRef, [[0]]);

    return NextResponse.json({ success: true, cleared: true, cellRef });
  } catch (err) {
    console.error('Clear store request cell error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

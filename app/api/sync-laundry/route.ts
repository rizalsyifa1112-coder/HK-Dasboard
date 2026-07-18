// app/api/sync-laundry/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { duplicateTemplateTab, findTabByName, writeRange } from '@/lib/google-sheets';
import { getMonthTabName, buildCellRef } from '@/lib/laundry-sheet-map';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { recordId } = await req.json();
    if (!recordId) throw new Error('recordId is required');

    // 1. Ambil record + items + laundry_item (termasuk sheet_row & category)
    const { data: record, error } = await supabaseAdmin
      .from('general_laundry_records')
      .select('*, items:general_laundry_record_items(*, laundry_item:general_laundry_items(*))')
      .eq('id', recordId)
      .single();
    if (error || !record) throw error ?? new Error('Laundry record not found');

    // 2. Ambil config spreadsheet untuk module daily_laundry
    const { data: template } = await supabaseAdmin
      .from('spreadsheet_templates')
      .select('*')
      .eq('module', 'daily_laundry')
      .eq('format', 'google_sheets')
      .maybeSingle();
    if (!template?.config?.spreadsheet_id || !template?.config?.template_sheet_id) {
      throw new Error('Spreadsheet template config (spreadsheet_id/template_sheet_id) belum di-set untuk module daily_laundry');
    }
    const spreadsheetId: string = template.config.spreadsheet_id;
    const templateSheetId: number = template.config.template_sheet_id;

    // 3. Tentukan tab bulan sesuai send_date, buat otomatis kalau belum ada
    const sendDate = new Date(record.send_date);
    const tabName = getMonthTabName(sendDate);

    const existingTabId = await findTabByName(spreadsheetId, tabName);
    if (!existingTabId) {
      await duplicateTemplateTab(spreadsheetId, templateSheetId, tabName);
    }

    // 4. Hari ke berapa dalam bulan itu (1-31) -> jadi kolom B-AF
    const day = sendDate.getDate();

    // 5. Untuk tiap item yang kategorinya didukung (room/fnb) dan punya sheet_row,
    //    tulis qty_sent ke sel [sheet_row, kolom-hari].
    const writes: Promise<any>[] = [];
    const skipped: string[] = [];

    for (const ri of record.items ?? []) {
      const item = ri.laundry_item;
      if (!item) continue;

      const supportedCategory = item.category === 'room' || item.category === 'fnb';
      if (!supportedCategory) {
        skipped.push(`${item.name} (kategori '${item.category}' belum didukung)`);
        continue;
      }
      if (item.sheet_row == null) {
        skipped.push(`${item.name} (belum ada sheet_row, cek migration)`);
        continue;
      }

      const cellRef = buildCellRef(tabName, item.sheet_row, day);
      writes.push(writeRange(spreadsheetId, cellRef, [[ri.qty_sent]]));
    }

    await Promise.all(writes);

    await supabaseAdmin
      .from('spreadsheet_templates')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', template.id);

    return NextResponse.json({
      success: true,
      tabName,
      day,
      itemsWritten: writes.length,
      itemsSkipped: skipped,
    });
  } catch (err) {
    console.error('Sync laundry error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

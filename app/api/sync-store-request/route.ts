// app/api/sync-store-request/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { duplicateTemplateTab, findTabByName, writeRange } from '@/lib/google-sheets';
import { getStoreRequestTabName, buildStoreRequestCellRef } from '@/lib/store-request-sheet-map';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { requestId } = await req.json();
    if (!requestId) throw new Error('requestId is required');

    // 1. Ambil store request + item master (kalau sudah match)
    const { data: request, error } = await supabaseAdmin
      .from('store_requests')
      .select('*, item:store_request_items(*)')
      .eq('id', requestId)
      .single();
    if (error || !request) throw error ?? new Error('Store request not found');

    // 2. Kalau item belum match ke master (perlu review manual), JANGAN sync.
    if (!request.item_id || !request.item) {
      return NextResponse.json({
        success: false,
        needsReview: true,
        message: `Item "${request.item_name}" belum ada di master data Store Request. Tambahkan dulu di halaman master item sebelum bisa di-sync.`,
      });
    }

    // 3. Kalau item sudah match tapi belum punya sheet_row (belum dipetakan
    //    ke baris spreadsheet manapun), juga jangan sync — tandai review.
    if (request.item.sheet_row == null) {
      return NextResponse.json({
        success: false,
        needsReview: true,
        message: `Item "${request.item.name}" belum punya sheet_row. Set dulu baris spreadsheet-nya sebelum bisa di-sync.`,
      });
    }

    // 4. Ambil config spreadsheet untuk module store_request
    const { data: template } = await supabaseAdmin
      .from('spreadsheet_templates')
      .select('*')
      .eq('module', 'store_request')
      .eq('format', 'google_sheets')
      .maybeSingle();
    if (!template?.config?.spreadsheet_id || !template?.config?.template_sheet_id) {
      throw new Error('Spreadsheet template config (spreadsheet_id/template_sheet_id) belum di-set untuk module store_request');
    }
    const spreadsheetId: string = template.config.spreadsheet_id;
    const templateSheetId: number = template.config.template_sheet_id;

    // 5. Tentukan tab bulan sesuai created_at, duplikat dari TEMPLATE SR
    //    kalau tab bulan itu belum ada. Duplicate = rumus ikut persis,
    //    tidak ada yang diubah.
    const requestDate = new Date(request.created_at);
    const tabName = getStoreRequestTabName(requestDate);
    const existingTabId = await findTabByName(spreadsheetId, tabName);
    if (!existingTabId) {
      await duplicateTemplateTab(spreadsheetId, templateSheetId, tabName);
    }

    // 6. Tulis quantity ke sel [sheet_row, kolom-hari]
    const day = requestDate.getDate();
    const cellRef = buildStoreRequestCellRef(tabName, request.item.sheet_row, day);
    await writeRange(spreadsheetId, cellRef, [[request.quantity]]);

    // 7. Tandai sudah sync
    await supabaseAdmin
      .from('store_requests')
      .update({ synced_at: new Date().toISOString() })
      .eq('id', request.id);

    return NextResponse.json({
      success: true,
      tabName,
      day,
      cellRef,
    });
  } catch (err) {
    console.error('Sync store request error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

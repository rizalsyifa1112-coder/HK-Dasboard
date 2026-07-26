// app/api/sync-laundry-guest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { duplicateTemplateTab, findTabByName, writeRange } from '@/lib/google-sheets';
import { getMonthTabName, buildCellRef } from '@/lib/guest-laundry-sheet-map';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json();
    if (!orderId) throw new Error('orderId is required');

    // 1. Ambil order + items + laundry_guest_item (termasuk sheet_row & category)
    const { data: order, error } = await supabaseAdmin
      .from('laundry_guest_orders')
      .select('*, items:laundry_guest_order_items(*, item:laundry_guest_items(*))')
      .eq('id', orderId)
      .single();
    if (error || !order) throw error ?? new Error('Laundry guest order not found');

    // 2. Ambil config spreadsheet untuk module guest_laundry
    const { data: template } = await supabaseAdmin
      .from('spreadsheet_templates')
      .select('*')
      .eq('module', 'guest_laundry')
      .eq('format', 'google_sheets')
      .maybeSingle();
    if (!template?.config?.spreadsheet_id || !template?.config?.template_sheet_id) {
      throw new Error('Spreadsheet template config (spreadsheet_id/template_sheet_id) belum di-set untuk module guest_laundry');
    }
    const spreadsheetId: string = template.config.spreadsheet_id;
    const templateSheetId: number = template.config.template_sheet_id;

    // 3. Tentukan tab bulan sesuai send_date, buat otomatis kalau belum ada
    const sendDate = new Date(order.send_date);
    const tabName = getMonthTabName(sendDate);
    const existingTabId = await findTabByName(spreadsheetId, tabName);
    if (!existingTabId) {
      await duplicateTemplateTab(spreadsheetId, templateSheetId, tabName);
    }

    // 4. Hari ke berapa dalam bulan itu -> jadi kolom C-...
    const day = sendDate.getDate();

    // 5. Untuk tiap item yang qty > 0, tulis qty ke sel [sheet_row, kolom-hari]
    const writes: Promise<any>[] = [];
    const skipped: string[] = [];
    for (const oi of order.items ?? []) {
      const item = oi.item;
      if (!item) continue;
      if (!oi.qty || oi.qty <= 0) continue;
      if (item.sheet_row == null) {
        skipped.push(`${item.name} (belum ada sheet_row)`);
        continue;
      }
      const cellRef = buildCellRef(tabName, item.sheet_row, day);
      writes.push(writeRange(spreadsheetId, cellRef, [[oi.qty]]));
    }
    await Promise.all(writes);

    await supabaseAdmin
      .from('laundry_guest_orders')
      .update({ synced_at: new Date().toISOString() })
      .eq('id', order.id);

    return NextResponse.json({
      success: true,
      tabName,
      day,
      itemsWritten: writes.length,
      itemsSkipped: skipped,
    });
  } catch (err) {
    console.error('Sync laundry guest error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

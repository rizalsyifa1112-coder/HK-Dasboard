// app/api/sync-laundry-guest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { duplicateTemplateTab, findTabByName, batchReadCells, batchWriteCells } from '@/lib/google-sheets';
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

    // 5. Ambil qty yang SUDAH pernah ditulis ke sheet untuk order ini (dari sync sebelumnya).
    //    Ini kunci supaya order yang di-edit tidak menjumlahkan qty dua kali ke sheet.
    const { data: prevSynced } = await supabaseAdmin
      .from('laundry_guest_synced_items')
      .select('item_id, qty')
      .eq('order_id', orderId);
    const prevMap = new Map<string, number>();
    (prevSynced ?? []).forEach((r) => prevMap.set(r.item_id, r.qty));

    // 6. Qty saat ini per item (hanya yang qty > 0)
    const currentMap = new Map<string, number>();
    for (const oi of order.items ?? []) {
      if (oi.item && oi.qty > 0) currentMap.set(oi.item_id, oi.qty);
    }

    // 7. Union semua item yang pernah/sedang terlibat, untuk hitung delta
    //    (delta bisa negatif kalau item dihapus/qty dikurangi saat edit)
    const allItemIds = new Set<string>([...Array.from(prevMap.keys()), ...Array.from(currentMap.keys())]);

    // 8. Cari sheet_row tiap item. Ambil dari order.items dulu; kalau item sudah
    //    tidak ada di order (dihapus saat edit) tapi masih di prevMap, query manual.
    const itemRowMap = new Map<string, number>();
    for (const oi of order.items ?? []) {
      if (oi.item?.sheet_row != null) itemRowMap.set(oi.item_id, oi.item.sheet_row);
    }
    const missingIds = Array.from(allItemIds).filter((id) => !itemRowMap.has(id));
    if (missingIds.length > 0) {
      const { data: missingItems } = await supabaseAdmin
        .from('laundry_guest_items')
        .select('id, sheet_row')
        .in('id', missingIds);
      (missingItems ?? []).forEach((it) => {
        if (it.sheet_row != null) itemRowMap.set(it.id, it.sheet_row);
      });
    }

    // 9. Hitung delta per item (qty baru - qty yang sudah pernah disync)
    const skipped: string[] = [];
    const deltas: { itemId: string; cellRef: string; delta: number }[] = [];
    for (const itemId of Array.from(allItemIds)) {
      const prevQty = prevMap.get(itemId) ?? 0;
      const newQty = currentMap.get(itemId) ?? 0;
      const delta = newQty - prevQty;
      if (delta === 0) continue;

      const sheetRow = itemRowMap.get(itemId);
      if (sheetRow == null) {
        skipped.push(itemId);
        continue;
      }
      deltas.push({ itemId, cellRef: buildCellRef(tabName, sheetRow, day), delta });
    }

    // 10. Baca nilai sel yang sudah ada (bisa berisi qty dari kamar lain di tanggal
    //     yang sama), tambahkan delta, lalu tulis balik. Ini yang membuat qty
    //     antar kamar TERJUMLAH, bukan saling menimpa.
    let itemsWritten = 0;
    if (deltas.length > 0) {
      const currentCellValues = await batchReadCells(spreadsheetId, deltas.map((d) => d.cellRef));
      const writes = deltas.map((d) => ({
        range: d.cellRef,
        value: (currentCellValues[d.cellRef] ?? 0) + d.delta,
      }));
      await batchWriteCells(spreadsheetId, writes);
      itemsWritten = writes.length;

      // 11. Simpan snapshot qty yang baru saja disinkronkan, jadi acuan delta
      //     untuk sync berikutnya (misal kalau order ini di-edit lagi nanti).
      await supabaseAdmin.from('laundry_guest_synced_items').delete().eq('order_id', orderId);
      const upsertRows = Array.from(currentMap.entries()).map(([item_id, qty]) => ({
        order_id: orderId,
        item_id,
        qty,
      }));
      if (upsertRows.length > 0) {
        await supabaseAdmin.from('laundry_guest_synced_items').insert(upsertRows);
      }
    }

    await supabaseAdmin
      .from('laundry_guest_orders')
      .update({ synced_at: new Date().toISOString() })
      .eq('id', order.id);

    return NextResponse.json({
      success: true,
      tabName,
      day,
      itemsWritten,
      itemsSkipped: skipped,
    });
  } catch (err) {
    console.error('Sync laundry guest error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

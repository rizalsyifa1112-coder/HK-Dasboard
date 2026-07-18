import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  duplicateTemplateTab, findTabByName, writeRange,
} from '@/lib/google-sheets';
import { buildRoomRow } from '@/lib/sheet-column-map';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ⬅️ BARU: konstanta offset WIB (UTC+7), dipakai supaya perhitungan tanggal
// tab spreadsheet konsisten dengan "hari" versi WIB, sama seperti di halaman
// Assignments & Inspection. Tanpa ini, assignment yang dibuat dini hari
// (misal jam 00:xx-06:xx WIB) akan salah dianggap masih "kemarin" oleh
// server (yang jalan di UTC), sehingga nyangkut nulis ke tab tanggal lama
// alih-alih membuat tab baru untuk hari itu.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function getWIBDateParts(iso: string | null | undefined) {
  const utcMs = iso ? new Date(iso).getTime() : Date.now();
  const wib = new Date(utcMs + WIB_OFFSET_MS);
  const yyyy = wib.getUTCFullYear();
  const mm = wib.getUTCMonth() + 1;
  const dd = wib.getUTCDate();
  const dateStr = `${String(dd).padStart(2, '0')}-${String(mm).padStart(2, '0')}-${yyyy}`; // untuk nama tab, format DD-MM-YYYY
  const isoDate = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`; // untuk key sync_date, format YYYY-MM-DD
  return { dateStr, isoDate };
}
function formatTime(iso: string | null) {
  if (!iso) return '';
  const t = new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
  return `'${t}`;
}

export async function POST(req: NextRequest) {
  try {
    const { assignmentId } = await req.json();

    const { data: assignment, error } = await supabaseAdmin
      .from('assignments')
      .select('*, room:rooms(*, floor:floors(*)), staff:profiles(*)')
      .eq('id', assignmentId)
      .single();
    if (error || !assignment) throw error ?? new Error('Assignment not found');

    const { data: template } = await supabaseAdmin
      .from('spreadsheet_templates')
      .select('*')
      .eq('module', 'assignments')
      .eq('format', 'google_sheets')
      .maybeSingle();
    if (!template?.config?.spreadsheet_id || !template?.config?.template_sheet_id) {
      throw new Error('Spreadsheet template config (spreadsheet_id/template_sheet_id) not set');
    }
    const spreadsheetId: string = template.config.spreadsheet_id;
    const templateSheetId: number = template.config.template_sheet_id;

    const { dateStr, isoDate } = getWIBDateParts(assignment.assigned_at);
    const staffName = assignment.staff?.full_name ?? 'Unknown';

    // ⬅️ BARU: kalau assignment ini sudah pernah disync sebelumnya (sudah punya
    // sheet_row_number & sheet_tab_name tersimpan), ini artinya RE-SYNC —
    // update baris yang SAMA di spreadsheet, jangan tambah baris baru.
    // Kasus ini terjadi saat supervisor "Release" inspeksi setelah status final
    // kamar berubah (VCU -> VC), padahal baris untuk assignment itu sudah
    // pernah ditulis saat staff Finish Cleaning.
    const isResync = !!assignment.sheet_row_number && !!assignment.sheet_tab_name;

    let tabName: string;
    let nextRow: number;
    let seq = 1;

    if (isResync) {
      tabName = assignment.sheet_tab_name as string;
      nextRow = assignment.sheet_row_number as number;
      seq = (assignment.sheet_seq as number) ?? 1;
    } else {
      tabName = `${staffName} - ${dateStr}`;

      const { data: state } = await supabaseAdmin
        .from('hk_sheet_sync_state')
        .select('*')
        .eq('staff_id', assignment.staff_id)
        .eq('sync_date', isoDate)
        .maybeSingle();

      nextRow = 9;

      if (state) {
        nextRow = state.next_row_number;
        seq = state.room_sequence;
      } else {
        const existingTabId = await findTabByName(spreadsheetId, tabName);
        if (!existingTabId) {
          await duplicateTemplateTab(spreadsheetId, templateSheetId, tabName);
          await writeRange(spreadsheetId, `${tabName}!B4`, [[staffName]]);
          await writeRange(spreadsheetId, `${tabName}!M4`, [[dateStr]]);
          await writeRange(spreadsheetId, `${tabName}!AE4`, [['Morning']]);
          await writeRange(spreadsheetId, `${tabName}!AN4`, [[assignment.room?.floor?.name ?? '']]);
        }
      }
    }

    const [linenRes, amenityRes] = await Promise.all([
      supabaseAdmin
        .from('assignment_linen_usage')
        .select('*, linen_item:linen_inventory(item_name)')
        .eq('assignment_id', assignmentId),
      supabaseAdmin
        .from('assignment_amenity_usage')
        .select('*, amenity:amenities(name)')
        .eq('assignment_id', assignmentId),
    ]);

    const linenUsage = (linenRes.data ?? []).map((u: any) => ({
      itemName: u.linen_item?.item_name ?? '',
      qtyIn: u.quantity_in ?? 0,
      qtyOut: u.quantity_out ?? 0,
    }));
    const amenityUsage = (amenityRes.data ?? []).map((u: any) => ({
      itemName: u.amenity?.name ?? '',
      quantity: u.quantity ?? 0,
    }));

    const row = buildRoomRow({
      no: seq,
      roomNumber: assignment.room?.number ?? '',
      foStatus: assignment.fo_status ?? '',
      hkStatusIn: assignment.hk_status_in ?? '',
      hkStatusFinal: assignment.hk_status_final ?? '',
      timeIn: formatTime(assignment.started_at),
      timeOut: formatTime(assignment.completed_at),
      linenUsage,
      amenityUsage,
    });

    await writeRange(spreadsheetId, `${tabName}!A${nextRow}`, [row]);

    if (!isResync) {
      await supabaseAdmin.from('hk_sheet_sync_state').upsert(
        {
          staff_id: assignment.staff_id,
          sync_date: isoDate,
          sheet_tab_name: tabName,
          next_row_number: nextRow + 1,
          room_sequence: seq + 1,
        },
        { onConflict: 'staff_id,sync_date' }
      );

      // ⬅️ BARU: simpan lokasi baris ini ke assignment supaya bisa di-update lagi nanti
      await supabaseAdmin
        .from('assignments')
        .update({ sheet_row_number: nextRow, sheet_tab_name: tabName, sheet_seq: seq })
        .eq('id', assignment.id);
    }

    await supabaseAdmin
      .from('spreadsheet_templates')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', template.id);

    return NextResponse.json({ success: true, tabName, row: nextRow, resynced: isResync });
  } catch (err) {
    console.error('Sync error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

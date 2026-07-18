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

function formatDate(d: Date) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}
function formatTime(iso: string | null) {
  if (!iso) return '';
  const t = new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta', // ⬅️ tambahan ini yang penting
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

    const dateObj = new Date(assignment.assigned_at ?? Date.now());
    const dateStr = formatDate(dateObj);
    const staffName = assignment.staff?.full_name ?? 'Unknown';
    const tabName = `${staffName} - ${dateStr}`;

    const { data: state } = await supabaseAdmin
      .from('hk_sheet_sync_state')
      .select('*')
      .eq('staff_id', assignment.staff_id)
      .eq('sync_date', dateObj.toISOString().slice(0, 10))
      .maybeSingle();

    let nextRow = 9;
    let seq = 1;

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

    await supabaseAdmin.from('hk_sheet_sync_state').upsert(
      {
        staff_id: assignment.staff_id,
        sync_date: dateObj.toISOString().slice(0, 10),
        sheet_tab_name: tabName,
        next_row_number: nextRow + 1,
        room_sequence: seq + 1,
      },
      { onConflict: 'staff_id,sync_date' }
    );

    await supabaseAdmin
      .from('spreadsheet_templates')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', template.id);

    return NextResponse.json({ success: true, tabName, row: nextRow });
  } catch (err) {
    console.error('Sync error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

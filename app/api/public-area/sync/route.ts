import { NextRequest, NextResponse } from 'next/server';
import { syncPublicAreaTasksToSheet } from '@/lib/public-area-sync';

export async function POST(req: NextRequest) {
  try {
    const { date } = await req.json();
    if (!date) {
      return NextResponse.json({ error: 'date wajib diisi' }, { status: 400 });
    }
    const result = await syncPublicAreaTasksToSheet(date);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('Public area sync failed:', err);
    return NextResponse.json({ error: err.message ?? 'Sync gagal' }, { status: 500 });
  }
}

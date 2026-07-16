import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const { email, full_name, phone, role } = await req.json();

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: 'TempPass123!',
      email_confirm: true,
      user_metadata: { full_name, role },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Update profile with phone (profile row is auto-created by the trigger)
    if (phone) {
      await supabaseAdmin
        .from('profiles')
        .update({ phone })
        .eq('id', data.user.id);
    }

    return NextResponse.json({ user: data.user });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

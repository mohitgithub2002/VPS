// app/api/devices/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';

// POST to register a token
export async function POST(req) {
  try {
    const { token, platform, role, userId } = await req.json();
    if (!token || !platform || !role || !userId) {
      return NextResponse.json({ success: false, message: 'Missing fields' }, { status: 400 });
    }

    const row = {
      token,
      platform,
      is_valid: true,
      recipient_id: String(userId),
      recipient_type: role
    };

    // Upsert to prevent duplicates
    const { error } = await supabase.from('device_tokens').upsert(row, { onConflict: 'token' });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Device register error', err);
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  }
}

// DELETE ?token=xyz to unregister
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    if (!token) return NextResponse.json({ success: false, message: 'token query param required' }, { status: 400 });
    const { error } = await supabase.from('device_tokens').delete().eq('token', token);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Device delete error', err);
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  }
} 
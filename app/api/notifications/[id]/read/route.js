// app/api/notifications/[id]/read/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

export async function PATCH(req, { params }) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();

  const { id } = params;
  if (!id) return NextResponse.json({ success: false, message: 'Missing notification id' }, { status: 400 });

  const { user } = auth;
  // Build filter column and idValue like in fetch API
  const idValue = user.studentId || user.teacherId || user.id;
  if (!idValue) return NextResponse.json({ success: false, message: 'Unsupported role' }, { status: 400 });

  const column = 'recipient_id';
  const roleType = user.studentId ? 'student' : (user.teacherId ? 'teacher' : 'admin');

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('notification_id', id)
    .eq(column, String(idValue))
    .eq('recipient_type', roleType);

  if (error) {
    console.error('Mark read error', error);
    return NextResponse.json({ success: false, message: 'Failed to mark read' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
} 
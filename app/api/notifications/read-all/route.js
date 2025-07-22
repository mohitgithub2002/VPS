// app/api/notifications/read-all/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

export async function PATCH(req) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();

  const { user } = auth;
  const idValue = user.studentId || user.teacherId || user.id;
  if (!idValue) return NextResponse.json({ success: false, message: 'Unsupported role' }, { status: 400 });

  const column = 'recipient_id';
  const roleType = user.studentId ? 'student' : (user.teacherId ? 'teacher' : 'admin');

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq(column, String(idValue))
    .eq('recipient_type', roleType)
    .is('read_at', null);

  if (error) {
    console.error('Mark all read error', error);
    return NextResponse.json({ success: false, message: 'Failed to mark all read' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
} 
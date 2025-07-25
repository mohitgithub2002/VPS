// app/api/notifications/unread-count/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

export async function GET(req) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();

  const { user } = auth;
  const idValue = user.studentId || user.teacherId || user.id;
  if (!idValue) return NextResponse.json({ success: false, message: 'Unsupported role' }, { status: 400 });

  const column = 'recipient_id';
  const roleType = user.studentId ? 'student' : (user.teacherId ? 'teacher' : 'admin');

  // Handle plural topic names (students, teachers) and global ('all') broadcasts
  const recipientTypes = [roleType];
  if (roleType === 'student') recipientTypes.push('students');
  if (roleType === 'teacher') recipientTypes.push('teachers');
  if (roleType === 'admin') recipientTypes.push('admins');
  recipientTypes.push('all');

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .in(column, [String(idValue), 'ALL']) // Include 'ALL' for broadcast notifications  
    .in('recipient_type', recipientTypes)
    .is('read_at', null);

  if (error) {
    console.error('Unread count error', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch count' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { unread: count } });
} 
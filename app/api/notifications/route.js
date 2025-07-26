// app/api/notifications/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

/**
 * GET /api/notifications
 * Returns paginated notifications for the authenticated student or teacher.
 * Query params:
 *   page   – page number (default 1)
 *   limit  – rows per page (default 20)
 *   status – all | unread | read  (default all)
 */
export async function GET(req) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();

  const { user } = auth;

  const idValue = user.studentId || user.teacherId || user.id;

  if (!idValue) {
    return NextResponse.json({ success: false, message: 'Unsupported or unidentified role' }, { status: 400 });
  }

  const column = 'recipient_id';
  const roleType = user.studentId ? 'student' : (user.teacherId ? 'teacher' : 'admin');
  // Handle plural topic names (students, teachers) and global ('all') broadcasts
  const recipientTypes = [roleType];
  if (roleType === 'student') recipientTypes.push('students');
  if (roleType === 'teacher') recipientTypes.push('teachers');
  if (roleType === 'admin') recipientTypes.push('admins');
  recipientTypes.push('all');

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const statusFilter = searchParams.get('status') || 'all';
  const offset = (page - 1) * limit;

  // Fetch both personal and broadcast (recipient_id = 'ALL') notifications
  let query = supabase.from('notifications').select('*', { count: 'exact' })
    .in(column, [String(idValue), 'ALL'])
    .in('recipient_type', recipientTypes)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statusFilter === 'unread') query = query.is('read_at', null);
  if (statusFilter === 'read') query = query.not('read_at', 'is', null);

  const { data: rows, error, count } = await query;
  if (error) {
    console.error('Fetch notifications error', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch notifications' }, { status: 500 });
  }

  const trimmed = rows.map(r => ({
    id: r.notification_id,
    title: r.title,
    body: r.body,
    data: r.data_json,
    readAt: r.read_at,
    createdAt: r.created_at
  }));

  return NextResponse.json({
    success: true,
    data: trimmed,
    pagination: {
      page,
      limit,
      total: count
    }
  });
} 
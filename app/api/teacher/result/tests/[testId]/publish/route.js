import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

export async function PUT(req, { params }) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();
  if (auth.user.role !== 'teacher') {
    return NextResponse.json({ success: false, message: 'Access denied. User is not a teacher.' }, { status: 403 });
  }
  const teacherId = auth.user.teacherId;

  const { testId } = params;
  if (!testId) return NextResponse.json({ success: false, message: 'Missing testId' }, { status: 400 });

  try {
    // Fetch test info
    const { data: test } = await supabase
      .from('daily_test')
      .select('classroom_id, is_declared')
      .eq('test_id', testId)
      .maybeSingle();
    if (!test) return NextResponse.json({ success: false, message: 'Test not found' }, { status: 404 });
    if (test.is_declared) {
      return NextResponse.json({ success: true, data: { published: true, publishedAt: null } });
    }

    // Verify teacher assignment
    const { data: tc } = await supabase
      .from('teacher_class')
      .select('teacher_id')
      .eq('teacher_id', teacherId)
      .eq('class_id', test.classroom_id)
      .maybeSingle();
    if (!tc) return NextResponse.json({ success: false, message: 'You are not assigned to this class' }, { status: 403 });

    // Update is_declared
    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('daily_test')
      .update({ is_declared: true, updated_at: now })
      .eq('test_id', testId);
    if (updErr) throw updErr;

    return NextResponse.json({ success: true, data: { published: true, publishedAt: now } });
  } catch (err) {
    console.error('Teacher → Result → Publish test error:', err);
    return NextResponse.json({ success: false, message: 'Failed to publish test' }, { status: 500 });
  }
} 
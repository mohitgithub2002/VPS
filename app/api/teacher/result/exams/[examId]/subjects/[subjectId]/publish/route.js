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
  const { examId, subjectId } = params;
  if (!examId || !subjectId) {
    return NextResponse.json({ success: false, message: 'Missing path parameters' }, { status: 400 });
  }

  try {
    // Verify teacher is assigned to the class of this exam
    const { data: exam, error: examErr } = await supabase
      .from('exam')
      .select('classroom_id')
      .eq('exam_id', examId)
      .maybeSingle();
    if (examErr) throw examErr;
    if (!exam) return NextResponse.json({ success: false, message: 'Exam not found' }, { status: 404 });

    const { data: tc } = await supabase
      .from('teacher_class')
      .select('teacher_id')
      .eq('teacher_id', teacherId)
      .eq('class_id', exam.classroom_id)
      .maybeSingle();
    if (!tc) return NextResponse.json({ success: false, message: 'You are not assigned to this class' }, { status: 403 });

    // Ensure all marks are entered
    const { data: pendingRows, error: pendErr } = await supabase
      .from('exam_mark')
      .select('mark_id', { count: 'exact', head: true })
      .eq('exam_id', examId)
      .eq('subject_id', subjectId)
      .is('marks_obtained', null);
    if (pendErr) throw pendErr;
    if (pendingRows?.count > 0) {
      return NextResponse.json({ success: false, message: 'Not all student marks have been filled' }, { status: 400 });
    }

    // No dedicated column to mark as published. We simply respond success.
    const now = new Date().toISOString();
    return NextResponse.json({ success: true, data: { published: true, publishedAt: now } });
  } catch (err) {
    console.error('Teacher → Result → Publish subject error:', err);
    return NextResponse.json({ success: false, message: 'Failed to publish' }, { status: 500 });
  }
} 
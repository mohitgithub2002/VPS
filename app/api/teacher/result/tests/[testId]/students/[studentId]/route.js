import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

async function getEnrollmentId(studentId, classroomId) {
  const { data, error } = await supabase
    .from('student_enrollment')
    .select('enrollment_id')
    .eq('student_id', studentId)
    .eq('classroom_id', classroomId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.enrollment_id || null;
}

export async function PUT(req, { params }) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();
  if (auth.user.role !== 'teacher') {
    return NextResponse.json({ success: false, message: 'Access denied. User is not a teacher.' }, { status: 403 });
  }

  const teacherId = auth.user.teacherId;
  const { testId, studentId } = params;
  if (!testId || !studentId) {
    return NextResponse.json({ success: false, message: 'Missing path parameters' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { marks } = body || {};
  if (marks === undefined || marks === null) {
    return NextResponse.json({ success: false, message: '"marks" field is required' }, { status: 400 });
  }

  try {
    // Fetch test details
    const { data: test } = await supabase
      .from('daily_test')
      .select('classroom_id, max_marks, is_declared')
      .eq('test_id', testId)
      .maybeSingle();
    if (!test) return NextResponse.json({ success: false, message: 'Test not found' }, { status: 404 });
    

    // Verify teacher assignment
    const { data: tc } = await supabase
      .from('teacher_class')
      .select('teacher_id')
      .eq('teacher_id', teacherId)
      .eq('class_id', test.classroom_id)
      .maybeSingle();
    if (!tc) return NextResponse.json({ success: false, message: 'You are not assigned to this class' }, { status: 403 });

    // Find enrollment id
    const enrollmentId = await getEnrollmentId(studentId, test.classroom_id);
    if (!enrollmentId) {
      return NextResponse.json({ success: false, message: 'Student not enrolled in this class' }, { status: 404 });
    }

    // Upsert mark row
    const { data: upserted, error: upErr } = await supabase
      .from('daily_test_mark')
      .upsert({
        test_id: testId,
        enrollment_id: enrollmentId,
        marks_obtained: marks,
        updated_by: teacherId,
        updated_at: new Date().toISOString()
      }, { onConflict: 'test_id,enrollment_id' })
      .select('*')
      .single();
    if (upErr) throw upErr;

    return NextResponse.json({ success: true, data: {
      studentId,
      rollNo: undefined,
      name: undefined,
      marks: upserted.marks_obtained === null ? null : Number(upserted.marks_obtained),
      maxMarks: Number(test.max_marks),
      grade: (() => {
        const m = upserted.marks_obtained;
        if (m == null) return null;
        const perc = (Number(m) / Number(test.max_marks)) * 100;
        if (perc >= 90) return 'A+';
        if (perc >= 80) return 'A';
        if (perc >= 70) return 'B+';
        if (perc >= 60) return 'B';
        if (perc >= 50) return 'C';
        if (perc >= 40) return 'D';
        return 'F';
      })()
    } });
  } catch (err) {
    console.error('Teacher → Result → Update test mark error:', err);
    return NextResponse.json({ success: false, message: 'Failed to update marks' }, { status: 500 });
  }
}

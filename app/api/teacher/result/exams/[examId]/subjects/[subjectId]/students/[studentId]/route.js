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
  const { examId, subjectId, studentId } = params;
  if (!examId || !subjectId || !studentId) {
    return NextResponse.json({ success: false, message: 'Missing path parameters' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { marks } = body || {};
  if (marks === undefined || marks === null) {
    return NextResponse.json({ success: false, message: '"marks" field is required' }, { status: 400 });
  }

  try {
    // 1. Get exam info for classroom & declaration status
    const { data: exam, error: examErr } = await supabase
      .from('exam')
      .select('classroom_id, is_declared')
      .eq('exam_id', examId)
      .maybeSingle();
    if (examErr) throw examErr;
    if (!exam) return NextResponse.json({ success: false, message: 'Exam not found' }, { status: 404 });
    if (exam.is_declared) {
      return NextResponse.json({ success: false, message: 'Cannot update marks for a declared exam' }, { status: 400 });
    }

    // 2. Ensure teacher assigned to class
    const { data: tc } = await supabase
      .from('teacher_class')
      .select('teacher_id')
      .eq('teacher_id', teacherId)
      .eq('class_id', exam.classroom_id)
      .maybeSingle();
    if (!tc) return NextResponse.json({ success: false, message: 'You are not assigned to this class' }, { status: 403 });

    // 3. Find enrollment id
    const enrollmentId = await getEnrollmentId(studentId, exam.classroom_id);
    if (!enrollmentId) {
      return NextResponse.json({ success: false, message: 'Student is not enrolled in this class' }, { status: 404 });
    }

    // 4. Update exam_mark row
    const { data: updatedRows, error: updateErr } = await supabase
      .from('exam_mark')
      .update({ marks_obtained: marks, updated_by: teacherId, updated_at: new Date().toISOString() })
      .eq('exam_id', examId)
      .eq('subject_id', subjectId)
      .eq('enrollment_id', enrollmentId)
      .select('*');
    if (updateErr) throw updateErr;
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json({ success: false, message: 'Mark row not found' }, { status: 404 });
    }
    const row = updatedRows[0];

    // 5. Compose response
    return NextResponse.json({ success: true, data: {
      studentId,
      rollNo: undefined,
      name: undefined,
      marks: row.marks_obtained === null ? null : Number(row.marks_obtained),
      maxMarks: Number(row.max_marks),
      grade: row.marks_obtained != null ? (() => {
        const perc = (Number(row.marks_obtained) / Number(row.max_marks)) * 100;
        if (perc >= 90) return 'A+';
        if (perc >= 80) return 'A';
        if (perc >= 70) return 'B+';
        if (perc >= 60) return 'B';
        if (perc >= 50) return 'C';
        if (perc >= 40) return 'D';
        return 'F';
      })() : null
    } });
  } catch (err) {
    console.error('Teacher → Result → Update mark error:', err);
    return NextResponse.json({ success: false, message: 'Failed to update marks' }, { status: 500 });
  }
} 
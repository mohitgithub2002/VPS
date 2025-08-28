import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

function ok(body, status = 200) {
  return NextResponse.json({ success: true, ...body, timestamp: new Date().toISOString() }, { status });
}
function err(code, message, status = 400, details) {
  return NextResponse.json({ success: false, error: { code, message, details }, timestamp: new Date().toISOString() }, { status });
}

export async function PUT(req, { params }) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();
  const { examId, studentId } = params || {};
  if (!examId || !studentId) return err('VALIDATION_ERROR', 'Missing path parameters', 400);

  const body = await req.json();
  const reason = body?.reason || null;
  const remarks = body?.remarks || null;

  try {
    // Exam
    const { data: exam } = await supabase
      .from('exam')
      .select('exam_id, classroom_id, is_declared')
      .eq('exam_id', examId)
      .maybeSingle();
    if (!exam) return err('EXAM_NOT_FOUND', 'Exam not found', 404);
    if (exam.is_declared) return err('EXAM_CANNOT_BE_MODIFIED', 'Cannot modify exam after results have been declared', 409);

    // Enrollment
    const { data: enr } = await supabase
      .from('student_enrollment')
      .select('enrollment_id')
      .eq('student_id', studentId)
      .eq('classroom_id', exam.classroom_id)
      .maybeSingle();
    if (!enr) return err('STUDENT_NOT_FOUND', 'Student not found in exam', 404);
    const enrollmentId = enr.enrollment_id;

    // Check if any marks already entered
    const { data: anyMarks } = await supabase
      .from('exam_mark')
      .select('mark_id', { head: true, count: 'exact' })
      .eq('exam_id', examId)
      .eq('enrollment_id', enrollmentId)
      .not('marks_obtained', 'is', null);
    if ((anyMarks?.count || 0) > 0) {
      return err('STUDENT_ALREADY_HAS_MARKS', 'Cannot mark student as absent - marks already submitted', 409);
    }

    // Mark absent by setting is_absent = true, marks_obtained = 0 and remark as absent reason
    const { data: markRows, error: upErr } = await supabase
      .from('exam_mark')
      .update({ 
        is_absent: true, 
        marks_obtained: 0, 
        remark: remarks || reason || 'Absent', 
        updated_by: null, 
        updated_at: new Date().toISOString() 
      })
      .eq('exam_id', examId)
      .eq('enrollment_id', enrollmentId)
      .select('mark_id');
    if (upErr) return err('INTERNAL_ERROR', 'Failed to mark absent', 500);

    return ok({ data: { examId, studentId, status: 'absent', reason, remarks, markedBy: auth.admin?.id || null, markedAt: new Date().toISOString() }, message: 'Student marked as absent successfully' });
  } catch (e) {
    return err('INTERNAL_SERVER_ERROR', 'Unexpected error', 500);
  }
}



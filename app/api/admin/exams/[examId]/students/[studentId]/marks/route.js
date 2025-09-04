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
  const { examId, studentId } = await params;
  if (!examId || !studentId) return err('VALIDATION_ERROR', 'Missing path parameters', 400);

  const body = await req.json();
  const subjectResults = body?.subjectResults;
  if (!Array.isArray(subjectResults) || subjectResults.length === 0) return err('VALIDATION_ERROR', 'subjectResults required', 400);

  try {
    // Ensure exam not declared
    const { data: exam } = await supabase
      .from('exam')
      .select('exam_id, classroom_id, is_declared')
      .eq('exam_id', examId)
      .maybeSingle();
    if (!exam) return err('EXAM_NOT_FOUND', 'Exam not found', 404);
    

    // Find enrollment id for student in classroom
    const { data: enr } = await supabase
      .from('student_enrollment')
      .select('enrollment_id')
      .eq('student_id', studentId)
      .eq('classroom_id', exam.classroom_id)
      .maybeSingle();
    if (!enr) return err('STUDENT_NOT_FOUND', 'Student not found in exam', 404);
    const enrollmentId = enr.enrollment_id;

    // Update marks per subject
    for (const s of subjectResults) {
      if (!s?.subjectId) continue;
      
      const patch = { 
        marks_obtained: s.marksObtained ?? null, 
        remark: s.remarks ?? null, 
        updated_by:  null, 
        updated_at: new Date().toISOString() 
      };
      
      // Handle absent status
      if (s.status === 'absent') {
        patch.is_absent = true;
        patch.marks_obtained = 0;
      } else {
        patch.is_absent = false;
      }
      
      // Optional: respect max bounds if provided
      if (s.maxMarks != null) patch.max_marks = s.maxMarks;

      const { error: upErr } = await supabase
        .from('exam_mark')
        .update(patch)
        .eq('exam_id', examId)
        .eq('subject_id', s.subjectId)
        .eq('enrollment_id', enrollmentId);
      if (upErr) return err('INVALID_MARKS', 'Marks validation failed', 422, [{ subjectId: s.subjectId, message: upErr.message }]);
    }

    return ok({ data: { examId, studentId, updatedAt: new Date().toISOString(), updatedBy: auth.admin?.id || null }, message: 'Student marks updated successfully' });
  } catch (e) {
    return err('INTERNAL_SERVER_ERROR', 'Unexpected error', 500);
  }
}



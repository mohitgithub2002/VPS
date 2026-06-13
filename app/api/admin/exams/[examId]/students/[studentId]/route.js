import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

function ok(body, status = 200) {
  return NextResponse.json({ success: true, ...body, timestamp: new Date().toISOString() }, { status });
}
function err(code, message, status = 400, details) {
  return NextResponse.json({ success: false, error: { code, message, details }, timestamp: new Date().toISOString() }, { status });
}

// DELETE /api/admin/exams/[examId]/students/[studentId]
// Delete all exam_mark entries for a student for that particular exam
export async function DELETE(req, { params }) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();
  const { examId, studentId } = await params;
  
  if (!examId) return err('EXAM_NOT_FOUND', 'Exam not found', 404);
  if (!studentId) return err('STUDENT_NOT_FOUND', 'Student ID is required', 400);

  try {
    // Get exam details to verify it exists and check if declared
    const { data: exam, error: examError } = await supabase
      .from('exam')
      .select('exam_id, classroom_id, session_id, is_declared')
      .eq('exam_id', examId)
      .maybeSingle();
    
    if (examError) return err('INTERNAL_ERROR', 'Failed to fetch exam', 500);
    if (!exam) return err('EXAM_NOT_FOUND', 'Exam not found', 404);

    // Check if exam is declared
    if (exam.is_declared) {
      return err('EXAM_DECLARED', 'Cannot delete students from a declared exam', 409);
    }

    // Find enrollment id for student in classroom (matching existing pattern)
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('student_enrollment')
      .select('enrollment_id, classroom_id, session_id, students:student_id(student_id, name)')
      .eq('student_id', studentId)
      .eq('classroom_id', exam.classroom_id)
      .eq('session_id', exam.session_id)
      .maybeSingle();

    if (enrollmentError) return err('INTERNAL_ERROR', 'Failed to verify enrollment', 500);
    if (!enrollment) return err('STUDENT_NOT_FOUND', 'Student not found in this exam\'s classroom/session', 404);
    
    const enrollmentId = enrollment.enrollment_id;

    // Get all exam_mark entries for this student and exam to get subject info
    const { data: existingMarks, error: existingError } = await supabase
      .from('exam_mark')
      .select('mark_id, subject_id')
      .eq('exam_id', examId)
      .eq('enrollment_id', enrollmentId);

    if (existingError) return err('INTERNAL_ERROR', 'Failed to fetch existing marks', 500);

    if (!existingMarks || existingMarks.length === 0) {
      return err('NO_MARKS_FOUND', 'No exam marks found for this student in this exam', 404);
    }

    // Get subject names for response
    const subjectIds = existingMarks.map(m => m.subject_id);
    let subjectNamesMap = new Map();
    if (subjectIds.length > 0) {
      const { data: subjects } = await supabase
        .from('subject')
        .select('subject_id, name')
        .in('subject_id', subjectIds);
      
      if (subjects) {
        subjects.forEach(s => {
          subjectNamesMap.set(s.subject_id, s.name);
        });
      }
    }

    // Delete all exam_mark entries for this student and exam
    const { error: deleteError } = await supabase
      .from('exam_mark')
      .delete()
      .eq('exam_id', examId)
      .eq('enrollment_id', enrollmentId);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return err('INTERNAL_ERROR', 'Failed to delete exam marks', 500, deleteError.message);
    }

    return ok({
      data: {
        enrollmentId,
        studentId: enrollment.students?.student_id || null,
        studentName: enrollment.students?.name || null,
        examId,
        deletedSubjects: existingMarks.map(m => ({
          subjectId: m.subject_id,
          subjectName: subjectNamesMap.get(m.subject_id) || `Subject ${m.subject_id}`
        })),
        totalDeleted: existingMarks.length
      },
      message: `Successfully deleted all exam marks for student (${existingMarks.length} subject(s))`
    });
  } catch (e) {
    console.error('DELETE student marks error:', e);
    return err('INTERNAL_SERVER_ERROR', 'Unexpected error', 500);
  }
}


import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

function ok(body, status = 200) {
  return NextResponse.json({ success: true, ...body, timestamp: new Date().toISOString() }, { status });
}
function err(code, message, status = 400, details) {
  return NextResponse.json({ success: false, error: { code, message, details }, timestamp: new Date().toISOString() }, { status });
}

// GET /api/admin/exams/[examId]/students
// List only students who are NOT in the exam_mark table for that exam
export async function GET(req, { params }) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();
  const { examId } = await params;
  if (!examId) return err('EXAM_NOT_FOUND', 'Exam not found', 404);

  try {
    // Get exam details to get classroom_id and session_id
    const { data: exam, error: examError } = await supabase
      .from('exam')
      .select('exam_id, classroom_id, session_id, is_declared')
      .eq('exam_id', examId)
      .maybeSingle();
    
    if (examError) return err('INTERNAL_ERROR', 'Failed to fetch exam', 500);
    if (!exam) return err('EXAM_NOT_FOUND', 'Exam not found', 404);

    // Get all enrollment_ids that already have entries in exam_mark for this exam
    const { data: examMarks, error: marksError } = await supabase
      .from('exam_mark')
      .select('enrollment_id')
      .eq('exam_id', examId);

    if (marksError) return err('INTERNAL_ERROR', 'Failed to fetch exam marks', 500);

    // Get set of enrollment_ids that are already in exam_mark
    const enrollmentIdsWithMarks = new Set((examMarks || []).map(m => m.enrollment_id));

    // Get all students enrolled in this classroom for this session
    const { data: enrollments, error: enrollmentError } = await supabase
      .from('student_enrollment')
      .select(`
        enrollment_id,
        roll_no,
        students:student_id(
          student_id,
          name
        )
      `)
      .eq('classroom_id', exam.classroom_id)
      .eq('session_id', exam.session_id)
      .order('roll_no', { ascending: true });

    if (enrollmentError) return err('INTERNAL_ERROR', 'Failed to fetch students', 500);

    // Filter to only include students who are NOT in exam_mark
    const studentsNotInExam = (enrollments || [])
      .filter(enrollment => !enrollmentIdsWithMarks.has(enrollment.enrollment_id))
      .map(enrollment => ({
        enrollmentId: enrollment.enrollment_id,
        studentId: enrollment.students?.student_id || null,
        studentName: enrollment.students?.name || null,
        rollNo: enrollment.roll_no
      }));

    return ok({ 
      data: { 
        students: studentsNotInExam,
        totalStudents: studentsNotInExam.length
      }, 
      message: 'Students not in exam retrieved successfully' 
    });
  } catch (e) {
    console.error('GET students error:', e);
    return err('INTERNAL_SERVER_ERROR', 'Unexpected error', 500);
  }
}

// POST /api/admin/exams/[examId]/students
// Add a student to exam_mark table for all subjects in that exam
export async function POST(req, { params }) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();
  const { examId } = await params;
  if (!examId) return err('EXAM_NOT_FOUND', 'Exam not found', 404);

  try {
    const body = await req.json();
    const { enrollmentId } = body || {};

    if (!enrollmentId) {
      return err('VALIDATION_ERROR', 'enrollmentId is required', 400);
    }

    // Get exam details
    const { data: exam, error: examError } = await supabase
      .from('exam')
      .select('exam_id, classroom_id, session_id, is_declared')
      .eq('exam_id', examId)
      .maybeSingle();
    
    if (examError) return err('INTERNAL_ERROR', 'Failed to fetch exam', 500);
    if (!exam) return err('EXAM_NOT_FOUND', 'Exam not found', 404);

    
    // Get all distinct subjects for this exam from exam_mark table
    const { data: examMarks, error: marksError } = await supabase
      .from('exam_mark')
      .select('subject_id, max_marks')
      .eq('exam_id', examId);

    if (marksError) return err('INTERNAL_ERROR', 'Failed to fetch exam subjects', 500);

    if (!examMarks || examMarks.length === 0) {
      return err('NO_SUBJECTS', 'No subjects found for this exam. Please add subjects first.', 404);
    }

    // Get unique subjects with their max_marks
    const subjectMap = new Map();
    examMarks.forEach(mark => {
      if (!subjectMap.has(mark.subject_id)) {
        subjectMap.set(mark.subject_id, mark.max_marks);
      }
    });

    // Check if student already has entries for any subject
    const { data: existingMarks, error: existingError } = await supabase
      .from('exam_mark')
      .select('subject_id')
      .eq('exam_id', examId)
      .eq('enrollment_id', enrollmentId);

    if (existingError) return err('INTERNAL_ERROR', 'Failed to check existing marks', 500);

    const existingSubjectIds = new Set((existingMarks || []).map(m => m.subject_id));
    const subjectsToAdd = Array.from(subjectMap.entries()).filter(([subjectId]) => !existingSubjectIds.has(subjectId));

    if (subjectsToAdd.length === 0) {
      return err('ALREADY_EXISTS', 'Student already has entries for all subjects in this exam', 409);
    }

    // Prepare rows to insert
    const rowsToInsert = subjectsToAdd.map(([subjectId, maxMarks]) => ({
      exam_id: examId,
      enrollment_id: enrollmentId,
      subject_id: subjectId,
      max_marks: maxMarks,
      marks_obtained: null,
      is_absent: false,
      updated_at: new Date().toISOString()
    }));

    // Insert rows
    const { data: inserted, error: insertError } = await supabase
      .from('exam_mark')
      .insert(rowsToInsert)
      .select('mark_id, subject_id, max_marks');

    if (insertError) {
      console.error('Insert error:', insertError);
      return err('INTERNAL_ERROR', 'Failed to add student to exam marks', 500, insertError.message);
    }

    // Get subject names
    const subjectIds = subjectsToAdd.map(([subjectId]) => subjectId);
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

    return ok({
      data: {
        enrollmentId,
        examId,
        addedSubjects: subjectsToAdd.map(([subjectId, maxMarks]) => ({
          subjectId,
          subjectName: subjectNamesMap.get(subjectId) || `Subject ${subjectId}`,
          maxMarks
        })),
        totalAdded: subjectsToAdd.length
      },
      message: `Student added to exam marks for ${subjectsToAdd.length} subject(s)`
    });
  } catch (e) {
    console.error('POST add student error:', e);
    return err('INTERNAL_SERVER_ERROR', 'Unexpected error', 500);
  }
}


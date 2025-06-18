import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

/**
 * Helper to ensure the requesting teacher is assigned to the classroom for this exam.
 */
async function verifyTeacherAccess(teacherId, examId) {
  // 1. Get exam to know classroom
  const { data: examData, error: examError } = await supabase
    .from('exam')
    .select('classroom_id, is_declared')
    .eq('exam_id', examId)
    .maybeSingle();
  if (examError) throw examError;
  if (!examData) return { ok: false, status: 404, message: 'Exam not found' };
  // 2. Check teacher_class
  const { data: assignment, error: assignError } = await supabase
    .from('teacher_class')
    .select('teacher_id')
    .eq('teacher_id', teacherId)
    .eq('class_id', examData.classroom_id)
    .limit(1)
    .maybeSingle();
  if (assignError) throw assignError;
  if (!assignment) return { ok: false, status: 403, message: 'You are not assigned to this class' };
  return { ok: true, classroomId: examData.classroom_id, isDeclared: examData.is_declared };
}

// -----------------------------------------------------------------------------
// GET  /teacher/result/exams/{examId}/subjects
// -----------------------------------------------------------------------------
export async function GET(req, { params }) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();
  if (auth.user.role !== 'teacher') {
    return NextResponse.json({ success: false, message: 'Access denied. User is not a teacher.' }, { status: 403 });
  }

  const teacherId = auth.user.teacherId;
  const { examId } = params;
  if (!examId) return NextResponse.json({ success: false, message: 'examId param missing' }, { status: 400 });

  try {
    const access = await verifyTeacherAccess(teacherId, examId);
    if (!access.ok) {
      return NextResponse.json({ success: false, message: access.message }, { status: access.status });
    }

    // Get distinct subjects for the exam
    const { data: subjectStats, error: statsError } = await supabase
      .from('exam_mark')
      .select('subject_id, max_marks, marks_obtained, enrollment_id', { count: 'exact' })
      .eq('exam_id', examId);
    if (statsError) throw statsError;

    // Build map subjectId => stats
    const map = {};
    (subjectStats || []).forEach(row => {
      const sid = row.subject_id;
      map[sid] = map[sid] || { graded: 0, total: 0, maxMarks: row.max_marks };
      if (row.marks_obtained !== null) map[sid].graded += 1;
      map[sid].total += 1;
    });
    const subjectIds = Object.keys(map);

    // Get subject names
    let names = {};
    if (subjectIds.length > 0) {
      const { data: subjects } = await supabase
        .from('subject')
        .select('subject_id, name')
        .in('subject_id', subjectIds);
      (subjects || []).forEach(s => {
        names[s.subject_id] = s.name;
      });
    }

    const results = subjectIds.map(sid => ({
      subjectId: sid,
      name: names[sid] || sid,
      gradedStudents: map[sid].graded,
      totalStudents: map[sid].total,
      isCompleted: map[sid].graded === map[sid].total
    }));

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    console.error('Teacher → Result → Exam subjects error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch subjects' }, { status: 500 });
  }
}

// -----------------------------------------------------------------------------
// POST /teacher/result/exams/{examId}/subjects
// Adds a subject to an exam by pre-creating blank mark rows for all students
// -----------------------------------------------------------------------------
export async function POST(req, { params }) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();
  if (auth.user.role !== 'teacher') {
    return NextResponse.json({ success: false, message: 'Access denied. User is not a teacher.' }, { status: 403 });
  }

  const teacherId = auth.user.teacherId;
  const { examId } = params;
  if (!examId) return NextResponse.json({ success: false, message: 'examId param missing' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { subjectId, name, maxMarks } = body || {};
  if (!subjectId || !maxMarks) {
    return NextResponse.json({ success: false, message: 'subjectId and maxMarks are required' }, { status: 400 });
  }

  try {
    const access = await verifyTeacherAccess(teacherId, examId);
    if (!access.ok) {
      return NextResponse.json({ success: false, message: access.message }, { status: access.status });
    }
    const { classroomId, isDeclared } = access;
    if (isDeclared) {
      return NextResponse.json({ success: false, message: 'Cannot add subject to a declared exam' }, { status: 400 });
    }

    // Get all enrollments for the classroom/session (session bound to exam)
    const { data: enrollments, error: enrollmentError } = await supabase
      .from('student_enrollment')
      .select('enrollment_id')
      .eq('classroom_id', classroomId);
    if (enrollmentError) throw enrollmentError;

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ success: false, message: 'No students enrolled in this class' }, { status: 400 });
    }

    // Prepare rows to insert into exam_mark (marks_obtained NULL initially)
    const rows = enrollments.map(e => ({
      exam_id: examId,
      enrollment_id: e.enrollment_id,
      subject_id: subjectId,
      marks_obtained: null,
      max_marks: maxMarks,
      remark: null,
      updated_by: teacherId
    }));

    // Insert rows – ignore conflict if subject already exists
    const { error: insertError } = await supabase
      .from('exam_mark')
      .insert(rows, { upsert: false });
    if (insertError && !insertError.message.includes('duplicate')) throw insertError;

    // Respond with the new subject status
    const response = {
      subjectId,
      name: name || null,
      gradedStudents: 0,
      totalStudents: rows.length,
      isCompleted: false
    };

    return NextResponse.json({ success: true, data: response, message: 'Subject added' });
  } catch (err) {
    console.error('Teacher → Result → Add subject error:', err);
    return NextResponse.json({ success: false, message: 'Failed to add subject' }, { status: 500 });
  }
} 
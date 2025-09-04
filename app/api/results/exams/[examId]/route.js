import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

function getMonthName(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('default', { month: 'short' });
}

export async function GET(req, { params }) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();

  const { examId } = await params;
  const studentId = auth.user.studentId;
  if (!studentId || !examId) return NextResponse.json({ success: false, message: 'Student or exam not found' }, { status: 404 });

  try {
    // 1. Get all enrollments for the student
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('student_enrollment')
      .select('enrollment_id, session_id')
      .eq('student_id', studentId);
    if (enrollmentsError || !enrollments || enrollments.length === 0) {
      return NextResponse.json({ success: false, message: 'No enrollments found' }, { status: 404 });
    }

    // 2. Get the exam (to get session_id and classroom info via join)
    const { data: examArr, error: examError } = await supabase
      .from('exam')
      .select('exam_id, session_id, classroom_id, name, start_date, exam_type:exam_type_id(name, code), classroom:classroom_id(class, section)')
      .eq('exam_id', examId);
    const exam = examArr && examArr[0];
    if (examError || !exam) return NextResponse.json({ success: false, message: 'Exam not found' }, { status: 404 });

    // 3. Find the enrollment for this session
    const enrollment = enrollments.find(e => String(e.session_id) === String(exam.session_id));
    if (!enrollment) return NextResponse.json({ success: false, message: 'No enrollment for this exam session' }, { status: 404 });
    const enrollmentId = enrollment.enrollment_id;

    // 4. Fetch exam summary for that enrollment and exam
    const { data: summaryArr, error: summaryError } = await supabase
      .from('exam_summary')
      .select('total_marks, percentage, rank, grade, max_marks')
      .eq('exam_id', examId)
      .eq('enrollment_id', enrollmentId);
    const summary = summaryArr && summaryArr[0];

    // 5. Fetch all marks for that enrollment and exam, join subject for names
    const { data: marks, error: marksError } = await supabase
      .from('exam_mark')
      .select('subject_id, marks_obtained, max_marks, remark, is_absent, subject:subject_id(name), teacher:updated_by(name)')
      .eq('exam_id', examId)
      .eq('enrollment_id', enrollmentId);
    if (marksError) return NextResponse.json({ success: false, message: 'Failed to fetch marks' }, { status: 500 });

    // Check if student has any exam marks recorded
    if (!marks || marks.length === 0) {
      return NextResponse.json({ 
        success: true, 
        data: {
          id: exam.exam_id,
          examName: exam.exam_type?.name || '',
          month: getMonthName(exam.start_date),
          examDate: exam.start_date,
          class: exam.classroom?.class || null,
          section: exam.classroom?.section || null,
          isCompletelyAbsent: true,
          absentMessage: 'Student was completely absent for this exam',
          totalMarks: null,
          totalMaxMarks: null,
          percentage: null,
          rank: null,
          grade: null,
          subjects: []
        }
      });
    }

    const subjects = (marks || []).map(m => ({
      subject: m.subject?.name || m.subject_id,
      marks: m.is_absent ? null : (m.marks_obtained === null ? null : Number(m.marks_obtained)),
      maxMarks: Number(m.max_marks),
      teacherRemarks: m.remark || undefined,
      teacherName: m.teacher?.name || undefined,
      isAbsent: m.is_absent || false
    }));

    // Check if student is absent in all subjects
    const allSubjectsAbsent = subjects.every(s => s.isAbsent);
    
    // Calculate total marks (only for non-absent subjects)
    const totalMarks = summary.total_marks||0;
    const totalMaxMarks = summary.max_marks||0;

    // Count absent subjects
    const absentSubjects = subjects.filter(s => s.isAbsent);

    const result = {
      id: exam.exam_id,
      examName: exam.exam_type?.name || '',
      examDate: exam.start_date,
      class: exam.classroom?.class || null,
      section: exam.classroom?.section || null,
      status: allSubjectsAbsent ? 'Absent' : (absentSubjects.length > 0 ? 'Partial Present' : 'Present'),
      totalMarks,
      totalMaxMarks,
      percentage: summary && summary.percentage != null ? Number(summary.percentage) : null,
      rank: summary && summary.rank != null ? summary.rank : null,
      grade: summary && summary.grade || null,
      subjects
    };

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error('Exam detail API error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch exam detail' }, { status: 500 });
  }
} 
import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

export async function GET(req, { params }) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();
  if (auth.user.role !== 'teacher') {
    return NextResponse.json({ success: false, message: 'Access denied. User is not a teacher.' }, { status: 403 });
  }
  const teacherId = auth.user.teacherId;
  const { examId } = params;
  if (!examId) return NextResponse.json({ success: false, message: 'Missing examId' }, { status: 400 });

  try {
    // Fetch exam and classroom to authorise access
    const { data: exam, error: examErr } = await supabase
      .from('exam')
      .select('exam_id, name, start_date, classroom_id, is_declared')
      .eq('exam_id', examId)
      .maybeSingle();
    if (examErr) throw examErr;
    if (!exam) return NextResponse.json({ success: false, message: 'Exam not found' }, { status: 404 });

    // Check assignment
    const { data: tc } = await supabase
      .from('teacher_class')
      .select('teacher_id')
      .eq('teacher_id', teacherId)
      .eq('class_id', exam.classroom_id)
      .maybeSingle();
    if (!tc) return NextResponse.json({ success: false, message: 'You are not assigned to this class' }, { status: 403 });

    // Fetch all summaries for this exam
    const { data: summaries, error: sumErr } = await supabase
      .from('exam_summary')
      .select('enrollment_id, total_marks, percentage, rank, grade, max_marks')
      .eq('exam_id', examId);
    if (sumErr) throw sumErr;

    if (!summaries || summaries.length === 0) {
      return NextResponse.json({ success: true, data: { exam: null, students: [] } });
    }

    // Map enrollments to student info
    const enrollmentIds = summaries.map(s => s.enrollment_id);
    const { data: enrollmentRows } = await supabase
      .from('student_enrollment')
      .select('enrollment_id, roll_no, students(student_id, name)')
      .in('enrollment_id', enrollmentIds);

    const infoMap = {};
    (enrollmentRows || []).forEach(er => {
      infoMap[er.enrollment_id] = {
        studentId: er.students?.student_id,
        name: er.students?.name,
        rollNo: er.roll_no
      };
    });

    // Compose students array
    const students = summaries.map(s => {
      const info = infoMap[s.enrollment_id] || {};
      return {
        rank: s.rank,
        studentId: info.studentId,
        rollNo: String(info.rollNo).padStart(4, '0'),
        name: info.name,
        totalMarks: Number(s.total_marks),
        maxMarks: Number(s.max_marks),
        percentage: Number(s.percentage),
        grade: s.grade
      };
    }).sort((a, b) => a.rank - b.rank);

    const examSummary = {
      id: exam.exam_id,
      title: exam.name || `Exam #${exam.exam_id}`,
      subject: null,
      date: exam.start_date,
      totalStudents: students.length,
      gradedStudents: students.length,
      isCompleted: !!exam.is_declared
    };

    return NextResponse.json({ success: true, data: { exam: examSummary, students } });
  } catch (err) {
    console.error('Teacher → Result → Exam rank error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch ranks' }, { status: 500 });
  }
} 
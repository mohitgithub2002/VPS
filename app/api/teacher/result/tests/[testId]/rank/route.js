import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

function computeGrade(marks, maxMarks) {
  if (marks === null || marks === undefined || maxMarks === 0) return null;
  const perc = (marks / maxMarks) * 100;
  if (perc >= 90) return 'A+';
  if (perc >= 80) return 'A';
  if (perc >= 70) return 'B+';
  if (perc >= 60) return 'B';
  if (perc >= 50) return 'C';
  if (perc >= 40) return 'D';
  return 'F';
}

export async function GET(req, { params }) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();
  if (auth.user.role !== 'teacher') {
    return NextResponse.json({ success: false, message: 'Access denied. User is not a teacher.' }, { status: 403 });
  }
  const teacherId = auth.user.teacherId;
  const { testId } = await params;
  if (!testId) return NextResponse.json({ success: false, message: 'Missing testId' }, { status: 400 });

  try {
    // Fetch test info
    const { data: test } = await supabase
      .from('daily_test')
      .select('test_id, name, subject_id, test_date, classroom_id, max_marks, is_declared')
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

    // Fetch marks
    const { data: marksRows } = await supabase
      .from('daily_test_mark')
      .select('enrollment_id, marks_obtained')
      .eq('test_id', testId);

    if (!marksRows || marksRows.length === 0) {
      return NextResponse.json({ success: true, data: { test: null, students: [] } });
    }

    // Enrollment map to student
    const enrollmentIds = marksRows.map(r => r.enrollment_id);
    const { data: enrollmentRows } = await supabase
      .from('student_enrollment')
      .select('enrollment_id, roll_no, students(student_id, name)')
      .in('enrollment_id', enrollmentIds);

    const infoMap = {};
    (enrollmentRows || []).forEach(e => {
      infoMap[e.enrollment_id] = {
        studentId: e.students?.student_id,
        name: e.students?.name,
        rollNo: e.roll_no
      };
    });

    // Compose student list
    const students = marksRows.map(r => {
      const info = infoMap[r.enrollment_id] || {};
      const perc = test.max_marks > 0 ? (Number(r.marks_obtained) / Number(test.max_marks)) * 100 : 0;
      return {
        studentId: info.studentId,
        name: info.name,
        rollNo: String(info.rollNo).padStart(4, '0'),
        marks: Number(r.marks_obtained),
        maxMarks: Number(test.max_marks),
        percentage: Number(perc.toFixed(2)),
        grade: computeGrade(Number(r.marks_obtained), Number(test.max_marks))
      };
    }).sort((a, b) => b.marks - a.marks);

    // Assign ranks (ties share same rank)
    let rank = 0;
    let prevMarks = null;
    students.forEach((s, idx) => {
      if (prevMarks === null || s.marks !== prevMarks) {
        rank = rank + 1;
        prevMarks = s.marks;
      }
      s.rank = rank;
    });

    // Subject name
    let subjectName = test.subject_id;
    const { data: subj } = await supabase
      .from('subject')
      .select('name')
      .eq('subject_id', test.subject_id)
      .maybeSingle();
    if (subj) subjectName = subj.name;

    const testSummary = {
      id: test.test_id,
      title: test.name,
      subject: subjectName,
      date: test.test_date,
      maxMarks: Number(test.max_marks),
      status: test.is_declared ? 'published' : 'graded',
      studentsCount: students.length,
      averageMarks: students.length > 0 ? Number((students.reduce((sum, s) => sum + s.marks, 0) / students.length).toFixed(2)) : null
    };

    return NextResponse.json({ success: true, data: { test: testSummary, students } });
  } catch (err) {
    console.error('Teacher → Result → Test rank error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch rank list' }, { status: 500 });
  }
} 
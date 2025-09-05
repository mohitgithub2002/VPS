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
  const { testId } = params;
  if (!testId) return NextResponse.json({ success: false, message: 'Missing testId' }, { status: 400 });

  try {
    // Fetch test info
    const { data: test, error: testErr } = await supabase
      .from('daily_test')
      .select('classroom_id, max_marks')
      .eq('test_id', testId)
      .maybeSingle();
    if (testErr) throw testErr;
    if (!test) return NextResponse.json({ success: false, message: 'Test not found' }, { status: 404 });

    // Verify teacher assignment
    const { data: tc } = await supabase
      .from('teacher_class')
      .select('teacher_id')
      .eq('teacher_id', teacherId)
      .eq('class_id', test.classroom_id)
      .maybeSingle();
    if (!tc) return NextResponse.json({ success: false, message: 'You are not assigned to this class' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.toLowerCase() || '';
    const sort = (searchParams.get('sort') || 'name').toLowerCase();

    // Fetch enrollments in class
    const { data: enrollments } = await supabase
      .from('student_enrollment')
      .select('enrollment_id, roll_no, students(student_id, name)')
      .eq('classroom_id', test.classroom_id);

    const enrollmentIds = enrollments.map(e => e.enrollment_id);

    // Fetch marks rows for test
    const { data: marksRows } = await supabase
      .from('daily_test_mark')
      .select('enrollment_id, marks_obtained, is_absent')
      .eq('test_id', testId);

    const marksMap = {};
    const absentMap = {};
    (marksRows || []).forEach(r => {
      marksMap[r.enrollment_id] = r.marks_obtained === null ? null : Number(r.marks_obtained);
      absentMap[r.enrollment_id] = r.is_absent || false;
    });

    const list = enrollments.map(e => {
      const student = e.students;
      const isAbsent = absentMap[e.enrollment_id] || false;
      const marks = isAbsent ? null : (marksMap[e.enrollment_id] ?? null);
      return {
        studentId: student.student_id,
        rollNo: String(e.roll_no).padStart(4, '0'),
        name: student.name,
        marks,
        maxMarks: Number(test.max_marks),
        isAbsent: isAbsent
      };
    });

    // Search filter
    let filtered = list;
    if (search) {
      filtered = filtered.filter(i => i.name.toLowerCase().includes(search) || String(i.rollNo).includes(search));
    }

    // Sort
    filtered.sort((a, b) => {
      if (sort === 'marks') {
        // Handle absent students - put them at the end
        if (a.isAbsent && !b.isAbsent) return 1;
        if (!a.isAbsent && b.isAbsent) return -1;
        if (a.isAbsent && b.isAbsent) return 0;
        
        // Sort present students by marks
        if (a.marks == null && b.marks == null) return 0;
        if (a.marks == null) return 1;
        if (b.marks == null) return -1;
        return b.marks - a.marks;
      }
      if (sort === 'rollno') return Number(a.rollNo) - Number(b.rollNo);
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ success: true, data: filtered });
  } catch (err) {
    console.error('Teacher → Result → Test students list error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch students' }, { status: 500 });
  }
} 
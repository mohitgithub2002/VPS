import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

async function verifyTeacherAndExam(teacherId, examId, subjectId) {
  // 1. Fetch exam to get classroom & declaration status
  const { data: exam, error: examErr } = await supabase
    .from('exam')
    .select('classroom_id, is_declared')
    .eq('exam_id', examId)
    .maybeSingle();
  if (examErr) throw examErr;
  if (!exam) return { ok: false, status: 404, message: 'Exam not found' };

  // 2. Ensure teacher assigned to classroom
  const { data: tc } = await supabase
    .from('teacher_class')
    .select('teacher_id')
    .eq('teacher_id', teacherId)
    .eq('class_id', exam.classroom_id)
    .limit(1)
    .maybeSingle();
  if (!tc) return { ok: false, status: 403, message: 'You are not assigned to this class' };

  // 3. Check subject exists in exam_mark rows (optional)
  const { data: anyRow } = await supabase
    .from('exam_mark')
    .select('subject_id')
    .eq('exam_id', examId)
    .eq('subject_id', subjectId)
    .limit(1)
    .maybeSingle();
  if (!anyRow) return { ok: false, status: 404, message: 'Subject not found in this exam' };

  return { ok: true, classroomId: exam.classroom_id, isDeclared: exam.is_declared };
}

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
  const { examId, subjectId } = params;
  if (!examId || !subjectId) {
    return NextResponse.json({ success: false, message: 'Missing path parameters' }, { status: 400 });
  }

  try {
    const access = await verifyTeacherAndExam(teacherId, examId, subjectId);
    if (!access.ok) {
      return NextResponse.json({ success: false, message: access.message }, { status: access.status });
    }
    const { classroomId } = access;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.toLowerCase() || '';
    const sort = (searchParams.get('sort') || 'name').toLowerCase();

    // 1. Fetch all students (enrollments) in class
    const { data: enrollments, error: enErr } = await supabase
      .from('student_enrollment')
      .select('enrollment_id, roll_no, students(student_id, name)')
      .eq('classroom_id', classroomId);
    if (enErr) throw enErr;

    const enrollmentIds = enrollments.map(e => e.enrollment_id);

    // 2. Fetch all marks for these enrollments in the subject/exam
    const { data: marksRows, error: marksErr } = await supabase
      .from('exam_mark')
      .select('enrollment_id, marks_obtained, max_marks')
      .eq('exam_id', examId)
      .eq('subject_id', subjectId);
    if (marksErr) throw marksErr;

    const marksMap = {};
    (marksRows || []).forEach(r => {
      marksMap[r.enrollment_id] = { marks: r.marks_obtained === null ? null : Number(r.marks_obtained), maxMarks: Number(r.max_marks) };
    });

    // 3. Compose list
    let list = enrollments.map(e => {
      const st = e.students;
      const markObj = marksMap[e.enrollment_id] || { marks: null, maxMarks: marksRows?.[0]?.max_marks || 0 };
      return {
        studentId: st.student_id,
        rollNo: String(e.roll_no).padStart(4, '0'),
        name: st.name,
        marks: markObj.marks,
        maxMarks: Number(markObj.maxMarks),
        grade: markObj.marks != null ? computeGrade(markObj.marks, markObj.maxMarks) : null
      };
    });

    // 4. Search filter
    if (search) {
      list = list.filter(item => item.name.toLowerCase().includes(search) || String(item.rollNo).includes(search));
    }

    // 5. Sort
    list.sort((a, b) => {
      if (sort === 'rank') {
        // Rank requires marks; higher marks first
        if (a.marks == null && b.marks == null) return 0;
        if (a.marks == null) return 1;
        if (b.marks == null) return -1;
        return b.marks - a.marks;
      }
      if (sort === 'rollno') {
        return Number(a.rollNo) - Number(b.rollNo);
      }
      // default name
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ success: true, data: list });
  } catch (err) {
    console.error('Teacher → Result → Student marks list error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch student marks' }, { status: 500 });
  }
} 
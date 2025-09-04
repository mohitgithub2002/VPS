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
  const { examId } = await params;
  if (!examId) return NextResponse.json({ success: false, message: 'Missing examId' }, { status: 400 });

  try {
    // Fetch exam and classroom to authorise access
    const { data: exam, error: examErr } = await supabase
      .from('exam')
      .select('exam_id, start_date, classroom_id, is_declared, exam_type:exam_type_id(name)', { count: 'exact' })
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

    // Fetch summaries, all class enrollments, and exam marks in parallel
    const [{ data: summaries, error: sumErr }, { data: allEnrollments, error: enrollErr }, { data: examMarks, error: marksErr }] = await Promise.all([
      supabase
        .from('exam_summary')
        .select('enrollment_id, total_marks, percentage, rank, grade, max_marks')
        .eq('exam_id', examId),
      supabase
        .from('student_enrollment')
        .select('enrollment_id, roll_no, students(student_id, name)')
        .eq('classroom_id', exam.classroom_id),
      supabase
        .from('exam_mark')
        .select('enrollment_id, subject_id, marks_obtained, max_marks, is_absent, subject:subject_id(name)')
        .eq('exam_id', examId)
    ]);
    if (sumErr) throw sumErr;
    if (enrollErr) throw enrollErr;
    if (marksErr) throw marksErr;

    // Build quick maps
    const infoMap = {};
    (allEnrollments || []).forEach(e => {
      infoMap[e.enrollment_id] = {
        studentId: e.students?.student_id,
        name: e.students?.name,
        rollNo: e.roll_no
      };
    });

    // Create marks map by enrollment_id
    const marksMap = {};
    (examMarks || []).forEach(mark => {
      if (!marksMap[mark.enrollment_id]) {
        marksMap[mark.enrollment_id] = [];
      }
      marksMap[mark.enrollment_id].push({
        subjectId: mark.subject_id,
        subjectName: mark.subject?.name,
        marksObtained: mark.marks_obtained,
        maxMarks: mark.max_marks,
        isAbsent: mark.is_absent
      });
    });

    // Check for students who are absent (all marks are absent)
    const absentEnrollmentIds = new Set();
    Object.keys(marksMap).forEach(enrollmentId => {
      const marks = marksMap[enrollmentId];
      if (marks.length > 0 && marks.every(mark => mark.isAbsent)) {
        absentEnrollmentIds.add(parseInt(enrollmentId));
      }
    });

    if (!summaries || summaries.length === 0) {
      // still include absent students list
      const studentsAbsent = (allEnrollments || []).map(e => {
        const isAbsent = absentEnrollmentIds.has(e.enrollment_id);
        const subjectMarks = marksMap[e.enrollment_id] || [];
        
        return {
          rank: null,
          studentId: e.students?.student_id,
          rollNo: String(e.roll_no).padStart(4, '0'),
          name: e.students?.name,
          totalMarks: null,
          maxMarks: null,
          percentage: null,
          grade: null,
          absent: isAbsent,
          subjectMarks: subjectMarks
        };
      });
      return NextResponse.json({ success: true, data: { exam: {
        id: exam.exam_id,
        title: exam.exam_type?.name || `Exam #${exam.exam_id}`,
        date: exam.start_date,
        isCompleted: !!exam.is_declared,
        averageMarks: null,
        highestMarks: null
      }, students: studentsAbsent } });
    }

    const enrollmentIds = summaries.map(s => s.enrollment_id);

    // Students who have summary rows (present)
    const students = summaries.map(s => {
      const info = infoMap[s.enrollment_id] || {};
      const isAbsent = absentEnrollmentIds.has(s.enrollment_id);
      const subjectMarks = marksMap[s.enrollment_id] || [];
      
      return {
        rank: s.rank,
        studentId: info.studentId,
        rollNo: String(info.rollNo).padStart(4, '0'),
        name: info.name,
        totalMarks: Number(s.total_marks),
        maxMarks: Number(s.max_marks),
        percentage: Number(s.percentage),
        grade: s.grade,
        absent: isAbsent,
        subjectMarks: subjectMarks
      };
    }).sort((a, b) => a.rank - b.rank);

    // Add students who are enrolled but don't have summary (completely absent)
    const summaryEnrollmentIds = new Set(summaries.map(s => s.enrollment_id));
    const completelyAbsentStudents = (allEnrollments || [])
      .filter(e => !summaryEnrollmentIds.has(e.enrollment_id))
      .map(e => {
        const info = infoMap[e.enrollment_id] || {};
        const subjectMarks = marksMap[e.enrollment_id] || [];
        
        return {
          rank: null,
          studentId: info.studentId,
          rollNo: String(info.rollNo).padStart(4, '0'),
          name: info.name,
          totalMarks: null,
          maxMarks: null,
          percentage: null,
          grade: null,
          absent: true,
          subjectMarks: subjectMarks
        };
      });

    // Combine present and absent students
    const allStudents = [...students, ...completelyAbsentStudents];

    // Compute averages / highest
    const totalMarksArr = summaries.map(r => Number(r.total_marks));
    const averageMarks = totalMarksArr.length ? Number((totalMarksArr.reduce((a,b)=>a+b,0) / totalMarksArr.length).toFixed(2)) : null;
    const highestMarks = totalMarksArr.length ? Math.max(...totalMarksArr) : null;

    const examSummary = {
      id: exam.exam_id,
      title: exam.exam_type?.name || `Exam #${exam.exam_id}`,
      date: exam.start_date,
      totalStudents: allStudents.length,
      gradedStudents: students.length,
      isCompleted: !!exam.is_declared,
      averageMarks,
      highestMarks
    };

    return NextResponse.json({ success: true, data: { exam: examSummary, students: allStudents } });
  } catch (err) {
    console.error('Teacher → Result → Exam rank error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch ranks' }, { status: 500 });
  }
} 
import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

/**
 * GET /teacher/result/exams
 * ------------------------------------------------------------------
 * Retrieves a paginated list of exams for a teacher's class. Each item
 * contains aggregated statistics required by the Teacher → Results UI.
 *
 * Query Parameters
 *  - classId   (required) : classroom_id to filter exams
 *  - status               : "pending" | "completed" (optional)
 *  - subject              : subject_id filter (optional – **NOT YET IMPLEMENTED**)
 *  - limit     (default 20)
 *  - offset    (default 0)
 *
 * Response Envelope
 * {
 *   success: true,
 *   data: {
 *     total: number,
 *     items: ExamSummary[],
 *     limit: number,
 *     offset: number
 *   }
 * }
 */
export async function GET(req) {
  // ---------------------------------------------------------------------------
  // 1. AuthN / AuthZ – ensure a teacher is logged-in
  // ---------------------------------------------------------------------------
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();
  if (auth.user.role !== 'teacher') {
    return NextResponse.json({ success: false, message: 'Access denied. User is not a teacher.' }, { status: 403 });
  }

  const teacherId = auth.user.teacherId;

  // ---------------------------------------------------------------------------
  // 2. Parse & validate query params
  // ---------------------------------------------------------------------------
  const { searchParams } = new URL(req.url);
  const classId = searchParams.get('classId');
  if (!classId) {
    return NextResponse.json({ success: false, message: 'Query param "classId" is required' }, { status: 400 });
  }

  const status = searchParams.get('status'); // pending | completed | null
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  // ---------------------------------------------------------------------------
  // 3. Check that the teacher actually teaches this class (authorisation)
  // ---------------------------------------------------------------------------
  try {
    const { data: assignment, error: assignmentError } = await supabase
      .from('teacher_class')
      .select('teacher_id')
      .eq('teacher_id', teacherId)
      .eq('class_id', classId)
      .limit(1)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) {
      return NextResponse.json({ success: false, message: 'You are not assigned to this class' }, { status: 403 });
    }
  } catch (err) {
    console.error('Teacher class validation error:', err);
    return NextResponse.json({ success: false, message: 'Failed to validate class access' }, { status: 500 });
  }

  // ---------------------------------------------------------------------------
  // 4. Fetch all exams for the class (with pagination)
  // ---------------------------------------------------------------------------
  try {
    let examQuery = supabase
      .from('exam')
      .select('*', { count: 'exact' })
      .eq('classroom_id', classId)
      .order('start_date', { ascending: false });

    // Apply status filter
    if (status === 'pending') {
      examQuery = examQuery.eq('is_declared', false);
    } else if (status === 'completed') {
      examQuery = examQuery.eq('is_declared', true);
    }

    // Pagination
    examQuery = examQuery.range(offset, offset + limit - 1);

    const { data: exams, count: totalCount, error: examError } = await examQuery;
    if (examError) throw examError;

    const examIds = (exams || []).map(e => e.exam_id);

    // -----------------------------------------------------------------------
    // 5. Early return if no exams found
    // -----------------------------------------------------------------------
    if (!exams || exams.length === 0) {
      return NextResponse.json({ success: true, data: { total: 0, items: [], limit, offset } });
    }

    // -----------------------------------------------------------------------
    // 6. Fetch supporting data in parallel – summary + student counts
    // -----------------------------------------------------------------------
    const [{ data: summaries }, { data: enrollmentCountData }] = await Promise.all([
      // 6a. Get all exam_summary rows for these exams (for metrics)
      supabase.from('exam_summary')
        .select('*')
        .in('exam_id', examIds),
      // 6b. Total students in the class (for pass-rate / totalStudents)
      supabase.from('student_enrollment')
        .select('enrollment_id', { count: 'exact', head: true })
        .eq('classroom_id', classId)
    ]);
    console.log(summaries);
    console.log(enrollmentCountData);

    const totalStudentsInClass = enrollmentCountData?.count ?? 0;

    // Group summaries by exam_id for quick access
    const byExam = {};
    (summaries || []).forEach(s => {
      byExam[s.exam_id] = byExam[s.exam_id] || [];
      byExam[s.exam_id].push(s);
    });

    // -----------------------------------------------------------------------
    // 7. Compose final payload items
    // -----------------------------------------------------------------------
    const items = exams.map(exam => {
      const stats = byExam[exam.exam_id] || [];
      const gradedStudents = stats.length;
      // Aggregate calculations
      let averageMarks, highestMarks, passRate;
      if (exam.is_declared && stats.length > 0) {
        const totalMarksArr = stats.map(r => Number(r.total_marks));
        const percentages = stats.map(r => Number(r.percentage));
        averageMarks = Number((totalMarksArr.reduce((a, b) => a + b, 0) / stats.length).toFixed(2));
        highestMarks = Math.max(...totalMarksArr);
        const passed = stats.filter(r => (r.grade ?? '').toUpperCase() !== 'F').length;
        passRate = totalStudentsInClass > 0 ? Number(((passed / totalStudentsInClass) * 100).toFixed(2)) : null;
      }

      return {
        id: exam.exam_id,
        title: exam.name || `Exam #${exam.exam_id}`,
        subject: null, // Not directly available in schema (exam spans multiple subjects)
        date: exam.start_date,
        totalStudents: totalStudentsInClass,
        gradedStudents,
        isCompleted: !!exam.is_declared,
        averageMarks,
        highestMarks,
        passRate
      };
    });

    return NextResponse.json({ success: true, data: { total: totalCount ?? items.length, items, limit, offset } });
  } catch (err) {
    console.error('Teacher → Result → Exams list error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch exams' }, { status: 500 });
  }
} 
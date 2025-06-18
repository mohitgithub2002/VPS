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
      .select(`exam_id, start_date, is_declared, exam_type:exam_type_id(name)`, { count: 'exact' })
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
    const [{ data: summaries }] = await Promise.all([
      // 6a. Get all exam_summary rows for these exams (for metrics)
      supabase.from('exam_summary')
        .select('*')
        .in('exam_id', examIds)
    ]);

    // Fetch classroom details once (single query) – used for all response items
    const { data: classroomData, error: clsErr } = await supabase
      .from('classrooms')
      .select('class, section')
      .eq('classroom_id', classId)
      .maybeSingle();
    if (clsErr) throw clsErr;
    const className = classroomData?.class ?? null;
    const sectionName = classroomData?.section ?? null;

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
      // Aggregate calculations
      let averageMarks, highestMarks;
      if (exam.is_declared && stats.length > 0) {
        const totalMarksArr = stats.map(r => Number(r.total_marks));
        averageMarks = Number((totalMarksArr.reduce((a, b) => a + b, 0) / stats.length).toFixed(2));
        highestMarks = Math.max(...totalMarksArr);
      }

      return {
        id: exam.exam_id,
        title: exam.exam_type?.name || `Exam #${exam.exam_id}`,
        class: className,
        section: sectionName,
        date: exam.start_date,
        isCompleted: !!exam.is_declared,
        averageMarks,
        highestMarks
      };
    });

    return NextResponse.json({ success: true, data: { total: totalCount ?? items.length, items, limit, offset } });
  } catch (err) {
    console.error('Teacher → Result → Exams list error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch exams' }, { status: 500 });
  }
} 
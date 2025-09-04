import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

function getMonthName(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('default', { month: 'short' });
}

export async function GET(req) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();

  const { searchParams } = new URL(req.url);
  const studentId = auth.user.studentId;
  if (!studentId) return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });

  const year = searchParams.get('year');
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  try {
    // 1. Get all enrollments for the student
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('student_enrollment')
      .select('enrollment_id, session_id')
      .eq('student_id', studentId)
      .order('enrollment_id', { ascending: false });
    if (enrollmentsError || !enrollments || enrollments.length === 0) {
      return NextResponse.json({ success: false, message: 'No enrollments found' }, { status: 404 });
    }

    // 2. Pick the latest enrollment, or the one matching the year/session
    let enrollment = enrollments[0];
    if (year) {
      // Find session_id for the given year
      // Assume year is the start year of the session
      const sessionIdForYear = enrollments.find(e => {
        // You may want to join sessions table for more robust year matching
        return String(e.session_id) === String(year);
      });
      if (sessionIdForYear) enrollment = sessionIdForYear;
      else return NextResponse.json({ success: true, data: [] });
    }
    const enrollmentId = enrollment.enrollment_id;
    const sessionId = enrollment.session_id;

    // 3. Fetch exam summaries with exam details in a single optimized query
    // Only include exams that have been declared by admin
    const { data: summaries, error: summariesError } = await supabase
      .from('exam_summary')
      .select(`
        exam_id,
        total_marks,
        max_marks,
        percentage,
        rank,
        grade,
        exam!inner(
          exam_id,
          name,
          start_date,
          exam_type_id,
          is_declared,
          exam_type!inner(
            exam_type_id,
            name,
            code
          )
        )
      `)
      .eq('enrollment_id', enrollmentId)
      .eq('exam.is_declared', true);

    if (summariesError) {
      console.error('Summaries error:', summariesError);
      return NextResponse.json({ success: false, message: 'Failed to fetch exam summaries' }, { status: 500 });
    }

    if (!summaries || summaries.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    console.log('summaries with exam data:', summaries);
    // 4. Compose results using the joined data
    let results = (summaries || []).map(s => ({
      id: s.exam_id,
      examId: s.exam?.exam_type_id,
      examName: s.exam?.exam_type?.name || '',
      month: getMonthName(s.exam?.start_date),
      examDate: s.exam?.start_date,
      isCompleted: true, // All in summary are completed
      totalMarks: s.total_marks != null ? Number(s.total_marks) : null,
      totalMaxMarks: s.max_marks != null ? Number(s.max_marks) : null,
      percentage: s.percentage != null ? Number(s.percentage) : null,
      rank: s.rank != null ? s.rank : null,
      grade: s.grade || null
    }));

    // 5. If status=upcoming, return empty (since all in summary are completed)
    if (status === 'upcoming') results = [];
    // 6. If status=completed, return as is (all are completed)

    // 7. Sort and paginate
    results = results.sort((a, b) => new Date(b.examDate) - new Date(a.examDate));
    const paged = results.slice(offset, offset + limit);
    return NextResponse.json({ success: true, data: paged });
  } catch (err) {
    console.error('Exams API error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch exams' }, { status: 500 });
  }
} 
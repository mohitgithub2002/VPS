import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

export async function GET(req) {
  // Authenticate user
  const auth = await authenticateUser(req);
  if (!auth.authenticated) {
    return unauthorized();
  }

  const studentId = auth.user.studentId;
  if (!studentId) {
    return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
  }

  try {
    // 1. Get all enrollments for the student
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('student_enrollment')
      .select('enrollment_id')
      .eq('student_id', studentId);
    if (enrollmentsError || !enrollments || enrollments.length === 0) {
      return NextResponse.json({ success: false, message: 'No enrollments found' }, { status: 404 });
    }
    const enrollmentIds = enrollments.map(e => e.enrollment_id);

    // 2. Get all exam summaries for the student, join exam for code
    const { data: summaries, error: summariesError } = await supabase
      .from('exam_summary')
      .select('exam_id, enrollment_id, total_marks, percentage, rank, grade, updated_at, exam:exam_id(exam_type:exam_type_id(code))')
      .in('enrollment_id', enrollmentIds)
      .order('updated_at', { ascending: false });
    if (summariesError || !summaries || summaries.length === 0) {
      return NextResponse.json({ success: false, message: 'No exam summaries found' }, { status: 404 });
    }

    // 3. Calculate overall percentage (average of all percentages)
    const overall = Number((summaries.reduce((sum, s) => sum + Number(s.percentage), 0) / summaries.length).toFixed(2));
    // 4. Get best (lowest) rank
    const rank = Math.min(...summaries.map(s => s.rank).filter(r => r != null));
    // 5. Get last exam (with code)
    const lastExamSummary = summaries[0];
    let lastExam = null;
    if (lastExamSummary) {
      lastExam = {
        examId: lastExamSummary.exam_id,
        percentage: Number(lastExamSummary.percentage),
        grade: lastExamSummary.grade,
        code: lastExamSummary.exam?.exam_type?.code || null
      };
    }

    // 6. Get subject-wise average percentage (batch join for subject names)
    const { data: marks, error: marksError } = await supabase
      .from('exam_mark')
      .select('subject_id, marks_obtained, max_marks, subject:subject_id(name)')
      .in('enrollment_id', enrollmentIds);
    if (marksError || !marks) {
      return NextResponse.json({ success: false, message: 'Failed to fetch subject marks' }, { status: 500 });
    }
    // Calculate average percentage per subject
    const subjectTotals = {};
    const subjectCounts = {};
    const subjectNames = {};
    marks.forEach(m => {
      const name = m.subject?.name || m.subject_id;
      if (!subjectTotals[name]) {
        subjectTotals[name] = 0;
        subjectCounts[name] = 0;
      }
      subjectTotals[name] += (Number(m.marks_obtained) / Number(m.max_marks)) * 100;
      subjectCounts[name] += 1;
    });
    const subjects = {};
    Object.keys(subjectTotals).forEach(name => {
      const avg = subjectTotals[name] / subjectCounts[name];
      subjects[name] = Number(avg.toFixed(1));
    });

    // 7. Recent trend: last 5 exam percentages (descending by date)
    const recentTrend = summaries.slice(0, 5).map(s => Number(s.percentage));

    return NextResponse.json({
      success: true,
      data: {
        overall,
        rank,
        lastExam,
        subjects,
        recentTrend
      }
    });
  } catch (err) {
    console.error('Performance API error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch performance data' }, { status: 500 });
  }
} 
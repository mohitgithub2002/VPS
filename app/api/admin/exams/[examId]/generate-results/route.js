import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

function ok(body, status = 200) {
  return NextResponse.json({ success: true, ...body, timestamp: new Date().toISOString() }, { status });
}
function err(code, message, status = 400, details) {
  return NextResponse.json({ success: false, error: { code, message, details }, timestamp: new Date().toISOString() }, { status });
}

// Function to calculate grade based on percentage
function calculateGrade(percentage, isAbsent) {
  if (isAbsent) return 'F';
  
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 60) return 'C';
  if (percentage >= 50) return 'D';
  if (percentage >= 40) return 'E';
  return 'F';
}

export async function PUT(req, { params }) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();
  const { examId } = await params;
  if (!examId) return err('EXAM_NOT_FOUND', 'Exam not found', 404);

  try {
    // Fetch all marks for the exam including absent status
    const { data: marks, error: markErr } = await supabase
      .from('exam_mark')
      .select('exam_id, enrollment_id, subject_id, marks_obtained, max_marks, is_absent')
      .eq('exam_id', examId);
    if (markErr) return err('INTERNAL_ERROR', 'Failed to fetch marks', 500);

    if (!marks || marks.length === 0) {
      return err('MARKING_INCOMPLETE', 'Cannot generate results - marking is incomplete', 422, { totalStudents: 0, markedStudents: 0, pendingStudents: 0, completionPercentage: 0 });
    }

    // Group by enrollment
    const byEnrollment = new Map();
    for (const m of marks) {
      if (!byEnrollment.has(m.enrollment_id)) byEnrollment.set(m.enrollment_id, []);
      byEnrollment.get(m.enrollment_id).push(m);
    }

    // Separate present and absent students
    const presentSummaries = [];
    const absentSummaries = [];

    byEnrollment.forEach((rows, enrollmentId) => {
      // Check if any non-absent subjects have null marks
      const hasNull = rows.some(r => r.marks_obtained === null && r.is_absent !== true);
      if (hasNull) return;
      
      // Check if student is marked as absent in any subject
      const isAbsent = rows.some(r => r.is_absent === true);
      
      // Calculate totals considering absent subjects (marks_obtained = 0 for absent)
      const total = rows.reduce((a, r) => a + Number(r.marks_obtained || 0), 0);
      const max = rows.reduce((a, r) => a + Number(r.max_marks || 0), 0);
      const percentage = max > 0 ? Number(((total / max) * 100).toFixed(2)) : 0;
      
      const summary = { 
        exam_id: examId, 
        enrollment_id: enrollmentId, 
        total_marks: total, 
        max_marks: max, 
        percentage, 
        grade: calculateGrade(percentage, isAbsent), 
        rank: null,
        is_absent: isAbsent
      };
      
      if (isAbsent) {
        absentSummaries.push(summary);
      } else {
        presentSummaries.push(summary);
      }
    });

    const totalEnrollments = byEnrollment.size;
    const completed = presentSummaries.length + absentSummaries.length;
    const pending = totalEnrollments - completed;
    const completionPercentage = totalEnrollments > 0 ? Number(((completed / totalEnrollments) * 100).toFixed(2)) : 0;

    if (pending > 0) {
      return err('MARKING_INCOMPLETE', 'Cannot generate results - marking is incomplete', 422, { totalStudents: totalEnrollments, markedStudents: completed, pendingStudents: pending, completionPercentage });
    }

    // Rank present students first (higher percentage gets lower rank number)
    presentSummaries.sort((a, b) => b.percentage - a.percentage);
    presentSummaries.forEach((summary, index) => {
      summary.rank = index + 1;
    });

    // Rank absent students separately based on their percentage/marks
    absentSummaries.sort((a, b) => b.percentage - a.percentage);
    const presentCount = presentSummaries.length;
    absentSummaries.forEach((summary, index) => {
      summary.rank = presentCount + index + 1;
    });

    // Combine both lists
    const allSummaries = [...presentSummaries, ...absentSummaries];

    console.log('Present students:', presentSummaries.length, 'Absent students:', absentSummaries.length);
    console.log('All summaries with ranks:', allSummaries);

    // Upsert summaries
    if (allSummaries.length) {
      const { error: upErr } = await supabase
        .from('exam_summary')
        .upsert(allSummaries, { onConflict: 'exam_id,enrollment_id' });
      if (upErr) return err('INTERNAL_ERROR', upErr, 500);
    }

    const now = new Date().toISOString();
    return ok({ 
      data: { 
        examId, 
        status: 'results_generated', 
        generatedAt: now,
        presentStudents: presentSummaries.length,
        absentStudents: absentSummaries.length,
        totalStudents: allSummaries.length
      }, 
      message: 'Results generated successfully' 
    });
  } catch (e) {
    console.log('Unexpected error', e);
    return err('INTERNAL_SERVER_ERROR', 'Unexpected error', 500);
  }
}



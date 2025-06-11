import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

export async function GET(req) {
  // Authenticate user
  const auth = await authenticateUser(req);
  if (!auth.authenticated) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  // Get studentId from query or token
  const { searchParams } = new URL(req.url);
  console.log(auth.user);
  const studentId = searchParams.get('studentId') || auth.user.studentId;
  if (!studentId) {
    return NextResponse.json({ message: 'Student not found' }, { status: 404 });
  }

  try {
    // Fetch all fee summaries for the student, ordered by enrollment_id descending (latest first)
    const { data: summaries, error } = await supabase
      .from('fee_summary')
      .select('*')
      .eq('student_id', studentId)
      .order('enrollment_id', { ascending: false });
    if (error || !summaries || summaries.length === 0) {
      return NextResponse.json({ message: 'error:Student not found' }, { status: 404 });
    }

    // The latest enrollment is the first row
    const summary = summaries[0];

    // Fetch session_id from student_enrollment using enrollment_id
    let sessionName = null;
    if (summary.enrollment_id) {
      const { data: enrollment, error: enrollmentError } = await supabase
        .from('student_enrollment')
        .select('session_id, sessions:session_id(session_name)')
        .eq('enrollment_id', summary.enrollment_id)
        .single();
      if (!enrollmentError && enrollment && enrollment.sessions) {
        sessionName = enrollment.sessions.session_name;
      }
    }

    // Previous enrollments (if any)
    const previousSummaries = summaries.slice(1);
    // Sum due from previous enrollments
    const dueFromLastYear = previousSummaries.reduce((sum, s) => sum + Number(s.due || 0), 0);
    // Total due is current due + previous dues
    const totalDue = Number(summary.due) + dueFromLastYear;

    return NextResponse.json({
      totalFee: Number(summary.school_fees) + Number(summary.bus_fees) + Number(summary.other_fees),
      schoolFee: Number(summary.school_fees),
      busFee: Number(summary.bus_fees),
      extraFees: Number(summary.other_fees),
      discount: Number(summary.discount),
      paid: Number(summary.paid_fees),
      totalDue,
      dueFromLastYear,
      dueDate: summary.due_date || null,
      sessionName,
      currency: 'INR'
    });
  } catch (err) {
    console.error('Fee summary error:', err);
    return NextResponse.json({ message: 'An unexpected error occurred' }, { status: 500 });
  }
} 
import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

// Helper to map installment_no to name
const INSTALLMENT_NAMES = [
  'First Installment',
  'Second Installment',
  'Third Installment',
  'Fourth Installment',
  'Fifth Installment',
  'Sixth Installment',
  'Seventh Installment',
  'Eighth Installment',
  'Ninth Installment',
  'Tenth Installment',
];

function getInstallmentName(installment_no, categoryName) {
  // If not tuition, use category name
  if (categoryName && !['School Fee', 'Tuition', 'Tuition Fee'].includes(categoryName)) {
    return categoryName;
  }
  return INSTALLMENT_NAMES[installment_no - 1] || `Installment ${installment_no}`;
}

export async function GET(req) {
  // Authenticate user
  const auth = await authenticateUser(req);
  if (!auth.authenticated) {
    return unauthorized();
  }

  // Get studentId from query or token
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId') || auth.user.studentId;
  if (!studentId) {
    return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
  }

  // Pagination
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  try {
    // 1. Get all enrollments for the student (with session name)
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('student_enrollment')
      .select('enrollment_id, session_id, sessions:session_id(session_name)')
      .eq('student_id', studentId)
      .order('enrollment_id', { ascending: false });
    if (enrollmentsError || !enrollments || enrollments.length === 0) {
      return NextResponse.json({ success: false, message: 'No enrollments found' }, { status: 404 });
    }
    const enrollmentIds = enrollments.map(e => e.enrollment_id);
    const sessionMap = {};
    enrollments.forEach(e => { sessionMap[e.enrollment_id] = e.sessions?.session_name || ''; });

    // 2. Get all fee schedules, installments, allocations, and categories in a single multi-join query
    // We'll use a single select on fee_installment, joining up to schedule, category, and allocations
    // Supabase supports nested selects for this
    const { data: installments, error: installmentError } = await supabase
      .from('fee_installment')
      .select(`
        installment_id,
        schedule_id,
        installment_no,
        amount_due,
        due_date,
        schedule: schedule_id (
          enrollment_id,
          category_id,
          category: category_id (name)
        ),
        allocations:fee_allocation( amount_allocated )
      `)
      .in('schedule_id',
        // Defensive: if no schedules, pass [-1] to avoid error
        (await supabase.from('fee_schedule').select('schedule_id').in('enrollment_id', enrollmentIds)).data?.map(s => s.schedule_id) || [-1]
      )
      .order('due_date', { ascending: false });
    if (installmentError) throw installmentError;

    // 3. Compose the installment data
    const now = new Date();
    let totalDue = 0;
    const allInstallments = installments.map(inst => {
      const schedule = inst.schedule;
      const enrollmentId = schedule?.enrollment_id;
      const academicYear = sessionMap[enrollmentId] || '';
      const feeType = schedule?.category?.name || 'Other Fee';
      const paid = (inst.allocations || []).reduce((sum, a) => sum + Number(a.amount_allocated), 0);
      const due = Number(inst.amount_due) - paid;
      let status = 'pending';
      if (due <= 0) {
        status = 'paid';
      } else if (new Date(inst.due_date) < now) {
        status = 'overdue';
      }
      if (due > 0) totalDue += due;
      return {
        id: `${inst.installment_id}`,
        name: getInstallmentName(inst.installment_no, feeType),
        academicYear,
        feeType,
        amount: Number(inst.amount_due),
        due: due,
        dueDate: inst.due_date,
        status,
        installmentNo: inst.installment_no,
      };
    });

    // 4. Sort and paginate
    allInstallments.sort((a, b) => {
      if (a.academicYear === b.academicYear) {
        return new Date(b.dueDate) - new Date(a.dueDate);
      }
      return b.academicYear.localeCompare(a.academicYear);
    });
    const paged = allInstallments.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: paged,
      totalDue,
      pagination: {
        total: allInstallments.length,
        limit,
        offset,
        hasMore: offset + limit < allInstallments.length,
      },
    });
  } catch (err) {
    console.error('Installment info API error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch installment info' }, { status: 500 });
  }
}

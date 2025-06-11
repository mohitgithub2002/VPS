import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

const CATEGORY_MAP = {
  1: 'School Fee',
  2: 'Bus Fee',
  3: 'Extra Fee',
};

export async function GET(req) {
  // Authenticate user
  const auth = await authenticateUser(req);
  if (!auth.authenticated) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  // Get studentId from query or token
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId') || auth.user.studentId;
  if (!studentId) {
    return NextResponse.json({ message: 'Student not found' }, { status: 404 });
  }

  // Pagination and sorting
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const sortBy = searchParams.get('sortBy') === 'amount' ? 'amount' : 'created_at';
  const sortOrder = searchParams.get('sortOrder') === 'asc' ? true : false;

  try {
    // Get all enrollments for the student, latest first
    const { data: summaries, error: summaryError } = await supabase
      .from('fee_summary')
      .select('enrollment_id')
      .eq('student_id', studentId)
      .order('enrollment_id', { ascending: false });
    if (summaryError || !summaries || summaries.length === 0) {
      return NextResponse.json({ message: 'Student not found' }, { status: 404 });
    }
    const latestEnrollmentId = summaries[0].enrollment_id;

    // Fetch transactions for the latest enrollment
    const { data: transactions, error: txError, count } = await supabase
      .from('fee_transaction')
      .select('*', { count: 'exact' })
      .eq('enrollment_id', latestEnrollmentId)
      .order(sortBy, { ascending: sortOrder })
      .range(offset, offset + limit - 1);
    if (txError) {
      throw txError;
    }

    // Fetch categories for mapping
    const { data: categories, error: catError } = await supabase
      .from('fee_category')
      .select('category_id, name');
    if (catError) {
      throw catError;
    }
    const categoryMap = {};
    categories?.forEach(cat => { categoryMap[cat.category_id] = cat.name; });

    // Map transactions to API response
    const txList = (transactions || []).map(tx => ({
      id: `TXN${String(tx.transaction_id).padStart(3, '0')}`,
      type: categoryMap[tx.category_id] || CATEGORY_MAP[tx.category_id] || 'Other Fees',
      description: tx.ref_no || '',
      amount: Number(tx.amount),
      currency: 'INR',
      date: tx.created_at,
      paymentMethod: tx.method || '',
      status: 'completed',
    }));

    return NextResponse.json({
      totalTransactions: count || txList.length,
      transactions: txList
    });
  } catch (err) {
    console.error('Fee transactions error:', err);
    return NextResponse.json({ message: 'An unexpected error occurred' }, { status: 500 });
  }
}

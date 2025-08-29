import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

function ok(body, status = 200) {
  return NextResponse.json({ success: true, ...body, timestamp: new Date().toISOString() }, { status });
}
function err(code, message, status = 400, details) {
  return NextResponse.json({ success: false, error: { code, message, details }, timestamp: new Date().toISOString() }, { status });
}

// GET /api/admin/exam-types
// Get list of exam types for filters and form options
export async function GET(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {

    let query = supabase
      .from('exam_type')
      .select('exam_type_id, code')
      .order('exam_type_id', { ascending: true });


    const { data: examTypes, error } = await query;
    if (error) return err('INTERNAL_ERROR', 'Failed to fetch exam types', 500);

    const items = (examTypes || []).map(et => ({
      examTypeId: et.exam_type_id,
      code: et.code,
    }));

    return ok({ 
      data: { examTypes: items }, 
      message: 'Exam types retrieved successfully' 
    });
  } catch (e) {
    console.error('GET exam types error:', e);
    return err('INTERNAL_SERVER_ERROR', 'Unexpected error', 500);
  }
}

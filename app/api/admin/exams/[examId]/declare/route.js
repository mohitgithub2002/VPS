import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

function ok(body, status = 200) {
  return NextResponse.json({ success: true, ...body, timestamp: new Date().toISOString() }, { status });
}
function err(code, message, status = 400, details) {
  return NextResponse.json({ success: false, error: { code, message, details }, timestamp: new Date().toISOString() }, { status });
}

export async function PUT(req, { params }) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();
  const { examId } = await params;
  if (!examId) return err('EXAM_NOT_FOUND', 'Exam not found', 404);

  try {
    // Check exam
    const { data: exam } = await supabase
      .from('exam')
      .select('exam_id, is_declared, name, start_date, exam_type:exam_type_id(name, code)')
      .eq('exam_id', examId)
      .maybeSingle();
    if (!exam) return err('EXAM_NOT_FOUND', 'Exam not found', 404);
    if (exam.is_declared) return err('EXAM_ALREADY_DECLARED', 'Results already declared', 409);

    // Ensure summaries exist (basic check for generation before declaration)
    const { count: summaryCount, error: sumCheckErr } = await supabase
      .from('exam_summary')
      .select('*', { count: 'exact', head: true })
      .eq('exam_id', examId);
    
    if (sumCheckErr) {
      console.log('sumCheckErr', sumCheckErr);
      return err('INTERNAL_ERROR', 'Failed to check summaries', 500);
    }
    
    console.log('summaryCount', summaryCount);
    if (!summaryCount || summaryCount === 0) {
      return err('RESULTS_NOT_GENERATED', 'Cannot declare results - results have not been generated yet', 409);
    }

    // Declare
    const { error: upErr } = await supabase
      .from('exam')
      .update({ is_declared: true })
      .eq('exam_id', examId);
    if (upErr) return err('INTERNAL_ERROR', 'Failed to declare results', 500);

    const now = new Date().toISOString();
    const data = {
      examId,
      examName: exam.name || exam.exam_type?.name || null,
      status: 'declared',
      declaredAt: now,
      declaredBy: auth.admin?.name || null,
      declarationMessage: null,
      notifications: null,
      publicationDetails: null
    };

    return ok({ data, message: 'Results declared successfully' });
  } catch (e) {
    return err('INTERNAL_SERVER_ERROR', 'Unexpected error', 500);
  }
}



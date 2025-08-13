import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

export async function GET(req) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();

  const enrollmentId = auth.user?.enrollmentId;
  if (!enrollmentId) {
    return NextResponse.json({ success: false, message: 'Enrollment not found' }, { status: 404 });
  }

  try {
    const { data: enr, error: enrErr } = await supabase
      .from('student_enrollment')
      .select('classroom_id')
      .eq('enrollment_id', enrollmentId)
      .maybeSingle();
    if (enrErr) throw enrErr;
    const classroom_id = enr?.classroom_id;
    if (!classroom_id) return NextResponse.json({ success: true, data: [] });

    const { data, error } = await supabase
      .from('schedule_files')
      .select('exam_id, version, is_current, created_at')
      .eq('classroom_id', classroom_id)
      .eq('type', 'exam')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const map = new Map();
    for (const r of data || []) {
      const key = r.exam_id;
      if (!key) continue;
      const existing = map.get(key) || { examId: key, hasCurrent: false, latestVersion: 0 };
      existing.hasCurrent = existing.hasCurrent || !!r.is_current;
      if ((r.version || 0) > (existing.latestVersion || 0)) existing.latestVersion = r.version || 0;
      map.set(key, existing);
    }

    // Optionally join to exam for names/dates
    const list = Array.from(map.values());
    if (list.length > 0) {
      const examIds = list.map(x => x.examId);
      const { data: exams, error: examErr } = await supabase
        .from('exam')
        .select('exam_id, name, start_date, end_date, exam_type:exam_type_id(name, code)')
        .in('exam_id', examIds);
      if (!examErr && exams) {
        const emap = new Map(exams.map(e => [e.exam_id, e]));
        for (const t of list) {
          const e = emap.get(t.examId);
          if (e) {
            t.name = e.name || e.exam_type?.name || null;
            t.code = e.exam_type?.code || null;
            t.startDate = e.start_date || null;
            t.endDate = e.end_date || null;
          }
        }
      }
    }

    return NextResponse.json({ success: true, data: list });
  } catch (err) {
    console.error('Exam terms list error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch exam terms' }, { status: 500 });
  }
}



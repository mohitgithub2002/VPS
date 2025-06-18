import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

function determineStatus(test, marksCount) {
  const today = new Date().toISOString().split('T')[0];
  if (test.is_declared) return 'published';
  if (marksCount > 0) return 'graded';
  if (test.test_date <= today) return 'conducted';
  return 'scheduled';
}

function calculateAverage(marksArr) {
  if (!marksArr || marksArr.length === 0) return null;
  const total = marksArr.reduce((sum, m) => sum + Number(m.marks_obtained), 0);
  return Number((total / marksArr.length).toFixed(2));
}

export async function GET(req) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();
  if (auth.user.role !== 'teacher') {
    return NextResponse.json({ success: false, message: 'Access denied. User is not a teacher.' }, { status: 403 });
  }
  const teacherId = auth.user.teacherId;

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get('classId');
  if (!classId) {
    return NextResponse.json({ success: false, message: 'classId is required' }, { status: 400 });
  }
  const statusFilter = searchParams.get('status'); // upcoming | past
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  try {
    // Ensure teacher assignment
    const { data: tc } = await supabase
      .from('teacher_class')
      .select('teacher_id')
      .eq('teacher_id', teacherId)
      .eq('class_id', classId)
      .maybeSingle();
    if (!tc) return NextResponse.json({ success: false, message: 'You are not assigned to this class' }, { status: 403 });

    // Fetch tests
    let testsQuery = supabase
      .from('daily_test')
      .select('*', { count: 'exact' })
      .eq('classroom_id', classId)
      .order('test_date', { ascending: false });

    // Simple status filter: upcoming => test_date > today; past => test_date <= today
    const today = new Date().toISOString().split('T')[0];
    if (statusFilter === 'upcoming') testsQuery = testsQuery.gt('test_date', today);
    else if (statusFilter === 'past') testsQuery = testsQuery.lte('test_date', today);

    testsQuery = testsQuery.range(offset, offset + limit - 1);

    const { data: tests, count: totalCount, error: testErr } = await testsQuery;
    if (testErr) throw testErr;

    if (!tests || tests.length === 0) {
      return NextResponse.json({ success: true, data: { total: 0, items: [], limit, offset } });
    }

    const testIds = tests.map(t => t.test_id);

    // Fetch marks counts & averages
    const { data: marks } = await supabase
      .from('daily_test_mark')
      .select('test_id, marks_obtained');

    // Organise marks per test
    const marksByTest = {};
    (marks || []).forEach(m => {
      if (!testIds.includes(m.test_id)) return;
      marksByTest[m.test_id] = marksByTest[m.test_id] || [];
      marksByTest[m.test_id].push(m);
    });

    // Get subjects names
    const subjectIds = [...new Set(tests.map(t => t.subject_id))];
    const subjectNamesMap = {};
    if (subjectIds.length > 0) {
      const { data: subjects } = await supabase
        .from('subject')
        .select('subject_id, name')
        .in('subject_id', subjectIds);
      (subjects || []).forEach(s => { subjectNamesMap[s.subject_id] = s.name; });
    }

    // Students count
    const { data: enrollmentCountData } = await supabase
      .from('student_enrollment')
      .select('enrollment_id', { count: 'exact', head: true })
      .eq('classroom_id', classId);
    const studentsCount = enrollmentCountData?.count ?? 0;

    // Compose items
    const items = tests.map(test => {
      const marksArr = marksByTest[test.test_id] || [];
      const avg = calculateAverage(marksArr);
      const status = determineStatus(test, marksArr.length);
      return {
        id: test.test_id,
        title: test.name || `Test #${test.test_id}`,
        subject: subjectNamesMap[test.subject_id] || test.subject_id,
        date: test.test_date,
        maxMarks: Number(test.max_marks),
        status,
        studentsCount,
        averageMarks: avg
      };
    });

    return NextResponse.json({ success: true, data: { total: totalCount ?? items.length, items, limit, offset } });
  } catch (err) {
    console.error('Teacher → Result → Tests list error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch tests' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST  /teacher/result/tests – create a new test
// ---------------------------------------------------------------------------
export async function POST(req) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();
  if (auth.user.role !== 'teacher') {
    return NextResponse.json({ success: false, message: 'Access denied. User is not a teacher.' }, { status: 403 });
  }
  const teacherId = auth.user.teacherId;

  const body = await req.json().catch(() => ({}));
  const { classId, title, subject, date, maxMarks } = body || {};
  if (!classId || !subject || !date || !maxMarks) {
    return NextResponse.json({ success: false, message: 'classId, subject, date, maxMarks are required' }, { status: 400 });
  }

  try {
    // Verify teacher assignment
    const { data: tc } = await supabase
      .from('teacher_class')
      .select('teacher_id')
      .eq('teacher_id', teacherId)
      .eq('class_id', classId)
      .maybeSingle();
    if (!tc) return NextResponse.json({ success: false, message: 'You are not assigned to this class' }, { status: 403 });

    // Insert test
    const { data: inserted, error: insErr } = await supabase
      .from('daily_test')
      .insert({
        classroom_id: classId,
        session_id: null,
        subject_id: subject,
        name: title,
        test_date: date,
        created_by: teacherId,
        max_marks: maxMarks,
        is_declared: false
      })
      .select('*')
      .single();
    if (insErr) throw insErr;

    // Compose response
    return NextResponse.json({ success: true, data: {
      id: inserted.test_id,
      title: inserted.name,
      subject,
      date: inserted.test_date,
      maxMarks: Number(inserted.max_marks),
      status: determineStatus(inserted, 0),
      studentsCount: 0,
      averageMarks: null
    } });
  } catch (err) {
    console.error('Teacher → Result → Create test error:', err);
    return NextResponse.json({ success: false, message: 'Failed to create test' }, { status: 500 });
  }
} 
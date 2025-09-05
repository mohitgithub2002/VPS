import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

function getGrade(percentage) {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C';
  if (percentage >= 40) return 'D';
  return 'F';
}

export async function GET(req, { params }) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();

  const { searchParams } = new URL(req.url);
  const studentId = auth.user.studentId;
  if (!studentId) return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });

  const subjectName = searchParams.get('subject');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const range = searchParams.get('range');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const sort = searchParams.get('sort') || 'newest';

  try {
    // Get enrollments for the student
    const { data: enrollments } = await supabase
      .from('student_enrollment')
      .select('enrollment_id')
      .eq('student_id', studentId);
    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ success: false, message: 'No enrollments found' }, { status: 404 });
    }
    const enrollmentIds = enrollments.map(e => e.enrollment_id);

    // Get all test marks for the student
    let testMarkQuery = supabase
      .from('daily_test_mark')
      .select('test_id, enrollment_id, marks_obtained, remark, is_absent, daily_test:test_id(name, subject_id, test_date, max_marks), teacher:updated_by(name)')
      .in('enrollment_id', enrollmentIds);

    const { data: testMarks } = await testMarkQuery;
    if (!testMarks) return NextResponse.json({ success: false, data: { total: 0, items: [] } });

    // Get subject names
    const subjectIds = [...new Set(testMarks.map(tm => tm.daily_test?.subject_id).filter(Boolean))];
    let subjectNames = {};
    if (subjectIds.length > 0) {
      const { data: subjects } = await supabase
        .from('subject')
        .select('subject_id, name')
        .in('subject_id', subjectIds);
      (subjects || []).forEach(s => { subjectNames[s.subject_id] = s.name; });
    }

    // Filter by subject name
    let filtered = testMarks.filter(tm => tm.daily_test && tm.daily_test.subject_id);
    if (subjectName) {
      filtered = filtered.filter(tm => subjectNames[tm.daily_test.subject_id] === subjectName);
    }
    // Filter by date
    if (dateFrom) {
      filtered = filtered.filter(tm => tm.daily_test && tm.daily_test.test_date >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter(tm => tm.daily_test && tm.daily_test.test_date <= dateTo);
    }
    // Range shortcut
    if (range === 'month') {
      const now = new Date();
      const month = now.getMonth();
      const year = now.getFullYear();
      filtered = filtered.filter(tm => {
        const d = new Date(tm.daily_test.test_date);
        return d.getMonth() === month && d.getFullYear() === year;
      });
    }
    // Sort
    filtered = filtered.sort((a, b) => {
      if (sort === 'newest') {
        return new Date(b.daily_test.test_date) - new Date(a.daily_test.test_date);
      }
      return new Date(a.daily_test.test_date) - new Date(b.daily_test.test_date);
    });
    // Pagination
    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);

    // Compose response
    const items = paged.map(tm => {
      const maxMarks = Number(tm.daily_test?.max_marks) || 0;
      const isAbsent = tm.is_absent || false;
      
      // For absent students, set marks to null and percentage to 0
      const marks = isAbsent ? null : Number(tm.marks_obtained);
      const percentage = isAbsent ? 0 : (maxMarks > 0 ? Math.round((Number(tm.marks_obtained) / maxMarks) * 100) : 0);
      
      return {
        id: tm.test_id,
        testName: tm.daily_test?.name || '',
        topic: undefined, // Not in schema
        subject: subjectNames[tm.daily_test.subject_id] || tm.daily_test.subject_id,
        date: tm.daily_test.test_date,
        marks,
        maxMarks,
        percentage,
        grade: isAbsent ? 'Absent' : getGrade(percentage),
        isAbsent,
        teacherRemarks: tm.remark || '',
        teacherName: tm.teacher?.name || undefined
        
      };
    });
    return NextResponse.json({ success: true, data: { total, items } });
  } catch (err) {
    console.error('Tests API error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch tests' }, { status: 500 });
  }
} 
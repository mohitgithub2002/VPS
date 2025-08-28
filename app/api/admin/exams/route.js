import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

// Helpers
function ok(body, status = 200) {
  return NextResponse.json({ success: true, ...body, timestamp: new Date().toISOString() }, { status });
}
function err(code, message, status = 400, details) {
  return NextResponse.json({ success: false, error: { code, message, details }, timestamp: new Date().toISOString() }, { status });
}

// Resolve latest session_id if not provided
async function getLatestSessionId() {
  const { data } = await supabase
    .from('sessions')
    .select('session_id')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.session_id || null;
}

// GET /api/admin/exams
// List exams with filters and pagination
export async function GET(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = (page - 1) * limit;

    const status = searchParams.get('status'); // ongoing | upcoming | completed | declared
    const classFilter = searchParams.get('class');
    const sectionFilter = searchParams.get('section');
    const examTypeFilter = searchParams.get('examType'); // match exam_type.code or name
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const sortBy = searchParams.get('sortBy') || 'start_date';
    const sortOrder = (searchParams.get('sortOrder') || 'desc').toLowerCase() === 'asc' ? true : false;
    const search = searchParams.get('search');

    let query = supabase
      .from('exam')
      .select(`
        exam_id,
        name,
        start_date,
        is_declared,
        classroom:classroom_id(class, section),
        exam_type:exam_type_id(name, code)
      `, { count: 'exact' })
      .order(sortBy === 'name' ? 'name' : 'start_date', { ascending: sortOrder })
      .range(offset, offset + limit - 1);

    if (startDate) query = query.gte('start_date', startDate);
    if (endDate) query = query.lte('start_date', endDate);

    // Status mapping
    if (status === 'declared' || status === 'completed') {
      query = query.eq('is_declared', true);
    } else if (status === 'upcoming') {
      query = query.gt('start_date', new Date().toISOString());
    } else if (status === 'ongoing') {
      // No dedicated ongoing flag; exclude declared and in the past week as heuristic
      query = query.eq('is_declared', false);
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    // Execute base exam query
    const { data: exams, error, count } = await query;
    if (error) return err('INTERNAL_ERROR', 'Failed to fetch exams', 500);

    // Apply client-side filters for classroom/examType using joined aliases
    let filtered = exams || [];
    if (classFilter) filtered = filtered.filter(e => (e.classroom?.class || '').toString() === classFilter.toString());
    if (sectionFilter) filtered = filtered.filter(e => (e.classroom?.section || '').toString().toLowerCase() === sectionFilter.toString().toLowerCase());
    if (examTypeFilter) {
      const low = examTypeFilter.toLowerCase();
      filtered = filtered.filter(e => (e.exam_type?.code || '').toLowerCase() === low || (e.exam_type?.name || '').toLowerCase() === low);
    }

    // Fetch summary stats per exam (completedStudents etc.) from exam_summary
    const examIds = filtered.map(e => e.exam_id);
    let summaries = [];
    if (examIds.length) {
      const { data: sumRows } = await supabase
        .from('exam_summary')
        .select('exam_id, enrollment_id, total_marks, max_marks, percentage');
      summaries = sumRows || [];
    }

    const items = filtered.map(e => {
      const s = summaries.filter(r => r.exam_id === e.exam_id);
      const completedStudents = s.length;
      const maxMarks = s.length ? Number(s[0].max_marks ?? 0) : null; // not reliable if mixed; best-effort
      return {
        examId: e.exam_id,
        examName: e.name || e.exam_type?.name || null,
        examType: e.exam_type?.code || null,
        class: e.classroom?.class || null,
        section: e.classroom?.section || null,
        status: e.is_declared ? 'declared' : 'scheduled',
        startDate: e.start_date,
        endDate: null,
        totalStudents: null,
        maxMarks,
        completedStudents,
        createdAt: null,
        updatedAt: null
      };
    });

    const total = count ?? items.length;
    const totalPages = limit ? Math.ceil(total / limit) : 0;

    return ok({ data: { exams: items, pagination: { currentPage: page, totalPages, totalItems: total, itemsPerPage: limit, hasNextPage: page < totalPages, hasPrevPage: page > 1 } }, message: 'Exams retrieved successfully' });
  } catch (e) {
    return err('INTERNAL_SERVER_ERROR', 'Unexpected error', 500);
  }
}

// POST /api/admin/exams
// Create exam and seed subject mark rows
export async function POST(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const body = await req.json();
    const { examName, examType, classroomId, startDate, endDate, subjects } = body || {};

    if (!examName || !classroomId || !startDate || !endDate ) {
      return err('VALIDATION_ERROR', 'Missing required fields: examName, classroomId, startDate', 400);
    }

    // Resolve classroom for latest session
    let { data: latestSession } = await supabase
      .from('sessions')
      .select('session_id')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestSessionId = latestSession?.session_id;

    let { data: classroom } = await supabase
      .from('classrooms')
      .select('classroom_id, session_id, class, section')
      .eq('classroom_id', classroomId)
      .order('session_id', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (!classroom) return err('CLASSROOM_NOT_FOUND', 'Classroom not found', 404);

    // Resolve exam_type_id (by code or name)
    let examTypeId = null;
    if (examType) {
      const { data: et } = await supabase
        .from('exam_type')
        .select('exam_type_id, code, name')
        .or(`code.eq.${examType},name.ilike.%${examType}%`)
        .limit(1)
        .maybeSingle();
      examTypeId = et?.exam_type_id || null;
      if (!examTypeId) {
        examTypeId = examType;
      }
    }
   

    // Create exam row
    const insertRow = {
      name: examName,
      classroom_id: classroom.classroom_id,
      session_id: classroom.session_id,
      start_date: startDate,
      end_date: endDate
    };
    if (examTypeId) insertRow.exam_type_id = examTypeId;

    const { data: examRow, error: insErr } = await supabase
      .from('exam')
      .insert([insertRow])
      .select('exam_id, name, start_date, is_declared, exam_type:exam_type_id(name, code), classroom:classroom_id(class, section)')
      .maybeSingle();
    // if (insErr) return err('INTERNAL_ERROR', 'Failed to create exam', 500);
    if (insErr) console.log('INTERNAL_ERROR', 'Failed to create exam', insErr);
    // Seed exam_mark rows for provided subjects
    console.log('subjects', subjects);
    if (Array.isArray(subjects) && subjects.length > 0) {
      // Get enrollments for classroom
      const { data: enrollments } = await supabase
        .from('student_enrollment')
        .select('enrollment_id')
        .eq('classroom_id', classroom.classroom_id);

      console.log('enrollments', enrollments);

      const enrollmentIds = (enrollments || []).map(e => e.enrollment_id);
      console.log('enrollmentIds', enrollmentIds);
      if (enrollmentIds.length) {
        const rows = [];
        console.log('rows1', rows);
        subjects.forEach(s => {
          console.log('s', s);
          if (!s?.subjectId || s?.maxMarks == null) return;
          enrollmentIds.forEach(enr => {
            console.log('enr', enr);
            console.log('Row', examRow.exam_id, enr, s.subjectId, s.maxMarks);
            rows.push({
              exam_id: examRow.exam_id,
              enrollment_id: enr,
              subject_id: s.subjectId,
              marks_obtained: null,
              max_marks: s.maxMarks,
              remark: null,
              updated_by:  null
            });
          });
        });
        console.log('rows', rows); 
        if (rows.length) {
          const { error: emErr } = await supabase.from('exam_mark').insert(rows, { upsert: false });
          if (emErr && !String(emErr?.message || '').toLowerCase().includes('duplicate')) {
            return err('INTERNAL_ERROR', 'Failed to seed exam subjects', 500);
          }
        }
      }
    }

    const response = {
      examId: examRow.exam_id,
      examName: examRow.name || examRow.exam_type?.name || null,
      examType: examRow.exam_type?.code || null,
      class: examRow.classroom?.class || null,
      section: examRow.classroom?.section || null,
      status: examRow.is_declared ? 'declared' : 'created',
      startDate: examRow.start_date,
      endDate: null,
      maxMarks: null,
      subjectsCount: Array.isArray(subjects) ? subjects.length : 0,
      createdAt: null
    };

    return ok({ data: response, message: 'Exam created successfully' }, 201);
  } catch (e) {
    return err('INTERNAL_SERVER_ERROR', 'Unexpected error', 500);
  }
}



import { NextResponse } from 'next/server';
import { supabase } from "@/utils/supabaseClient";
import { authenticateAdmin, unauthorized } from '@/lib/auth';
import { getActiveSession } from '@/utils/sessionHelper';

// Helper function to format response
const formatResponse = (data, success = true) => {
  return NextResponse.json({
    success,
    data,
    timestamp: new Date().toISOString(),
  });
};

// Helper function to format error response
const formatError = (code, message, status = 400) => {
  return NextResponse.json({
    success: false,
    error: {
      code,
      message,
    },
    timestamp: new Date().toISOString(),
  }, { status });
};

// Custom sorting function for classes
const sortClasses = (a, b) => {
  const classOrder = {
    'nursery': 1,
    'lkg': 2,
    'ukg': 3,
    '1': 4,
    '2': 5,
    '3': 6,
    '4': 7,
    '5': 8,
    '6': 9,
    '7': 10,
    '8': 11,
    '9': 12,
    '10': 13
  };

  const aClass = a.class.toLowerCase();
  const bClass = b.class.toLowerCase();

  return (classOrder[aClass] || 999) - (classOrder[bClass] || 999);
};

// GET /api/admin/classes - List all classes
export async function GET(request) {
  // Authenticate the incoming request
  const auth = await authenticateAdmin(request);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');
    const search = searchParams.get('search');

    let query = supabase
      .from('classrooms')
      .select(`
        classroom_id,
        session_id,
        class,
        section,
        medium,
        total_student,
        created_at
      `);

    // If session_id is not provided, get the active session
    if (!sessionId) {
      const activeSession = await getActiveSession();

      if (activeSession) {
        query = query.eq('session_id', activeSession.session_id);
      }
    } else {
      query = query.eq('session_id', sessionId);
    }

    // Apply search filter if provided
    if (search) {
      query = query.or(`class.ilike.%${search}%,section.ilike.%${search}%,medium.ilike.%${search}%`);
    }

    const { data: classes, error } = await query;

    if (error) throw error;

    // Sort the classes
    const sortedClasses = classes.sort(sortClasses);

    return formatResponse({
      classes: sortedClasses.map(cls => ({
        classroom_id: cls.classroom_id,
        session_id: cls.session_id,
        class: cls.class,
        section: cls.section,
        medium: cls.medium,
        total_student: cls.total_student ?? 0,
        created_at: cls.created_at,
      }))
    });
  } catch (error) {
    return formatError('INTERNAL_ERROR', 'Failed to fetch classes', 500);
  }
}

// POST /api/admin/classes - Create a new classroom
export async function POST(request) {
  const auth = await authenticateAdmin(request);
  if (!auth.authenticated) return unauthorized();

  try {
    const body = await request.json();
    const { session_id, class: className, section, medium } = body;

    if (!session_id) return formatError('VALIDATION_ERROR', 'session_id is required');
    if (!className) return formatError('VALIDATION_ERROR', 'class is required');
    if (!section) return formatError('VALIDATION_ERROR', 'section is required');
    if (!medium) return formatError('VALIDATION_ERROR', 'medium is required');

    const { data, error } = await supabase
      .from('classrooms')
      .insert({
        session_id: Number(session_id),
        class: className.trim(),
        section: section.trim(),
        medium: medium.trim(),
      })
      .select('classroom_id, session_id, class, section, medium, total_student, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return formatError('DUPLICATE_CLASSROOM', 'A classroom with this class, section, and medium already exists for the selected session');
      }
      if (error.code === '23503') {
        return formatError('INVALID_SESSION', 'The specified session does not exist');
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: { classroom: data },
      message: 'Classroom created successfully',
      timestamp: new Date().toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/admin/classes error:', error);
    return formatError('INTERNAL_ERROR', 'Failed to create classroom', 500);
  }
}

// PUT /api/admin/classes - Update an existing classroom
export async function PUT(request) {
  const auth = await authenticateAdmin(request);
  if (!auth.authenticated) return unauthorized();

  try {
    const body = await request.json();
    const { classroom_id, class: className, section, medium } = body;

    if (!classroom_id) return formatError('VALIDATION_ERROR', 'classroom_id is required');

    const updates = {};
    if (className !== undefined) updates.class = className.trim();
    if (section !== undefined) updates.section = section.trim();
    if (medium !== undefined) updates.medium = medium.trim();

    if (Object.keys(updates).length === 0) {
      return formatError('VALIDATION_ERROR', 'No fields to update');
    }

    const { data, error } = await supabase
      .from('classrooms')
      .update(updates)
      .eq('classroom_id', Number(classroom_id))
      .select('classroom_id, session_id, class, section, medium, total_student, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return formatError('DUPLICATE_CLASSROOM', 'A classroom with this class, section, and medium already exists for the selected session');
      }
      throw error;
    }

    if (!data) return formatError('NOT_FOUND', 'Classroom not found', 404);

    return NextResponse.json({
      success: true,
      data: { classroom: data },
      message: 'Classroom updated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('PUT /api/admin/classes error:', error);
    return formatError('INTERNAL_ERROR', 'Failed to update classroom', 500);
  }
}

// DELETE /api/admin/classes?classroom_id=X - Delete a classroom
export async function DELETE(request) {
  const auth = await authenticateAdmin(request);
  if (!auth.authenticated) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const classroomId = searchParams.get('classroom_id');

    if (!classroomId) return formatError('VALIDATION_ERROR', 'classroom_id query param is required');

    const { error } = await supabase
      .from('classrooms')
      .delete()
      .eq('classroom_id', Number(classroomId));

    if (error) {
      if (error.code === '23503') {
        return formatError('HAS_DEPENDENCIES', 'Cannot delete this classroom because it has associated data (students, teachers, etc.)');
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'Classroom deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('DELETE /api/admin/classes error:', error);
    return formatError('INTERNAL_ERROR', 'Failed to delete classroom', 500);
  }
}

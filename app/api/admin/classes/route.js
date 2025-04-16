import { NextResponse } from 'next/server';
import { supabase } from "@/utils/supabaseClient";
import { authenticateAdmin, unauthorized } from '@/lib/auth';

// Helper function to format response
const formatResponse = (data, success = true) => {
  return NextResponse.json({
    success,
    data,
    timestamp: new Date().toISOString(),
  });
};

// Helper function to format error response
const formatError = (code, message) => {
  return NextResponse.json({
    success: false,
    error: {
      code,
      message,
    },
    timestamp: new Date().toISOString(),
  }, { status: 400 });
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
        class,
        section,
        medium
      `);

    // If session_id is not provided, get the latest session
    if (!sessionId) {
      const { data: latestSession } = await supabase
        .from('sessions')
        .select('session_id')
        .order('start_date', { ascending: false })
        .limit(1)
        .single();

      if (latestSession) {
        query = query.eq('session_id', latestSession.session_id);
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
        class: cls.class,
        section: cls.section,
        medium: cls.medium
      }))
    });
  } catch (error) {
    return formatError('INTERNAL_ERROR', 'Failed to fetch classes');
  }
}

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

/**
 * Teacher → Subjects API Route
 * 
 * Method: GET
 * URL   : /api/teacher/subjects
 *
 * Description:
 *   Returns the list of all subjects present in the system.
 *   The endpoint is accessible only to authenticated teachers.
 *
 * Response:
 *   200 – { success: true, data: Subject[] }
 *   401 – Unauthorized
 *   403 – Forbidden (if user is not a teacher)
 *   500 – Internal server error
 */
export async function GET(req) {
  // 1. Authenticate the user
  const auth = await authenticateUser(req);
  if (!auth.authenticated) {
    return unauthorized();
  }

  // 2. Ensure the user has teacher role
  if (auth.user.role !== 'teacher') {
    return NextResponse.json(
      { success: false, message: 'Access denied. User is not a teacher.' },
      { status: 403 }
    );
  }

  try {
    // 3. Fetch all subjects ordered by name
    const { data: subjects, error } = await supabase
      .from('subject')
      .select('subject_id, name')
      .order('name', { ascending: true });

    if (error) throw error;

    // 4. Map database columns to API response fields
    const formatted = (subjects || []).map((s) => ({
      subjectId: s.subject_id,
      name: s.name,
    }));

    // 5. Respond with subjects
    return NextResponse.json({ success: true, data: formatted });
  } catch (err) {
    console.error('Teacher → Subjects API error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch subjects' },
      { status: 500 }
    );
  }
}

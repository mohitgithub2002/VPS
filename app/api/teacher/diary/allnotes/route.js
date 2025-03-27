/**
 * Teacher's Diary Entries API Route
 * 
 * This API endpoint fetches all diary entries created by a specific teacher,
 * filtered by classroom or enrollment. It supports pagination.
 * 
 * Authentication: Required (Teacher)
 * Method: GET
 * Query Parameters:
 *   - classroomId: Filter broadcast entries by classroom (optional)
 *   - enrollmentId: Filter personal entries by student enrollment (optional)
 *   - page: Page number for pagination (default: 1)
 *   - limit: Entries per page (default: 20)
 * 
 * Response:
 *   - 200: JSON with diary entries and pagination info
 *   - 401: Unauthorized
 *   - 500: Server error
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

export async function GET(req) {
  // Authenticate teacher
  const auth = await authenticateUser(req);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  const teacherId = auth.user.teacherId;
  
  try {
    // Parse URL to extract query parameters
    const { searchParams } = new URL(req.url);
    const classroomId = searchParams.get('classroomId');
    const enrollmentId = searchParams.get('enrollmentId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    
    // Calculate pagination range
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Build base query
    let query = supabase
      .from('diary_entries')
      .select(`
        entry_id,
        subject,
        content,
        created_at,
        entry_type,
        enrollment_id,
        classroom_id,
        classrooms!inner (
          classroom_id,
          class,
          section,
          medium
        ),
        student_enrollment (
          enrollment_id,
          students (
            name
          )
        )
      `, { count: 'exact' })
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });

    // Apply filters based on query parameters
    if (classroomId) {
      // If classroomId is present, show only broadcast messages for that classroom
      query = query
        .eq('classroom_id', classroomId)
        .eq('entry_type', 'Broadcast');
    } else if (enrollmentId) {
      // If enrollmentId is present, show only personal messages for that student
      query = query
        .eq('enrollment_id', enrollmentId)
        .eq('entry_type', 'Personal');
    }

    // Apply pagination
    query = query.range(from, to);

    // Execute query
    const { data: entries, count, error } = await query;

    if (error) throw error;

    // Transform entries into a cleaner format
    const formattedEntries = entries.map(entry => ({
      id: entry.entry_id,
      subject: entry.subject,
      content: entry.content,
      date: entry.created_at,
      entryType: entry.entry_type,
      classroom: {
        id: entry.classrooms.classroom_id,
        class: entry.classrooms.class,
        section: entry.classrooms.section,
        medium: entry.classrooms.medium
      },
      student: entry.entry_type === 'Personal' ? {
        name: entry.student_enrollment?.[0]?.students?.name,
        enrollmentId: entry.enrollment_id
      } : null
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(count / limit);

    // Return formatted response
    return NextResponse.json({
      success: true,
      data: {
        entries: formattedEntries,
        pagination: {
          currentPage: page,
          totalPages,
          totalEntries: count,
          entriesPerPage: limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Fetch diary entries API error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch diary entries' },
      { status: 500 }
    );
  }
}

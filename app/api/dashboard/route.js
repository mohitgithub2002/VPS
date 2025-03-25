/**
 * Dashboard API Route Handler
 * --------------------------
 * This API endpoint serves as the primary data source for the student dashboard,
 * aggregating multiple data points into a single, efficient response.
 * 
 * Authentication:
 * - Requires valid user authentication
 * - Access restricted to authenticated students only
 * 
 * Response Format:
 * {
 *   success: boolean,
 *   announcements: Array<Announcement>,
 *   diaryEntries: Array<DiaryEntry>,
 *   attendance: {
 *     present: number,
 *     absent: number,
 *     leave: number
 *   },
 *   events: Array<Event>
 * }
 * 
 * Error Handling:
 * - Returns 401 for unauthorized access
 * - Returns 500 for server-side errors with error logging
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

export async function GET(req) {
  // Authenticate the incoming request
  const auth = await authenticateUser(req);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  const { studentId, enrollmentId, classId } = auth.user;
  
  try {
    // Execute multiple queries in parallel for optimal performance
    const [
      announcementsResponse,
      diaryEntriesResponse,
      attendanceResponse,
      eventsResponse
    ] = await Promise.all([
      // Fetch latest active announcements
      // Limited to 3 most recent entries for dashboard display
      supabase
        .from('announcements')
        .select('announcement_id, title, description, date, priority, type')
        .eq('is_active', true)
        .order('date', { ascending: false })
        .limit(3),

      // Fetch diary entries with teacher information
      // Includes both personal entries and broadcast messages for student's classroom
      supabase
        .from('diary_entries')
        .select(`
          entry_id,
          enrollment_id,
          subject,
          content,
          created_at,
          entry_type,
          classroom_id,
          teachers:teacher_id (
            name
          )
        `)
        .or(`enrollment_id.eq.${enrollmentId},and(entry_type.eq.Broadcast,classroom_id.eq.${classId})`)
        .order('created_at', { ascending: false })
        .limit(3),

      // Get aggregated attendance statistics using updated database function
      supabase
        .rpc('get_attendance_summary', { 
          p_enrollment_id: enrollmentId
        }),

      // Fetch upcoming events
      // Only returns events from today onwards, ordered by date
      supabase
        .from('events')
        .select('event_id, title, description, date, time, location')
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .limit(3)
    ]);

    // Validate responses from all parallel queries
    if (announcementsResponse.error) throw announcementsResponse.error;
    if (diaryEntriesResponse.error) throw diaryEntriesResponse.error;
    if (attendanceResponse.error) throw attendanceResponse.error;
    if (eventsResponse.error) throw eventsResponse.error;

    // Process attendance data with default values if no records exist
    const attendance = attendanceResponse.data[0] || {
      present: 0,
      absent: 0,
      leave: 0
    };

    // Construct and return the consolidated dashboard response
    return NextResponse.json({
      success: true,
      announcements: announcementsResponse.data,
      diaryEntries: diaryEntriesResponse.data,
      attendance,
      events: eventsResponse.data
    });

  } catch (error) {
    // Log error for debugging and monitoring
    console.error('Dashboard API error:', error);
    
    // Return a generic error response to avoid exposing internal details
    return NextResponse.json(
      { success: false, message: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}

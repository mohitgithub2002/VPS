/**
 * Diary API Route
 * 
 * This API endpoint handles fetching diary entries for students.
 * It retrieves both personal entries specific to the student and
 * broadcast entries targeted at the student's class and section.
 * 
 * Authentication: Required (Student)
 * Method: GET
 * Query Parameters:
 *   - date (optional): Filter entries by specific date (YYYY-MM-DD format)
 * 
 * Response:
 *   - 200: JSON with diary entries
 *   - 401: Unauthorized
 *   - 500: Server error
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

/**
 * GET handler for diary entries
 * 
 * @param {Request} req - The incoming request object
 * @returns {NextResponse} JSON response with diary entries or error
 */
export async function GET(req) {
  // Authenticate the user making the request
  const auth = await authenticateUser(req);
  
  // Return unauthorized response if authentication fails
  if (!auth.authenticated) {
    return unauthorized();
  }

  // Extract student ID from authenticated user
  const userId = auth.user.studentId;
  
  // Parse URL to extract query parameters
  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  
  try {
    // First, get the user's class and section from the students table
    // This is needed to fetch relevant broadcast entries
    const { data: userData, error: userError } = await supabase
      .from('students')
      .select('class, section')
      .eq('id', userId)
      .single();
    
    if (userError) throw userError;
    
    const userClass = userData.class;
    const userSection = userData.section;
    
    // Build query to fetch both personal entries and broadcast entries
    // Personal entries: entries specifically created for this student
    // Broadcast entries: entries targeted at the student's class and section
    let query = supabase
      .from('diary_entries')
      .select(`
        entry_id,
        subject,
        content,
        created_at,
        entry_type,
        teachers:teacher_id (
            name
        )
      `)
      // Complex OR condition to get both personal and relevant broadcast entries
      .or(`user_id.eq.${userId},and(entry_type.eq.Broadcast,class.eq.${userClass},section.eq.${userSection})`);
      
    // Apply date filter if provided in query parameters
    if (date) {
      query = query.eq('created_at', date);
    }
    
    // Sort entries by creation date in ascending order
    query = query.order('created_at', { ascending: true });
    
    // Execute the query
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Transform database entries into a cleaner response format
    // This provides a consistent API response structure
    const formattedEntries = data.map(entry => ({
      id: entry.entry_id,
      subject: entry.subject,
      content: entry.content,
      date: entry.created_at,
      entryType: entry.entry_type,
      teacher: {
        name: entry.teachers?.name || 'System'
      }
    }));

    // Return successful response with formatted entries
    return NextResponse.json({
      success: true,
      entries: formattedEntries
    });

  } catch (error) {
    // Log error for server-side debugging
    console.error('Diary API error:', error);
    
    // Return error response to client
    return NextResponse.json(
      { success: false, message: 'Failed to fetch diary entries' },
      { status: 500 }
    );
  }
}

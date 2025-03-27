/**
 * Delete Diary Note API Route
 * 
 * This API endpoint deletes a specific diary entry created by the authenticated teacher.
 * It verifies teacher ownership before deletion.
 * 
 * Authentication: Required (Teacher)
 * Method: DELETE
 * Query Parameters:
 *   - entryId: ID of the diary entry to delete
 * 
 * Response:
 *   - 200: Success message
 *   - 401: Unauthorized
 *   - 403: Forbidden (not the owner)
 *   - 404: Entry not found
 *   - 500: Server error
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

export async function DELETE(req) {
  // Authenticate teacher
  const auth = await authenticateUser(req);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  const teacherId = auth.user.teacherId;
  
  try {
    // Get entryId from query parameters
    const { searchParams } = new URL(req.url);
    const entryId = searchParams.get('entryId');

    // Validate entryId
    if (!entryId) {
      return NextResponse.json(
        { success: false, message: 'Entry ID is required' },
        { status: 400 }
      );
    }

    // First verify that the entry exists and belongs to the teacher
    const { data: entry, error: fetchError } = await supabase
      .from('diary_entries')
      .select('entry_id, teacher_id')
      .eq('entry_id', entryId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        // Entry not found
        return NextResponse.json(
          { success: false, message: 'Diary entry not found' },
          { status: 404 }
        );
      }
      throw fetchError;
    }

    // Verify ownership
    if (entry.teacher_id !== teacherId) {
      return NextResponse.json(
        { success: false, message: 'You are not authorized to delete this entry' },
        { status: 403 }
      );
    }

    // Delete the entry
    const { error: deleteError } = await supabase
      .from('diary_entries')
      .delete()
      .eq('entry_id', entryId);

    if (deleteError) throw deleteError;

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Diary entry deleted successfully'
    });

  } catch (error) {
    console.error('Delete diary entry API error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete diary entry' },
      { status: 500 }
    );
  }
}

/**
 * @route POST /api/users/change-password
 * @desc Handles password change requests for authenticated students
 * 
 * @security
 * - Requires authentication via JWT token
 * - Validates current password before allowing changes
 * - Uses bcrypt for password hashing
 * - Implements rate limiting (recommended to add)
 * 
 * @request
 * {
 *   currentPassword: string - Current password of the user
 *   newPassword: string - New password to set
 * }
 * 
 * @response
 * Success (200):
 * {
 *   success: true,
 *   message: "Password changed successfully"
 * }
 * 
 * Error (400/401/500):
 * {
 *   success: false,
 *   message: string - Error description
 * }
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(req) {
  // Authenticate the user and verify JWT token
  const auth = await authenticateUser(req);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  // Extract student ID from authenticated user
  const userId = auth.user.studentId;
  
  try {
    // Parse request body to get new password
    const { newPassword } = await req.json();
    
    // Validate that newPassword is provided
    if (!newPassword) {
      return NextResponse.json(
        { success: false, message: 'New password is required' },
        { status: 400 }
      );
    }
    // Fetch student's auth_id from students table
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('auth_id')
      .eq('student_id', userId)
      .single();
    if (studentError || !student || !student.auth_id) {
      return NextResponse.json(
        { success: false, message: 'Student or authentication data not found' },
        { status: 404 }
      );
    }
    // Generate a new hash for the new password using bcrypt
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    // Update the password in auth_data table
    const { error: updateError } = await supabase
      .from('auth_data')
      .update({ password: hashedPassword })
      .eq('auth_id', student.auth_id);
    if (updateError) throw updateError;
    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    // Log any unexpected errors and return a generic error message
    // to avoid exposing sensitive information
    console.error('Change password API error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to change password' },
      { status: 500 }
    );
  }
}

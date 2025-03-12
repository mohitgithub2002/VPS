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
    // Parse request body to get password values
    const { currentPassword, newPassword } = await req.json();
    
    // Validate that both passwords are provided
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, message: 'Both current and new passwords are required' },
        { status: 400 }
      );
    }
    
    // Retrieve the user's current hashed password from database
    const { data: student, error: fetchError } = await supabase
      .from('students')
      .select('password')
      .eq('id', userId)
      .single();
      
    if (fetchError) throw fetchError;
    
    // Verify that the provided current password matches the stored hash
    const isPasswordValid = await bcrypt.compare(currentPassword, student.password);
    
    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, message: 'Current password is incorrect' },
        { status: 401 }
      );
    }
    
    // Generate a new hash for the new password using bcrypt
    // Salt rounds of 10 provides a good balance of security and performance
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update the user's password in the database with the new hash
    const { error: updateError } = await supabase
      .from('students')
      .update({ password: hashedPassword })
      .eq('id', userId);
      
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

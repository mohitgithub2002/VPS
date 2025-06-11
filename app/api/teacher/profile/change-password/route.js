import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(req) {
  // Authenticate teacher
  const auth = await authenticateUser(req);
  if (!auth.authenticated) {
    return unauthorized();
  }
  if (auth.user.role !== 'teacher') {
    return NextResponse.json(
      { success: false, message: 'Access denied. User is not a teacher.' },
      { status: 403 }
    );
  }
  const teacherId = auth.user.teacherId;
  try {
    // Parse request body to get new password
    const { newPassword } = await req.json();
    if (!newPassword) {
      return NextResponse.json(
        { success: false, message: 'New password is required' },
        { status: 400 }
      );
    }
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    // Update the password in teachers table
    const { error: updateError } = await supabase
      .from('teachers')
      .update({ password: hashedPassword })
      .eq('teacher_id', teacherId);
    if (updateError) throw updateError;
    return NextResponse.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Teacher change password API error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to change password' },
      { status: 500 }
    );
  }
}

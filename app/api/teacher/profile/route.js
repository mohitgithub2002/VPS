/**
 * Teacher Profile API Route
 * 
 * This API endpoint retrieves the profile information of the authenticated teacher.
 * It includes personal details, contact information, and professional details.
 * 
 * Authentication: Required (Teacher)
 * Method: GET
 * 
 * Response:
 *   - 200: JSON with teacher profile
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

  // Verify the user is a teacher
  if (auth.user.role !== 'teacher') {
    return NextResponse.json(
      { success: false, message: 'Access denied. User is not a teacher.' },
      { status: 403 }
    );
  }

  const teacherId = auth.user.teacherId;
  
  try {
    // Fetch teacher profile data
    const { data: teacher, error } = await supabase
      .from('teachers')
      .select(`
        teacher_id,
        name,
        email,
        mobile,
        subject,
        address,
        created_at
      `)
      .eq('teacher_id', teacherId)
      .single();

    if (error) throw error;

    if (!teacher) {
      return NextResponse.json(
        { success: false, message: 'Teacher profile not found' },
        { status: 404 }
      );
    }

    // Format the response data
    const formattedProfile = {
      id: teacher.teacher_id,
      name: teacher.name,
      email: teacher.email,
      mobile: teacher.mobile,
      subject: teacher.subject,
      address: teacher.address,
      createdAt: teacher.created_at
    };

    // Return formatted response
    return NextResponse.json({
      success: true,
      data: formattedProfile
    });

  } catch (error) {
    console.error('Teacher profile API error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch teacher profile' },
      { status: 500 }
    );
  }
}

/**
 * Update Teacher Profile API Route
 * 
 * This API endpoint updates the profile information of the authenticated teacher.
 * 
 * Authentication: Required (Teacher)
 * Method: PUT
 * 
 * Request Body:
 *   - name: string (optional)
 *   - email: string (optional)
 *   - mobile: string (optional)
 *   - subject: string (optional)
 *   - address: string (optional)
 * 
 * Response:
 *   - 200: JSON with updated profile
 *   - 401: Unauthorized
 *   - 500: Server error
 */

export async function PUT(req) {
  // Authenticate teacher
  const auth = await authenticateUser(req);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  // Verify the user is a teacher
  if (auth.user.role !== 'teacher') {
    return NextResponse.json(
      { success: false, message: 'Access denied. User is not a teacher.' },
      { status: 403 }
    );
  }

  const teacherId = auth.user.teacherId;
  
  try {
    // Get update data from request body
    const updateData = await req.json();

    // Validate update data
    if (!updateData || Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, message: 'No update data provided' },
        { status: 400 }
      );
    }

    // Update teacher profile
    const { data: updatedTeacher, error } = await supabase
      .from('teachers')
      .update(updateData)
      .eq('teacher_id', teacherId)
      .select()
      .single();

    if (error) throw error;

    if (!updatedTeacher) {
      return NextResponse.json(
        { success: false, message: 'Teacher profile not found' },
        { status: 404 }
      );
    }

    // Format the response data
    const formattedProfile = {
      id: updatedTeacher.teacher_id,
      name: updatedTeacher.name,
      email: updatedTeacher.email,
      mobile: updatedTeacher.mobile,
      subject: updatedTeacher.subject,
      address: updatedTeacher.address,
      createdAt: updatedTeacher.created_at
    };

    // Return formatted response
    return NextResponse.json({
      success: true,
      data: formattedProfile,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('Teacher profile update API error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update teacher profile' },
      { status: 500 }
    );
  }
}

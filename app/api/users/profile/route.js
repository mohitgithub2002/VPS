/**
 * @file Profile API Route
 * @description Handles requests for retrieving user profile information
 * 
 * This API endpoint retrieves a student's complete profile information from the database
 * and formats it into structured sections (personal, contact, academic) for frontend display.
 * The endpoint is protected and requires authentication.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

/**
 * GET handler for the profile endpoint
 * 
 * @param {Request} req - The incoming HTTP request object
 * @returns {NextResponse} JSON response containing the user's profile data or error message
 */
export async function GET(req) {
  // Authenticate the user making the request
  const auth = await authenticateUser(req);
  
  // Return 401 Unauthorized if authentication fails
  if (!auth.authenticated) {
    return unauthorized();
  }

  const { studentId, enrollmentId } = auth.user;
  
  try {
    // Query the database to retrieve the student's complete profile data
    // Using Supabase ORM to fetch data from multiple tables
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select(`
        student_id,
        name,
        date_of_birth,
        gender,
        nic_id,
        email,
        address,
        father_name,
        mother_name,
        status,
        auth_id,
        auth_data!inner (
          mobile,
          email
        ),
        student_enrollment!inner (
          enrollment_id,
          roll_no,
          classroom_id,
          classrooms!inner (
            classroom_id,
            class,
            section,
            medium
          )
        )
      `)
      .eq('student_id', studentId)
      .eq('student_enrollment.enrollment_id', enrollmentId)
      .single();
      
    // Throw any database query errors to be caught by the error handler
    if (studentError) throw studentError;
    
    // Format the raw database data into organized sections for the profile screen
    const profile = {
      // Personal information section
      personal: {
        name: student.name,
        dateOfBirth: student.date_of_birth,
        gender: student.gender,
        nicId: student.nic_id,
        status: student.status
      },
      // Contact information section
      contact: {
        mobile: student.auth_data?.mobile,
        email: student.auth_data?.email || student.email, // Fallback to student email if auth_data email is null
        address: student.address,
        fatherName: student.father_name,
        motherName: student.mother_name
      },
      // Academic information section
      academic: {
        rollNumber: student.student_enrollment[0]?.roll_no,
        class: student.student_enrollment[0]?.classrooms?.class,
        section: student.student_enrollment[0]?.classrooms?.section,
        medium: student.student_enrollment[0]?.classrooms?.medium,
        classroomId: student.student_enrollment[0]?.classrooms?.classroom_id
      }
    };

    // Return successful response with the formatted profile data
    return NextResponse.json({
      success: true,
      profile
    });

  } catch (error) {
    // Log the error for server-side debugging
    console.error('Profile API error:', error);
    
    // Return a user-friendly error response with appropriate HTTP status code
    return NextResponse.json(
      { success: false, message: 'Failed to fetch user profile' },
      { status: 500 }
    );
  }
}

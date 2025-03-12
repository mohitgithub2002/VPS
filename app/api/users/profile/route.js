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

  // Extract the authenticated user's ID
  const userId = auth.user.studentId;
  
  try {
    // Query the database to retrieve the student's complete profile data
    // Using Supabase ORM to fetch a single record matching the user ID
    const { data: student, error } = await supabase
      .from('students')
      .select('*')
      .eq('id', userId)
      .single();
      
    // Throw any database query errors to be caught by the error handler
    if (error) throw error;
    
    // Format the raw database data into organized sections for the profile screen
    const profile = {
      // Personal information section
      personal: {
        name: student.name,
        dateOfBirth: student.date_of_birth,
        gender: student.gender,
        nicId: student.nic_id,
        medium: student.medium,
        admissionDate: student.admission_date
      },
      // Contact information section
      contact: {
        mobile: student.mobile,
        email: student.email,
        address: student.address,
        fatherName: student.father_name,
        motherName: student.mother_name
      },
      // Academic information section
      academic: {
        rollNumber: student.roll_no,
        class: student.class,
        section: student.section
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

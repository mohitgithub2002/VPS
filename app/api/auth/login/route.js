/**
 * @fileoverview API endpoint for user authentication
 * @module api/auth/login
 */

/**
 * POST /api/auth/login
 * Authenticates a user using mobile number and password
 * 
 * @param {Object} req - Next.js API request
 * @param {Object} req.body - Request body
 * @param {string} req.body.mobile - User's mobile number
 * @param {string} req.body.password - User's password
 * 
 * @returns {Object} Response object
 * @returns {string} response.status - 'success' or 'error'
 * @returns {string} response.message - Response message
 * @returns {Object} [response.data] - Response payload on success
 * @returns {Array} response.data.profiles - Array of student profiles with their tokens and classroom info
 * 
 * @throws {Error} 401 - Invalid credentials
 * @throws {Error} 500 - Internal server error
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/utils/supabaseClient';
import { signJWT } from '@/lib/jwt';

export async function POST(req) {
  try {
    const { mobile, password } = await req.json();

    // First authenticate with auth_data table
    const { data: authData, error: authError } = await supabase
      .from('auth_data')
      .select('*')
      .eq('mobile', mobile)
      .single();

    if (authError || !authData || !await bcrypt.compare(password, authData.password)) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid mobile number or password' },
        { status: 401 }
      );
    }

    // First get all students for this auth_id
    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select('student_id, status, name')
      .eq('auth_id', authData.auth_id);

    if (studentsError) {
      console.error('Error fetching students:', studentsError);
      return NextResponse.json(
        { status: 'error', message: 'Error retrieving student profiles' },
        { status: 500 }
      );
    }

    if (!students || students.length === 0) {
      return NextResponse.json(
        { status: 'error', message: 'No student profiles found for this account' },
        { status: 404 }
      );
    }

    // Get enrollments for all students in a separate query
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('student_enrollment')
      .select(`
        enrollment_id,
        student_id,
        roll_no,
        classroom_id,
        classrooms (
          classroom_id,
          class,
          section,
          medium
        )
      `)
      .in('student_id', students.map(s => s.student_id))
      .order('created_at', { ascending: false });

    if (enrollmentsError) {
      console.error('Error fetching enrollments:', enrollmentsError);
      return NextResponse.json(
        { status: 'error', message: 'Error retrieving student enrollments' },
        { status: 500 }
      );
    }

    // Create a map of student_id to their latest enrollment
    const enrollmentMap = new Map();
    enrollments?.forEach(enrollment => {
      if (!enrollmentMap.has(enrollment.student_id)) {
        enrollmentMap.set(enrollment.student_id, enrollment);
      }
    });

    // Create profiles for all students, handling active and inactive differently
    const profiles = students.map(student => {
      const enrollment = enrollmentMap.get(student.student_id);
      const classroom = enrollment?.classrooms;

      // Base user object with common information
      const userInfo = {
        id: student.student_id,
        status: student.status,
        name: student.name,
        rollNo: enrollment?.roll_no || null,
        class: classroom?.class || null,
        section: classroom?.section || null,
        medium: classroom?.medium || null
      };

      // If student is active and has enrollment, include token and full access
      if (student.status === 'Active' && enrollment) {
        const token = signJWT({
          authId: authData.auth_id,
          studentId: student.student_id,
          enrollmentId: enrollment.enrollment_id,
          classId: classroom.classroom_id,
          name: student.name
        });

        return {
          token,
          user: userInfo,
          access: 'full'
        };
      }

      // For inactive students or those without enrollment, return without token
      return {
        user: userInfo,
        access: 'restricted',
        message: student.status !== 'Active' 
          ? 'Your account is currently inactive. Please contact the school administration.'
          : 'No active enrollment found. Please contact the school administration.'
      };
    });

    return NextResponse.json({
      status: 'success',
      message: 'Login successful',
      data: {
        profiles
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

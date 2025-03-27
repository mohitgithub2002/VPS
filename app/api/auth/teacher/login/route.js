/**
 * @fileoverview API endpoint for teacher authentication
 * @module api/auth/teacher/login
 */

/**
 * POST /api/auth/teacher/login
 * Authenticates a teacher using employee ID and password
 * 
 * @param {Object} req - Next.js API request
 * @param {Object} req.body - Request body
 * @param {string} req.body.teacherId - Teacher's employee ID
 * @param {string} req.body.password - Teacher's password
 * 
 * @returns {Object} Response object
 * @returns {boolean} response.success - Whether the request was successful
 * @returns {Object} response.data - Response payload on success
 * @returns {string} response.data.token - JWT token for authentication
 * @returns {Object} response.data.user - User information
 * @returns {number} response.status - HTTP status code
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
    const { teacherId, password } = await req.json();

    // Query the teachers table to find the teacher with the given employee ID
    const { data: teacher, error } = await supabase
      .from('teachers')
      .select('*')
      .eq('teacher_id', teacherId)
      .single();

    // If no teacher found, return unauthorized
    if (error || !teacher) {
      return NextResponse.json(
        { 
          success: false, 
          data: { 
            message: 'Invalid employee ID or ' 
          },
          status: 401 
        },
        { status: 401 }
      );
    }

    // Check if password is missing or doesn't match
    if (!teacher.password || !await bcrypt.compare(password, teacher.password)) {
      return NextResponse.json(
        { 
          success: false, 
          data: { 
            message: 'Invalid  password' 
          },
          status: 401 
        },
        { status: 401 }
      );
    }

    // Generate JWT token with teacher information
    const token = signJWT({
      teacherId: teacher.teacher_id,
      name: teacher.name,
      email: teacher.email,
      role: 'teacher'
    });

    // Return successful response with token and user data
    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          teacherId: teacher.teacher_id,
          name: teacher.name,
          department: teacher.subject || '',
          role: 'teacher',
          mobileNumber: teacher.phone_no || ''
        }
      },
      status: 200
    });
  } catch (error) {
    console.error('Teacher login error:', error);
    
    // Return error response
    return NextResponse.json(
      { 
        success: false, 
        data: { 
          message: 'Internal server error' 
        },
        status: 500 
      },
      { status: 500 }
    );
  }
} 
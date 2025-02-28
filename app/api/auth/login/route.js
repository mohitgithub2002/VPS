/**
 * @fileoverview API endpoint for student authentication
 * @module api/auth/login
 */

/**
 * POST /api/auth/login
 * Authenticates a student using roll number and password
 * 
 * @param {Object} req - Next.js API request
 * @param {Object} req.body - Request body
 * @param {string} req.body.rollNumber - Student's roll number
 * @param {string} req.body.password - Student's password
 * 
 * @returns {Object} Response object
 * @returns {string} response.status - 'success' or 'error'
 * @returns {string} response.message - Response message
 * @returns {Object} [response.data] - Response payload on success
 * @returns {string} response.data.token - JWT token for authentication
 * @returns {Object} response.data.user - User information
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
    const { rollNumber, password } = await req.json();

    const { data: student, error } = await supabase
      .from('students')
      .select('*')
      .eq('roll_no', rollNumber)
      .single();

    if (error || !student || !await bcrypt.compare(password, student.password)) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid roll number or password' },
        { status: 401 }
      );
    }

    const token = signJWT({
      studentId: student.id,
      rollNumber: student.roll_no,
      name: student.name
    });

    return NextResponse.json({
      status: 'success',
      message: 'Login successful',
      data: {
        token,
        user: {
          id: student.id,
          rollNumber: student.roll_no,
          name: student.name,
          class: student.class,
          section: student.section,
          role: student.role
        }
      }
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

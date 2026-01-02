/**
 * @path /api/admin/students/[studentId]/updatepassword
 * @fileoverview API endpoint to update student password
 * 
 * Request Body:
 * {
 *   password: string (required) - New password for the student
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     id: string,
 *     message: string
 *   },
 *   timestamp: string
 * }
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';
import bcrypt from 'bcryptjs';

/**
 * PUT handler to update student password
 * @param {Request} req - The HTTP request object
 * @param {Object} params - Route parameters containing studentId
 * @returns {Promise<NextResponse>} JSON response with update result
 */
export async function PUT(req, { params }) {
    // Authenticate the incoming request
    const auth = await authenticateAdmin(req);
    
    if (!auth.authenticated) {
        return unauthorized();
    }

    try {
        // Get student ID from params
        const { studentId } = await params;
        
        if (!studentId) {
            return NextResponse.json({ 
                success: false, 
                message: "Student ID is required" 
            }, { status: 400 });
        }

        // Parse request body
        const body = await req.json();
        
        // Validate required fields
        if (!body.password) {
            return NextResponse.json({ 
                success: false, 
                message: "Password is required" 
            }, { status: 400 });
        }

        // Validate password length (minimum 6 characters)
        if (body.password.length < 6) {
            return NextResponse.json({ 
                success: false, 
                message: "Password must be at least 6 characters long" 
            }, { status: 400 });
        }

        // Check if student exists and get auth_id
        const { data: existingStudent, error: checkError } = await supabase
            .from('students')
            .select('student_id, auth_id')
            .eq('student_id', studentId)
            .single();
        
        if (checkError || !existingStudent) {
            return NextResponse.json({ 
                success: false, 
                message: `Student with ID ${studentId} not found`,
                status: 404
            }, { status: 404 });
        }

        // Check if student has an associated auth_id
        if (!existingStudent.auth_id) {
            return NextResponse.json({ 
                success: false, 
                message: "Student does not have an associated authentication record" 
            }, { status: 400 });
        }

        // Hash the new password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(body.password, saltRounds);

        // Update password in auth_data table
        const { error: updateError } = await supabase
            .from('auth_data')
            .update({
                password: hashedPassword
            })
            .eq('auth_id', existingStudent.auth_id);

        if (updateError) {
            throw updateError;
        }

        // Return success response
        return NextResponse.json({
            success: true,
            data: {
                id: studentId,
                message: 'Student password updated successfully'
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Student Password Update API error:', error);
        
        // Return a generic error response
        return NextResponse.json(
            { 
                success: false, 
                message: 'Failed to update student password',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}


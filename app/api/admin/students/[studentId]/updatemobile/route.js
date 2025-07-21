/**
 * @path /api/admin/students/[studentId]/updatemobile
 * @fileoverview API endpoint to update student mobile number
 * 
 * Request Body:
 * {
 *   mobile: string (required) - New mobile number of the student
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     id: string,
 *     mobile: string,
 *     message: string
 *   },
 *   timestamp: string
 * }
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

/**
 * PUT handler to update student mobile number
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
        if (!body.mobile) {
            return NextResponse.json({ 
                success: false, 
                message: "Mobile number is required" 
            }, { status: 400 });
        }

        // Validate mobile number format (10 digits)
        const mobileRegex = /^\d{10}$/;
        if (!mobileRegex.test(body.mobile)) {
            return NextResponse.json({ 
                success: false, 
                message: "Mobile number must be 10 digits" 
            }, { status: 400 });
        }

        // Check if student exists and get current mobile and auth_id
        const { data: existingStudent, error: checkError } = await supabase
            .from('students')
            .select('student_id, mobile, auth_id')
            .eq('student_id', studentId)
            .single();
        
        if (checkError || !existingStudent) {
            return NextResponse.json({ 
                success: false, 
                message: `Student with ID ${studentId} not found`,
                status: 404
            }, { status: 404 });
        }

        // Check if new mobile number is already in use
        const { data: existingMobile, error: mobileCheckError } = await supabase
            .from('auth_data')
            .select('auth_id')
            .eq('mobile', body.mobile)
            .single();
        
        if (mobileCheckError && mobileCheckError.code !== 'PGRST116') {
            throw mobileCheckError;
        }

        // If mobile exists, use that auth_id, otherwise update the existing auth_id's mobile
        if (existingMobile) {
            // Update student record with new auth_id
            const { error: updateError } = await supabase
                .from('students')
                .update({
                    auth_id: existingMobile.auth_id,
                    mobile: body.mobile
                })
                .eq('student_id', studentId);

            if (updateError) {
                throw updateError;
            }
        } else {
            // Create a new auth_id with the new mobile number
            const { data: newAuthData, error: createAuthError } = await supabase
                .from('auth_data')
                .insert({
                    mobile: body.mobile
                })
                .select('auth_id')
                .single();

            if (createAuthError) {
                throw createAuthError;
            }

            // Update student record with new auth_id and mobile
            const { error: updateStudentError } = await supabase
                .from('students')
                .update({
                    auth_id: newAuthData.auth_id,
                    mobile: body.mobile
                })
                .eq('student_id', studentId);

            if (updateStudentError) {
                throw updateStudentError;
            }
        }

        // Return success response
        return NextResponse.json({
            success: true,
            data: {
                id: studentId,
                mobile: body.mobile,
                message: 'Student mobile number updated successfully'
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Student Mobile Update API error:', error);
        
        // Return a generic error response
        return NextResponse.json(
            { 
                success: false, 
                message: 'Failed to update student mobile number',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}

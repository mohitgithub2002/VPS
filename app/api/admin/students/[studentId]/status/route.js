/**
 * @path /api/admin/students/[studentId]/status
 * @fileoverview API endpoint to update student status
 * 
 * Request Body:
 * {
 *   status: string (required) - New status of the student
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     id: string,
 *     status: string,
 *     message: string
 *   },
 *   timestamp: string
 * }
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

/**
 * PUT handler to update student status
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
        if (!body.status) {
            return NextResponse.json({ 
                success: false, 
                message: "Status is required" 
            }, { status: 400 });
        }

        // Validate status value
        const validStatuses = ['Active', 'Paused', 'Leave'];
        if (!validStatuses.includes(body.status)) {
            return NextResponse.json({ 
                success: false, 
                message: "Invalid status. Must be one of: Active, Inactive, Graduated, Transferred, Dropped" 
            }, { status: 400 });
        }

        // Check if student exists
        const { data: existingStudent, error: checkError } = await supabase
            .from('students')
            .select('student_id, status')
            .eq('student_id', studentId)
            .single();
        
        if (checkError || !existingStudent) {
            return NextResponse.json({ 
                success: false, 
                message: `Student with ID ${studentId} not found`,
                status: 404
            }, { status: 404 });
        }

        // Update student status
        const { error: updateError } = await supabase
            .from('students')
            .update({ status: body.status })
            .eq('student_id', studentId);
        
        if (updateError) {
            throw updateError;
        }

        // Return success response
        return NextResponse.json({
            success: true,
            data: {
                id: studentId,
                status: body.status,
                message: 'Student status updated successfully'
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Student Status Update API error:', error);
        
        // Return a generic error response
        return NextResponse.json(
            { 
                success: false, 
                message: 'Failed to update student status',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}

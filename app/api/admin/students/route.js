/**
 * @path /api/admin/students
 * @fileoverview API routes for managing student data in the school management system
 * Handles CRUD operations for student records using Supabase as the database
 */

import { supabase } from "@/utils/supabaseClient";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authenticateAdmin, unauthorized } from '@/lib/auth';

/**
 * POST endpoint to create a new student
 * @param {Request} req - The HTTP request object containing student data
 * @returns {Promise<NextResponse>} JSON response with created student data or error
 */
export async function POST(req) {
    // Authenticate the incoming request
    const auth = await authenticateAdmin(req);
    
    if (!auth.authenticated) {
        return unauthorized();
    }

    try {
        const data = await req.json();

        // Validate required fields
        if (!data.name || !data.email || !data.mobile || !data.dob || !data.address || !data.class || !data.section) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Hash the password using bcrypt
        const hashedPassword = await bcrypt.hash(data.password, 10);

        // Call register_student RPC function with parameters in the correct order
        const { data: student, error } = await supabase
            .rpc('register_student', {
                p_mobile: data.mobile,
                p_password: hashedPassword,
                p_name: data.name,
                p_father_name: data.fatherName,
                p_mother_name: data.motherName,
                p_gender: data.gender,
                p_date_of_birth: data.dob,
                p_email: data.email,
                p_address: data.address,
                p_class: data.class,
                p_section: data.section,
                p_medium: data.medium,
                p_admission_date: data.addmissionDate
            });

        if (error) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json(
            { message: 'Student registered successfully', student },
            { status: 201 }
        );

    } catch (error) {
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

/**
 * Retrieves all students from the database
 * @param {string} sessionId - Optional session ID to filter students
 * @param {number} page - Page number for pagination
 * @param {number} limit - Number of items per page
 * @returns {Promise<Object>} Supabase query result containing all students
 */
async function getAllStudents(sessionId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    let query = supabase
        .from('students')
        .select(`
            student_id,
            name,
            father_name,
            mother_name,
            gender,
            date_of_birth,
            email,
            mobile,
            address,
            status,
            medium,
            created_at,
            student_enrollment!inner(
                enrollment_id,
                roll_no,
                admission_date,
                session_id,
                sessions!inner(
                    session_id,
                    session_name,
                    start_date,
                    end_date
                ),
                classrooms!inner(
                    classroom_id,
                    class,
                    section
                )
            )
        `, { count: 'exact' });

    if (sessionId) {
        query = query.eq('student_enrollment.session_id', sessionId);
    }

    return query.range(offset, offset + limit - 1);
}

/**
 * Retrieves students filtered by class
 * @param {string} className - The class name to filter students
 * @param {string} sessionId - The session ID to filter students
 * @param {number} page - Page number for pagination
 * @param {number} limit - Number of items per page
 * @returns {Promise<Object>} Supabase query result containing filtered students
 */
async function getStudentsByClass(className, sessionId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    let query = supabase
        .from('students')
        .select(`
            student_id,
            name,
            father_name,
            mother_name,
            gender,
            date_of_birth,
            email,
            mobile,
            address,
            status,
            medium,
            created_at,
            student_enrollment!inner(
                enrollment_id,
                roll_no,
                admission_date,
                session_id,
                sessions!inner(
                    session_id,
                    session_name,
                    start_date,
                    end_date
                ),
                classrooms!inner(
                    classroom_id,
                    class,
                    section
                )
            )
        `, { count: 'exact' })
        .eq('student_enrollment.classrooms.class', className);

    if (sessionId) {
        query = query.eq('student_enrollment.session_id', sessionId);
    }

    return query.range(offset, offset + limit - 1);
}

/**
 * Retrieves students filtered by class and section
 * @param {string} className - The class name to filter students
 * @param {string} section - The section to filter students
 * @param {string} sessionId - The session ID to filter students
 * @param {number} page - Page number for pagination
 * @param {number} limit - Number of items per page
 * @returns {Promise<Object>} Supabase query result containing filtered students
 */
async function getStudentsByClassAndSection(className, section, sessionId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    let query = supabase
        .from('students')
        .select(`
            student_id,
            name,
            father_name,
            mother_name,
            gender,
            date_of_birth,
            email,
            mobile,
            address,
            status,
            medium,
            created_at,
            student_enrollment!inner(
                enrollment_id,
                roll_no,
                admission_date,
                session_id,
                sessions!inner(
                    session_id,
                    session_name,
                    start_date,
                    end_date
                ),
                classrooms!inner(
                    classroom_id,
                    class,
                    section
                )
            )
        `, { count: 'exact' })
        .eq('student_enrollment.classrooms.class', className)
        .eq('student_enrollment.classrooms.section', section);

    if (sessionId) {
        query = query.eq('student_enrollment.session_id', sessionId);
    }

    return query.range(offset, offset + limit - 1);
}

/**
 * Retrieves a single student by class and roll number
 * @param {string} className - The class name to filter student
 * @param {string} rollNo - The roll number of the student
 * @param {string} sessionId - The session ID to filter student
 * @returns {Promise<Object>} Supabase query result containing single student data
 */
async function getStudentByClassAndRollNo(className, rollNo, sessionId) {
    let query = supabase
        .from('students')
        .select(`
            student_id,
            name,
            father_name,
            mother_name,
            gender,
            date_of_birth,
            email,
            mobile,
            address,
            status,
            medium,
            created_at,
            student_enrollment!inner(
                enrollment_id,
                roll_no,
                admission_date,
                session_id,
                sessions!inner(
                    session_id,
                    session_name,
                    start_date,
                    end_date
                ),
                classrooms!inner(
                    classroom_id,
                    class,
                    section
                )
            )
        `, { count: 'exact' })
        .eq('student_enrollment.classrooms.class', className)
        .eq('student_enrollment.roll_no', rollNo);

    if (sessionId) {
        query = query.eq('student_enrollment.session_id', sessionId);
    }

    return query.single();
}

/**
 * Retrieves a single student by roll number
 * @param {string} rollNo - The roll number of the student
 * @returns {Promise<Object>} Supabase query result containing single student data
 */
async function getStudentByRollNo(rollNo) {
    return await supabase
        .from('students')
        .select(`
            student_id,
            name,
            father_name,
            mother_name,
            gender,
            date_of_birth,
            email,
            mobile,
            address,
            status,
            medium,
            created_at,
            student_enrollment!inner(
                enrollment_id,
                roll_no,
                admission_date,
                session_id,
                sessions!inner(
                    session_id,
                    session_name,
                    start_date,
                    end_date
                ),
                classrooms!inner(
                    classroom_id,
                    class,
                    section
                )
            )
        `, { count: 'exact' })
        .eq('student_enrollment.roll_no', rollNo)
        .single();
}

/**
 * GET endpoint to retrieve student data with optional filters
 * Supports following query parameters:
 * - class: Filter students by class
 * - section: Filter students by section (requires class parameter)
 * - rollNo: Get specific student by roll number
 * - sessionId: Filter students by academic session ID
 * - page: Page number for pagination
 * - limit: Number of items per page
 * 
 * @param {Request} req - The HTTP request object containing query parameters
 * @returns {Promise<NextResponse>} JSON response with filtered student data or error
 */
export async function GET(req) {
    // Authenticate the incoming request
    const auth = await authenticateAdmin(req);
    
    if (!auth.authenticated) {
        return unauthorized();
    }

    try {
        // Extract query parameters from URL
        const { searchParams } = new URL(req.url);
        const className = searchParams.get('class') || searchParams.get('className');
        const section = searchParams.get('section');
        const rollNo = searchParams.get('rollNo');
        const sessionId = searchParams.get('sessionId');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');

        let result;

        // Determine which query to execute based on provided parameters
        if (rollNo) {
            if (className) {
                result = await getStudentByClassAndRollNo(className, rollNo, sessionId);
            } else {
                result = await getStudentByRollNo(rollNo);
            }
            
            // Handle the case when no student is found
            if (result.error && result.error.code === 'PGRST116') {
                return NextResponse.json(
                    { error: 'Student not found' },
                    { status: 404 }
                );
            }
        } else if (className && section) {
            result = await getStudentsByClassAndSection(className, section, sessionId, page, limit);
        } else if (className) {
            result = await getStudentsByClass(className, sessionId, page, limit);
        } else {
            result = await getAllStudents(sessionId, page, limit);
        }

        const { data, error, count } = result;

        // Handle database query errors
        if (error) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        // Transform the data to match the required response format
        const transformedData = Array.isArray(data) 
            ? data.map(student => {
                const enrollment = student.student_enrollment?.[0] || {};
                const classroom = enrollment.classrooms || {};
                const session = enrollment.sessions || {};
                
                return {
                    id: student.student_id,
                    name: student.name,
                    class: classroom.class || '',
                    section: classroom.section || '',
                    rollNo: enrollment.roll_no || '',
                    gender: student.gender,
                    fatherName: student.father_name,
                    motherName: student.mother_name,
                    dob: student.date_of_birth,
                    address: student.address,
                    mobile: student.mobile,
                    email: student.email,
                    status: student.status,
                    admissionDate: enrollment.admission_date,
                    medium: student.medium
                };
            })
            : [{
                id: data.student_id,
                name: data.name,
                class: data.student_enrollment[0].classrooms.class,
                section: data.student_enrollment[0].classrooms.section,
                rollNo: data.student_enrollment[0].roll_no,
                gender: data.gender,
                fatherName: data.father_name,
                motherName: data.mother_name,
                dob: data.date_of_birth,
                address: data.address,
                mobile: data.mobile,
                email: data.email,
                status: data.status,
                admissionDate: data.student_enrollment[0].admission_date,
                medium: data.medium
            }];

        // Return successful response with student data
        return NextResponse.json({
            success: true,
            data: {
                students: transformedData,
                pagination: count ? {
                    total: count,
                    pages: Math.ceil(count / limit),
                    page,
                    limit,
                    hasNext: page < Math.ceil(count / limit),
                    hasPrev: page > 1
                } : null,
                filters: {
                    class: className,
                    section: section,
                    sessionId: sessionId
                }
            },
            timestamp: new Date().toISOString()
        }, { status: 200 });

    } catch (error) {
        // Handle unexpected errors
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
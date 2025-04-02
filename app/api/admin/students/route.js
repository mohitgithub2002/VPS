/**
 * @path /api/admin/students
 * @fileoverview API routes for managing student data in the school management system
 * Handles CRUD operations for student records using Supabase as the database
 */

import { supabase } from "@/utils/supabaseClient";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

/**
 * POST endpoint to create a new student
 * @param {Request} req - The HTTP request object containing student data
 * @returns {Promise<NextResponse>} JSON response with created student data or error
 */
export async function POST(req) {
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
 * @returns {Promise<Object>} Supabase query result containing all students
 */
async function getAllStudents() {
    return await supabase.from('students').select('*');
}

/**
 * Retrieves students filtered by class
 * @param {string} className - The class name to filter students
 * @returns {Promise<Object>} Supabase query result containing filtered students
 */
async function getStudentsByClass(className) {
    return await supabase
        .from('students')
        .select('*')
        .eq('class', className);
}

/**
 * Retrieves students filtered by class and section
 * @param {string} className - The class name to filter students
 * @param {string} section - The section to filter students
 * @returns {Promise<Object>} Supabase query result containing filtered students
 */
async function getStudentsByClassAndSection(className, section) {
    return await supabase
        .from('students')
        .select('*')
        .eq('class', className)
        .eq('section', section);
}

/**
 * Retrieves a single student by class and roll number
 * @param {string} className - The class name to filter student
 * @param {string} rollNo - The roll number of the student
 * @returns {Promise<Object>} Supabase query result containing single student data
 */
async function getStudentByClassAndRollNo(className, rollNo) {
    return await supabase
        .from('students')
        .select('*')
        .eq('class', className)
        .eq('roll_no', rollNo)
        .single();
}

/**
 * GET endpoint to retrieve student data with optional filters
 * Supports following query parameters:
 * - class: Filter students by class
 * - section: Filter students by section (requires class parameter)
 * - rollNo: Get specific student by roll number (requires class parameter)
 * 
 * @param {Request} req - The HTTP request object containing query parameters
 * @returns {Promise<NextResponse>} JSON response with filtered student data or error
 */
export async function GET(req) {
    try {
        // Extract query parameters from URL
        const { searchParams } = new URL(req.url);
        const className = searchParams.get('class');
        const section = searchParams.get('section');
        const rollNo = searchParams.get('rollNo');

        let result;

        // Determine which query to execute based on provided parameters
        if (className && rollNo) {
            result = await getStudentByClassAndRollNo(className, rollNo);
        } else if (className && section) {
            result = await getStudentsByClassAndSection(className, section);
        } else if (className) {
            result = await getStudentsByClass(className);
        } else {
            result = await getAllStudents();
        }

        const { data, error } = result;

        // Handle database query errors
        if (error) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        // Return successful response with student data
        return NextResponse.json(
            { students: data },
            { status: 200 }
        );

    } catch (error) {
        // Handle unexpected errors
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
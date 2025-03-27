/**
 * Teacher's Student List API Route
 * 
 * This API endpoint retrieves a list of all students in a particular class.
 * It includes student details, enrollment information, and class details.
 * 
 * Authentication: Required (Teacher)
 * Method: GET
 * Query Parameters:
 *   - classroomId: ID of the classroom to fetch students for
 *   - page: Page number for pagination (default: 1)
 *   - limit: Number of students per page (default: 20)
 * 
 * Response:
 *   - 200: JSON with student list and pagination info
 *   - 401: Unauthorized
 *   - 500: Server error
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

export async function GET(req) {
  // Authenticate teacher
  const auth = await authenticateUser(req);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  // Verify the user is a teacher
  if (auth.user.role !== 'teacher') {
    return NextResponse.json(
      { success: false, message: 'Access denied. User is not a teacher.' },
      { status: 403 }
    );
  }

  try {
    // Get query parameters
    const { searchParams } = new URL(req.url);
    const classroomId = searchParams.get('classroomId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Validate classroomId
    if (!classroomId) {
      return NextResponse.json(
        { success: false, message: 'Classroom ID is required' },
        { status: 400 }
      );
    }

    // Calculate pagination range
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Fetch students with pagination
    const { data: students, count, error } = await supabase
      .from('student_enrollment')
      .select(`
        enrollment_id,
        roll_no,
        students!inner (
          student_id,
          name
        ),
        classrooms!inner (
          classroom_id,
          class,
          section,
          medium
        )
      `, { count: 'exact' })
      .eq('classroom_id', classroomId)
      .order('roll_no', { ascending: true })
      .range(from, to);

    if (error) throw error;

    // Format the response data
    const formattedStudents = students.map(enrollment => {
      const student = enrollment.students;
      const classroom = enrollment.classrooms;

      return {
        enrollmentId: enrollment.enrollment_id,
        rollNo: enrollment.roll_no,
        studentId: student.student_id,
        name: student.name,
        classId: classroom.classroom_id,
        class: classroom.class,
        section: classroom.section,
        medium: classroom.medium
      };
    });

    // Return formatted response with pagination
    return NextResponse.json({
      success: true,
      data: {
        students: formattedStudents,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(count / limit),
          totalStudents: count,
          studentsPerPage: limit
        }
      }
    });

  } catch (error) {
    console.error('Teacher student list API error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch student list' },
      { status: 500 }
    );
  }
}

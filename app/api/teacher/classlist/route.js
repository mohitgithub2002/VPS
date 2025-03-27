/**
 * Teacher's Class List API Route
 * 
 * This API endpoint retrieves a list of all classes assigned to the authenticated teacher.
 * It includes class details, student counts, and section information.
 * 
 * Authentication: Required (Teacher)
 * Method: GET
 * Query Parameters:
 *   - status: Filter by status (active/inactive) (optional)
 * 
 * Response:
 *   - 200: JSON with class list
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

  const teacherId = auth.user.teacherId;
  
  try {
    // Get status filter from query parameters
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    // Build base query for teacher's classes
    let query = supabase
      .from('teacher_class')
      .select(`
        teacher_class_id,
        class_id,
        teacher_id,
        is_temporary,
        valid_upto,
        schedule,
        classrooms!inner (
          classroom_id,
          class,
          section,
          medium,
          total_student
        )
      `)
      .eq('teacher_id', teacherId);

    // Apply status filter if provided
    if (status === 'active') {
      query = query.or(`valid_upto.is.null,valid_upto.gte.${new Date().toISOString().split('T')[0]}`);
    } else if (status === 'inactive') {
      query = query.lt('valid_upto', new Date().toISOString().split('T')[0]);
    }

    // Execute query
    const { data: classes, error } = await query;

    if (error) throw error;

    // Calculate total students
    const totalStudents = classes.reduce((sum, classData) => {
      return sum + (classData.classrooms.total_student || 0);
    }, 0);

    // Format the response data
    const formattedClasses = classes.map(classData => {
      const classroom = classData.classrooms;

      return {
        id: classData.teacher_class_id,
        classId: classroom.classroom_id,
        name: `${classroom.class} ${classroom.section}`,
        class: classroom.class,
        section: classroom.section,
        medium: classroom.medium,
        totalStudents: classroom.total_student || 0,
        schedule: classData.schedule,
        isTemporary: classData.is_temporary,
        validUpto: classData.valid_upto,
        status: classData.valid_upto && new Date(classData.valid_upto) < new Date() ? 'inactive' : 'active'
      };
    });

    // Return formatted response with totals
    return NextResponse.json({
      success: true,
      data: {
        classes: formattedClasses,
        totalClasses: formattedClasses.length,
        totalStudents: totalStudents
      }
    });

  } catch (error) {
    console.error('Teacher class list API error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch class list' },
      { status: 500 }
    );
  }
}

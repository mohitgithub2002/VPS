/**
 * Teacher Dashboard API Route Handler
 * --------------------------
 * This API endpoint serves as the primary data source for the teacher dashboard,
 * aggregating class data and teacher metrics into a single, efficient response.
 * 
 * Authentication:
 * - Requires valid teacher authentication
 * - Access restricted to authenticated teachers only
 * 
 * Response Format:
 * {
 *   success: boolean,
 *   data: {
 *     classes: Array<ClassInfo>,
 *     metrics: {
 *       classes: number,
 *       students: number,
 *       experience: number,
 *       rating: number
 *     }
 *   },
 *   status: number
 * }
 * 
 * Error Handling:
 * - Returns 401 for unauthorized access
 * - Returns 500 for server-side errors with error logging
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

export async function GET(req) {
  // Authenticate the incoming request
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
    // Execute multiple queries in parallel for optimal performance
    const [classesResponse] = await Promise.all([
      // Fetch classes assigned to the teacher
      supabase
        .from('teacher_class')
        .select(`
          teacher_class_id,
          class_id,
          is_temporary,
          valid_upto,
          schedule,
          sections:class_id (
            id,
            class,
            section,
            medium,
            total_student
          )
        `)
        .eq('teacher_id', teacherId)
        .or(`valid_upto.is.null,valid_upto.gte.${new Date().toISOString().split('T')[0]}`) // Exclude expired assignments
    ]);

    // Validate responses from all parallel queries
    if (classesResponse.error) throw classesResponse.error;
    
    // Calculate total students from the total_student field in sections
    let totalStudents = 0;
    
    // Format class data to match the required response structure
    const formattedClasses = classesResponse.data.map(classData => {
      const sectionData = classData.sections;
      const studentCount = sectionData.total_student || 0;
      
      // Add to total count
      totalStudents += studentCount;
      
      return {
        id: classData.teacher_class_id,
        classId: classData.class_id,
        isTemporary: classData.is_temporary,
        name: `${sectionData.class} ${sectionData.section}`,
        students: studentCount,
        sections: [sectionData.section],
        subject: `${sectionData.medium} Medium`, // Using medium as subject placeholder
        schedule: classData.schedule || 'No schedule available'
      };
    });

    // Prepare metrics data
    const metrics = {
      classes: formattedClasses.length,
      students: totalStudents
    };

    // Construct and return the consolidated dashboard response
    return NextResponse.json({
      success: true,
      data: {
        classes: formattedClasses,
        metrics
      },
      status: 200
    });

  } catch (error) {
    // Log error for debugging and monitoring
    console.error('Teacher Dashboard API error:', error);
    
    // Return a generic error response to avoid exposing internal details
    return NextResponse.json(
      { success: false, message: 'Failed to fetch teacher dashboard data' },
      { status: 500 }
    );
  }
} 
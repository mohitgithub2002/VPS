/**
 * @path /api/admin/promote/preview
 * @fileoverview Preview student promotions before executing them.
 * Returns a dry-run list of which students would be promoted to which class.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';
import { getNextClass, isHighestClass, sortByClassOrder } from '@/utils/classProgression';

/**
 * POST /api/admin/promote/preview
 * 
 * Body: {
 *   fromSessionId: number,
 *   toSessionId: number
 * }
 * 
 * Returns a preview of all students and their suggested promotions.
 * Does NOT modify any data.
 */
export async function POST(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const body = await req.json();
    const { fromSessionId, toSessionId } = body;

    if (!fromSessionId || !toSessionId) {
      return NextResponse.json(
        { success: false, message: 'fromSessionId and toSessionId are required' },
        { status: 400 }
      );
    }

    // Fetch all enrollments from the source session with student and classroom info
    const { data: enrollments, error: enrollError } = await supabase
      .from('student_enrollment')
      .select(`
        enrollment_id,
        student_id,
        classroom_id,
        students!inner(
          student_id,
          name,
          status,
          medium
        ),
        classrooms!inner(
          classroom_id,
          class,
          section,
          medium
        )
      `)
      .eq('session_id', fromSessionId);

    if (enrollError) {
      console.error('Failed to fetch enrollments:', enrollError);
      return NextResponse.json(
        { success: false, message: 'Failed to fetch enrollments' },
        { status: 500 }
      );
    }

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({
        success: true,
        data: { students: [], summary: { total: 0 } }
      });
    }

    // Fetch classrooms available in the target session
    const { data: targetClassrooms, error: targetError } = await supabase
      .from('classrooms')
      .select('classroom_id, class, section, medium')
      .eq('session_id', toSessionId);

    if (targetError) {
      console.error('Failed to fetch target classrooms:', targetError);
      return NextResponse.json(
        { success: false, message: 'Failed to fetch target session classrooms' },
        { status: 500 }
      );
    }

    // Fetch fee summary for warnings about pending fees
    const enrollmentIds = enrollments.map(e => e.enrollment_id);
    const { data: feeSummaries } = await supabase
      .from('fee_summary')
      .select('enrollment_id, due')
      .in('enrollment_id', enrollmentIds);

    const feeMap = {};
    (feeSummaries || []).forEach(fs => {
      feeMap[fs.enrollment_id] = Number(fs.due) || 0;
    });

    // Check which students already have enrollments in the target session
    const studentIds = enrollments.map(e => e.student_id);
    const { data: existingTargetEnrollments } = await supabase
      .from('student_enrollment')
      .select('student_id')
      .eq('session_id', toSessionId)
      .in('student_id', studentIds);

    const alreadyPromotedSet = new Set(
      (existingTargetEnrollments || []).map(e => e.student_id)
    );

    // Build preview for each student
    const students = enrollments
      .filter(enr => enr.students.status === 'Active') // Only active students
      .map(enr => {
        const currentClass = enr.classrooms.class;
        const currentSection = enr.classrooms.section;
        const medium = enr.classrooms.medium;
        const nextClass = getNextClass(currentClass);
        const isPassing = isHighestClass(currentClass);
        const alreadyPromoted = alreadyPromotedSet.has(enr.student_id);

        // Suggest status
        let suggestedStatus = 'promoted';
        if (isPassing) suggestedStatus = 'passed_out';

        // Find target classroom (same section, same medium, next class)
        let targetClassroom = null;
        if (nextClass) {
          targetClassroom = (targetClassrooms || []).find(
            tc => tc.class === nextClass &&
              tc.section === currentSection &&
              tc.medium === medium
          );
          // Fallback: same class, any section with same medium
          if (!targetClassroom) {
            targetClassroom = (targetClassrooms || []).find(
              tc => tc.class === nextClass && tc.medium === medium
            );
          }
        }

        const pendingFees = feeMap[enr.enrollment_id] || 0;

        return {
          studentId: enr.student_id,
          name: enr.students.name,
          medium: enr.students.medium,
          currentClass,
          currentSection,
          currentClassroomId: enr.classroom_id,
          currentEnrollmentId: enr.enrollment_id,
          suggestedStatus,
          nextClass: nextClass || null,
          targetClassroomId: targetClassroom?.classroom_id || null,
          targetClass: targetClassroom?.class || nextClass || null,
          targetSection: targetClassroom?.section || null,
          pendingFees,
          hasPendingFees: pendingFees > 0,
          alreadyPromoted,
          warnings: [
            ...(pendingFees > 0 ? [`Pending fees: ₹${pendingFees}`] : []),
            ...(alreadyPromoted ? ['Already has enrollment in target session'] : []),
            ...(!targetClassroom && nextClass ? [`No classroom "${nextClass} ${currentSection} ${medium}" found in target session`] : [])
          ]
        };
      });

    // Sort by class order
    const sorted = sortByClassOrder(students, 'currentClass');

    // Summary
    const summary = {
      total: sorted.length,
      toPromote: sorted.filter(s => s.suggestedStatus === 'promoted' && !s.alreadyPromoted).length,
      toPassOut: sorted.filter(s => s.suggestedStatus === 'passed_out').length,
      alreadyPromoted: sorted.filter(s => s.alreadyPromoted).length,
      withPendingFees: sorted.filter(s => s.hasPendingFees).length,
      withoutTargetClassroom: sorted.filter(s => !s.targetClassroomId && s.suggestedStatus === 'promoted').length
    };

    return NextResponse.json({
      success: true,
      data: { students: sorted, summary }
    });
  } catch (error) {
    console.error('Promotion preview error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to generate promotion preview' },
      { status: 500 }
    );
  }
}

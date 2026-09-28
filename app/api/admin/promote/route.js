/**
 * @path /api/admin/promote
 * @fileoverview Execute student promotions from one session to another.
 * Supports batch and selective promotion.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

/**
 * POST /api/admin/promote
 * 
 * Body: {
 *   fromSessionId: number,
 *   toSessionId: number,
 *   promotions: [
 *     {
 *       studentId: number,
 *       fromClassroomId: number,
 *       toClassroomId: number,     // null for passed_out/transferred
 *       status: "promoted" | "detained" | "passed_out" | "transferred"
 *     }
 *   ]
 * }
 * 
 * For each promotion entry:
 * - promoted:    Creates new enrollment in toClassroomId (next class)
 * - detained:    Creates new enrollment in toClassroomId (same class in new session)
 * - passed_out:  Updates student.status to 'Passed Out', no new enrollment
 * - transferred: Updates student.status to 'Transferred', no new enrollment
 */
export async function POST(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const body = await req.json();
    const { fromSessionId, toSessionId, promotions } = body;

    // Validate inputs
    if (!fromSessionId || !toSessionId || !Array.isArray(promotions) || promotions.length === 0) {
      return NextResponse.json(
        { success: false, message: 'fromSessionId, toSessionId, and promotions array are required' },
        { status: 400 }
      );
    }

    if (fromSessionId === toSessionId) {
      return NextResponse.json(
        { success: false, message: 'fromSessionId and toSessionId must be different' },
        { status: 400 }
      );
    }

    // Validate both sessions exist
    const { data: sessions, error: sessionError } = await supabase
      .from('sessions')
      .select('session_id, session_name')
      .in('session_id', [fromSessionId, toSessionId]);

    if (sessionError || !sessions || sessions.length !== 2) {
      return NextResponse.json(
        { success: false, message: 'One or both sessions not found' },
        { status: 404 }
      );
    }

    // Validate all promotions have required fields
    const validStatuses = ['promoted', 'detained', 'passed_out', 'transferred'];
    for (const p of promotions) {
      if (!p.studentId || !p.fromClassroomId || !p.status) {
        return NextResponse.json(
          { success: false, message: 'Each promotion must have studentId, fromClassroomId, and status' },
          { status: 400 }
        );
      }
      if (!validStatuses.includes(p.status)) {
        return NextResponse.json(
          { success: false, message: `Invalid status "${p.status}". Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }
      if ((p.status === 'promoted' || p.status === 'detained') && !p.toClassroomId) {
        return NextResponse.json(
          { success: false, message: `toClassroomId is required for status "${p.status}" (studentId: ${p.studentId})` },
          { status: 400 }
        );
      }
    }

    // Fetch existing enrollments from the source session for all students
    const studentIds = promotions.map(p => p.studentId);
    const { data: existingEnrollments, error: enrollError } = await supabase
      .from('student_enrollment')
      .select('enrollment_id, student_id, classroom_id')
      .eq('session_id', fromSessionId)
      .in('student_id', studentIds);

    if (enrollError) {
      console.error('Failed to fetch existing enrollments:', enrollError);
      return NextResponse.json(
        { success: false, message: 'Failed to validate source enrollments' },
        { status: 500 }
      );
    }

    // Map: studentId → enrollment from source session
    const enrollmentMap = {};
    (existingEnrollments || []).forEach(e => {
      enrollmentMap[e.student_id] = e;
    });

    // Check which students already have enrollments in the target session
    const { data: alreadyPromoted } = await supabase
      .from('student_enrollment')
      .select('student_id')
      .eq('session_id', toSessionId)
      .in('student_id', studentIds);

    const alreadyPromotedSet = new Set((alreadyPromoted || []).map(e => e.student_id));

    // Process promotions
    const results = {
      promoted: [],
      detained: [],
      passed_out: [],
      transferred: [],
      skipped: [],
      errors: []
    };

    for (const p of promotions) {
      try {
        const sourceEnrollment = enrollmentMap[p.studentId];
        if (!sourceEnrollment) {
          results.errors.push({
            studentId: p.studentId,
            error: 'No enrollment found in source session'
          });
          continue;
        }

        if (alreadyPromotedSet.has(p.studentId)) {
          results.skipped.push({
            studentId: p.studentId,
            reason: 'Already has enrollment in target session'
          });
          continue;
        }

        if (p.status === 'promoted' || p.status === 'detained') {
          // Create new enrollment in target session
          const { data: newEnrollment, error: insertError } = await supabase
            .from('student_enrollment')
            .insert({
              student_id: p.studentId,
              session_id: toSessionId,
              classroom_id: p.toClassroomId,
              admission_date: new Date().toISOString().split('T')[0]
            })
            .select('enrollment_id')
            .single();

          if (insertError) {
            results.errors.push({
              studentId: p.studentId,
              error: insertError.message
            });
            continue;
          }

          // Create fee_summary row for the new enrollment (zeroed out)
          const { error: feeError } = await supabase
            .from('fee_summary')
            .insert({
              enrollment_id: newEnrollment.enrollment_id,
              student_id: p.studentId,
              school_fees: 0,
              bus_fees: 0,
              other_fees: 0,
              discount: 0,
              paid_fees: 0
            });

          if (feeError) {
            console.error(`Fee summary creation failed for student ${p.studentId}:`, feeError);
            // Non-fatal — continue
          }

          // Update total_student count on the target classroom (+1)
          // await supabase.rpc('increment_total_student', { cid: p.toClassroomId }).catch(() => {
          // If RPC doesn't exist, do manual update
          await supabase
            .from('classrooms')
            .select('total_student')
            .eq('classroom_id', p.toClassroomId)
            .single()
            .then(({ data: cls }) => {
              if (cls) {
                supabase
                  .from('classrooms')
                  .update({ total_student: (cls.total_student || 0) + 1 })
                  .eq('classroom_id', p.toClassroomId);
              }
            });
          // });

          // Record in promotion_history
          await supabase.from('promotion_history').insert({
            student_id: p.studentId,
            from_enrollment_id: sourceEnrollment.enrollment_id,
            to_enrollment_id: newEnrollment.enrollment_id,
            from_session_id: fromSessionId,
            to_session_id: toSessionId,
            from_classroom_id: p.fromClassroomId,
            to_classroom_id: p.toClassroomId,
            promoted_by: auth.admin?.id || null,
            status: p.status,
            remarks: p.remarks || null
          });

          results[p.status].push({
            studentId: p.studentId,
            newEnrollmentId: newEnrollment.enrollment_id,
            toClassroomId: p.toClassroomId
          });
        } else if (p.status === 'passed_out') {
          // Mark student as Passed Out
          const { error: statusError } = await supabase
            .from('students')
            .update({ status: 'Passed Out' })
            .eq('student_id', p.studentId);

          if (statusError) {
            results.errors.push({
              studentId: p.studentId,
              error: statusError.message
            });
            continue;
          }

          // Record in promotion_history
          await supabase.from('promotion_history').insert({
            student_id: p.studentId,
            from_enrollment_id: sourceEnrollment.enrollment_id,
            to_enrollment_id: null,
            from_session_id: fromSessionId,
            to_session_id: toSessionId,
            from_classroom_id: p.fromClassroomId,
            to_classroom_id: null,
            promoted_by: auth.admin?.id || null,
            status: 'passed_out',
            remarks: p.remarks || 'Completed Class 10'
          });

          results.passed_out.push({ studentId: p.studentId });
        } else if (p.status === 'transferred') {
          // Mark student as Transferred
          const { error: statusError } = await supabase
            .from('students')
            .update({ status: 'Left' })
            .eq('student_id', p.studentId);

          if (statusError) {
            results.errors.push({
              studentId: p.studentId,
              error: statusError.message
            });
            continue;
          }

          // Record in promotion_history
          await supabase.from('promotion_history').insert({
            student_id: p.studentId,
            from_enrollment_id: sourceEnrollment.enrollment_id,
            to_enrollment_id: null,
            from_session_id: fromSessionId,
            to_session_id: toSessionId,
            from_classroom_id: p.fromClassroomId,
            to_classroom_id: null,
            promoted_by: auth.admin?.id || null,
            status: 'transferred',
            remarks: p.remarks || null
          });

          results.transferred.push({ studentId: p.studentId });
        }
      } catch (innerError) {
        console.error(`Error processing student ${p.studentId}:`, innerError);
        results.errors.push({
          studentId: p.studentId,
          error: innerError.message || 'Unexpected error'
        });
      }
    }

    // Build summary
    const summary = {
      total: promotions.length,
      promoted: results.promoted.length,
      detained: results.detained.length,
      passed_out: results.passed_out.length,
      transferred: results.transferred.length,
      skipped: results.skipped.length,
      errors: results.errors.length
    };

    return NextResponse.json({
      success: true,
      message: `Promotion completed: ${summary.promoted} promoted, ${summary.detained} detained, ${summary.passed_out} passed out, ${summary.transferred} transferred, ${summary.skipped} skipped, ${summary.errors} errors`,
      data: { results, summary }
    });
  } catch (error) {
    console.error('Promotion execution error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to execute promotions' },
      { status: 500 }
    );
  }
}

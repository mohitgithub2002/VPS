/**
 * @path /api/admin/sessions/clone-structure
 * @fileoverview Clone classroom structure, teacher assignments, and fee structure
 * from one session to another.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

/**
 * POST /api/admin/sessions/clone-structure
 * 
 * Body: {
 *   fromSessionId: number,
 *   toSessionId: number,
 *   includeTeacherAssignments: boolean (default true),
 *   includeFeeStructure: boolean (default true)
 * }
 * 
 * Clones classrooms (and optionally teacher assignments + fee structure)
 * from one session to another.
 * 
 * Returns mapping: { classroomMapping: { oldId: newId, ... } }
 */
export async function POST(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const body = await req.json();
    const {
      fromSessionId,
      toSessionId,
      includeTeacherAssignments = true,
      includeFeeStructure = true
    } = body;

    if (!fromSessionId || !toSessionId) {
      return NextResponse.json(
        { success: false, message: 'fromSessionId and toSessionId are required' },
        { status: 400 }
      );
    }

    if (fromSessionId === toSessionId) {
      return NextResponse.json(
        { success: false, message: 'fromSessionId and toSessionId must be different' },
        { status: 400 }
      );
    }

    // Verify both sessions exist
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

    // Check if toSession already has classrooms (prevent duplicate cloning)
    const { count: existingCount, error: existCheckError } = await supabase
      .from('classrooms')
      .select('classroom_id', { count: 'exact', head: true })
      .eq('session_id', toSessionId);

    if (existCheckError) {
      console.error('Failed to check existing classrooms:', existCheckError);
    }

    if (existingCount && existingCount > 0) {
      return NextResponse.json(
        { success: false, message: 'Target session already has classrooms. Clone aborted to prevent duplicates.' },
        { status: 409 }
      );
    }

    // Step 1: Fetch all classrooms from the source session
    const { data: sourceClassrooms, error: fetchError } = await supabase
      .from('classrooms')
      .select('classroom_id, class, section, medium')
      .eq('session_id', fromSessionId);

    if (fetchError) {
      console.error('Failed to fetch source classrooms:', fetchError);
      return NextResponse.json(
        { success: false, message: 'Failed to fetch source classrooms' },
        { status: 500 }
      );
    }

    if (!sourceClassrooms || sourceClassrooms.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No classrooms found in the source session' },
        { status: 404 }
      );
    }

    // Step 2: Create classrooms in the target session
    const newClassroomRows = sourceClassrooms.map(cls => ({
      session_id: toSessionId,
      class: cls.class,
      section: cls.section,
      medium: cls.medium,
      total_student: 0  // Reset student count for new session
    }));

    const { data: createdClassrooms, error: createError } = await supabase
      .from('classrooms')
      .insert(newClassroomRows)
      .select('classroom_id, class, section, medium');

    if (createError) {
      console.error('Failed to create classrooms:', createError);
      return NextResponse.json(
        { success: false, message: 'Failed to create classrooms in target session: ' + createError.message },
        { status: 500 }
      );
    }

    // Build mapping: old classroom_id → new classroom_id
    // Match by (class, section, medium)
    const classroomMapping = {};
    sourceClassrooms.forEach(oldCls => {
      const match = createdClassrooms.find(
        newCls =>
          newCls.class === oldCls.class &&
          newCls.section === oldCls.section &&
          newCls.medium === oldCls.medium
      );
      if (match) {
        classroomMapping[oldCls.classroom_id] = match.classroom_id;
      }
    });

    let teacherAssignmentsCloned = 0;
    let feeStructuresCloned = 0;

    // Step 3: Clone teacher assignments (if requested)
    if (includeTeacherAssignments) {
      // Fetch existing teacher-class assignments for source classrooms
      const sourceClassroomIds = sourceClassrooms.map(c => c.classroom_id);

      const { data: teacherAssignments, error: taError } = await supabase
        .from('teacher_class')
        .select('teacher_id, class_id, is_temporary, valid_upto, schedule')
        .in('class_id', sourceClassroomIds);

      if (!taError && teacherAssignments && teacherAssignments.length > 0) {
        const newAssignments = teacherAssignments
          .filter(ta => classroomMapping[ta.class_id]) // Only clone if mapping exists
          .map(ta => ({
            teacher_id: ta.teacher_id,
            class_id: classroomMapping[ta.class_id],
            is_temporary: ta.is_temporary,
            valid_upto: null, // Reset valid_upto for new session
            schedule: ta.schedule
          }));

        if (newAssignments.length > 0) {
          const { error: insertTaError } = await supabase
            .from('teacher_class')
            .insert(newAssignments);

          if (insertTaError) {
            console.error('Failed to clone teacher assignments:', insertTaError);
            // Non-fatal — continue
          } else {
            teacherAssignmentsCloned = newAssignments.length;
          }
        }
      }
    }

    // Step 4: Clone fee structure (if requested)
    if (includeFeeStructure) {
      const { data: sourceFeeStructures, error: fsError } = await supabase
        .from('fee_structure')
        .select('session_id, classroom_id, category_id, amount')
        .eq('session_id', fromSessionId);

      if (!fsError && sourceFeeStructures && sourceFeeStructures.length > 0) {
        const newFeeStructures = sourceFeeStructures
          .filter(fs => classroomMapping[fs.classroom_id])
          .map(fs => ({
            session_id: toSessionId,
            classroom_id: classroomMapping[fs.classroom_id],
            category_id: fs.category_id,
            amount: fs.amount
          }));

        if (newFeeStructures.length > 0) {
          const { error: insertFsError } = await supabase
            .from('fee_structure')
            .insert(newFeeStructures);

          if (insertFsError) {
            console.error('Failed to clone fee structures:', insertFsError);
            // Non-fatal — continue
          } else {
            feeStructuresCloned = newFeeStructures.length;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Structure cloned successfully',
      data: {
        classroomsCloned: createdClassrooms.length,
        teacherAssignmentsCloned,
        feeStructuresCloned,
        classroomMapping
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Clone structure error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to clone session structure' },
      { status: 500 }
    );
  }
}

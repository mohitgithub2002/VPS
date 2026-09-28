import { NextResponse } from "next/server";
import { supabase } from "@/utils/supabaseClient";
import { z } from "zod";
import { authenticateAdmin, unauthorized } from '@/lib/auth';
import { resolveSessionId } from '@/utils/sessionHelper';

// Validation schemas
const classAssignmentSchema = z.object({
  // Optional: pass session_id to scope assignments to a specific (e.g. previous) session.
  // Falls back to the active session when omitted.
  session_id: z.number().optional(),
  assignments: z.array(z.object({
    class_id: z.number(),
    is_temporary: z.boolean(),
    valid_upto: z.string().optional(),
    schedule: z.string().optional(),
  })),
});

// Schema for removing class assignments
const removeAssignmentSchema = z.object({
  // Accept either a single class_id or an array of class_ids
  class_id: z.number().optional(),
  class_ids: z.array(z.number()).optional(),
}).refine(data => data.class_id || (data.class_ids && data.class_ids.length), {
  message: 'Either class_id or class_ids must be provided',
  path: ['class_id'],
});

// Helper function to format response
const formatResponse = (data, success = true) => {
  return NextResponse.json({
    success,
    data,
    timestamp: new Date().toISOString(),
  });
};

// Helper function to format error response
const formatError = (code, message, fields) => {
  return NextResponse.json({
    success: false,
    error: {
      code,
      message,
      fields,
    },
    timestamp: new Date().toISOString(),
  }, { status: 400 });
};

// POST /api/admin/teachers/[id]/classes - Assign classes to teacher
// Body: { session_id?: number, assignments: [{ class_id, is_temporary, valid_upto?, schedule? }] }
export async function POST(request, { params }) {
  // Authenticate the incoming request
  const auth = await authenticateAdmin(request);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  try {
    const {id} = await params;
    const teacherId = parseInt(id);
    const body = await request.json();

    // Validate request body
    const validatedData = classAssignmentSchema.parse(body);

    // Resolve the session: use session_id from body if provided, otherwise active session.
    // This supports assigning classes for any session (current or previous).
    const { sessionId, session: resolvedSession } = await resolveSessionId(
      validatedData.session_id ?? null
    );

    if (!sessionId) {
      return formatError(
        'SESSION_NOT_FOUND',
        'No active session found. Provide a valid session_id or ensure an active session exists.'
      );
    }

    // Validate that every class_id in the request belongs to the resolved session.
    // This prevents cross-session assignment mistakes.
    const incomingClassIds = validatedData.assignments.map(a => a.class_id);
    const { data: validClassrooms, error: classroomError } = await supabase
      .from('classrooms')
      .select('classroom_id')
      .eq('session_id', sessionId)
      .in('classroom_id', incomingClassIds);

    if (classroomError) throw classroomError;

    const validClassIds = new Set((validClassrooms || []).map(c => c.classroom_id));
    const invalidIds = incomingClassIds.filter(cid => !validClassIds.has(cid));

    if (invalidIds.length > 0) {
      return formatError(
        'VALIDATION_ERROR',
        `Class IDs [${invalidIds.join(', ')}] do not belong to session "${resolvedSession.session_name}" (session_id: ${sessionId}).`,
        { invalid_class_ids: invalidIds }
      );
    }

    // Create new assignments
    const assignments = validatedData.assignments.map(a => ({
      teacher_id: teacherId,
      class_id: a.class_id,
      is_temporary: a.is_temporary,
      valid_upto: a.valid_upto,
      schedule: a.schedule,
    }));

    const { data: newAssignments, error } = await supabase
      .from('teacher_class')
      .insert(assignments)
      .select();

    if (error) throw error;

    return formatResponse({
      teacher_id: teacherId,
      session_id: sessionId,
      session_name: resolvedSession.session_name,
      message: 'Classes assigned successfully',
      assignments: newAssignments,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return formatError('VALIDATION_ERROR', 'Invalid input data', error.flatten());
    }
    console.error('Teacher class assignment error:', error);
    return formatError('INTERNAL_ERROR', 'Failed to assign classes');
  }
}

// DELETE /api/admin/teachers/[id]/classes - Remove class assignments from teacher
export async function DELETE(request, { params }) {
  // Authenticate the incoming request
  const auth = await authenticateAdmin(request);

  if (!auth.authenticated) {
    return unauthorized();
  }

  try {
    const { id } = await params;
    const teacherId = parseInt(id);
    const body = await request.json();

    // Validate request body
    const validatedData = removeAssignmentSchema.parse(body);
    const classIds = validatedData.class_ids ?? [validatedData.class_id];

    // Delete assignments
    const { data: deletedAssignments, error } = await supabase
      .from('teacher_class')
      .delete()
      .eq('teacher_id', teacherId)
      .in('class_id', classIds)
      .select();

    if (error) throw error;

    if (!deletedAssignments || deletedAssignments.length === 0) {
      return formatError('NOT_FOUND', 'No matching class assignments found');
    }

    return formatResponse({
      teacher_id: teacherId,
      message: 'Class assignments removed successfully',
      removed_assignments: deletedAssignments,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return formatError('VALIDATION_ERROR', 'Invalid input data', error.flatten());
    }
    return formatError('INTERNAL_ERROR', 'Failed to remove class assignments');
  }
} 
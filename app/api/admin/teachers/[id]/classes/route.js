import { NextResponse } from "next/server";
import { supabase } from "@/utils/supabaseClient";
import { z } from "zod";
import { authenticateAdmin, unauthorized } from '@/lib/auth';

// Validation schemas
const classAssignmentSchema = z.object({
  assignments: z.array(z.object({
    class_id: z.number(),
    is_temporary: z.boolean(),
    valid_upto: z.string().optional(),
    schedule: z.string().optional(),
  })),
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
      message: 'Classes assigned successfully',
      assignments: newAssignments,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return formatError('VALIDATION_ERROR', 'Invalid input data', error.flatten());
    }
    return formatError('INTERNAL_ERROR', 'Failed to assign classes');
  }
} 
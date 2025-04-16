import { NextResponse } from "next/server";
import { supabase } from "@/utils/supabaseClient";
import { z } from "zod";
import { authenticateAdmin, unauthorized } from '@/lib/auth';

// Validation schemas
const teacherSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  mobile: z.string().optional(),
  subject: z.string().optional(),
  address: z.string().optional(),
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

// GET /api/admin/teachers/[id] - Get teacher details
export async function GET(request, { params }) {
  // Authenticate the incoming request
  const auth = await authenticateAdmin(request);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  try {
    const teacherId = parseInt(params.id);

    // Get teacher details
    const { data: teacher, error: teacherError } = await supabase
      .from('teachers')
      .select('*')
      .eq('teacher_id', teacherId)
      .single();

    if (teacherError) throw teacherError;

    // Get assigned classes
    const { data: classes, error: classesError } = await supabase
      .from('teacher_class')
      .select(`
        teacher_class_id,
        is_temporary,
        valid_upto,
        schedule,
        class_id,
        classrooms (
          class,
          section,
          medium
        )
      `)
      .eq('teacher_id', teacherId);

    if (classesError) throw classesError;

    return formatResponse({
      ...teacher,
      classes: classes?.map(c => ({
        class_id: c.class_id,
        class: c.classrooms?.class,
        section: c.classrooms?.section,
        medium: c.classrooms?.medium,
        is_temporary: c.is_temporary,
        valid_upto: c.valid_upto,
        schedule: c.schedule,
      })),
    });
  } catch (error) {
    return formatError('NOT_FOUND', 'Teacher not found');
  }
}

// PUT /api/admin/teachers/[id] - Update teacher
export async function PUT(request, { params }) {
  // Authenticate the incoming request
  const auth = await authenticateAdmin(request);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  try {
    const teacherId = await parseInt(params.id);
    const body = await request.json();

    // Validate request body
    const validatedData = teacherSchema.parse(body);

    // Update teacher
    const { error } = await supabase
      .from('teachers')
      .update(validatedData)
      .eq('teacher_id', teacherId);

    if (error) throw error;

    return formatResponse({
      id: teacherId,
      message: 'Teacher updated successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return formatError('VALIDATION_ERROR', 'Invalid input data', error.flatten());
    }
    return formatError('NOT_FOUND', 'Teacher not found');
  }
}

// DELETE /api/admin/teachers/[id] - Delete teacher
export async function DELETE(request, { params }) {
  // Authenticate the incoming request
  const auth = await authenticateAdmin(request);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  try {
    const teacherId = parseInt(params.id);

    // Check if teacher has any active class assignments
    const { data: assignments } = await supabase
      .from('teacher_class')
      .select('teacher_class_id')
      .eq('teacher_id', teacherId)
      .limit(1);

    if (assignments && assignments.length > 0) {
      return formatError('CONFLICT', 'Cannot delete teacher with active class assignments');
    }

    // Delete teacher
    const { error } = await supabase
      .from('teachers')
      .delete()
      .eq('teacher_id', teacherId);

    if (error) throw error;

    return formatResponse({
      id: teacherId,
      message: 'Teacher deleted successfully',
    });
  } catch (error) {
    return formatError('NOT_FOUND', 'Teacher not found');
  }
} 
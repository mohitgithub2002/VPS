import { NextRequest, NextResponse } from 'next/server';
import { supabase } from "@/utils/supabaseClient";
import { z } from 'zod';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

// Validation schemas
const teacherSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  mobile: z.string().optional(),
  subject: z.string().optional(),
  address: z.string().optional(),
});

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

// GET /api/admin/teachers - List teachers
export async function GET(request) {
  // Authenticate the incoming request
  const auth = await authenticateAdmin(request);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('teachers')
      .select('*', { count: 'exact' });

    // Apply search filter
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: teachers, count, error } = await query;

    if (error) throw error;

    return formatResponse({
      teachers,
      pagination: {
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
        page,
        limit,
        hasNext: offset + limit < (count || 0),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    return formatError('INTERNAL_ERROR', 'Failed to fetch teachers');
  }
}

// POST /api/admin/teachers - Create new teacher
export async function POST(request) {
  // Authenticate the incoming request
  const auth = await authenticateAdmin(request);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  try {
    const body = await request.json();

    // Validate request body
    const validatedData = teacherSchema.parse(body);

    // Check if email already exists
    const { data: existingTeacher } = await supabase
      .from('teachers')
      .select('email')
      .eq('email', validatedData.email)
      .single();

    if (existingTeacher) {
      return formatError('VALIDATION_ERROR', 'Email is already in use', {
        email: 'This email is already registered',
      });
    }

    // Create new teacher
    const { data: teacher, error } = await supabase
      .from('teachers')
      .insert([validatedData])
      .select()
      .single();

    if (error) throw error;

    return formatResponse({
      id: teacher.teacher_id,
      message: 'Teacher created successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return formatError('VALIDATION_ERROR', 'Invalid input data', error.flatten());
    }
    return formatError('INTERNAL_ERROR', 'Failed to create teacher');
  }
}


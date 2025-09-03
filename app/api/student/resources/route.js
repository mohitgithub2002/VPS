import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

// Helper function to get classroom ID from student enrollment
async function getClassroomIdFromEnrollment(enrollmentId) {
  const { data, error } = await supabase
    .from('student_enrollment')
    .select('classroom_id')
    .eq('enrollment_id', enrollmentId)
    .maybeSingle();

  if (error) throw error;
  return data?.classroom_id || null;
}

// GET - List available resources for student
export async function GET(req) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();
  // Verify the user is a student
  if (!auth.user.studentId) {
    return NextResponse.json(
      { success: false, message: 'Access denied. User is not a student.' },
      { status: 403 }
    );
  }

  const enrollmentId = auth.user.enrollmentId;
  if (!enrollmentId) {
    return NextResponse.json(
      { success: false, message: 'Enrollment not found' },
      { status: 404 }
    );
  }

  try {
    const classroomId = await getClassroomIdFromEnrollment(enrollmentId);
    if (!classroomId) {
      return NextResponse.json(
        { success: false, message: 'Classroom not found' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get('subject_id');
    const resourceType = searchParams.get('resource_type');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

    const applyFilters = (q) => {
      q = q
        .eq('classroom_id', classroomId)
        .eq('is_current', true)
        .eq('is_public', true);
      if (subjectId) q = q.eq('subject_id', subjectId);
      if (resourceType) q = q.eq('resource_type', resourceType);
      if (search) q = q.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
      return q;
    };

    // Count query (separate builder; no joins needed)
    const countQuery = applyFilters(
      supabase.from('study_resources').select('*', { count: 'exact', head: true })
    );
    const { count, error: countError } = await countQuery;
    if (countError) throw countError;

    // Get paginated results
    const dataQuery = applyFilters(
      supabase
        .from('study_resources')
        .select(`
          resource_id,
          classroom_id,
          subject_id,
          teacher_id,
          title,
          description,
          resource_type,
          category,
          file_name,
          file_size,
          mime_type,
          version,
          created_at,
          updated_at,
          teacher:teachers!inner(name),
          subject!inner(name)
        `)
        .order('updated_at', { ascending: false })
    );
    const { data: resources, error } = await dataQuery.range(offset, offset + limit - 1);

    if (error) throw error;
    console.log('Raw resources data (count:', resources?.length, '):', JSON.stringify(resources, null, 2));
    
    // Minimal debug for first row
    if (resources.length > 0) {
      const first = resources[0];
      console.log('First row nested -> teacher:', first.teacher, 'subject:', first.subject);
    }

    // Format the response
    const formattedResources = resources.map(resource => ({
      resourceId: resource.resource_id,
      title: resource.title,
      description: resource.description,
      resourceType: resource.resource_type,
      category: resource.category,
      fileName: resource.file_name,
      fileSize: resource.file_size,
      mimeType: resource.mime_type,
      version: resource.version,
      createdAt: resource.created_at,
      updatedAt: resource.updated_at,
      teacher: {
        name: resource.teacher?.name || 'Unknown Teacher'
      },
      subject: {
        id: resource.subject_id,
        name: resource.subject?.name || 'Unknown Subject'
      }
    }));

    return NextResponse.json({
      success: true,
      data: {
        resources: formattedResources,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (err) {
    console.error('Student resources GET error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch resources' },
      { status: 500 }
    );
  }
}

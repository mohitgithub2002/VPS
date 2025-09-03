import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

// GET - List all resources (Admin)
export async function GET(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const classroomId = searchParams.get('classroom_id');
    const subjectId = searchParams.get('subject_id');
    const teacherId = searchParams.get('teacher_id');
    const resourceType = searchParams.get('resource_type');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

    const applyFilters = (q) => {
      q = q.eq('is_current', true);
      if (classroomId) q = q.eq('classroom_id', classroomId);
      if (subjectId) q = q.eq('subject_id', subjectId);
      if (teacherId) q = q.eq('teacher_id', teacherId);
      if (resourceType) q = q.eq('resource_type', resourceType);
      if (search) q = q.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
      return q;
    };

    // Count query (no joins)
    const countQuery = applyFilters(
      supabase.from('study_resources').select('*', { count: 'exact', head: true })
    );
    const { count, error: countError } = await countQuery;
    if (countError) throw countError;

    // Data query (with joins)
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
          is_current,
          is_public,
          download_count,
          created_at,
          updated_at,
          classrooms!inner(class, section, medium),
          teachers!inner(name, email),
          subject!inner(name)
        `)
        .order('created_at', { ascending: false })
    );

    // Get paginated results
    const { data: resources, error } = await dataQuery.range(offset, offset + limit - 1);

    if (error) throw error;

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
      updatedAt: resource.updated_at,
      classroom: {
        id: resource.classroom_id,
        class: resource.classrooms.class,
        section: resource.classrooms.section,
        medium: resource.classrooms.medium
      },
      teacher: {
        id: resource.teacher_id,
        name: resource.teachers.name
      },
      subject: {
        id: resource.subject_id,
        name: resource.subject.name
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
    console.error('Admin resources GET error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch resources' },
      { status: 500 }
    );
  }
}


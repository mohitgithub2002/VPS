import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';
import { s3 } from '@/utils/s3Client';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createAndSend } from '@/lib/notifications/index.js';

const S3_BUCKET = process.env.STUDY_RESOURCES_S3_BUCKET || process.env.AWS_S3_BUCKET || 'vps-docs';
const SIGN_TTL = 60 * 5; // 5 minutes

// Helper function to get file extension from mime type
function getExtensionFromMime(mimeType) {
  const mimeToExt = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/avi': 'avi',
    'text/plain': 'txt'
  };
  return mimeToExt[mimeType] || 'bin';
}

// Helper function to build storage key
function buildStorageKey({ sessionYear, classroomId, subjectId, resourceType, version, fileName }) {
  return `study-resources/${sessionYear}/${classroomId}/${subjectId}/${resourceType}/v${version}/${fileName}`;
}

// Helper function to get next version
async function getNextVersion({ classroomId, subjectId, title }) {
  const { data, error } = await supabase
    .from('study_resources')
    .select('version')
    .eq('classroom_id', classroomId)
    .eq('subject_id', subjectId)
    .eq('title', title)
    .order('version', { ascending: false })
    .limit(1);

  if (error) throw error;
  const maxVersion = data?.[0]?.version || 0;
  return maxVersion + 1;
}

// POST - Upload new resource
export async function POST(req) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();

  // Verify the user is a teacher
  if (auth.user.role !== 'teacher') {
    return NextResponse.json(
      { success: false, message: 'Access denied. User is not a teacher.' },
      { status: 403 }
    );
  }

  try {
    const form = await req.formData();
    const classroomId = parseInt(form.get('classroom_id'), 10);
    const subjectId = parseInt(form.get('subject_id'), 10);
    const title = String(form.get('title') || '').trim();
    const description = form.get('description') ? String(form.get('description')).trim() : null;
    const resourceType = String(form.get('resource_type') || '').toLowerCase();
    const category = form.get('category') ? String(form.get('category')).trim() : null;
    const sessionYear = parseInt(form.get('session_year'), 10);
    const file = form.get('file');

    // Validation
    if (!classroomId || !subjectId || !title || !resourceType || !sessionYear || !file) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!['notes', 'assignment', 'reference', 'video', 'presentation', 'other'].includes(resourceType)) {
      return NextResponse.json(
        { success: false, message: 'Invalid resource type' },
        { status: 400 }
      );
    }

    // Verify classroom exists and teacher has access
    const { data: classroom, error: classroomErr } = await supabase
      .from('classrooms')
      .select('classroom_id')
      .eq('classroom_id', classroomId)
      .maybeSingle();

    if (classroomErr) throw classroomErr;
    if (!classroom) {
      return NextResponse.json(
        { success: false, message: 'Classroom not found' },
        { status: 404 }
      );
    }

    // Verify subject exists
    const { data: subject, error: subjectErr } = await supabase
      .from('subject')
      .select('subject_id')
      .eq('subject_id', subjectId)
      .maybeSingle();

    if (subjectErr) throw subjectErr;
    if (!subject) {
      return NextResponse.json(
        { success: false, message: 'Subject not found' },
        { status: 404 }
      );
    }

    // Get version number
    const version = await getNextVersion({ classroomId, subjectId, title });

    // Process file
    const contentType = file.type || 'application/octet-stream';
    const extension = getExtensionFromMime(contentType);
    const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_v${version}.${extension}`;
    const storageKey = buildStorageKey({ sessionYear, classroomId, subjectId, resourceType, version, fileName });

    // Upload to S3
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: storageKey,
      Body: buffer,
      ContentType: contentType,
      Metadata: {
        'original-name': file.name,
        'uploaded-by': auth.user.teacherId.toString()
      }
    }));

    // Insert into database
    const insertRow = {
      classroom_id: classroomId,
      subject_id: subjectId,
      teacher_id: auth.user.teacherId,
      title,
      description,
      resource_type: resourceType,
      category,
      storage_bucket: S3_BUCKET,
      storage_key: storageKey,
      file_name: file.name,
      file_size: file.size,
      mime_type: contentType,
      version,
      is_current: true
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('study_resources')
      .insert([insertRow])
      .select('*')
      .single();

    if (insertErr) throw insertErr;

    // Mark previous versions as not current
    await supabase
      .from('study_resources')
      .update({ is_current: false })
      .eq('classroom_id', classroomId)
      .eq('subject_id', subjectId)
      .eq('title', title)
      .neq('resource_id', inserted.resource_id);

    // Send notifications to all students in the classroom
    const notifyStudents = async () => {
      try {
        const { data: students, error: studentsErr } = await supabase
          .from('student_enrollment')
          .select('student_id')
          .eq('classroom_id', classroomId);

        if (studentsErr) throw studentsErr;

        if (students && students.length > 0) {
          const recipients = students.map(s => ({ role: 'student', id: s.student_id }));
          
          await createAndSend({
            type: 'study_resource',
            title: `New ${resourceType} uploaded in ${subject.name}`,
            body: `${title} - ${description || 'No description provided'}`,
            recipients,
            data: {
              screen: 'Resources',
              params: { 
                resourceId: inserted.resource_id,
                classroomId,
                subjectId,
                resourceType
              }
            }
          });
        }
      } catch (err) {
        console.error('Failed to send notifications:', err);
      }
    };

    // Run notification in background
    // notifyStudents();

    return NextResponse.json({
      success: true,
      data: inserted,
      message: 'Resource uploaded successfully'
    });

  } catch (err) {
    console.error('Teacher resources POST error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to upload resource' },
      { status: 500 }
    );
  }
}

// GET - List teacher's resources
export async function GET(req) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();

  // Verify the user is a teacher
  if (auth.user.role !== 'teacher') {
    return NextResponse.json(
      { success: false, message: 'Access denied. User is not a teacher.' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const classroomId = searchParams.get('classroom_id');
    const subjectId = searchParams.get('subject_id');
    const resourceType = searchParams.get('resource_type');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

    const applyFilters = (q) => {
      q = q
        .eq('teacher_id', auth.user.teacherId)
        .eq('is_current', true);
      if (classroomId) q = q.eq('classroom_id', classroomId);
      if (subjectId) q = q.eq('subject_id', subjectId);
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
          title,
          description,
          resource_type,
          category,
          file_name,
          file_size,
          mime_type,
          version,
          is_current,
          created_at,
          updated_at,
          classrooms!inner(class, section, medium),
          subject!inner(name)
        `)
        .order('created_at', { ascending: false })
    );

    // Get paginated results
    const { data: resources, error } = await dataQuery.range(offset, offset + limit - 1);

    if (error) throw error;
    console.log(resources);

    return NextResponse.json({
      success: true,
      data: {
        resources,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (err) {
    console.error('Teacher resources GET error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch resources' },
      { status: 500 }
    );
  }
}

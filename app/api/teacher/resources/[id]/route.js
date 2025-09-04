import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';
import { s3 } from '@/utils/s3Client';
import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const S3_BUCKET = process.env.STUDY_RESOURCES_S3_BUCKET || process.env.AWS_S3_BUCKET || 'vps-docs';

// GET - Fetch a single resource owned by the teacher (with signed URL)
export async function GET(req, { params }) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();

  if (auth.user.role !== 'teacher') {
    return NextResponse.json(
      { success: false, message: 'Access denied. User is not a teacher.' },
      { status: 403 }
    );
  }

  try {
    const resourceId = parseInt(params.id, 10);
    if (!resourceId) {
      return NextResponse.json(
        { success: false, message: 'Invalid resource ID' },
        { status: 400 }
      );
    }

    // Fetch resource and ensure ownership
    const { data: resource, error } = await supabase
      .from('study_resources')
      .select(`
        resource_id,
        classroom_id,
        subject_id,
        teacher_id,
        title,
        file_name,
        file_size,
        mime_type,
        storage_bucket,
        storage_key
      `)
      .eq('resource_id', resourceId)
      .eq('teacher_id', auth.user.teacherId)
      .maybeSingle();

    if (error) throw error;
    if (!resource) {
      return NextResponse.json(
        { success: false, message: 'Resource not found or access denied' },
        { status: 404 }
      );
    }

    // Create signed URL
    const signedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: resource.storage_bucket || S3_BUCKET,
        Key: resource.storage_key
      }),
      { expiresIn: 60 * 5 }
    );

    return NextResponse.json({
      success: true,
      data: {
        resourceId: resource.resource_id,
        classroomId: resource.classroom_id,
        subjectId: resource.subject_id,
        title: resource.title,
        fileName: resource.file_name,
        fileSize: resource.file_size,
        mimeType: resource.mime_type,
        url: signedUrl
      }
    });
  } catch (err) {
    console.error('Teacher resource GET error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch resource' },
      { status: 500 }
    );
  }
}

// PUT - Update resource
export async function PUT(req, { params }) {
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
    const resourceId = parseInt(params.id, 10);
    if (!resourceId) {
      return NextResponse.json(
        { success: false, message: 'Invalid resource ID' },
        { status: 400 }
      );
    }

    // Check if resource exists and belongs to the teacher
    const { data: existingResource, error: fetchError } = await supabase
      .from('study_resources')
      .select('*')
      .eq('resource_id', resourceId)
      .eq('teacher_id', auth.user.teacherId)
      .eq('is_current', true)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingResource) {
      return NextResponse.json(
        { success: false, message: 'Resource not found or access denied' },
        { status: 404 }
      );
    }

    const form = await req.formData();
    const title = form.get('title') ? String(form.get('title')).trim() : existingResource.title;
    const description = form.get('description') ? String(form.get('description')).trim() : existingResource.description;
    const resourceType = form.get('resource_type') ? String(form.get('resource_type')).toLowerCase() : existingResource.resource_type;
    const category = form.get('category') ? String(form.get('category')).trim() : existingResource.category;
    const file = form.get('file');

    // Validate resource type if provided
    if (resourceType && !['notes', 'assignment', 'reference', 'video', 'presentation', 'other'].includes(resourceType)) {
      return NextResponse.json(
        { success: false, message: 'Invalid resource type' },
        { status: 400 }
      );
    }

    let updateData = {
      title,
      description,
      resource_type: resourceType,
      category,
      updated_at: new Date().toISOString()
    };

    // If file is provided, upload new version
    if (file) {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      
      // Get next version
      const { data: versionData, error: versionError } = await supabase
        .from('study_resources')
        .select('version')
        .eq('classroom_id', existingResource.classroom_id)
        .eq('subject_id', existingResource.subject_id)
        .eq('title', title)
        .order('version', { ascending: false })
        .limit(1);

      if (versionError) throw versionError;
      const newVersion = (versionData?.[0]?.version || 0) + 1;

      // Process new file
      const contentType = file.type || 'application/octet-stream';
      const extension = getExtensionFromMime(contentType);
      const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_v${newVersion}.${extension}`;
      const storageKey = buildStorageKey({
        sessionYear: new Date().getFullYear(),
        classroomId: existingResource.classroom_id,
        subjectId: existingResource.subject_id,
        resourceType,
        version: newVersion,
        fileName
      });

      // Upload new file to S3
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

      // Update database with new file info
      updateData = {
        ...updateData,
        storage_key: storageKey,
        file_name: file.name,
        file_size: file.size,
        mime_type: contentType,
        version: newVersion,
        is_current: true
      };

      // Mark previous version as not current
      await supabase
        .from('study_resources')
        .update({ is_current: false })
        .eq('classroom_id', existingResource.classroom_id)
        .eq('subject_id', existingResource.subject_id)
        .eq('title', title)
        .neq('resource_id', resourceId);
    }

    // Update the resource
    const { data: updatedResource, error: updateError } = await supabase
      .from('study_resources')
      .update(updateData)
      .eq('resource_id', resourceId)
      .select('*')
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      data: updatedResource,
      message: 'Resource updated successfully'
    });

  } catch (err) {
    console.error('Teacher resource PUT error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to update resource' },
      { status: 500 }
    );
  }
}

// DELETE - Delete resource
export async function DELETE(req, { params }) {
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
    const resourceId = parseInt(params.id, 10);
    if (!resourceId) {
      return NextResponse.json(
        { success: false, message: 'Invalid resource ID' },
        { status: 400 }
      );
    }

    // Check if resource exists and belongs to the teacher
    const { data: resource, error: fetchError } = await supabase
      .from('study_resources')
      .select('*')
      .eq('resource_id', resourceId)
      .eq('teacher_id', auth.user.teacherId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!resource) {
      return NextResponse.json(
        { success: false, message: 'Resource not found or access denied' },
        { status: 404 }
      );
    }

    // Delete file from S3
    try {
      await s3.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: resource.storage_key
      }));
    } catch (s3Error) {
      console.error('Failed to delete file from S3:', s3Error);
      // Continue with database deletion even if S3 deletion fails
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('study_resources')
      .delete()
      .eq('resource_id', resourceId);

    if (deleteError) throw deleteError;

    return NextResponse.json({
      success: true,
      message: 'Resource deleted successfully'
    });

  } catch (err) {
    console.error('Teacher resource DELETE error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to delete resource' },
      { status: 500 }
    );
  }
}

// Helper functions (same as in route.js)
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

function buildStorageKey({ sessionYear, classroomId, subjectId, resourceType, version, fileName }) {
  return `study-resources/${sessionYear}/${classroomId}/${subjectId}/${resourceType}/v${version}/${fileName}`;
}


import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';
import { s3 } from '@/utils/s3Client';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const S3_BUCKET = process.env.STUDY_RESOURCES_S3_BUCKET || process.env.AWS_S3_BUCKET || 'vps-docs';
const SIGN_TTL = 60 * 5; // 5 minutes

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

// GET - Get resource details and download URL
export async function GET(req, { params }) {
  const { id } = await params;
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
    const resourceId = parseInt(id, 10);
    if (!resourceId) {
      return NextResponse.json(
        { success: false, message: 'Invalid resource ID' },
        { status: 400 }
      );
    }

    const classroomId = await getClassroomIdFromEnrollment(enrollmentId);
    if (!classroomId) {
      return NextResponse.json(
        { success: false, message: 'Classroom not found' },
        { status: 404 }
      );
    }

    // Get resource details
    const { data: resource, error } = await supabase
      .from('study_resources')
      .select(`
        resource_id,
        classroom_id,   
        title,
        file_name,
        file_size,
        mime_type,
        is_current,
        is_public,
        storage_bucket,
        storage_key
      `)
      .eq('resource_id', resourceId)
      .eq('classroom_id', classroomId)
      .eq('is_current', true)
      .eq('is_public', true)
      .maybeSingle();

    if (error) throw error;
    if (!resource) {
      return NextResponse.json(
        { success: false, message: 'Resource not found or access denied' },
        { status: 404 }
      );
    }

    // Generate signed URL for download
    const signedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: resource.storage_bucket || S3_BUCKET,
        Key: resource.storage_key
      }),
      { expiresIn: SIGN_TTL }
    );

    // Format the response
    const formattedResource = {
      resourceId: resource.resource_id,
      title: resource.title,
      fileName: resource.file_name,
      fileSize: resource.file_size,
      mimeType: resource.mime_type,
      downloadUrl: signedUrl,
      
    };

    const headers = new Headers({
      'ETag': `resource-${resourceId}`,
      'Cache-Control': 'private, max-age=60'
    });

    return NextResponse.json({
      success: true,
      data: formattedResource
    }, { headers });

  } catch (err) {
    console.error('Student resource GET error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch resource' },
      { status: 500 }
    );
  }
}

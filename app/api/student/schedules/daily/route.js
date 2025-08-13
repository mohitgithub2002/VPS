import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';
import { s3 } from '@/utils/s3Client';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const S3_BUCKET = process.env.SCHEDULES_S3_BUCKET || process.env.AWS_S3_BUCKET || 'schedules';
const SIGN_TTL = 60 * 5;

async function getClassroomIdFromEnrollment(enrollmentId) {
  const { data, error } = await supabase
    .from('student_enrollment')
    .select('classroom_id')
    .eq('enrollment_id', enrollmentId)
    .maybeSingle();
  if (error) throw error;
  return data?.classroom_id || null;
}

export async function GET(req) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();

  const enrollmentId = auth.user?.enrollmentId;
  if (!enrollmentId) {
    return NextResponse.json({ success: false, message: 'Enrollment not found' }, { status: 404 });
  }

  try {
    const classroom_id = await getClassroomIdFromEnrollment(enrollmentId);
    if (!classroom_id) {
      return NextResponse.json({ success: false, message: 'Classroom not found' }, { status: 404 });
    }

    const { data: row, error } = await supabase
      .from('schedule_files')
      .select('schedule_id, version, title, notes, storage_bucket, storage_key, created_at')
      .eq('classroom_id', classroom_id)
      .eq('type', 'daily')
      .is('exam_id', null)
      .eq('is_current', true)
      .maybeSingle();
    if (error) throw error;
    if (!row) return NextResponse.json({ success: true, data: null });

    const signedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: row.storage_bucket || S3_BUCKET, Key: row.storage_key }),
      { expiresIn: SIGN_TTL }
    );

    const headers = new Headers({
      'ETag': `schedule-${classroom_id}-daily-0-v${row.version}`,
      'Cache-Control': 'private, max-age=60'
    });

    return NextResponse.json({
      success: true,
      data: {
        scheduleId: row.schedule_id,
        version: row.version,
        title: row.title,
        notes: row.notes,
        uploadedAt: row.created_at,
        url: signedUrl
      }
    }, { headers });
  } catch (err) {
    console.error('Daily schedule GET error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch schedule' }, { status: 500 });
  }
}



import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';
import { s3 } from '@/utils/s3Client';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const S3_BUCKET = process.env.SCHEDULES_S3_BUCKET || process.env.AWS_S3_BUCKET || 'vps-docs';
const SIGN_TTL = 5 * 60 * 60; // 5 hours for viewing

export async function GET(req, { params }) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const { scheduleId } = params;
    const schedule_id = parseInt(scheduleId, 10);

    if (!schedule_id || isNaN(schedule_id)) {
      return NextResponse.json({ 
        success: false, 
        message: 'Invalid schedule ID' 
      }, { status: 400 });
    }

    // Fetch schedule details from database
    const { data: schedule, error: fetchError } = await supabase
      .from('schedule_files')
      .select('*')
      .eq('schedule_id', schedule_id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    
    if (!schedule) {
      return NextResponse.json({ 
        success: false, 
        message: 'Schedule not found' 
      }, { status: 404 });
    }

    // Generate signed URL for the file
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: schedule.storage_key,
    });

    const signedUrl = await getSignedUrl(s3, command, { 
      expiresIn: SIGN_TTL 
    });

    // Log the access for audit purposes
    console.log('Schedule document accessed:', {
      schedule_id,
      admin_id: auth.admin?.id,
      file_key: schedule.storage_key,
      timestamp: new Date().toISOString()
    });

    // Return the signed URL and file metadata
    return NextResponse.json({
      success: true,
      data: {
        signed_url: signedUrl,
        expires_in: SIGN_TTL,
      }
    });

  } catch (err) {
    console.error('Admin schedule view error:', err);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to generate view URL' 
    }, { status: 500 });
  }
}

// Optional: Add a HEAD method to check if file exists without generating URL
export async function HEAD(req, { params }) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const { scheduleId } = params;
    const schedule_id = parseInt(scheduleId, 10);

    if (!schedule_id || isNaN(schedule_id)) {
      return NextResponse.json({ 
        success: false, 
        message: 'Invalid schedule ID' 
      }, { status: 400 });
    }

    // Check if schedule exists
    const { data: schedule, error: fetchError } = await supabase
      .from('schedule_files')
      .select('schedule_id, title, type, version, storage_key')
      .eq('schedule_id', schedule_id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    
    if (!schedule) {
      return NextResponse.json({ 
        success: false, 
        message: 'Schedule not found' 
      }, { status: 404 });
    }

    // Return basic file info without generating signed URL
    return NextResponse.json({
      success: true,
      data: {
        schedule_id: schedule.schedule_id,
        title: schedule.title,
        type: schedule.type,
        version: schedule.version,
        exists: true
      }
    });

  } catch (err) {
    console.error('Admin schedule HEAD error:', err);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to check schedule' 
    }, { status: 500 });
  }
}

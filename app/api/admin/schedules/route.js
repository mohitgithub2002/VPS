import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';
import { s3 } from '@/utils/s3Client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const S3_BUCKET = process.env.SCHEDULES_S3_BUCKET || process.env.AWS_S3_BUCKET || 'vps-docs';
const SIGN_TTL = 60 * 5; // seconds

async function getNextVersion({ classroom_id, type, exam_id }) {
  let q = supabase
    .from('schedule_files')
    .select('version')
    .eq('classroom_id', classroom_id)
    .eq('type', type)
    .order('version', { ascending: false })
    .limit(1);

  if (exam_id) q = q.eq('exam_id', exam_id);
  else q = q.is('exam_id', null);

  const { data, error } = await q;
  console.log('VERSION DATA', data);
  console.log('VERSION ERROR', error);
  if (error) throw error;
  const maxV = data?.[0]?.version || 0;
  return maxV + 1;
}

function buildStorageKey({ session_year, classroom_id, type, exam_id_or_na, version, extension }) {
  const base = type === 'exam' ? 'exam-schedule' : 'daily-schedule';
  if (type === 'exam') {
    const examId = exam_id_or_na != null ? String(exam_id_or_na) : 'unknown';
    const ext = extension ? `.${extension}` : '';
    return `${base}/${session_year}/${classroom_id}/${examId}/v${version}${ext}`;
  }
  // daily schedule
  const ext = extension ? `.${extension}` : '';
  return `${base}/${session_year}/${classroom_id}/v${version}${ext}`;
}

function getExtensionFromMime(mime) {
  if (!mime || typeof mime !== 'string') return null;
  const lower = mime.toLowerCase();
  switch (lower) {
    case 'application/pdf':
      return 'pdf';
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    default:
      return null;
  }
}

async function signGetUrl(Key) {
  const cmd = new PutObjectCommand({ Bucket: S3_BUCKET, Key });
  // For GET signed URL we would use GetObjectCommand; here POST response returns metadata + we sign GET separately in student routes
  return getSignedUrl(s3, cmd, { expiresIn: SIGN_TTL });
}

export async function POST(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const form = await req.formData();
    const classroom_id = parseInt(form.get('classroom_id'), 10);
    const type = String(form.get('type') || '').toLowerCase(); // 'daily' | 'exam'
    const session_year = parseInt(form.get('session_year'), 10);
    const exam_id = form.get('exam_id') ? parseInt(form.get('exam_id'), 10) : null; // when type='exam'
    const title = String(form.get('title') || '').trim();
    const notes = form.get('notes') ? String(form.get('notes')) : null;
    const file = form.get('file');

    if (!classroom_id || !['daily', 'exam'].includes(type) || !session_year || !title || !file) {
      return NextResponse.json({ success: false, message: 'Missing or invalid fields' }, { status: 400 });
    }
    if (type === 'exam' && !exam_id) {
      return NextResponse.json({ success: false, message: 'exam_id is required for exam schedules' }, { status: 400 });
    }

    const { data: classroom, error: classroomErr } = await supabase
      .from('classrooms')
      .select('classroom_id')
      .eq('classroom_id', classroom_id)
      .maybeSingle();
    if (classroomErr) throw classroomErr;
    if (!classroom) return NextResponse.json({ success: false, message: 'Classroom not found' }, { status: 404 });

    if (exam_id) {
      const { data: ex, error: exErr } = await supabase
        .from('exam')
        .select('exam_id')
        .eq('exam_id', exam_id)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!ex) return NextResponse.json({ success: false, message: 'Exam not found' }, { status: 404 });
    }

    const version = await getNextVersion({ classroom_id, type, exam_id });
    const contentType = (file && typeof file.type === 'string' && file.type.trim().length > 0)
      ? file.type
      : 'application/octet-stream';
    const extension = getExtensionFromMime(contentType);
    const storage_key = buildStorageKey({ session_year, classroom_id, type, exam_id_or_na: exam_id, version, extension });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: storage_key, Body: buffer, ContentType: contentType }));
    console.log('file type ', contentType);
    const insertRow = {
      classroom_id,
      exam_id,
      type,
      storage_bucket: S3_BUCKET,
      storage_key,
      version,
      is_current: true,
      title,
      notes,
      uploaded_by: auth.admin?.id || null,
    };
    console.log('insertRow', insertRow);
    const { data: inserted, error: insertErr } = await supabase
      .from('schedule_files')
      .insert([insertRow])
      .select('*')
      .single();
    if (insertErr) throw insertErr;

    let updateQ = supabase
      .from('schedule_files')
      .update({ is_current: false })
      .eq('classroom_id', classroom_id)
      .eq('type', type)
      .neq('schedule_id', inserted.schedule_id);
    if (exam_id) updateQ = updateQ.eq('exam_id', exam_id);
    else updateQ = updateQ.is('exam_id', null);
    const { error: flipErr } = await updateQ;
    if (flipErr) throw flipErr;

    const headers = new Headers({
      'ETag': `schedule-${classroom_id}-${type}-${exam_id || 0}-v${version}`,
      'Cache-Control': 'private, max-age=60'
    });

    return NextResponse.json({ success: true, data: inserted }, { headers });
  } catch (err) {
    console.error('Admin schedules POST error:', err);
    return NextResponse.json({ success: false, message: 'Failed to publish schedule' }, { status: 500 });
  }
}

export async function GET(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const classroom_id = searchParams.get('classroom_id') ? parseInt(searchParams.get('classroom_id'), 10) : null;
    const type = searchParams.get('type') ? String(searchParams.get('type')).toLowerCase() : null; // daily|exam
    const exam_id = searchParams.get('exam_id') ? parseInt(searchParams.get('exam_id'), 10) : null;
    const exam_type_id = searchParams.get('exam_type_id') ? parseInt(searchParams.get('exam_type_id'), 10) : null;

    // Build the query with left join to handle both daily and exam schedules
    let q = supabase
      .from('schedule_files')
      .select(`
        schedule_id,
        type,
        title,
        created_at,
        classroom_id,
        is_current,
        exam_id,
        exam:exam_id (
          exam_type_id,
          exam_type:exam_type_id (
            code
          )
        ),
        classroom:classroom_id (
          class,
          section,
          medium
        )
      `)
      .eq('is_current', true)
      .order('created_at', { ascending: false });

    if (classroom_id) q = q.eq('classroom_id', classroom_id);
    if (type) q = q.eq('type', type);
    if (exam_id) q = q.eq('exam_id', exam_id);

    // Apply exam_type_id filter if provided
    if (exam_type_id) {
      q = q.not('exam_id', 'is', null).eq('exam.exam_type_id', exam_type_id);
    }
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Admin schedules GET error:', err);
    return NextResponse.json({ success: false, message: 'Failed to list schedules' }, { status: 500 });
  }
}

export async function PUT(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const form = await req.formData();
    const schedule_id = parseInt(form.get('schedule_id'), 10);
    const title = form.get('title') ? String(form.get('title')).trim() : null;
    const notes = form.get('notes') ? String(form.get('notes')) : null;
    const type = form.get('type') ? String(form.get('type')).toLowerCase() : null; // 'daily' | 'exam'
    const classroom_id = form.get('classroom_id') ? parseInt(form.get('classroom_id'), 10) : null;
    const exam_id = form.get('exam_id') ? parseInt(form.get('exam_id'), 10) : null;
    const session_year = form.get('session_year') ? parseInt(form.get('session_year'), 10) : null;
    const file = form.get('file'); // Optional - only if updating the file

    if (!schedule_id) {
      return NextResponse.json({ success: false, message: 'schedule_id is required' }, { status: 400 });
    }

    // Validate type if provided
    if (type && !['daily', 'exam'].includes(type)) {
      return NextResponse.json({ success: false, message: 'Invalid type. Must be "daily" or "exam"' }, { status: 400 });
    }

    // Validate exam_id requirement for exam type
    if (type === 'exam' && exam_id === null) {
      return NextResponse.json({ success: false, message: 'exam_id is required for exam schedules' }, { status: 400 });
    }

    // Check if schedule exists
    const { data: existingSchedule, error: fetchErr } = await supabase
      .from('schedule_files')
      .select('*')
      .eq('schedule_id', schedule_id)
      .maybeSingle();
    
    if (fetchErr) throw fetchErr;
    if (!existingSchedule) {
      return NextResponse.json({ success: false, message: 'Schedule not found' }, { status: 404 });
    }

    // Validate classroom if changing
    if (classroom_id && classroom_id !== existingSchedule.classroom_id) {
      const { data: classroom, error: classroomErr } = await supabase
        .from('classrooms')
        .select('classroom_id')
        .eq('classroom_id', classroom_id)
        .maybeSingle();
      if (classroomErr) throw classroomErr;
      if (!classroom) return NextResponse.json({ success: false, message: 'Classroom not found' }, { status: 404 });
    }

    // Validate exam if changing
    if (exam_id && exam_id !== existingSchedule.exam_id) {
      const { data: ex, error: exErr } = await supabase
        .from('exam')
        .select('exam_id')
        .eq('exam_id', exam_id)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!ex) return NextResponse.json({ success: false, message: 'Exam not found' }, { status: 404 });
    }

    const updateData = {};
    if (title !== null) updateData.title = title;
    if (notes !== null) updateData.notes = notes;
    if (type !== null) updateData.type = type;
    if (classroom_id !== null) updateData.classroom_id = classroom_id;
    if (exam_id !== null) updateData.exam_id = exam_id;
    if (session_year !== null) updateData.session_year = session_year;

    // If file is provided, handle file update
    if (file) {
      const contentType = (file && typeof file.type === 'string' && file.type.trim().length > 0)
        ? file.type
        : 'application/octet-stream';
      const extension = getExtensionFromMime(contentType);
      
      // Use updated values or existing values for version calculation
      const targetClassroomId = classroom_id !== null ? classroom_id : existingSchedule.classroom_id;
      const targetType = type !== null ? type : existingSchedule.type;
      const targetExamId = exam_id !== null ? exam_id : existingSchedule.exam_id;
      const targetSessionYear = session_year !== null ? session_year : (existingSchedule.session_year || new Date().getFullYear());
      
      // Get new version number based on target values
      const newVersion = await getNextVersion({ 
        classroom_id: targetClassroomId, 
        type: targetType, 
        exam_id: targetExamId 
      });
      
      const storage_key = buildStorageKey({ 
        session_year: targetSessionYear,
        classroom_id: targetClassroomId, 
        type: targetType, 
        exam_id_or_na: targetExamId, 
        version: newVersion, 
        extension 
      });

      // Upload new file to S3
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await s3.send(new PutObjectCommand({ 
        Bucket: S3_BUCKET, 
        Key: storage_key, 
        Body: buffer, 
        ContentType: contentType 
      }));

      // Update database record
      updateData.storage_key = storage_key;
      updateData.version = newVersion;
      updateData.is_current = true;
      updateData.uploaded_by = auth.admin?.id || null;

      // Set other versions to not current (based on target values)
      let updateQ = supabase
        .from('schedule_files')
        .update({ is_current: false })
        .eq('classroom_id', targetClassroomId)
        .eq('type', targetType)
        .neq('schedule_id', schedule_id);
      
      if (targetExamId) {
        updateQ = updateQ.eq('exam_id', targetExamId);
      } else {
        updateQ = updateQ.is('exam_id', null);
      }
      
      const { error: flipErr } = await updateQ;
      if (flipErr) throw flipErr;
    }

    // Update the schedule record
    const { data: updatedSchedule, error: updateErr } = await supabase
      .from('schedule_files')
      .update(updateData)
      .eq('schedule_id', schedule_id)
      .select('*')
      .single();

    if (updateErr) throw updateErr;

    // Use target values for headers
    const targetClassroomId = classroom_id !== null ? classroom_id : existingSchedule.classroom_id;
    const targetType = type !== null ? type : existingSchedule.type;
    const targetExamId = exam_id !== null ? exam_id : existingSchedule.exam_id;
    
    const headers = new Headers({
      'ETag': `schedule-${targetClassroomId}-${targetType}-${targetExamId || 0}-v${updatedSchedule.version}`,
      'Cache-Control': 'private, max-age=60'
    });

    return NextResponse.json({ success: true, data: updatedSchedule }, { headers });
  } catch (err) {
    console.error('Admin schedules PUT error:', err);
    return NextResponse.json({ success: false, message: 'Failed to update schedule' }, { status: 500 });
  }
}

export async function DELETE(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const schedule_id = searchParams.get('schedule_id') ? parseInt(searchParams.get('schedule_id'), 10) : null;

    if (!schedule_id) {
      return NextResponse.json({ success: false, message: 'schedule_id is required' }, { status: 400 });
    }

    // Check if schedule exists
    const { data: existingSchedule, error: fetchErr } = await supabase
      .from('schedule_files')
      .select('*')
      .eq('schedule_id', schedule_id)
      .maybeSingle();
    
    if (fetchErr) throw fetchErr;
    if (!existingSchedule) {
      return NextResponse.json({ success: false, message: 'Schedule not found' }, { status: 404 });
    }

    // Delete the schedule record
    const { error: deleteErr } = await supabase
      .from('schedule_files')
      .delete()
      .eq('schedule_id', schedule_id);

    if (deleteErr) throw deleteErr;

    // Note: S3 file deletion is optional - you might want to keep files for audit purposes
    // If you want to delete the S3 file as well, uncomment the following code:
    /*
    try {
      await s3.send(new DeleteObjectCommand({ 
        Bucket: S3_BUCKET, 
        Key: existingSchedule.storage_key 
      }));
    } catch (s3Err) {
      console.warn('Failed to delete S3 file:', s3Err);
      // Continue with deletion even if S3 deletion fails
    }
    */

    return NextResponse.json({ 
      success: true, 
      message: 'Schedule deleted successfully',
      data: { schedule_id, deleted_at: new Date().toISOString() }
    });
  } catch (err) {
    console.error('Admin schedules DELETE error:', err);
    return NextResponse.json({ success: false, message: 'Failed to delete schedule' }, { status: 500 });
  }
}



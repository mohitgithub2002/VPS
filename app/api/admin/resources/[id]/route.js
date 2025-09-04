import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';
import { s3 } from '@/utils/s3Client';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

const S3_BUCKET = process.env.STUDY_RESOURCES_S3_BUCKET || process.env.AWS_S3_BUCKET || 'vps-docs';

// DELETE - Admin delete resource
export async function DELETE(req, { params }) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const resourceId = parseInt(params.id, 10);
    if (!resourceId) {
      return NextResponse.json(
        { success: false, message: 'Invalid resource ID' },
        { status: 400 }
      );
    }

    // Get resource details
    const { data: resource, error: fetchError } = await supabase
      .from('study_resources')
      .select('*')
      .eq('resource_id', resourceId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!resource) {
      return NextResponse.json(
        { success: false, message: 'Resource not found' },
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
    console.error('Admin resource DELETE error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to delete resource' },
      { status: 500 }
    );
  }
}


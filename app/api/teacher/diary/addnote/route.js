import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

export async function POST(req) {
  // Authenticate teacher (make sure this is implemented in lib/auth.js)
  const auth = await authenticateUser(req);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  const teacherId = auth.user.teacherId;
  
  try {
    const body = await req.json();
    const { 
      enrollmentId, 
      classroomId, 
      subject, 
      content, 
      entryType = 'Personal' 
    } = body;

    // Validate required fields
    if (!subject || !content || !classroomId) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate entry type
    if (!['Personal', 'Broadcast'].includes(entryType)) {
      return NextResponse.json(
        { success: false, message: 'Invalid entry type' },
        { status: 400 }
      );
    }

    // Validate enrollment_id for personal entries
    if (entryType === 'Personal' && !enrollmentId) {
      return NextResponse.json(
        { success: false, message: 'Enrollment ID is required for personal entries' },
        { status: 400 }
      );
    }

    // Create diary entry
    const { data: diaryEntry, error } = await supabase
      .from('diary_entries')
      .insert([
        {
          enrollment_id: enrollmentId,
          classroom_id: classroomId,
          subject,
          content,
          teacher_id: teacherId,
          entry_type: entryType,
          created_at: new Date().toISOString().split('T')[0] // Format as YYYY-MM-DD
        }
      ])
      .select();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'Diary entry added successfully',
      entry: diaryEntry[0]
    });

  } catch (error) {
    console.error('Add diary entry API error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to add diary entry' },
      { status: 500 }
    );
  }
}

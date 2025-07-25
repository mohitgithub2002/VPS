import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';
import { createAndSend } from '@/lib/notifications/index.js';

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

    // --- Fire-and-Forget Notification Dispatch ---
    const dispatchNotifications = async () => {
      try {
        let recipients = [];

        if (entryType === 'Personal') {
          // For personal notes, find the single student's ID
          const { data: student, error: studentErr } = await supabase
            .from('student_enrollment')
            .select('student_id')
            .eq('enrollment_id', enrollmentId)
            .maybeSingle();

          if (studentErr) throw studentErr;

          if (student) {
            recipients.push({ role: 'student', id: student.student_id });
          }
        } else if (entryType === 'Broadcast') {
          // For broadcast notes, find all students in the class
          const { data: students, error: studentsErr } = await supabase
            .from('student_enrollment')
            .select('student_id')
            .eq('classroom_id', classroomId); // Assuming you want all students in the class

          if (studentsErr) throw studentsErr;
          
          recipients = students.map(s => ({ role: 'student', id: s.student_id }));
        }

        if (recipients.length > 0) {
          await createAndSend({
            type: 'diary_note',
            title: `New Diary Note in ${subject}`,
            body: content,
            recipients,
            data: {
              "screen": "Home",
              "params": { "classroomId": classroomId }
            }
          });
          console.log(`Dispatched diary note notification to ${recipients.length} recipient(s).`);
        }
      } catch (err) {
        console.error('Failed to dispatch diary note notification:', err);
      }
    };

    // Run in the background
    dispatchNotifications();

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

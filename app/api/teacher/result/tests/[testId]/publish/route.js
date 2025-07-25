import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';
import { createAndSend } from '@/lib/notifications/index.js';

export async function PUT(req, { params }) {
  const auth = await authenticateUser(req);
  if (!auth.authenticated) return unauthorized();
  if (auth.user.role !== 'teacher') {
    return NextResponse.json({ success: false, message: 'Access denied. User is not a teacher.' }, { status: 403 });
  }
  const teacherId = auth.user.teacherId;

  const { testId } = params;
  if (!testId) return NextResponse.json({ success: false, message: 'Missing testId' }, { status: 400 });

  try {
    // Fetch test info, including its name and the subject's name for notifications
    const { data: test } = await supabase
      .from('daily_test')
      .select('name, classroom_id, is_declared, subject(name)')
      .eq('test_id', testId)
      .maybeSingle();
    if (!test) return NextResponse.json({ success: false, message: 'Test not found' }, { status: 404 });
    if (test.is_declared) {
      return NextResponse.json({ success: true, data: { published: true, publishedAt: null } });
    }

    // Verify teacher assignment
    const { data: tc } = await supabase
      .from('teacher_class')
      .select('teacher_id')
      .eq('teacher_id', teacherId)
      .eq('class_id', test.classroom_id)
      .maybeSingle();
    if (!tc) return NextResponse.json({ success: false, message: 'You are not assigned to this class' }, { status: 403 });

    // Update is_declared
    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('daily_test')
      .update({ is_declared: true, updated_at: now })
      .eq('test_id', testId);
    if (updErr) throw updErr;

    // Prepare dynamic content for the notification
    const subjectName = test.subject?.name || 'your';
    const testName = test.name || 'recent test';

    // --- OPTIMIZATION: Fetch marks and student IDs in a single query ---
    const { data: marksAndStudents, error: marksErr } = await supabase
      .from('daily_test_mark')
      .select('marks_obtained, student_enrollment!inner(student_id)')
      .eq('test_id', testId);

    if (marksErr) throw marksErr;

    const recipients = marksAndStudents
      .map(row => ({
        // The 'student_enrollment' object can be null if the relationship is nullable.
        id: row.student_enrollment?.student_id,
        marks: row.marks_obtained
      }))
      .filter(rec => rec.id); // Filter out any students who couldn't be mapped

    // --- AMAZING THING: Dispatch notifications in the background (Fire-and-Forget) ---
    const dispatchNotifications = async () => {
      // Run all notification sends in parallel for max speed
      const notificationPromises = recipients.map(rec =>
        createAndSend({
          type: 'result',
          title: `${subjectName} test marks released`,
          body: `You scored ${rec.marks} in the ${testName} test.`,
          recipients: [{ role: 'student', id: rec.id }],
          data: { "screen": "Results", "params": { "testId": testId, "exam": "exam" } }
        }).catch(err => {
          // Catch errors for individual sends so one failure doesn't stop the others
          console.error(`Failed to send test mark notification to student ${rec.id}:`, err);
        })
      );

      await Promise.all(notificationPromises);
      console.log(`Finished sending ${recipients.length} test mark notifications in the background for test ${testId}.`);
    };

    // We don't `await` this call. This is the key to a fast API response.
    dispatchNotifications();

    // Immediately return a response to the user.
    return NextResponse.json({ success: true, data: { published: true, publishedAt: now } });
  } catch (err) {
    console.error('Teacher → Result → Publish test error:', err);
    return NextResponse.json({ success: false, message: 'Failed to publish test' }, { status: 500 });
  }
} 
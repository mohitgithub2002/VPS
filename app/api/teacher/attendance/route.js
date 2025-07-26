/**
 * Teacher's Attendance API Route
 * 
 * This API endpoint allows teachers to mark attendance for multiple students in a class.
 * 
 * Authentication: Required (Teacher)
 * Method: POST
 * 
 * Request Body:
 * {
 *   "classroomId": number,
 *   "date": string (YYYY-MM-DD),
 *   "records": [
 *     {
 *       "enrollmentId": number,
 *       "status": "Present" | "Absent" | "Leave",
 *       "remark": string (optional)
 *     }
 *   ]
 * }
 * 
 * Response:
 *   - 200: JSON with attendance records
 *   - 401: Unauthorized
 *   - 400: Invalid input
 *   - 500: Server error
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';
import { createAndSend } from '@/lib/notifications/index.js';

export async function POST(req) {
  // Authenticate teacher
  const auth = await authenticateUser(req);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  // Verify the user is a teacher
  if (auth.user.role !== 'teacher') {
    return NextResponse.json(
      { success: false, message: 'Access denied. User is not a teacher.' },
      { status: 403 }
    );
  }

  try {
    // Get request body
    const body = await req.json();
    const { classroomId, date, records } = body;

    // Validate required fields
    if (!classroomId || !date || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Missing or invalid required fields' },
        { status: 400 }
      );
    }

    // Validate each record
    for (const record of records) {
      if (!record.enrollmentId || !record.status) {
        return NextResponse.json(
          { success: false, message: 'Each record must have enrollmentId and status' },
          { status: 400 }
        );
      }

      // Validate status
      if (!['Present', 'Absent', 'Leave'].includes(record.status)) {
        return NextResponse.json(
          { success: false, message: 'Invalid status. Must be Present, Absent, or Leave' },
          { status: 400 }
        );
      }
    }

    // Prepare attendance records
    const attendanceRecords = records.map(record => ({
      enrollment_id: record.enrollmentId,
      classroom_id: classroomId,
      date,
      status: record.status,
      remark: record.remark || null,
      teacher_id: auth.user.teacherId
    }));

    // Insert attendance records
    const { data: insertedRecords, error } = await supabase
      .from('attendance')
      .insert(attendanceRecords)
      .select(`
        attendance_id,
        enrollment_id,
        classroom_id,
        date,
        status,
        remark,
        teacher_id,
        student_enrollment!inner (
          roll_no,
          students!inner (
            student_id,
            name
          )
        )
      `);

    if (error) throw error;

    // --- Fire-and-Forget Notification Dispatch ---
    const dispatchNotifications = async () => {
      const notificationPromises = insertedRecords.map(record => {
        const studentId = record.student_enrollment?.students?.student_id;
        const studentName = record.student_enrollment?.students?.name;
        if (!studentId) return null; // Skip if student mapping failed

        const status = record.status;
        const formattedDate = new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        let body = `Your attendance for ${formattedDate} has been marked as ${status}.`;

        if (status === 'Absent') {
          body = `${studentName} was marked Absent on ${formattedDate}. Please contact your teacher if this is incorrect.`;
        } else if (status === 'Present') {
          body = `${studentName} was marked Present on ${formattedDate}.`;
        } else if (status === 'Leave') {
          body = `${studentName}'s leave for ${formattedDate} has been approved.`;
        }

        return createAndSend({
          type: 'attendance',
          title: 'Attendance Update',
          body: body,
          recipients: [{ role: 'student', id: studentId }],
          data: {
            "screen": "AttendanceView",
            "params": { "date": date }
          }
        }).catch(err => {
          console.error(`Failed to send attendance notification to student ${studentId}:`, err);
        });
      });

      // Filter out any null promises and wait for all to complete
      await Promise.all(notificationPromises.filter(p => p));
      console.log(`Finished sending ${insertedRecords.length} attendance notifications in the background for date ${date}.`);
    };

    // Don't await, run this in the background for a fast API response
    dispatchNotifications();

    // Format the response data
    const formattedRecords = insertedRecords.map(record => ({
      attendanceId: record.attendance_id,
      enrollmentId: record.enrollment_id,
      classroomId: record.classroom_id,
      date: record.date,
      status: record.status,
      remark: record.remark,
      teacherId: record.teacher_id,
      student: {
        rollNo: record.student_enrollment.roll_no,
        id: record.student_enrollment.students.student_id,
        name: record.student_enrollment.students.name
      }
    }));

    // Return formatted response
    return NextResponse.json({
      success: true,
      message: 'Attendance marked successfully',
      data: formattedRecords
    });

  } catch (error) {
    console.error('Teacher attendance API error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to mark attendance' },
      { status: 500 }
    );
  }
}

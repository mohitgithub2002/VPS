// attendance api route for students

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateUser, unauthorized } from '@/lib/auth';

// Helper: month names
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Helper: validate and parse year & month query params
function parseYearMonth(searchParams) {
  const yearParam = searchParams.get('year');
  const monthParam = searchParams.get('month');

  // Basic validation
  const year = parseInt(yearParam, 10);
  const month = parseInt(monthParam, 10);

  if (isNaN(year) || year < 2000 || year > new Date().getFullYear() + 1) {
    return { error: 'Year must be a valid 4-digit number' };
  }
  if (isNaN(month) || month < 1 || month > 12) {
    return { error: 'Month must be between 1 and 12' };
  }
  return { year, month };
}

export async function GET(req) {
  // 1. Authenticate user
  const auth = await authenticateUser(req);
  if (!auth.authenticated) {
    return unauthorized();
  }

  try {
    // 2. Extract query params
    const { searchParams } = new URL(req.url);

    // Validate year & month
    const parsed = parseYearMonth(searchParams);
    if (parsed.error) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid query parameters',
          error: 'INVALID_PARAMETERS',
          details: {
            year: parsed.error.includes('Year') ? parsed.error : undefined,
            month: parsed.error.includes('Month') ? parsed.error : undefined,
          },
        },
        { status: 400 }
      );
    }
    const { year, month } = parsed;

    // Student Id either from query or token
    const studentId = searchParams.get('studentId') || auth.user.studentId;
    if (!studentId) {
      return NextResponse.json(
        { success: false, message: 'Student not found', error: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Build date range
    const monthPadded = month.toString().padStart(2, '0');
    const startDate = `${year}-${monthPadded}-01`;
    const endDay = new Date(year, month, 0).getDate(); // JS month arg is 1-based for this formula
    const endDate = `${year}-${monthPadded}-${endDay.toString().padStart(2, '0')}`;

    // ---------- FETCH STUDENT INFO ----------
    const { data: studentData, error: studentError } = await supabase
      .from('students')
      .select(`student_id, name,
               student_enrollment!inner(
                 enrollment_id,
                 roll_no,
                 classrooms!inner(classroom_id, class, section)
               )`)
      .eq('student_id', studentId)
      .single();

    if (studentError) {
      if (studentError.code === 'PGRST116') {
        return NextResponse.json({ success: false, message: 'Student not found', error: 'NOT_FOUND' }, { status: 404 });
      }
      throw studentError;
    }

    const enrollment = studentData.student_enrollment?.[0];
    if (!enrollment) {
      return NextResponse.json({ success: false, message: 'Enrollment not found for student', error: 'NOT_FOUND' }, { status: 404 });
    }

    // ---------- ATTENDANCE & HOLIDAY QUERIES IN PARALLEL ----------
    const attendancePromise = supabase
      .from('attendance')
      .select('attendance_id, date, status, remark')
      .eq('enrollment_id', enrollment.enrollment_id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date');

    // Holidays for the requested period
    const holidayPromise = supabase
      .from('holiday')
      .select('holiday_id, name, start_date, end_date')
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    // Execute both queries concurrently
    const [
      { data: attendanceRecords, error: attendanceError },
      { data: holidays, error: holidayError },
    ] = await Promise.all([attendancePromise, holidayPromise]);

    if (attendanceError) throw attendanceError;
    if (holidayError) throw holidayError;

    // Build a Set of holiday dates
    const holidayDatesSet = new Map();
    holidays?.forEach(h => {
      const start = new Date(h.start_date);
      const end = new Date(h.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        holidayDatesSet.set(d.toISOString().split('T')[0], h.name);
      }
    });

    // 6. Prepare daily records
    const daysInMonth = endDay;
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
    const lastDayToShow = isCurrentMonth ? today.getDate() : daysInMonth;

    // Map attendance by date for quick lookup
    const attMap = new Map();
    attendanceRecords?.forEach(rec => {
      attMap.set(rec.date, {
        status: rec.status.toLowerCase(),
        remark: rec.remark || '',
      });
    });

    const attendanceArray = [];
    let countPresent = 0;
    let countAbsent = 0;
    let countLeave = 0;
    let countHoliday = 0;

    for (let day = 1; day <= lastDayToShow; day++) {
      const dateStr = `${year}-${monthPadded}-${day.toString().padStart(2, '0')}`;
      const weekday = new Date(dateStr).getDay();
      const attRecord = attMap.get(dateStr);

      let status = 'unmarked';
      let remark = '';

      if (attRecord) {
        status = attRecord.status;
        remark = attRecord.remark;
      } else if (holidayDatesSet.has(dateStr)) {
        status = 'holiday';
        remark = holidayDatesSet.get(dateStr);
      } else if (weekday === 0) { // Sunday
        status = 'holiday';
        remark = 'Sunday';
      }

      // Increment counters
      switch (status) {
        case 'present':
          countPresent++;
          break;
        case 'absent':
          countAbsent++;
          break;
        case 'leave':
          countLeave++;
          break;
        case 'holiday':
          countHoliday++;
          break;
        default:
          break;
      }

      attendanceArray.push({ date: dateStr, status, remark });
    }

    const totalWorkingDays = attendanceArray.length - countHoliday;
    const attendancePercentage = totalWorkingDays > 0 ? parseFloat(((countPresent / totalWorkingDays) * 100).toFixed(2)) : 0;

    // 7. Compose response
    const responseData = {
      student: {
        id: studentData.student_id,
        name: studentData.name,
        rollNumber: enrollment.roll_no,
        class: enrollment.classrooms?.class || '',
        section: enrollment.classrooms?.section || '',
      },
      period: {
        year,
        month,
        monthName: MONTH_NAMES[month - 1],
      },
      attendance: attendanceArray,
      summary: {
        totalWorkingDays,
        present: countPresent,
        absent: countAbsent,
        leave: countLeave,
        holiday: countHoliday,
        attendancePercentage,
      },
    };

    return NextResponse.json({
      success: true,
      message: 'Attendance data retrieved successfully',
      data: responseData,
    });
  } catch (err) {
    console.error('Student attendance API error:', err);
    return NextResponse.json(
      { success: false, message: 'Internal server error', error: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * Admin Dashboard API Route Handler
 * --------------------------
 * This API endpoint serves as the primary data source for the admin dashboard,
 * aggregating school-wide metrics, attendance data, fee collections, and announcements
 * into a single, efficient response.
 * 
 * Authentication:
 * - Requires valid admin authentication
 * - Access restricted to authenticated administrators only
 * 
 * Response Format:
 * {
 *   success: boolean,
 *   data: {
 *     stats: {
 *       totalStudents: number,
 *       totalTeachers: number,
 *       feeCollection: {
 *         amount: number,
 *         percentage: number,
 *         currency: string
 *       },
 *       attendance: {
 *         today: {
 *           present: number,
 *           absent: number,
 *           percentage: number
 *         }
 *       }
 *     },
 *     classAttendance: {
 *       overview: Array<ClassAttendance>,
 *       averageAttendance: number
 *     },
 *     attendanceTrend: {
 *       daily: Array<DailyAttendance>,
 *       weeklyAverage: number
 *     },
 *     announcements: {
 *       recent: Array<Announcement>,
 *       stats: {
 *         total: number,
 *         active: number
 *       }
 *     },
 *     upcomingEvents: Array<Event>
 *   }
 * }
 * 
 * Error Handling:
 * - Returns 401 for unauthorized access
 * - Returns 500 for server-side errors with error logging
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

export async function GET(req) {
  // Authenticate the incoming request
  const auth = await authenticateAdmin(req);
  
  if (!auth.authenticated) {
    return unauthorized();
  }

  // Extract query parameters for customization
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0]; // Default to today
  const trendDays = parseInt(searchParams.get('trend_days') || '7'); // Default to 7 days
  const announcementsLimit = parseInt(searchParams.get('announcements_limit') || '5'); // Default to 5 announcements
  
  try {
    // Execute multiple queries in parallel for optimal performance
    const [
      studentsCountResponse,
      teachersCountResponse,
      attendanceTodayResponse,
      classAttendanceResponse,
      attendanceTrendResponse,
      announcementsResponse,
      upcomingEventsResponse
    ] = await Promise.all([
      // Count total students
      supabase
        .from('students')
        .select('student_id', { count: 'exact', head: true })
        .eq('status', 'Active'),

      // Count total teachers
      supabase
        .from('teachers')
        .select('teacher_id', { count: 'exact', head: true }),

      // Get today's attendance summary
      supabase
        .from('attendance')
        .select('status')
        .eq('date', date),

      // Get class-wise attendance overview
      supabase.rpc('get_class_attendance_summary'),

      // Get attendance trend for the past n days
      supabase.rpc('get_attendance_trend', { days: trendDays }),

      // Fetch latest announcements
      supabase
        .from('announcements')
        .select('announcement_id, title, description, date, priority, type, is_active')
        .order('date', { ascending: false })
        .limit(announcementsLimit),

      // Get all announcements count for stats
      supabase
        .from('announcements')
        .select('is_active', { count: 'exact', head: true })
    ]);

    // Process students count
    const totalStudents = studentsCountResponse.count || 0;
    
    // Process teachers count
    const totalTeachers = teachersCountResponse.count || 0;
    
    // Process today's attendance
    let presentCount = 0;
    let absentCount = 0;
    
    if (attendanceTodayResponse.data) {
      attendanceTodayResponse.data.forEach(record => {
        if (record.status === 'Present') {
          presentCount++;
        } else if (record.status === 'Absent') {
          absentCount++;
        }
      });
    }
    
    const totalAttendanceToday = presentCount + absentCount;
    const attendancePercentage = totalAttendanceToday > 0 
      ? Math.round((presentCount / totalAttendanceToday) * 100 * 10) / 10 
      : 0;
    
    // Process class attendance overview
    console.log('Class attendance:', classAttendanceResponse);
    const classAttendance = classAttendanceResponse.data || [];
    
    // Calculate average attendance across all classes
    let totalAttendancePercentage = 0;
    classAttendance.forEach(cls => {
      totalAttendancePercentage += cls.attendance_percentage || 0;
    });
    
    const averageAttendance = classAttendance.length > 0 
      ? Math.round((totalAttendancePercentage / classAttendance.length) * 10) / 10 
      : 0;
    
    // Process attendance trend
    const attendanceTrend = attendanceTrendResponse.data || [];
    
    // Calculate weekly average from trend data
    let weeklyTotal = 0;
    attendanceTrend.forEach(day => {
      weeklyTotal += day.attendance_percentage || 0;
    });
    
    const weeklyAverage = attendanceTrend.length > 0 
      ? Math.round((weeklyTotal / attendanceTrend.length) * 10) / 10 
      : 0;
    
    // Process announcements
    const announcements = announcementsResponse.data || [];
    
    // Calculate announcement stats
    const totalAnnouncements = announcementsResponse.count || 0;
    let activeAnnouncements = 0;
    
    announcements.forEach(announcement => {
      if (announcement.is_active) {
        activeAnnouncements++;
      }
    });
    
    // Format and calculate high/medium/low priority counts
    const priorityCounts = {
      high: 0,
      medium: 0,
      low: 0
    };
    
    announcements.forEach(announcement => {
      const priority = announcement.priority?.toLowerCase();
      if (priority && priorityCounts.hasOwnProperty(priority)) {
        priorityCounts[priority]++;
      }
    });

    // Construct the response data structure
    const responseData = {
      stats: {
        totalStudents,
        totalTeachers,
        feeCollection: {
          amount: 0, // Placeholder - would require fee data implementation
          percentage: 0,
          currency: 'INR'
        },
        attendance: {
          today: {
            present: presentCount,
            absent: absentCount,
            percentage: attendancePercentage
          }
        }
      },
      classAttendance: {
        overview: classAttendance.map(cls => ({
          name: `Class ${cls.class}`,
          attendance: cls.attendance_percentage || 0
        })),
        averageAttendance
      },
      attendanceTrend: {
        daily: attendanceTrend.map(day => ({
          day: new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }),
          date: day.date,
          attendance: day.attendance_percentage || 0
        })),
        weeklyAverage
      },
      announcements: {
        recent: announcements.map(announcement => ({
          id: announcement.announcement_id,
          title: announcement.title,
          description: announcement.description,
          date: announcement.date,
          priority: announcement.priority,
          type: announcement.type,
          isActive: announcement.is_active
        })),
        stats: {
          total: totalAnnouncements,
          active: activeAnnouncements,
          byPriority: priorityCounts
        }
      },
      upcomingEvents: [] // Placeholder for future implementation
    };

    // Return the consolidated dashboard response
    return NextResponse.json({
      success: true,
      data: responseData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    // Log error for debugging and monitoring
    console.error('Admin Dashboard API error:', error);
    
    // Return a generic error response to avoid exposing internal details
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to fetch admin dashboard data',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 
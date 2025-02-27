import { NextResponse } from 'next/server';
import connectDB from '@/utils/dbconnect';
import Notification from '@/models/notification';

export async function GET(request) {
  try {
    await connectDB();

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const student_id = searchParams.get('student_id');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    // Validate student_id
    if (!student_id) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }

    // Calculate skip for pagination
    const skip = (page - 1) * limit;

    // Modified query to handle array-based student_id
    const query = {
      $or: [
        { type: 'broadcast' },
        { 
          type: 'personal', 
          student_id: { $in: [student_id] }  // Check if student_id exists in the array
        }
      ]
    };

    // Fetch notifications with pagination
    const notifications = await Notification.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const total = await Notification.countDocuments(query);

    return NextResponse.json({
      notifications,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total / limit),
        total_notifications: total,
        per_page: limit
      }
    });

  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

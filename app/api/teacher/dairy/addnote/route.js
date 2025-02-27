import { NextResponse } from 'next/server';
import connectDB from '@/utils/dbconnect';
import Notification from '@/models/notification';

export async function POST(request) {
  try {
    await connectDB();
    
    const body = await request.json();
    const { title, message, type, student_id } = body;

    // Validate required fields
    if (!title || !message || !type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate type for personal notifications
    if (type === 'personal' && (!student_id || student_id.length === 0)) {
      return NextResponse.json(
        { error: 'Student ID is required for personal notifications' },
        { status: 400 }
      );
    }

    // Create new notification
    const notification = await Notification.create({
      type,
      title,
      message,
      student_id: type === 'personal' ? student_id : []
    });

    return NextResponse.json(
      { 
        message: 'Diary note added successfully',
        notification 
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Diary note creation error:', error);
    return NextResponse.json(
      { error: 'Failed to add diary note' },
      { status: 500 }
    );
  }
}

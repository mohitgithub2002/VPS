// app/api/notifications/event/route.js
import { NextResponse } from 'next/server';
import { createAndSend } from '@/lib/notifications/index.js';

export async function POST(req) {
  try {
    const { type, title, body, recipients, data } = await req.json();
    if (!recipients || recipients.length === 0) {
      return NextResponse.json({ success: false, message: 'Recipients required' }, { status: 400 });
    }

    // recipients array elements: { role: 'student'|'teacher'|'admin', id: number|string }
    await createAndSend({ type, title, body, recipients, data });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Notification event error', err);
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  }
} 
// app/api/devices/route.js
import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import admin from 'firebase-admin';

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON || '{}');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// POST to register a token
export async function POST(req) {
  try {
    const { token, platform, role, userId } = await req.json();
    if (!token || !platform || !role || !userId) {
      return NextResponse.json({ success: false, message: 'Missing fields' }, { status: 400 });
    }

    // Check if token already exists and get current role
    const { data: existingToken, error: fetchError } = await supabase
      .from('device_tokens')
      .select('recipient_type, recipient_id')
      .eq('token', token)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is fine for new tokens
      throw fetchError;
    }

    // Handle topic subscriptions
    try {
      const newTopicName = role + 's'; // 'students', 'teachers', 'admins'
      
      if (existingToken) {
        const oldRole = existingToken.recipient_type;
        const oldUserId = existingToken.recipient_id;
        
        // If role changed or user changed, unsubscribe from old topic
        if (oldRole !== role || oldUserId !== String(userId)) {
          const oldTopicName = oldRole + 's';
          console.log(`Unsubscribing from old topic: ${oldTopicName} for role change`);
          await admin.messaging().unsubscribeFromTopic([token], oldTopicName);
        }
      }
      
      // Subscribe to new topic
      console.log(`Subscribing ${role} (userId: ${userId}) to topic: ${newTopicName}`);
      await admin.messaging().subscribeToTopic([token], newTopicName);
      
    } catch (topicErr) {
      console.error('Topic subscription management failed', topicErr);
      // Don't fail the request if topic subscription fails
    }

    // Prepare data for upsert
    const row = {
      token,
      platform,
      is_valid: true,
      recipient_id: String(userId),
      recipient_type: role
    };

    // Upsert to prevent duplicates
    const { error } = await supabase.from('device_tokens').upsert(row, { onConflict: 'token' });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Device register error', err);
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  }
}

// DELETE ?token=xyz to unregister
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    if (!token) return NextResponse.json({ success: false, message: 'token query param required' }, { status: 400 });

    // Unsubscribe from all topics before deleting
    try {
      await admin.messaging().unsubscribeFromTopic([token], 'students');
      await admin.messaging().unsubscribeFromTopic([token], 'teachers');
      await admin.messaging().unsubscribeFromTopic([token], 'admins');
    } catch (topicErr) {
      console.error('Topic unsubscription failed', topicErr);
    }

    const { error } = await supabase.from('device_tokens').delete().eq('token', token);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Device delete error', err);
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  }
} 
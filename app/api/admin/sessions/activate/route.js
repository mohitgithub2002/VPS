/**
 * @path /api/admin/sessions/activate
 * @fileoverview Activate a specific session (deactivating all others)
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';

/**
 * POST /api/admin/sessions/activate
 * 
 * Body: { sessionId: number }
 * 
 * Sets the given session as active and deactivates all others.
 */
export async function POST(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, message: 'sessionId is required' },
        { status: 400 }
      );
    }

    // Verify the session exists
    const { data: session, error: fetchError } = await supabase
      .from('sessions')
      .select('session_id, session_name')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (fetchError || !session) {
      return NextResponse.json(
        { success: false, message: 'Session not found' },
        { status: 404 }
      );
    }

    // Step 1: Deactivate all sessions
    const { error: deactivateError } = await supabase
      .from('sessions')
      .update({ is_active: false })
      .eq('is_active', true);

    if (deactivateError) {
      console.error('Failed to deactivate sessions:', deactivateError);
      return NextResponse.json(
        { success: false, message: 'Failed to deactivate existing sessions' },
        { status: 500 }
      );
    }

    // Step 2: Activate the requested session
    const { data: activated, error: activateError } = await supabase
      .from('sessions')
      .update({ is_active: true })
      .eq('session_id', sessionId)
      .select()
      .single();

    if (activateError) {
      console.error('Failed to activate session:', activateError);
      return NextResponse.json(
        { success: false, message: 'Failed to activate session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Session "${activated.session_name}" is now active`,
      data: activated
    });
  } catch (error) {
    console.error('Session activate error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to activate session' },
      { status: 500 }
    );
  }
}

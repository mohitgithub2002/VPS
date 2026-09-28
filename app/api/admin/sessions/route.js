/**
 * @path /api/admin/sessions
 * @fileoverview API routes for managing academic sessions
 * Handles CRUD operations for sessions using Supabase
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { authenticateAdmin, unauthorized } from '@/lib/auth';
import { getAllSessions } from '@/utils/sessionHelper';

/**
 * GET /api/admin/sessions
 * List all sessions ordered by start_date descending.
 */
export async function GET(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const sessions = await getAllSessions();

    return NextResponse.json({
      success: true,
      data: { sessions },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sessions GET error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/sessions
 * Create a new session.
 * 
 * Body: { session_name, start_date, end_date, is_active? }
 * 
 * If is_active=true, all other sessions are deactivated first.
 */
export async function POST(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const body = await req.json();
    const { session_id, session_name, start_date, end_date, is_active } = body;

    if (!session_name || !start_date) {
      return NextResponse.json(
        { success: false, message: 'session_name and start_date are required' },
        { status: 400 }
      );
    }

    // If this session should be active, deactivate all others first
    if (is_active) {
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
    }

    const insertData = {
      session_name,
      start_date,
      end_date: end_date || null,
      is_active: is_active || false
    };

    if (session_id !== undefined && session_id !== null) {
      insertData.session_id = session_id;
    }

    const { data: session, error } = await supabase
      .from('sessions')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Session create error:', error);
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Session created successfully',
      data: session
    }, { status: 201 });
  } catch (error) {
    console.error('Sessions POST error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create session' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/sessions
 * Update an existing session.
 * 
 * Body: { session_id, session_name?, start_date?, end_date?, is_active? }
 */
export async function PUT(req) {
  const auth = await authenticateAdmin(req);
  if (!auth.authenticated) return unauthorized();

  try {
    const body = await req.json();
    const { session_id, session_name, start_date, end_date, is_active } = body;

    if (!session_id) {
      return NextResponse.json(
        { success: false, message: 'session_id is required' },
        { status: 400 }
      );
    }

    // Verify session exists
    const { data: existing, error: fetchError } = await supabase
      .from('sessions')
      .select('session_id')
      .eq('session_id', session_id)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, message: 'Session not found' },
        { status: 404 }
      );
    }

    // Build update payload
    const updateData = {};
    if (session_name !== undefined) updateData.session_name = session_name;
    if (start_date !== undefined) updateData.start_date = start_date;
    if (end_date !== undefined) updateData.end_date = end_date;

    // Handle is_active flag change
    if (is_active !== undefined) {
      if (is_active) {
        // Deactivate all other sessions first
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
      }
      updateData.is_active = is_active;
    }

    const { data: updated, error: updateError } = await supabase
      .from('sessions')
      .update(updateData)
      .eq('session_id', session_id)
      .select()
      .single();

    if (updateError) {
      console.error('Session update error:', updateError);
      return NextResponse.json(
        { success: false, message: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Session updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Sessions PUT error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update session' },
      { status: 500 }
    );
  }
}
